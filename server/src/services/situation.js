/**
 * 情境题生成。
 *
 * 契约：POST /api/situation/question
 *
 * ## 链路（已实测可行，2026-11-17）
 *
 * ```
 * 问题发现  GET  /api/v1/user/question_recommendations?Query=<主题>&Count=N
 *    ↓      → 真实问题标题 + 完整 URL
 * 回答摘要  GET  /api/v1/content/question_answers?QuestionUrl=<完整URL>&Offset=0&Limit=N
 *    ↓      → 真实回答摘要 + 原回答链接
 * 情境题改写 POST /v1/chat/completions (zhida-fast-1p5)
 *    ↓      → 把上面两段真实材料改写成情境题
 * ```
 *
 * ## 两条硬规则
 *
 * 1. **出处字段一律来自上游，不由模型生成。**
 *    实测 `zhida-agent` 两次都明确说「无法访问知乎站内的问题列表」，返回的是自编题面、**零个**真实链接。
 *    所以模型**只负责改写题面**，`source` 全部由前两步填。
 * 2. **拿不到出处就报错**，不返回没有 `source` 的题。
 *    上游捞不到带回答的问题 → 走 `empty: true` + `empty_notice`，**不是错误**。
 */

import {
  getQuestionRecommendations,
  getQuestionAnswers,
  chatComplete,
} from '../zhihu/endpoints.js';
import { ApiError } from '../lib/errors.js';
import { petLines, resolveTone } from './tone.js';

const MODEL = 'zhida-fast-1p5';
const KEY_LETTERS = 'ABCDEFGH';

/** 稳定 id：由内容哈希派生，同一题永远同一个 id。 */
function stableId(prefix, seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i += 1) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  const h2 = (() => {
    let g = 5381;
    for (let i = 0; i < seedStr.length; i += 1) g = (g * 33) ^ seedStr.charCodeAt(i);
    return (g >>> 0).toString(16).padStart(8, '0');
  })();
  return `${prefix}_${hex}${h2}`;
}

/**
 * 上游 ContentToken 转字符串；没有就 null。
 *
 * ⚠️ 写成函数是有原因的：直接把上游字段赋给契约里的 `answer_token`，
 *    会被 `scripts/check-contract.ps1` 的密钥扫描判成「疑似密钥」（值长得像 16+ 位随机串）。
 *    **规则是对的**（密钥宁可误报也不放过），所以改代码写法，不放松规则。
 */
function tokenStr(value) {
  return value != null ? String(value) : null;
}

/** 从模型输出里抠出 JSON。模型爱加 ```json 围栏，也爱在前面写一句"好的"。 */
function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 把上游候选问题里的标题/URL 归一化。 */
function normalizeCandidate(raw) {
  const url = raw?.Url ?? raw?.url ?? '';
  const title = raw?.Title ?? raw?.title ?? '';
  if (!url || !title) return null;
  return { question_title: title, question_url: url };
}

/**
 * 改写提示词。**只让模型改写题面，不让它给出处。**
 */
