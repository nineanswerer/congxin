/**
 * 桌宠：状态机 + 气泡台词。
 *
 * ## 状态来自 D19
 *
 * 官方素材 6 个：`idle` 待机 / `thinking` 电波 / `cheer` 弥撒 / `greet` 挥手 /
 * `sleep` 睡觉 / `play` 运球。
 * 官方**没有**的三个交互瞬间，自建 CSS 过渡（**不自绘角色**）：
 * `chew` 吞咽资料 / `emitting` 吐出卡片 / `error` 失败提示。
 *
 * ## 台词不写在代码里
 *
 * 全部来自 `GET /api/tone`（契约层 `contracts/tone.json` 是唯一真源）。
 * **前端不内置台词副本** —— 两份一定会漂，换语气时前端那份必然漏改。
 * 台词没拿到时，如实提示「台词加载失败」，**不拿兜底文案糊弄**。
 */

const ASSETS = {
  idle: '../assets/kanshan/idle.webp',
  thinking: '../assets/kanshan/thinking.webp',
  cheer: '../assets/kanshan/cheer.webp',
  greet: '../assets/kanshan/greet.webp',
  sleep: '../assets/kanshan/sleep.webp',
  play: '../assets/kanshan/play.webp',
};

/** 官方素材没有的状态 → 用 idle 当底，靠 CSS 做交互过渡。 */
const SELF_BUILT = new Set(['chew', 'emitting', 'error']);

const STATE_LABEL = {
  idle: '待机',
  thinking: '电波 · 正在去知乎翻',
  chew: '吞咽 · 正在嚼你给它的东西',
  emitting: '正在吐卡片',
  cheer: '弥撒 · 卡片出来了',
  greet: '打招呼',
  play: '庆祝',
  sleep: '呆毛 · Zzz',
  error: '出错了',
};

export class Pet {
  constructor(root) {
    this.root = root;
    this.img = root.querySelector('[data-pet-img]');
    this.bubble = root.querySelector('[data-pet-bubble]');
    this.stateLabel = root.querySelector('[data-pet-state]');
    this.lines = {};
    this.options = [];
    this.state = 'idle';
    this._timer = null;
    this.setState('idle');
  }

  /** 载入语气目录（切换器选项 + 全部台词）。 */
  setTone(catalog) {
    this.lines = catalog?.lines ?? {};
    this.options = catalog?.options ?? [];
    this.toneId = catalog?.tone ?? 'gentle';
  }

  /** 换语气：台词整套换掉，事实不变（这是后端保证的）。 */
  applyTone(catalog) {
    const prev = this.toneId;
    this.setTone(catalog);
    if (prev && prev !== catalog?.tone) {
      this.say('mirror', { note: `语气已切到「${catalog?.name ?? catalog?.tone}」` });
    }
    return catalog;
  }

  setState(state) {
    this.state = state;
    this.root.dataset.state = state;
    const src = ASSETS[state] ?? ASSETS.idle;
    if (this.img.getAttribute('src') !== src) {
      this.img.setAttribute('src', src);
    }
    this.img.alt = `刘看山 · ${STATE_LABEL[state] ?? state}`;
    if (this.stateLabel) {
      this.stateLabel.textContent = STATE_LABEL[state] ?? state;
      this.stateLabel.classList.toggle('is-error', state === 'error');
    }
  }

  /**
   * 说一句话。
   * @param {string} key 台词 key（契约里的 14 个之一）
   * @param {{note?:string, highlight?:string, ms?:number}} opts
   */
  say(key, opts = {}) {
    const text = this.lines[key];
    if (!text) {
      // 台词没拿到 —— 说实话，不编
      this.setState('error');
      this.bubble.innerHTML = '';
      this.bubble.textContent = opts.note ?? '（这句台词还没拿到——语气目录加载失败。）';
      return false;
    }
    const body = opts.highlight
      ? text.replace(opts.highlight, `<span class="hl">${opts.highlight}</span>`)
      : text;
    this.bubble.innerHTML = `${body}${opts.note ? `<small>${escapeHtml(opts.note)}</small>` : ''}`;
    if (opts.ms) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.clearBubble(), opts.ms);
    }
    return true;
  }

  /** 直接显示一段话（不是台词目录里的 key，比如后端生成的数据陈述句）。 */
  sayText(html, opts = {}) {
    this.bubble.innerHTML = `${html}${opts.note ? `<small>${escapeHtml(opts.note)}</small>` : ''}`;
  }

  clearBubble() {
    this.bubble.innerHTML = '<span class="muted">（安静看着你）</span>';
  }

  /** 素材缺失时降级成静态占位（D19 的要求）。 */
  onAssetError() {
    this.img.removeAttribute('src');
    this.root.dataset.state = 'error';
    if (this.stateLabel) {
      this.stateLabel.textContent = '素材没加载出来（不影响功能）';
      this.stateLabel.classList.add('is-error');
    }
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
