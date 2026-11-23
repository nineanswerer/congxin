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
 * 找**第一道还没答**的问卷题。
 *
 * ⚠️ 不能指整个 `#mirror-quiz` —— 那个容器有 500 多像素高，
 *    引导卡固定在底部，中间那几道题必然被卡片压住。
 *    指「下一道没答的题」才对：它矮、位置准、答完自动往前挪。
 */
function firstUnansweredQuestion() {
  const qs = [...document.querySelectorAll('#mirror-quiz .q')];
  for (const q of qs) {
    const opts = [...q.querySelectorAll('.opt')];
    if (opts.length && !opts.some((o) => o.classList.contains('is-on'))) return q;
  }
  return qs[0] || null;
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
    target: '#mirror-quiz .q',
    resolve: firstUnansweredQuestion,
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
    // ⚠️ `#btn-situation` 是**跑完断层之后**才插进 DOM 的。
    //    还没跑出来时得指个别的（照镜子面板本身），否则这一步什么都不指。
    fallback: '#panel-mirror',
    ensure: 'mirror',
    done: (p) => p.situation,
    hint: () => '正在出题…',
  },  {
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
   * 文档末尾的**可滚动余量**。
   *
   * ⚠️ 有些目标元素贴着文档末尾（比如工作台那排标签按钮）：
   *    页面滚到底，它也只能停在视口下半截 —— 正好被底部的引导卡盖住。
   *    这不是滚动算法能解决的：**文档就这么高，滚不出那个位置**。
   *    所以得在文档末尾临时垫一段空白，把可滚动量补够。
   *    引导结束就撤掉（撤时同步修正 scrollY，画面不跳）。
   */
  const PAD_ID = 'ob-scroll-pad';

  function padEl() {
    let p = document.getElementById(PAD_ID);
    if (!p) {
      p = document.createElement('div');
      p.id = PAD_ID;
      p.setAttribute('aria-hidden', 'true');
      p.style.height = '0px';
      document.body.appendChild(p);
    }
    return p;
  }

  function releasePad() {
    const p = document.getElementById(PAD_ID);
    if (!p) return;
    const h = parseFloat(p.style.height) || 0;
    if (!h) { p.remove(); return; }   // 从没垫高过 → 顺手把这个空节点也带走
    const vh = window.innerHeight;
    const before = document.documentElement.scrollHeight - vh;
    p.style.height = '0px';
    const after = document.documentElement.scrollHeight - vh;
    const delta = before - after;
    // ⚠️ 撤掉垫高的那一拍，视口可能停在「新文档滚不到的位置」——
    //    把 scrollY 一起拉回来，画面才不会突然往上跳一截。
    if (delta > 0 && window.scrollY > after) {
      window.scrollTo(0, Math.max(0, window.scrollY - delta));
    }
    p.remove();
  }

  /**
   * 把目标滚到**引导卡上方**的空当里。
   *
   * ⚠️ 不能用 `scrollIntoView({block:'center'})` —— 引导卡固定在底部中央，
   *    目标落在视口正中就正好被卡片盖住，用户看到的还是「没指到」。
   * ⚠️ 也不能只按「顶部放到 30%」算 —— 首屏那只桌宠有 300 多像素高，
   *    顶到 30% 它的**下半身**照样压在卡片底下。
   *    所以：目标矮 → 在卡片上方居中；目标比空当还高 → 顶对齐，绝不往下压。
   * ⚠️ 目标在文档末尾时，光调算法没用 —— 文档没那么高，滚不出那个位置。
   *    得先垫空白（见上面的 releasePad 说明）。
   */
  function scrollToTarget(el) {
    const r = el.getBoundingClientRect();
    const card = root.querySelector('.ob__card');
    const cardH = card ? card.getBoundingClientRect().height : 188;
    const vh = window.innerHeight;
    const avail = Math.max(140, vh - 76 - cardH - 24);
    const offset = r.height >= avail ? 80 : Math.max(80, (avail - r.height) / 2);
    const absTop = window.scrollY + r.top;
    const desired = Math.max(0, Math.round(absTop - offset));

    // 文档不够高 → 垫空白把可滚动量补够。
    // ⚠️ 基准必须是「**不含**垫高的文档高度」——
    //    拿已含垫高的 scrollHeight 去比，会越垫越不够（垫一次算一次，永远差一截）。
    const pad = padEl();
    const cur = parseFloat(pad.style.height) || 0;
    const baseH = document.documentElement.scrollHeight - cur;
    const need = desired - (baseH - vh) + 24;
    if (need > cur) {
      pad.style.height = need + 'px';
      // 垫高会改变可滚动量，重算一次目标位置
      const absTop2 = window.scrollY + el.getBoundingClientRect().top;
      scrollTo(absTop2 - offset);
      return;
    }
    scrollTo(absTop - offset);
  }

  function scrollTo(top) {
    const t = Math.max(0, Math.round(top));
    try {
      window.scrollTo({ top: t, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, t);
    }
  }

  function findTarget(step) {
    // 动态目标优先（比如「下一道没答的题」—— 答完自动往前挪）
    if (step.resolve) {
      try {
        const el = step.resolve();
        if (el && isVisible(el)) return el;
      } catch { /* 解析失败就退回静态选择器 */ }
    }
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

  /** 刷新进度提示（「已答 3 / 6 题」这种）—— 每次轮询都要跟着真实状态走。 */
  function refreshHint(step, p) {
    const hint = root.querySelector('[data-ob="hint"]');
    if (!hint) return;
    const hintText = step.hint ? step.hint(p) : '';
    hint.textContent = hintText;
    hint.hidden = !hintText;
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
    refreshHint(step, p);

    prev.disabled = index === 0;
    next.textContent = index >= STEPS.length - 1 ? '完成' : '下一步';

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
    // 撤掉垫出来的空白 —— 引导不留在页面上留痕
    releasePad();
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
    let p = {};
    try { p = probe ? probe() : {}; } catch { return; }

    // 动态目标要**跟着用户走** —— 答完一题，圈就挪到下一道没答的题。
    // 不这么做的话，圈会一直停在他已经答过的那道题上。
    refreshHint(step, p);
    if (step.resolve) {
      const next = findTarget(step);
      if (next && next !== marked) {
        clearMark();
        marked = next;
        next.classList.add('ob-target');
        scrollToTarget(next);
      }
    }

    if (!step.done) return;
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
