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
 * ## 两条主线（2026-11-24 决策 D66）
 *
 * 1. **主流程**（flow 栏）：收藏 → 桌宠咀嚼 → 吐带出处的卡片 → 追问 → 知乎补观点。
 * 2. **「问它」**（mirror 栏，`web/index.html` 里的 `#panel-mirror`）：
 *    你抛一件事 → 它去知乎找**相似的困境** → 判断适不适合你 → 给一个能照着做的方案。
 *
 * ⚠️ 「认·清认知闭环」（断层 / 情境题 / 认知地形）已随 D66 下线 ——
 *    认知地图不做了，闭环那三个接口、三个 service、前端一整套渲染都拆掉了。
 *    台词目录 14 句**一个字没动**（P1 纪律：产出内容只能人拍板）。
 *
 * ## 渲染在后端之外
 *
 * 后端只给参数与出处，前端负责怎么摆。
 */

import {
  apiGet, getTone, getFavorites, getContents, getCards, getAdvice,
  getProfile, getQuota, ApiFail,
} from './api.js';
import { Pet, escapeHtml } from './pet.js';
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
  topic: '',
  quota: null,
  /** 「问它」的结果（最近一次）。null = 还没问过。 */
  advice: null,
  /** 「问它」问过几次（本机计数）。 */
  adviceCount: 0,
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

/**
 * 失败 → 显示后端给的中文提示（不显示原始报错）。
 *
 * ⚠️ 2026-11-23 22:3x（拟真审计）：**错误码不再印在界面上**。
 *    「ZHIHU_AUTH_INVALID」这种机器码让界面看起来像在读日志 ——
 *    官方检查第 7 条要的是「**真实**提示」，那句中文 user_hint 才是给人看的那句；
 *    机器码留给控制台与后端日志，不进界面。
 */
function showFail(err, where) {
  const hint = err instanceof ApiFail ? err.hint : '出了点问题，稍后再试一次。';
  const code = err instanceof ApiFail ? err.code : 'UNKNOWN';
  console.warn(`[从心] ${where} 失败：${code}`, err?.detail ?? '');
  return `<b>${escapeHtml(where)}</b>：${escapeHtml(hint)}`;
}

/**
 * 失败 → **桌宠也要开口**。
 *
 * 之前 catch 里只写了面板提示，**气泡停在上一句台词** —— 看起来它没事，
 * 其实是卡住了。赛规第 7 条要的是「失败要给真实提示」，那就让**它自己**说出来。
 *
 * ⚠️ 说的是**后端 `user_hint`**（契约层规定的那句中文），不是前端另编的台词
 * —— 换句话说：它说的那句就是系统给出的那句，不多不少。
 *
 * ⚠️ 2026-11-23 22:3x（拟真审计）：气泡里**不再出现英文错误码，也不再挂
 *    「去知乎翻失败」这种操作标签** —— 角色只说那句中文真话，
 *    否则桌宠看起来像个在念日志的控件。操作标签留在面板提示里。
 */
function petSayFail(err, where) {
  const hint = err instanceof ApiFail ? err.hint : '出了点问题，稍后再试一次。';
  const code = err instanceof ApiFail ? err.code : 'UNKNOWN';
  pet.setState('error');
  pet.sayText(escapeHtml(hint));
  console.warn(`[从心] ${where} 失败：${code}`);
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
  const detail = $('#detail-identity');
  try {
    const p = await getProfile();
    if (p.mode === 'developer_account') {
      // ⚠️ 2026-11-23 22:3x（拟真审计）：顶栏原来写「开发期自读（还没接知乎登录）」——
      //    那是一句**开发说明**，挂在产品顶栏上像调试面板。
      //    现在顶栏只留一句短状态（7 个字，本身就说得清，不用点开也知道），
      //    完整说明收进可展开的详情里。
      txt.textContent = '还没接知乎登录';
      if (detail) detail.textContent = '还没接知乎登录。现在读的是你自己的账号（开发期自读模式）。';
      pill.classList.remove('on');
    } else {
      txt.textContent = p.fullname ? `已登录 · ${p.fullname}` : '已登录';
      if (detail) detail.textContent = p.fullname ? `已登录 · ${p.fullname}` : '已登录（知乎 OAuth）';
      pill.classList.add('on');
    }
  } catch (err) {
    txt.textContent = '身份没读到';
    if (detail) detail.textContent = '身份没读到。';
    pill.classList.add('warn');
  }
}

