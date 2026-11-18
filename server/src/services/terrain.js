/**
 * 三层认知地形。
 *
 * 契约：GET /api/terrain、POST /api/terrain/answer
 *
 * ## 分工（D29 结论 6）
 *
 * **后端只给参数**（归一化坐标、高度、强度、置信度），**前端负责渲染**。
 * 前端用 SVG + CSS `perspective` 画 2.5D 分层地图，断层特写处用 Three.js 做一次推镜，
 * 落点就是 `fractures[].axis_x` / `axis_y`。
 *
 * ## 三层是什么
 *
 * | 层 | 来源 | 块类型 |
 * | --- | --- | --- |
 * | 说的你 | 前端问卷算出的自述 | `core` |
 * | 做的你 | 知乎收藏/关注/创作的分类分布 | `observed` |
 * | 情境下的你 | 答完情境题长出来的 | `grown` |
 *
 * ## 诚实边界
 *
 * - **缺哪层就写哪层空**，不拿假地形填坑（`empty_notice` 说明缺什么）。
 * - **断层来自 `buildTension`**，本模块只负责把它摆到平面上、算出 3D 推镜的落点。
 * - **桥 = 一致的地方**。「认清」不只是看到不一致，也要看到自己身上确实稳的那部分。
 */

import { buildTension } from './tension.js';
import { findQuestion, listAnswers, rememberAnswer, getSelfReport } from '../session.js';
import { ApiError } from '../lib/errors.js';

