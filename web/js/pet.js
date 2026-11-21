/**
 * 桌宠：状态机 + 气泡台词 + 运动层。
 *
 * ## 状态来自 D19
 *
 * 官方素材 6 个：`idle` 待机 / `thinking` 电波 / `cheer` 弥撒 / `greet` 挥手 /
 * `sleep` 睡觉 / `play` 运球。
 * 官方**没有**的三个交互瞬间，自建 CSS 过渡（**不自绘角色**）：
 * `chew` 吞咽资料 / `emitting` 吐出卡片 / `error` 失败提示。
 *
 * ## 运动分三层，各有各的锅（别合并）
 *
 * 1. **素材自身的帧动画**：`assets/kanshan/*.webp` 是动画 WebP，角色本来就在动。
 * 2. **`.petfigure` 上的姿态**（本文件 `_pose()`）：跟随鼠标的轻微倾斜/位移，
 *    由 CSS 变量 + `transition` 插值。**绝不写死在 `<img>` 上** —— 动画 WebP
 *    会把每帧和 transform 重新合成，产生白边和残影（D39 / 11-19 实拍）。
 * 3. **`.petanim` 上的循环与一次性动画**（纯 CSS）：呼吸、摇摆、弹跳、垂头、落地、点头。
 *
 * 为什么 2 和 3 必须拆两层：`animation` 会整体覆盖 `transform`，写在同一元素上时，
 * 只要呼吸在跑，鼠标跟随就会被顶掉。
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

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class Pet {
  constructor(root) {
    this.root = root;
    this.img = root.querySelector('[data-pet-img]');
    this.bubble = root.querySelector('[data-pet-bubble]');
    this.stateLabel = root.querySelector('[data-pet-state]');
    this.figure = root.querySelector('.petfigure');   // 姿态层（变量 + transition）
    this.pose = root.querySelector('.petanim');       // 动画层（keyframes）
    this.lines = {};
    this.options = [];
    this.state = 'idle';
    this._timer = null;
    this._swapTimer = null;
    this._landTimer = null;
    this._talkTimer = null;
    this._preload();
    this.attachMotion();
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

  /**
   * 切状态。换素材**不做硬切**：先收小 → 换图 → 弹回落位。
   *
   * 90ms 的收小刚好盖住换图那一下：即便缓存命中，硬切也会让动作「跳」一下；
   * 缓存没命中时这一下还能遮住白帧（素材另外做了预加载，见 `_preload`）。
   */
  setState(state) {
    this.state = state;
    this.root.dataset.state = state;

    const src = ASSETS[state] ?? ASSETS.idle;
    if (this.img.getAttribute('src') !== src) {
      if (this._reduced()) {
        // 减少动态效果：别为了好看拖慢状态切换
        this.img.setAttribute('src', src);
      } else {
        this.figure?.classList.add('is-swapping');
        clearTimeout(this._swapTimer);
        this._swapTimer = setTimeout(() => {
          this.img.setAttribute('src', src);
          this.figure?.classList.remove('is-swapping');
          this._land();
        }, 90);
      }
    }

    this.img.alt = `刘看山 · ${STATE_LABEL[state] ?? state}`;
    if (this.stateLabel) {
      this.stateLabel.textContent = STATE_LABEL[state] ?? state;
      this.stateLabel.classList.toggle('is-error', state === 'error');
    }
  }

  /**
   * 预加载状态素材。
   * 不预加载的话，第一次进某个状态会先白一帧 —— 转场再顺也看得出闪。
   *
   * 但不能一口气全发（6 张约 1MB），那会跟首屏抢带宽：
   * 开屏马上要用的 greet / thinking 先来，其余等空闲再补。
   */
  _preload() {
    const current = this.img.getAttribute('src');
    const load = (src) => {
      if (!src || src === current) return;
      const im = new Image();
      im.decoding = 'async';
      im.src = src;
    };
    load(ASSETS.greet);
    load(ASSETS.thinking);

    const rest = () => { for (const s of ['cheer', 'play', 'sleep']) load(ASSETS[s]); };
    if ('requestIdleCallback' in window) requestIdleCallback(rest, { timeout: 3000 });
    else setTimeout(rest, 1200);
  }

  /** 系统是否要求「减少动态效果」。 */
  _reduced() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }

  /** 落地弹一下（换状态之后）。同名动画要重播，必须先把类去掉并强制重排。 */
  _land() {
    if (this._reduced()) return;
    this.root.classList.remove('is-landing');
    void this.root.offsetWidth;
    this.root.classList.add('is-landing');
    clearTimeout(this._landTimer);
    this._landTimer = setTimeout(() => this.root.classList.remove('is-landing'), 500);
  }

  /** 开口：整个身子点一下，让「话」和「身体」连起来。 */
  _talk() {
    if (this._reduced() || !this.pose) return;
    if (this.state === 'error') return;   // 垂头态不点头，别抢戏
    this.root.classList.remove('is-talking');
    void this.root.offsetWidth;
    this.root.classList.add('is-talking');
    clearTimeout(this._talkTimer);
    this._talkTimer = setTimeout(() => this.root.classList.remove('is-talking'), 520);
  }

  /**
   * 跟随鼠标：朝指针方向轻微倾斜 + 位移（上限 ±2.2°、±3px）。
   *
   * - 只在非「减少动态效果」时绑定；
   * - `pointermove` 用 rAF 合并，不会每个事件都强制读一次布局；
   * - 只写 CSS 变量，由 `.petfigure` 的 transform 消费 —— 绝不碰 `<img>`。
   */
  attachMotion() {
    if (!this.figure || this._reduced()) return;
    const REACH = 380;   // 指针离它多远算「满量」
    let x = 0;
    let y = 0;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const r = this.figure.getBoundingClientRect();
      if (!r.width) return;
      const nx = clamp((x - (r.left + r.width / 2)) / REACH, -1, 1);
      const ny = clamp((y - (r.top + r.height / 2)) / REACH, -1, 1);
      this._pose(nx, ny);
    };

    window.addEventListener('pointermove', (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });

    const rest = () => this._pose(0, 0);
    window.addEventListener('blur', rest);
    document.addEventListener('pointerleave', rest);
  }

  /** 把归一化后的指针偏移（-1 ~ 1）写进姿态变量。 */
  _pose(nx, ny) {
    const f = this.figure;
    if (!f) return;
    f.style.setProperty('--pet-tilt', `${(nx * 2.2).toFixed(2)}deg`);
    f.style.setProperty('--pet-shift', `${(nx * 3).toFixed(1)}px`);
    f.style.setProperty('--pet-lift', `${(ny * 2).toFixed(1)}px`);
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
    this._talk();
    return true;
  }

  /** 直接显示一段话（不是台词目录里的 key，比如后端生成的数据陈述句）。 */
  sayText(html, opts = {}) {
    this.bubble.innerHTML = `${html}${opts.note ? `<small>${escapeHtml(opts.note)}</small>` : ''}`;
    this._talk();
  }

  clearBubble() {
    this.bubble.innerHTML = '<span class="muted">（安静看着你）</span>';
  }

  /** 素材缺失时降级成静态占位（D19 的要求）。 */
  onAssetError() {
    // 清掉转场类，别让它停在「收小」那一帧
    this.figure?.classList.remove('is-swapping');
    this.root.classList.remove('is-landing', 'is-talking');
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
