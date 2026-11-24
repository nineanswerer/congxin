#!/usr/bin/env node
/**
 * 部署面检查：判断**一份源码树能不能直接当成作品跑起来**。
 *
 * 为什么要有这个（11-19，部署预检）：
 *   AI Works「源码发布」是**上传一个 ZIP，平台自己装依赖、自己起进程**——
 *   本地跑得通 ≠ 上传的包跑得通。本脚本检查的是「包这一侧」的条件：
 *   必需文件齐不齐、契约层能不能解析、启动脚本对不对、
 *   静态挂载顺序对不对、密钥能不能以平台给的形式拿到。
 *
 * 用法：
 *   node scripts/build-check.js            # 检查仓库根
 *   node scripts/build-check.js <某目录>   # 检查解压出来的部署包
 *
 * 退出码：0 = 没有 FAIL；1 = 有 FAIL。
 *
 * ⚠️ 密钥扫描**不在这里**——`scripts/check-contract.ps1` 第 4 项已经做了，
 *    两边各写一套正则一定会漂，所以这里直接调它，不抄一份。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * 必需文件：缺任何一个，上传后的包就起不来（或功能残缺）。
 * 路径相对源码树根。
 */
const REQUIRED_FILES = [
  'package.json',
  'server/package.json',
  'server/src/index.js',
  'server/src/config.js',
  'server/src/lib/web-static.js',
  'web/index.html',
  'web/css/app.css',
  'web/js/app.js',
  'web/js/api.js',
  'web/js/pet.js',
  'contracts/api.json',
  'contracts/tone.json',
  'contracts/taxonomy.json',
  'assets/kanshan/NOTICE.md',
];

/** 必需素材：刘看山 6 个动作（缺一个就有一个状态是空图）。 */
const REQUIRED_ASSETS = ['idle', 'thinking', 'cheer', 'greet', 'sleep', 'play'].map(
  (name) => `assets/kanshan/${name}.webp`
);

/** 契约里必须存在的 11 个路径（contracts/api.json v0.7，认知闭环 4 个路径已下线）。 */
const REQUIRED_API_PATHS = [
  '/api/behavior/favorites',
  '/api/behavior/followees',
  '/api/behavior/contents',
  '/api/quota',
  '/api/tone',
  '/api/auth/profile',
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/cards',
  '/api/advice',
];

/**
 * 检查一份源码树。
 * @param {string} root 源码树根目录
 * @returns {{ pass: string[], warn: string[], fail: string[] }}
 */
