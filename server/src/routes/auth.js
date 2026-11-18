/**
 * 登录与会话路由（知乎 OAuth）。
 *
 * 契约：GET /api/auth/profile、GET /api/auth/login、GET /api/auth/callback、POST /api/auth/logout
 * （见 contracts/api.json v0.4）
 *
 * ## 两种模式
 *
 * `GET /api/auth/profile` **永远返回 200**，但有两种模式（看 `data.mode`）：
 *
 * - `oauth` —— 用户授权过知乎 → 返回真实昵称 / 头像 / 一句话介绍。
 * - `developer_account` —— 开发期没有 OAuth 会话 → 昵称等字段为 null。
 *   **不许在这个模式下编昵称**（官方提交前检查第 6、7 条查的就是假数据与假身份）。
 *
 * ## 凭证没到位时怎么办
 *
 * App ID / App Key **由赛事页面在项目创建后分配**（不走通用邮件申请流程）。
 * 拿不到时 login / callback **诚实返回 401 OAUTH_REQUIRED**，
 * **绝不伪造一个跳转**——那属于「假成功」，官方明令禁止。
 */

import { Router } from 'express';
import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';
import {
  authContext,
  createAuthSession,
  destroyAuthSession,
  readCookie,
  setAuthCookie,
  clearAuthCookie,
  updateAuthSessionProfile,
} from '../lib/auth-session.js';
import {
  oauthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserProfile,
} from '../zhihu/oauth.js';

export const authRouter = Router();

/** 用户资料缓存 5 分钟：省上游调用，也让昵称在一次演示里保持稳定。 */
const PROFILE_TTL_MS = 5 * 60 * 1000;

function meta(source, extra = {}) {
  return {
    source,
    fetched_at: Math.floor(Date.now() / 1000),
    cached: false,
    cache_age_s: 0,
    pet_state: 'idle',
    quota: null,
    warnings: [],
    ...extra,
  };
}

function oauthNotReady() {
  return new ApiError('OAUTH_REQUIRED', 'OAuth 凭证还没发放，登录入口暂不可用', {
    userHint: '登录功能还没开启，先用现在的版本体验',
    detail:
      '需要 ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY / ZHIHU_OAUTH_REDIRECT_URI；' +
      'App ID 与 App Key 由赛事页面在项目创建后分配',
  });
}

/**
 * GET /api/auth/profile —— 当前登录用户资料。
 * **永远 200**（取不到资料也是 200 + empty + empty_notice）。
 */
authRouter.get('/api/auth/profile', async (req, res, next) => {
  try {
    const ctx = authContext.getStore();

    // 没有 OAuth 会话 → 开发期自读模式。**上游没有「读自己昵称」的接口，所以字段为 null。**
    if (!ctx || !ctx.accessToken) {
      res.json({
        data: {
          mode: 'developer_account',
          uid: null,
          hash_id: null,
          fullname: null,
          gender: null,
          headline: null,
          description: null,
          avatar_url: null,
          url: null,
          empty: true,
          empty_notice: '还没接知乎登录，先用通用称呼叫你。',
        },
        meta: meta('none'),
      });
      return;
    }

    const age = Date.now() - (ctx.profileFetchedAt || 0);
    let profile = ctx.profile;
    let cached = false;

    if (!profile || age > PROFILE_TTL_MS) {
      profile = await fetchUserProfile(ctx.accessToken);
      updateAuthSessionProfile(ctx.sid, profile);
      cached = false;
    } else {
      cached = true;
    }

    res.json({
      data: {
        mode: 'oauth',
        uid: profile.uid ?? null,
        hash_id: profile.hash_id ?? null,
        fullname: profile.fullname ?? null,
        gender: profile.gender ?? null,
        headline: profile.headline ?? null,
        description: profile.description ?? null,
        avatar_url: profile.avatar_url ?? null,
        url: profile.url ?? null,
        empty: false,
        empty_notice: null,
      },
      meta: meta('zhihu:openapi_user', {
        cached,
        cache_age_s: cached ? Math.floor(age / 1000) : 0,
      }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/login —— 发起授权（302 跳转到知乎授权页）。
 * 凭证没到位就诚实 401，**不伪造跳转**。
 */
authRouter.get('/api/auth/login', (req, res, next) => {
  try {
    if (!oauthConfigured()) throw oauthNotReady();
    res.redirect(302, buildAuthorizeUrl());
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/callback —— 授权回调：换 token → 取用户身份 → 建会话 → 302 回前端。
 */
authRouter.get('/api/auth/callback', async (req, res, next) => {
  try {
    if (!oauthConfigured()) throw oauthNotReady();

    // 官方实测：回调参数是 `authorization_code`（不是旧文档里的 `code`）；
    // 但换 token 的表单字段又叫 `code`。接收端两个都收，以 authorization_code 优先。
    const code = req.query?.authorization_code || req.query?.code;
    if (!code) {
      throw new ApiError('VALIDATION_ERROR', '回调里没有授权码', {
        userHint: '授权没有完成，重新点一次登录试试',
      });
    }

    const { accessToken, expiresIn } = await exchangeCodeForToken(code);

    // 官方要求：建立会话前要确认响应里有**有效用户标识**，不能拿空对象建会话。
    const profile = await fetchUserProfile(accessToken);

    const sid = createAuthSession({ accessToken, expiresIn, profile });
    setAuthCookie(res, sid, expiresIn);

    // 回前端。Token 只在服务端，浏览器拿到的只有这一个 HttpOnly Cookie。
    res.redirect(302, config.frontOrigin || '/');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout —— 退出登录、清会话。
 * **幂等**：没有会话也返回 200。
 */
authRouter.post('/api/auth/logout', (req, res) => {
  const sid = readCookie(req, config.sessionCookieName);
  destroyAuthSession(sid);
  clearAuthCookie(res);
  res.json({
    data: {
      logged_in: false,
      mode: 'developer_account',
      notice: '已退出登录。',
    },
    meta: meta('none'),
  });
});
