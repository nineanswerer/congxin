/**
 * 「从心」前端开发服务器 —— **零依赖**。
 *
 * 干两件事：
 *   1. 把仓库根目录当静态根伺服（`/web/` 是页面，`/assets/` 是刘看山素材）
 *   2. 把 `/api/*` **代理**到后端（默认 http://localhost:18787）
 *
 * 为什么代理而不是让前端跨域直连：
 * 页面与接口同源 → 不用处理 CORS，也不用在前端里写死后端地址；
 * 部署时（AI Works）前后端同进程，把静态目录挂到主服务上就行，前端一行不用改。
 *
 * 用法：
 *   node web/serve.js
 *   → http://localhost:18788/web/
 *
 * 环境变量：
 *   WEB_PORT   前端端口（默认 18788）
 *   API_BASE   后端地址（默认 http://localhost:18787）
 *
 * ⚠️ 本机 **8787 端口绑不上**（listen EACCES），后端请用别的端口（默认 18787）。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.API_BASE ?? 'http://localhost:18787';
const PORT = Number(process.env.WEB_PORT ?? 18788);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function proxy(req, res, pathname, search) {
  const url = `${API_BASE}${pathname}${search}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        ...(body ? { 'Content-Type': req.headers['content-type'] ?? 'application/json' } : {}),
        ...(req.headers['x-session-id'] ? { 'x-session-id': req.headers['x-session-id'] } : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    const headers = { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8' };
    for (const h of ['x-session-id', 'location']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    send(res, upstream.status, buf, headers);
  } catch (err) {
    // 后端没起来 —— 说真话，不返回伪造数据
    send(
      res,
      502,
      JSON.stringify({
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: `连不上后端：${err?.message ?? err}`,
          user_hint: '后端没起来。先跑 node server/src/index.js（记得换端口，别用 8787）。',
          retryable: true,
          retry_after_ms: null,
          upstream: null,
          detail: API_BASE,
        },
      }),
      { 'Content-Type': 'application/json; charset=utf-8' }
    );
  }
}

async function serveStatic(res, pathname) {
  // 防目录穿越
  const rel = normalize(pathname).replace(/^([/\\])+/, '');
  const target = join(ROOT, rel);
  if (!target.startsWith(ROOT + sep) && target !== ROOT) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  try {
    const st = await stat(target);
    if (st.isDirectory()) {
      const idx = join(target, 'index.html');
      const body = await readFile(idx);
      return send(res, 200, body, { 'Content-Type': MIME['.html'] });
    }
    const body = await readFile(target);
    return send(res, 200, body, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    });
  } catch {
    return send(res, 404, `找不到：${pathname}`, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(u.pathname);

  if (pathname === '/') {
    res.writeHead(302, { Location: '/web/' });
    return res.end();
  }
  if (pathname.startsWith('/api/')) {
    return proxy(req, res, pathname, u.search);
  }
  return serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`[web] 前端已启动：http://localhost:${PORT}/web/`);
  console.log(`[web] /api 代理到：${API_BASE}`);
  console.log('[web] ⚠️ 8787 端口在本机绑不上，后端请用 18787');
});
