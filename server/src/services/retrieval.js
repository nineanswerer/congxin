/**
 * 知乎问题发现检索链路 —— **主流程「知乎补观点」与认知闭环「情境题」共用同一套**。
 *
 * ## 为什么共用（省人时的第 2 条决定）
 *
 * 两条线要的东西本质一样：**一个知乎上真实存在的问题 + 它下面一条真实回答的官方摘要 + 原回答链接**。
 * 区别只在下游怎么用：
 *
 * | 用途 | 下一步做什么 |
 * | --- | --- |
 * | 主流程「知乎补观点」/ 知识卡片 | 直接把真实问题 + 回答摘要当卡片吐出来（`kind=knowledge_card`） |
 *
 * 所以**检索只做一次**，下游直接投影成卡片。
 *
 * ⚠️ 2026-11-24（D66）：原来还有第二种投影「认知闭环『情境题』」（`kind=situation_question`），
 *    **已随认知闭环下线**。这条链路现在只服务卡片。
 *    → 「问它」那条新主线**不走这里**：它用的是 `zhihu_search`（5000/天），
 *      见 `services/advice.js`。
 *
 * ## 链路（已实测可行，2026-11-17）
 *
 * ```
 * 问题发现  GET  /api/v1/user/question_recommendations?Query=<主题>&Count=N
 *    ↓      → 真实问题标题 + 完整 URL
 * 回答摘要  GET  /api/v1/content/question_answers?QuestionUrl=<完整URL>&Offset=0&Limit=N
 *    ↓      → 真实回答摘要 + 原回答链接
 * ```
 *
 * ## 两条硬规则
 *
 * 1. **出处字段一律来自上游，不由模型生成。**
 *    实测 `zhida-agent` 两次都明确说「无法访问知乎站内的问题列表」，返回的是自编题面、**零个**真实链接。
 * 2. **拿不到出处就报错/走 empty，不返回没有 `source` 的内容。**
 *
 * ## 额度
 *
 * 这条链走的是**「问题发现」额度组（100 次/天，问题推荐与回答摘要共用）**。
 * 一次 `question_recommendations` 能出最多 20 个问题（1 次调用），
 * 每个问题再花 1 次 `question_answers`。**所以「N 张卡」的代价 ≈ 1 + N 次问题发现。**
 * → 卡片接口**必须带缓存**（见 `services/cards.js`），同一主题不要重复打上游。
 */

import { getQuestionRecommendations, getQuestionAnswers } from '../zhihu/endpoints.js';
import { tokenStr } from '../lib/util.js';

/** 把上游候选问题里的标题/URL 归一化。 */
export function normalizeCandidate(raw) {
  const url = raw?.Url ?? raw?.url ?? '';
  const title = raw?.Title ?? raw?.title ?? '';
  if (!url || !title) return null;
  return { question_title: title, question_url: url };
}

/**
 * 按主题找候选问题。
 *
 * ⚠️ **上游对全大写英文词召回不稳**（2026-11-17 实测）：
 *    `Query=MBTI` 连续 3 次返回 **0 条**，而 `Query=mbti` 稳定返回 5 条；
 *    同一时刻 `Query=人格测试` 稳定返回 5 条、`Query=RAG` 也正常。
 *    额度充足（98/100），**不是额度问题，是上游的字面匹配对大小写敏感**。
 *    → 所以：主查一次，**查不到才降级到小写形式再试一次**（不是并集，
 *    免得 "RAG" 降级成 "rag" 后匹配到 "storage" 之类的噪声）。
 *
 * @param {string} topic
 * @param {number} limit 拉多少个候选问题（上游范围 1—20）
 * @returns {Promise<{candidates: Array<{question_title:string,question_url:string}>, warnings: string[]}>}
 */
export async function findQuestionCandidates(topic, limit) {
  const warnings = [];
  let candidates = [];

  const pool = await getQuestionRecommendations(topic, limit);
  candidates = pool.items.map(normalizeCandidate).filter(Boolean);

  if (candidates.length === 0 && topic !== topic.toLowerCase()) {
    const fallback = await getQuestionRecommendations(topic.toLowerCase(), limit);
    candidates = fallback.items.map(normalizeCandidate).filter(Boolean);
    if (candidates.length > 0) {
      warnings.push('query_lowercase_fallback');
    }
  }

  return { candidates, warnings };
}

/**
 * 从一批回答里挑一条能用的。
 *
 * 优先要 **有 Url（= 原回答链接）且有 Summary（= 有正文可显示）** 的；
 * 都退而求其次只要有 Url 的——**Url 是回跳出处的关键**，没有它这条就不能用。
 */
export function pickAnswer(items) {
  const list = (items ?? []).filter((a) => a?.Url);
  return list.find((a) => a?.Summary) ?? list[0] ?? null;
}

/**
 * 取某个问题下第一条带原回答链接的回答。取不到就返回 null
 * （**单个问题失败不该让整批失败**，调用方换下一个候选）。
 */
export async function firstAnswerWithUrl(questionUrl) {
  try {
    const answers = await getQuestionAnswers(questionUrl, 3);
    return pickAnswer(answers.items);
  } catch {
    return null;
  }
}

/**
 * 取某个问题下**前 N 条带原回答链接**的回答（按上游返回顺序）。
 *
 * ## 为什么需要它（2026-11-19）
 *
 * 「知乎上吵起来的两边」如果只是「两个不同问题的各一条回答」，
 * 那**数据层根本没验证过两边是对立的**——同题两答才是真正的「两边」：
 * **同一个问题、不同的人写的不同回答**，摆在一起才有可比性。
 *
 * ## 额度：不多花
 *
 * 上游 `content/question_answers` **一次调用就返回最多 3 条回答**（`Limit=3`），
 * 而 `firstAnswerWithUrl` 本来就调了 3 条、只用了第 1 条。
 * → **「同题两答」和「两个不同问题的卡」花一样的额度**，
 *   同题两答甚至**少花 1 次**（只要 1 个问题，不用 2 个）。
 *
 * ⚠️ 上游回答对象**只有 4 个字段**（`ContentType` / `ContentToken` / `Url` / `Summary`，
 *   2026-11-19 实测）——**没有作者名，也没有立场**。
 *   → 所以「同题两答」是**结构上可证的**（同题、不同回答）；
 *     「作者是谁」「观点是否相反」**数据层给不出**，不许在文案里假装有。
 *
 * @param {string} questionUrl
 * @param {number} limit 要几条（上游一次最多给 3 条，所以至少请求 3）
 * @returns {Promise<Array<object>>} 带 `Url` 的回答对象数组；失败返回空数组
 */
export async function answersWithUrls(questionUrl, limit = 3) {
  try {
    const answers = await getQuestionAnswers(questionUrl, Math.max(3, limit));
    return (answers.items ?? []).filter((a) => a?.Url).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

/**
 * 把「问题 + 回答」拼成契约里的 `SourceRef`（出处）。
 *
 * ⚠️ `question_title` / `question_url` 来自问题发现，`answer_url` / `answer_summary`
 *    来自回答摘要——**全部来自上游，一个字段都不由模型生成**。
 */
export function buildSourceRef(candidate, answer) {
  return {
    question_title: candidate.question_title,
    question_url: candidate.question_url,
    answer_url: answer?.Url ?? null,
    answer_content_type: answer?.ContentType === 'article' ? 'article' : 'answer',
    answer_token: tokenStr(answer?.ContentToken),
    answer_summary: answer?.Summary ?? null,
  };
}
