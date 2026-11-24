/**
 * 「问它」—— 2026-11-24 定的**新主线**（决策 D66）。
 *
 * ## 这条链路是什么
 *
 * 用户抛给桌宠**一个问题**，桌宠去知乎找**相似的困境**，从真实回答里挑出对策，
 * 判断这些对策**适不适合他这个具体情况**，最后给出一个能照着做的方案。
 *
 * ```
 * 用户提问
 *   ↓
 * ① 知乎搜索   GET /api/v1/content/zhihu_search?Query=<问题>&Count=10
 *   ↓            → 10 条**真实回答**（问题标题 + 作者 + 正文 + 原回答链接）
 * ② 取候选      按 RankingScore 取前 N 条，每条正文截断
 *   ↓
 * ③ 直答       POST /v1/chat/completions（zhida-thinking-1p5）
 *   ↓            → 判断适用性（applicable / partially / not）+ 方案步骤 + 引用编号
 * ④ 对账        模型只回**编号**，后端把编号映射回**上游真实 URL**
 *   ↓            → 出处三件套（问题标题 / 问题链接 / 原回答链接）一个字段都不由模型生成
 * ```
 *
 * ## 为什么搜「知乎搜索」而不是「问题发现」（2026-11-24 实测）
 *
 * | 上游 | 额度 | 能不能给全出处三元组 |
 * | --- | --- | --- |
 * | `content/zhihu_search` | **5000 次/天** | ✅ **实测 10 条全是 `Answer` 类型**，`Url` 就是原回答链接（`/question/xxx/answer/yyy`） |
 * | `content/question_answers` | 问题发现组，**100 次/天** | ✅ 但额度紧得多 |
 *
 * → 新主线走 **5000/天** 的搜索，不烧最紧的那一组。
 * → ⚠️ 这**推翻了** `services/cards.js` 里「`zhihu_search` 给不了原回答 URL」的旧记录
 *   （2026-11-18 实测，当时搜的关键词返回的是 `Question` 类型；本次搜「工作压力大怎么办」
 *   返回 10 条全是 `Answer`）。卡片链路**暂不改**（它要「同题两答」，搜索给不出同一问题下的多条），
 *   但这条记录已经不准了，见 `docs/decisions.md` D66。
 *
 * ## 三条硬规则（跟全项目一致）
 *
 * 1. **出处必填**：方案里的每一条建议都要能指回知乎原文。
 *    模型只允许回**编号**，真实 URL 由后端从上游数据里映射 —— **模型不可能编造出处**。
 * 2. **空数据 ≠ 失败**：知乎搜不到 → 200 + `empty: true` + 中文 `empty_notice`。
 * 3. **失败必须是真话**：直答没给出可核对的引用 → **不给方案**，给真话提示。
 *    宁可回一句「这次没对上出处」，也不给一个看着像样但查无出处的答案。
 *
 * ## 额度
 *
 * - 知乎搜索：**5000 次/天**（本链路的主要消耗）
 * - 直答：**100 次/天**（每次问一次烧 1）→ **必须带缓存**（见下）
 *
 * 缓存分两层：
 * - `advice:pool:<问题>` —— 搜索结果，5 分钟。换个语气重问不必再搜。
 * - `advice:full:<问题>:<语气>` —— 完整结果，5 分钟。**同一个问题重复问不再烧直答额度**
 *   （演示要反复问同一个问题，这条很关键）。
 */

import { ApiError } from '../lib/errors.js';
import { cached } from '../lib/cache.js';
import { zhihuSearch, chatComplete } from '../zhihu/endpoints.js';
import { petLines, resolveTone } from './tone.js';

const MODEL = 'zhida-thinking-1p5';
const MAX_QUESTION_LEN = 100;
const MAX_CANDIDATES = 6;      // 实际送进模型的候选条数（上游给 10 条）
const EXCERPT_LEN = 700;       // 每条正文截断长度（模型上下文有限）
const POOL_TTL_MS = 5 * 60 * 1000;

/** 适用性判断的三档（模型只能回这三种值之一）。 */
const VERDICTS = new Set(['applicable', 'partially_applicable', 'not_applicable']);

// ---------------------------------------------------------------- 候选池

