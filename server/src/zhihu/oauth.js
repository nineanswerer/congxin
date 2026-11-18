/**
 * 登录与会话（知乎 OAuth）。
 *
 * 契约：GET /api/auth/profile、GET /api/auth/login、GET /api/auth/callback、POST /api/auth/logout
 * （见 contracts/api.json v0.4 的 auth 段）
 *
 * ## 两种模式
 *
 * `GET /api/auth/profile` **永远返回 200**，但有两种模式（看 `data.mode`）：
 *
 * - `oauth` —— 用户授权过知乎 → 返回真实昵称 / 头像 / 一句话介绍。
 * - `developer_account` —— 开发期没有 OAuth 会话。上游**没有「读自己昵称」的接口**，
 *   所以昵称等字段为 null，前端显示通用称呼。
 *   **不许在这个模式下编一个昵称**——官方提交前检查第 6、7 条查的就是假数据与假身份。
 *
 * ## 官方协议坑（全部来自官方 Skill 包 references/oauth.md，2026-11-18 核对）
 *
 * 1. 回调参数叫 `authorization_code`（**不是** `code`），但换 token 的表单字段又叫 `code`
 *    → 接收端**两个都收**。
 * 2. **回调不返 `state`** → 做不到标准登录 CSRF 校验。官方标为「待确认」，
 *    上线前必须向平台确认，别自己假装做了。
 * 3. **只有 `access_token` + `expires_in=3600`，没有 refresh token** → 1 小时必过期。
 *    过期后**停止读取**，**不静默切回 Access Secret 所属账号**（官方明确要求）。
 * 4. `/access_token` 与 `/user` 响应里的 **`code: 20000` 表示成功**，别当错误。
 *
 * ## 凭证从哪来
 *
 * App ID / App Key **由赛事页面在项目创建后分配**，黑客松**不走通用邮件申请流程**
 * （官方原话：「尚无凭证时，不要编造提前领取入口」）。
 * → 凭证没到位时 login / callback **诚实返回 401**，**不伪造跳转**。
 */

import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';

const AUTHORIZE_URL = 'https://openapi.zhihu.com/authorize';
const TOKEN_URL = 'https://openapi.zhihu.com/access_token';
const USER_URL = 'https://openapi.zhihu.com/user';

/** 凭证是否齐了。齐了才能发起授权。 */
export function oauthConfigured() {
  return Boolean(
    config.oauthAppId && config.oauthAppKey && config.oauthRedirectUri,
  );
}

/** 授权页 URL。`redirect_uri` 必须与赛事页面登记值逐字符一致。 */
export function buildAuthorizeUrl() {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('redirect_uri', config.oauthRedirectUri);
  url.searchParams.set('app_id', config.oauthAppId);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

/**
 * 用授权码换 access_token。
 * ⚠️ 表单字段名是 `code`（尽管回调参数叫 `authorization_code`）。
 * @param {string} code
 * @returns {Promise<{accessToken: string, expiresIn: number}>}
 */
export async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    app_id: config.oauthAppId,
    app_key: config.oauthAppKey,
    grant_type: 'authorization_code',
    redirect_uri: config.oauthRedirectUri,
    code: String(code),
  });

  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch (err) {
    throw new ApiError('ZHIHU_TIMEOUT', `换取 OAuth token 超时：${err?.message || err}`, {
      retryAfterMs: 3000,
    });
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 下面统一按失败处理 */ }

  // 官方实测：`code: 20000` 表示成功，所以**看有没有 access_token**，不要只看 code。
  const accessToken = json?.access_token;
  if (!accessToken) {
    throw new ApiError('ZHIHU_AUTH_INVALID', '知乎没有返回 access_token', {
      upstream: { code: json?.code ?? res.status, message: json?.message || json?.error || text?.slice(0, 120) },
      userHint: '授权没成功，再点一次登录试试',
    });
  }

  return {
    accessToken: String(accessToken),
    expiresIn: Number(json?.expires_in) || 3600,
  };
}

/**
 * 取授权用户基础信息。
 * ⚠️ **上游 `uid` 是 int64，会超过 JavaScript 安全整数范围**——
 *    官方明确要求「在 JSON 解析阶段无损处理，再以字符串保存和传递」。
 *    所以这里先用正则从原始文本里把 `uid` 的数字抠出来（完整、不丢精度），
 *    其余字段才走 JSON.parse（`json.uid` 那份是丢过精度的，**不用它**）。
 *
 * @param {string} accessToken
 */
export async function fetchUserProfile(accessToken) {
  let res;
  try {
    res = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
  } catch (err) {
    throw new ApiError('ZHIHU_TIMEOUT', `读取用户资料超时：${err?.message || err}`, {
      retryAfterMs: 3000,
    });
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 下面统一按失败处理 */ }

  const uidMatch = text.match(/"uid"\s*:\s*(\d+)/);
  const uid = uidMatch ? uidMatch[1] : null;

  // 鉴权失败 / 用户不存在：HTTP 200 也可能带 code:404。**没有有效用户标识就不建会话。**
  if (!uid && !json?.hash_id) {
    throw new ApiError('ZHIHU_AUTH_INVALID', '知乎没有返回有效的用户标识', {
      upstream: { code: json?.code ?? res.status, message: json?.message || json?.data || text?.slice(0, 120) },
      userHint: '登录状态失效了，重新授权一下',
    });
  }

  return {
    uid,
    hash_id: json?.hash_id ?? null,
    fullname: json?.fullname ?? null,
    gender: json?.gender ?? null,
    headline: json?.headline ?? null,
    description: json?.description ?? null,
    avatar_url: json?.avatar_path ?? null,
    url: json?.url ?? null,
  };
}
