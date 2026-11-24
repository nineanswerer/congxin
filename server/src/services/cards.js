/**
 * 知识卡片产出（主流程那条：「拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 追问 → 知乎补观点」）。
 *
 * 契约：POST /api/cards（见 contracts/api.json v0.7）
 *
 * ## 卡片是什么
 *
 * 一张卡片 = **一个知乎上真实存在的问题** + **它下面一条真实回答的官方摘要** + **原回答链接**。
 * 形状沿用已有的 `SourceCard`（`kind: knowledge_card`），**不新造一套**。
 *
 * ⚠️ 2026-11-24（D66）：原来这里写着「卡片与情境题共用同一个对象」——
 *    **情境题已随认知闭环下线**，`SourceCard.kind` 枚举里的 `situation_question` 也已移除。
 *    → 现在这条链路只产出知识卡片。
 *
 * ## 两种模式
 *
 * | 模式 | 请求 | 卡片是什么 | 用在哪 |
 * | --- | --- | --- | --- |
 * | 默认 | `{topic, count}` | **N 个不同问题**，各取第 1 条能用的回答 | 主流程「它嚼出来的卡片」 |
 * | 同题两答 | `{topic, count, same_question: true}` | **同一个问题下的 N 条回答** | 「知乎上吵起来的两边」 |
 *
 * ### 为什么要有「同题两答」（2026-11-19）
 *
 * 「知乎上大家怎么说」这一拍要的是「**吵起来的两边**」。
 * 如果两张卡是**两个不同问题**的各一条回答，那**数据层根本没验证过两边是对立的**——
 * 它们只是同主题而已。而**同一个知乎问题下的两条不同回答**才是真正的「两边」：
 * 同题、可比、不同人写的不同答案。
 *
 * ⚠️ **上游能给的上限（2026-11-19 实测）**：上游回答对象**只有 4 个字段**
 * （`ContentType` / `ContentToken` / `Url` / `Summary`）——**没有作者名，也没有立场**。
 * → 所以「同题两答」是**结构上可证的**；「作者是谁」「观点是否相反」**数据层给不出**，
 *   谁在文案里假装有，谁就是在编。
 *
 * ## 三条硬规则
 *
 * 1. **出处必填**：问题标题 + 问题 URL + 原回答 URL，**全部来自上游，一个字段都不由模型生成**。
 *    拿不到出处就**不生成这张卡**（官方提交前检查第 6、7 条查的就是这个）。
 * 2. **不写死素材**：主题来自请求参数，每次跑出来的都是**实时**知乎数据。
 * 3. **空数据 ≠ 失败**：上游捞不到 → 走 `empty: true` + 中文 `empty_notice`，**不是错误**。
 *
 * ## 为什么卡片只能走「问题发现」链路（实测，2026-11-18）
 *
 * 要求出处是「问题标题 + 问题 URL + **原回答 URL**」三元组。逐个查过上游：
 *
 * | 上游 | 能不能给全三元组 |
 * | --- | --- |
 * | `user/collections`（收藏，user_data 组 10000/天） | ❌ 实测该账号 9 条收藏里 **8 条是专栏文章**（`zhuanlan.zhihu.com/p/...`），剩下 1 条回答的 URL 是 `zhihu.com/answer/xxx`——**推不出问题 URL，也没有原回答 URL** |
 * | `user/favlist_contents` | ❌ 同上（同一套 item 形状） |
 * | `zhihu_search` | ❌ 只能给到问题标题 + 问题 URL，**给不了原回答 URL** |
 * | `content/question_answers`（问题发现组 100/天） | ✅ `Url` 就是**原回答链接** |
 *
 * → **原回答 URL 只有 `question_answers` 能给**，所以卡片链路必然要花「问题发现」额度。
 * → 于是**必须带缓存**：同一主题 5 分钟内不再打上游（`lib/cache.js` 的 `cached` 还会做请求去重）。
 *
 * ## 额度账
 *
 * 一次 `question_recommendations` 能出最多 20 个问题（**1 次调用**），
 * 每个问题再花 **1 次** `question_answers`（**一次就返回该问题下的 3 条回答**）。
 * → 默认模式：**N 张卡 ≈ 1 + N 次**。
 * → 同题两答模式：**只碰 1 个问题 ≈ 1 + 1 次**（要 2 张就够，**不多花**）。
 * → 问题发现每天额度有限，所以**同一主题重复演要靠缓存**，不要硬刷。
 */

import { ApiError } from '../lib/errors.js';
import { cached } from '../lib/cache.js';
import { stableId } from '../lib/util.js';
import { petLines, resolveTone } from './tone.js';
import {
  findQuestionCandidates,
  answersWithUrls,
  buildSourceRef,
} from './retrieval.js';

const MAX_COUNT = 5;
const DEFAULT_COUNT = 3;
const POOL_TTL_MS = 5 * 60 * 1000;

/**
 * 拉一个主题下的候选问题（**只这 1 次上游调用**）。
 *
 * ⚠️ 回答是**按需**取的（见 `buildCards`）——要几张卡才花几次 `question_answers`，
 *    不会因为缓存池是 5 张就多打 4 次上游。
 */
async function fetchCandidates(topic) {
  const { candidates, warnings } = await findQuestionCandidates(topic, 20);
  return { candidates, warnings, answers: {} };
}

/**
 * 某个问题下的**带链接回答列表**（缓存在池子里）。
 *
 * ⚠️ 缓存的是**列表**不是单条 —— 默认模式取第 1 条、同题两答模式取前 N 条，
 *    **两种模式共用同一次上游调用**，不会重复打上游。
 *
 * @returns {Promise<Array<object>>} 带 `Url` 的回答（没有就是空数组）
 */