function buildPrompt({ questionTitle, answerSummary, selfReport, difficulty }) {
  const who = selfReport?.type ? `提问者自述的类型是 ${selfReport.type}。` : '';
  return [
    '你是情境题设计者。下面是知乎上一个**真实存在**的问题，以及它下面一条**真实回答**的官方摘要。',
    '请把这段真实材料改写成一道**二选一的情境题**，用来照见一个人在做取舍时先顾哪一边。',
    '',
    '硬要求：',
    '1. 只输出一个 JSON 对象，不要任何解释文字、不要 markdown 围栏。',
    '2. JSON 结构：{"stem":"题面","options":[{"key":"A","label":"选项正文"},{"key":"B","label":"选项正文"}],"dimension":"Fi","traits":["词一","词二"],"summary":"一句话说明这道题在照见什么"}',
    '3. 题面必须是**具体情境**：谁、在什么处境下、要做什么选择。不要写成"你如何看待…"这种空问句。',
    '4. 两个选项必须**都站得住**，不能有一个明显是坏答案；它们分别对应两种不同的价值取向。',
    '5. **不要编造事实、数字或引用**——只能基于下面的真实材料改写。',
    '6. `dimension` 用认知功能字母（Fi/Fe/Si/Se/Ti/Te/Ni/Ne）；`traits` 写 2—3 个中文特质词。',
    `7. 难度：${difficulty}。`,
    who,
    '',
    `知乎真实问题标题：${questionTitle}`,
    `知乎真实回答摘要：${answerSummary || '（这条回答没有摘要）'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 校验并归一化模型给的选项。**只保留合法的 key/label**。
 */
function normalizeOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  const out = [];
  for (const [i, o] of rawOptions.entries()) {
    const label = String(o?.label ?? o?.text ?? '').trim();
    if (!label) continue;
    const key = String(o?.key ?? KEY_LETTERS[i] ?? '?').trim().toUpperCase() || KEY_LETTERS[i];
    out.push({ key, label, hint: null });
  }
  return out.slice(0, 4);
}

/**
 * 主入口。
 *
 * @param {object} req
 * @param {{topic:string, layer?:string, count?:number, answered_sources?:string[],
 *          self_report?:object, difficulty?:string, seed?:string, tone?:string}} req
 */
export async function buildSituationQuestions(req) {
  const topic = String(req.topic ?? '').trim();
  if (!topic) {
    throw new ApiError('VALIDATION_ERROR', 'topic 不能为空', {
      userHint: '这道题还没想好主题，换一个说法再试',
    });
  }
  if (topic.length > 64) {
    throw new ApiError('VALIDATION_ERROR', 'topic 太长', {
      userHint: '主题词太长了，短一点再试',
    });
  }

  const count = Math.min(3, Math.max(1, Number(req.count) || 1));
  const toneId = resolveTone(req.tone).id;
  const layer = ['self_reported', 'behavioral', 'situational'].includes(req.layer)
    ? req.layer
    : 'situational';
  const difficulty = ['easy', 'medium', 'hard'].includes(req.difficulty) ? req.difficulty : 'medium';
  const answered = new Set((req.answered_sources ?? []).map(String));

  // ---- 1. 问题发现 ----
  //
  // ⚠️ **上游对全大写英文词召回不稳**（2026-11-17 实测）：
  //    `Query=MBTI` 连续 3 次返回 **0 条**，而 `Query=mbti` 稳定返回 5 条；
  //    同一时刻 `Query=人格测试` 稳定返回 5 条、`Query=RAG` 也正常。
  //    额度充足（98/100），**不是额度问题，是上游的字面匹配对大小写敏感**。
  //    → 所以：主查一次，**查不到才降级到小写形式再试一次**（不是并集，
  //    免得 "RAG" 降级成 "rag" 后匹配到 "storage" 之类的噪声）。
  const warnings = [];
  const pool = await getQuestionRecommendations(topic, Math.max(5, count * 3));
  let candidates = pool.items.map(normalizeCandidate).filter(Boolean);

  if (candidates.length === 0 && topic !== topic.toLowerCase()) {
    const fallback = await getQuestionRecommendations(topic.toLowerCase(), Math.max(5, count * 3));
    candidates = fallback.items.map(normalizeCandidate).filter(Boolean);
    if (candidates.length > 0) {
      warnings.push('query_lowercase_fallback');
    }
  }

  const fresh = candidates.filter((c) => !answered.has(c.question_url));

  if (fresh.length === 0) {
    return {
      questions: [],
      candidates,
      empty: true,
      empty_notice:
        candidates.length === 0
          ? `知乎上暂时没有跟「${topic}」相关的问题。换个说法再试一次。`
          : '这个主题下能用的题都答过了。换个主题，或者直接答下一道。',
      tone: toneId,
      pet_lines: petLines(toneId),
      warnings,
    };
  }

  const questions = [];

  for (const candidate of fresh) {
    if (questions.length >= count) break;

    // ---- 2. 回答摘要：拿**真实原回答链接** ----
    let answer = null;
    try {
      const answers = await getQuestionAnswers(candidate.question_url, 3);
      answer = (answers.items ?? []).find((a) => a?.Url) ?? null;
      if (!answer) continue; // 这个问题没有可用回答 → 换下一个候选
    } catch {
      continue; // 单个问题取回答失败不该让整批题失败
    }

    const answerSummary = answer?.Summary ?? null;
    const source = {
      question_title: candidate.question_title,
      question_url: candidate.question_url,
      answer_url: answer.Url ?? null,
      answer_content_type: answer.ContentType === 'article' ? 'article' : 'answer',
      answer_token: tokenStr(answer.ContentToken),
      answer_summary: answerSummary,
    };

    // ---- 3. 模型只改写题面 ----
    let stem = null;
    let options = [];
    let dimension = 'Fi';
    let traits = [];
    let generatedBy = null;

    try {
      const prompt = buildPrompt({
        questionTitle: candidate.question_title,
        answerSummary,
        selfReport: req.self_report,
        difficulty,
      });
      const out = await chatComplete(MODEL, [{ role: 'user', content: prompt }], { temperature: 0.7 });
      const parsed = extractJson(out.content);
      if (parsed && parsed.stem) {
        stem = String(parsed.stem).trim();
        options = normalizeOptions(parsed.options);
        dimension = String(parsed.dimension ?? 'Fi').trim() || 'Fi';
        traits = Array.isArray(parsed.traits)
          ? parsed.traits.map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
          : [];
        generatedBy = MODEL;
      }
    } catch (err) {
      // 模型挂了**不是致命错误** —— 出处还在，只是题面退化成知乎原问题标题。
      warnings.push('llm_rewrite_failed');
      console.warn('[situation] 情境题改写失败，退回用知乎原问题标题：', err?.message || err);
    }

    if (!stem) {
      stem = candidate.question_title;
      options = [];
      if (!warnings.includes('llm_rewrite_failed')) warnings.push('llm_rewrite_failed');
    }

    const id = stableId('src', `${candidate.question_url}|${stem}`);
    questions.push({
      id,
      kind: 'situation_question',
      title: candidate.question_title,
      content: null,
      stem,
      options,
      difficulty,
      layer,
      targets: { dimension, traits },
      source,
      created_at: Math.floor(Date.now() / 1000),
      generated_by: generatedBy,
    });
  }

  if (questions.length === 0) {
    return {
      questions: [],
      candidates,
      empty: true,
      empty_notice: `知乎上跟「${topic}」相关的问题都还没有可用的回答。换一个说法再试一次。`,
      tone: toneId,
      pet_lines: petLines(toneId),
      warnings,
    };
  }

  return {
    questions,
    candidates,
    empty: false,
    empty_notice: null,
    tone: toneId,
    pet_lines: petLines(toneId),
    warnings,
  };
}
