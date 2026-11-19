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
  apiGet, getTone, getFavorites, getTension, getSituation, getCards, getTerrain, answerTerrain,
  getProfile, getQuota, ApiFail,
} from './api.js';
import { Pet, escapeHtml } from './pet.js';
import { QUESTIONS, scoreQuiz, DIMENSION_LABELS } from './quiz.js';
import { renderTerrain, zoomFracture } from './terrain.js';

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
};

let pet = null;

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
 * 主题词候选（情境题侧）—— 问卷自述的特质词排在最前。
 *
 * 断层问的就是「你说的那个特质」，所以出题的主题词应该就是那个特质
 * （「长期主义」「体系化」…，实测能出带出处的真题）。
 */
function topicCandidates() {
  const out = [];
  const push = (t) => {
    const s = String(t ?? '').trim();
    if (!s || s.length < 2 || s.length > 24) return;
    if (out.includes(s)) return;
    out.push(s);
  };
  for (const t of scoreQuiz(state.quizPicked).traits ?? []) push(t);
  for (const t of materialTopicCandidates()) push(t);
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
  } catch {
    pill.textContent = '额度没读到';
    pill.classList.add('warn');
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

function cardHtml(c) {
  const src = c.source ?? {};
  const hasSource = Boolean(src.question_url || src.answer_url || src.url);
  const link = src.answer_url || src.question_url || src.url;
  const srcLine = hasSource
    ? `<a class="src" href="${escapeHtml(link)}" target="_blank" rel="noopener">
         ${escapeHtml(src.kicker ?? '知乎原文')}
         <span class="link">${escapeHtml(shortHost(link))}</span>
       </a>`
    : `<span class="src" style="color:var(--ink3);background:transparent;border-color:var(--line)">
         没有知乎出处（这条是你自己给的材料）
       </span>`;

  return `
    <div class="card">
      <div class="kicker">${escapeHtml(c.kicker ?? '卡片')}</div>
      <div class="title">${escapeHtml(c.title)}</div>
      ${quoteHtml(c.summary)}
      ${c.meta ? `<div class="meta">${escapeHtml(c.meta)}</div>` : ''}
      ${srcLine}
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
    <div class="cardlist" style="margin-top:12px">${state.cards.map(cardHtml).join('')}</div>`;
}

function renderViews() {
  const box = $('#flow-views');
  if (!state.viewpoints.length) {
    box.innerHTML = '';
    return;
  }
  const vs = state.viewpoints.map((c) => cardHtml({
    kicker: '知乎 · 真实问题与回答',
    title: c.source?.question_title ?? c.title ?? '（知乎上的一个真实问题）',
    summary: c.content ?? c.source?.answer_summary ?? '',
    meta: c.source?.answer_content_type === 'answer' ? '这条是知乎上的真实回答' : null,
    source: { ...(c.source ?? {}), kicker: '知乎原回答' },
  })).join('');

  box.innerHTML = `
    <div class="sec-title" style="margin-top:6px">
      <b>知乎上的两种说法</b>
      <span class="tag">真实问题 · 真实回答</span>
      <span class="rule"></span>
      <span>不是它编的，是知乎上有的</span>
    </div>
    <div class="split" style="margin-top:12px">
      <div class="cardrow">${vs}</div>
      <div class="vs">VS</div>
    </div>`;
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
    <div class="cardlist" style="margin-top:12px">${all.map(cardHtml).join('')}</div>`;
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

    pet.setState('emitting');
    pet.say('digest', { note: '每张卡片的出处都能点回知乎原文' });

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
  } catch (err) {
    pet.setState('error');
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
    pet.setState('thinking');
    pet.say('viewpoints');

    let res = null;
    let lastNotice = '';
    let lastErr = null;
    for (const topic of candidates.slice(0, 4)) {
      try {
        const r = await getCards({ topic, count: 2, seenSources: seen, tone: state.tone?.tone });
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
    pet.setState('cheer');
    pet.say('disagree', { note: '原话，附链接' });
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '去知乎翻失败'), 'err');
    pet.setState('error');
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
              <button class="opt" data-qid="${q.id}" data-idx="${i}">
                <span class="k">${escapeHtml(o.k)}</span>${escapeHtml(o.text)}
              </button>`).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:14px; display:flex; gap:10px">
      <button class="btn primary" id="btn-tension">让桌宠照照镜子</button>
      <button class="btn ghost" id="btn-reset-quiz">重选</button>
    </div>`;

  $$('#mirror-quiz .opt').forEach((b) => {
    b.addEventListener('click', () => {
      const { qid, idx } = b.dataset;
      state.quizPicked[qid] = Number(idx);
      $$(`#mirror-quiz .opt[data-qid="${qid}"]`).forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
    });
  });
  $('#btn-reset-quiz').addEventListener('click', () => {
    state.quizPicked = {};
    renderQuiz();
  });
  $('#btn-tension').addEventListener('click', runTension);
}

