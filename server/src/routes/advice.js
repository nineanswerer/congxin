/**
 * POST /api/advice —— 「问它」：**新主线**的入口（2026-11-24 决策 D66）。
 *
 * 契约：contracts/api.json 的 `/api/advice`
 *
 * 用户抛一个问题过来，桌宠去知乎找**相似的困境**，从真实回答里挑对策，
 * 判断适不适合他这个具体情况，给出一个**能照着做**的方案。
 *
 * **出处一律来自上游**：模型只回编号，真实 URL 由后端映射（见 `services/advice.js`）。
 * 空数据走 200 + `empty: true` + `empty_notice`，**与失败严格区分**。
 */

import { Router } from 'express';
import { buildAdvice } from '../services/advice.js';

export const adviceRouter = Router();

adviceRouter.post('/api/advice', async (req, res, next) => {
  try {
    const result = await buildAdvice(req.body ?? {});

    res.json({
      data: {
        question: result.question,
        verdict: result.verdict,
        summary: result.summary,
        plan: result.plan,
        caveat: result.caveat,
        sources: result.sources,
        empty: result.empty,
        empty_notice: result.empty_notice,
        candidate_count: result.candidate_count,
        tone: result.tone,
        pet_lines: result.pet_lines,
      },
      meta: {
        source: 'zhihu:content.zhihu_search+v1.chat.completions',
        fetched_at: Math.floor(Date.now() / 1000),
        cached: Boolean(result.cached),
        cache_age_s: 0,
        pet_state: result.empty ? 'idle' : 'emitting',
        quota: null,
        warnings: result.warnings ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});