async function answersOf(pool, questionUrl) {
  if (pool.answers[questionUrl] === undefined) {
    // 一次上游调用就返回该问题下的最多 3 条回答（`Limit=3`）。
    // 失败也记下来（空数组），避免对同一个问题反复打。
    pool.answers[questionUrl] = await answersWithUrls(questionUrl, 3);
  }
  return pool.answers[questionUrl];
}

/**
 * 把「问题 + 回答」拼成一张卡（契约的 `SourceCard`，`kind=knowledge_card`）。
 *
 * ⚠️ **出处三件套全部来自上游**：问题标题 + 问题 URL 来自问题发现，
 *    原回答链接 + 摘要来自回答摘要——**一个字段都不由模型生成**。
 */
function makeCard(candidate, answer) {
  const source = buildSourceRef(candidate, answer);
  return {
    id: stableId('card', `${candidate.question_url}|${source.answer_url}`),
    kind: 'knowledge_card',
    title: candidate.question_title,
    // 正文 = 官方服务摘要（**不是 AI 生成**，前端别标成「AI 总结」）
    content: source.answer_summary ?? null,
    stem: null,
    options: [],
    difficulty: null,
    layer: null,
    source,
    created_at: Math.floor(Date.now() / 1000),
    generated_by: null,
  };
}

/**
 * 默认模式：**N 个不同问题**，每个问题取第 1 条能用的回答。
 *
 * 「能用」的判定沿用 `pickAnswer` 的口径：**优先要既有 Url 又有 Summary 的**，
 * 退而求其次只要有 Url 的——**Url 是回跳出处的关键**，没有它这条就不能用。
 */
async function buildTopicCards(pool, { count, seen }) {
  const cards = [];
  for (const candidate of pool.candidates) {
    if (cards.length >= count) break;
    if (seen.has(candidate.question_url)) continue; // 已经吐过了，跳过

    const list = await answersOf(pool, candidate.question_url);
    const answer = list.find((a) => a?.Summary) ?? list[0] ?? null;
    if (!answer) continue;

    cards.push(makeCard(candidate, answer));
  }
  return { cards, question: null };
}

/**
 * 同题两答模式：**同一个知乎问题下的 N 条回答** = 真正的「吵起来的两边」。
 *
 * 遍历候选问题，**取第一个能拿到 ≥2 条带链接回答的问题**；
 * 某个问题只有 1 条回答就换下一个（单个问题凑不齐不算失败）。
 *
 * @returns {{cards: Array, question: object|null, tried: string[]}}
 */
async function buildPairCards(pool, { count, seen }) {
  const need = Math.min(2, count);
  const tried = [];
  for (const candidate of pool.candidates) {
    if (seen.has(candidate.question_url)) continue; // 已经吐过的问题就不重复用
    tried.push(candidate.question_url);

    const list = await answersOf(pool, candidate.question_url);
    const picked = list.slice(0, count);
    if (picked.length < need) continue; // 这个问题只有一条回答 → 换下一个

    return {
      cards: picked.map((answer) => makeCard(candidate, answer)),
      question: candidate,
      tried,
    };
  }
  return { cards: [], question: null, tried };
}

/**
 * 主入口。
 *
 * @param {object} req
 * @param {{topic:string, count?:number, tone?:string, seen_sources?:string[], same_question?:boolean}} req
 */
export async function buildCards(req) {
  const topic = String(req.topic ?? '').trim();
  if (!topic) {
    throw new ApiError('VALIDATION_ERROR', 'topic 不能为空', {
      userHint: '还没告诉我这堆资料是关于什么的，换个说法再试',
    });
  }
  if (topic.length > 64) {
    throw new ApiError('VALIDATION_ERROR', 'topic 太长', {
      userHint: '主题词太长了，短一点再试',
    });
  }

  const count = Math.min(MAX_COUNT, Math.max(1, Number(req.count) || DEFAULT_COUNT));
  const toneId = resolveTone(req.tone).id;
  const seen = new Set((req.seen_sources ?? []).map(String));
  // 「同题两答」模式（可选参数，不传就是原来的行为）
  const sameQuestion = req.same_question === true || req.same_question === 'true';

  // ⚠️ 缓存的是**候选问题池**而不是最终卡片：
  //    - 同一主题 5 分钟内不再打 `question_recommendations`
  //    - 每个问题的回答**按需取**并单独记在池子里 → 要几张卡才花几次 `question_answers`
  const pool = await cached(`cards:pool:${topic}`, POOL_TTL_MS, () => fetchCandidates(topic));

  const built = sameQuestion
    ? await buildPairCards(pool, { count, seen })
    : await buildTopicCards(pool, { count, seen });

  if (built.cards.length === 0) {
    const emptyNotice = sameQuestion
      ? (pool.candidates.length === 0
        ? `知乎上暂时没有跟「${topic}」相关的问题。换个说法再试一次。`
        : '知乎上这几个问题都只取到一条回答，凑不成「两边」。换个说法再试一次。')
      : (pool.candidates.length === 0
        ? `知乎上暂时没有跟「${topic}」相关的问题。换个说法再试一次。`
        : '这些卡片都吐过了，换个主题再来。');
    return {
      cards: [],
      topic,
      empty: true,
      empty_notice: emptyNotice,
      total_candidates: pool.candidates.length,
      tone: toneId,
      pet_lines: petLines(toneId),
      warnings: pool.warnings ?? [],
      cached: pool.cached,
    };
  }

  return {
    cards: built.cards,
    topic,
    empty: false,
    empty_notice: null,
    total_candidates: pool.candidates.length,
    tone: toneId,
    pet_lines: petLines(toneId),
    warnings: pool.warnings ?? [],
    cached: pool.cached,
  };
}
