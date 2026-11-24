/**
 * 知乎开放平台端点封装。**路径与参数名全部按 2026-11-17 实测结果写死。**
 *
 * ⚠️ 收藏类接口的真实路径不是 `/api/v1/user/favorites/*`（那是 404），
 *    而是下面这三个。这是从 zhihu-cli 二进制里反查出来的。
 */

import { callUpstream, callUpstreamPost } from './client.js';

export async function getQuota() {
  const data = await callUpstream('/api/v1/quota');
  return Array.isArray(data) ? data : [];
}

export async function getCollections(limit = 50) {
  const data = await callUpstream('/api/v1/user/collections', { Offset: 0, Limit: limit });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

export async function getFavlists(limit = 50) {
  const data = await callUpstream('/api/v1/user/favlists', { Offset: 0, Limit: limit });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

/** @param {string} favlistUrlToken 必填，缺失上游直接 Code=10001 */
export async function getFavlistContents(favlistUrlToken, limit = 50) {
  const data = await callUpstream('/api/v1/user/favlist_contents', {
    FavlistUrlToken: favlistUrlToken,
    Offset: 0,
    Limit: limit,
  });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

export async function getFollowees(limit = 50, offset = 0) {
  const data = await callUpstream('/api/v1/user/followees', { Offset: offset, Limit: limit });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

/**
 * ⚠️ ContentType 必填，不传上游直接 Code=10001。
 * ⚠️ 而且**必须用 all 或遍历多种类型**——实测账号的唯一创作是一条 pin，
 *    只查 article / answer 会拿到 0 条，被误判成「没有创作」。
 */
export async function getContents(contentType = 'all', limit = 50, offset = 0) {
  const data = await callUpstream('/api/v1/user/contents', {
    ContentType: contentType,
    Offset: offset,
    Limit: limit,
  });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

export async function getCreatorAccountStats() {
  const data = await callUpstream('/api/v1/user/creator_account_stats');
  return data ?? {};
}

/**
 * 主题问题推荐（问题发现，100 次/天）。
 * ⚠️ 上游只有 Title 与 Url，**没有 Paging**。
 */
export async function getQuestionRecommendations(query, count = 5) {
  const data = await callUpstream('/api/v1/user/question_recommendations', {
    Query: query,
    Count: count,
  });
  return {
    items: data?.Items ?? data?.items ?? [],
    raw: data ?? null,
  };
}

/**
 * 某问题下的回答摘要。
 * ⚠️ `QuestionUrl` 必填，缺失上游直接 Code=10001。
 * ⚠️ `Summary` 是**官方服务摘要**，不是 AI 生成——前端展示时不要标成「AI 总结」。
 */
export async function getQuestionAnswers(questionUrl, limit = 5) {
  const data = await callUpstream('/api/v1/content/question_answers', {
    QuestionUrl: questionUrl,
    Offset: 0,
    Limit: limit,
  });
  return {
    items: data?.Items ?? [],
    paging: data?.Paging ?? null,
  };
}

/**
 * 知乎站内搜索（zhihu_search，**5000 次/天**，与最紧的「问题发现 100/天」不是一个额度组）。
 *
 * 用途：新主线的第一步 —— 用户抛一个问题 → 在知乎站内找**相似的困境**。
 *
 * ⚠️ `Count` **上游最大 10**，传更大只会被静默截断。
 * ⚠️ `Items[].ContentType` 决定 `Url` 指向什么：
 *    - `Answer`  → **原回答链接**（可溯源到具体某条回答）
 *    - `Question`→ 问题链接
 *    - `Article` → 专栏文章链接
 *    出处字段一律取这里的 `Title` + `Url`，**不由模型生成**（契约硬要求）。
 */
export async function zhihuSearch(query, count = 10) {
  const data = await callUpstream('/api/v1/content/zhihu_search', {
    Query: query,
    Count: count,
  });
  return {
    items: data?.Items ?? [],
    hasMore: Boolean(data?.HasMore),
    searchHashId: data?.SearchHashId ?? null,
    emptyReason: data?.EmptyReason ?? null,
  };
}

/**
 * 直答（OpenAI 兼容）。
 *
 * ⚠️ **直答是「改写者」不是「检索者」**：实测 `zhida-agent` 给不出真实知乎链接，
 *    所以出处字段一律来自上游接口，不由模型生成（契约 `POST /api/advice` 的硬要求）。
 * ⚠️ 不要用 `zhida-agent`——用 `zhida-fast-1p5` 或 `zhida-thinking-1p5`。
 *
 * ⚠️ **格式要求必须写在 user 消息里**（2026-11-24 实测）：
 *    放在 system 里，这两个模型都会**无视它**、自由发挥一篇长文；
 *    跟材料一起放进 user 消息才肯照格式输出。详见 `services/advice.js`。
 */
export async function chatComplete(model, messages, { temperature = 0.7 } = {}) {
  const payload = await callUpstreamPost('/v1/chat/completions', {
    model,
    messages,
    stream: false,
    temperature,
  });
  const content = payload?.choices?.[0]?.message?.content ?? null;
  return {
    content: typeof content === 'string' ? content : null,
    raw: payload,
  };
}
