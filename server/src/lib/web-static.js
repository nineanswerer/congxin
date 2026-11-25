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
 *
 * ------------------------------------------------------------------
 * ⚠️ 2026-11-24：index.html 走**自定义处理**，不再直接交给 express.static
 *
 * 部署实测（preview 域名，响应头可证）：**每一个静态资源都经过腾讯云
 * CloudBase 的 SCF 云函数**（`x-cloudbase-upstream-type: Tencent-SCF_HTTP`），
 * 而平台的限流是**并发**限流：
 *
 *     HTTP 429 {"code":"EXCEED_RATELIMIT",
 *               "message":"Client 127.0.0.6 exceeds rate limit."}
 *
 * 首屏同域并发约 26 个请求（12 个 CSS + 12 个 module script + 图片 + 接口），
 * 函数冷启动期间并发容量只有 ~6，**超出的被平台直接 429 打掉**，且打掉哪几个
 * 是随机的 → 每次刷新都可能缺样式表/缺图 → 页面塌成「荧光绿背景 + 文字叠在
 * 一起 + 图标变方块」。2026-11-24 的实测录屏里 6 帧形态完全不同，就是这个。
 *
 * 三处处置（**全在 server/ 与 web/js/，不碰队友的 web/index.html、web/css/**）：
 *   1. **CSS 全部内联**进 index.html → 首屏少 12 个并发请求，且样式**永远在**，
 *      不会再出现「先塌后好」的闪烁。相对 url() 会改写成绝对路径。
 *   2. **资源守护脚本**内联注入（`asset-guard.js`）→ 图片 / script 被 429 打掉
 *      时自动重试。
 *   3. **静态资源加缓存头** → 万一平台哪天尊重 `public, max-age`，第二次刷新
 *      就是零请求。（平台目前强制 `private, no-store`，所以这一条先备着。）
 *
 * CSS 内联只做一次、写在原 `<link>` 的位置 → **级联顺序完全不变**，
 * 队友的样式不会被我们改坏。
 *
 * ------------------------------------------------------------------
 * ⚠️ 2026-11-25（D74）：**首屏 module 依赖图**也做了同样的处置
 *
 * 用户上传 1.2.2 出的包之后，在 preview 上实测：
 *
 *     GET /web/js/api.js            → 429
 *     GET /web/js/pet.js            → 429
 *     GET /web/js/daily.js          → 429
 *     GET /web/js/outro.js          → 429
 *     GET /web/assets-kit/ui/ui.js  → 429
 *
 * CSS 内联生效了（首屏零 CSS 请求），但 **module 图被打残**：
 * `app.js` 的静态 import 链里有一个 429，**整张模块图都不执行** →
 * 「问它」文案没改写、profile 没请求、按钮点不动。
 *
 * 处置：**在服务端把静态 import 改写成带重试的动态 import**
 * （`module-loader.js`）→ 某个模块被 429 打掉时它自己重试，不连累整张图。
 * ⚠️ 只改**响应**，web/ 下的源文件一个字没动。
 */

import express from 'express';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_GUARD_SCRIPT, markGuardedScripts } from './asset-guard.js';
import {
  MODULE_IMP_HELPER,
  buildModuleGraph,
  findModuleEntries,
  rewriteModule,
} from './module-loader.js';

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

/** `<link rel="stylesheet" ...>` —— 只认带 href 的、且没有 media 的（media 的不内联）。 */
const STYLE_LINK_RE = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
const HREF_RE = /\bhref=["']([^"']+)["']/i;

/**
 * 改写 CSS 里的**相对 url()** —— 内联之后基准从「CSS 文件所在目录」变成了
 * 「HTML 所在目录」，不改就会 404。
 *
 * 排除：data:、http(s):、//、#（SVG 片段）、%23（# 的 URL 编码形式）。
 * 2026-11-24 实测：12 张样式表里只有 **2 处**相对 url()
 *   - vendor/remixicon/remixicon.css → fonts/remixicon.woff2
 *   - css/companion-home.css        → ../assets/companion/A_calm_*.png
 * 其余全是 data URI 或 SVG 片段。
 */