async function loadQuota() {
  const pill = $('#pill-quota');
  const detail = $('#detail-quota');
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
    const text = bits.length ? bits.join(' · ') : '今天的额度读到了，但没有能显示的条目。';
    // ⚠️ 2026-11-23 22:3x（拟真审计）：额度数字不再常驻顶栏（那是后台控制台的样子），
    //    收进详情里。**读不到**时例外 —— 原因必须留在屏幕上。
    if (detail) detail.textContent = text;
    pill.hidden = true;
  } catch (err) {
    // ⚠️ 不能只写「额度没读到」就完事（2026-11-23 17:3x，P5 失败态实测）。
    //    官方检查第 7 条要的是「**真实**提示」——
    //    「读不到」是事实，但不给原因是**没用的真话**：
    //    用户不知道是额度用完了、还是凭据坏了、还是网络抖。
    //    → 拿后端那句 user_hint（跟 showFail 同一个口径），一句都不另编。
    const hint = err instanceof ApiFail ? err.hint : '这次没读到额度。';
    if (detail) detail.textContent = hint;
    // 失败时这句**直接上顶栏**（不藏进折叠）：理由不见了就等于没说。
    pill.textContent = hint;
    pill.hidden = false;
    pill.classList.add('warn');
    pill.title = hint;
  }
}

/**
 * 顶栏详情：点那颗胶囊展开身份与今日额度，点外面 / Esc 收起。
 * 2026-11-23 22:3x（拟真审计）新增。
 */
