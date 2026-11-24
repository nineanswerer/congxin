/**
 * 演练模式 —— `?demo=1` 自动跑一遍 5 分钟 Demo 脚本的骨架。
 *
 * **为什么需要它**：
 * 决赛只有 5 分钟，中途点错一下就断节奏。这个模式把
 * 「喂材料 → 吐卡片 → 知乎补观点 → 问它 → 出方案 → 落版」
 * 按脚本自动串一遍，**中间不依赖手速**。
 *
 * 用法：
 *   http://localhost:18788/web/?demo=1
 *   http://localhost:18788/web/?demo=1&fast=1     # 截图/自测用，节奏 ×0.25
 *
 * ⚠️ **2026-11-24（D66）：脚本随新主线重写。**
 *    原来第 3—8 步是「问卷 → 断层 → 情境题 → 地形」，那是认知闭环，
 *    **已经整体下线** —— 留着就是演一套不存在的东西。
 *    现在第 3—4 步是「翻到「问它」→ 抛一个问题 → 它上知乎找相似困境 → 出方案」。
 *
 * ⚠️ **演练也会真调知乎**：
 *    - 「喂它收藏」吃**用户数据**额度；
 *    - 「知乎上大家怎么说」吃**问题发现**额度；
 *    - 「问它」吃**知乎搜索**（5000/天）+ **直答**（100/天）。
 *    后端两层缓存各 5 分钟（`advice:pool:*` / `advice:full:*`），
 *    **同一个问题重复演不烧直答额度** —— 演练与正式演示可以共用同一个问题。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 演练用的那个问题。
 *
 * ⚠️ 选它是有理由的：知乎上**真的有人写过**这个问题（2026-11-24 实测
 * `zhihu_search` 返回 10 条真实回答），所以现场一定能出方案 + 出处，
 * 不会演成一句「没搜到」。
 */
const DEMO_QUESTION = '工作压力大到睡不着怎么办';

export async function runDemo(ctx) {
  const {
    feed, loadViewpoints, askAdvice, showOutro,
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

  // ---- 3. 切到「问它」 ----
  step(3, '翻到「问它」这一栏');
  await wait(1600);
  document.querySelector('#tabs button[data-tab="mirror"]')?.click();

  // ---- 4. 抛一个问题 → 它上知乎找相似困境 → 出方案 ----
  //
  // ⚠️ 先把话**打进输入框**再问：观众要看见「它接的是我说的话」，
  //    凭空冒出答案像是它自己想的。
  step(4, '抛一个问题 → 知乎找相似困境 → 给方案');
  await wait(1500);
  const input = document.querySelector('#ask-input');
  if (input) input.value = DEMO_QUESTION;
  await askAdvice(DEMO_QUESTION, input);

  // ---- 5. 落版（脚本 4:50—5:00 那一拍）----
  step(5, '落版');
  await wait(1400);
  showOutro?.();

  step(6, '完');
  return true;
}
