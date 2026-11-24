#!/usr/bin/env node
/**
 * P3 闭环回归 —— 按 5 分钟 Demo 脚本的顺序，把主流程**通过 HTTP**走一遍，
 * 每拍打印「期望 / 实际 / 判定」，最后给一张逐拍对照清单。
 *
 * ## 为什么要有这个
 *
 *   浏览器里手点一遍很好，但**没法重复、没法逐条比对**；
 *   明早额度满额后要验的就是「P3 能不能收口」，
 *   这条命令把「人肉点」变成「跑一条命令看结果」。
 *
 * ## 它验什么
 *
 *   不是「接口通不通」（那太浅），而是**台上要出现的那些东西在不在**：
 *   9 条真实收藏、3 张带出处真卡、同题两答、
 *   「问它」：一句真问题 → 知乎相似困境 → 适用性判断 → 能照着做的方案 → 每一步都能指回知乎原文、
 *   语气 14 句、错误信封有中文提示，
 *   以及**认知闭环那批接口确实下线了**（打过去必须是 404）。
 *
 * ## 额度
 *
 *   ⚠️ **会烧知乎额度**：
 *      - 完整跑一次 ≈ **1 次知乎搜索（5000/天）** + **1 次直答（100/天）**（+ 卡片那几步的上游）
 *      - 每日 00:00 重置、不结转。**跑之前先看额度。**
 *      - 命中 5 分钟缓存的步骤会标 `cached`，**不烧**。
 *   `--light` 只跑不烧额度的部分（收藏 / 关注 / 创作 / 语气 / 额度 / 登录态 / 错误信封 / 下线接口）。
 *
 * 用法：
 *   node scripts/regress-p3.js                # 完整跑
 *   node scripts/regress-p3.js --light        # 只跑不烧额度的部分
 *   node scripts/regress-p3.js --base http://localhost:18787
 */

const args = process.argv.slice(2);
const light = args.includes('--light');
const baseIndex = args.indexOf('--base');
const BASE = (baseIndex > -1 ? args[baseIndex + 1] : process.env.REGRESS_BASE) || 'http://localhost:18787';

/** 回归用的会话 id —— 免得跟别的会话的问卷/作答串味。 */
const SESSION = 'regress-p3';

/** 「问它」回归用的问题 —— 跟 Demo 脚本同一个，出来的东西台上能直接讲。 */
const QUESTION = process.env.REGRESS_QUESTION || '工作压力大到睡不着怎么办';

const results = [];

/** 记录一拍。expect 是给人看的期望，actual 是实际拿到的，pass 是判定。 */
function step(beat, what, expect, actual, pass) {
  results.push({ beat, what, expect, actual, pass });
  const mark = pass === null ? '·' : pass ? '✅' : '❌';
  console.log(`\n${mark} [${beat}] ${what}`);
  console.log(`   期望：${expect}`);
  console.log(`   实际：${actual}`);
}

/** 打一个 HTTP 请求；非 2xx 也不抛，返回 { status, body }。 */
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-session-id': SESSION,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** 读额度里某一项的 remaining。 */
function quotaOf(quotaJson, apiId) {
  const list = quotaJson?.data?.apis ?? [];
  const hit = list.find((a) => a.api_id === apiId);
  return hit ? hit.remaining : null;
}

/** 知乎域名（含 zhuanlan）—— 出处必须是它，否则就是编的。 */
const isZhihuUrl = (u) => /^https?:\/\/([\w-]+\.)*zhihu\.com\//.test(String(u ?? ''));

const brief = (s, n = 60) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

console.log(`=== P3 闭环回归 · ${BASE} · ${light ? '轻量（不烧额度）' : '完整'} ===`);

// ---------------------------------------------------------------- 额度（跑之前）
const quotaBefore = await call('GET', '/api/quota');
if (quotaBefore.status === 200) {
  console.log(
    `额度快照：知乎搜索剩 ${quotaOf(quotaBefore.json, 'zhihu_search')}/5000` +
      ` ｜ 直答剩 ${quotaOf(quotaBefore.json, 'zhida_openai')}/100` +
      ` ｜ 问题发现剩 ${quotaOf(quotaBefore.json, 'question_discovery')}/100`
  );
} else {
  console.log(`⚠️ 额度接口没通（${quotaBefore.status}）—— 后端在跑吗？`);
}