function initNavDetail() {
  const btn = $('#pill-profile');
  const panel = $('#nav-detail');
  if (!btn || !panel) return;
  const setOpen = (open) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
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

// ---------------------------------------------------------------- 问它（2026-11-24 新主线 · D66）

/**
 * 「问它」面板 —— 你抛一件事，它去知乎找**遇到同样问题的人**怎么处理的。
 *
 * ## 为什么住在 `#panel-mirror` 里
 *
 * `web/index.html` 是**队友的地盘**（D65），我们不碰它。
 * 原来那块是「照镜子 · 认知闭环」面板（`#panel-mirror` + 4 个空 div：
 * `mirror-quiz` / `mirror-fracture` / `mirror-situation` / `mirror-terrain`）。
 * 认知闭环下线后那 4 个 div 没人用了 —— 我们**把面板内容整个换掉**
 * （`panel.innerHTML = ...`），队友什么时候从他文件里删掉那 4 个 div 都行，**不影响我们跑**。
 *
 * ⚠️ 那个 tab 按钮的标题（「照镜子 · 认知闭环」）也在 index.html 里，同样是队友的地盘 →
 *    我们**只在它还是旧值时**才改掉它；他要是自己改过标题，我们的代码就不动（免得两边打架）。
 *
 * ## 样式为什么用内联
 *
 * `web/css/` 归队友（D65）。我们新增的界面**不新增 CSS 文件、不改他的样式**，
 * 需要的样式全部内联在这段 JS 里 —— 两边零冲突。
 */
const ASK_TAB_OLD_TITLE = '照镜子 · 认知闭环';
const ASK_TAB_NEW_TITLE = '问它 · 它帮你找答案';

/** 演示用的示例问题 —— 都是**真实的困境**，不是编出来的文案。 */
const ASK_EXAMPLES = [
  '工作压力大到睡不着怎么办',
  '和父母总因为催婚吵架',
  '实习期被同事甩锅',
];

/**
 * 「问它」面板的样式 —— **全部走 CSS 变量，值写在变量里当 fallback**。
 *
 * ## 为什么这样写（队友要能改）
 *
 * 队友的「问它」面板视觉是他的活（`web/css/` 是他的地盘）。
 * 如果这里直接写死内联样式（`style="border:1px solid ..."`），
 * **他改不动** —— 内联样式的优先级高于任何 class，
 * 他在 `web/css/` 里写什么都不生效（除非用 `!important`，那是坏味道）。
 *
 * 所以这里一律写成 `var(--ask-xxx, 默认值)`：
 * - **默认值**在 JS 里（没有样式表也能正常显示）
 * - **队友在 `web/css/` 里加一行 `:root { --ask-xxx: ... }` 就能改**
 * - 双方零冲突：**我们不碰 `web/css/`，他不碰 `web/js/`**
 *
 * ## ⚠️ 两种变量，别搞混（这个坑真的踩过）
 *
 * 变量值塞在**简写属性**里时，值必须是**完整简写**，不能只给一部分：
 *
 * - `border: var(--ask-card-border, 1px solid rgba(...))`
 *   → 队友要写 `--ask-card-border: 2px solid #3b82f6`（**宽度 + 样式 + 颜色一起写**）
 *   → 写成 `--ask-card-border: #3b82f6`（只给颜色）会让整条 border **失效**（宽度归 0）——
 *     因为 `border: #3b82f6` 不是合法的 border 值。
 * - `gap: var(--ask-gap, 10px)` 这种**单值属性**，值就只写一个值。
 *
 * 之所以不给「只改颜色」的口子：内联样式把 border 的宽度/样式/颜色**一起锁死**了，
 * 队友想改宽度，class 规则（`.ask__card { border-width: 2px }`）**也压不过内联** ——
 * 所以宽度只能靠变量给，而给了变量就得给完整简写。
 *
 * ## 变量清单（11 个，都在用）
 *
 * **完整简写型（4 个）** —— 值必须写全 `宽度 样式 颜色`：
 * - `--ask-input-border` 输入框边框，默认 `1px solid rgba(127,127,127,.35)`
 * - `--ask-card-border`  答案卡边框，默认 `1px solid rgba(127,127,127,.28)`
 * - `--ask-src-border`   出处条边框，默认 `1px solid rgba(127,127,127,.22)`
 * - `--ask-step-line`    步骤分隔线（`border-top`），默认 `1px dashed rgba(127,127,127,.25)`
 *
 * **单值型（7 个）**：
 * - `--ask-gap` 横向间距（默认 `10px`）· `--ask-margin` 卡上边距（`12px`）
 * - `--ask-radius` 卡圆角（`12px`）· `--ask-pad` 卡内边距（`14px 16px`）
 * - `--ask-input-radius` 输入框圆角（`10px`）· `--ask-src-radius` 出处条圆角（`9px`）
 * - `--ask-muted` 次要文字透明度（`.62`）
 */
const ASK_STYLE = {
  row: 'display:flex; gap:var(--ask-gap,10px); flex-wrap:wrap; align-items:center',
  input:
    'flex:1 1 260px; padding:10px 12px; border-radius:var(--ask-input-radius,10px); ' +
    'border:var(--ask-input-border,1px solid rgba(127,127,127,.35)); background:transparent; color:inherit; font:inherit',
  card:
    'border:var(--ask-card-border,1px solid rgba(127,127,127,.28)); border-radius:var(--ask-radius,12px); ' +
    'padding:var(--ask-pad,14px 16px); margin-top:var(--ask-margin,12px)',
  step:
    'display:flex; gap:10px; align-items:flex-start; padding:8px 0; ' +
    'border-top:var(--ask-step-line,1px dashed rgba(127,127,127,.25))',
  src:
    'display:block; margin-top:6px; padding:9px 11px; border-radius:var(--ask-src-radius,9px); ' +
    'border:var(--ask-src-border,1px solid rgba(127,127,127,.22)); text-decoration:none',
};

/** 建「问它」面板（内容全部由 JS 生成，不改 index.html）。 */
function renderAskPanel() {
  const panel = $('#panel-mirror');
  if (!panel) return;

  // tab 标题：只在还是旧值时才改（队友自己改过就不动）
  const tabBtn = document.querySelector('#tabs button[data-tab="mirror"]');
  if (tabBtn && tabBtn.textContent.trim() === ASK_TAB_OLD_TITLE) {
    tabBtn.textContent = ASK_TAB_NEW_TITLE;
  }

  panel.innerHTML = `
    <div class="sec-title ask__head" style="flex-wrap:wrap">
      <b style="white-space:nowrap">问它一件事</b>
      <span class="tag" style="white-space:nowrap;flex:0 0 auto">知乎找答案</span>
      <span class="rule" style="flex:0 0 36px"></span>
      <span style="flex:1 1 240px;min-width:0">你说你的事，它去找<b>知乎上遇到同样问题的人</b>怎么处理的</span>
    </div>
    <div class="ask__bar" style="${ASK_STYLE.row}; margin-top:12px">
      <input id="ask-input" maxlength="100" autocomplete="off"
             placeholder="比如：工作压力大到睡不着怎么办"
             aria-label="说一件你正遇到的事"
             style="${ASK_STYLE.input}" />
      <button class="btn btn--primary" id="btn-ask">让它帮我想想</button>
    </div>
    <div class="ask__examples" style="${ASK_STYLE.row}; margin-top:10px">
      ${ASK_EXAMPLES.map(
        (q) => `<button class="btn btn--secondary" data-ask-example="${escapeHtml(q)}">${escapeHtml(q)}</button>`
      ).join('')}
    </div>
    <div id="ask-result" class="ask__result" style="margin-top:16px"></div>
    ${ZHIHU_LOGIN_HINT}
  `;

  $('#btn-ask')?.addEventListener('click', () => {
    const input = $('#ask-input');
    askAdvice(input?.value ?? '', input);
  });
  $('#ask-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btn-ask')?.click(); }
  });
  $$('#panel-mirror [data-ask-example]').forEach((b) => {
    b.addEventListener('click', () => {
      const input = $('#ask-input');
      if (input) input.value = b.dataset.askExample ?? '';
      $('#btn-ask')?.click();
    });
  });
}

