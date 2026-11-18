/**
 * 认知闭环的四个接口。
 *
 * 契约（contracts/api.json v0.2）：
 *   POST /api/behavior/tension     自述 vs 行为 → 断层
 *   POST /api/situation/question    生成带知乎出处的情境题
 *   GET  /api/terrain              三层认知地形（说的你 / 做的你 / 情境下的你）
 *   POST /api/terrain/answer       提交作答 → 地形生长
 *
 * 共同约定：
 *   - 空数据走 200 + empty:true + empty_notice，**与失败严格区分**
 *   - 断层证据不足时走 insufficient，**不许硬撑出断层**
 *   - 所有响应带 meta（来源、缓存状态、桌宠状态）
 */

import { Router } from 'express';
import { buildTension } from '../services/tension.js';
import { buildSituationQuestions } from '../services/situation.js';
import { buildTerrain, applyTerrainAnswer } from '../services/terrain.js';
import { cached } from '../lib/cache.js';
import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { rememberQuestion, rememberSelfReport, getSelfReport } from '../session.js';

export const cognitionRouter = Router();

/**
 * 会话 id。开发期前端与后端各跑各的端口，没有登录态，
 * 所以先用 `x-session-id` 头 / `session_id` 参数拿一个会话 id；没有就用 'dev'。
 * ⚠️ 正式版要换成登录用户的 id —— **那属于 OAuth 阶段的事**（P9）。
 */
function sessionIdOf(req) {
  const fromHeader = req.get('x-session-id');
  if (fromHeader) return String(fromHeader);
  if (req.query?.session_id) return String(req.query.session_id);
  if (req.body?.session_id) return String(req.body.session_id);
  return 'dev';
}

function meta({ source, cachedHit, cacheAgeS, quota = null, warnings = [], petState = 'idle' }) {
  return {
    source,
    fetched_at: Math.floor(Date.now() / 1000),
    cached: Boolean(cachedHit),
    cache_age_s: cacheAgeS ?? 0,
    pet_state: petState,
    quota,
    warnings,
  };
}

// ---------------------------------------------------------------- POST /api/behavior/tension
cognitionRouter.post('/api/behavior/tension', async (req, res, next) => {
  try {
    const selfReport = req.body?.self_report;
    if (!selfReport || typeof selfReport !== 'object') {
      throw new ApiError('VALIDATION_ERROR', '缺少 self_report', {
        userHint: '先做完那几道题，再让我照照镜子',
      });
    }
    if (!selfReport.type && !Array.isArray(selfReport.traits)) {
      throw new ApiError('VALIDATION_ERROR', 'self_report 至少要有 type 或 traits', {
        userHint: '自述内容不完整，再答一次吧',
      });
    }

    const sessionId = sessionIdOf(req);
    rememberSelfReport(sessionId, selfReport);

    const key = `tension:${sessionId}:${selfReport.type ?? ''}:${(selfReport.traits ?? []).join('|')}`;
    const result = await cached(key, config.cacheTtlMs, () => buildTension(selfReport, { limit: 20 }));

    const warnings = [...(result.warnings ?? [])];
    res.json({
      data: result,
      meta: meta({
        source: 'zhihu:user.collections+user.followees+user.contents',
        cachedHit: result.cached,
        cacheAgeS: result.cacheAgeS,
        quota: { api_id: 'user_data', total: 10000, used: 0, remaining: null },
        warnings,
        petState: result.has_tension ? 'thinking' : 'idle',
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- POST /api/situation/question
cognitionRouter.post('/api/situation/question', async (req, res, next) => {
  try {
    const sessionId = sessionIdOf(req);
    const result = await buildSituationQuestions(req.body ?? {});

    // 发出去的题要记住 —— `POST /api/terrain/answer` 要校验 question_id
    for (const q of result.questions) rememberQuestion(sessionId, q);

    res.json({
      data: {
        questions: result.questions,
        candidates: result.candidates ?? [],
        empty: result.empty,
        empty_notice: result.empty_notice ?? null,
      },
      meta: meta({
        source:
          'zhihu:user.question_recommendations+content.question_answers+v1.chat.completions',
        cachedHit: false,
        cacheAgeS: 0,
        quota: { api_id: 'question_discovery', total: 100, used: 0, remaining: null },
        warnings: result.warnings ?? [],
        petState: result.empty ? 'idle' : 'emitting',
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- GET /api/terrain
cognitionRouter.get('/api/terrain', async (req, res, next) => {
  try {
    const sessionId = sessionIdOf(req);
    const includeGeometry = req.query.include_geometry !== 'false';
    const selfReport = req.body?.self_report ?? getSelfReport(sessionId);

    const result = await buildTerrain(selfReport, { sessionId, includeGeometry });

    res.json({
      data: {
        layers: result.layers,
        fractures: result.fractures,
        bridges: result.bridges,
        empty: result.empty,
        empty_notice: result.empty_notice ?? null,
      },
      meta: meta({
        source: 'derived:tension+answers',
        cachedHit: false,
        cacheAgeS: 0,
        quota: null,
        warnings: result._tension?.insufficient ? ['insufficient_signals'] : [],
        petState: 'idle',
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- POST /api/terrain/answer
cognitionRouter.post('/api/terrain/answer', async (req, res, next) => {
  try {
    const sessionId = sessionIdOf(req);
    const body = req.body ?? {};
    if (!body.question_id) {
      throw new ApiError('VALIDATION_ERROR', '缺少 question_id', {
        userHint: '这道题还没作答，先选一个吧',
      });
    }

    const result = await applyTerrainAnswer({
      sessionId,
      questionId: body.question_id,
      answerKey: body.answer_key ?? null,
      freeText: body.free_text ?? null,
    });

    res.json({
      data: {
        updated: result.updated,
        block: result.block,
        new_fractures: result.new_fractures,
        new_bridges: result.new_bridges,
        terrain: result.terrain,
        empty: result.empty,
        empty_notice: result.empty_notice ?? null,
      },
      meta: meta({
        source: 'derived:answers',
        cachedHit: false,
        cacheAgeS: 0,
        quota: null,
        warnings: [],
        petState: 'emitting',
      }),
    });
  } catch (err) {
    next(err);
  }
});
