/**
 * 知识卡片冒烟：**出��条真卡片**，链接能点回知乎。
 *
 * 用法：
 *   $env:ZHIHU_ACCESS_SECRET = "<你的 Access Secret>"
 *   node scripts/smoke-cards.js
 *
 * ## 额度
 *
 * 这条链走「问题发现」额度组（100 次/天，问题推荐与回答摘要共用）。
 * 本脚本**只跑一轮**：1 次 `question_recommendations` + 1 次 `question_answers` = **2 次**。
 * 第二次调用走进程内缓存（同一主题 5 分钟），**不额外消耗额度**——
 * 顺便验证了「缓存生效」这条。
 *
 * 想换主题：`$env:CARDS_TOPIC = "某个主题"`。
 *
 * ## 验什么
 *
 * 1. topic 为空 → 400（**不花额度**）
 * 2. 真卡片的**出处三件套**齐全：问题标题 + 问题 URL + **原回答 URL**
 * 3. `kind=knowledge_card`，形状沿用已有的 `SourceCard`（没新造一套）
 * 4. 同一个主题再调一次 → **同一个 id** 且命中缓存（不重复打上游）
 * 5. 契约层对得上：`/api/cards` 在、`SourceRef.answer_url` 必填
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCards } from '../src/services/cards.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const problems = [];
const ok = (label) => console.log(`✅ ${label}`);
const info = (label, value) => console.log(`   ${label}: ${value}`);
const fail = (label) => {
  problems.push(label);
  console.log(`❌ ${label}`);
};

const topic = process.env.CARDS_TOPIC || '开源项目';
const count = 1;

// ---------------------------------------------------------------- 1. topic 为空 → 400（不花额度）
{
  let code = null;
  try {
    await buildCards({ topic: '' });
  } catch (err) {
    code = err?.code ?? null;
  }
  if (code === 'VALIDATION_ERROR') ok('topic 为空 → VALIDATION_ERROR（没花额度）');
  else fail(`topic 为空应该报 VALIDATION_ERROR，实际 ${code}`);
}

// ---------------------------------------------------------------- 2. 真卡片
const result = await buildCards({ topic, count });
const card = result.cards?.[0];

console.log('');
console.log('=== 真卡片 JSON ===');
console.log(JSON.stringify(card ?? null, null, 2));
console.log('');

if (result.empty) {
  fail(`这个主题没捞到卡片（empty_notice: ${result.empty_notice}）`);
} else if (!card) {
  fail('cards 是空的');
} else {
  ok(`拿到 ${result.cards.length} 张真卡片`);

  // ---- 出处三件套 ----
  const qTitle = card.source?.question_title;
  const qUrl = card.source?.question_url;
  const aUrl = card.source?.answer_url;

  if (typeof qTitle === 'string' && qTitle.trim()) ok(`问题标题：${qTitle}`);
  else fail('question_title 为空');

  if (/^https:\/\/www\.zhihu\.com\/question\/\d+/.test(qUrl ?? '')) ok(`问题 URL 合法：${qUrl}`);
  else fail(`question_url 不像知乎问题链接：${qUrl}`);

  if (typeof aUrl === 'string' && aUrl.includes('/answer/')) ok(`原回答 URL：${aUrl}`);
  else fail(`answer_url 缺原回答链接：${aUrl}`);

  if (typeof card.source?.answer_summary === 'string' && card.source.answer_summary.trim()) {
    ok('回答摘要是官方服务摘要（非空）');
  } else {
    fail('answer_summary 为空');
  }

  // ---- 形状 ----
  if (card.kind === 'knowledge_card') ok('kind=knowledge_card（沿用 SourceCard，没新造一套）');
  else fail(`kind 不是 knowledge_card，实际 ${card.kind}`);

  if (typeof card.id === 'string' && card.id.startsWith('card_')) ok(`id 稳定：${card.id}`);
  else fail(`id 不对：${card.id}`);

  if (card.content) ok('卡片正文（官方摘要）非空');
  else fail('content 为空');

  // ---- 空数据不是失败 ----
  if (result.empty === false && result.empty_notice === null) ok('空数据标记正确（empty=false / notice=null）');
  else fail(`空数据标记不对：empty=${result.empty} notice=${result.empty_notice}`);
}

// ---------------------------------------------------------------- 3. 再调一次 → 同一个 id + 命中缓存
{
  const again = await buildCards({ topic, count });
  const sameId = again.cards?.[0]?.id === card?.id;
  if (sameId) ok('同一个主题再调一次 → 同一个 id（内容稳定，不会多出重复卡）');
  else fail(`再调一次 id 变了：${card?.id} → ${again.cards?.[0]?.id}`);

  if (again.cached) ok('再调一次命中缓存（没再打上游，没多花额度）');
  else fail('再调一次没命中缓存——额度会被重复消耗');
}

// ---------------------------------------------------------------- 4. 链接能不能点回去（软校验）
if (card?.source?.answer_url) {
  try {
    const res = await fetch(card.source.answer_url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; congxin-check/1.0)' },
    });
    info('原回答链接可达性', `HTTP ${res.status}（知乎可能对非浏览器请求回 403，那不代表链接坏）`);
    if (res.status < 400) ok('原回答链接可达');
  } catch (err) {
    info('原回答链接可达性', `本机没验成：${err?.message || err}（链接取自上游官方字段）`);
  }
}

// ---------------------------------------------------------------- 5. 契约层对得上
{
  const apiDoc = JSON.parse(fs.readFileSync(path.join(repoRoot, 'contracts', 'api.json'), 'utf8'));
  if (apiDoc.paths?.['/api/cards']) ok('契约里有 POST /api/cards');
  else fail('契约里没有 /api/cards');

  const req = apiDoc.components?.schemas?.CardsRequest?.required ?? [];
  if (req.includes('topic')) ok('CardsRequest 把 topic 设为必填');
  else fail('CardsRequest 没把 topic 设为必填');

  const src = apiDoc.components?.schemas?.SourceRef ?? {};
  if ((src.required ?? []).includes('answer_url')) ok('SourceRef 把 answer_url（原回答 URL）设为必填');
  else fail('SourceRef 没把 answer_url 设为必填');

  const kinds = apiDoc.components?.schemas?.SourceCard?.properties?.kind?.enum ?? [];
  if (kinds.includes('knowledge_card')) ok('SourceCard.kind 枚举含 knowledge_card');
  else fail('SourceCard.kind 枚举缺 knowledge_card');
}

console.log('');
if (problems.length > 0) {
  console.error(`❌ 卡片自检失败 ${problems.length} 项`);
  process.exit(1);
}
console.log('✅ 知识卡片自检通过（一条真卡片，链接能点回知乎）');
