/**
 * GET /api/quota —— 额度透传（契约 x-upstream.quota_class = 不计入额度）
 */

import { Router } from 'express';
import { getQuota } from '../zhihu/endpoints.js';
import { cached } from '../lib/cache.js';

export const quotaRouter = Router();

quotaRouter.get('/api/quota', async (req, res, next) => {
  try {
    const result = await cached('quota', 30_000, async () => {
      const raw = await getQuota();
      return {
        apis: (raw || []).map((a) => ({
          api_id: a.APIID,
          api_name: a.APIName,
          total: Number(a.TotalQuota) || 0,
          used: Number(a.TotalUsed) || 0,
          remaining: Number(a.RemainingQuota) || 0,
        })),
        checked_at: Math.floor(Date.now() / 1000),
      };
    });

    res.json({
      data: { apis: result.apis, checked_at: result.checked_at },
      meta: {
        source: 'zhihu:quota',
        fetched_at: result.checked_at,
        cached: result.cached,
        cache_age_s: result.cacheAgeS,
        pet_state: 'idle',
        quota: null,
        warnings: [],
      },
    });
  } catch (err) {
    next(err);
  }
});
