/**
 * 行为对照：把知乎上游数据归一化成契约里的产品级形状。
 *
 * 契约：contracts/api.json
 *   GET /api/behavior/favorites
 *   GET /api/behavior/followees
 *   GET /api/behavior/contents
 */

import {
  getCollections,
  getFavlists,
  getFavlistContents,
  getFollowees,
  getContents,
  getCreatorAccountStats,
} from '../zhihu/endpoints.js';
import { distribution } from '../lib/classify.js';

const DAY_SECONDS = 24 * 60 * 60; // ⚠️ 上游 FavTime / CreatedAt 是**秒**，不是毫秒

function toUnix(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 上游 `Summary` 会被截断（末尾带省略号）。
 * 截断了就不能当成"读完了整篇"来判定，必须在提示里说出来。
 */
function isSummaryTruncated(text) {
  if (!text) return false;
  const t = String(text).trim();
  return t.endsWith('…') || /\.{3,}$/.test(t);
}

/**
 * 分布的第一名是不是"压倒性"的。
 *
 * ⚠️ 两种"不集中"都要如实说：
 *    1. 桶与桶同分（条数、命中分都相同）→ 第一名只是**数组顺序**的产物；
 *    2. 同一条内容同时命中多个类（桶内 tied_with 非空）→ 归类本身就是弱结论。
 *    这两种情况都不能说成"集中在 X"——这是本项目的诚实底线之一。
 */
function distributionHead(distribution) {
  if (!distribution || distribution.length === 0) {
    return { primary: null, tied: false, tiedWith: [] };
  }
  const sorted = [...distribution].sort(
    (a, b) => b.count - a.count || (b.score ?? 0) - (a.score ?? 0)
  );
  const top = sorted[0];

  const sameRank = sorted
    .filter((d) => d.count === top.count && (d.score ?? 0) === (top.score ?? 0))
    .map((d) => d.category);
  const sameItem = (top.tied_with ?? []).slice();

  const tiedWith = [...new Set([...sameRank, ...sameItem])];
  return {
    primary: top.category,
    tied: sameRank.length > 1 || sameItem.length > 0,
    tiedWith,
  };
}

/** 把上游 content item 归一化成契约里的 ContentItem。 */
function normalizeContentItem(item) {
  return {
    content_type: item.ContentType || 'unknown',
    title: item.Title || '',
    summary: item.Summary ?? null,
    url: item.Url || '',
    author: {
      name: item.Author?.Name ?? null,
      url: item.Author?.Url ?? null,
      headline: item.Author?.Headline ?? null,
    },
    created_at: toUnix(item.CreatedAt),
    engagement: {
      like_count: Number(item.LikeCount) || 0,
      comment_count: Number(item.CommentCount) || 0,
      favorite_count: Number(item.FavoriteCount) || 0,
    },
  };
}

/** 收藏跨度：横跨多长时间、集中在多少天。 */
function computeSpan(items) {
  const times = items.map((i) => Number(i.fav_time)).filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const days = new Set(times.map((t) => Math.floor(t / 86400)));
  return {
    earliest_fav_time: earliest,
    latest_fav_time: latest,
    span_days: Math.round((latest - earliest) / DAY_SECONDS),
    distinct_days: days.size,
  };
}

/**
 * GET /api/behavior/favorites
 */
export async function buildFavoritesSignal(limit) {
  const [collections, favlists] = await Promise.all([
    getCollections(limit),
    getFavlists(limit),
  ]);

  // 逐个收藏夹取条目，用来算 item_count（收藏跨度要看全，不能只看近期）
  const favlistMeta = [];
  const collectedByToken = new Map();
  for (const fl of favlists.items) {
    const token = String(fl.UrlToken);
    let items = [];
    try {
      const res = await getFavlistContents(token, limit);
      items = res.items;
    } catch {
      // 单个收藏夹取不到不该让整个接口失败——记 0，后面如实显示
    }
    collectedByToken.set(token, items);
    favlistMeta.push({
      token,
      title: fl.Title || '',
      url: fl.Url || '',
      is_public: Boolean(fl.IsPublic),
      item_count: items.length,
    });
  }

  // 合并所有收藏夹的条目（同一条可能在多个收藏夹里，按 url 去重）
  const byUrl = new Map();
  for (const items of collectedByToken.values()) {
    for (const raw of items) {
      const url = raw.Url || '';
      if (!url || byUrl.has(url)) continue;
      byUrl.set(url, raw);
    }
  }
  // 近期收藏能拿到收藏时间，按收藏时间倒序补进来
  for (const raw of collections.items) {
    const url = raw.Url || '';
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, raw);
  }

  const items = [...byUrl.values()].map((raw) => ({
    ...normalizeContentItem(raw),
    fav_time: toUnix(raw.FavTime),
    favlists: (raw.Favlists || []).map((f) => ({
      token: String(f.UrlToken),
      title: f.Title || '',
      url: f.Url || '',
    })),
  }));
  items.sort((a, b) => (b.fav_time || 0) - (a.fav_time || 0));

  const empty = items.length === 0;
  const categoryDistribution = empty ? [] : distribution(items, 'topic');

  return {
    signal: 'favorites',
    collected_count: items.length,
    span: computeSpan(items),
    category_distribution: categoryDistribution,
    favlists: favlistMeta,
    items,
    empty,
    empty_notice: empty
      ? '你还没有收藏内容。收藏几条知乎内容之后，这里会显示你的收藏结构。'
      : null,
  };
}

