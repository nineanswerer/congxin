/**
 * 演练模式 —— `?demo=1` 自动跑一遍 5 分钟 Demo 脚本的骨架。
 *
 * **为什么需要它**：
 * 决赛只有 5 分钟，中途点错一下就断节奏。这个模式把
 * 「喂材料 → 吐卡片 → 知乎补观点 → 照镜子 → 断层 → 情境题 → 作答 → 地形」
 * 按脚本自动串一遍，**中间不依赖手速**。
 *
 * 用法：
 *   http://localhost:18788/web/?demo=1
 *   http://localhost:18788/web/?demo=1&fast=1     # 截图/自测用，节奏 ×0.25
 *   http://localhost:18788/web/?demo=1&quiz=deep  # 预设一套「先想通整条路」的答案
 *
 * ⚠️ **演练也会真调知乎**：卡片接口吃「问题发现」额度（1 张卡 ≈ 2 次）。
 * 同主题有缓存，反复演同一主题基本不烧额度；换主题会真的花。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 预设答案：q1—q6 全选 A ——「先想通整条路 / 完整方法 / 原理 / 成体系 / 关系 / 想透做体系」。 */
const DEEP_ANSWERS = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0 };

export async function runDemo(ctx) {
  const {
    state, feed, loadViewpoints, runTension, loadSituation, answerSituation, loadTerrain,
  } = ctx;

  const params = new URLSearchParams(location.search);
  const fast = params.has('fast');
  const wait = (ms) => sleep(fast ? Math.round(ms * 0.25) : ms);
  const step = (n, text) => console.log(`[demo] ${n}. ${text}`);

  // ---- 1. 喂材料 → 吐卡片 ----
  step(1, '喂它收藏');
  await wait(700);
  await feed();

  // ---- 2. 知乎补观点 ----
  step(2, '知乎上大家怎么说');
  await wait(1800);
  await loadViewpoints();

  // ---- 3. 切到「照镜子」 ----
  step(3, '桌宠主动发起照镜子');
  await wait(1600);
  document.querySelector('#tabs button[data-tab="mirror"]')?.click();

  // ---- 4. 答问卷（预设） ----
  step(4, '答问卷');
  await wait(900);
  const preset = params.get('quiz') === 'deep' ? DEEP_ANSWERS : DEEP_ANSWERS;
  for (const [qid, idx] of Object.entries(preset)) {
    state.quizPicked[qid] = idx;
    document
      .querySelector(`#mirror-quiz .opt[data-qid="${qid}"][data-idx="${idx}"]`)
      ?.classList.add('is-on');
  }

  // ---- 5. 断层 ----
  step(5, '自述 vs 行为 → 断层');
  await wait(700);
  await runTension();

  // ---- 6. 情境题 ----
  step(6, '出一道带出处的题');
  await wait(1600);
  await loadSituation();

  // ---- 7. 作答 → 地形 ----
  const q = state.situation;
  if (q && (q.options ?? []).length) {
    step(7, '作答 → 地形生长');
    await wait(1500);
    await answerSituation(q, q.options[0].key);
  } else {
    // **不许静默跳过**：面板上已经有后端给的真提示（空数据 ≠ 失败），
    // 这里补一句让观众知道「不是卡住了」，然后照样把地形拉出来。
    step(7, '这次没出到题（面板上是真提示），地形照常看');
    await wait(600);
  }

  // ---- 8. 地形 ----
  step(8, '看地形');
  await wait(900);
  await loadTerrain();

  step(9, '完');
  return true;
}
