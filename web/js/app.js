/**
 * 「从心」前端主逻辑。
 *
 * ## 三条硬规则（contracts/api.json）
 *   1. **空数据 ≠ 失败** —— 空数据显示后端给的 `empty_notice`，不自己编文案。
 *   2. **失败必须是真话** —— 显示 `error.user_hint`，不显示原始报错。
 *   3. **出处必填** —— 拿不到出处的卡片**不出现**。
 *
 * ## 台词不写死
 *
 * 全部来自 `GET /api/tone`（契约层 `contracts/tone.json` 是唯一真源）。
 *
 * ## 渲染在后端之外
 *
 * 后端只给参数（坐标 / 高度 / 强度 / 置信度），2.5D 地图怎么画是前端的事（D29 结论 6）。
 */

import {
  apiGet, getTone, getFavorites, getContents, getTension, getSituation, getCards, getTerrain, answerTerrain,
  getProfile, getQuota, ApiFail,
} from './api.js';
import { Pet, escapeHtml } from './pet.js';
import { QUESTIONS, scoreQuiz, DIMENSION_LABELS } from './quiz.js';
import { renderTerrain, zoomFracture } from './terrain.js';
import { recordDailyRead, trailDays } from './mountain-trail.js';
import { PetCompanion } from './pet-companion.js';
import { initOutro, showOutro } from './outro.js';
import { renderDaily } from './daily.js';
import { initOnboarding } from './onboarding.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  tone: null,
  favorites: null,
  cards: [],
  viewpoints: [],
  tension: null,
  terrain: null,
  quizPicked: {},
  topic: '',
  ownQuote: null,
  quota: null,
};

let pet = null;
let companion = null;
let guide = null;          // 首次上手引导（web/js/onboarding.js）
let demoMode = false;      // ?demo=1 —— 演练模式不弹引导、不弹完成卡

// ---------------------------------------------------------------- 小工具

