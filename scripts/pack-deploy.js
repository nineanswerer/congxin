#!/usr/bin/env node
/**
 * 打包部署包 —— 知乎 AI Works「源码发布」要上传的那个 ZIP。
 *
 * 用法：
 *   node scripts/pack-deploy.js            # 产出 dist/deploy/congxin-<commit>-<时间>.zip
 *   node scripts/pack-deploy.js --out x.zip
 *
 * ## 打包口径（为什么要白名单而不是「扫全仓库」）
 *
 *   扫全仓库有两个坏处：
 *   ① 别的项目的本地残留（`dark-echo-*.jpg` / `skin-*.png` / `videos/`）会被带进去；
 *   ② `docs/`、`server/src/`、`.ctx/` 一旦暴露在公网部署面上就是信息泄露。
 *   所以这里用**白名单 + 显式排除**：进包的目录是写死的几个，
 *   剩下的一律不进。**改打包口径时改这里，不要改成扫全仓库。**
 *
 * ## 包里有什么
 *
 *   package.json          启动入口（npm install && npm start）
 *   package-lock.json     锁版本（没有就在本地 npm install 生成后再打）
 *   README.md             评委第一眼看到的
 *   scripts/              含 build-check.js —— 平台的 `npm run build` 就是它
 *   server/               后端（含 scripts/，供复现）
 *   web/                  前端页面（零依赖、零构建）
 *   contracts/            契约层（后端运行时**要读** tone.json / taxonomy.json）
 *   assets/kanshan/       刘看山素材 + NOTICE.md（授权说明必须随包）
 *
 * ## 包里没有什么
 *
 *   node_modules/  .git/  .ctx/  docs/  dist/  .env*  access_secret  secrets/
 *
 * ## 密钥
 *
 *   **包里绝不含密钥**（官方提交前检查第 6 条）。密钥由平台在构建/运行时注入，
 *   见 `docs/部署指南.md`「密钥怎么给」。
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'deploy');

/** 进包的目录 / 文件（**白名单**）。 */
const INCLUDE = [
  'package.json',
  'package-lock.json',
  'README.md',
  'scripts',
  'server',
  'web',
  'contracts',
  'assets',
];

/** 整个排除掉的目录名（任意层级）。 */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.ctx',
  'dist',
  'secrets',
  '.secrets',
  '.vscode',
  '.idea',
  'coverage',
]);

/** 整个排除掉的文件名（任意层级）。 */
const EXCLUDE_FILES = new Set(['access_secret']);

/** 再排除的文件名后缀规则。 */
const isExcludedName = (name) => {
  if (name === '.env') return true;
  // `.env.example` 要留（里面只有占位符，告诉部署方要配哪些变量）
  if (name.startsWith('.env.') && name !== '.env.example') return true;
  if (name.endsWith('.log')) return true;
  if (name.startsWith('dark-echo-')) return true;
  if (name.startsWith('skin-')) return true;
  if (name.startsWith('prepared-media')) return true;
  // **文档用的实拍截图**（web/docs-shot-*.png）：只在 README 里给人看，
  // 页面不引用，5 张就占 3.8MB —— 打进部署包纯属浪费带宽。
  if (name.startsWith('docs-shot-')) return true;
  return false;
};

/**
 * 收集要打包的文件（相对仓库根，正斜杠分隔）。
 * @returns {string[]}
 */
export function collectFiles(root = ROOT) {
  const files = [];

  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.push(rel);
      return;
    }
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      if (entry.isFile() && (EXCLUDE_FILES.has(entry.name) || isExcludedName(entry.name))) continue;
      walk(path.join(rel, entry.name));
    }
  };

  for (const rel of INCLUDE) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`⚠️  打包清单里的「${rel}」不存在 —— 跳过`);
      continue;
    }
    walk(rel);
  }

  return files.sort();
}

/**
 * 打 ZIP。
 * @param {string[]} files 相对路径列表
 * @param {string} outPath 输出 zip 路径
 * @param {string} root 源码根
 */
function writeZip(files, outPath, root) {
  const listPath = outPath + '.files.txt';
  // 清单里写**正斜杠**路径 —— ZIP 条目名就是正斜杠，跨平台才对得上。
  fs.writeFileSync(listPath, files.map((rel) => rel.split(path.sep).join('/')).join('\n'), 'utf8');

  const result = spawnSync(
    'tar',
    ['-a', '-c', '-f', outPath, '-C', root, '-T', listPath],
    { encoding: 'utf8' }
  );
  fs.unlinkSync(listPath);

  if (result.status !== 0) {
    throw new Error(`tar 打包失败（exit ${result.status}）：${result.stderr || ''}`);
  }
}

/**
 * 打包并写清单。
 * @returns {{ zip: string, manifest: string, files: string[], bytes: number }}
 */
export function packDeploy({ root = ROOT, outPath } = {}) {
  const files = collectFiles(root);

  let stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  let commit = 'nocommit';
  const commitResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (commitResult.status === 0) commit = commitResult.stdout.trim();

  const target = outPath ?? path.join(OUT_DIR, `congxin-${commit}-${stamp}.zip`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeZip(files, target, root);

  // 清单：每个文件的 SHA-256 —— 上传后可以核对是不是同一个包。
  // 路径统一写成正斜杠（ZIP 里的条目名就是正斜杠，跨平台才对得上）。
  const entries = files.map((rel) => {
    const buf = fs.readFileSync(path.join(root, rel));
    return {
      path: rel.split(path.sep).join('/'),
      bytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
  });
  const manifestPath = target.replace(/\.zip$/, '.manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        name: 'congxin',
        commit,
        built_at: new Date().toISOString(),
        file_count: entries.length,
        total_bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
        files: entries,
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    zip: target,
    manifest: manifestPath,
    files,
    bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
  };
}

// --------------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : undefined;

  const result = packDeploy({ outPath });
  console.log('=== 部署包已生成 ===');
  console.log(`ZIP     ：${result.zip}`);
  console.log(`清单    ：${result.manifest}`);
  console.log(`文件数  ：${result.files.length}`);
  console.log(`解压大小：${Math.round(result.bytes / 1024)} KB`);
}