export function rewriteCssUrls(css, href) {
  const baseDir = posix.normalize('/web/' + posix.dirname(href));
  return css.replace(
    /url\(\s*(["']?)(?!data:|https?:|\/\/|#|%23)([^"')]+)\1\s*\)/gi,
    (_match, quote, rel) => {
      const value = rel.trim();
      // 注释里的占位写法（如 `--g-photo: url(...) for .bg-photo`）不是真 URL，别碰
      if (/^\.{1,3}$/.test(value) || value.includes('…')) return _match;
      const abs = posix.normalize(posix.join(baseDir, value));
      return `url(${quote}${abs}${quote})`;
    },
  );
}

/**
 * 把 index.html 里的样式表内联成 `<style>`。
 *
 * @param {string} html 原始 HTML
 * @param {string} webDir web/ 目录绝对路径
 * @returns {{ html: string, inlined: string[], skipped: string[] }}
 */
export function inlineStylesheets(html, webDir) {
  const inlined = [];
  const skipped = [];

  const out = html.replace(STYLE_LINK_RE, (tag) => {
    const hrefMatch = HREF_RE.exec(tag);
    const href = hrefMatch ? hrefMatch[1] : '';
    // 绝对路径、带 query、带 hash 的不处理（首屏没有，但别误伤）
    if (!href || href.startsWith('/') || href.includes('?') || href.includes('#')) {
      skipped.push(href || '(no href)');
      return tag;
    }
    // 带 media 的不内联（内联后优先级语义会变）
    if (/\bmedia\s*=/i.test(tag)) {
      skipped.push(href);
      return tag;
    }

    const file = join(webDir, href);
    if (!existsSync(file)) {
      skipped.push(href);
      return tag;
    }
    try {
      const css = readFileSync(file, 'utf8');
      const patched = rewriteCssUrls(css, href);
      inlined.push(href);
      return `<style data-inline-from="${href}">\n${patched}\n</style>`;
    } catch {
      skipped.push(href);
      return tag;
    }
  });

  return { html: out, inlined, skipped };
}

/**
 * 组装最终下发的 index.html：内联 CSS → 标记 script → 注入守护脚本 → 注入 module 重试 helper。
 */
export function buildIndexHtml(html, webDir) {
  const { html: styled, inlined, skipped } = inlineStylesheets(html, webDir);
  const guarded = markGuardedScripts(styled);
  const withGuard = guarded.includes('</body>')
    ? guarded.replace('</body>', `<script>${ASSET_GUARD_SCRIPT}</script>\n</body>`)
    : guarded + `<script>${ASSET_GUARD_SCRIPT}</script>`;
  // ⚠️ module 重试 helper 必须早于**任何** module script：
  //    classic script 是同步阻塞的，`<script type="module">` 是 defer 语义 →
  //    放在 </head> 之前天然满足顺序要求。
  const withHelper = withGuard.includes('</head>')
    ? withGuard.replace('</head>', `<script>${MODULE_IMP_HELPER}</script>\n</head>`)
    : `<script>${MODULE_IMP_HELPER}</script>\n${withGuard}`;
  return { html: withHelper, inlined, skipped };
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

  const webDir = join(root, 'web');

  // 静态资源的缓存时长（秒）。
  //   - 默认 300（5 分钟）：同一场演示里反复刷新时，第二次起浏览器直接用缓存，
  //     不会再触发一轮「26 个并发请求」的风暴 → 页面稳定。
  //   - 平台目前把 Cache-Control 改写成 `private, no-store`（2026-11-24 实测），
  //     所以这个值在公网上**大概率不生效**；留着是为了哪天平台改口径时我们已经在位。
  //   - 本地开发改完 CSS 想立刻看到 → 等 5 分钟，或把 STATIC_MAX_AGE_SEC 设成 0。
  const staticMaxAge = Number(process.env.STATIC_MAX_AGE_SEC ?? 300);
  const staticCacheControl = `public, max-age=${staticMaxAge}`;

  // 素材：内容不变（刘看山那几张 webp），缓存久一点
  app.use(
    '/assets',
    express.static(join(root, 'assets'), {
      index: false,
      maxAge: '1h',
      setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=3600'),
    }),
  );

  // index.html 走自定义处理：CSS 内联 + 守护脚本注入。
  // ⚠️ 必须排在下面的 express.static 之前 —— static 会直接命中 index.html。
  const indexHandler = (req, res) => {
    try {
      const raw = readFileSync(join(webDir, 'index.html'), 'utf8');
      const built = buildIndexHtml(raw, webDir);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // 页面本身不缓存：改完刷新就要看到（演示现场会反复改）。
      res.setHeader('Cache-Control', 'no-cache');
      res.send(built.html);
    } catch (err) {
      res.status(500).json({
        error: {
          code: 'INDEX_BUILD_FAILED',
          message: '页面没能组装出来',
          user_hint: '刷新一下试试',
          retryable: true,
          retry_after_ms: null,
          upstream: null,
          detail: String(err && err.message),
        },
      });
    }
  };
  app.get('/web', indexHandler);
  app.get('/web/', indexHandler);
  app.get('/web/index.html', indexHandler);

  // ---- 首屏 module 依赖图（D74）----
  //
  // 静态 import 改写成「可重试的动态 import」：某个模块被平台 429 打掉时，
  // 它自己等一等再来一次，而不是整张模块图陪葬。详见 module-loader.js。
  //
  // ⚠️ 只改**响应**，不改 web/ 下的任何源文件。
  let graphCache = null;

  /** 图 + 图内所有文件的 mtime 汇总 —— 用来判断缓存是否过期（开发期改 import 立刻生效）。 */
  const graphStamp = (graph) => {
    let stamp = '';
    for (const rel of ['index.html', ...graph.modules.keys()]) {
      try {
        stamp += `${rel}:${statSync(join(webDir, rel)).mtimeMs};`;
      } catch {
        stamp += `${rel}:x;`;
      }
    }
    return stamp;
  };

  const getModuleGraph = () => {
    let entries = [];
    try {
      entries = findModuleEntries(readFileSync(join(webDir, 'index.html'), 'utf8'));
    } catch {
      entries = [];
    }
    const key = entries.join('|');
    if (graphCache && graphCache.key === key && graphCache.stamp === graphStamp(graphCache.graph)) {
      return graphCache.graph;
    }
    const graph = buildModuleGraph(webDir, entries);
    graphCache = { key, graph, stamp: graphStamp(graph) };
    return graph;
  };

  // ⚠️ 必须排在下面的 express.static 之前 —— static 会直接命中 .js 文件。
  app.use('/web', (req, res, next) => {
    if (!req.path.endsWith('.js')) return next();
    const rel = posix.normalize(req.path.replace(/^\/+/, ''));
    const graph = getModuleGraph();
    if (!graph.modules.has(rel)) return next();
    // 有循环依赖 → 动态 import 会死锁，保持原样
    if (graph.cyclic.has(rel)) return next();
    const node = graph.modules.get(rel);
    const rewritten = rewriteModule(node.code, rel);
    // 改不动（再导出 / import 不在顶部 / clause 认不出来）→ 原样放行
    if (!rewritten.changed) return next();
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', staticCacheControl);
    res.send(rewritten.code);
  });

  // 页面：不缓存，保证演示现场改完刷新就能看到（宁可多请求一次，不要看到旧版）
  app.use(
    '/web',
    express.static(webDir, {
      index: false,
      maxAge: 0,
      setHeaders: (res, filePath) => {
        // HTML 不缓存；CSS/JS/图片/字体按 STATIC_MAX_AGE_SEC 缓存
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', staticCacheControl);
        }
      },
    }),
  );

  // 根路径 → 页面（素材是相对路径，必须从 /web/ 进）
  app.get('/', (req, res) => res.redirect(302, '/web/'));

  console.log('[server] 前端静态已挂载：/web/（素材 /assets/），仓库根 = ' + root);
  return { mounted: true, root };
}
