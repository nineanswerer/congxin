/**
 * 登录（OAuth）冒烟测试：**不消耗任何知乎额度**，也不需要任何 OAuth 凭证。
 *
 * 用法：
 *   node scripts/smoke-auth.js
 *
 * 验七件事：
 *   1. `GET /api/auth/profile` 永远 200，且无会话时是 `developer_account` 模式
 *   2. **开发期不许编昵称**：fullname 必须是 null，empty 必须是 true，提示要是中文
 *   3. `GET /api/auth/login` 凭证没到位时诚实 401（`OAUTH_REQUIRED`），**不伪造跳转**
 *   4. `GET /api/auth/callback` 同上
 *   5. `POST /api/auth/logout` 幂等：连着调两次都是 200
 *   6. `index.js` 真的挂了 authRouter（静态检查，避免改了路由忘了注册）
 *   7. 上游调用层优先用**会话里的** OAuth token（每个登录用户读自己的数据）
 *
 * 第 3、4 条的实测意义：App ID / App Key 由赛事页面在项目创建后分配，
 * 在那之前这两个接口**必须诚实地说「还没开启」**，而不是跳到一个假的地方。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { authRouter } from '../src/routes/auth.js';
import { authContextMiddleware } from '../src/lib/auth-session.js';
import { toApiError } from '../src/lib/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const repoRoot = path.resolve(serverRoot, '..');

const problems = [];
const ok = (label) => console.log(`✅ ${label}`);
const info = (label, value) => console.log(`   ${label}: ${value}`);
const fail = (label) => {
  problems.push(label);
  console.log(`❌ ${label}`);
};
const hasChinese = (s) => typeof s === 'string' && /[\u4e00-\u9fa5]/.test(s);

// 与 index.js 同一套中间件与错误信封，只是不起真实端口、不需要 Access Secret
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(authContextMiddleware);
app.use(authRouter);
app.use((err, req, res, next) => {
  const apiError = toApiError(err);
  res.status(apiError.httpStatus).json(apiError.toBody());
});

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, url) {
  const res = await fetch(`${base}${url}`, { method, redirect: 'manual' });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = { _raw: text }; }
  return { status: res.status, body, location: res.headers.get('location') };
}

// ---------------------------------------------------------------- 1. profile 永远 200
{
  const r = await call('GET', '/api/auth/profile');
  if (r.status === 200) ok('GET /api/auth/profile 返回 200');
  else fail(`GET /api/auth/profile 返回了 ${r.status}`);

  if (r.body?.data?.mode === 'developer_account') ok('无会话时是 developer_account 模式');
  else fail(`mode 不是 developer_account（实际 ${r.body?.data?.mode}）`);

  if (r.body?.data?.fullname === null) ok('开发期 fullname 是 null（没有编昵称）');
  else fail(`开发期 fullname 不是 null（实际 ${JSON.stringify(r.body?.data?.fullname)}）——不许编昵称`);

  if (r.body?.data?.empty === true) ok('开发期 empty 是 true');
  else fail('开发期 empty 不是 true');

  if (hasChinese(r.body?.data?.empty_notice)) ok('empty_notice 是中文真实提示');
  else fail(`empty_notice 不是中文（实际 ${JSON.stringify(r.body?.data?.empty_notice)}）`);

  if (r.body?.data?.uid === null) ok('uid 是 null');
  else fail(`uid 不是 null（实际 ${JSON.stringify(r.body?.data?.uid)}）`);

  if (r.body?.meta?.source === 'none') ok('meta.source 是 none（没有上游数据）');
  else fail(`meta.source 不是 none（实际 ${r.body?.meta?.source}）`);

  const required = ['mode', 'uid', 'fullname', 'avatar_url', 'headline', 'empty', 'empty_notice'];
  const missing = required.filter((k) => !(k in (r.body?.data ?? {})));
  if (missing.length === 0) ok('契约要求的 7 个字段一个不少');
  else fail(`缺字段：${missing.join('、')}`);
}

// ---------------------------------------------------------------- 2. login 诚实 401
{
  const r = await call('GET', '/api/auth/login');
  if (r.status === 401) ok('GET /api/auth/login 凭证没到位时返回 401');
  else fail(`GET /api/auth/login 返回了 ${r.status}（应为 401）`);

  if (r.body?.error?.code === 'OAUTH_REQUIRED') ok('错误码是 OAUTH_REQUIRED');
  else fail(`错误码是 ${r.body?.error?.code}`);

  if (hasChinese(r.body?.error?.user_hint)) ok('user_hint 是中文真实提示');
  else fail(`user_hint 不是中文（实际 ${JSON.stringify(r.body?.error?.user_hint)}）`);

  if (!r.location) ok('没有发生跳转（不伪造授权页）');
  else fail(`跳到了 ${r.location}——凭证没到位时不该跳转`);
}

// ---------------------------------------------------------------- 3. callback 诚实 401
{
  const r = await call('GET', '/api/auth/callback');
  if (r.status === 401 && r.body?.error?.code === 'OAUTH_REQUIRED') {
    ok('GET /api/auth/callback 凭证没到位时返回 401 OAUTH_REQUIRED');
  } else {
    fail(`GET /api/auth/callback 返回了 ${r.status} / ${r.body?.error?.code}`);
  }
}

// ---------------------------------------------------------------- 4. 回调两个参数名都收
{
  // 凭证没到位时先被 OAUTH_REQUIRED 拦住，说明「先查凭证再查 code」的顺序是对的
  const r = await call('GET', '/api/auth/callback?authorization_code=fake');
  if (r.status === 401) ok('回调带 authorization_code 时先被凭证检查拦住（顺序正确）');
  else fail(`回调带 authorization_code 时返回了 ${r.status}`);

  const r2 = await call('GET', '/api/auth/callback?code=fake');
  if (r2.status === 401) ok('回调带 code 时同样被凭证检查拦住（两个参数名都收）');
  else fail(`回调带 code 时返回了 ${r2.status}`);
}

// ---------------------------------------------------------------- 5. logout 幂等
{
  const a = await call('POST', '/api/auth/logout');
  const b = await call('POST', '/api/auth/logout');
  if (a.status === 200 && b.status === 200) ok('POST /api/auth/logout 连着调两次都是 200（幂等）');
  else fail(`logout 第一次 ${a.status}、第二次 ${b.status}`);

  if (a.body?.data?.logged_in === false) ok('退出后 logged_in 是 false');
  else fail(`退出后 logged_in 是 ${a.body?.data?.logged_in}`);

  if (hasChinese(a.body?.data?.notice)) ok('notice 是中文');
  else fail(`notice 不是中文（实际 ${JSON.stringify(a.body?.data?.notice)}）`);
}

// ---------------------------------------------------------------- 6. index.js 真的挂了路由
{
  const indexSrc = fs.readFileSync(path.join(serverRoot, 'src', 'index.js'), 'utf8');
  if (indexSrc.includes('app.use(authRouter)')) ok('index.js 挂了 authRouter');
  else fail('index.js 里没有 app.use(authRouter)——改了路由忘了注册');

  if (indexSrc.includes('authContextMiddleware')) ok('index.js 装了登录上下文中间件');
  else fail('index.js 里没有 authContextMiddleware');

  const clientSrc = fs.readFileSync(path.join(serverRoot, 'src', 'zhihu', 'client.js'), 'utf8');
  if (clientSrc.includes('authContext.getStore()?.accessToken')) {
    ok('上游调用层优先用会话里的 OAuth token（每个登录用户读自己的数据）');
  } else {
    fail('client.js 没有优先用会话里的 OAuth token');
  }
}

// ---------------------------------------------------------------- 7. 契约层对得上
{
  const apiDoc = JSON.parse(fs.readFileSync(path.join(repoRoot, 'contracts', 'api.json'), 'utf8'));
  const paths = Object.keys(apiDoc.paths ?? {});
  const need = [
    '/api/auth/profile',
    '/api/auth/login',
    '/api/auth/callback',
    '/api/auth/logout',
  ];
  const missing = need.filter((p) => !paths.includes(p));
  if (missing.length === 0) ok('契约里有 4 个 auth 路径');
  else fail(`契约缺路径：${missing.join('、')}`);

  const modes = apiDoc.components?.schemas?.AuthMode?.enum ?? [];
  if (modes.includes('oauth') && modes.includes('developer_account')) ok('AuthMode 有两种模式');
  else fail(`AuthMode 枚举是 ${JSON.stringify(modes)}`);

  const required = apiDoc.components?.schemas?.AuthProfileData?.required ?? [];
  const missReq = ['mode', 'fullname', 'empty'].filter((k) => !required.includes(k));
  if (missReq.length === 0) ok('AuthProfileData 把 mode / fullname / empty 设为必填');
  else fail(`AuthProfileData 必填缺：${missReq.join('、')}`);
}

server.close();

console.log('');
if (problems.length > 0) {
  console.error(`❌ 登录自检失败 ${problems.length} 项`);
  process.exit(1);
}
console.log('✅ 登录全链路自检通过（未消耗任何知乎额度，也不需要 OAuth 凭证）');
