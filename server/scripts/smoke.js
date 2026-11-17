/**
 * 冒烟测试：真调知乎，打四个接口，看结构对不对。
 *
 * 用法：
 *   $env:ZHIHU_ACCESS_SECRET = "<你的 Access Secret>"
 *   node scripts/smoke.js
 *
 * 密钥只从环境变量读，**不写进任何文件**。
 */

import { getQuota, getCollections, getFavlists, getFavlistContents, getFollowees, getContents } from '../src/zhihu/endpoints.js';
import { buildFavoritesSignal, buildFolloweesSignal, buildContentsSignal } from '../src/services/behavior.js';

const ok = (label) => console.log(`\n✅ ${label}`);
const info = (label, value) => console.log(`   ${label}: ${value}`);

try {
  const quota = await getQuota();
  ok('GET /api/v1/quota');
  info('能力数', quota.length);
  for (const q of quota) info(q.APIID, `${q.RemainingQuota}/${q.TotalQuota}`);

  const favs = await buildFavoritesSignal(50);
  ok('GET /api/behavior/favorites');
  info('收藏条数', favs.collected_count);
  info('收藏跨度（天）', favs.span?.span_days ?? '—');
  info('集中的天数', favs.span?.distinct_days ?? '—');
  info('收藏夹', favs.favlists.map((f) => `${f.title}(${f.item_count})`).join('、'));
  for (const b of favs.category_distribution) {
    info(`分类 ${b.category}`, `${b.count} 条 / ${Math.round(b.ratio * 100)}%`);
    for (const ev of b.evidence || []) info('  证据', `${ev.title} ← ${(ev.matched_words || []).join('/')}`);
  }

  const fol = await buildFolloweesSignal(50, 0);
  ok('GET /api/behavior/followees');
  info('关注人数', fol.followee_count);
  for (const b of fol.category_distribution) {
    info(`分类 ${b.category}`, `${b.count} / ${Math.round(b.ratio * 100)}%`);
  }

  const cont = await buildContentsSignal('all', 50, 0);
  ok('GET /api/behavior/contents');
  info('创作条数', cont.items.length);
  info('论证结构', cont.argument_structure?.primary ?? '（无）');
  info('样本提示', cont.argument_structure?.sample_note ?? '—');
} catch (err) {
  console.error('\n❌ 失败：', err?.message || err);
  if (err?.upstream) console.error('   上游：', err.upstream);
  process.exit(1);
}
