/**
 * 把前端页面与素材挂到**同一个 Node 进程**上（部署形态，D22）。
 *
 * 为什么要有这个文件：
 *   - 开发期是**双进程**：`web/serve.js` 发静态 + 代理 `/api`，后端在 18787；
 *   - **部署期必须是单进程**：知乎 AI Works「源码发布」只给一个 Node 进程，
 *     评委打开公网链接要能直接玩，不能让人再起第二个服务。
 *   - D22 当初写的是「把静态目录挂到主服务上即可，前端一行不用改」——
 *     **这一步当时没做**，本文件补上（2026-11-19）。
 *
 * 只挂两个目录，**不挂仓库根**：
 *   /web/     → 仓库的 web/     （页面）
 *   /assets/  → 仓库的 assets/  （刘看山素材）
 * docs/、server/ 源码、.ctx/ 一律不暴露。
 *
 * 页面里素材用的是**相对路径** ../assets/kanshan/...，
 * 所以页面固定从 /web/ 进 —— 根路径 / 会 302 到 /web/。
 *
 * 仓库根的定位：**按本文件位置算**（server/src/lib → 上溯三层），
 * 不看工作目录 —— 容器里的工作目录不一定是代码根。
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // server/src/lib

/** 找到含 web/index.html 的那层目录。找不到返回 null —— 退化成「只发 API」。 */
export function findRepoRoot() {
  const candidates = [
    resolve(HERE, '../../..'), // server/src/lib → 仓库根
    process.cwd(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'web', 'index.html'))) return candidate;
  }
  return null;
}

/**
 * 挂载前端静态资源。**必须在接口路由之后、404 兜底之前调用**：
 * 顺序反了会「接口被静态吃掉」或「静态永远轮不到」。
 */
export function mountWeb(app) {
  const root = findRepoRoot();
  if (!root) {
    console.log('[server] 没找到 web/index.html —— 只发 API（开发期双进程模式）');
    return { mounted: false, root: null };
  }

  // 素材：缓存 1 小时（内容不变，带 hash 更好，但 ffmpeg 转出来的文件名固定）
  app.use('/assets', express.static(join(root, 'assets'), { index: false, maxAge: '1h' }));

  // 页面：不缓存，保证演示现场改完刷新就能看到（宁可多请求一次，不要看到旧版）
  app.use('/web', express.static(join(root, 'web'), { index: 'index.html', maxAge: 0 }));

  // 根路径 → 页面（素材是相对路径，必须从 /web/ 进）
  app.get('/', (req, res) => res.redirect(302, '/web/'));

  console.log('[server] 前端静态已挂载：/web/（素材 /assets/），仓库根 = ' + root);
  return { mounted: true, root };
}
