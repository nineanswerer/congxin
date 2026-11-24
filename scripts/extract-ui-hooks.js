#!/usr/bin/env node
/**
 * 抽取「我们的 JS 依赖的界面钩子」，用来维护 contracts/ui-contract.json。
 *
 * 为什么需要它：web/index.html 归队友（视觉与设计），我们的 JS 靠一批 id / class /
 * data 属性取元素。这份钩子清单就是那道接缝的护栏 —— 队友改坏一个钩子，
 * scripts/check-contract.ps1 第 14 项会当场报 FAIL。
 *
 * 用法：
 *   node scripts/extract-ui-hooks.js            # 打印清单
 *   node scripts/extract-ui-hooks.js --write    # 直接覆盖 contracts/ui-contract.json
 *
 * ⚠️ 两个坑（改这个脚本前先看）：
 *   1. **不能只扫 getElementById** —— 前端统一走 `const $ = sel => root.querySelector(sel)`，
 *      只扫 getElementById 只能抓到 1 个。这里扫的是**所有选择器字符串字面量**。
 *   2. **大写十六进制颜色会被误当成 id** —— terrain.js 里有 '#B7332C'。
 *      所以 id 只认**小写开头**（#[a-z][a-z0-9-]*）。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const JS_DIR = path.join(ROOT, 'web', 'js');
const HTML_PATH = path.join(ROOT, 'web', 'index.html');
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'ui-contract.json');

// ---- 读现状 ----
const html = fs.readFileSync(HTML_PATH, 'utf8');
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const htmlClasses = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const htmlAttrs = new Set([...html.matchAll(/\sdata-([a-z0-9-]+)=/g)].map((m) => m[1]));

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const owned = new Set([
  ...(contract.index_ids || []),
  ...(contract.js_owned_ids || []),
]);

const idUse = new Map();
const classUse = new Map();
const attrUse = new Map();

for (const file of fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const lit = m[2];
    if (!/^[#.\[]/.test(lit)) continue;
    for (const im of lit.matchAll(/#([a-z][a-z0-9-]*)/g)) {
      if (!idUse.has(im[1])) idUse.set(im[1], new Set());
      idUse.get(im[1]).add(file);
    }
    for (const cm of lit.matchAll(/\.([a-z][a-z0-9_-]*)/g)) {
      if (!classUse.has(cm[1])) classUse.set(cm[1], new Set());
      classUse.get(cm[1]).add(file);
    }
    for (const am of lit.matchAll(/data-([a-z0-9-]+)/g)) {
      if (!attrUse.has(am[1])) attrUse.set(am[1], new Set());
      attrUse.get(am[1]).add(file);
    }
  }
}

const sort = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const found = {
  ids: sort(idUse),
  classes: sort(classUse),
  attrs: sort(attrUse),
};

const fmt = (m) => m.map(([k, files]) => `  ${k.padEnd(24)} ${[...files].join(', ')}`).join('\n');

console.log(`=== 我们的 JS 依赖的 id（${found.ids.length}）===`);
console.log(fmt(found.ids));
console.log(`\n=== 我们的 JS 依赖的 class（${found.classes.length}，仅供参考）===`);
console.log('  这些类名里混着噪声（文件名 .webp、句子里的点），**不自动进契约**；');
console.log('  index_classes 只收「JS 会按类名取元素、且在 index.html 里」的少数几个。');
console.log(`\n=== 我们的 JS 依赖的 data 属性（${found.attrs.length}，仅供参考）===`);
console.log(fmt(found.attrs));

// ---- 与现有契约对照（只对 id 做硬校验）----
const missing = [];
for (const [id] of found.ids) {
  if (owned.has(id)) continue;
  if (htmlIds.has(id)) missing.push(`JS 引用了没登记的 id『${id}』→ 加进 index_ids 或 js_owned_ids`);
}
const attrRegistered = new Set(
  [...(contract.index_data_attrs || []), ...(contract.js_owned_data_attrs || [])].map((a) =>
    a.replace(/^data-/, ''),
  ),
);
for (const [a] of found.attrs) {
  if (attrRegistered.has(a)) continue;
  if (htmlAttrs.has(a)) missing.push(`JS 引用了没登记的 data 属性『data-${a}』`);
}
console.log(`\n=== 与 contracts/ui-contract.json 的差异 ===`);
console.log(missing.length ? missing.join('\n') : '  无差异 ✓');

// ---- --write：把「JS 引用且 index.html 里有」的并进 index_ids ----
if (process.argv.includes('--write')) {
  const idx = new Set(contract.index_ids || []);
  for (const [id] of found.ids) if (htmlIds.has(id)) idx.add(id);

  contract.index_ids = [...idx].sort();
  contract.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CONTRACT_PATH, JSON.stringify(contract, null, 2) + '\n', 'utf8');
  console.log(`\n已写回 ${path.relative(ROOT, CONTRACT_PATH)}：${contract.index_ids.length} 个 id`);
}