// ---------------------------------------------------------------- 0:00 首屏
const fav = await call('GET', '/api/behavior/favorites');
const favData = fav.json?.data;
step(
  '0:00',
  '首屏：真实收藏',
  '200 + 9 条收藏 + 跨度 778 天 / 集中在 6 天',
  fav.status === 200
    ? `${fav.status} · ${favData?.collected_count ?? '?'} 条 · 跨度 ${favData?.span?.span_days ?? '?'} 天 / 集中在 ${favData?.span?.distinct_days ?? '?'} 天`
    : `${fav.status} · ${brief(fav.json?.error?.message)}`,
  fav.status === 200 && favData?.collected_count > 0 && favData?.span?.span_days > 0
);

// ---------------------------------------------------------------- 0:15 关注 / 创作
const fol = await call('GET', '/api/behavior/followees');
const folData = fol.json?.data;
step(
  '0:15',
  '关注列表（行为信号之一）',
  '200 + 有数据',
  fol.status === 200 ? `${fol.status} · ${folData?.followee_count ?? '?'} 个关注` : `${fol.status} · ${brief(fol.json?.error?.message)}`,
  fol.status === 200 && (folData?.followee_count ?? 0) > 0
);

const cont = await call('GET', '/api/behavior/contents');
const contData = cont.json?.data;
step(
  '3:25',
  '创作信号（4:05 那句用户原话的来源）',
  '200 + 有创作内容',
  cont.status === 200 ? `${cont.status} · ${contData?.content_count ?? contData?.items?.length ?? '?'} 条` : `${cont.status} · ${brief(cont.json?.error?.message)}`,
  cont.status === 200
);

// ---------------------------------------------------------------- 语气目录
const tone = await call('GET', '/api/tone');
const toneLines = tone.json?.data?.lines ?? tone.json?.data?.catalog?.lines ?? {};
const toneCount = Object.keys(toneLines).length;
step(
  '全程',
  '语气目录（台词的唯一真源）',
  '200 + 默认 gentle + 14 句',
  tone.status === 200 ? `${tone.status} · default=${tone.json?.data?.tone ?? tone.json?.data?.default ?? '?'} · ${toneCount} 句` : `${tone.status}`,
  tone.status === 200 && toneCount >= 14
);

// ---------------------------------------------------------------- 登录态
const profile = await call('GET', '/api/auth/profile');
const profileData = profile.json?.data;
step(
  '全程',
  '登录态（不暴露真实用户数据）',
  '200 + developer_account 模式',
  profile.status === 200 ? `${profile.status} · mode=${profileData?.mode}` : `${profile.status} · ${brief(profile.json?.error?.message)}`,
  profile.status === 200 && profileData?.mode === 'developer_account'
);

// ---------------------------------------------------------------- 失败态
const missing = await call('GET', '/api/nope');
const errEnvelope = missing.json?.error;
step(
  '失败态',
  '不存在的接口',
  '404 + 契约错误信封 + 中文 user_hint',
  missing.status === 404
    ? `${missing.status} · ${errEnvelope?.code} · "${errEnvelope?.user_hint}"`
    : `${missing.status} · ${brief(missing.json?.error?.message)}`,
  missing.status === 404 && Boolean(errEnvelope?.user_hint) && /[一-龥]/.test(errEnvelope?.user_hint ?? '')
);

