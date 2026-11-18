/**
 * 语气目录接口。
 *
 * 契约：GET /api/tone（见 contracts/api.json）
 *
 * ## 为什么单独开一个接口
 *
 * 前端要两样东西：
 * 1. **切换器的选项**（两个语气各自的显示名）——这是产品上要给人选的东西。
 * 2. **当前语气的全部台词**——包括那些**没有专属接口**的台词
 *    （开场、咀嚼、吐卡片、点出处、知乎补观点、先放着、落版），
 *    这些出现在 Demo 的前两分钟，那会儿还没调过任何认知接口。
 *
 * 所以这里一次把两样都给全，前端调一次就有。
 *
 * ## 语气不影响事实
 *
 * 台词只是说法。断层强度、置信度、证据、分类占比一个都不随语气变。
 */

import { Router } from 'express';
import { toneCatalog } from '../services/tone.js';

export const toneRouter = Router();

toneRouter.get('/api/tone', (req, res) => {
  const catalog = toneCatalog(req.query?.tone);
  res.json({
    data: catalog,
    meta: {
      source: 'contract:tone.json',
      fetched_at: Math.floor(Date.now() / 1000),
      cached: false,
      cache_age_s: 0,
      pet_state: 'idle',
      quota: null,
      warnings: [],
    },
  });
});
