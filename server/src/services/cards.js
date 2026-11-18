/**
 * 知识卡片产出（主流程那条：「拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 追问 → 知乎补观点」）。
 *
 * 契约：POST /api/cards（见 contracts/api.json v0.5）
 *
 * ## 卡片是什么
 *
 * 一张卡片 = **一个知乎上真实存在的问题** + **它下面一条真实回答的官方摘要** + **原回答链接**。
 * 形状沿用已有的 `SourceCard`（`kind: knowledge_card`），**不新造一套**——
 * 卡片与情境题共用同一个对象，前端一套渲染逻辑。
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
 * 每个问题再花 **1 次** `question_answers`。
 * → **N 张卡 ≈ 1 + N 次问题发现**（3 张卡 = 4 次）。
 * → 问题发现今天只剩 79/100，所以**同一主题重复演要靠缓存**，不要硬刷。
 */

import { ApiError } from '../lib/errors.js';
import { cached } from '../lib/cache.js';
import { stableId } from '../lib/util.js';
import { petLines, resolveTone } from './tone.js';
import { findQuestionCandidates, firstAnswerWithUrl, buildSourceRef } from './retrieval.js';

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
 * 主入口。
 *
 * @param {object} req
 * @param {{topic:string, count?:number, tone?:string, seen_sources?:string[]}} req
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

  // ⚠️ 缓存的是**候选问题池**而不是最终卡片：
  //    - 同一主题 5 分钟内不再打 `question_recommendations`
  //    - 每个问题的回答**按需取**并单独记在池子里 → 要几张卡才花几次 `question_answers`
  const pool = await cached(`cards:pool:${topic}`, POOL_TTL_MS, () => fetchCandidates(topic));

  const cards = [];
  for (const candidate of pool.candidates) {
    if (cards.length >= count) break;
    if (seen.has(candidate.question_url)) continue; // 已经吐过了，跳过

    // 取**真实原回答链接**（取不到就换下一个候选）。
    // 回答按问题 URL 单独缓存：同一主题再要一张卡时不用重打这一条。
    let answer = pool.answers[candidate.question_url];
    if (answer === undefined) {
      answer = await firstAnswerWithUrl(candidate.question_url);
      pool.answers[candidate.question_url] = answer; // null 也记下，避免反复打失败的
    }
    if (!answer) continue;

    const source = buildSourceRef(candidate, answer);
    cards.push({
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
    });
  }

  if (cards.length === 0) {
    const emptyNotice =
      pool.candidates.length === 0
        ? `知乎上暂时没有跟「${topic}」相关的问题。换个说法再试一次。`
        : '这些卡片都吐过了，换个主题再来。';
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
    cards,
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