// ---------------------------------------------------------------- 认知闭环已下线
// D66：断层 / 情境题 / 认知地形整条线拆掉了 —— 打过去必须是 404。
// 这条是**守卫**：哪天有人把老接口接回来，这里立刻红。
const RETIRED = [
  { method: 'POST', path: '/api/behavior/tension', body: { self_report: { type: 'INTJ', dimension_scores: {}, traits: [] } } },
  { method: 'POST', path: '/api/situation/question', body: { topic: '软件测试', count: 1 } },
  { method: 'POST', path: '/api/terrain/answer', body: { question_id: 'x', answer_key: null } },
  { method: 'GET', path: '/api/terrain', body: null },
];
const retiredResults = [];
for (const r of RETIRED) {
  const res = await call(r.method, r.path, r.body);
  retiredResults.push(`${r.method} ${r.path} → ${res.status}`);
}
const allGone = retiredResults.every((line) => line.endsWith('404'));
step(
  '守卫',
  '认知闭环接口确实下线了（D66）',
  '4 个老接口全部 404',
  retiredResults.join(' ｜ '),
  allGone
);

if (!light) {
  // ------------------------------------------------------------ 0:50 喂材料 → 吐卡
  const cards = await call('POST', '/api/cards', { topic: '软件测试', count: 3 });
  const cardList = cards.json?.data?.cards ?? [];
  const withSource = cardList.filter(
    (c) => c.source?.question_title && c.source?.question_url && c.source?.answer_url
  );
  step(
    '0:50',
    '喂材料 → 桌宠吐卡片（带出处三件套）',
    '200 + 3 张卡，每张都有 问题标题 + 问题 URL + 原回答 URL',
    cards.status === 200
      ? `${cards.status} · ${cardList.length} 张 · 带全出处 ${withSource.length} 张 · cached=${cards.json?.meta?.cached}`
      : `${cards.status} · ${brief(cards.json?.error?.message)}`,
    cards.status === 200 && cardList.length === 3 && withSource.length === cardList.length
  );
  if (cardList[0]) {
    step(
      '1:15',
      '点「出处」能回到知乎原回答',
      'answer_url 是 zhihu.com 的真实链接',
      cardList[0].source?.answer_url ?? '（无）',
      isZhihuUrl(cardList[0].source?.answer_url)
    );
  }

  // ------------------------------------------------------------ 1:45 补观点（同题两答）
  const views = await call('POST', '/api/cards', { topic: '软件测试', count: 2, same_question: true });
  const viewList = views.json?.data?.cards ?? [];
  const sameQ = viewList.length === 2 && viewList[0].source?.question_url === viewList[1].source?.question_url;
  const diffA =
    viewList.length === 2 && viewList[0].source?.answer_url !== viewList[1].source?.answer_url;
  step(
    '1:45',
    '知乎上大家怎么说（同题两答）',
    '2 张卡 · 同 question_url · 不同 answer_url',
    views.status === 200
      ? `${views.status} · ${viewList.length} 张 · 同题=${sameQ} · 不同答=${diffA}`
      : `${views.status} · ${brief(views.json?.error?.message)}`,
    views.status === 200 && sameQ && diffA
  );

  // ------------------------------------------------------------ 3:25 「问它」整条链路
  const advice = await call('POST', '/api/advice', { question: QUESTION });
  const a = advice.json?.data;
  const plan = a?.plan ?? [];
  const sources = a?.sources ?? [];
  const verdictOk = ['applicable', 'partially_applicable', 'not_applicable'].includes(a?.verdict);
  step(
    '3:25',
    '「问它」：抛一个问题 → 知乎相似困境 → 判断 → 方案',
    '200 + 非空 + 三档判断之一 + 一句话结论 + 至少 1 步方案 + 至少 1 条出处',
    advice.status === 200
      ? `${advice.status} · 判断=${a?.verdict} · 结论="${brief(a?.summary, 40)}" · ${plan.length} 步 · ${sources.length} 条出处 · 候选 ${a?.candidate_count ?? '?'} 条 · cached=${advice.json?.meta?.cached}`
      : `${advice.status} · ${brief(advice.json?.error?.message)}`,
    advice.status === 200 && a?.empty === false && verdictOk && Boolean(a?.summary) && plan.length >= 1 && sources.length >= 1
  );

  // ------------------------------------------------------------ 3:30 出处对账
  // **这是整条链路最要紧的一拍**：出处必须能点回知乎原文，
  // 而且方案每一步标的依据编号，必须都能在出处列表里找到。
  const refSet = new Set(sources.map((s) => s.ref));
  const orphans = [...new Set(plan.flatMap((s) => s.source_indexes ?? []).filter((n) => !refSet.has(n)))];
  const allZhihu = sources.every(
    (s) => isZhihuUrl(s.answer_url) && isZhihuUrl(s.question_url) && Boolean(s.question_title)
  );
  const uniqueRefs = refSet.size === sources.length;
  const stepsIndexed = plan.every((s, i) => s.index === i + 1 && Boolean(s.text) && (s.source_indexes ?? []).length > 0);
  step(
    '3:30',
    '出处对账：每一步的依据都能指回知乎原文',
    '出处全是 zhihu.com 真链接 + 编号不重号 + 每步都有依据编号 + 没有悬空编号',
    `${sources.length} 条出处 · 全真链接=${allZhihu} · 编号不重号=${uniqueRefs} · 步骤编号连续=${stepsIndexed}` +
      (orphans.length ? ` · 悬空编号=${orphans.join(',')}` : ' · 悬空编号=无'),
    allZhihu && uniqueRefs && stepsIndexed && orphans.length === 0
  );

  if (plan[0] && sources[0]) {
    step(
      '3:32',
      '每一步的依据编号，对得上出处里的编号',
      `第 1 步的依据编号 ⊆ 出处编号`,
      `第 1 步依据 [${(plan[0].source_indexes ?? []).join(',')}] · 出处编号 [${[...refSet].join(',')}] · 首条出处 ${brief(sources[0].answer_url, 70)}`,
      (plan[0].source_indexes ?? []).every((n) => refSet.has(n))
    );
  }

  // ------------------------------------------------------------ 3:35 再问一次 → 命中缓存
  const again = await call('POST', '/api/advice', { question: QUESTION });
  step(
    '3:35',
    '同一个问题再问一次 → 命中缓存（不烧直答额度）',
    '200 + meta.cached=true',
    again.status === 200 ? `${again.status} · cached=${again.json?.meta?.cached}` : `${again.status}`,
    again.status === 200 && again.json?.meta?.cached === true
  );
}