/** 三档判断 → 人话标签（不能把 `applicable` 这种机器词摆给用户看）。 */
function verdictLabel(v) {
  if (v === 'applicable') return { text: '这些办法对你适用', tone: 'ok' };
  if (v === 'partially_applicable') return { text: '部分适用 —— 挑着看', tone: 'warn' };
  return { text: '这些办法跟你这情况对不上', tone: 'warn' };
}

/**
 * 问一次 —— 「抛一个问题 → 找相似困境 → 判断适用性 → 给方案」。
 *
 * ⚠️ **台词不许早于事实**：先出方案，再让桌宠开口；
 *    失败/对不上时它说的是**真话**，不是一句安慰话。
 */
async function askAdvice(question, inputEl) {
  const q = String(question ?? '').trim();
  if (!q) {
    toast('先说一件事吧', 'warn');
    return;
  }
  const box = $('#ask-result');
  const btn = $('#btn-ask');
  let waitTimer = null;
  if (btn) btn.disabled = true;
  try {
    pet.setState('thinking');
    pet.sayText('我去知乎上找找，看有没有人遇到过一样的。');
    if (box) box.innerHTML = noticeBox('正在知乎上找相似的人怎么处理的……');
    if (inputEl) inputEl.value = '';

    // ⚠️ **等久了要换句话陪他等**（2026-11-24 实测：直答真实耗时 20—35 秒）。
    //    一句「正在找…」挂 30 秒不动，用户会以为功能卡死了。
    //    ⚠️ **只说「还在等」，不假装有进度** —— 台词不许早于事实（D62）：
    //    我们不知道搜索有没有回来，所以**不能说**「知乎上找到了」。
    waitTimer = setTimeout(() => {
      if (box && box.textContent.includes('正在知乎上找')) {
        box.innerHTML = noticeBox(escapeHtml('还在等知乎那边回话……这一步可能要 20—40 秒。'));
      }
    }, 8000);

    const data = await getAdvice({ question: q, tone: state.tone?.tone });
    state.advice = data;
    state.adviceCount += 1;

    if (data.empty) {
      // ⚠️ 空数据 ≠ 失败 —— 显示后端给的那句真话，不自己编文案。
      if (box) box.innerHTML = noticeBox(escapeHtml(data.empty_notice ?? '这次没找到相关的内容。'), 'warn');
      revealAskResult(box);
      pet.setState('idle');
      pet.sayText('这次没找到能对得上的。我不给你一个查无出处的答案。');
      return;
    }

    if (box) box.innerHTML = renderAdvice(data);
    revealAskResult(box);
    pet.setState('cheer');
    // 「出处是真的」这句话，来自台词目录 —— 它说的正是这件事。
    pet.say('source');
  } catch (err) {
    if (box) box.innerHTML = noticeBox(showFail(err, '没找到答案'), 'err');
    revealAskResult(box);
    petSayFail(err, '没找到答案');
  } finally {
    if (waitTimer) clearTimeout(waitTimer);
    if (btn) btn.disabled = false;
  }
}

