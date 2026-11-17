/**
 * 分类回归检查：拿人工标注的基线，去比对关键词分类器的实际输出。
 *
 * **基线是谁标的**：2026-11-17，人工逐条看真实标题 + 摘要标的（不是分类器标的）。
 * **用途**：改关键词表之后跑一遍，看有没有把原来对的改错。
 * 这是 B14「分类体系必须两人一起定死」的技术兜底——口径一旦漂，这个脚本会立刻报出来。
 *
 * 用法：
 *   $env:ZHIHU_ACCESS_SECRET = "<Access Secret>"
 *   node scripts/classify-check.js
 */

import { getFavlists, getFavlistContents, getFollowees, getContents } from '../src/zhihu/endpoints.js';
import { classify } from '../src/lib/classify.js';

// ---------------------------------------------------------------- 人工标注基线
// 标注人：MCode，2026-11-17。逐条看真实标题 + 真实摘要标的。
// ⚠️ 其中 https://www.zhihu.com/answer/1267793188 标为 unknown 是**看过原文摘要之后**改的：
//    它是一条讲清明梦的个人经历分享，跟任何知识工作类别都不沾边——**硬塞才是错的**。
const FAVORITES_BASELINE = [
  { url: 'https://zhuanlan.zhihu.com/p/361291526', category: 'engineering' },
  { url: 'https://zhuanlan.zhihu.com/p/576274845', category: 'engineering' },
  { url: 'https://zhuanlan.zhihu.com/p/1910351261712233469', category: 'ecosystem' },
  { url: 'https://www.zhihu.com/answer/1267793188', category: 'unknown' },
  { url: 'https://zhuanlan.zhihu.com/p/657485511', category: 'cognition' },
  { url: 'https://zhuanlan.zhihu.com/p/550298785', category: 'tooling' },
  { url: 'https://zhuanlan.zhihu.com/p/658207974', category: 'tooling' },
  { url: 'https://zhuanlan.zhihu.com/p/626494709', category: 'tooling' },
  { url: 'https://zhuanlan.zhihu.com/p/656121301', category: 'tooling' },
];

const FOLLOWEES_BASELINE = [
  { url: 'https://www.zhihu.com/people/xiaozhongjiaoyu', category: 'engineering' },
  { url: 'https://www.zhihu.com/people/chang-zhi-yuan-19', category: 'career' },
  { url: 'https://www.zhihu.com/people/zhi-hu-ri-bao-51-41', category: 'ecosystem' },
];

// 创作（论证结构）。**n=1 的弱样本**：上游 Summary 被截断，且「痛点式」与「步骤式」同分，
// 靠数组优先级取胜。所以这条基线锁的是**当前规则的输出**，不是"客观正确结构"——
// 规则一改这里就会红，红了就是提醒人重新拍板。
const CONTENTS_BASELINE = [
  { url: 'https://www.zhihu.com/pin/2105715790947292364', category: 'problem_solution' },
];

// ---------------------------------------------------------------- 抓真实数据
async function fetchFavorites() {
  const favlists = await getFavlists(50);
  const byUrl = new Map();
  for (const fl of favlists.items) {
    const res = await getFavlistContents(String(fl.UrlToken), 50);
    for (const it of res.items) if (it.Url && !byUrl.has(it.Url)) byUrl.set(it.Url, it);
  }
  return [...byUrl.values()];
}

async function fetchFollowees() {
  const res = await getFollowees(50, 0);
  return res.items;
}

// ---------------------------------------------------------------- 比对
let failures = 0;

function check(label, rows, expectedOf, actualOf) {
  console.log(`\n=== ${label} ===`);
  for (const row of rows) {
    const expected = expectedOf(row);
    const actual = actualOf(row);
    const ok = expected === actual.id;
    if (!ok) failures += 1;
    console.log(
      `${ok ? '✅' : '❌'} ${row.title ?? row.url}\n` +
      `     期望=${expected}  实际=${actual.id}${actual.unknown ? '（未归类）' : ''}` +
      (ok ? '' : `  命中词=${JSON.stringify(actual.matchedWords)}`)
    );
  }
}

const favItems = await fetchFavorites();
const favByUrl = new Map(favItems.map((i) => [i.Url, i]));
const favRows = FAVORITES_BASELINE.map((b) => {
  const raw = favByUrl.get(b.url);
  return { ...b, title: raw?.Title ?? b.url, raw };
}).filter((r) => r.raw);

const folItems = await fetchFollowees();
const folByUrl = new Map(folItems.map((i) => [i.Url, i]));
const folRows = FOLLOWEES_BASELINE.map((b) => {
  const raw = folByUrl.get(b.url);
  return { ...b, title: raw?.Fullname ?? b.url, raw };
}).filter((r) => r.raw);

check(
  '收藏（主题分类）',
  favRows,
  (r) => r.category,
  (r) => classify({ title: r.raw.Title, summary: r.raw.Summary }, 'topic')
);

check(
  '关注（主题分类）',
  folRows,
  (r) => r.category,
  (r) => classify({ title: r.raw.Fullname, summary: r.raw.Headline }, 'topic')
);

const conRes = await getContents('all', 20, 0);
const conByUrl = new Map((conRes.items ?? []).map((i) => [i.Url, i]));
const conRows = CONTENTS_BASELINE.map((b) => {
  const raw = conByUrl.get(b.url);
  return { ...b, title: raw?.Title ?? b.url, raw };
}).filter((r) => r.raw);

check(
  '创作（论证结构）',
  conRows,
  (r) => r.category,
  (r) => classify({ title: r.raw.Title, summary: r.raw.Summary }, 'argument')
);

// ---------------------------------------------------------------- 收藏跨度
const favTimes = favItems.map((i) => Number(i.FavTime)).filter(Number.isFinite);
if (favTimes.length) {
  const earliest = Math.min(...favTimes);
  const latest = Math.max(...favTimes);
  const fmt = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  console.log('\n=== 收藏跨度 ===');
  console.log(`最早 ${fmt(earliest)} → 最晚 ${fmt(latest)}`);
  console.log(`跨度 ${Math.round((latest - earliest) / 86400)} 天，集中在 ${new Set(favTimes.map((t) => Math.floor(t / 86400))).size} 天`);
  const byDay = new Map();
  for (const t of favTimes) {
    const d = fmt(t);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  console.log('按天分布：', [...byDay.entries()].map(([d, n]) => `${d}×${n}`).join('  '));
}

console.log(`\n${failures === 0 ? '✅ 全部与人工基线一致' : `❌ ${failures} 处与人工基线不一致`}`);
process.exit(failures === 0 ? 0 : 1);
