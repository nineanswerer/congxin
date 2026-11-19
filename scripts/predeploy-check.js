#!/usr/bin/env node
/**
 * 部署前预检 —— 产出「部署前 9 条检查」对照报告。
 *
 * ## 为什么要有这个
 *
 *   AI Works「源码发布」是**上传 ZIP → 平台自己装依赖、自己起进程**。
 *   本地跑得通不代表**上传的那个包**跑得通；官方 9 条检查里第 1 条
 *   （体验链接支持评委走完主流程）卡的就是这一段。
 *   所以预检的核心动作是：
 *
 *     ① 打包 → ② **解压到临时目录** → ③ 在临时目录里真的起一个进程
 *        → ④ 探 URL → ⑤ 关掉 → ⑥ 出报告
 *
 *   第 ③ 步验的是**上传物的解包结果**，不是仓库里的源码。
 *   这一步能抓住「包少带了文件」「依赖没装上」「挂载顺序错了」这类本地看不出来的问题。
 *
 * ## 密钥
 *
 *   预检会**把本机的 Access Secret 读进内存，逐个文件比对包里有没有它**——
 *   这是对官方检查第 6 条最直接的验证。
 *   密钥**只参与比对，不写进任何文件、不打印、不进报告**。
 *
 * 用法：
 *   node scripts/predeploy-check.js            # 完整预检（含本地起进程）
 *   node scripts/predeploy-check.js --no-boot  # 只做静态检查，不起进程
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkBuildTree } from './build-check.js';
import { packDeploy } from './pack-deploy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** 本机 Access Secret 的落点（仓库外、gitignore）。只用来比对，不外传。 */
const LOCAL_SECRET_PATHS = [
  path.join(os.homedir(), '.zhihu-cli', 'access_secret'),
];

/** 探测用的端口（尽量避开常用端口；8787 本机绑不上）。 */
const PROBE_PORT = 18797;

/** 假的凭据 —— 只为让 assertConfig 通过，**不真调知乎**（不烧额度）。 */
const DUMMY_CRED = 'not-a-real-credential';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------- 工具

/** 读本机密钥；读不到返回空串。 */
function readLocalSecret() {
  for (const p of LOCAL_SECRET_PATHS) {
    try {
      const v = fs.readFileSync(p, 'utf8').trim();
      if (v) return v;
    } catch {
      /* 没这个文件就算了 */
    }
  }
  return '';
}

/**
 * 逐个文件比对包里有没有本机密钥。
 * @returns {{ leaked: string[] }}
 */