/**
 * 把答案滚进视野。
 *
 * ## 为什么非得写这一段
 *
 * 工作台是队友设计的「固定高度窗口」：`.app-frame__body` 自己滚动，
 * 页面滚动**滚不到窗口内部**。答案渲染在 `#ask-result`（窗口内部），
 * 不主动滚一下的话 —— 用户点完「让它帮我想想」，屏幕上什么都没变，
 * 会以为这功能没通。
 */
function revealAskResult(box) {
  if (!box) return;
  // 右下角常驻着一只悬浮桌宠（`.pc`），留出它的高度，别压住最后一条出处。
  box.style.scrollMarginBottom = '96px';
  requestAnimationFrame(() => {
    try {
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {
      /* 老浏览器不认 scrollIntoView 的参数 —— 滚不动也不影响结果 */
    }
  });
}

/** 一步方案的依据标注（**编号就是出处区块里的编号**，能对上）。 */
function srcNote(refs) {
  const list = Array.isArray(refs) ? refs : [];
  if (!list.length) return '';
  return `<span style="opacity:var(--ask-muted,.62); font-size:12px; margin-left:8px">依据 ${list.map((n) => escapeHtml(String(n))).join('、')} 条</span>`;
}

/** 方案 + 出处的渲染。出处**全部是上游真实 URL**（模型只回了编号）。 */
function renderAdvice(data) {
  const v = verdictLabel(data.verdict);
  const plan = data.plan ?? [];
  const sources = data.sources ?? [];

  const steps = plan.length
    ? `<div class="ask__plan" style="${ASK_STYLE.row}; flex-direction:column; align-items:stretch; margin-top:10px">
        ${plan
          .map(
            (s) => `<div class="ask__step" style="${ASK_STYLE.step}">
              <b class="ask__step-no" style="min-width:22px">${escapeHtml(String(s.index ?? ''))}</b>
              <span class="ask__step-text">${escapeHtml(s.text ?? '')}${srcNote(s.source_indexes)}</span>
            </div>`
          )
          .join('')}
      </div>`
    : '';

  const srcHtml = sources.length
    ? `<div class="ask__sources" style="margin-top:14px">
        <div class="sec-title ask__sources-title" style="margin-top:0;flex-wrap:wrap">
          <b style="white-space:nowrap">依据</b>
          <span class="rule" style="flex:0 0 36px"></span>
          <span style="flex:1 1 auto;min-width:0">${sources.length} 条知乎出处 · 都能点回原文</span>
        </div>
        ${sources
          .map(
            (s) => `<a class="ask__src" style="${ASK_STYLE.src}" href="${escapeHtml(s.answer_url ?? s.question_url ?? '#')}"
               target="_blank" rel="noopener">
              <div class="ask__src-title">[${escapeHtml(String(s.ref ?? ''))}] ${escapeHtml(s.question_title ?? '')}</div>
              <div class="ask__src-meta" style="opacity:var(--ask-muted,.72); font-size:12px; margin-top:3px">
                ${escapeHtml(s.author_name ?? '匿名')}${s.vote_up_count != null ? ` · ${s.vote_up_count} 赞同` : ''}
              </div>
            </a>`
          )
          .join('')}
      </div>`
    : '';

  const caveat = data.caveat
    ? `<div class="ask__caveat" style="margin-top:12px; opacity:var(--ask-muted,.8); font-size:13px">${escapeHtml(data.caveat)}</div>`
    : '';

  return `
    <div class="ask__card" style="${ASK_STYLE.card}">
      <div class="sec-title ask__card-head" style="margin-top:0;flex-wrap:wrap">
        <b class="ask__summary" style="flex:1 1 auto;min-width:0">${escapeHtml(data.summary || v.text)}</b>
        <span class="tag ${v.tone === 'ok' ? '' : 'amber'} ask__verdict" style="white-space:nowrap;flex:0 0 auto">${escapeHtml(v.text)}</span>
      </div>
      ${steps}
      ${caveat}
      ${srcHtml}
    </div>`;
}

/** 切到「问它」标签页（复用它自己的点击处理器，状态不会走偏）。 */
function switchToAskTab() {
  const btn = document.querySelector('#tabs button[data-tab="mirror"]');
  if (btn && !btn.classList.contains('is-on')) btn.click();
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
  // ⚠️ 2026-11-24：第四块原来是「独立行为信号数」（认知闭环的产物）——
  //    认知闭环下线后那个数没有了，改成**新主线自己的真实计数**：
  //    「问过几次」。0 不是「读不到」，是**真的还没问过**（本机计数，不上接口）。
  const asked = state.adviceCount;
  const sigHtml = asked > 0 ? `${asked}<i>次问过它</i>` : '还没<i>问过它</i>';
  strip.innerHTML = `
    <div class="stat hl"><div class="n">${f.collected_count ?? 0}<i>条收藏</i></div><div class="l">真实账号数据</div></div>
    <div class="sep"></div>
    <div class="stat"><div class="n">${top ? Math.round((top.ratio ?? 0) * 100) : 0}<i>% ${escapeHtml(top?.category ?? '—')}</i></div><div class="l">收藏分类 · 排第一</div></div>
    <div class="sep"></div>
    <div class="stat"><div class="n">${span.span_days ?? 0}<i>天跨度 / 集中在 ${span.distinct_days ?? 0} 天</i></div><div class="l">任务驱动型收藏</div></div>
    <div class="sep"></div>
    <div class="stat amber"><div class="n">${sigHtml}</div><div class="l">知乎找答案</div></div>
    <div class="sep"></div>
    <div class="proof">
      数字与链接均为 <b>真实账号实测</b><br />
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
  // 数据全部来自真实接口快照与台词目录；真问题走后端去知乎找相似困境，不编造。
  companion = new PetCompanion(pet, {
    getFacts: () => ({
      count: collectedCount(state.favorites),
      quota: state.quota,
    }),
    getTone: () => state.tone,
    // ⚠️ 走**同一个** `/api/advice` 接口 —— 浮窗和工作台「问它」面板共用后端
    //    那两层 5 分钟缓存（`advice:pool:*` / `advice:full:*`），
    //    所以同一个问题在两处问，**只烧一次直答额度**。
    ask: async (question) => {
      const data = await getAdvice({ question, tone: state.tone?.tone });
      state.advice = data;
      state.adviceCount += 1;
      // 「问过它 N 次」那几个数字要跟着变（首屏对话轮数 + 底栏第四块）
      updateHeroFacts(null);
      renderStrip();
      return data;
    },
  });

  // 首屏两只入口都打开同一个常驻对话面板，情绪素材共用
  $('#ch-talk')?.addEventListener('click', () => { companion.setOpen(true); companion.setMood('greet'); });
  $('#ch-pet')?.addEventListener('click', () => { companion.setOpen(true); companion.setMood('greet'); });

  // 首屏那只桌宠现在用官方动画 WebP（2026-11-23 22:3x 拟真审计换掉了那段
  // AI 生成的 mp4），**没有 video，也就不需要 no-video 回退逻辑** ——
  // 情绪素材由 pet-companion.js 直接换 src，首屏与浮窗共用同一套。

  // 顶栏详情（身份 + 今日额度，点胶囊展开）
  initNavDetail();

  renderAskPanel();
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
  // ⚠️ 工作台那颗「看一次断层」按钮（`#btn-tension`）在 `web/index.html` 里 ——
  //    那是**队友的地盘**（D65），而认知闭环已经下线（D66），这颗按钮背后没有功能了。
  //    我们**不再绑它的 handler**（绑了也是坏的），请队友把它从 index.html 里删掉。
  //    契约 `contracts/ui-contract.json` 里的 `btn-tension` 也已释放 —— 不再是钩子。

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
        // 切到「问它」这一栏时，桌宠**主动**开口 —— 但只说一句**不承诺结果**的话
        // （它还没去找过答案，不能说「我找到了」）。
        pet.sayText('有想不通的事就说一声，我上知乎替你翻翻。');
      } else {
        // 脚本 2:45：卡片先收进右侧栏
        pet.setState('idle');
        pet.say('park', { note: '卡片先收进右边那栏' });
      }
    });
  });

  // 首次上手引导（web/js/onboarding.js）
  //
  // ⚠️ 判据全部读**真实状态**（卡片数 / 问过几次 / 拿到方案没有），
  //    引导自己不发任何知乎请求 —— 它只指路，不替用户做，也不烧额度。
  guide = initOnboarding({
    probe: () => ({
      cards: state.cards.length,
      asked: state.adviceCount,
      advice: Boolean(state.advice && !state.advice.empty),
      tab: document.querySelector('#tabs button[data-tab="mirror"]')?.classList.contains('is-on') ?? false,
    }),
    switchTab: (tab) => { if (tab === 'mirror') switchToAskTab(); },
    autoStart: !demoMode,
    // 走通了（不是「跳过」）→ 弹那张完成卡，**数字全部来自真实状态**。
    // ⚠️ 原来这条线没人调 `showDone()` —— 走完了没有反馈（2026-11-24 换主线时补上）。
    onFinish: ({ skipped }) => {
      if (skipped) return;
      guide?.showDone({
        favorites: collectedCount(state.favorites),
        asked: state.adviceCount,
        sources: state.advice?.sources?.length ?? 0,
      });
    },
  });
  $('#btn-guide')?.addEventListener('click', () => guide?.start(0));

  // 演练模式：?demo=1 自动串一遍（脚本从桌宠开始，先翻到内页，别停在日报头版）
  if (demoMode) {
    $('#pet')?.scrollIntoView({ block: 'center' });   // 桌宠在工作台里，脚本从它开始
    $('#tabs')?.scrollIntoView({ block: 'start' });
    const { runDemo } = await import('./demo.js');
    runDemo({ state, feed, loadViewpoints, askAdvice, showOutro });
  }
}

init();
