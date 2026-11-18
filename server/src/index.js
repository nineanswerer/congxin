/**
 * 「从心」后端入口。
 *
 * 技术底座（D22）：前端 + Node 单进程，**零数据库、零中间件**，
 * 会话放进程内 Map。部署走知乎 AI Works 源码发布。
 *
 * 当前实现的接口（对应 contracts/api.json v0.5 的 **14 个路径**，**全部已实现**）：
 *   GET  /api/quota
 *   GET  /api/behavior/favorites
 *   GET  /api/behavior/followees
 *   GET  /api/behavior/contents
 *   POST /api/behavior/tension
 *   POST /api/situation/question
 *   GET  /api/terrain
 *   POST /api/terrain/answer
 *   GET  /api/tone
 *   GET  /api/auth/profile
 *   GET  /api/auth/login
 *   GET  /api/auth/callback
 *   POST /api/auth/logout
 *   POST /api/cards
 */

import express from 'express';
import { config, assertConfig } from './config.js';
import { toApiError } from './lib/errors.js';
import { cacheStats } from './lib/cache.js';
import { quotaRouter } from './routes/quota.js';
import { behaviorRouter } from './routes/behavior.js';
import { cognitionRouter } from './routes/cognition.js';
import { toneRouter } from './routes/tone.js';
import { authRouter } from './routes/auth.js';
import { cardsRouter } from './routes/cards.js';
import { loadTaxonomy } from './taxonomy.js';
import { loadTone } from './tone.js';
import { sessionStats } from './session.js';
import { authContextMiddleware, authSessionStats } from './lib/auth-session.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// 开发期跨域（前端 Vite 跑在别的端口）。生产由同域部署，不需要。
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'congxin-server',
    cache: cacheStats(),
    sessions: sessionStats(),
    auth: authSessionStats(),
    oauth_configured: Boolean(config.oauthAppId && config.oauthAppKey && config.oauthRedirectUri),
    taxonomy_version: (() => {
      try {
        return loadTaxonomy().version;
      } catch {
        return null;
      }
    })(),
    tone_version: (() => {
      try {
        return loadTone().version;
      } catch {
        return null;
      }
    })(),
    tone_default: (() => {
      try {
        return loadTone().default;
      } catch {
        return null;
      }
    })(),
    upstream_mode: config.oauthToken ? 'oauth' : 'access_secret',
    time: new Date().toISOString(),
  });
});

// 登录上下文：把**当前请求的 OAuth token**带给上游调用层（没有会话时走 Access Secret 自读）
app.use(authContextMiddleware);

app.use(quotaRouter);
app.use(behaviorRouter);
app.use(cognitionRouter);
app.use(toneRouter);
app.use(authRouter);
app.use(cardsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `没有这个接口：${req.method} ${req.path}`,
      user_hint: '这个地址好像写错了',
      retryable: false,
      retry_after_ms: null,
      upstream: null,
      detail: null,
    },
  });
});

// 统一错误出口：**只暴露契约里的字段，不透栈**
app.use((err, req, res, next) => {
  const apiError = toApiError(err);
  if (apiError.code === 'INTERNAL_ERROR') {
    console.error('[server] 未处理异常：', err);
  }
  res.status(apiError.httpStatus).json(apiError.toBody());
});

try {
  assertConfig();
} catch (err) {
  console.error(`[server] 启动自检失败：${err.message}`);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`[server] 「从心」后端已启动：http://localhost:${config.port}`);
  console.log(`[server] 上游鉴权模式：${config.oauthToken ? 'OAuth（登录用户）' : 'Access Secret（开发期自读）'}`);
  console.log(`[server] 知乎登录入口：${config.oauthAppId && config.oauthAppKey && config.oauthRedirectUri ? '已就绪' : '未就绪（App ID / App Key 由赛事页面在项目创建后分配）'}`);
  console.log(`[server] 缓存 TTL：${config.cacheTtlMs}ms`);
});

export default app;