export function checkBuildTree(root) {
  const pass = [];
  const warn = [];
  const fail = [];

  const at = (rel) => path.join(root, rel);
  const exists = (rel) => fs.existsSync(at(rel));
  const readText = (rel) => {
    try {
      return fs.readFileSync(at(rel), 'utf8');
    } catch {
      return '';
    }
  };

  // ---------------------------------------------------------- 1. 必需文件
  const missing = REQUIRED_FILES.filter((rel) => !exists(rel));
  const empty = REQUIRED_FILES.filter(
    (rel) => exists(rel) && fs.statSync(at(rel)).size === 0
  );
  if (missing.length === 0 && empty.length === 0) {
    pass.push(`必需文件齐全（${REQUIRED_FILES.length} 个）`);
  } else {
    if (missing.length) fail.push(`缺文件：${missing.join('、')}`);
    if (empty.length) fail.push(`空文件：${empty.join('、')}`);
  }

  // ---------------------------------------------------------- 2. 素材
  const missingAssets = REQUIRED_ASSETS.filter((rel) => !exists(rel));
  const tinyAssets = REQUIRED_ASSETS.filter(
    (rel) => exists(rel) && fs.statSync(at(rel)).size < 10 * 1024
  );
  if (missingAssets.length === 0 && tinyAssets.length === 0) {
    pass.push(`刘看山素材齐全（6 个动作，每个 ≥10KB）`);
  } else {
    if (missingAssets.length) fail.push(`缺素材：${missingAssets.join('、')}`);
    if (tinyAssets.length) fail.push(`素材异常小（可能是空壳）：${tinyAssets.join('、')}`);
  }

  // ---------------------------------------------------------- 3. 契约层
  let apiDoc = null;
  try {
    apiDoc = JSON.parse(readText('contracts/api.json'));
    const paths = Object.keys(apiDoc.paths ?? {});
    const absent = REQUIRED_API_PATHS.filter((p) => !paths.includes(p));
    if (absent.length === 0) {
      pass.push(`契约 api.json 可解析，${REQUIRED_API_PATHS.length} 个路径齐全`);
    } else {
      fail.push(`契约缺路径：${absent.join('、')}`);
    }
  } catch (err) {
    fail.push(`契约 api.json 解析失败：${err.message}`);
  }

  try {
    const tone = JSON.parse(readText('contracts/tone.json'));
    const lineCount = Object.keys(tone.lines?.gentle ?? {}).length;
    if (tone.default !== 'gentle') {
      fail.push(`语气默认值不是 gentle（实际 ${tone.default}）`);
    } else if (lineCount < 14) {
      fail.push(`语气台词不足 14 句（实际 ${lineCount}）`);
    } else {
      pass.push(`语气契约可解析，默认 gentle，${lineCount} 句台词`);
    }
  } catch (err) {
    fail.push(`契约 tone.json 解析失败：${err.message}`);
  }

  try {
    const taxonomy = JSON.parse(readText('contracts/taxonomy.json'));
    // topic_categories 的形状是 { note, categories: [6 个类] } —— 取里面的 categories。
    const topics = taxonomy.topic_categories ?? {};
    const list = Array.isArray(topics)
      ? topics
      : Array.isArray(topics.categories)
        ? topics.categories
        : Object.values(topics).find((v) => Array.isArray(v)) ?? [];
    if (list.length < 5) fail.push(`分类主题类不足（实际 ${list.length}）`);
    else pass.push(`分类契约可解析，${list.length} 个主题类`);
  } catch (err) {
    fail.push(`契约 taxonomy.json 解析失败：${err.message}`);
  }

  // ---------------------------------------------------------- 4. 启动脚本
  try {
    const pkg = JSON.parse(readText('package.json'));
    const problems = [];
    if (!pkg.scripts?.start) problems.push('缺 start 脚本');
    if (!pkg.dependencies?.express) problems.push('dependencies 里没有 express');
    if (!pkg.engines?.node) problems.push('没写 engines.node');
    if (problems.length) {
      fail.push(`根 package.json：${problems.join('；')}`);
    } else {
      pass.push(`根 package.json 可直接 npm install && npm start（start=${pkg.scripts.start}）`);
    }
    if (!pkg.scripts?.build) {
      // ⚠️ 交付副本**故意不声明 build**（D48）：
      //    官方对「入口就是已提交源码、没有构建产物」的项目有专门通道，
      //    构建步骤退化成 `test -f <运行入口>`；真把自检脚本当 build，
      //    官方描述符生成器会直接报错（backend build requires at least one BuildArtifact）。
      //    交付包里会多出官方生成的 scf_bootstrap / cloudbaserc.json —— 用它区分两种形态。
      const isDelivery = exists('scf_bootstrap') || exists('cloudbaserc.json');
      if (isDelivery) {
        pass.push('交付副本不声明 build —— 走官方「无构建」通道（已生成 scf_bootstrap）');
      } else {
        warn.push('根 package.json 没有 build 脚本 —— 平台若按 npm run build 走会失败，建议补一个');
      }
    }
  } catch (err) {
    fail.push(`根 package.json 解析失败：${err.message}`);
  }

  try {
    const pkg = JSON.parse(readText('server/package.json'));
    if (pkg.type !== 'module') {
      fail.push(`server/package.json 的 type 应为 module（实际 ${pkg.type ?? '未设'}）`);
    } else {
      pass.push('server/package.json 是 ESM（与根 package.json 一致）');
    }
  } catch (err) {
    fail.push(`server/package.json 解析失败：${err.message}`);
  }

  // ---------------------------------------------------------- 5. 静态挂载
  const staticSrc = readText('server/src/lib/web-static.js');
  const mountsAssets = staticSrc.includes("app.use('/assets'");
  const mountsWeb = staticSrc.includes("app.use('/web'");
  const mountsRoot = /app\.use\(\s*['"]\/['"]\s*,\s*express\.static/.test(staticSrc);
  if (mountsAssets && mountsWeb && !mountsRoot) {
    pass.push('静态只挂 /web/ 与 /assets/，没把仓库根挂出去');
  } else {
    if (!mountsAssets || !mountsWeb) fail.push('静态挂载缺 /web/ 或 /assets/');
    if (mountsRoot) fail.push('静态把仓库根挂出去了 —— docs/ 与源码会暴露');
  }

  // ---------------------------------------------------------- 6. 挂载顺序
  const indexSrc = readText('server/src/index.js');
  const idxRouters = indexSrc.indexOf('app.use(cardsRouter)');
  const idxMount = indexSrc.indexOf('mountWeb(app)');
  const idx404 = indexSrc.indexOf("code: 'NOT_FOUND'");
  if (idxRouters >= 0 && idxMount > idxRouters && idx404 > idxMount) {
    pass.push('挂载顺序正确：接口路由 → 静态 → 404 兜底');
  } else {
    fail.push(
      `挂载顺序不对（接口 ${idxRouters} / 静态 ${idxMount} / 404 ${idx404}）——` +
        '静态必须在接口之后、404 之前'
    );
  }

  // ---------------------------------------------------------- 7. 密钥拿得到
  const configSrc = readText('server/src/config.js');
  // ⚠️ 这里判的是**能力**（能从文件读密钥），不是某一种环境变量名：
  //    仓库版支持「环境变量 / 环境变量指的文件 / 约定路径」，
  //    交付版（scripts/make-delivery.js 生成）只留「约定路径」——
  //    官方 AI Works 规范不允许运行期读自定义环境变量。
  //    两版都保留 readSecretFile + SECRET_FILE_FALLBACKS，所以这条两边都成立。
  if (
    configSrc.includes('resolveAccessSecret') &&
    configSrc.includes('readSecretFile') &&
    configSrc.includes('SECRET_FILE_FALLBACKS')
  ) {
    pass.push('密钥支持从文件读取（约定路径），官方「秘钥写入文件直接构建」口径可用');
  } else {
    fail.push(
      'config.js 不会从文件读密钥 —— 官方口径是「秘钥写入文件直接构建」，' +
        '没有文件读取能力就会启动失败（读不到凭据）'
    );
  }

  // ---------------------------------------------------------- 8. 不依赖 docs/
  const runtimeRefsDocs = ['server/src'].some((dir) => {
    const base = at(dir);
    if (!fs.existsSync(base)) return false;
    return walk(base).some((file) => {
      if (!file.endsWith('.js')) return false;
      return /['"][^'"]*docs\//.test(fs.readFileSync(file, 'utf8'));
    });
  });
  if (runtimeRefsDocs) {
    fail.push('运行时代码引用了 docs/ —— 部署包里没有 docs/，起来就会炸');
  } else {
    pass.push('运行时不依赖 docs/（部署包里不含 docs/）');
  }

  return { pass, warn, fail };
}

/** 递归列出目录下的文件（跳过 node_modules 与 .git）。 */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// --------------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = path.resolve(process.argv[2] ?? path.join(HERE, '..'));
  const result = checkBuildTree(root);

  console.log(`=== 部署面检查：${root} ===`);
  for (const line of result.pass) console.log(`[PASS ] ${line}`);
  for (const line of result.warn) console.log(`[WARN ] ${line}`);
  for (const line of result.fail) console.log(`[FAIL ] ${line}`);
  console.log(
    `汇总：PASS ${result.pass.length} / WARN ${result.warn.length} / FAIL ${result.fail.length}`
  );

  process.exit(result.fail.length > 0 ? 1 : 0);
}
