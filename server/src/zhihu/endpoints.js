/**
 * 知乎开放平台端点封装。**路径与参数名全部按 2026-11-17 实测结果写死。**
 *
 * ⚠️ 收藏类接口的真实路径不是 `/api/v1/user/favorites/*`（那是 404），
 *    而是下面这三个。这是从 zhihu-cli 二进制里反查出来的。
 */

import { callUpstream } from './client.js';

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