async function runTension() {
  const btn = $('#btn-tension');
  btn.disabled = true;
  const box = $('#mirror-fracture');
  try {
    const report = scoreQuiz(state.quizPicked);
    pet.setState('thinking');
    pet.say('mirror');
    box.innerHTML = noticeBox('正在把你的话和你收藏的东西放在一起看……');

    const data = await getTension(report, state.tone?.tone);
    state.tension = data;

    if (data.insufficient) {
      box.innerHTML = noticeBox(
        `<b>信号不够，断层不成立。</b>${escapeHtml(data.insufficient_reason ?? '')}`,
        'warn'
      );
      pet.setState('idle');
      pet.say('insufficient');
      return;
    }
    if (!data.has_tension || !(data.fractures ?? []).length) {
      box.innerHTML = noticeBox(
        `<b>没找到断层。</b>你说的和你做的在这几个维度上是一致的——这本身就是个结果。`,
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
        <button class="btn primary" id="btn-situation">来一道带出处的题</button>
        <button class="btn ghost" id="btn-terrain">看地形</button>
      </div>`;

    pet.setState('cheer');
    pet.say('fracture', { note: '不确定的地方在证据栏里说清楚了' });

    $('#btn-situation').addEventListener('click', loadSituation);
    $('#btn-terrain').addEventListener('click', loadTerrain);
  } catch (err) {
    box.innerHTML = noticeBox(showFail(err, '对照失败'), 'err');
    pet.setState('error');
  } finally {
    btn.disabled = false;
  }
}

async function loadSituation() {
  const box = $('#mirror-situation');
  const btn = $('#btn-situation');
  btn.disabled = true;
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
    for (const topic of candidates.slice(0, 3)) {
      try {
        const res = await getSituation({ topic, count: 1, selfReport: state.tension?.self_reported });
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
           target="_blank" rel="noopener">知乎原回答<span class="link">${escapeHtml(shortHost(q.source?.answer_url ?? q.source?.question_url ?? ''))}</span></a>
      </div>
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
    pet.setState('error');
  } finally {
    btn.disabled = false;
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
      <div class="card" style="border-color:rgba(93,211,158,.4)">
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
    pet.setState('error');
  }
}

async function loadTerrain() {
  const wrap = $('#mirror-terrain');
  try {
    const data = await getTerrain(state.tone?.tone);
    state.terrain = data;
    renderTerrain(wrap, data, (f) => {
      zoomFracture(wrap, true);
      pet.setState('thinking');
      pet.sayText(
        `<b>${escapeHtml(f.label)}</b><br />强度 ${Math.round((f.intensity ?? 0) * 100)}% ·
         置信度 ${Math.round((f.confidence ?? 0) * 100)}%`,
        { note: f.confidence_note ?? '' }
      );
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
  } catch (err) {
    wrap.innerHTML = noticeBox(showFail(err, '读地形失败'), 'err');
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

// ---------------------------------------------------------------- 启动

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function init() {
  pet = new Pet($('#pet'));
  pet.img.addEventListener('error', () => pet.onAssetError());

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

  renderQuiz();
  renderCards();
  await loadProfile();
  loadQuota();

  // 材料：真实收藏
  try {
    state.favorites = await getFavorites(9);
    renderMaterials();
    renderStrip();
    // 脚本 0:15：材料摊开了，桌宠转头问一句「要不我先啃一口？」
    pet.setState('greet');
    pet.say('offer', { note: '拖一条到它身上，或者点下面的按钮' });
  } catch (err) {
    $('#materials').innerHTML = noticeBox(showFail(err, '读收藏失败'), 'err');
  }

  // 事件
  $('#btn-feed').addEventListener('click', feed);
  $('#btn-views').addEventListener('click', loadViewpoints);

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
        pet.say('mirror', { note: '你收藏的这些，跟你刚才说的不太一样' });
      } else {
        // 脚本 2:45：卡片先收进右侧栏
        pet.setState('idle');
        pet.say('park', { note: '卡片先收进右边那栏' });
      }
    });
  });

  // 演练模式：?demo=1 自动串一遍
  if (new URLSearchParams(location.search).has('demo')) {
    const { runDemo } = await import('./demo.js');
    runDemo({ state, feed, loadViewpoints, runTension, loadSituation, answerSituation, loadTerrain });
  }
}

init();
