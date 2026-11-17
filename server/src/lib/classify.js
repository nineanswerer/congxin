/**
 * 分类器：按 contracts/taxonomy.json 的关键词规则把一条知乎内容归到某一类。
 *
 * 规则（契约层写死，后端不改）：
 *   - 标题命中一个关键词记 2 分，摘要命中记 1 分，同一关键词不重复叠加
 *   - 分数 < threshold 落 unknown，**绝不硬塞**
 *   - 分数相同按 categories 数组顺序取先者
 *
 * **返回里必须带证据**（命中了哪些词 + 原文 URL）——分类不能是黑盒断言。
 */

import { loadTaxonomy } from '../taxonomy.js';

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * 给一段文本打分，返回 [{ category, score, matchedWords }]
 */
function scoreAll(texts, categories, weights) {
  const results = [];
  for (const cat of categories) {
    let score = 0;
    const matched = new Set();
    for (const kw of cat.keywords) {
      let hits = 0;
      for (const slot of texts) {
        hits += countOccurrences(slot.text, kw) * (slot.weight ?? 1);
      }
      if (hits > 0) {
        score += hits;
        matched.add(kw);
      }
    }
    results.push({ category: cat, score, matchedWords: [...matched] });
  }
  return results;
}

/**
 * 主入口：给一个内容条目分类。
 * @param {{title?:string, summary?:string}} item
 * @param {'topic'|'argument'} kind
 * @returns {{id:string, name:string, score:number, matchedWords:string[], unknown:boolean}}
 */
export function classify(item, kind = 'topic') {
  const taxonomy = loadTaxonomy();
  const isArgument = kind === 'argument';
  const group = isArgument ? taxonomy.argument_structures : taxonomy.topic_categories;
  const categories = isArgument ? group.structures : group.categories;
  const weights = taxonomy.matching.scoring;

  const title = (item.title || '').toLowerCase();
  const summary = (item.summary || '').toLowerCase();

  const scored = scoreAll(
    [
      { text: title, weight: weights.title_weight },
      { text: summary, weight: weights.summary_weight },
    ],
    categories,
    weights
  );

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a), { category: null, score: 0, matchedWords: [] });

  if (!best.category || best.score < taxonomy.matching.threshold) {
    const unknown = taxonomy.matching.unknown;
    return {
      id: unknown.id,
      name: unknown.name,
      score: best.score,
      matchedWords: [],
      unknown: true,
      tied_with: [],
    };
  }

  // 同分的其它类：赢家只是**数组顺序**的产物，这是弱结论，前端要能说出来。
  const tiedWith = scored
    .filter((s) => s.score === best.score && s.score > 0 && s.category.id !== best.category.id)
    .map((s) => s.category.name);

  return {
    id: best.category.id,
    name: best.category.name,
    score: best.score,
    matchedWords: best.matchedWords,
    unknown: false,
    tied_with: tiedWith,
  };
}

/**
 * 把一组条目聚成分类分布（含占比与证据）。
 * @param {Array} items 已归一化的条目
 * @param {'topic'|'argument'} kind
 */
export function distribution(items, kind = 'topic') {
  const taxonomy = loadTaxonomy();
  const group = kind === 'argument' ? taxonomy.argument_structures : taxonomy.topic_categories;
  const categories = kind === 'argument' ? group.structures : group.categories;

  const buckets = new Map();
  for (const cat of categories) {
    buckets.set(cat.id, { category: cat.name, count: 0, score: 0, tied_with: [], evidence: [] });
  }
  const unknownBucket = { category: taxonomy.matching.unknown.name, count: 0, score: 0, tied_with: [], evidence: [] };

  for (const item of items) {
    const c = classify(item, kind);
    const target = c.unknown ? unknownBucket : buckets.get(c.id);
    if (!target) continue;
    target.count += 1;
    // score = 该类里单条内容的**最高命中分**。前端要靠它判断 primary 是不是"压倒性"的：
    // 跟第二名同分说明这只是弱结论，不能装作很确定。
    if (c.score > target.score) target.score = c.score;
    for (const name of c.tied_with ?? []) {
      if (!target.tied_with.includes(name)) target.tied_with.push(name);
    }
    if (target.evidence.length < 5) {
      const ev = {
        title: item.title ?? null,
        name: item.name ?? null,
        url: item.url,
        headline: item.headline ?? null,
      };
      if (c.matchedWords.length > 0) ev.matched_words = c.matchedWords;
      target.evidence.push(ev);
    }
  }

  const total = items.length || 1;
  const out = [];
  for (const b of buckets.values()) {
    if (b.count === 0) continue;
    out.push({
      category: b.category,
      count: b.count,
      ratio: Math.round((b.count / total) * 100) / 100,
      score: b.score,
      tied_with: b.tied_with,
      evidence: b.evidence,
    });
  }
  if (unknownBucket.count > 0) {
    out.push({
      category: unknownBucket.category,
      count: unknownBucket.count,
      ratio: Math.round((unknownBucket.count / total) * 100) / 100,
      score: unknownBucket.score,
      tied_with: unknownBucket.tied_with,
      evidence: unknownBucket.evidence,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
