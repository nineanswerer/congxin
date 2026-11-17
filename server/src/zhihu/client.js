/**
 * 知乎开放平台 HTTP 调用层（D15：后端直连 HTTP，不用官方 MCP）。
 *
 * 实测要点（2026-11-17）：
 *   - 鉴权头：`Authorization: Bearer <Access Secret>` + `X-Request-Timestamp`（Unix 秒）
 *   - 统一信封 `{ Code, Message, Data }`
 *   - `Code=0` 成功 / `10001` 参数缺失 / `30001` **秒级限流**（要退避重试）
 *   - `ContentType` 对 contents 接口是**必填**，不传直接 10001
 *   - `FavlistUrlToken` 对 favlist_contents 接口是**必填**
 *
 * 这一层负责把上面这些脏细节**抹平**，不让它们透到前端。
 */

import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';

const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildHeaders() {
  const headers = {
    Authorization: `Bearer ${config.accessSecret}`,
    'X-Request-Timestamp': `${Math.floor(Date.now() / 1000)}`,
    'Content-Type': 'application/json',
  };
  // OAuth 阶段：额外带上 OAuth Token，读的是登录用户的数据
  if (config.oauthToken) headers['X-OAuth-Token'] = config.oauthToken;
  return headers;
}

/**
 * 调一次上游，返回 Data。
 * @param {string} path 以 / 开头的路径
 * @param {object} query
 */
export async function callUpstream(path, query = {}) {
  const url = new URL(path, config.upstreamBase);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(config.upstreamTimeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        throw new ApiError('ZHIHU_AUTH_INVALID', `知乎接口返回 ${res.status}`, {
          upstream: { code: res.status, message: res.statusText },
        });
      }
      if (!res.ok) {
        throw new ApiError('ZHIHU_UPSTREAM_ERROR', `知乎接口返回 HTTP ${res.status}`, {
          upstream: { code: res.status, message: res.statusText },
          retryable: res.status >= 500,
        });
      }

      const body = await res.json();

      if (body.Code === 0) return body.Data;

      // 秒级限流：退避后重试
      if (body.Code === 30001) {
        lastError = new ApiError('ZHIHU_RATE_LIMITED', `知乎接口触发秒级限流：${body.Message}`, {
          upstream: { code: body.Code, message: body.Message },
          retryAfterMs: config.retryBaseMs * attempt,
        });
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(config.retryBaseMs * attempt + Math.floor(Math.random() * 300));
        continue;
      }

      // 参数缺失：重试没有意义
      if (body.Code === 10001) {
        throw new ApiError('ZHIHU_UPSTREAM_ERROR', `知乎接口报参数缺失：${body.Message}`, {
          upstream: { code: body.Code, message: body.Message },
          retryable: false,
        });
      }

      throw new ApiError('ZHIHU_UPSTREAM_ERROR', `知乎接口返回异常：${body.Message}`, {
        upstream: { code: body.Code, message: body.Message },
        retryable: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // 参数缺失 / 鉴权失败：直接抛，不重试
        if (err.code === 'ZHIHU_UPSTREAM_ERROR' && err.retryable === false) throw err;
        if (err.code === 'ZHIHU_AUTH_INVALID') throw err;
        lastError = err;
      } else if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        lastError = new ApiError('ZHIHU_TIMEOUT', `知乎接口超时（${config.upstreamTimeoutMs}ms）`, {
          retryAfterMs: 3000,
        });
      } else {
        lastError = new ApiError('ZHIHU_UPSTREAM_ERROR', `调用知乎接口失败：${err?.message || err}`, {
          retryable: true,
        });
      }
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(config.retryBaseMs * attempt);
    }
  }

  throw lastError || new ApiError('ZHIHU_UPSTREAM_ERROR', '调用知乎接口失败');
}
