/**
 * POST /api/cards —— 知识卡片产出（主流程那条链的第一块砖）。
 *
 * 契约：contracts/api.json v0.6 的 `/api/cards`
 *
 * 前端只要传一个主题（拖进来的那份资料是关于什么的），后端就去知乎捞**真实存在**的问题与回答，
 * 吐成**带出处**的卡片。**前端不传任何内容、不内置任何素材。**
 */

import { Router } from 'express';
import { buildCards } from '../services/cards.js';

export const cardsRouter = Router();

cardsRouter.post('/api/cards', async (req, res, next) => {
  try {
    const result = await buildCards(req.body ?? {});

    res.json({
      data: {
        cards: result.cards,
        topic: result.topic,
        empty: result.empty,
        empty_notice: result.empty_notice,
        total_candidates: result.total_candidates,
        tone: result.tone,
        pet_lines: result.pet_lines,
      },
      meta: {
        source: 'zhihu:question_discovery',
        fetched_at: Math.floor(Date.now() / 1000),
        cached: Boolean(result.cached),
        cache_age_s: 0,
        pet_state: 'idle',
        quota: null,
        warnings: result.warnings ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});
