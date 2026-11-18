/**
 * OAuth 会话存储 + Cookie + 请求级上下文。
 *
 * ## 为什么单独一个文件
 *
 * `session.js` 存的是「情境题与地形」（当场演一遍用），这里存的是「**登录身份**」——
 * 两者生命周期不同：会话 id 给浏览器，OAuth token **1 小时就过期**（官方 `expires_in=3600`，
 * 且**没有 refresh token**）。
 *
 * ## 三条底线（全部来自官方 OAuth 文档）
 *
 * 1. **OAuth Token 只留服务端**：浏览器只拿一个随机 session id，走 `HttpOnly` + `SameSite=Lax` Cookie
 *    （`Lax` 是必须的——授权是从 zhihu.com 顶级导航跳回来的，`Strict` 会把 Cookie 挡掉）。
 * 2. **Token 过期就停止读取**：不静默切回 Access Secret 所属账号（官方明确要求）。
 * 3. **退出要清映射**：不留着旧 token。
 *
 * ## 请求级上下文
 *
 * 用 `AsyncLocalStorage` 把**当前请求的 OAuth token** 带给上游调用层，
 * 这样行为接口（收藏/关注/创作）读的是「**这个登录用户**」的数据，
 * 而不用给每个 service 函数传一遍参数。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const MAX_AUTH_SESSIONS = 200;

/** sid → { accessToken, expiresAt, profile, profileFetchedAt, createdAt } */
const authSessions = new Map();

/** 当前请求的登录上下文（没有就是 undefined → 走 Access Secret 自读模式）。 */
export const authContext = new AsyncLocalStorage();

/** 建一个登录会话，返回给浏览器的随机 sid。 */
export function createAuthSession({ accessToken, expiresIn = 3600, profile = null }) {
  const sid = randomUUID();
  authSessions.set(sid, {
    accessToken: String(accessToken),
    expiresAt: Date.now() + Math.max(60, Number(expiresIn) || 3600) * 1000,
    profile,
    profileFetchedAt: profile ? Date.now() : 0,
    createdAt: Date.now(),
  });

  if (authSessions.size > MAX_AUTH_SESSIONS) {
    const oldest = [...authSessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) authSessions.delete(oldest[0]);
  }
  return sid;
}

/**
 * 取登录会话。**过期的直接清掉并返回 null** —— 官方要求 Token 过期时停止读取，
 * 不静默切回 Access Secret 所属账号。
 */
export function getAuthSession(sid) {
  if (!sid) return null;
  const s = authSessions.get(String(sid));
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    authSessions.delete(String(sid));
    return null;
  }
  return s;
}

/** 退出登录：清映射。 */
export function destroyAuthSession(sid) {
  if (!sid) return false;
  return authSessions.delete(String(sid));
}

/** 回填用户资料（拿到新资料时更新缓存时间戳）。 */
export function updateAuthSessionProfile(sid, profile) {
  const s = authSessions.get(String(sid));
  if (!s) return null;
  s.profile = profile;
  s.profileFetchedAt = Date.now();
  return s;
}

/** 会话统计，给 /api/health 看。 */
export function authSessionStats() {
  const now = Date.now();
  const live = [...authSessions.values()].filter((s) => now <= s.expiresAt);
  return {
    auth_sessions: live.length,
    auth_sessions_total: authSessions.size,
  };
}

/** 从请求头里读一个 Cookie（不引第三方依赖，够用就行）。 */
export function readCookie(req, name) {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  for (const part of String(raw).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

/** 写下会话 Cookie：浏览器只拿随机 sid，token 永远不进浏览器。 */
export function setAuthCookie(res, sid, maxAgeSec = 3600) {
  const parts = [
    `${config.sessionCookieName}=${encodeURIComponent(sid)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(60, Number(maxAgeSec) || 3600)}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** 清掉会话 Cookie。 */
export function clearAuthCookie(res) {
  const parts = [
    `${config.sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Express 中间件：把当前请求的登录身份放进 `authContext`。
 * 没有会话时 store 是 null（= 开发期自读模式）。
 */
export function authContextMiddleware(req, res, next) {
  const sid = readCookie(req, config.sessionCookieName);
  const session = getAuthSession(sid);
  authContext.run(session ? { sid, ...session } : null, () => next());
}
