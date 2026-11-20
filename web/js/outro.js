/**
 * 落版 —— 5 分钟 Demo 脚本的最后一拍（4:50—5:00）。
 *
 * ## 内容是脚本里写死的，不是台词
 *
 * `docs/P1-三件产出.md` §2.4 那一拍原文：
 * > 回到桌宠（`idle`），落版：作品名「从心」· 赛道 AI × 陪伴与交互 · 一行字「每张卡片都能点回知乎原话」
 *
 * 这一拍**没有台词**——台词在上一拍（4:30—4:50）的 `closing`（「从心。你想清楚了什么，它才算数。」）。
 *
 * ## 为什么单独一个文件、为什么不进语气目录
 *
 * 桌宠说的话必须来自 `contracts/tone.json`（唯一真源，14 句 × 2 语气，**一个字都不能写死在代码里**）。
 * 落版是**海报**，不是桌宠说的话——内容由 P1 脚本定，改它要改脚本，不是改代码。
 * 所以这里既不 import 语气目录，也不写进 `contracts/tone.json`。
 *
 * ## 触发方式（决赛现场要稳，不能只靠鼠标）
 *
 * - 顶栏「落版」按钮 —— 主持人点一下
 * - 键盘 `O` 或 `End`
 * - `?demo=1` 演练跑到最后自动出
 * - `Esc` 关掉
 *
 * ## 素材缺失时的降级（D19 的要求）
 *
 * 刘看山图加载不出来 → 隐藏图、只留文字，**不影响这拍的内容**。
 */

const OUTRO_TITLE = '从心';
const OUTRO_TRACK = 'AI × 陪伴与交互';
const OUTRO_LINE = '每张卡片都能点回知乎原话';

let petRef = null;
let outroEl = null;

export function initOutro(pet) {
  petRef = pet;
  outroEl = document.querySelector('#outro');
  if (!outroEl) return null;

  // 素材缺失 → 只留文字（D19：素材缺失降级为静态占位，业务逻辑不受影响）
  outroEl.querySelector('.outro-pet')?.addEventListener('error', (e) => {
    e.currentTarget.style.display = 'none';
  });

  document.querySelector('#btn-outro')?.addEventListener('click', () => showOutro());

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { hideOutro(); return; }
    if (e.key === 'o' || e.key === 'O' || e.key === 'End') {
      // 别抢输入框的按键
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      showOutro();
    }
  });

  return { show: showOutro, hide: hideOutro };
}

/** 出落版：回到桌宠待机 + 亮出标题卡。 */
export function showOutro() {
  if (!outroEl) return false;
  // 脚本：4:50「回到桌宠（idle）」
  petRef?.setState('idle');
  outroEl.classList.add('is-on');
  outroEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-outro');
  return true;
}

/** 收起落版，回到应用。 */
export function hideOutro() {
  if (!outroEl) return false;
  outroEl.classList.remove('is-on');
  outroEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-outro');
  return true;
}

/** 供测试与调试用：这拍的三行字以纯文本返回。 */
export function outroText() {
  return { title: OUTRO_TITLE, track: OUTRO_TRACK, line: OUTRO_LINE };
}
