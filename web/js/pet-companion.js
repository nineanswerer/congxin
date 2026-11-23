/**
 * 桌宠伴侣（借鉴 my-neuro 的交互形态，落到本项目的诚实边界内）
 *
 * my-neuro 是「全本地 1 秒响应的开源 AI 桌面伴侣」：Live2D 形象 + 语音/字幕 +
 * 长期记忆 + 主动对话。本项目没有 LLM/语音后端 —— 所以这里只借它的**交互形态**：
 *   1. 常驻、可拖拽的桌宠（不再只在工作台那一屏）
 *   2. 情绪状态（来自真实事件的拟态，不冒充真实情感）
 *   3. 主动搭话（页面打开 / 收藏回来 / 本机足迹更新 等真实事件触发）
 *   4. 打字对话（本地规则：真实数据问题查真实接口结果；其余用 tone 台词目录）
 *   5. 本机长期记忆（localStorage，明示只在这台浏览器）
 *
 * 诚实口径（必须）：
 *   - 不接 LLM，不伪装成「AI 理解了你」。能答的只有真实数据 + 台词目录。
 *   - 每一条回答都标来源：『它查到的』或『它记着的』。
 *     （2026-11-23 22:3x 拟真审计：原来写『真实数据 / 台词目录』——
 *      「台词目录」是实现术语，摆在界面上等于把内部结构给用户看。）
 *   - 记忆不上传、不跨设备，界面明示。
 */

import { escapeHtml } from './pet.js';
import { todayProgress, trailDays } from './mountain-trail.js';

const KEY = 'congxin.pet.memory.v1';

/** 本机记忆：对话条数、上次情绪、互动次数。只存本机。 */
function loadMemory() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') ?? { turns: 0, lastMood: 'idle', metAt: 0 }; }
  catch { return { turns: 0, lastMood: 'idle', metAt: 0 }; }
}
function saveMemory(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} }

/** 一个常驻悬浮桌宠伴侣。pet: Pet 实例（复用状态机/素材/气泡）。 */
export class PetCompanion {
  constructor(pet, opts = {}) {
    this.pet = pet;
    this.getFacts = opts.getFacts ?? (() => ({}));   // 由 app 注入真实数据快照
    this.getTone = opts.getTone ?? (() => null);      // 由 app 注入当前 tone 目录
    this.memory = loadMemory();
    this.open = false;
    this.buildDom();
    this.bind();
  }

  buildDom() {
    const root = document.createElement('aside');
    root.className = 'pc';
    root.id = 'pet-companion';
    root.setAttribute('aria-label', '刘看山 · 桌宠伴侣');
    root.innerHTML = `
      <div class="pc__head" data-drag>
        <span class="pc__mood" id="pc-mood"><i class="ri-robot-line" aria-hidden="true"></i><span id="pc-mood-text">在</span><small>拟态</small></span>
        <span class="pc__grip" aria-hidden="true"><i class="ri-drag-move-2-line"></i></span>
      </div>
      <div class="pc__pet" id="pc-pet" role="button" tabindex="0" aria-label="点一下和刘看山说话">
        <img src="../assets/kanshan/idle.webp" alt="刘看山" />
      </div>
      <div class="pc__panel" id="pc-panel" hidden>
        <div class="pc__log" id="pc-log" aria-live="polite"></div>
        <form class="pc__form" id="pc-form">
          <input class="pc__input" id="pc-input" maxlength="60" autocomplete="off" placeholder="问它：今天读了多少？" aria-label="和桌宠说话" />
          <button class="pc__send" type="submit" aria-label="发送"><i class="ri-send-plane-2-line" aria-hidden="true"></i></button>
        </form>
        <p class="pc__disclaimer">本地回应：只答真实数据（收藏 / 进度 / 足迹 / 额度）和它自己记着的话，不是 AI 大模型。记忆只在这台浏览器。</p>
      </div>
    `;
    document.body.appendChild(root);

    this.root = root;
    this.moodEl = root.querySelector('#pc-mood-text');
    this.img = root.querySelector('#pc-pet img');
    this.panel = root.querySelector('#pc-panel');
    this.log = root.querySelector('#pc-log');
    this.form = root.querySelector('#pc-form');
    this.input = root.querySelector('#pc-input');

    // 首条欢迎：如实说明记忆状态
    const greet = this.memory.turns > 0
      ? `你之前跟我聊过 ${this.memory.turns} 句。想问什么？`
      : '你好，我是刘看山。问我今天读了多少、额度还剩多少都行。';
    this.append('pet', greet, '它记着的');
  }

