/**
 * 运行期配置。**只从环境变量读，仓库里不写任何密钥。**
 *
 * ⚠️ **11-19 补**：官方部署口径是「**秘钥写入文件直接构建**」
 *    （见 docs/rules-知乎S3.md 11.7 原文）——平台不保证把密钥塞成环境变量。
 *    所以这里除了环境变量，**还支持从文件读**；顺序见 `resolveAccessSecret()`。
 *    两种都读不到就**大声警告**，但**服务照常起**（见 assertConfig 的说明）。
 */

import fs from 'node:fs';
import path from 'node:path';

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/** 从文件读密钥。读不到（不存在 / 空 / 无权限）就返回空串，不抛异常。 */
function readSecretFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * 约定路径（相对进程工作目录）——平台把密钥写成文件时的可能落点。
 * **这些路径都在 .gitignore 里**（`secrets/`、`.secrets/`、`access_secret`）。
 */
const SECRET_FILE_FALLBACKS = [
  'secrets/access_secret',
  '.secrets/access_secret',
  'server/secrets/access_secret',
  '/etc/secrets/access_secret',
];

/**
 * Access Secret 的读取顺序（**先到先得**）：
 *   1. 环境变量 `ZHIHU_ACCESS_SECRET`
 *   2. 环境变量 `ZHIHU_ACCESS_SECRET_FILE` 指向的文件
 *   3. 上面那几个约定路径
 *
 * **读到的值永远不打印、不写日志、不进任何响应体。**
 */
export function resolveAccessSecret() {
  const fromEnv = (process.env.ZHIHU_ACCESS_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  const explicit = (process.env.ZHIHU_ACCESS_SECRET_FILE || '').trim();
  if (explicit) {
    const value = readSecretFile(explicit);
    if (value) return value;
  }

  for (const rel of SECRET_FILE_FALLBACKS) {
    const value = readSecretFile(path.resolve(process.cwd(), rel));
    if (value) return value;
  }

  return '';
}

export const config = {
  port: num('PORT', 8787),

  // 知乎开放平台 Access Secret。**必填**——没有它所有行为接口都跑不了。
  accessSecret: resolveAccessSecret(),

  // OAuth。设置 oauthToken 后行为接口读登录用户的数据（形状相同）。
  oauthToken: process.env.ZHIHU_OAUTH_TOKEN || '',
  oauthAppId: process.env.ZHIHU_OAUTH_APP_ID || '',
  oauthAppKey: process.env.ZHIHU_OAUTH_APP_KEY || '',

  // OAuth 授权回调地址。必须与赛事页面登记值**逐字符一致**（协议/域名/端口/路径/尾部斜杠/Query 都算）。
  oauthRedirectUri: process.env.ZHIHU_OAUTH_REDIRECT_URI || '',

  // 授权完成后回前端的地址（302 的落点）。留空则回站点根。
  frontOrigin: process.env.FRONT_ORIGIN || '',

  // 会话 Cookie 名（浏览器里只放随机 session id，不放 token）。
  sessionCookieName: 'congxin_sid',

  // Cookie 是否加 Secure。生产默认开；本地 http 调试可显式关掉。
  cookieSecure: (process.env.SESSION_COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',

  cacheTtlMs: num('CACHE_TTL_MS', 5 * 60 * 1000),
  upstreamTimeoutMs: num('UPSTREAM_TIMEOUT_MS', 10_000),
  retryBaseMs: num('RETRY_BASE_MS', 1200),

  upstreamBase: 'https://developer.zhihu.com',
};

/**
 * 启动时自检：缺关键配置要**大声说出来**。
 *
 * ⚠️ **11-19 改：不再 `process.exit(1)`**。
 *    原来缺 Access Secret 就直接退出——本地开发时这是「快速失败」，很好；
 *    但**部署到 AI Works 之后，平台多半是按环境变量/文件注入密钥的，
 *    一旦没注入对，容器会崩成 CrashLoop，评委打开链接看到的是一片空白**。
 *
 *    现在改成：**警告 + 照常起**。缺凭据的接口会照常发请求，
 *    上游回 401 → 后端转成契约里的错误信封 → **前端显示真实的中文提示**
 *    （官方提交前检查第 7 条：接口失败要有真实提示，不许给假数据）。
 *    也就是说：**降级是可见的，不是假的。**
 *
 * @returns {string[]} 问题清单（空数组 = 配置齐全）
 */
export function assertConfig() {
  const problems = [];
  if (!config.accessSecret) {
    problems.push(
      '没读到知乎 Access Secret（ZHIHU_ACCESS_SECRET / ZHIHU_ACCESS_SECRET_FILE / secrets/access_secret 都试过了）'
    );
  }
  if (config.oauthToken && !config.oauthAppId) problems.push('ZHIHU_OAUTH_APP_ID');
  if (config.oauthToken && !config.oauthAppKey) problems.push('ZHIHU_OAUTH_APP_KEY');
  if (config.oauthAppId && !config.oauthRedirectUri) problems.push('ZHIHU_OAUTH_REDIRECT_URI');
  return problems;
}