function toast(msg, kind = '') {
  const old = $('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/** 失败 → 显示后端给的中文提示（不显示原始报错）。 */
function showFail(err, where) {
  const hint = err instanceof ApiFail ? err.hint : '出了点问题，稍后再试一次。';
  const code = err instanceof ApiFail ? err.code : 'UNKNOWN';
  const html = `<b>${escapeHtml(where)}</b>：${escapeHtml(hint)}<span class="code">${escapeHtml(code)}</span>`;
  return html;
}

/**
 * 失败 → **桌宠也要开口**。
 *
 * 之前 catch 里只写了面板提示，**气泡停在上一句台词** —— 看起来它没事，
 * 其实是卡住了。赛规第 7 条要的是「失败要给真实提示」，那就让**它自己**说出来。
 *
 * ⚠️ 说的是**后端 `user_hint`**（契约层规定的那句中文），不是前端另编的台词
 * —— 换句话说：它说的那句就是系统给出的那句，不多不少。
 */
function petSayFail(err, where) {
  const hint = err instanceof ApiFail ? err.hint : '出了点问题，稍后再试一次。';
  const code = err instanceof ApiFail ? err.code : 'UNKNOWN';
  pet.setState('error');
  pet.sayText(escapeHtml(hint), { note: `${where} · ${code}` });
}

function noticeBox(html, kind = '') {
  return `<div class="notice ${kind}">${html}</div>`;
}

/** 空数据 → 显示后端那句中文提示。 */
function emptyBox(notice) {
  return `<div class="empty-hint">${escapeHtml(notice ?? '这里还没有内容。')}</div>`;
}

/** 从材料标题里推一个主题词（真实数据推出来的，不是写死的）。 */
function deriveTopic(titles) {
  const counts = new Map();
  for (const t of titles) {
    const s = String(t ?? '').toLowerCase().replace(/[（(][^)）]*[)）]/g, ' ');
    const seen = new Set();
    for (let n = 2; n <= 8; n += 1) {
      for (let i = 0; i + n <= s.length; i += 1) {
        const g = s.slice(i, i + n);
        if (!/[\u4e00-\u9fa5a-z]/.test(g)) continue;
        if (/^\d+$/.test(g)) continue;
        if (seen.has(g)) continue;
        seen.add(g);
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  const ranked = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return ranked[0]?.[0] ?? String(titles[0] ?? '知乎').slice(0, 8);
}

/**
 * 从收藏标题里切出「像主题词」的短语。
 *
 * 为什么需要：知乎问题发现用的是 `question_recommendations(Query=<主题>)`，
 * Query 太具体就搜不到、太泛就没营养。
 * 文章标题里混着「笔记 / 总结 / 教程 / 装机」这类**体裁词** ——
 * 把它剥掉，剩下的才是能当 Query 的主题（「软件测试笔记」→「软件测试」）。
 *
 * ⚠️ 这里切出来的**不一定能用**（例如「比官方文档还细致…」）——
 * 所以它们只是**候选**，按顺序挨个试，搜不到就换下一个。
 */
const TITLE_NOISE = /(笔记|总结|教程|步骤|方法|攻略|指南|分享|记录|梳理|汇总|安装|装机|配置|实践|对比|哪个好|怎么样|好不好)$/;

function titlePhrases(title) {
  const s = String(title ?? '')
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/[【】\[\]]/g, ' ');
  const frags = s.split(/[：:？?！!，,、。;；·|—\-–/\\\n\r]+/);
  const out = [];
  for (let f of frags) {
    f = f.replace(/^\s*\d{1,4}\s*年?\s*/, '').replace(/\s+/g, ' ').trim();
    if (f.length > 10) f = f.slice(0, 10);
    if (f.length < 2) continue;
    for (let i = 0; i < 4; i += 1) {
      const next = f.replace(TITLE_NOISE, '');
      if (next === f || next.length < 2) break;
      f = next;
    }
    out.push(f);
  }
  return out;
}

/**
 * 主题词候选（材料侧）——**按可靠性排序，从上往下试**。
 *
 * 为什么要候选：后端把主题词原样当 `question_recommendations` 的 `Query`，
 * 搜不到就诚实返回空 +「换个说法再试一次」→ 前端必须**真的换个说法再试**。
 *
 * 候选全部来自真实数据，没有一个是写死的：
 *   1. **收藏里 `content_type=answer` 的条目标题** —— 它**本身就是知乎问题标题**，
 *      拿它当 Query 一定能召回到相关问题（2026-11-18 实测：20 个候选）。
 *   2. **收藏标题剥掉体裁词后的短语**（「软件测试笔记」→「软件测试」）。
 *   3. **标题 n-gram**（兜底；可能不准，所以排最后）。
 */
function materialTopicCandidates() {
  const out = [];
  const push = (t) => {
    const s = String(t ?? '').trim();
    if (!s || s.length < 2 || s.length > 24) return;
    if (out.includes(s)) return;
    out.push(s);
  };
  const items = state.favorites?.items ?? [];

  // 1. answer 型收藏的标题 = 知乎问题标题，最可靠
  for (const it of items) {
    if ((it.content_type ?? '') === 'answer') push(it.title);
  }
  // 2. 标题里的主题短语
  for (const it of items) {
    for (const frag of titlePhrases(it.title)) push(frag);
  }
  // 3. n-gram 兜底
  push(deriveTopic(items.map((i) => i.title)));
  return out;
}

/**
 * 主题词候选（情境题侧）——**材料优先，特质词兜底**。
 *
 * ## 为什么材料必须排在特质词前面（2026-11-19 修）
 *
 * 桌宠出题前那句是「那这道呢——**你打算怎么让它用上**」——
 * 「它」指的是**你刚喂进去的那堆材料**。
 * 如果主题词用问卷里的抽象特质词（「长期主义」），知乎的问题发现会按这个词
 * 召回一批**跟材料毫无关系**的问题（实测：出题变成「基金 30 年定投」，
 * 而收藏全是软件测试 / UML / Ubuntu）→ **台词悬空、题与材料不搭**。
 *
 * 所以顺序改成：
 *   1. **`state.topic`** —— 这轮喂它、吐卡片时**实际用的那个主题**（材料侧来的，
 *      且已经证明能捞到带回答的真问题）；
 *   2. **材料侧候选**（answer 型收藏标题 = 真问题标题，最可靠）；
 *   3. **问卷特质词** —— 只在前两个都没有时兜底。
 */
function topicCandidates() {
  const out = [];
  const push = (t) => {
    const s = String(t ?? '').trim();
    if (!s || s.length < 2 || s.length > 24) return;
    if (out.includes(s)) return;
    out.push(s);
  };
  push(state.topic);
  for (const t of materialTopicCandidates()) push(t);
  for (const t of scoreQuiz(state.quizPicked).traits ?? []) push(t);
  return out;
}

/**
 * 取**真卡片**：知乎问题 + 真实回答 + 原回答链接（契约 `SourceCard`）。
 *
 * 主题词按可靠性挨个试 —— **单个主题词失败不算整段失败**，换个说法再来。
 * `seen_sources` 用来避开已经吐过的卡片。
 *
 * @returns {{topic:string, cards:Array, emptyNotice:string}}
 */
async function fetchCards({ count = 3, seenSources = [] } = {}) {
  let lastNotice = '';
  let lastErr = null;
  for (const topic of materialTopicCandidates().slice(0, 4)) {
    try {
      const res = await getCards({ topic, count, seenSources, tone: state.tone?.tone });
      if (!res.empty && (res.cards ?? []).length) {
        state.topic = topic;
        return { topic, cards: res.cards, emptyNotice: '' };
      }
      lastNotice = res.empty_notice ?? lastNotice;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return { topic: '', cards: [], emptyNotice: lastNotice || '知乎上这次没捞到东西。' };
}

// ---------------------------------------------------------------- 顶栏

function renderToneSwitch() {
  const box = $('#tone-switch');
  box.innerHTML = '<label>语气</label>';
  for (const opt of state.tone?.options ?? []) {
    const b = document.createElement('button');
    // 与 actionbar 里其它控件共用 kit 的 .btn 体系：全站只有 primary / secondary 两种按钮形状
    b.className = 'btn btn--secondary actionbar__btn';
    b.type = 'button';
    b.textContent = opt.name;
    if (opt.id === state.tone?.tone) b.classList.add('is-on');
    b.addEventListener('click', async () => {
      try {
        const cat = await getTone(opt.id);
        state.tone = cat;
        pet.applyTone(cat);
        renderToneSwitch();
      } catch (err) {
        toast(showFail(err, '换语气失败').replace(/<[^>]+>/g, ' '), 'err');
      }
    });
    box.appendChild(b);
  }
}

async function loadProfile() {
  const pill = $('#pill-profile');
  const txt = $('#profile-text');
  try {
    const p = await getProfile();
    if (p.mode === 'developer_account') {
      txt.textContent = '开发期自读（还没接知乎登录）';
      pill.classList.remove('on');
    } else {
      txt.textContent = p.fullname ? `已登录 · ${p.fullname}` : '已登录';
      pill.classList.add('on');
    }
  } catch (err) {
    txt.textContent = '身份没读到';
    pill.classList.add('warn');
  }
}

async function loadQuota() {
  const pill = $('#pill-quota');
  try {
    const q = await getQuota();
    state.quota = q;              // 日报头版要用真实额度
    const list = q.apis ?? [];
    const find = (id) => list.find((x) => x.api_id === id);
    const disc = find('question_discovery');
    const user = find('user_data');
    const bits = [];
    // ⚠️ 这里显示的是**剩余**额度（`remaining`），不是已用 —— 必须写清楚，
    // 否则「问题发现 22/100」会被读成「已用 22」，把事实说反。
    if (disc) bits.push(`问题发现 剩 ${disc.remaining}/${disc.total}`);
    if (user) bits.push(`用户数据 剩 ${user.remaining}/${user.total}`);
    pill.textContent = bits.length ? bits.join(' · ') : '额度已取';
  } catch (err) {
    // ⚠️ 不能只写「额度没读到」就完事（2026-11-23 17:3x，P5 失败态实测）。
    //    官方检查第 7 条要的是「**真实**提示」——
    //    「读不到」是事实，但不给原因是**没用的真话**：
    //    用户不知道是额度用完了、还是凭据坏了、还是网络抖。
    //    → 拿后端那句 user_hint（跟 showFail 同一个口径），一句都不另编。
    const hint = err instanceof ApiFail ? err.hint : '这次没读到额度。';
    pill.textContent = hint;
    pill.classList.add('warn');
    pill.title = hint;
  }
}

// ---------------------------------------------------------------- 主流程

/**
 * 长文本折叠。
 * 卡片正文（`content` = 上游官方摘要截取）可能 200+ 字还带 `[图片]` 标记，
 * **截断/折叠是前端的活**（后端只给参数）。折叠起来，但**全文一个字不少地留着**。
 */
function quoteHtml(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (s.length <= 120) return `<div class="quote">${escapeHtml(s)}</div>`;
  return `<div class="quote"><details><summary>${escapeHtml(s.slice(0, 120))}…</summary>
    <div class="full">${escapeHtml(s)}</div></details></div>`;
}

/**
 * 知乎对**未登录**用户会弹登录框盖住正文（2026-11-19 实测：回答页与专栏页都弹）。
 * 正文就在遮罩后面，**关掉登录框就能读**。
 *
 * 所以把这件事**直接写出来**：别让评委以为是我们把出处做成了假链接，
 * 也别让「点开是登录框」变成一个说不清的演示事故。
 */
const ZHIHU_LOGIN_HINT =
  '<div class="zhint">知乎未登录会弹登录框，关掉就能看正文 —— 上面那条链接和摘要都来自知乎原页。</div>';

function cardHtml(c) {
  const src = c.source ?? {};
  const hasSource = Boolean(src.question_url || src.answer_url || src.url);
  const link = src.answer_url || src.question_url || src.url;
  const srcLine = hasSource
    ? `<a class="src" href="${escapeHtml(link)}" target="_blank" rel="noopener" title="${escapeHtml(link)}">
         ${escapeHtml(src.kicker ?? '知乎原文')}
         <span class="link">${escapeHtml(shortHost(link))}</span>
       </a>`
    : `<span class="src" style="color:var(--label-tertiary);background:transparent">
         没有知乎出处（这条是你自己给的材料）
       </span>`;

  return `
    <div class="card">
      <div class="kicker">${escapeHtml(c.kicker ?? '卡片')}</div>
      <div class="title">${escapeHtml(c.title)}</div>
      ${quoteHtml(c.summary)}
      ${c.meta ? `<div class="meta">${escapeHtml(c.meta)}</div>` : ''}
      ${srcLine}
      ${hasSource ? `<div class="srcurl">${escapeHtml(link)}</div>` : ''}
    </div>`;
}

function shortHost(u) {
  try {
    const url = new URL(u);
    const p = url.pathname.split('/').filter(Boolean);
    return `${url.hostname}${p.length ? `/${p[p.length - 1]}`.slice(0, 22) : ''}`;
  } catch {
    return String(u).slice(0, 28);
  }
}

function renderCards() {
  const box = $('#flow-cards');
  if (!state.cards.length) {
    box.innerHTML = emptyBox('还没嚼出卡片。先点「用我的收藏喂它」。');
    return;
  }
  box.innerHTML = `<div class="sec-title">
      <b>它嚼出来的卡片</b>
      <span class="tag">每张都能点回原文</span>
      <span class="rule"></span>
      <span>${state.cards.length} 张</span>
    </div>
    <div class="cardlist" style="margin-top:12px">${state.cards.map(cardHtml).join('')}</div>
    ${ZHIHU_LOGIN_HINT}`;
}

/**
 * 「知乎上吵起来的两边」——**同题两答**。
 *
 * 后端 `POST /api/cards` 传了 `same_question: true`，所以拿到的两张卡是
 * **同一个知乎问题下的两条不同回答**（`source.question_url` 相同、`source.answer_url` 不同）。
 * → 问题标题**只出现一次**，两张卡并排，中间一条 VS。
 *
 * ⚠️ **没得比就不装**：万一只取到一条、或两张不是同一个问题，
 *    **不画 VS**，并把实话写在标题栏上。
 */
function renderViews() {
  const box = $('#flow-views');
  if (!state.viewpoints.length) {
    box.innerHTML = '';
    return;
  }
  const items = state.viewpoints.map((c) => ({
    kicker: '知乎 · 真实问题与回答',
    title: c.source?.question_title ?? c.title ?? '（知乎上的一个真实问题）',
    summary: c.content ?? c.source?.answer_summary ?? '',
    meta: c.source?.answer_content_type === 'answer' ? '这条是知乎上的真实回答' : null,
    source: { ...(c.source ?? {}), kicker: '知乎原回答' },
  }));

  const sameQuestion = items.length > 1
    && items.every((x) => x.source?.question_url && x.source.question_url === items[0].source?.question_url);

  if (sameQuestion) {
    // 问题标题只说一次；两张卡标成「回答 ① / 回答 ②」
    const pair = items.map((x, i) => cardHtml({ ...x, title: `回答 ${['①', '②', '③'][i] ?? i + 1}` })).join('');
    box.innerHTML = `
    <div class="sec-title" style="margin-top:6px">
      <b>同一个问题的两条回答</b>
      <span class="tag">同题 · 两条真实回答</span>
      <span class="rule"></span>
      <span>不是它编的，是知乎上有的</span>
    </div>
    <div class="pairq">${escapeHtml(items[0].title)}</div>
    <div class="split" style="margin-top:10px">
      <div class="cardrow">${pair}</div>
      <div class="vs">VS</div>
    </div>
    ${ZHIHU_LOGIN_HINT}`;
    return;
  }

  // 兜底：不是同题 → **不画 VS**（没得比就不假装在比），并把实话写出来
  const vs = items.map((x) => cardHtml(x)).join('');
  box.innerHTML = `
    <div class="sec-title" style="margin-top:6px">
      <b>知乎上的真实回答</b>
      <span class="tag">真实问题 · 真实回答</span>
      <span class="rule"></span>
      <span>${items.length > 1 ? '不是同一个问题，算不上「两边」' : '这次只取到一条'}</span>
    </div>
    <div class="cardlist" style="margin-top:12px">${vs}</div>
    ${ZHIHU_LOGIN_HINT}`;
}

function renderList() {
  const box = $('#flow-list');
  const all = [
    ...state.cards,
    ...state.viewpoints.map((c) => ({
      kicker: '知乎 · 真实问题与回答',
      title: c.source?.question_title ?? c.title ?? '',
      summary: c.content ?? c.source?.answer_summary ?? '',
      source: { ...(c.source ?? {}), kicker: '知乎原回答' },
    })),
  ];
  if (!all.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="sec-title">
      <b>我的卡片</b>
      <span class="rule"></span>
      <span>${all.length} 张</span>
    </div>
    <div class="cardlist" style="margin-top:12px">${all.map(cardHtml).join('')}</div>
    ${ZHIHU_LOGIN_HINT}`;
}

/** 首屏硬事实：真实收藏条数。 */
function collectedCount(favorites) {
  return favorites?.collected_count ?? (favorites?.items?.length ?? 0);
}

function renderMaterials() {
  const box = $('#materials');
  const items = state.favorites?.items ?? [];
  if (!items.length) {
    box.innerHTML = state.favorites?.empty
      ? emptyBox(state.favorites.empty_notice)
      : '';
    return;
  }
  box.innerHTML = items.map((it, i) => `
    <div class="mat" draggable="true" data-idx="${i}" title="拖到桌宠身上，它就开嚼">
      <span class="ic"></span>
      <span class="t">${escapeHtml(it.title ?? '(无标题)')}</span>
      <span class="k">${escapeHtml(it.content_type ?? '')}</span>
    </div>`).join('');
}

/** 喂它：真实收藏 → 咀嚼 → 吐出**知乎真卡片**（问题 + 真实回答 + 原回答链接）。 */
async function feed() {
  const btn = $('#btn-feed');
  btn.disabled = true;
  try {
    if (!state.favorites) {
      pet.setState('thinking');
      state.favorites = await getFavorites(9);
      renderMaterials();
    }
    if (state.favorites.empty) {
      pet.setState('error');
      pet.sayText(escapeHtml(state.favorites.empty_notice ?? '没有可用的材料。'));
      return;
    }

    pet.setState('chew');
    pet.say('chew');
    await sleep(1400);

    // ⚠️ **台词不许早于事实**（11-19 16:3x 改）：原来这里就切 `emitting` 并说「嚼出来了」，
    //    但真知乎调用要 3—6 秒 —— 台上会看到「桌宠说卡片好了，屏幕上却一张卡都没有」。
    //    改成：**等卡片真的渲染出来**，再切状态、再说这句（见下方 renderCards 之后）。

    // ⚠️ **真卡片**：不是把你的收藏摆出来，是知乎上的真实问题 + 真实回答。
    //    出处是 `answer_url`（原回答链接）—— 契约层强制必填，缺了就不给这张卡。
    const { cards, emptyNotice } = await fetchCards({ count: 3 });
    if (!cards.length) {
      pet.setState('idle');
      $('#flow-cards').innerHTML = noticeBox(escapeHtml(emptyNotice), 'warn');
      return;
    }
    state.cards = cards.map((c) => ({
      kicker: '知乎 · 真实问题与回答',
      title: c.source?.question_title ?? c.title ?? '（知乎上的一个真实问题）',
      summary: c.content ?? c.source?.answer_summary ?? '',
      meta: c.source?.answer_content_type === 'answer' ? '这条是知乎上的真实回答' : null,
      source: { ...(c.source ?? {}), kicker: '知乎原回答' },
    }));
    renderCards();
    renderList();
    $$('.mat').forEach((el) => el.classList.add('is-eaten'));

    // 卡片真的飞出来了，才说「嚼出来了」（台词与事实同一拍落地）。
    pet.setState('emitting');
    pet.say('digest', { note: '每张卡片的出处都能点回知乎原文' });
  } catch (err) {
    petSayFail(err, '读收藏失败');
    $('#flow-cards').innerHTML = noticeBox(showFail(err, '读收藏失败'), 'err');
  } finally {
    btn.disabled = false;
  }
}

/** 知乎补观点：同主题下真实存在的**另一种说法**（两张卡，中间一条 VS 分界线）。 */
async function loadViewpoints() {
  const btn = $('#btn-views');
  btn.disabled = true;
  const box = $('#flow-views');
  try {
    // 主题词：优先用**已经吐过卡片的那个**（同一件事的两种说法），
    // 不行再按可靠性换别的说法。`seen_sources` 让它避开已经吐过的卡片。
    const candidates = [];
    const push = (t) => {
      const s = String(t ?? '').trim();
      if (s && !candidates.includes(s)) candidates.push(s);
    };
    push(state.topic);
    for (const t of materialTopicCandidates()) push(t);

    const seen = state.cards.map((c) => c.source?.question_url).filter(Boolean);

    // 脚本 1:45–2:15：桌宠又切电波，去知乎把「吵起来的两边」带回来。
    // ⚠️ **台词不许早于事实**：原来「我都带来了」是在请求**之前**说的，
    //    可这一步要 3—6 秒（主题词挨个试还可能更久）——
    //    台上会看到「桌宠说带来了，右侧还是空的」。
    //    改成：**卡片真的滑进来**，才说这句（见下方 renderViews 之后）。
    pet.setState('thinking');

    let res = null;
    let lastNotice = '';
    let lastErr = null;
    for (const topic of candidates.slice(0, 4)) {
      try {
        // `sameQuestion: true` → **同一个知乎问题下的两条不同回答**（真正的「两边」）。
        // 额度：只碰 1 个问题（≈2 次），比默认模式（1+N 次）还省。
        const r = await getCards({ topic, count: 2, seenSources: seen, tone: state.tone?.tone, sameQuestion: true });
        if (!r.empty && (r.cards ?? []).length) {
          res = r;
          break;
        }
        lastNotice = r.empty_notice ?? lastNotice;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!res) {
      if (lastErr) throw lastErr;
      box.innerHTML = noticeBox(escapeHtml(lastNotice || '知乎上这次没捞到东西。'), 'warn');
      pet.setState('idle');
      return;
    }
    state.viewpoints = res.cards ?? [];
    renderViews();
    renderList();

    // 两张观点卡真的并排了，才说「我都带来了」。
    pet.say('viewpoints');
    // ⚠️ `pet.say()` 是**替换**不是排队 —— 两句连着说，后一句会把前一句顶掉。
    //    留 2 秒让观众看完「我都带来了」那一拍，再上「我不替你选」。
    await sleep(2000);
    pet.setState('cheer');
    pet.say('disagree', { note: '原话，附链接' });
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '去知乎翻失败'), 'err');
    petSayFail(err, '去知乎翻失败');
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- 照镜子

function renderQuiz() {
  const box = $('#mirror-quiz');
  box.innerHTML = `
    <div class="sec-title">
      <b>先说说你是谁</b>
      <span class="tag">6 题 · 前端计分</span>
      <span class="rule"></span>
      <span>测的是「你怎么说自己」，不是你的能力</span>
    </div>
    <div class="quiz" style="margin-top:12px">
      ${QUESTIONS.map((q) => `
        <div class="q" data-q="${q.id}">
          <div class="qtitle">${escapeHtml(q.title)}</div>
          ${q.sub ? `<div class="qsub">${escapeHtml(q.sub)}</div>` : ''}
          <div class="opts">
            ${q.options.map((o, i) => `
              <button class="opt${state.quizPicked[q.id] === i ? ' is-on' : ''}" data-qid="${q.id}" data-idx="${i}">
                <span class="k">${escapeHtml(o.k)}</span>${escapeHtml(o.text)}
              </button>`).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:14px; display:flex; gap:10px">
      <button class="btn btn--primary" id="btn-mirror-run">让桌宠照照镜子</button>
      <button class="btn btn--secondary" id="btn-reset-quiz">重选</button>
    </div>`;

  $$('#mirror-quiz .opt').forEach((b) => {
    b.addEventListener('click', () => {
      const { qid, idx } = b.dataset;
      state.quizPicked[qid] = Number(idx);
      $$(`#mirror-quiz .opt[data-qid="${qid}"]`).forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
    });
  });
  $('#btn-reset-quiz')?.addEventListener('click', () => {
    state.quizPicked = {};
    renderQuiz();
  });
  // ⚠️ 这个按钮**不能**再叫 `btn-tension` —— 工作台「看一次断层」已经用了这个 id，
  //    `$('#btn-tension')` 只会返回**第一个**（工作台那个），
  //    于是这颗主按钮永远拿不到 handler（2026-11-23 实测：点了没反应）。
  $('#btn-mirror-run')?.addEventListener('click', (e) => startMirror(e.currentTarget));
}

/** 问卷答了几题 / 还差几题。 */
function quizAnsweredCount() {
  return Object.keys(state.quizPicked).length;
}
function quizMissingCount() {
  return QUESTIONS.filter((q) => state.quizPicked[q.id] === undefined).length;
}

/** 切到「照镜子 · 认知闭环」标签页（复用它自己的点击处理器，状态不会走偏）。 */
function switchToMirrorTab() {
  const btn = document.querySelector('#tabs button[data-tab="mirror"]');
  if (btn && !btn.classList.contains('is-on')) btn.click();
}

/**
 * 自述没说全 → **不许下判断**，也不许说「你说的一致」。
 *
 * 断层是拿「你说的」跟「你做的」放在一起比。问卷一个字都没答的时候，
 * 那个「一致」是**编的**（2026-11-23 实测：新用户点「看一次断层」，
 * 拿到的是「你说的和你做的在这几个维度上是一致的」—— 他根本没说过话）。
 * 所以这里只说实情：还差几题，并把人送到问卷那儿。
 */
function showSelfReportPrompt(missing) {
  const box = $('#mirror-fracture');
  if (!box) return;
  const firstUnanswered = QUESTIONS.find((q) => state.quizPicked[q.id] === undefined);
  box.innerHTML = noticeBox(
    `<b>现在还照不了。</b>问卷还差 <b>${missing}</b> 题没答 —— ` +
    `断层是拿「你说的」跟「你做的」放在一起比，你说的还没说全，我下不了这个判断。` +
    `<div style="margin-top:10px"><button class="btn btn--primary" id="btn-quiz-jump">去答剩下的题</button></div>`,
    'warn'
  );
  $('#btn-quiz-jump')?.addEventListener('click', () => {
    const opt = firstUnanswered
      ? document.querySelector(`#mirror-quiz .opt[data-qid="${firstUnanswered.id}"]`)
      : null;
    (opt ?? $('#mirror-quiz'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/**
 * 「照镜子」的统一入口 —— 工作台的「看一次断层」和问卷里的「让桌宠照照镜子」都走这里。
 *
 * @param {HTMLElement} [trigger] 点下去的那颗按钮（用来禁用/恢复）
 */
async function startMirror(trigger) {
  const missing = quizMissingCount();
  if (missing > 0) {
    switchToMirrorTab();
    showSelfReportPrompt(missing);
    return;
  }
  switchToMirrorTab();
  await runTension(trigger);
}

async function runTension(trigger) {
  // ⚠️ **自述没说全 → 不调接口、不下判断**。
  //    「你说的和你做的……一致」这句话的前提是**你说过**。
  //    问卷没答完就说它 = 对用户撒谎（2026-11-23 实测踩过）。
  const missing = quizMissingCount();
  if (missing > 0) {
    switchToMirrorTab();
    showSelfReportPrompt(missing);
    return;
  }
  const btn = trigger ?? $('#btn-mirror-run');
  if (btn) btn.disabled = true;
  const box = $('#mirror-fracture');
  try {
    const report = scoreQuiz(state.quizPicked);
    pet.setState('thinking');
    pet.say('mirror');
    box.innerHTML = noticeBox('正在把你的话和你收藏的东西放在一起看……');

    // 创作信号：脚本 4:05 那一拍要用的「你自己也写过一句」。
    // ⚠️ **在这里就取材**（断层这一拍，比 4:05 早半分钟）——
    //    等到点「看地形」才取，主持一点得慢了就来不及（会降级成数据陈述）。
    //    不 await、不阻塞；取不到就降级，**不报错、不编**。
    state.ownQuote = null;
    getContents(3)
      .then((contents) => { state.ownQuote = pickOwnQuote(contents); })
      .catch(() => { state.ownQuote = null; });

    const data = await getTension(report, state.tone?.tone);
    state.tension = data;

    if (data.insufficient) {
      // ⚠️ 「不成立」有两种原因，标题不能写死一种（2026-11-23 17:4x 实测）：
      //    ① 行为信号不够（收藏/关注/创作读到的不足 2 个）
      //    ② 行为信号够，但**你答的 6 题里没说自己重什么**（后端 warnings 里有
      //       self_report_not_comparable）—— 这种情况下说「信号不够」是**说错原因**。
      const selfNotComparable = (data.warnings ?? []).includes('self_report_not_comparable');
      box.innerHTML = noticeBox(
        `<b>${selfNotComparable ? '你还没说清自己重什么。' : '信号不够，断层不成立。'}</b>` +
        `${escapeHtml(data.insufficient_reason ?? '')}`,
        'warn'
      );
      pet.setState('idle');
      pet.say('insufficient');
      return;
    }
    if (!data.has_tension || !(data.fractures ?? []).length) {
      box.innerHTML = noticeBox(
        `<b>没找到断层。</b>你说的和你做的在这几个维度上是一致的——这本身就是个结果。` +
        `<br /><span class="code">这次比的是 ${data.signal_count ?? '—'} 个真实行为信号，和你答的 ${quizAnsweredCount()} 题。</span>`,
        'warn'
      );
      pet.setState('idle');
      pet.sayText('你说的和你做的，这回没打架。');
      return;
    }

    box.innerHTML = `
      <div class="sec-title">
        <b>断层</b>
        <span class="tag amber">自述 vs 行为</span>
        <span class="rule"></span>
        <span>${data.fractures.length} 条</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px">
        ${data.fractures.map((f) => `
          <div class="fracture" data-fracture="${escapeHtml(f.id)}">
            <div class="label">${escapeHtml(f.label)}</div>
            <div class="side"><b>你说的：</b>${escapeHtml(f.self_reported_side?.summary ?? '')}</div>
            <div class="side"><b>你做的：</b>${escapeHtml(f.behavioral_side?.summary ?? '')}</div>
            <div class="bars">
              <span>强度 <b>${Math.round((f.intensity ?? 0) * 100)}%</b></span>
              <span>置信度 <b>${Math.round((f.confidence ?? 0) * 100)}%</b></span>
            </div>
            <div class="note">${escapeHtml(f.confidence_note ?? '')}</div>
            ${(f.behavioral_side?.evidence ?? []).length ? `
              <div class="evidence">
                ${f.behavioral_side.evidence.map((e) => `
                  <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title ?? '证据')}</a>
                `).join('')}
              </div>` : ''}
          </div>`).join('')}
      </div>
      <div style="margin-top:14px; display:flex; gap:10px">
        <button class="btn btn--primary" id="btn-situation">来一道带出处的题</button>
        <button class="btn btn--secondary" id="btn-terrain">看地形</button>
      </div>`;

    pet.setState('cheer');
    pet.say('fracture', { note: '不确定的地方在证据栏里说清楚了' });

    $('#btn-situation')?.addEventListener('click', loadSituation);
    $('#btn-terrain')?.addEventListener('click', loadTerrain);
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '对照失败'), 'err');
    petSayFail(err, '对照失败');
  } finally {
    btn.disabled = false;
  }
}

async function loadSituation() {
  const box = $('#mirror-situation');
  const btn = $('#btn-situation');
  if (btn) btn.disabled = true;
  try {
    pet.setState('thinking');
    pet.say('question');
    box.innerHTML = noticeBox('正在出题……');

    // 主题词按可靠性挨个试（见 topicCandidates 的注释）。
    // 单个主题词失败**不算整段失败**：换个说法再来一次。
    const candidates = topicCandidates();
    if (!candidates.length) {
      box.innerHTML = noticeBox('还没有主题词。先答完上面的问卷，或者喂点收藏给它。', 'warn');
      pet.setState('idle');
      return;
    }

    let data = null;
    let usedTopic = '';
    let lastNotice = '';
    let lastErr = null;
    // 避开卡片已经用过的知乎问题 —— 情境题得是**另一个**真问题，不是把卡片重讲一遍
    const seen = [
      ...state.cards.map((c) => c.source?.question_url),
      ...state.viewpoints.map((c) => c.source?.question_url),
    ].filter(Boolean);
    for (const topic of candidates.slice(0, 3)) {
      try {
        const res = await getSituation({
          topic,
          count: 1,
          selfReport: state.tension?.self_reported,
          answered: seen,
        });
        if (!res.empty && (res.questions ?? []).length) {
          data = res;
          usedTopic = topic;
          break;
        }
        lastNotice = res.empty_notice ?? lastNotice;
      } catch (err) {
        // 这个主题词翻车了 —— 记下来，换下一个；全试完还不行就把真错误抛出去
        lastErr = err;
      }
    }

    if (!data) {
      if (lastErr) throw lastErr;
      box.innerHTML = noticeBox(escapeHtml(lastNotice || '这次没出到题。'), 'warn');
      pet.setState('idle');
      return;
    }
    state.situationTopic = usedTopic;
    const q = data.questions[0];
    state.situation = q;

    box.innerHTML = `
      <div class="sec-title">
        <b>${escapeHtml(q.stem ?? '')}</b>
        <span class="rule"></span>
      </div>
      <div class="card situation" style="margin-top:12px">
        <div class="kicker">来自知乎的真实问题</div>
        <div class="title">${escapeHtml(q.source?.question_title ?? '')}</div>
        <div class="quote">${escapeHtml(q.source?.answer_summary ?? '')}</div>
        <a class="src" href="${escapeHtml(q.source?.answer_url ?? q.source?.question_url ?? '#')}"
           target="_blank" rel="noopener"
           title="${escapeHtml(q.source?.answer_url ?? q.source?.question_url ?? '')}">知乎原回答<span class="link">${escapeHtml(shortHost(q.source?.answer_url ?? q.source?.question_url ?? ''))}</span></a>
        <div class="srcurl">${escapeHtml(q.source?.answer_url ?? q.source?.question_url ?? '')}</div>
      </div>
      ${ZHIHU_LOGIN_HINT}
      <div class="choices" style="margin-top:12px">
        ${(q.options ?? []).map((o) => `
          <button class="choice" data-key="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>
        `).join('')}
      </div>`;

    $$('#mirror-situation .choice').forEach((b) => {
      b.addEventListener('click', () => answerSituation(q, b.dataset.key));
    });
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '出题失败'), 'err');
    petSayFail(err, '出题失败');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function answerSituation(q, key) {
  const box = $('#mirror-situation');
  try {
    pet.setState('thinking');
    const res = await answerTerrain({
      questionId: q.id,
      answerKey: key,
      tone: state.tone?.tone,
    });
    box.innerHTML = `
      <div class="card" style="border-left: 3px solid var(--accent-primary)">
        <div class="kicker">地形长出了一块</div>
        <div class="title">${escapeHtml(res.block?.label ?? '')}</div>
        <div class="quote">${escapeHtml(res.block?.summary ?? '')}</div>
        ${(res.new_bridges ?? []).length ? `<div class="meta">新桥：${res.new_bridges.map((b) => escapeHtml(b.label)).join('、')}</div>` : ''}
      </div>`;
    pet.setState('play');
    pet.say('bridge');
    await sleep(1500);
    await loadTerrain();
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '作答失败'), 'err');
    petSayFail(err, '作答失败');
  }
}

/**
 * 从「用户自己写过的内容」里挑一句能念的话 —— 脚本 4:05 那句「你自己也写过一句」的原料。
 *
 * ⚠️ **只取真实原文，不改写、不编**（契约规则：台词里不许写会变的引文，
 *    要显示就从创作信号里取原文拼）。**只取第一句** —— 整篇 pin 念出来是灾难。
 */
function pickOwnQuote(contents) {
  const items = contents?.items ?? [];
  for (const it of items) {
    const raw = String(it.summary ?? it.content ?? it.body ?? '').trim();
    if (!raw) continue;
    const m = raw.match(/^[\s\S]{0,80}?[。！？]/);
    const s = (m ? m[0] : raw.slice(0, 40)).trim();
    if (s.length >= 8) return s;
  }
  return null;
}

async function loadTerrain() {
  const wrap = $('#mirror-terrain');
  try {
    const data = await getTerrain(state.tone?.tone);
    state.terrain = data;

    // 创作信号：脚本 4:05 那一拍备料（用户自己写过的那句话）。
    // ⚠️ **不 await** —— 不阻塞地形渲染；取不到就降级成数据陈述，
    //    **不报错、不编、也不拿假引文充数**。
    //    （断层那一拍已经取过一次；这里再取一次是刷新，服务端有缓存，不额外烧额度。）
    getContents(3)
      .then((contents) => { state.ownQuote = pickOwnQuote(contents); })
      .catch(() => { state.ownQuote = null; });

    renderTerrain(wrap, data, (f) => {
      zoomFracture(wrap, true);
      pet.setState('thinking');
      // 脚本 4:05：**先说用户自己写过的那句**（真实原文，取自创作信号）。
      // 没有创作内容就照实退回数据陈述 —— **不编、也不拿假引文充数**。
      // （断层 label / 强度 / 置信度在上面的断层面板里已经给全了，这里不重复。）
      if (state.ownQuote) {
        pet.sayText(`你自己也写过一句——<br /><b>「${escapeHtml(state.ownQuote)}」</b>`, {
          note: '这句是你自己写的',
        });
      } else {
        pet.sayText(
          `<b>${escapeHtml(f.label)}</b><br />强度 ${Math.round((f.intensity ?? 0) * 100)}% ·
         置信度 ${Math.round((f.confidence ?? 0) * 100)}%`,
          { note: f.confidence_note ?? '' }
        );
      }
    });
    if (data.empty_notice) {
      // 塞进 `.terrain-wrap`（它才是定位上下文），否则会锚到 `.stage` 上飘到别处
      const tw = wrap.querySelector('.terrain-wrap');
      (tw ?? wrap).insertAdjacentHTML('beforeend',
        `<div class="notice warn" style="position:absolute;left:14px;top:14px;right:14px;z-index:3">
           ${escapeHtml(data.empty_notice)}</div>`);
    }
    // 收尾一句（脚本 4:30–4:50：全景地图 + 这一句）
    pet.say('closing', { note: '三层都有了，断层上多了一座桥' });

    // 闭环走通标记 —— 数字全部来自**这一次真实跑出来**的状态，一个都不编。
    if (!demoMode) {
      const L = state.terrain?.layers ?? {};
      const filledLayers = ['self_reported', 'behavioral', 'situational']
        .filter((k) => (L[k]?.blocks ?? []).length).length;
      guide?.showDone({
        favorites: collectedCount(state.favorites),
        quiz: `${quizAnsweredCount()}/${QUESTIONS.length}`,
        fractures: state.tension?.fractures?.length ?? 0,
        situation: state.situation ? 1 : 0,
        layers: filledLayers,
      });
    }
  } catch (err) {
    wrap.innerHTML = noticeBox(showFail(err, '读地形失败'), 'err');
    petSayFail(err, '读地形失败');
  }
}

// ---------------------------------------------------------------- 底栏

function renderStrip() {
  const f = state.favorites;
  const strip = $('#strip');
  if (!f || f.empty) {
    strip.innerHTML = `<div class="proof">还没读到知乎数据</div>`;
    return;
  }
  const top = (f.category_distribution ?? [])[0];
  const span = f.span ?? {};
  strip.innerHTML = `
    <div class="stat hl"><div class="n">${f.collected_count ?? 0}<i>条收藏</i></div><div class="l">真实账号数据</div></div>
    <div class="sep"></div>
    <div class="stat"><div class="n">${top ? Math.round((top.ratio ?? 0) * 100) : 0}<i>% ${escapeHtml(top?.category ?? '—')}</i></div><div class="l">收藏分类 · 排第一</div></div>
    <div class="sep"></div>
    <div class="stat"><div class="n">${span.span_days ?? 0}<i>天跨度 / 集中在 ${span.distinct_days ?? 0} 天</i></div><div class="l">任务驱动型收藏</div></div>
    <div class="sep"></div>
    <div class="stat amber"><div class="n">${state.tension?.signal_count ?? '—'}<i>个独立行为信号</i></div><div class="l">收藏 · 关注 · 创作</div></div>
    <div class="sep"></div>
    <div class="proof">
      数字与链接均为 <b>真实账号实测</b>（node server/scripts/smoke.js 可复现）<br />
      刘看山形象来自<b>知乎官方黑客松开放素材</b>，仅本届比赛期间可用
    </div>`;
}

/** 首屏三块硬事实：同一份真实收藏快照 + 本机记忆，不另调接口。 */
function updateHeroFacts(favError) {
  const count = favError ? '—' : String(collectedCount(state.favorites));
  const set = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  set('#ch-count', count);
  set('#ch-note-count', count);
  set('#ch-turns', String(companion?.memory?.turns ?? 0));
  set('#ch-days', String(trailDays()));
}

// ---------------------------------------------------------------- 启动

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function init() {
  // 演练模式（?demo=1）：走的是排好的脚本，不弹引导、不弹完成卡。
  demoMode = new URLSearchParams(location.search).has('demo');

  // 首屏是陪伴空间（纯 2D + 桌宠），不加载 3D 山 / WebGL。
  pet = new Pet($('#pet'));
  pet.img.addEventListener('error', () => pet.onAssetError());

  // 落版（脚本 4:50—5:00 那一拍）：顶栏按钮 / 键盘 O、End / 演练结束自动出
  initOutro(pet);

  // 台词先来：没有它，桌宠说不成话
  try {
    state.tone = await getTone();
    pet.setTone(state.tone);
    renderToneSwitch();
    pet.setState('greet');
    pet.say('opening', { note: '把资料拖进来，或者点下面的按钮' });
  } catch (err) {
    pet.setState('error');
    pet.sayText(escapeHtml(err instanceof ApiFail ? err.hint : '台词加载失败。'));
  }

  // 桌宠伴侣（借鉴 my-neuro 的常驻交互）：可拖拽、主动搭话、打字对话、本机记忆。
  // 数据全部来自真实接口快照与台词目录，不接 LLM、不编造。
  companion = new PetCompanion(pet, {
    getFacts: () => ({
      count: collectedCount(state.favorites),
      quota: state.quota,
    }),
    getTone: () => state.tone,
  });

  // 首屏两只入口都打开同一个常驻对话面板，情绪素材共用
  $('#ch-talk')?.addEventListener('click', () => { companion.setOpen(true); companion.setMood('greet'); });
  $('#ch-pet')?.addEventListener('click', () => { companion.setOpen(true); companion.setMood('greet'); });

  // 首屏桌宠轻动效：视频不可用时回退到官方静态素材（诚实降级，不白屏）
  const petVideo = $('#ch-pet-video');
  const petBtn = $('#ch-pet');
  if (petVideo && petBtn) {
    const fallback = () => petBtn.classList.add('no-video');
    petVideo.addEventListener('error', fallback);
    petVideo.querySelector('source')?.addEventListener('error', fallback);
    // 部分浏览器不触发 error，用可播放性兜底
    petVideo.addEventListener('loadeddata', () => petBtn.classList.remove('no-video'));
    if (!petVideo.canPlayType || !petVideo.canPlayType('video/mp4')) fallback();
  }

  renderQuiz();
  renderCards();
  await loadProfile();
  await loadQuota();   // 日报要用真实额度，等它回来

  // 材料：真实收藏
  let favError = null;
  try {
    state.favorites = await getFavorites(9);
    // 山去掉了，但“今天读了多少”的本机足迹仍按真实收藏数记录
    recordDailyRead(collectedCount(state.favorites));
    renderMaterials();
    renderStrip();
    // 脚本 0:15：材料摊开了，桌宠转头问一句「要不我先啃一口？」
    pet.setState('greet');
    pet.say('offer', { note: '拖一条到它身上，或者点下面的按钮' });
    // 悬浮桌宠主动搭话（真实事件：收藏刚读到）：台词来自 tone 目录，条数是真实数据
    companion?.proactive('source', `刚读到 ${collectedCount(state.favorites)} 条真实收藏。`);
  } catch (err) {
    $('#materials').innerHTML = noticeBox(showFail(err, '读收藏失败'), 'err');
    favError = err instanceof ApiFail ? err.hint : '出了点问题，稍后再试一次。';
  }

  // 日报头版与 hero 预览必须渲染在 try 之外（11-22 队友 5135ef8 修的真实 bug）：
  // ⚠️ 收藏接口一抛异常，上面那段 try 走 catch，`#daily-paper` 就没人填 ——
  //    首屏只剩一个**纯白空框**，什么提示都没有（缺凭据起服务时实测如此）。
  //    失败时也要如实印一张「今天读不到」的报 —— **不留白、不编数据**；
  //    hero 的计数与预览同样给兜底，不再停在「正在印…」。
  renderDaily($('#daily-paper'), {
    favorites: state.favorites,
    quota: state.quota,
    error: favError,
  });

  // 首屏只放三块硬事实；日报头版在下面的 #paper 里完整呈现，不重复渲染预览
  updateHeroFacts(favError);

  // 事件
  $('#btn-feed').addEventListener('click', feed);
  $('#btn-views').addEventListener('click', loadViewpoints);
  // 工作台的「看一次断层」= 问卷里的「让桌宠照照镜子」：同一个入口（startMirror）。
  // 自述没说全 → 送去问卷并说清实情；说全了 → 才真的照镜子。
  $('#btn-tension')?.addEventListener('click', (e) => startMirror(e.currentTarget));

  // 双模式切换（Apple HIG Step 8）：右下角按钮切 light/dark，记住选择
  const themeBtn = $('#theme-toggle');
  const savedTheme = (() => { try { return localStorage.getItem('congxin-theme'); } catch { return null; } })();
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
  }
  themeBtn?.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('congxin-theme', next); } catch { /* 隐私模式下忽略 */ }
  });

  // 日报首屏 → 翻开内页（桌宠工作台）
  $('#daily-enter')?.addEventListener('click', () => {
    const tabs = $('#tabs');
    if (!tabs) return;
    tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 脚本 1:15：看第一条 → 桌宠说一句「这是知乎上真有人写过的」
  // 挂在**卡片**上（点标题或点出处都算「看这条」）；
  // ⚠️ 没有出处的卡（本地拖进来的材料）**不说这句** —— 那不是知乎上写的。
  document.addEventListener('click', (e) => {
    const card = e.target?.closest?.('.card');
    if (!card) return;
    if (!card.querySelector('a.src[href]')) return;
    pet.say('source', { note: '每张卡片的出处都能点回知乎原回答' });
  });

  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    dz.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const text = await file.text();
    state.cards.unshift({
      kicker: '卡片 · 你给的材料',
      title: file.name,
      summary: text.slice(0, 220),
      meta: '本地材料：没有知乎出处（卡片的出处只来自知乎真实内容）',
      source: {},
    });
    renderCards();
    renderList();
    pet.setState('emitting');
    pet.say('digest', { note: '这条是你自己的材料，没有知乎出处' });
  });

  // 脚本 0:15–0:30：把收藏**拖到桌宠身上** → 它张嘴嚼。
  const petEl = $('#pet');
  petEl.addEventListener('dragover', (e) => {
    // 只有拖的是收藏条目（text/plain）才接；拖本地文件走 dropzone 那条路
    if (!e.dataTransfer?.types?.includes('text/plain')) return;
    e.preventDefault();
    petEl.classList.add('is-drop');
  });
  petEl.addEventListener('dragleave', () => petEl.classList.remove('is-drop'));
  petEl.addEventListener('drop', (e) => {
    petEl.classList.remove('is-drop');
    const txt = e.dataTransfer?.getData?.('text/plain') ?? '';
    if (!txt) return;
    e.preventDefault();
    e.stopPropagation();
    feed();
  });
  // 收藏条目的拖拽源
  document.addEventListener('dragstart', (e) => {
    const mat = e.target?.closest?.('.mat');
    if (!mat) return;
    e.dataTransfer?.setData('text/plain', mat.textContent ?? '');
  });

  // 阶段切换
  $$('#tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#tabs button').forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
      const tab = b.dataset.tab;
      $('#panel-flow').classList.toggle('hidden', tab !== 'flow');
      $('#panel-mirror').classList.toggle('hidden', tab !== 'mirror');
      if (tab === 'mirror') {
        pet.setState('greet');
        // 脚本 3:00：桌宠**主动**发起照镜子
        // ⚠️ 「跟你刚才说的不太一样」的前提是**你已经说过**。
        //    一个字都没答的时候说这句 = 对用户撒谎（2026-11-23 实测踩过）。
        //    演练模式是排好的脚本，预设答案在切页前就写进了 state，所以照说不误。
        if (quizAnsweredCount() > 0) {
          pet.say('mirror', { note: '你收藏的这些，跟你刚才说的不太一样' });
        }
      } else {
        // 脚本 2:45：卡片先收进右侧栏
        pet.setState('idle');
        pet.say('park', { note: '卡片先收进右边那栏' });
      }
    });
  });

  // 首次上手引导（web/js/onboarding.js）
  //
  // ⚠️ 判据全部读**真实状态**（卡片数 / 答题数 / 断层 / 情境题 / 版图），
  //    引导自己不发任何知乎请求 —— 它只指路，不替用户做，也不烧额度。
  guide = initOnboarding({
    probe: () => ({
      cards: state.cards.length,
      answered: quizAnsweredCount(),
      total: QUESTIONS.length,
      tension: Boolean(state.tension),
      situation: Boolean(state.situation),
      terrain: Boolean(state.terrain),
      tab: document.querySelector('#tabs button[data-tab="mirror"]')?.classList.contains('is-on') ?? false,
    }),
    switchTab: (tab) => { if (tab === 'mirror') switchToMirrorTab(); },
    autoStart: !demoMode,
  });
  $('#btn-guide')?.addEventListener('click', () => guide?.start(0));

  // 演练模式：?demo=1 自动串一遍（脚本从桌宠开始，先翻到内页，别停在日报头版）
  if (demoMode) {
    $('#pet')?.scrollIntoView({ block: 'center' });   // 桌宠在工作台里，脚本从它开始
    $('#tabs')?.scrollIntoView({ block: 'start' });
    const { runDemo } = await import('./demo.js');
    runDemo({ state, feed, loadViewpoints, runTension, loadSituation, answerSituation, loadTerrain, showOutro });
  }
}

init();
