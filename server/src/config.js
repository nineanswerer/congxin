/**
 * 运行期配置。**仓库里不写任何密钥。**
 *
 * 密钥来源（先到先得）：
 *   1. 环境变量 `ZHIHU_ACCESS_SECRET`
 *   2. 环境变量 `ZHIHU_ACCESS_SECRET_FILE` 指向的文件
 *   3. 下面那几个约定路径（相对进程工作目录）
 *
 * ⚠️ **11-19 补**：官方部署口径是「**秘钥写入文件直接构建**」
 *    （见 docs/rules-知乎S3.md 11.7 原文）——平台不保证把密钥塞成环境变量。
 *    所以这里除了环境变量，**还支持从文件读**；顺序见 `resolveAccessSecret()`。
 *    两种都读不到就**大声警告**，但**服务照常起**（见 assertConfig 的说明）。
 *
 * ⚠️ **11-21 补**：官方 AI Works 交付规范只允许运行期读 `PORT` / `HOST`
 *    这两个受管变量，其余自定义环境变量会让官方探测器直接阻断打包。
 *    所以交付包里的 `config.js` 由 `scripts/make-delivery.js` 生成，
 *    **只保留文件来源的密钥**，不读任何自定义环境变量。
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 端口与监听地址。
 *
 * ⚠️ **只读字面量名**（`process.env.PORT` / `process.env.HOST`）——
 *    官方 AI Works 交付规范只允许运行期读这两个受管变量；
 *    写成「动态下标」取法（方括号里放变量名）会被官方探测器判成
 *    `E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED`，**直接阻断打包**。
 *
 * 端口 fallback 用 **9000**（官方 CloudBase HTTP 函数的固定端口）。
 */
const PORT = Number(process.env.PORT);
const HOST = process.env.HOST || '0.0.0.0';

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
  // 平台注入 PORT（CloudBase HTTP 函数固定 9000）；本地默认也是 9000。
  port: Number.isFinite(PORT) && PORT > 0 ? PORT : 9000,

  // 监听全地址：容器里只听 127.0.0.1 的话，外面的公网链接打不开。
  host: HOST,

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

  // 这三个是内部调参常量，**不开放成环境变量**
  // （官方交付规范不允许运行期读自定义环境变量）。
  cacheTtlMs: 5 * 60 * 1000,
  upstreamTimeoutMs: 10_000,
  retryBaseMs: 1200,

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