// ---------------------------------------------------------------- 额度（跑之后）
const quotaAfter = await call('GET', '/api/quota');
if (quotaAfter.status === 200) {
  const sBefore = quotaOf(quotaBefore.json, 'zhihu_search');
  const sAfter = quotaOf(quotaAfter.json, 'zhihu_search');
  const mBefore = quotaOf(quotaBefore.json, 'zhida_openai');
  const mAfter = quotaOf(quotaAfter.json, 'zhida_openai');
  console.log(`\n额度：知乎搜索 ${sBefore} → ${sAfter}（差值 ${sBefore - sAfter}） ｜ 直答 ${mBefore} → ${mAfter}（差值 ${mBefore - mAfter}）`);
  console.log('⚠️ 知乎的额度计数**有延迟**（实测跑完要等 15 秒左右才变），这里的差值可能不准 —— 以跑完后过一会儿再查为准。');
}

// ---------------------------------------------------------------- 汇总
const failed = results.filter((r) => r.pass === false);
const warn = results.filter((r) => r.pass === null);
console.log('\n=== 逐拍对照清单 ===');
for (const r of results) {
  const mark = r.pass === null ? '·' : r.pass ? '✅' : '❌';
  console.log(`${mark} [${r.beat}] ${r.what}`);
  console.log(`    期望：${r.expect}`);
  console.log(`    实际：${r.actual}`);
}
console.log(
  `\n汇总：PASS ${results.length - failed.length - warn.length} / FAIL ${failed.length} / 共 ${results.length} 拍`
);
if (failed.length) {
  console.log('\n失败的拍：');
  for (const f of failed) console.log(`  ❌ [${f.beat}] ${f.what} —— 实际：${f.actual}`);
}

process.exit(failed.length > 0 ? 1 : 0);
