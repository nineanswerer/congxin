/**
 * 张力信号：自述 vs 行为 → 断层。
 *
 * 契约：POST /api/behavior/tension（见 contracts/api.json）
 *
 * ## 硬底线（D29 结论 4）
 *
 * **至少 2 个独立可用的行为信号，断层才成立。**
 * 只有 1 个时必须返回 `insufficient: true` + `insufficient_reason`，
 * `fractures` 必须是**空数组**——不许拿一个信号硬撑出断层
 * （否则产品退化成「自述 vs 自述」，跟普通 MBTI 没区别）。
 *
 * ## 判定规则（要能解释，不黑盒）
 *
 * 1. **自述侧**：用户自填的 traits 里出现「深度型」词（长期主义 / 体系化 / 系统 / 深入 / 原理…）
 *    → 说明他主张的是「先想透、再系统地做」。
 * 2. **行为侧**：收藏分布里「上手型」类目（`tooling` 工具与环境 + `engineering` 工程与方法）
 *    合计占比 —— 这两类都是「怎么立刻上手 / 怎么写对」，是**任务驱动**的证据。
 * 3. **两边对不上** → 产生断层。强度按上手型占比算。
 *
 * 规则是**关键词级的、写在代码里的**，不是模型推断 —— 19 天预算里
 * 「可解释的规则 > 不可解释的黑盒」是刻意取舍（见 docs/分类体系-B14.md §8）。
 */

import { buildFavoritesSignal, buildFolloweesSignal, buildContentsSignal } from './behavior.js';
import { loadTaxonomy } from '../taxonomy.js';
import { petLines, resolveTone } from './tone.js';

/** 深度型自述词：出现即认为"自述"主张的是长期 / 体系 / 原理层面。 */
const DEPTH_TRAIT_WORDS = [
  '长期主义', '长期', '体系化', '体系', '系统化', '系统性', '系统',
  '规划', '深入', '原理', '根本', '底层', '完整', '全局', '顶层', '深度', '闭环',
];

/** 关系型自述词：出现即认为"自述"主张的是人与关系层面。 */
const RELATION_TRAIT_WORDS = [
  '关系', '协作', '陪伴', '他人', '朋友', '团队', '同伴', '沟通', '共情', '照顾',
];

/** 上手型类目（taxonomy id）：装环境、跟教程、跟着做一遍。 */
const ACTION_CATEGORY_IDS = ['tooling', 'engineering'];

