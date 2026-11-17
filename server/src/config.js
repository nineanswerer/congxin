/**
 * 运行期配置。**只从环境变量读，仓库里不写任何密钥。**
 */

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num('PORT', 8787),

  // 知乎开放平台 Access Secret。**必填**——没有它所有行为接口都跑不了。
  accessSecret: process.env.ZHIHU_ACCESS_SECRET || '',

  // OAuth。设置 oauthToken 后行为接口读登录用户的数据（形状相同）。
  oauthToken: process.env.ZHIHU_OAUTH_TOKEN || '',
  oauthAppId: process.env.ZHIHU_OAUTH_APP_ID || '',
  oauthAppKey: process.env.ZHIHU_OAUTH_APP_KEY || '',

  cacheTtlMs: num('CACHE_TTL_MS', 5 * 60 * 1000),
  upstreamTimeoutMs: num('UPSTREAM_TIMEOUT_MS', 10_000),
  retryBaseMs: num('RETRY_BASE_MS', 1200),

  upstreamBase: 'https://developer.zhihu.com',
};

/** 启动时自检：缺关键配置要**大声失败**，不要跑到一半才炸。 */
export function assertConfig() {
  const missing = [];
  if (!config.accessSecret) missing.push('ZHIHU_ACCESS_SECRET');
  if (config.oauthToken && !config.oauthAppId) missing.push('ZHIHU_OAUTH_APP_ID');
  if (config.oauthToken && !config.oauthAppKey) missing.push('ZHIHU_OAUTH_APP_KEY');
  if (missing.length > 0) {
    throw new Error(
      `缺少必需的环境变量：${missing.join(', ')}\n` +
        `复制 server/.env.example 为 server/.env 并填入后重试。`
    );
  }
}