/**
 * GET /api/behavior/followees
 */
export async function buildFolloweesSignal(limit, offset) {
  const res = await getFollowees(limit, offset);
  const items = res.items.map((raw) => ({
    name: raw.Fullname || '',
    url_token: raw.UrlToken || '',
    url: raw.Url || '',
    avatar_url: raw.AvatarUrl ?? null,
    headline: raw.Headline ?? null,
    gender: raw.Gender ?? null,
    follower_count: Number(raw.FollowerCount) || 0,
    category: null,
  }));

  // 关注的"主题分类"用 名字 + 简介 判断
  const classifyInput = items.map((i) => ({ title: i.name, summary: i.headline, url: i.url }));
  const categoryDistribution = items.length === 0 ? [] : distribution(classifyInput, 'topic');

  // 把分类结果贴回条目，前端可以逐条高亮
  const byCategory = new Map();
  for (const bucket of categoryDistribution) {
    for (const ev of bucket.evidence || []) {
      if (ev.url) byCategory.set(ev.url, bucket.category);
    }
  }
  for (const item of items) item.category = byCategory.get(item.url) ?? null;

  const head = distributionHead(categoryDistribution);
  const primary = head.primary;

  return {
    signal: 'followees',
    followee_count: items.length,
    category_distribution: categoryDistribution,
    focus: primary
      ? {
          primary,
          summary: head.tied
            ? `关注分散在 ${head.tiedWith.length} 类（${head.tiedWith.join('、')}），没有明显集中。`
            : `关注集中在「${primary}」。`,
          tied: head.tied,
          tied_with: head.tiedWith,
        }
      : null,
    items,
    empty: items.length === 0,
    empty_notice:
      items.length === 0
        ? '你还没有关注任何知乎用户。关注几个之后，这里会显示你在关注哪类人。'
        : null,
  };
}

/**
 * GET /api/behavior/contents
 */
export async function buildContentsSignal(contentType, limit, offset) {
  const [res, stats] = await Promise.all([
    getContents(contentType, limit, offset),
    getCreatorAccountStats(),
  ]);

  const items = res.items.map(normalizeContentItem);
  const empty = items.length === 0;

  const metrics = stats?.Metrics || {};
  const creationCounts = stats?.CreationCounts || {};
  const activity = {
    publish_count: Number(metrics.PublishCount) || 0,
    view_count: Number(metrics.ViewCount) || 0,
    upvote_count: Number(metrics.UpvoteCount) || 0,
    comment_count: Number(metrics.CommentCount) || 0,
    active_days: null,
  };

  // 论证结构分布（创作专用）。**样本很少时如实显示，不要假装有分布。**
  const argumentDistribution = empty ? [] : distribution(items, 'argument');
  const argHead = distributionHead(argumentDistribution);
  const primaryStructure = argHead.primary;

  // 诚实底线：样本少 + 上游截断 + 同分，三者都要在提示里说出来，不能只说其中一件
  const truncatedCount = items.filter((i) => isSummaryTruncated(i.summary)).length;
  const notes = [];
  if (items.length < 2) {
    notes.push(`只有 ${items.length} 条公开创作，样本太少，这个结构判断仅供参考。`);
  }
  if (truncatedCount > 0) {
    notes.push(
      `上游返回的摘要被截断（${truncatedCount}/${items.length} 条），上面的结构判断只覆盖了原文的一部分。`
    );
  }
  if (argHead.tied) {
    notes.push(
      `「${primaryStructure}」与「${argHead.tiedWith.filter((c) => c !== primaryStructure).join('、')}」同分，结构判定只是弱结论。`
    );
  }

  return {
    signal: 'contents',
    content_totals: {
      answer: Number(creationCounts.Answer) || 0,
      article: Number(creationCounts.Article) || 0,
      video: Number(creationCounts.Video) || 0,
      pin: Number(creationCounts.Pin) || 0,
      question: Number(creationCounts.Question) || 0,
      all: items.length,
    },
    activity,
    argument_structure: empty
      ? null
      : {
          primary: primaryStructure,
          distribution: argumentDistribution,
          traits: [],
          tied: argHead.tied,
          tied_with: argHead.tiedWith,
          sample_size: items.length,
          sample_note: notes.length > 0 ? notes.join('') : null,
        },
    items,
    empty,
    empty_notice: empty
      ? '你还没有公开发布的内容，创作信号本次不可用。行为对照还剩收藏与关注两个信号。'
      : null,
  };
}
