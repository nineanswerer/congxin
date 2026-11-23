/**
 * 首次上手引导 —— 让新用户**自己**走通一次「认·清」认知闭环。
 *
 * ## 为什么必须有它（2026-11-23 实测，干净 profile）
 *
 * 新用户进页面：首屏能看见 9 条真实收藏，桌宠也说「要不我先啃一口」，
 * 但**页面上没有任何一处告诉他「认·清」闭环怎么走**。
 * 于是他点「看一次断层」，拿到一句：
 *
 *   「没找到断层。你说的和你做的在这几个维度上是一致的——这本身就是个结果。」
 *
 * 可他**一个字都没说过**。这不是体验问题，是**假陈述** ——
 * 违反项目自己的底线「台词不许早于事实」。照镜子面板那颗主按钮
 * （「让桌宠照照镜子」）更是连 click handler 都没绑上（id 撞了）。
 *
 * ## 三条纪律（改这个文件前先读）
 *
 * 1. **引导只指路，不替用户做**。它圈出按钮、滚到位，但每一刀都得用户自己按。
 *    所以「完成」的判定**全部来自真实状态**（卡片数 / 答题数 / 断层数 /
 *    情境题 / 版图），不是点击次数 —— 走通了才算走通。
 * 2. **引导里不许出现结论**。没答完问卷，引导只说「还差几题」，
 *    绝不说「你没断层」「你很一致」。结论只能来自真实数据。
 * 3. **引导不烧额度**。它自己不发任何知乎请求，只读前端已有的状态。
 *
 * ## 存储（都只存在这台浏览器里，跟 `congxin.pet.memory.v1` 一个口径：不上传、不跨设备）
 *
 * - `congxin.onboard.v1` —— 引导看过没有（{seen, skipped, at}）
 * - `congxin.loop.v1`    —— 认知闭环走通没有（{at, stats}）
 */

const KEY_GUIDE = 'congxin.onboard.v1';
const KEY_LOOP = 'congxin.loop.v1';

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

/** 元素「真的看得见」吗？ —— 不能用 `offsetParent`（fixed 元素的 offsetParent 是 null）。 */
function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 引导的七步。
 *
 * 每一步 = 一个**真实存在的界面元素** + 一句**不含结论**的话 + 一个**完成判据**。
 * 判据读的是真实状态，所以「走到下一步」= 「这一步真的做成了」。
 */
const STEPS = [
  {
    id: 'meet',
    title: '它叫刘看山，住在页面角落里',
    body: '点一下就能叫出来。它不替你做决定，只把你真读过的那些摊给你看。',
    target: '#ch-pet',
  },
  {
    id: 'feed',
    title: '把你的知乎收藏交给它',
    body: '它只读真实收藏。嚼出来的卡片每张都能点回知乎原文 —— 没有出处的东西它不给。',
    target: '#btn-feed',
    done: (p) => p.cards > 0,
    hint: (p) => (p.cards > 0 ? '卡片已经出来了' : '正在去知乎取你的收藏…'),
  },
  {
    id: 'tab',
    title: '「认·清」在这一栏',
    body: '点「照镜子 · 认知闭环」。接下来四步都在这一栏里。',
    target: '#tabs button[data-tab="mirror"]',
    done: (p) => p.tab,
  },
  {
    id: 'quiz',
    title: '先说说你是谁（6 题）',
    body: '测的是「你怎么说自己」，不是你的能力。断层要拿你说的跟你做的比 —— 这 6 题没说全，它下不了判断。',
    target: '#mirror-quiz',
    ensure: 'mirror',
    done: (p) => p.answered >= p.total,
    hint: (p) => `已答 ${p.answered} / ${p.total} 题`,
  },
  {
    id: 'mirror',
    title: '让它照照镜子',
    body: '自述 vs 你收藏里真正读了什么。断层、证据、置信度全在这儿。',
    target: '#btn-mirror-run',
    ensure: 'mirror',
    done: (p) => p.tension,
    hint: () => '正在把你说的和你做的放一起看…',
  },
  {
    id: 'situation',
    title: '来一道带出处的题',
    body: '题目来自知乎上的真实问题，出处带链接 —— 不是它自己出的题。',
    target: '#btn-situation',
    fallback: '#mirror-fracture',
    ensure: 'mirror',
    done: (p) => p.situation,
    hint: () => '正在出题…',
  },
  {
    id: 'terrain',
    title: '看认知版图',
    body: '断层、桥、你走过的路都在这张图上。走到这一步，这一轮就通了。',
    target: '#btn-terrain',
    fallback: '#mirror-terrain',
    ensure: 'mirror',
    done: (p) => p.terrain,
    hint: () => '正在画…',
  },
];