/** MBTI 认知功能的中文标签。未知维度就原样透传，不猜。 */
const DIMENSION_LABELS = {
  Fi: '内倾情感', Fe: '外倾情感',
  Si: '内倾感觉', Se: '外倾感觉',
  Ti: '内倾思维', Te: '外倾思维',
  Ni: '内倾直觉', Ne: '外倾直觉',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

/** 自述里的特质词里，命中了哪一类（深度型 / 关系型）。 */
function matchTraits(traits, words) {
  return (traits ?? []).filter((t) => {
    const s = String(t);
    return words.some((w) => s.includes(w));
  });
}

/**
 * 置信度：由**信号数量**与**样本量**共同决定。
 * 宁可低，不要装作很确定——confidence_note 会把这句话说清楚。
 */
function computeConfidence(signalCount, samples) {
  if (signalCount < 2) return 0;
  let c = 0.25 * signalCount; // 2 个信号 → 0.5；3 个 → 0.75
  const total = samples.favorites + samples.followees + samples.contents;
  if (total < 5) c *= 0.6; // 样本太少，砍一刀
  if (samples.contents > 0 && samples.contents < 2) c = Math.min(c, 0.6); // 创作只有 1 条
  return round2(Math.min(0.85, c));
}

/** 自述侧的总结句。 */
function selfSummary(selfReport) {
  const traits = (selfReport.traits ?? []).filter(Boolean);
  const parts = [];
  if (traits.length) parts.push(`自述为${traits.join('、')}`);
  if (selfReport.type) parts.push(`自报类型 ${selfReport.type}`);
  return parts.join('，') || '自述未填写特质';
}

/**
 * 构造一个断层对象（契约里的 Fracture）。
 */
function makeFracture({ id, axis, label, selfSide, behavioralSide, intensity, confidence, confidenceNote }) {
  return {
    id,
    axis,
    label,
    self_reported_side: { summary: selfSide.summary, evidence: selfSide.evidence ?? [] },
    behavioral_side: { summary: behavioralSide.summary, evidence: behavioralSide.evidence ?? [] },
    intensity: round2(intensity),
    confidence: round2(confidence),
    confidence_note: confidenceNote,
  };
}

/**
 * 收集三个行为信号，并判断哪些**独立可用**。
 *
 * @returns {{signals: Array, samples: object, warnings: string[]}}
 */
async function collectSignals(limit) {
  const [fav, fol, con] = await Promise.all([
    buildFavoritesSignal(limit),
    buildFolloweesSignal(limit, 0),
    buildContentsSignal('all', limit, 0),
  ]);

  const signals = [];
  const warnings = [];
  if (!fav.empty) signals.push({ id: 'favorites', data: fav });
  if (!fol.empty) signals.push({ id: 'followees', data: fol });
  if (!con.empty) signals.push({ id: 'contents', data: con });

  if (con.empty) warnings.push('content_signal_unavailable');
  if (fav.empty && fol.empty) warnings.push('no_behavior_signal');

  return {
    signals,
    warnings,
    fav,
    fol,
    con,
    samples: {
      favorites: fav.collected_count ?? 0,
      followees: fol.followee_count ?? 0,
      contents: con.items?.length ?? 0,
    },
  };
}

/**
 * 主入口。
 * @param {{type?:string, dimension_scores?:object, traits?:string[]}} selfReport
 * @param {{limit?:number, tone?:string}} options `tone` 决定桌宠台词的口语度（默认温和陪伴）
 */
export async function buildTension(selfReport, { limit = 20, tone } = {}) {
  const taxonomy = loadTaxonomy();
  const toneId = resolveTone(tone).id;

  // 分类分布里只有**类目名**（`category`），没有 id —— 所以要靠 taxonomy 把 id 翻成名字。
  const nameOf = (ids) =>
    new Set(
      taxonomy.topic_categories.categories
        .filter((c) => ids.includes(c.id))
        .map((c) => c.name)
    );
  const actionCategoryNames = nameOf(ACTION_CATEGORY_IDS);
  const infoCategoryNames = nameOf(['ecosystem', 'tooling']);

  const report = selfReport ?? {};
  const traits = Array.isArray(report.traits) ? report.traits.filter(Boolean) : [];

  const { signals, warnings, fav, fol, con, samples } = await collectSignals(limit);
  const signalCount = signals.length;

  // ---- 自述侧（契约要求 dimensions 数组） ----
  const dimensions = Object.entries(report.dimension_scores ?? {}).map(([dimension, score]) => ({
    dimension,
    score: round2(Number(score) || 0),
    label: DIMENSION_LABELS[dimension] ?? dimension,
  }));

  const selfReported = {
    type: report.type ?? null,
    dimensions,
  };

  // ---- 行为侧：优先用收藏（信号更丰富），收藏为空则退回关注 ----
  const primary = !fav.empty ? fav : !fol.empty ? fol : null;
  const behavioral = {
    categories: primary?.category_distribution ?? [],
    focus: primary?.focus?.summary ?? null,
  };

  const empty = signalCount === 0;

  // ---- 信号不足：照实说不足，不硬撑 ----
  if (signalCount < 2) {
    const names = { favorites: '收藏', followees: '关注', contents: '创作' };
    const have = signals.map((s) => names[s.id]).join('、') || '一个都没有';
    const missing = Object.entries(names)
      .filter(([k]) => !signals.some((s) => s.id === k))
      .map(([, v]) => v);
    return {
      has_tension: false,
      available_signals: signals.map((s) => s.id),
      signal_count: signalCount,
      insufficient: true,
      insufficient_reason:
        `只读到 ${signalCount} 个独立行为信号（${have}）。` +
        `至少需要 2 个，断层才成立——否则这只是「自述 vs 自述」。` +
        (missing.length ? `还缺：${missing.join('、')}。` : ''),
      self_reported: selfReported,
      behavioral,
      fractures: [],
      bridge_hint: null,
      tone: toneId,
      pet_lines: petLines(toneId, { signalCount, hasFracture: false, insufficient: true }),
      empty,
      empty_notice: empty
        ? '没有读到任何知乎行为信号。授权知乎账号后再来看看。'
        : null,
      warnings: [...warnings, 'insufficient_signals'],
    };
  }

  // ---- 置信度与说明 ----
  const confidence = computeConfidence(signalCount, samples);
  const signalNames = { favorites: '收藏', followees: '关注', contents: '创作' };
  const usedNames = signals.map((s) => signalNames[s.id]).join('、');
  const notes = [`由 ${signalCount} 个信号推断（${usedNames}）。`];
  notes.push(`收藏 ${samples.favorites} 条、关注 ${samples.followees} 个、创作 ${samples.contents} 条。`);
  if (samples.contents > 0 && samples.contents < 2) {
    notes.push('创作只有 1 条，样本太少，没有参与判断。');
  }
  if (fav.span && fav.span.distinct_days > 0 && fav.span.distinct_days <= 12) {
    notes.push(
      `收藏跨度 ${fav.span.span_days} 天但只集中在 ${fav.span.distinct_days} 天，是任务驱动型收藏——` +
        '所以这个结论对「你在任务里怎么做事」解释力强，对「你平时怎么想」解释力弱。'
    );
  }

  // ---- 断层 1：自述（深度型） vs 收藏（上手型） ----
  const fractures = [];
  const depthHits = matchTraits(traits, DEPTH_TRAIT_WORDS);
  const relationHits = matchTraits(traits, RELATION_TRAIT_WORDS);

  if (!fav.empty && depthHits.length > 0) {
    const total = fav.collected_count;
    const actionCount = (fav.category_distribution ?? [])
      .filter((c) => actionCategoryNames.has(c.category))
      .reduce((acc, c) => acc + (c.count ?? 0), 0);

    if (actionCount > 0 && actionCount / total >= 0.5) {
      const ratio = actionCount / total;
      const evidence = (fav.category_distribution ?? [])
        .filter((c) => actionCategoryNames.has(c.category))
        .flatMap((c) => (c.evidence ?? []).slice(0, 2));

      fractures.push(
        makeFracture({
          id: 'frac_01',
          axis: 'self_reported_vs_favorites',
          label:
            `你说你重「${depthHits[0]}」，但你收藏的 ${pct(actionCount, total)}（${actionCount}/${total} 条）` +
            '是「怎么立刻上手」——装环境、跟教程、跟着做一遍。',
          selfSide: { summary: selfSummary(report), evidence: [] },
          behavioralSide: {
            summary:
              `收藏里排前两类的 ${actionCount} 条（工具与环境 + 工程与方法）都属于上手型；` +
              (fav.span ? `跨度 ${fav.span.span_days} 天却只集中在 ${fav.span.distinct_days} 天。` : ''),
            evidence,
          },
          intensity: Math.min(0.95, ratio),
          confidence,
          confidenceNote: notes.join(''),
        })
      );
    }
  }

  // ---- 断层 2：自述（关系型） vs 关注（资讯/工具型） ----
  if (!fol.empty && relationHits.length > 0) {
    const dist = fol.category_distribution ?? [];
    const nonRelation = dist.filter((c) => infoCategoryNames.has(c.category));
    const ratio = nonRelation.length
      ? nonRelation.reduce((a, c) => a + (c.count ?? 0), 0) / (fol.followee_count || 1)
      : 0;

    if (ratio >= 0.5) {
      const evidence = nonRelation.flatMap((c) => (c.evidence ?? []).slice(0, 2));
      fractures.push(
        makeFracture({
          id: `frac_0${fractures.length + 1}`,
          axis: 'self_reported_vs_followees',
          label:
            `你说你重「${relationHits[0]}」，但你关注的 ${pct(Math.round(ratio * (fol.followee_count || 0)), fol.followee_count)}` +
            '是资讯与工具类账号。',
          selfSide: { summary: selfSummary(report), evidence: [] },
          behavioralSide: {
            summary: `关注的 ${fol.followee_count} 个人里，没有一个落在关系/陪伴类。`,
            evidence,
          },
          intensity: Math.min(0.9, ratio),
          confidence,
          confidenceNote: notes.join(''),
        })
      );
    }
  }

  // ---- 断层 3：自述（想输出） vs 创作（几乎没有） ----
  const outputTraits = matchTraits(traits, ['写', '输出', '表达', '创作', '分享', '记录', '产出']);
  if (!con.empty && samples.contents < 2 && outputTraits.length > 0) {
    fractures.push(
      makeFracture({
        id: `frac_0${fractures.length + 1}`,
        axis: 'self_reported_vs_contents',
        label: `你说你${outputTraits[0]}，但知乎上只有 ${samples.contents} 条公开创作。`,
        selfSide: { summary: selfSummary(report), evidence: [] },
        behavioralSide: {
          summary: `公开创作 ${samples.contents} 条，样本太少，结论仅供参考。`,
          evidence: (con.items ?? []).slice(0, 2).map((it) => ({
            title: it.title ?? null,
            url: it.url,
            headline: null,
          })),
        },
        intensity: 0.5,
        confidence: Math.min(confidence, 0.6),
        confidenceNote: `${notes.join('')}创作样本只有 ${samples.contents} 条，这条断层的置信度已单独压低。`,
      })
    );
  }

  const hasTension = fractures.length > 0;

  return {
    has_tension: hasTension,
    available_signals: signals.map((s) => s.id),
    signal_count: signalCount,
    insufficient: false,
    insufficient_reason: null,
    self_reported: selfReported,
    behavioral,
    fractures,
    bridge_hint: hasTension
      ? `答下面这道题，能看出你在「${traits[0] ?? '你的说法'}」和「你实际在做的事」之间先顾哪一个。`
      : null,
    tone: toneId,
    pet_lines: petLines(toneId, { signalCount, hasFracture: hasTension, insufficient: false }),
    empty: false,
    empty_notice: null,
    warnings,
    _taxonomy_version: taxonomy.version,
  };
}
