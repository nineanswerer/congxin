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
import { authContext } from '../lib/auth-session.js';
import { ApiError } from '../lib/errors.js';

const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildHeaders() {
  const headers = {
    Authorization: `Bearer ${config.accessSecret}`,
    'X-Request-Timestamp': `${Math.floor(Date.now() / 1000)}`,
    'Content-Type': 'application/json',
  };
  // OAuth 身份：**优先用当前登录会话里的 token**（每个登录用户读自己的数据）；
  // 没有会话时才退回开发期的全局 token（config.oauthToken）。
  // ⚠️ 官方要求：Token 过期或鉴权失败时**停止读取**，不静默切回 Access Secret 所属账号。
  const oauthToken = currentOAuthToken();
  if (oauthToken) headers['X-OAuth-Token'] = oauthToken;
  return headers;
}

/** 当前请求该用的 OAuth token（会话优先，其次全局）。 */
function currentOAuthToken() {
  return authContext.getStore()?.accessToken || config.oauthToken || '';
}

/** 有没有任何可用的知乎凭据。 */
function hasCredential() {
  return Boolean(config.accessSecret || currentOAuthToken());
}

/**
 * 调一次上游，返回 Data。
 * @param {string} path 以 / 开头的路径
 * @param {object} query
 */
export async function callUpstream(path, query = {}) {
  return callUpstreamJson(path, { method: 'GET', query });
}

/**
 * POST 版本（直答 `/v1/chat/completions` 用）。
 * ⚠️ 直答的响应**不是** `{Code, Message, Data}` 信封，而是 OpenAI 兼容的
 *    `{ choices: [{ message: { content } }] }`——所以这里**不拆信封**，原样返回 JSON。
 * @param {string} path
 * @param {object} body
 * @param {{timeoutMs?:number, maxAttempts?:number, retryOnTimeout?:boolean}} options
 */
export async function callUpstreamPost(path, body = {}, options = {}) {
  return callUpstreamJson(path, { method: 'POST', body, raw: true, ...options });
}

/**
 * @param {string} path
 * @param {object} opts
 * @param {number} opts.timeoutMs        单次请求超时（默认 10s；直答走 60s）
 * @param {number} opts.maxAttempts      最多试几次（默认 4）
 * @param {boolean} opts.retryOnTimeout  超时后要不要再试（**直答必须 false**，见下）
 */
async function callUpstreamJson(path, {
  method = 'GET',
  query = {},
  body = null,
  raw = false,
  timeoutMs = config.upstreamTimeoutMs,
  maxAttempts = MAX_ATTEMPTS,
  retryOnTimeout = true,
} = {}) {
  // ⚠️ **没有凭据就别白跑上游**（11-19 部署预检时加的）。
  //    部署到 AI Works 后如果密钥没注入对，接口本来会回 401，
  //    但那会显示成「知乎那边暂时不稳定」——**不准确**（真实原因是没凭据）。
  //    这里提前挡住，直接给准确的中文提示（官方检查第 7 条：提示必须是真话）。
  if (!hasCredential()) {
    throw new ApiError('ZHIHU_AUTH_INVALID', '没有可用的知乎凭据', {
      retryable: false,
      userHint: '知乎凭据没配好或已失效，这次读不到知乎上的数据。',
    });
  }

  const url = new URL(path, config.upstreamBase);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
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

      const payload = await res.json();

      // 直答是 OpenAI 兼容响应，没有 {Code,Message,Data} 信封，原样返回
      if (raw) return payload;

      if (payload.Code === 0) return payload.Data;

      // 鉴权失败（实测 Code=20001 / "Authorization failed"）：
      // **不是**「知乎不稳定」，重试也没用 —— 直接给出准确提示，别让用户干等。
      if (payload.Code === 20001 || /authorization failed/i.test(payload.Message ?? '')) {
        throw new ApiError('ZHIHU_AUTH_INVALID', `知乎接口鉴权失败：${payload.Message}`, {
          upstream: { code: payload.Code, message: payload.Message },
          retryable: false,
          userHint: '知乎凭据没配好或已失效，这次读不到知乎上的数据。',
        });
      }

      // 秒级限流：退避后重试
      if (payload.Code === 30001) {
        lastError = new ApiError('ZHIHU_RATE_LIMITED', `知乎接口触发秒级限流：${payload.Message}`, {
          upstream: { code: payload.Code, message: payload.Message },
          retryAfterMs: config.retryBaseMs * attempt,
        });
        if (attempt === maxAttempts) break;
        await sleep(config.retryBaseMs * attempt + Math.floor(Math.random() * 300));
        continue;
      }

      // 额度耗尽（实测 **Code=30002 / "quota exceeded"**）：
      // **不是**「知乎不稳定」——重试到明天也没用，必须给准确提示。
      // ⚠️ 契约里早就定义了 `ZHIHU_QUOTA_EXHAUSTED`（contracts/api.json 的 x-error-codes），
      //    但**代码里从来没抛出过** → 额度耗尽时前端显示的是「知乎那边暂时不稳定，稍后重试」，
      //    那句话是**假的**（重试没用）。11-19 补上，让实现回到契约。
      if (payload.Code === 30002 || /quota exceeded/i.test(payload.Message ?? '')) {
        throw new ApiError('ZHIHU_QUOTA_EXHAUSTED', `知乎接口报额度用尽：${payload.Message}`, {
          upstream: { code: payload.Code, message: payload.Message },
          retryable: false,
        });
      }

      // 参数缺失：重试没有意义
      if (payload.Code === 10001) {
        throw new ApiError('ZHIHU_UPSTREAM_ERROR', `知乎接口报参数缺失：${payload.Message}`, {
          upstream: { code: payload.Code, message: payload.Message },
          retryable: false,
        });
      }

      throw new ApiError('ZHIHU_UPSTREAM_ERROR', `知乎接口返回异常：${payload.Message}`, {
        upstream: { code: payload.Code, message: payload.Message },
        retryable: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // 参数缺失 / 鉴权失败：直接抛，不重试
        if (err.code === 'ZHIHU_UPSTREAM_ERROR' && err.retryable === false) throw err;
        if (err.code === 'ZHIHU_AUTH_INVALID') throw err;
        lastError = err;
      } else if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        lastError = new ApiError('ZHIHU_TIMEOUT', `知乎接口超时（${timeoutMs}ms）`, {
          retryAfterMs: 3000,
        });
        // ⚠️ **超时不重试**（直答路径必须这样）：
        //   超时说明请求**很可能已经到达上游并被计费**了 —— 再试一次就是**白烧额度**。
        //   直答 100 次/天，是全项目最紧的一组，**宁可不重试也不浪费**。
        //   （搜索那种 5000/天 的，走默认的「超时可重试」，代价可以忽略。）
        if (!retryOnTimeout) break;
      } else {
        lastError = new ApiError('ZHIHU_UPSTREAM_ERROR', `调用知乎接口失败：${err?.message || err}`, {
          retryable: true,
        });
      }
      if (attempt === maxAttempts) break;
      await sleep(config.retryBaseMs * attempt);
    }
  }

  throw lastError || new ApiError('ZHIHU_UPSTREAM_ERROR', '调用知乎接口失败');
}