/**
 * 建引导。
 *
 * @param {object} opts
 * @param {() => object} opts.probe             读当前真实状态的函数（由 app.js 给）
 * @param {(tab:string) => void} opts.switchTab 切工作台标签页（app.js 给）
 * @param {boolean} [opts.autoStart]            首次访问自动开始
 * @param {(info:object) => void} [opts.onFinish]
 * @param {(info:object) => void} [opts.onStep]
 */
export function initOnboarding({ probe, switchTab, autoStart = false, onFinish, onStep } = {}) {
  const root = document.createElement('div');
  root.className = 'ob';
  root.hidden = true;
  document.body.appendChild(root);

  let index = -1;
  let timer = null;
  let marked = null;      // 当前被圈住的元素
  let running = false;
  let doneShown = false;  // 「走通了」那张卡已经挂上了吗

  function clearMark() {
    if (marked) marked.classList.remove('ob-target');
    marked = null;
  }

  /**
   * 把目标滚到视口**偏上**的位置。
   *
   * ⚠️ 不能用 `scrollIntoView({block:'center'})` —— 引导卡固定在底部中央，
   *    目标落在正中就正好被卡片盖住，用户看到的还是「没指到」。
   */
  function scrollToTarget(el) {
    const r = el.getBoundingClientRect();
    const offset = Math.max(120, Math.round(window.innerHeight * 0.3));
    const top = Math.max(0, Math.round(window.scrollY + r.top - offset));
    try {
      window.scrollTo({ top, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, top);
    }
  }

  function findTarget(step) {
    for (const sel of [step.target, step.fallback].filter(Boolean)) {
      const els = [...document.querySelectorAll(sel)];
      const visible = els.find((node) => isVisible(node));
      if (visible) return visible;
    }
    return null;
  }

  /** 挂引导卡本体（每次进入引导都重挂一次 —— 上面那张「走通了」的卡会换掉它）。 */
  function mountMain() {
    doneShown = false;
    root.innerHTML = `
      <div class="ob__card" role="dialog" aria-label="首次上手引导">
        <div class="ob__top">
          <span class="ob__count" data-ob="count"></span>
          <button class="ob__skip" type="button" data-ob="skip">跳过</button>
        </div>
        <h3 class="ob__title" data-ob="title"></h3>
        <p class="ob__body" data-ob="body"></p>
        <div class="ob__hint" data-ob="hint" hidden></div>
        <div class="ob__foot">
          <button class="btn btn--secondary" type="button" data-ob="prev">上一步</button>
          <button class="btn btn--primary" type="button" data-ob="next">下一步</button>
        </div>
      </div>`;
    root.querySelector('[data-ob="next"]')?.addEventListener('click', () => {
      if (index >= STEPS.length - 1) { finish(false); return; }
      show(index + 1);
    });
    root.querySelector('[data-ob="prev"]')?.addEventListener('click', () => { if (index > 0) show(index - 1); });
    root.querySelector('[data-ob="skip"]')?.addEventListener('click', () => finish(true));
  }

  function render() {
    const step = STEPS[index];
    if (!step) return;
    const count = root.querySelector('[data-ob="count"]');
    const title = root.querySelector('[data-ob="title"]');
    const body = root.querySelector('[data-ob="body"]');
    const hint = root.querySelector('[data-ob="hint"]');
    const prev = root.querySelector('[data-ob="prev"]');
    const next = root.querySelector('[data-ob="next"]');
    if (!count) return;

    count.textContent = `第 ${index + 1} / ${STEPS.length} 步`;
    title.textContent = step.title;
    body.textContent = step.body;

    let p = {};
    try { p = probe ? probe() : {}; } catch { p = {}; }
    const hintText = step.hint ? step.hint(p) : '';
    hint.textContent = hintText;
    hint.hidden = !hintText;

    prev.disabled = index === 0;
    next.textContent = index === STEPS.length - 1 ? '完成' : '下一步';

    // 圈住目标 + 滚到位
    clearMark();
    const target = findTarget(step);
    if (target) {
      marked = target;
      target.classList.add('ob-target');
      scrollToTarget(target);
    }
    onStep?.({ index, step, target });
  }

  function show(i) {
    const step = STEPS[i];
    if (!step) return;
    // 有几步在「照镜子」标签页里 —— 先把它翻出来，否则圈住一个看不见的元素
    if (step.ensure === 'mirror') switchTab?.('mirror');
    index = i;
    render();
  }

  function stop() {
    running = false;
    clearInterval(timer);
    timer = null;
    clearMark();
    // ⚠️ 「走通了」那张完成卡已经挂上时**不要**再藏它 ——
    //    最后一步的完成判据和 showDone() 是同一拍，谁先到都可能。
    if (!doneShown) root.hidden = true;
  }

  function finish(skipped) {
    stop();
    writeJson(KEY_GUIDE, { seen: true, skipped: !!skipped, at: new Date().toISOString() });
    onFinish?.({ skipped: !!skipped });
  }

  function check() {
    if (!running || index < 0) return;
    const step = STEPS[index];
    if (!step.done) return;
    let p = {};
    try { p = probe ? probe() : {}; } catch { return; }
    if (!step.done(p)) return;
    if (index >= STEPS.length - 1) { finish(false); return; }
    show(index + 1);
  }

  function start(from = 0) {
    mountMain();
    running = true;
    root.hidden = false;
    clearInterval(timer);
    timer = setInterval(check, 450);
    show(from);
  }

  const seen = readJson(KEY_GUIDE);
  if (autoStart && !seen?.seen) start(0);

  return {
    start,
    stop,
    show,
    /** 引导看过没有（跳过也算看过 —— 不再自动弹，但「带我走一遍」随时能重开）。 */
    seenBefore: () => Boolean(readJson(KEY_GUIDE)?.seen),
    /** 闭环走通的记录。 */
    loop: () => readJson(KEY_LOOP),
    /**
     * 闭环走通的那张卡 —— 数字全部来自这次真实跑出来的状态。
     * @param {object} stats {favorites, quiz, fractures, situation, layers}
     */
    showDone(stats) {
      const first = !readJson(KEY_LOOP);
      writeJson(KEY_LOOP, { at: new Date().toISOString(), stats });
      // 只在**第一次**走通时弹这张卡 —— 复看地形不该被一张卡挡住。
      if (!first) return;
      const rows = [
        stats.favorites != null ? `真实收藏 ${stats.favorites} 条` : null,
        stats.quiz ? `问卷 ${stats.quiz}` : null,
        stats.fractures != null ? `断层 ${stats.fractures} 条` : null,
        stats.situation ? `情境题 ${stats.situation} 道` : null,
        stats.layers != null ? `认知版图 ${stats.layers}/3 层` : null,
      ].filter(Boolean);
      clearMark();
      doneShown = true;
      root.hidden = false;
      root.innerHTML = `
        <div class="ob__card ob__card--done" role="status">
          <div class="ob__top"><span class="ob__count">这一轮走通了</span></div>
          <h3 class="ob__title">你刚刚自己走完了一次「认·清」</h3>
          <p class="ob__body">${rows.map((r) => escapeText(r)).join(' · ')} —— 这些数字都是这一次真实跑出来的。</p>
          <div class="ob__foot">
            <button class="btn btn--secondary" type="button" data-ob="again">再走一遍</button>
            <button class="btn btn--primary" type="button" data-ob="close">知道了</button>
          </div>
        </div>`;
      root.querySelector('[data-ob="close"]')?.addEventListener('click', () => { root.hidden = true; });
      root.querySelector('[data-ob="again"]')?.addEventListener('click', () => { root.hidden = true; start(0); });
    },
  };
}
