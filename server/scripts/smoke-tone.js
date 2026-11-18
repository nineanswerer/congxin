/**
 * 语气冒烟测试：**不消耗任何知乎额度**（只验契约层与纯逻辑）。
 *
 * 用法：
 *   node scripts/smoke-tone.js
 *
 * 验四件事：
 *   1. 默认语气是 gentle（用户 2026-11-18 拍板，改了要过自检第 13 项）
 *   2. 未知语气回落到默认，**不报错**
 *   3. 每个语气都带全部 13 个 key，一个不缺
 *   4. 台词里没有数字结论（数字归数据陈述，不归台词）
 */

import { loadTone } from '../src/tone.js';
import { resolveTone, line, petLines, toneList, toneCatalog } from '../src/services/tone.js';

const problems = [];
const ok = (label) => console.log(`✅ ${label}`);
const info = (label, value) => console.log(`   ${label}: ${value}`);
const fail = (label) => {
  problems.push(label);
  console.log(`❌ ${label}`);
};

const doc = loadTone();
const catalog = toneCatalog();

// ---------------------------------------------------------------- 1. 默认语气
if (doc.default === 'gentle') ok('默认语气是 gentle');
else fail(`默认语气不是 gentle（实际 ${doc.default}）——用户拍板过，不许改`);

const defaultOption = catalog.options.find((o) => o.is_default);
if (defaultOption?.id === 'gentle') ok('options 里 gentle 标了 is_default');
else fail(`options 里没有 gentle 标 is_default（实际 ${defaultOption?.id ?? '无'}）`);

// ---------------------------------------------------------------- 2. 回落
const fallback = resolveTone('根本不存在的语气');
if (fallback.id === 'gentle') ok('未知语气回落到 gentle，不报错');
else fail(`未知语气回落到了 ${fallback.id}`);

const nullish = resolveTone(undefined);
if (nullish.id === 'gentle') ok('不传语气时也回落到 gentle');
else fail(`不传语气时回落到了 ${nullish.id}`);

// ---------------------------------------------------------------- 3. key 齐全
const keys = doc.line_keys ?? [];
if (keys.length === 14) ok(`line_keys 有 14 个`);
else fail(`line_keys 数量是 ${keys.length}，应为 14`);

for (const opt of toneList()) {
  const t = resolveTone(opt.id);
  const missing = keys.filter((k) => !t.lines[k]);
  if (missing.length === 0) ok(`${opt.id} 的 14 句台词齐全`);
  else fail(`${opt.id} 缺 ${missing.join('、')}`);
}

// ---------------------------------------------------------------- 4. 台词里没有数字
for (const opt of toneList()) {
  const t = resolveTone(opt.id);
  const withDigits = keys.filter((k) => /\d/.test(t.lines[k] ?? ''));
  if (withDigits.length === 0) ok(`${opt.id} 的台词里没有数字`);
  else fail(`${opt.id} 的 ${withDigits.join('、')} 台词里带了数字——数字归数据陈述`);
}

// ---------------------------------------------------------------- 5. 状态门控
const gated = petLines('gentle', { signalCount: 3, hasFracture: true });
if (gated.fracture && !gated.insufficient) ok('信号充足时有断层句、无「不足」句');
else fail(`状态门控不对：fracture=${Boolean(gated.fracture)} insufficient=${Boolean(gated.insufficient)}`);

const scarce = petLines('gentle', { signalCount: 1, hasFracture: false });
if (!scarce.fracture && scarce.insufficient) ok('信号不足时无断层句、有「不足」句');
else fail(`状态门控不对：fracture=${Boolean(scarce.fracture)} insufficient=${Boolean(scarce.insufficient)}`);

// ---------------------------------------------------------------- 6. 两种语气说法不同、事实相同
if (line('gentle', 'mirror') !== line('lively', 'mirror')) ok('两个语气的台词确实不同');
else fail('两个语气的台词一样——语气切换没生效');

if (catalog.lines.fracture === '你不是没有体系，你是一遇任务就只做眼前那一步。') {
  ok('断层断言句是拍板的那一版（没有软化成「我们先看看这是不是」）');
} else {
  fail(`断层断言句被改过：${catalog.lines.fracture}`);
}

console.log('');
if (problems.length > 0) {
  console.error(`❌ 语气自检失败 ${problems.length} 项`);
  process.exit(1);
}
console.log('✅ 语气全链路自检通过（未消耗任何知乎额度）');
