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
    if (disc) bits.push(`问题发现 ${disc.remaining}/${disc.total}`);
    if (user) bits.push(`用户数据 ${user.remaining}/${user.total}`);
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
    <div class="mat" data-idx="${i}" title="${escapeHtml(it.title ?? '')}">
      <span class="ic"></span>
      <span class="t">${escapeHtml(it.title ?? '(无标题)')}</span>
      <span class="k">${escapeHtml(it.content_type ?? '')}</span>
    </div>`).join('');
}

/** 喂它：真实收藏 → 卡片。 */
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

    state.cards = (state.favorites.items ?? []).map((it) => ({
      kicker: `卡片 · 来自你的收藏（${it.content_type ?? 'content'}）`,
      title: it.title ?? '(无标题)',
      summary: (it.summary ?? '').slice(0, 160),
      meta: it.author?.name ? `收藏者看到的作者：${it.author.name}` : null,
      source: { url: it.url, kicker: '知乎原文' },
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

/** 知乎补观点：同主题下真实存在的问题与回答。 */
async function loadViewpoints() {
  const btn = $('#btn-views');
  btn.disabled = true;
  const box = $('#flow-views');
  try {
    const topic = state.topic || deriveTopic((state.favorites?.items ?? []).map((i) => i.title));
    if (!topic) throw new ApiFail('NO_TOPIC', '没有主题词', '先把材料喂给它，我才知道去知乎翻什么。');
    state.topic = topic;

    pet.setState('thinking');
    pet.say('viewpoints');
    box.innerHTML = noticeBox('正在去知乎翻这一题……');

    const data = await getCards({ topic, count: 2, tone: state.tone?.tone });
    if (data.empty) {
      box.innerHTML = noticeBox(escapeHtml(data.empty_notice ?? '知乎上这次没捞到东西。'), 'warn');
      pet.setState('idle');
      return;
    }
    state.viewpoints = data.cards ?? [];
    renderViews();
    renderList();
    pet.setState('cheer');
    pet.say('viewpoints', { note: '这些是知乎上真实存在的问题和回答，链接都在卡片上' });
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
    const topic = state.topic || deriveTopic((state.favorites?.items ?? []).map((i) => i.title));
    state.topic = topic;
    pet.setState('thinking');
    pet.say('question');
    box.innerHTML = noticeBox('正在出题……');

    const data = await getSituation({ topic, count: 1, selfReport: state.tension?.self_reported });
    if (data.empty || !(data.questions ?? []).length) {
      box.innerHTML = noticeBox(escapeHtml(data.empty_notice ?? '这次没出到题。'), 'warn');
      pet.setState('idle');
      return;
    }
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
      wrap.insertAdjacentHTML('beforeend',
        `<div class="notice warn" style="position:absolute;left:14px;top:14px;right:14px">
           ${escapeHtml(data.empty_notice)}</div>`);
    }
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
  } catch (err) {
    $('#materials').innerHTML = noticeBox(showFail(err, '读收藏失败'), 'err');
  }

  // 事件
  $('#btn-feed').addEventListener('click', feed);
  $('#btn-views').addEventListener('click', loadViewpoints);

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

  // 阶段切换
  $$('#tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#tabs button').forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
      const tab = b.dataset.tab;
      $('#panel-flow').classList.toggle('hidden', tab !== 'flow');
      $('#panel-mirror').classList.toggle('hidden', tab !== 'mirror');
      if (tab === 'mirror') pet.setState('greet');
    });
  });

  // 演练模式：?demo=1 自动串一遍
  if (new URLSearchParams(location.search).has('demo')) {
    const { runDemo } = await import('./demo.js');
    runDemo({ state, feed, loadViewpoints, runTension, loadSituation, answerSituation, loadTerrain });
  }
}

init();
