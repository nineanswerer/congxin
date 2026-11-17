/**
 * 三个行为对照接口。
 *
 * 契约：
 *   GET /api/behavior/favorites
 *   GET /api/behavior/followees
 *   GET /api/behavior/contents
 *
 * 共同约定：
 *   - 空数据走 200 + empty:true + empty_notice，**与失败严格区分**
 *   - 所有响应带 meta（来源、缓存状态、桌宠状态、额度快照）
 */

import { Router } from 'express';
import {
  buildFavoritesSignal,
  buildFolloweesSignal,
  buildContentsSignal,
} from '../services/behavior.js';
import { cached } from '../lib/cache.js';
import { config } from '../config.js';

export const behaviorRouter = Router();

function meta({ source, cachedHit, cacheAgeS, quota, warnings = [], petState = 'idle' }) {
  return {
    source,
    fetched_at: Math.floor(Date.now() / 1000),
    cached: cachedHit,
    cache_age_s: cacheAgeS,
    pet_state: petState,
    quota,
    warnings,
  };
}

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

behaviorRouter.get('/api/behavior/favorites', async (req, res, next) => {
  try {
    const limit = clampInt(req.query.limit, { min: 1, max: 50, fallback: 20 });
    const result = await cached(`favorites:${limit}`, config.cacheTtlMs, () =>
      buildFavoritesSignal(limit)
    );
    res.json({
      data: result,
      meta: meta({
        source: 'zhihu:user.collections+user.favlists',
        cachedHit: result.cached,
        cacheAgeS: result.cacheAgeS,
        quota: { api_id: 'user_data', total: 10000, used: 0, remaining: null },
      }),
    });
  } catch (err) {
    next(err);
  }
});

behaviorRouter.get('/api/behavior/followees', async (req, res, next) => {
  try {
    const limit = clampInt(req.query.limit, { min: 1, max: 50, fallback: 20 });
    const offset = clampInt(req.query.offset, { min: 0, max: 10000, fallback: 0 });
    const result = await cached(`followees:${limit}:${offset}`, config.cacheTtlMs, () =>
      buildFolloweesSignal(limit, offset)
    );
    res.json({
      data: result,
      meta: meta({
        source: 'zhihu:user.followees',
        cachedHit: result.cached,
        cacheAgeS: result.cacheAgeS,
        quota: { api_id: 'user_data', total: 10000, used: 0, remaining: null },
      }),
    });
  } catch (err) {
    next(err);
  }
});

behaviorRouter.get('/api/behavior/contents', async (req, res, next) => {
  try {
    const contentType = String(req.query.content_type || 'all');
    const limit = clampInt(req.query.limit, { min: 1, max: 50, fallback: 20 });
    const offset = clampInt(req.query.offset, { min: 0, max: 10000, fallback: 0 });
    const result = await cached(`contents:${contentType}:${limit}:${offset}`, config.cacheTtlMs, () =>
      buildContentsSignal(contentType, limit, offset)
    );
    const warnings = [];
    if (result.empty) warnings.push('content_signal_unavailable');
    res.json({
      data: result,
      meta: meta({
        source: 'zhihu:user.contents+user.creator_account_stats',
        cachedHit: result.cached,
        cacheAgeS: result.cacheAgeS,
        quota: { api_id: 'creator', total: 500, used: 0, remaining: null },
        warnings,
      }),
    });
  } catch (err) {
    next(err);
  }
});