/**
 * 把上游搜索结果归一化成候选。
 *
 * ⚠️ `Url` 形如 `https://www.zhihu.com/question/<qid>/answer/<aid>?utm_...`：
 *    - **原回答链接** = 去掉 query 的完整 Url
 *    - **问题链接** = 取到 `/answer/` 之前那段
 *    → 出处三件套里的两个 URL **都能从这一条数据推出来**，不需要额外上游调用。
 */
function normalizeSearchItem(raw) {
  const url = raw?.Url ?? '';
  const title = String(raw?.Title ?? '').replace(/\s*-\s*知乎\s*$/, '').trim();
  const text = String(raw?.ContentText ?? '').trim();
  if (!url || !title || !text) return null;

  const [base] = url.split('?');
  const m = /^([^#?]*\/question\/[^/]+)\/answer\//.exec(base);
  const questionUrl = m ? m[1] : base;
  const answerUrl = base;

  return {
    question_title: title,
    question_url: questionUrl,
    answer_url: answerUrl,
    answer_content_type: raw?.ContentType === 'Article' ? 'article' : 'answer',
    author_name: raw?.AuthorName ?? null,
    authority_level: raw?.AuthorityLevel ?? null,
    vote_up_count: Number.isFinite(raw?.VoteUpCount) ? raw.VoteUpCount : null,
    comment_count: Number.isFinite(raw?.CommentCount) ? raw.CommentCount : null,
    excerpt: text.slice(0, EXCERPT_LEN),
    has_more_text: text.length > EXCERPT_LEN,
  };
}

/** 拉一次知乎搜索，**只这 1 次上游调用**。 */
async function fetchCandidates(question) {
  const { items, emptyReason } = await zhihuSearch(question, 10);
  const candidates = items.map(normalizeSearchItem).filter(Boolean);
  return { candidates, emptyReason: emptyReason ?? null };
}

// ---------------------------------------------------------------- 直答

/** 送进模型的那段材料：编号 + 问题标题 + 作者 + 正文。 */
function buildMaterial(candidates) {
  return candidates
    .map((c, i) => {
      const n = i + 1;
      const extra = c.has_more_text ? '（正文较长，已截断）' : '';
      return [
        `[${n}] 问题：${c.question_title}`,
        `    作者：${c.author_name ?? '匿名'}`,
        `    回答：${c.excerpt}${extra}`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * 提示词：**标记式纯文本**，不是 JSON。
 *
 * ⚠️ **2026-11-24 实测踩过的坑（别改回去）**：
 *   原本这里要求「只输出 JSON」，`zhida-thinking-1p5` **完全无视** —— 它返回的是
 *   一篇 786 字的自然语言长文（内容质量其实很好，7 步具体做法、确实基于材料），
 *   但一个字段都解析不出来 → 整条链路只能返回「这次没把答案整理出来」。
 *   → 这个模型**不是「指令跟随型 JSON 输出」的模型**，别再指望它吐 JSON。
 *
 *   改成「标记式纯文本」后实测**能稳定解析**：模型只需要在每段前面写几个字
 *   （`判断：` / `提示：` / `方案：`），比让它吐一个完整 JSON 容器容易得多。
 *   解析器 `parseMarked()` 对 Markdown 粗体、全半角冒号、编号位置都做了容错。
 *
 * 格式（**编号只准填材料里出现过的**，出处由此回指真实 URL）：
 *
 *   判断：适用 / 部分适用 / 不适用
 *   提示：什么情况下这套不适用，或者材料里缺了什么
 *   方案：
 *   1. 第一步……[1,3]
 *   2. 第二步……[2]
 */
const SYSTEM_PROMPT = `你是一只桌面宠物「刘看山」，正在陪一个朋友一起面对他的困扰。

你手上的材料是**从知乎搜到的真实回答**。你要做两件事：
1. 判断这些回答里给出的办法，**对朋友这个具体情况适不适用**；
2. 如果适用，给出一个**能照着做**的方案。

【硬要求】
- 只能依据给你的材料，**不许用你自己的知识补充事实**。
- 语气温和、具体、不说教、不喊口号。**不要写「要积极面对」「调整心态」这种没法执行的话**。
- 方案里的每一步都要是**能立刻开始做的具体动作**。
- 材料里没有针对这个具体情形的办法，就老实写「不适用」，并说清差在哪。`;

/**
 * **user** 消息里的格式要求 —— **必须和材料放在一起**。
 *
 * ⚠️ **2026-11-24 实测踩过的坑（别改回去）**：
 *   ① 原本在 system 里要求「只输出 JSON」，`zhida-thinking-1p5` **完全无视** —— 返回一篇
 *      786 字的自然语言长文（内容质量其实很好），但一个字段都解析不出来。
 *   ② 把格式也搬进 system，**照样无视** —— 它照样写长文。
 *   ③ **把格式要求搬到 user 消息、跟材料放在一起 → 一次就完美听话** ✓
 *      （`zhida-fast-1p5` 也一样；两者都不认 OpenAI 的 `response_format`，只认「就在眼前的要求」）。
 *
 * → 结论：**格式要求必须写在 user 消息里**，system 只留角色和原则。
 */
const FORMAT_INSTRUCTIONS = `请只输出下面这几个字段，不要任何解释、不要开场白、不要结语：

判断：（适用 / 部分适用 / 不适用）
结论：（一句话结论：这些办法适不适合这个具体情况）
提示：（什么情况下这套不适用，或者材料里缺了什么。没有就写「无」）
方案：
1. （第一步的具体动作）[1,3]
2. （第二步的具体动作）[2]

规则：
- 「判断」只能填三个词之一：**适用** / **部分适用** / **不适用**。
- 「方案」每一步**一行**，行首写「1.」「2.」；**每步结尾用方括号标出依据的材料编号**（如 \`[1,3]\`），
  编号**只能填材料里出现过的**（材料里的编号从 1 开始）。
- 材料里没有针对这个问题的办法时：「判断」写「不适用」，「方案」写「无」，但「提示」必须写清差在哪。
- 语气温和、具体、不说教；不要写「要积极面对」「调整心态」这种没法执行的话。`;

/**
 * 重试用的前缀：**只**强调格式。
 *
 * ⚠️ 只在第一次没解析出来时用 —— 直答 100 次/天，重试是最后手段。
 * ⚠️ 格式要求同样**要放在 user 消息里**（见上面的实测记录），
 *    所以这里是在原指令**前面**再顶一句，不换地方。
 */
const RETRY_PREFIX = `【⚠️ 上一条回答的格式没被读出来，重新回答一遍】
第一行必须**只**是「判断：适用」/「判断：部分适用」/「判断：不适用」三选一，后面不要跟别的话；
然后「结论：」「提示：」，然后「方案：」下面一行一步、每步结尾用方括号写依据编号。
**不要写开场白、不要写总结、不要写别的段落。**

`;

/** 三档判断的中文 ↔ 机器值。 */
const VERDICT_BY_ZH = {
  适用: 'applicable',
  部分适用: 'partially_applicable',
  不适用: 'not_applicable',
};

/**
 * 重试用的提示词：**只**强调格式，不重复内容要求。
 *
 * ⚠️ 只在第一次没解析出来时用 —— 直答 100 次/天，重试是最后手段。
 */
const SYSTEM_PROMPT_RETRY = null;   // ⚠️ 见上面：格式要求必须进 user 消息，system 不放格式

/**
 * 调一次直答并解析。
 *
 * ⚠️ **格式要求在 user 消息里**（见 SYSTEM_PROMPT 上面的实测记录）——
 *    放 system 里模型会无视它，自由发挥一篇文章。
 *
 * @param {string} userText  含格式要求 + 材料 + 问题
 * @param {number} temperature
 * @param {string} prefix    重试时顶在最前面的额外强调
 * @returns {{content:string|null, parsed:object|null}}
 */
async function askModel(userText, temperature, prefix = '') {
  const { content } = await chatComplete(MODEL, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${prefix}${userText}` },
  ], { temperature });
  return { content, parsed: parseAdvice(content) };
}

/**
 * 从直答返回的正文里抠出结构。
 *
 * ⚠️ **两条路都试**：
 *   ① `parseMarked()` —— 标记式（本提示词的主格式）
 *   ② `parseModelJson()` —— JSON（万一哪个模型听话，或以后换了模型）
 *   两条都不中 → 返回 null → 上层**重试一次**，再不行就真话失败。
 */
function parseAdvice(content) {
  const marked = parseMarked(content);
  if (marked) return marked;

  // ---- JSON 兜底（万一模型这次听话了，或以后换了模型）----
  const parsed = parseModelJson(content);
  if (!parsed) return null;
  const verdict = VERDICTS.has(String(parsed.verdict)) ? String(parsed.verdict) : null;
  if (!verdict) return null;
  const refs = normalizeRefs(parsed.refs, null);
  const steps = (Array.isArray(parsed.plan) ? parsed.plan : [])
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((text) => ({ text, refs: [] }));
  return {
    verdict,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() || null : null,
    caveat: typeof parsed.caveat === 'string' ? parsed.caveat.trim() || null : null,
    steps,
    refs,
    format: 'json',
  };
}

/**
 * 解析标记式输出。
 *
 * 容错点（实测踩出来的）：
 * - Markdown 粗体：`**判断**：适用` / `**方案**：`
 * - 全半角冒号：`：` `:` 都要认
 * - 「方案」块里可能是 `1. xxx` / `1、xxx` / `- xxx` / `**1. xxx**`
 * - 引用编号可能写 `[1,3]` / `[1、3]` / `（1,3）` / `[1 3]`
 */
function parseMarked(content) {
  if (typeof content !== 'string' || !content.trim()) return null;

  const text = content.replace(/\r\n/g, '\n');

  // ---- 判断 ----
  const verdictMatch = /(?:判断|结论|适用性)\s*[*_#：:\s]*\n?\s*(完全适用|部分适用|适用|不适用|完全不适合)/.exec(text);
  if (!verdictMatch) return null;
  const rawVerdict = verdictMatch[1];
  const verdict = VERDICT_BY_ZH[rawVerdict]
    ?? (rawVerdict === '完全适用' ? 'applicable'
      : rawVerdict === '完全不适合' ? 'not_applicable'
        : null);
  if (!verdict) return null;

  // ---- 提示（caveat）----
  let caveat = null;
  const caveatMatch = /(?:提示|说明|注意)\s*[*_#：:\s]*\n?\s*([^\n]*)/.exec(text);
  if (caveatMatch) {
    const raw = caveatMatch[1].trim();
    if (raw && raw !== '无' && raw !== '没有' && raw !== 'none') caveat = raw;
  }

  // ---- 方案 ----
  const planMatch = /(?:方案|步骤|做法)\s*[*_#：:]*\s*\n([\s\S]*?)(?=\n\s*(?:提示|说明|注意|判断|结论)\s*[*_#：:]|\n*$)/.exec(text);
  const planBlock = planMatch ? planMatch[1] : '';
  const steps = parseSteps(planBlock);
  const refs = normalizeRefs(
    steps.flatMap((s) => s.refs),
    null,
  );

  // ---- 一句话结论 ----
  // 标记式格式里「结论：」是首选来源；模型没给就留 null（**不许拿步骤里的话编一句结论**）。
  let summary = null;
  const sumMatch = /(?:一句话结论|结论)\s*[*_#：:\s]*\n?\s*([^\n]*)/.exec(text);
  if (sumMatch) {
    const raw = sumMatch[1].trim().replace(/^[*_#\s]+|[*_#\s]+$/g, '');
    if (raw && raw !== '无' && raw.length <= 200) summary = raw;
  }
  if (!summary) {
    // 兜底：正文第一行非空、不是标记行、也不是步骤行
    const lead = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !/^(判断|结论|一句话结论|适用性|提示|说明|注意|方案|步骤|做法)\s*[*_#：:]/.test(l) && !/^\d+[.、)）]/.test(l));
    if (lead && lead.length <= 120 && !/^\*\*|^#/.test(lead)) {
      summary = lead.replace(/^[*_#\s]+|[*_#\s]+$/g, '');
    }
  }

  return { verdict, summary, caveat, steps, refs, format: 'marked' };
}

/** 把方案块拆成步骤，并摘出每一步尾部的引用编号。 */
function parseSteps(block) {
  if (!block || !block.trim()) return [];
  const out = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // 行首序号：`1.` `1、` `1)` `**1. xxx**`；也要能接「- xxx」这种无序号行
    const m = /^(?:[*_#\s]*)(\d+)\s*[.、)）:：]?\s*(.+)$/.exec(line);
    if (!m) continue;
    const body = m[2].trim();
    if (!body || body === '无') continue;

    // 尾部引用编号（只认**行尾**的括号，避开正文里的「20 分钟」这种数字）
    const refsInLine = [];
    const tail = /[（(【\[]\s*(\d+(?:\s*[,，、\s]\s*\d+)*)\s*[）)】\]]\s*$/.exec(body);
    let text = body;
    if (tail) {
      for (const n of tail[1].split(/[,，、\s]+/)) {
        const v = Number.parseInt(n, 10);
        if (Number.isInteger(v)) refsInLine.push(v);
      }
      text = body.slice(0, tail.index).trim();
    }
    if (!text) continue;
    out.push({ text: text.replace(/^[*_#\s]+|[*_#\s]+$/g, ''), refs: refsInLine });
  }
  return out.slice(0, 6);
}

/** 从直答返回的正文里**抠出 JSON**。模型常带 ```json 围栏，要能容错。 */
function parseModelJson(content) {
  if (typeof content !== 'string' || !content.trim()) return null;

  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  if (fenced) candidates.push(fenced[1]);
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(content.slice(first, last + 1));
  candidates.push(content);

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

/**
 * 把模型给的 refs 归一成**真实存在的候选编号**。
 *
 * @param {any} raw       模型给的编号（数组或逗号串都行）
 * @param {number|null} maxIndex 候选条数（上界）。传 null 表示**暂不过滤**，
 *        等主流程知道候选数之后再统一过滤。
 */
function normalizeRefs(raw, maxIndex = null) {
  const list = Array.isArray(raw) ? raw : [];
  const out = new Set();
  for (const r of list) {
    const n = typeof r === 'number' ? r : Number.parseInt(String(r), 10);
    if (!Number.isInteger(n)) continue;
    if (n < 1) continue;
    if (maxIndex != null && n > maxIndex) continue;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * 把方案的每一步都绑到它依据的候选编号上。
 *
 * ⚠️ **逐步骤优先**：模型给某一步标了编号就用它（更精确）；
 *    没标的退回到「这一组依据」（整体 refs）—— 如实显示成「依据这几条」，
 *    **不许说成「这一步来自第 N 条」**。
 */
function bindSteps(steps, overallRefs) {
  return steps.map((s, i) => ({
    index: i + 1,
    text: s.text,
    source_indexes: s.refs.length ? s.refs : overallRefs,
  }));
}

/** 把候选编号映射回**上游真实出处**（一个字段都不由模型生成）。 */
function buildSources(refs, candidates) {
  return refs.map((n) => {
    const c = candidates[n - 1];
    return {
      ref: n,
      question_title: c.question_title,
      question_url: c.question_url,
      answer_url: c.answer_url,
      answer_content_type: c.answer_content_type,
      author_name: c.author_name,
      authority_level: c.authority_level,
      vote_up_count: c.vote_up_count,
      comment_count: c.comment_count,
    };
  });
}

// ---------------------------------------------------------------- 主入口

/**
 * @param {object} req
 * @param {{question:string, tone?:string}} req
 */
export async function buildAdvice(req) {
  const question = String(req.question ?? '').trim();
  if (!question) {
    throw new ApiError('VALIDATION_ERROR', 'question 不能为空', {
      userHint: '还没告诉我你遇到了什么事，说一句试试',
    });
  }
  if (question.length > MAX_QUESTION_LEN) {
    throw new ApiError('VALIDATION_ERROR', 'question 太长', {
      userHint: '这件事说得太长了，捡最要紧的那句再问我一次',
    });
  }

  const toneId = resolveTone(req.tone).id;

  // 缓存键按问题归一（去空白），同一件事不重复烧额度
  const qKey = question.replace(/\s+/g, ' ').toLowerCase();

  // ① 候选池（知乎搜索，5000/天）—— 5 分钟内同问题不重复搜
  const pool = await cached(`advice:pool:${qKey}`, POOL_TTL_MS, () => fetchCandidates(question));

  if (pool.candidates.length === 0) {
    return {
      question,
      verdict: 'not_applicable',
      summary: null,
      plan: [],
      caveat: null,
      sources: [],
      empty: true,
      empty_notice: `知乎上暂时没搜到跟这个问题相关的内容。换个说法再问我一次。`,
      candidate_count: 0,
      tone: toneId,
      pet_lines: petLines(toneId),
      warnings: pool.emptyReason ? ['search_empty_reason'] : [],
      cached: pool.cached,
    };
  }

  // 候选按上游排序（RankingScore）取前 N 条
  const candidates = pool.candidates.slice(0, MAX_CANDIDATES);

  // ②③ 完整结果（直答，100/天）—— 缓存 5 分钟，同问题重复问不烧额度
  const full = await cached(`advice:full:${qKey}:${toneId}`, POOL_TTL_MS, async () => {
    const material = buildMaterial(candidates);
    // ⚠️ **格式要求必须和材料放在同一条 user 消息里** —— 放 system 里模型会无视它。
    const userText = `${FORMAT_INSTRUCTIONS}\n\n【朋友的问题】\n${question}\n\n【知乎上搜到的真实回答】\n${material}`;

    // ---- 第一次：正常提示 ----
    let attempt = await askModel(userText, 0.4);

    // ---- 第二次：**只在第一次没解析出来时**才重试 ----
    //   直答 100 次/天，很紧 → 正常路径只烧 1 次。
    //   重试用更强调格式的前缀 + temperature 0（要稳定，不要发挥）。
    if (!attempt.parsed) {
      attempt = await askModel(userText, 0, RETRY_PREFIX);
    }

    const parsed = attempt.parsed;
    if (!parsed) {
      return { ok: false, reason: 'model_format' };
    }

    // 编号一律过滤成**真实存在的候选**（模型可能编一个 9、10）
    const maxIndex = candidates.length;
    const overallRefs = normalizeRefs(
      [...parsed.refs, ...parsed.steps.flatMap((s) => s.refs)],
      maxIndex,
    );
    const steps = bindSteps(
      parsed.steps.map((s) => ({
        text: s.text,
        refs: normalizeRefs(s.refs, maxIndex),
      })),
      overallRefs,
    );

    const summary = parsed.summary || null;
    const caveat = parsed.caveat || null;

    // ⚠️ **没有可核对的出处就不给方案**（硬规则 3：失败必须是真话）
    const hasSteps = steps.length > 0;
    const hasSource = steps.some((s) => s.source_indexes.length > 0);
    // 「不适用」是**合法结论**：只要说清差在哪，就算成功（不给步骤）
    const legitNotApplicable = parsed.verdict === 'not_applicable' && Boolean(summary || caveat);

    if (hasSteps && hasSource) {
      return { ok: true, verdict: parsed.verdict, summary, caveat, steps, refs: overallRefs };
    }
    if (!hasSteps && legitNotApplicable) {
      return { ok: true, verdict: parsed.verdict, summary, caveat, steps: [], refs: overallRefs };
    }
    return { ok: false, reason: 'no_traceable_source', verdict: parsed.verdict, summary, steps };
  });

  if (!full.ok) {
    return {
      question,
      verdict: 'not_applicable',
      summary: null,
      plan: [],
      caveat: null,
      sources: [],
      empty: true,
      empty_notice:
        full.reason === 'model_format'
          ? '这次没把答案整理出来，再问我一次试试。'
          : '这次没能把建议对上知乎原文出处，我就不给你一个查无出处的方案了。',
      candidate_count: candidates.length,
      tone: toneId,
      pet_lines: petLines(toneId),
      warnings: [full.reason],
      cached: pool.cached,
    };
  }

  return {
    question,
    verdict: full.verdict,
    summary: full.summary,
    plan: full.steps,
    caveat: full.caveat,
    sources: buildSources(full.refs, candidates),
    empty: false,
    empty_notice: null,
    candidate_count: candidates.length,
    tone: toneId,
    pet_lines: petLines(toneId),
    warnings: [],
    cached: pool.cached,
  };
}