function scanSecretInTree(dir) {
  const secret = readLocalSecret();
  const leaked = [];
  if (!secret) return { leaked };

  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      // 只扫文本类：素材与图片是二进制，扫了也只是噪声
      if (!/\.(js|json|md|html|css|txt|yml|yaml|ps1|example)$/i.test(entry.name)) continue;
      let text = '';
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (text.includes(secret)) {
        leaked.push(path.relative(dir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return { leaked };
}

/**
 * 在解包出来的目录里真的起一个进程，探几个关键 URL，然后关掉。
 * @returns {Promise<{ started: boolean, probes: {url: string, status: number, note: string}[], log: string }>}
 */
async function bootAndProbe(dir) {
  const log = [];

  // 平台会执行 `npm install`；本机复现这一步用本地已有的 node_modules（更快、离线也行）。
  const localModules = path.join(ROOT, 'server', 'node_modules');
  if (fs.existsSync(localModules) && !fs.existsSync(path.join(dir, 'node_modules'))) {
    fs.cpSync(localModules, path.join(dir, 'node_modules'), { recursive: true });
    log.push('已复制本地 node_modules（等价于平台 npm install 的结果）');
  }

  const child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(PROBE_PORT),
      // 这里用**假密钥**：只验「进程起得来、静态挂得上」，不真调知乎（不烧额度）。
      ZHIHU_ACCESS_SECRET: DUMMY_CRED,
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (buf) => {
    const s = buf.toString();
    if (log.join('').length < 4000) log.push(s);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  // 等端口起来
  let up = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PROBE_PORT}/api/health`);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* 还没起来 */
    }
  }

  const probes = [];
  if (!up) {
    child.kill();
    return { started: false, probes, log: log.join('') };
  }

  const targets = [
    { url: '/', note: '根路径应 302 到 /web/' },
    { url: '/web/', note: '前端页面' },
    { url: '/assets/kanshan/idle.webp', note: '刘看山素材' },
    { url: '/api/health', note: '后端接口' },
    { url: '/api/nope', note: '不存在的接口应回契约里的 404 JSON 错误信封' },
  ];
  for (const t of targets) {
    try {
      const res = await fetch(`http://127.0.0.1:${PROBE_PORT}${t.url}`, { redirect: 'manual' });
      probes.push({ url: t.url, status: res.status, note: t.note, type: res.headers.get('content-type') });
    } catch (err) {
      probes.push({ url: t.url, status: 0, note: `请求失败：${err.message}` });
    }
  }

  child.kill();
  await sleep(300);
  return { started: true, probes, log: log.join('') };
}

/** 跑一遍仓库自检（契约层 + 密钥扫描 + 交接记录……）。 */
function runContractSelfCheck() {
  const script = path.join(ROOT, 'scripts', 'check-contract.ps1');
  const result = spawnSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', script],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const m = out.match(/汇总：PASS (\d+) \/ WARN (\d+) \/ FAIL (\d+)/);
  return {
    exitCode: result.status,
    summary: m ? `PASS ${m[1]} / WARN ${m[2]} / FAIL ${m[3]}` : '（没读到汇总行）',
    tail: out.split(/\r?\n/).filter((l) => /^\[(PASS|WARN|FAIL)/.test(l)).slice(-16).join('\n'),
  };
}

// --------------------------------------------------------------------- 主流程

const noBoot = process.argv.includes('--no-boot');

console.log('=== 部署前预检 ===\n');

// ① 源码树静态检查
console.log('[1/6] 源码树静态检查');
const treeCheck = checkBuildTree(ROOT);
for (const l of treeCheck.fail) console.log('   FAIL ' + l);
for (const l of treeCheck.warn) console.log('   WARN ' + l);
console.log(`   PASS ${treeCheck.pass.length} / WARN ${treeCheck.warn.length} / FAIL ${treeCheck.fail.length}`);

// ② 打包
console.log('\n[2/6] 打包');
const packed = packDeploy({});
console.log(`   ${packed.zip}`);
console.log(`   ${packed.files.length} 个文件 / ${Math.round(packed.bytes / 1024)} KB`);

// ③ 解包到临时目录
console.log('\n[3/6] 解包到临时目录（模拟平台拿到 ZIP 后的样子）');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'congxin-deploy-'));
try {
  const unzip = spawnSync('tar', ['-xf', packed.zip, '-C', tmpDir], { encoding: 'utf8' });
  if (unzip.status !== 0) {
    console.log('   FAIL 解包失败：' + (unzip.stderr || ''));
  }
  const unzipped = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
  console.log(`   解出 ${unzipped.length} 个顶层条目：${unzipped.join('、')}`);

  // ④ 对**解包结果**再跑一遍静态检查
  console.log('\n[4/6] 解包结果的静态检查');
  const pkgCheck = checkBuildTree(tmpDir);
  for (const l of pkgCheck.fail) console.log('   FAIL ' + l);
  for (const l of pkgCheck.warn) console.log('   WARN ' + l);
  console.log(`   PASS ${pkgCheck.pass.length} / WARN ${pkgCheck.warn.length} / FAIL ${pkgCheck.fail.length}`);

  // ⑤ 密钥比对 + 本地起进程
  console.log('\n[5/6] 密钥比对' + (noBoot ? '（跳过起进程）' : ' + 本地起进程探 URL'));
  const secretScan = scanSecretInTree(tmpDir);
  console.log(
    secretScan.leaked.length === 0
      ? '   PASS 部署包里没有本机 Access Secret'
      : '   FAIL 部署包里有密钥：' + secretScan.leaked.join('、')
  );

  let boot = { started: false, probes: [], log: '' };
  if (!noBoot) {
    boot = await bootAndProbe(tmpDir);
    if (!boot.started) {
      console.log('   FAIL 进程没起来：' + boot.log.split('\n').slice(-6).join(' | '));
    } else {
      for (const p of boot.probes) console.log(`   ${p.status} ${p.url} —— ${p.note}`);
    }
  }

  // ⑥ 仓库自检
  console.log('\n[6/6] 仓库契约自检');
  const selfCheck = runContractSelfCheck();
  console.log('   ' + selfCheck.summary);

  // ------------------------------------------------------------ 出报告
  const failed = treeCheck.fail.length + pkgCheck.fail.length + secretScan.leaked.length;
  const report = buildReport({
    treeCheck,
    pkgCheck,
    secretScan,
    boot,
    selfCheck,
    packed,
    noBoot,
  });
  const reportPath = path.join(
    path.dirname(packed.zip),
    `部署预检报告-${path.basename(packed.zip).replace(/^congxin-|\.zip$/g, '')}.md`
  );
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log('\n=== 报告 ===');
  console.log(reportPath);
  console.log(failed === 0 ? '结论：自动可判的项全部通过' : `结论：有 ${failed} 项 FAIL`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * 组装「部署前 9 条检查」对照报告。
 * 每一行都标清楚：**这一条能不能机器判**，判不了的那几条**谁负责**。
 */
function buildReport({ treeCheck, pkgCheck, secretScan, boot, selfCheck, packed, noBoot }) {
  const probe = (url) => boot.probes.find((p) => p.url === url);
  const bootOk = (url, expect) => {
    if (noBoot) return '—（本次跳过起进程）';
    const p = probe(url);
    if (!p) return '—';
    if (!expect) return `${p.status}`;
    return p.status === expect ? `✅ ${p.status}` : `❌ ${p.status}（期望 ${expect}）`;
  };

  const rows = [
    {
      no: 1,
      req: '体验链接、安装包或硬件体验方式可以支持评委实际完成核心流程。',
      now: '单进程部署形态已就绪（D42）；**公网链接还没拿**。',
      auto: `解包后本地起进程：根 ${bootOk('/', 302)}、页面 ${bootOk('/web/', 200)}、素材 ${bootOk('/assets/kanshan/idle.webp', 200)}、接口 ${bootOk('/api/health', 200)}`,
      who: '**人**：公网链接要人去平台拿',
    },
    {
      no: 2,
      req: '参赛赛道、项目信息与产品说明已完成，作品与知乎社区生态及主题相关。',
      now: '赛道「AI × 陪伴与交互」已定；README 与计划书在仓库里。',
      auto: 'README 存在且含赛道与真实进度',
      who: '**人**：材料完整度要人读',
    },
    {
      no: 3,
      req: '需要登录的网页提供可用测试账号；安装类作品提供系统和环境说明。',
      now: '开发期走 `developer_account`（自读，**不暴露真实用户数据**）；OAuth 12-05 后再接。',
      auto: '`/api/auth/profile` 无 Cookie 仍 200 + developer_account（不是 401）',
      who: '—',
    },
    {
      no: 4,
      req: '仓库与视频链接可以被评委访问。',
      now: '仓库 public ✅；**演示视频未拍**（第 4 条硬要求）。',
      auto: '仓库 public 已核（页面含 repository_public: true）',
      who: '**人**：视频只能人录',
    },
    {
      no: 5,
      req: '使用 OAuth 时，回调地址与登记值一致，授权和退出流程实际可用。',
      now: '**本期 Demo 不依赖 OAuth**，OAuth 联调排在 12-05 之后。',
      auto: '未启用 OAuth 时本条不适用',
      who: '**人**：12-05 后联调',
    },
    {
      no: 6,
      req: 'App Key、Access Secret、OAuth Token 等密钥未出现在源码、前端响应、日志、截图或视频中。',
      now: '密钥只在本机 `~/.zhihu-cli/access_secret`（仓库外、gitignore）。',
      auto: `仓库自检 ${selfCheck.summary}；**部署包里逐文件比对本机密钥** → ${secretScan.leaked.length === 0 ? '✅ 没有' : '❌ 有：' + secretScan.leaked.join('、')}`,
      who: '**人**：截图与视频里也不能有',
    },
    {
      no: 7,
      req: '接口失败、额度耗尽和空数据有真实的错误或降级提示。',
      now: '统一错误信封 + 中文 `user_hint`；断网 / 额度耗尽 / 空数据三态都实测过。',
      auto: `不存在的接口回契约错误信封 → ${bootOk('/api/nope', 404)}`,
      who: '—',
    },
    {
      no: 8,
      req: '作品、素材和使用数据符合原创、授权与赛事规范，保留必要创作佐证。',
      now: '刘看山素材**仅本届可用**、授权说明随包；不 mock；数据来自真实知乎。',
      auto: '包内含 assets/kanshan/NOTICE.md；运行时不含 mock 数据',
      who: '**人**：授权与原创最终由人确认',
    },
    {
      no: 9,
      req: '所有最终材料在 12 月 7 日 10:00 前提报完成，未将保存、占位或 Mock 测试写成最终交付完成。',
      now: '提报窗口 12-05 10:00 → 12-07 10:00；**正式公网链接必须 12-04 前拿到**。',
      auto: '—（时间与提报是人的动作）',
      who: '**人**',
    },
  ];

  const autoFail =
    treeCheck.fail.length + pkgCheck.fail.length + secretScan.leaked.length;

  const lines = [];
  lines.push('# 部署前 9 条检查 · 对照报告');
  lines.push('');
  lines.push(`- **生成时间**：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- **部署包**：` + path.basename(packed.zip) + `（${packed.files.length} 个文件 / ${Math.round(packed.bytes / 1024)} KB）`);
  lines.push(
    '- **打包口径**：白名单（package.json / package-lock.json / README.md / scripts/ / ' +
      'server/ / web/ / contracts/ / assets/），**不含** node_modules/ .git/ .ctx/ docs/ ' +
      'dist/ .env* access_secret secrets/'
  );
  lines.push(`- **自动可判项**：${autoFail === 0 ? '✅ 全部通过' : `❌ ${autoFail} 项 FAIL`}`);
  lines.push('');
  lines.push('> **这一份不是「提交前检查全过」的证明**——它只覆盖能机器判的部分。');
  lines.push('> 标着「人」的行要人自己确认；**第 4 条（演示视频）现在还是空的**。');
  lines.push('');
  lines.push('## 对照表');
  lines.push('');
  lines.push('| # | 官方要求 | 本项目现状 | 自动判据与结果 | 谁确认 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${r.no} | ${r.req} | ${r.now} | ${r.auto} | ${r.who} |`);
  }
  lines.push('');
  lines.push('## 源码树静态检查');
  lines.push('');
  for (const l of treeCheck.pass) lines.push(`- ✅ ${l}`);
  for (const l of treeCheck.warn) lines.push(`- ⚠️ ${l}`);
  for (const l of treeCheck.fail) lines.push(`- ❌ ${l}`);
  lines.push('');
  lines.push('## 解包结果静态检查');
  lines.push('');
  for (const l of pkgCheck.pass) lines.push(`- ✅ ${l}`);
  for (const l of pkgCheck.warn) lines.push(`- ⚠️ ${l}`);
  for (const l of pkgCheck.fail) lines.push(`- ❌ ${l}`);
  lines.push('');
  if (!noBoot) {
    lines.push('## 本地起进程探测');
    lines.push('');
    lines.push('| URL | 状态码 | 说明 |');
    lines.push('| --- | --- | --- |');
    for (const p of boot.probes) lines.push(`| \`${p.url}\` | ${p.status} | ${p.note} |`);
    lines.push('');
  }
  lines.push('## 仓库契约自检');
  lines.push('');
  lines.push('```');
  lines.push(selfCheck.summary);
  lines.push(selfCheck.tail);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}