const DIMENSION_LABELS = {
  Fi: '内倾情感', Fe: '外倾情感',
  Si: '内倾感觉', Se: '外倾感觉',
  Ti: '内倾思维', Te: '外倾思维',
  Ni: '内倾直觉', Ne: '外倾直觉',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 稳定散列：同一个字符串永远落到同一个坐标，地图不会每次刷新都跳。 */
function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * 自述层 → 块。
 */
function buildSelfLayer(selfReport) {
  const blocks = [];
  const dims = Object.entries(selfReport?.dimension_scores ?? {});
  const total = Math.max(dims.length, 1);

  dims.forEach(([dimension, score], i) => {
    const s = round2(Number(score) || 0);
    blocks.push({
      id: `blk_s${i + 1}`,
      kind: 'core',
      label: DIMENSION_LABELS[dimension] ?? dimension,
      dimension,
      summary: `自述里「${DIMENSION_LABELS[dimension] ?? dimension}」的强度是 ${s}`,
      position: { x: round2((i + 1) / (total + 1)), y: 0.5 },
      height: s,
    });
  });

  const traits = (selfReport?.traits ?? []).filter(Boolean);
  if (traits.length) {
    blocks.push({
      id: 'blk_strait',
      kind: 'core',
      label: traits.join(' · '),
      dimension: null,
      summary: '你自己写的特质词',
      position: { x: 0.5, y: 0.22 },
      height: 0.55,
    });
  }

  return {
    label: '说的你',
    type: selfReport?.type ?? null,
    blocks,
  };
}

/**
 * 行为层 → 块（收藏分类分布 + 收藏跨度）。
 */
function buildBehavioralLayer(tension) {
  const blocks = [];
  const cats = tension.behavioral?.categories ?? [];
  const total = Math.max(cats.length, 1);

  cats.forEach((c, i) => {
    blocks.push({
      id: `blk_b${i + 1}`,
      kind: 'observed',
      label: c.category,
      dimension: null,
      summary: `收藏里占 ${Math.round((c.ratio ?? 0) * 100)}%（${c.count} 条）`,
      position: { x: round2((i + 1) / (total + 1)), y: 0.5 },
      height: round2(c.ratio ?? 0),
    });
  });

  return { label: '做的你', type: null, blocks };
}

/**
 * 情境层 → 块（答完情境题长出来的）。
 */
function buildSituationalLayer(sessionId) {
  const blocks = [];
  const answers = listAnswers(sessionId);
  answers.forEach((a, i) => {
    if (!a.block) return;
    blocks.push({
      id: a.block.id,
      kind: 'grown',
      label: a.block.label,
      dimension: a.block.dimension ?? null,
      summary: a.block.summary,
      question_id: a.block.question_id ?? null,
      position: a.block.position,
      height: a.block.height,
    });
  });
  return { label: '情境下的你', type: null, blocks };
}

/**
 * 把张力层的断层摆到平面上，并算出 3D 推镜的落点。
 *
 * `axis_x` 取**行为侧那个块的横坐标**——断层特写要正好推到这个块上。
 */
function buildFractureMarks(tension, behavioralLayer) {
  const marks = [];
  for (const f of tension.fractures ?? []) {
    // 断层特写要推在行为层的那一块上
    const anchor = behavioralLayer.blocks[0];
    marks.push({
      id: f.id,
      from_layer: 'self_reported',
      to_layer: 'behavioral',
      label: f.label,
      axis_x: anchor ? anchor.position.x : 0.5,
      axis_y: 0.5,
      intensity: f.intensity,
      confidence: f.confidence,
      confidence_note: f.confidence_note,
    });
  }
  return marks;
}

/**
 * 桥 = 一致的地方。
 *
 * 规则：情境题对焦的维度如果出现在自述里 → 自述块与新长出的块之间连一条桥。
 */
function buildBridges(selfLayer, situLayer) {
  const bridges = [];
  situLayer.blocks.forEach((g, i) => {
    if (!g.dimension) return;
    const match = selfLayer.blocks.find((s) => s.dimension === g.dimension);
    if (!match) return;
    bridges.push({
      id: `bridge_${i + 1}`,
      links: [match.id, g.id],
      label: `这道题答出了你自述里的${DIMENSION_LABELS[g.dimension] ?? g.dimension}`,
    });
  });
  return bridges;
}

/**
 * 组装完整地形。
 *
 * @param {object} selfReport
 * @param {{sessionId?:string, includeGeometry?:boolean}} options
 */
export async function buildTerrain(selfReport, { sessionId = 'dev', includeGeometry = true } = {}) {
  const tension = await buildTension(selfReport ?? {}, { limit: 20 });

  const selfLayer = buildSelfLayer(selfReport);
  const behavioralLayer = buildBehavioralLayer(tension);
  const situLayer = buildSituationalLayer(sessionId);

  const fractures = buildFractureMarks(tension, behavioralLayer);
  const bridges = buildBridges(selfLayer, situLayer);

  const layers = {
    self_reported: selfLayer,
    behavioral: behavioralLayer,
    situational: situLayer,
  };

  // 缺哪层就写明缺哪层，**不用假地形填坑**
  const missing = [];
  if (!selfLayer.blocks.length) missing.push('说的你（还没有自述）');
  if (!behavioralLayer.blocks.length) missing.push('做的你（还没读到知乎行为数据）');
  if (!situLayer.blocks.length) missing.push('情境下的你（还没答过情境题）');

  const strip = (layer) => {
    if (includeGeometry) return layer;
    return { ...layer, blocks: layer.blocks.map((b) => ({ ...b, position: undefined })) };
  };

  return {
    layers: {
      self_reported: strip(selfLayer),
      behavioral: strip(behavioralLayer),
      situational: strip(situLayer),
    },
    fractures,
    bridges,
    empty: missing.length === 3,
    empty_notice: missing.length
      ? `这层还是空的：${missing.join('、')}。缺的部分不会用假数据补上。`
      : null,
    _tension: {
      has_tension: tension.has_tension,
      signal_count: tension.signal_count,
      insufficient: tension.insufficient,
      insufficient_reason: tension.insufficient_reason,
    },
  };
}

/**
 * 提交作答 → 地形长出一块。
 *
 * @param {{sessionId:string, questionId:string, answerKey?:string, freeText?:string}} input
 */
export async function applyTerrainAnswer({ sessionId = 'dev', questionId, answerKey = null, freeText = null }) {
  const qid = String(questionId ?? '');
  const question = findQuestion(sessionId, qid);
  if (!question) {
    throw new ApiError('QUESTION_NOT_FOUND', 'question_id 不在当前会话里', {
      userHint: '这道题已经失效了，重新出一道吧',
      detail: `question_id=${qid}`,
    });
  }

  const key = answerKey != null ? String(answerKey).trim().toUpperCase() : null;
  const chosen = key && Array.isArray(question.options)
    ? question.options.find((o) => o.key === key) ?? null
    : null;

  if (key && !chosen && Array.isArray(question.options) && question.options.length > 0) {
    throw new ApiError('VALIDATION_ERROR', 'answer_key 不在选项里', {
      userHint: '这个选项不在题目里，重新选一个',
      detail: `answer_key=${key}`,
    });
  }

  // 回答摘要：**只如实转述用户选了什么/写了什么**，不做心理解释。
  let summary;
  if (chosen) summary = `你选了「${chosen.label}」。`;
  else if (freeText && String(freeText).trim()) summary = `你写的是「${String(freeText).trim()}」。`;
  else summary = '你跳过了这道题——这也是一种回答。';

  // 坐标：由 question_id 稳定散列出来，**每次刷新地图不会跳**
  const hx = hashUnit(qid);
  const hy = hashUnit(`${qid}#y`);
  const position = { x: round2(0.2 + hx * 0.6), y: round2(0.3 + hy * 0.4) };
  const height = round2(0.25 + hashUnit(`${qid}#h`) * 0.2);

  const block = {
    id: `blk_n_${qid.slice(-6)}`,
    kind: 'grown',
    label: question.title ?? question.stem?.slice(0, 24) ?? '情境题',
    dimension: question.targets?.dimension ?? null,
    summary,
    question_id: qid,
    position,
    height,
  };

  rememberAnswer(sessionId, qid, {
    answer_key: key,
    free_text: freeText ? String(freeText).slice(0, 2000) : null,
    block,
    answered_at: Math.floor(Date.now() / 1000),
  });

  // 重新组装地形，然后算出这次新增的块与桥
  const selfReport = getSelfReport(sessionId);
  const terrain = await buildTerrain(selfReport, { sessionId });

  const newBridges = terrain.bridges.filter((b) => b.links.includes(block.id));

  // 「情境里露出的一面，自述里没有」→ 这是一个新的断层（诚实：只说维度对不上，不猜心理）
  const newFractures = [];
  const selfDims = new Set(
    Object.keys(selfReport?.dimension_scores ?? {})
  );
  if (block.dimension && selfDims.size > 0 && !selfDims.has(block.dimension)) {
    newFractures.push({
      id: `frac_situ_${qid.slice(-6)}`,
      from_layer: 'behavioral',
      to_layer: 'situational',
      label: `你在情境里露出的是「${DIMENSION_LABELS[block.dimension] ?? block.dimension}」这一面，自述里没有。`,
      axis_x: position.x,
      axis_y: position.y,
      intensity: 0.6,
      confidence: 0.4,
      confidence_note:
        '由 1 次作答推出来的，样本极小。这条断层只能当作"值得再看一眼的线索"，不是结论。',
    });
  }

  return {
    updated: true,
    block,
    new_fractures: newFractures,
    new_bridges: newBridges,
    terrain,
    empty: false,
    empty_notice: null,
  };
}