  bind() {
    const toggle = () => this.setOpen(!this.open);
    this.root.querySelector('#pc-pet').addEventListener('click', toggle);
    this.root.querySelector('#pc-pet').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.bindDrag();
  }

  /** 拖拽：只改 left/top，不碰 transform（避免和桌宠姿态层冲突）。 */
  bindDrag() {
    const handle = this.root.querySelector('[data-drag]');
    let dragging = false, offX = 0, offY = 0;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      const r = this.root.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      this.root.style.right = 'auto'; this.root.style.bottom = 'auto';
      handle.setPointerCapture?.(e.pointerId);
      this.root.classList.add('is-drag');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - this.root.offsetWidth;
      const maxY = window.innerHeight - this.root.offsetHeight;
      this.root.style.left = `${Math.max(0, Math.min(maxX, e.clientX - offX))}px`;
      this.root.style.top = `${Math.max(0, Math.min(maxY, e.clientY - offY))}px`;
    });
    const end = () => { dragging = false; this.root.classList.remove('is-drag'); };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  setOpen(v) {
    this.open = v;
    this.panel.hidden = !v;
    this.root.classList.toggle('is-active', v);
    if (v) { this.setMood('greet'); setTimeout(() => this.input?.focus(), 0); }
  }

  /** 情绪：用现有官方素材状态做拟态，标签如实写「拟态」。 */
  setMood(mood) {
    const map = {
      idle: ['idle.webp', '在', 'idle'],
      greet: ['greet.webp', '招呼', 'greet'],
      cheer: ['cheer.webp', '高兴', 'cheer'],
      thinking: ['thinking.webp', '想着', 'thinking'],
      sleep: ['sleep.webp', '困了', 'sleep'],
    };
    const [file, label, state] = map[mood] ?? map.idle;
    if (this.img.getAttribute('src') !== `../assets/kanshan/${file}`) this.img.setAttribute('src', `../assets/kanshan/${file}`);
    // 首屏那只桌宠与浮窗共用同一套情绪素材，状态保持一致。
    // 2026-11-23 22:3x：首屏改成官方动画 WebP（原来是 AI 生成的 mp4），
    // 所以这里直接换 src 就行 —— 两边始终是同一张图、同一个情绪。
    const heroImg = document.querySelector('#ch-pet .ch__pet-img');
    if (heroImg && heroImg.getAttribute('src') !== `../assets/kanshan/${file}`) {
      heroImg.setAttribute('src', `../assets/kanshan/${file}`);
    }
    this.moodEl.textContent = label;
    this.memory.lastMood = mood;
    saveMemory(this.memory);
    if (this.pet && this.pet.state !== state) this.pet.setState(state);
  }

  /** 主动搭话：由真实事件调用，话来自 tone 台词目录（不编）。 */
  proactive(lineKey, note) {
    const cat = this.getTone();
    const text = cat?.lines?.[lineKey];
    if (!text) return;
    this.setMood(lineKey === 'cheer' || lineKey === 'digest' ? 'cheer' : 'greet');
    this.append('pet', text, '它记着的');
    if (note) this.append('sys', note, '');
  }

  /** 用户打字 → 本地规则回应。可查真实数据的查真实数据，其余用台词目录。 */
  send() {
    const q = (this.input?.value || '').trim();
    if (!q) return;
    this.input.value = '';
    this.append('me', q, '');
    this.memory.turns += 1;
    saveMemory(this.memory);

    const facts = this.getFacts();
    const answer = this.resolve(q, facts);
    this.setMood(answer.mood);
    this.append('pet', answer.text, answer.source);
  }

  /** 本地规则引擎：诚实返回 { text, source, mood }。 */
  resolve(q, facts) {
    const s = q.toLowerCase();
    const count = facts.count ?? todayProgress().count ?? 0;
    const prog = todayProgress();
    const days = trailDays();
    const quota = facts.quota;

    // ⚠️ 这两个 source 是**给人看的来源标签**（2026-11-23 22:3x 拟真审计改的）。
    //    原来写「真实数据 / 台词目录」—— 后者是实现术语，等于把内部结构
    //    摆给用户看。现在统一成角色口吻：「它查到的」/「它记着的」。
    const FROM_DATA = '它查到的';
    const FROM_TONE = '它记着的';

    // 真实数据问题 → 查真实结果
    if (/今天|读了多少|收藏|几条|多少条/.test(s)) {
      return { text: count > 0 ? `今天读到了 ${count} 条真实收藏。` : '今天还没有读到收藏——去工作台喂我一条？', source: FROM_DATA, mood: count > 0 ? 'cheer' : 'idle' };
    }
    if (/进度|读到哪|目标|多少算够/.test(s)) {
      const pct = Math.round((prog.progress ?? 0) * 100);
      return { text: `今天的阅读进度是 ${pct}%（12 条是一天的目标刻度，按真实收藏条数算出来的）。`, source: FROM_DATA, mood: prog.progress >= 1 ? 'cheer' : 'idle' };
    }
    if (/足迹|记了几天|里程碑|周报/.test(s)) {
      return { text: `本机记了 ${days} 天的阅读足迹，没上传，也不跨设备。`, source: FROM_DATA, mood: 'idle' };
    }
    if (/额度|quota|api/.test(s)) {
      // ⚠️ 额度接口的真实形状是 `{ apis: [{ api_id, total, used, remaining }] }`，
      //    原来这里读 `quota.questions?.remaining` / `quota.user_data?.remaining`
      //    —— 那两个键根本不存在，于是桌宠回答额度问题只会念两个「—」：
      //    读不到，却占着两个数位（跟 D62 说的「读不到≠0」是一类毛病）。
      const list = quota?.apis ?? [];
      const find = (id) => list.find((x) => x.api_id === id);
      const disc = find('question_discovery');
      const user = find('user_data');
      const bits = [];
      if (disc) bits.push(`问题发现 ${disc.remaining}/${disc.total}`);
      if (user) bits.push(`用户数据 ${user.remaining}/${user.total}`);
      return bits.length
        ? { text: `知乎那边的额度今天还剩：${bits.join('，')}（每天重置）。`, source: FROM_DATA, mood: 'idle' }
        : { text: '今天的额度没读到。', source: FROM_DATA, mood: 'thinking' };
    }
    if (/出处|真的吗|编的|链接/.test(s)) {
      return { text: '日报里每条都能点回知乎原文——出处是收藏条目自带的，不是我补的。', source: FROM_DATA, mood: 'greet' };
    }
    if (/你好|嗨|hi|在吗|你是谁/.test(s)) {
      const cat = this.getTone();
      return { text: cat?.lines?.opening ?? '我在这儿，陪你干活。', source: FROM_TONE, mood: 'greet' };
    }

    // 其余：用台词目录回应。
    // ⚠️ 不再把「台词目录」这个实现术语说给用户听（拟真），
    //    但**诚实那层意思留着**：它给的不是查出来的答案，只是陪你的话。
    const cat = this.getTone();
    const line = cat?.lines?.park ?? cat?.lines?.offer;
    return {
      text: line ? `${line}（这句是陪你的，不是我查出来的）` : '这句我接不住——我只会陪你读、陪你聊，不会回答问题。',
      source: FROM_TONE,
      mood: 'thinking',
    };
  }

  /** 追加一条消息到对话面板。 */
  append(who, text, source) {
    // 首屏气泡跟着对话走：只显示桌宠说的话，纯文本写入，不套 HTML
    if (who === 'pet') {
      // 只改文字节点，保留前面的 Remix Icon（气泡结构 = icon + span）
      const bubbleText = document.getElementById('ch-bubble-text');
      if (bubbleText) bubbleText.textContent = text.length > 34 ? `${text.slice(0, 34)}…` : text;
    }
    const el = document.createElement('div');
    el.className = `pc__msg pc__msg--${who}`;
    el.innerHTML = `${who === 'me' ? '<b>你</b>' : who === 'sys' ? '<b>·</b>' : '<b>看山</b>'}<span>${escapeHtml(text)}</span>${source ? `<small>${escapeHtml(source)}</small>` : ''}`;
    this.log.appendChild(el);
    this.log.scrollTop = this.log.scrollHeight;
    while (this.log.children.length > 30) this.log.removeChild(this.log.firstChild);
  }
}
