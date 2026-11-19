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
 *   9 条真实收藏、3 张带出处真卡、同题两答、断层标签、情境题带出处、
 *   作答长出地形、语气 14 句、错误信封有中文提示。
 *
 * ## 额度
 *
 *   ⚠️ **会烧知乎额度**：完整跑一次 ≈ **11 次「问题发现」**。
 *      每日 00:00 重置、不结转。**跑之前先看额度。**
 *      命中 5 分钟缓存的步骤会标 `cached`，**不烧**。
 *   `--light` 只跑不烧额度的那几步（收藏 / 关注 / 创作 / 语气 / 额度 / 登录态 / 错误信封）。
 *
 * 用法：
 *   node scripts/regress-p3.js                # 完整跑（≈11 次问题发现）
 *   node scripts/regress-p3.js --light        # 只跑不烧额度的部分
 *   node scripts/regress-p3.js --base http://localhost:18787
 */

const args = process.argv.slice(2);
const light = args.includes('--light');
const baseIndex = args.indexOf('--base');
const BASE = (baseIndex > -1 ? args[baseIndex + 1] : process.env.REGRESS_BASE) || 'http://localhost:18787';

/** 回归用的会话 id —— 免得跟别的会话的问卷/作答串味。 */
const SESSION = 'regress-p3';

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

const ok = (v) => (v ? '✅' : '❌');
const brief = (s, n = 60) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

console.log(`=== P3 闭环回归 · ${BASE} · ${light ? '轻量（不烧额度）' : '完整'} ===`);

// ---------------------------------------------------------------- 额度（跑之前）
const quotaBefore = await call('GET', '/api/quota');
if (quotaBefore.status === 200) {
  console.log(
    `额度快照：问题发现剩 ${quotaBefore.json?.data?.apis?.find((a) => a.api_id === 'question_discovery')?.remaining ?? '?'}/100` +
      ` ｜ 知乎用户数据剩 ${quotaBefore.json?.data?.apis?.find((a) => a.api_id === 'user_data')?.remaining ?? '?'}/10000`
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

if (!light) {
  // ------------------------------------------------------------ 0:30 喂材料 → 吐卡
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
      /https?:\/\/(www\.)?zhihu\.com\//.test(cardList[0].source?.answer_url ?? '')
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

  // ------------------------------------------------------------ 3:10 问卷 → 断层
  const selfReport = {
    type: 'INTJ',
    dimension_scores: { Fi: 0.8, Ti: 0.7, Se: 0.2, Ne: 0.3 },
    traits: ['长期主义', '体系化', '重视逻辑一致'],
  };
  const tension = await call('POST', '/api/behavior/tension', { self_report: selfReport });
  const tData = tension.json?.data;
  const fracture = tData?.fractures?.[0];
  step(
    '3:25',
    '照镜子 → 断层（自述 vs 行为）',
    'has_tension + 断层标签 + 行为侧证据',
    tension.status === 200
      ? `${tension.status} · 信号 ${tData?.signal_count ?? '?'} 个 · 断层 ${tData?.fractures?.length ?? 0} 条 · 强度 ${fracture?.intensity ?? '?'} · 证据 ${fracture?.behavioral_side?.evidence?.length ?? 0} 条`
      : `${tension.status} · ${brief(tension.json?.error?.message)}`,
    tension.status === 200 && tData?.has_tension === true && (fracture?.behavioral_side?.evidence?.length ?? 0) > 0
  );
  if (fracture) {
    step(
      '3:25',
      '断层标签（脚本里逐字对照的那句）',
      '「你说你重「长期主义」，但你收藏的 67%（6/9 条）是「怎么立刻上手」…」',
      fracture.label,
      /你说你重/.test(fracture.label ?? '') && /怎么立刻上手/.test(fracture.label ?? '')
    );
    step(
      '3:50',
      '行为侧数据陈述句',
      '含 778 天 / 6 天',
      fracture.behavioral_side?.summary ?? '（无）',
      /778/.test(fracture.behavioral_side?.summary ?? '')
    );
  }

  // ------------------------------------------------------------ 4:15 情境题
  const situation = await call('POST', '/api/situation/question', {
    topic: '软件测试',
    self_report: selfReport,
    count: 1,
  });
  const sData = situation.json?.data;
  const question = sData?.questions?.[0];
  step(
    '4:15',
    '情境题（必带知乎出处）',
    '200 + 题面 + 问题标题 + 原回答链接',
    situation.status === 200
      ? `${situation.status} · ${sData?.questions?.length ?? 0} 题 · "${brief(question?.stem, 40)}" · 出处 ${question?.source?.question_url ? '有' : '无'}`
      : `${situation.status} · ${brief(situation.json?.error?.message)}`,
    situation.status === 200 && (sData?.questions?.length ?? 0) > 0 && Boolean(question?.source?.question_url)
  );

  // ------------------------------------------------------------ 4:25 作答 → 地形
  if (question) {
    const answer = await call('POST', '/api/terrain/answer', {
      question_id: question.id,
      answer_key: question.options?.[0]?.key ?? null,
    });
    const aData = answer.json?.data;
    step(
      '4:25',
      '作答 → 地形长出一块新地块',
      '200 + 长出新地块（桥看数据，不强求）',
      answer.status === 200
        ? `${answer.status} · 块 ${aData?.block?.id ?? '无'}（${aData?.block?.label ?? '?'}）· 桥 ${aData?.new_bridges?.length ?? 0} 座`
        : `${answer.status} · ${brief(answer.json?.error?.message)}`,
      answer.status === 200 && Boolean(aData?.block)
    );
  }

  // ------------------------------------------------------------ 4:30 地形全景
  const terrain = await call('GET', '/api/terrain');
  // 注意形状：data.terrain.layers 是**对象**（键 = self_reported / behavioral / situational），
  // 不是数组 —— 数组会取到 undefined。
  const terrainData = terrain.json?.data?.terrain ?? terrain.json?.data ?? {};
  const rawLayers = terrainData.layers ?? {};
  const layerCount = Array.isArray(rawLayers) ? rawLayers.length : Object.keys(rawLayers).length;
  const layerNames = Array.isArray(rawLayers)
    ? rawLayers.map((l) => l?.label).join(' / ')
    : Object.values(rawLayers)
        .map((l) => l?.label)
        .join(' / ');
  step(
    '4:30',
    '2.5D 认知地图',
    '200 + 三层都有内容 + 有断层标记',
    terrain.status === 200
      ? `${terrain.status} · ${layerCount} 层（${layerNames}）· 断层标记 ${terrainData.fractures?.length ?? '?'} 处 · 桥 ${terrainData.bridges?.length ?? '?'} 座`
      : `${terrain.status} · ${brief(terrain.json?.error?.message)}`,
    terrain.status === 200 && layerCount >= 3 && (terrainData.fractures?.length ?? 0) > 0
  );
}

// ---------------------------------------------------------------- 额度（跑之后）
const quotaAfter = await call('GET', '/api/quota');
if (quotaAfter.status === 200) {
  const before = quotaBefore.json?.data?.apis?.find((a) => a.api_id === 'question_discovery')?.remaining;
  const after = quotaAfter.json?.data?.apis?.find((a) => a.api_id === 'question_discovery')?.remaining;
  console.log(`\n额度：问题发现 ${before} → ${after}（差值 ${before - after}）`);
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
