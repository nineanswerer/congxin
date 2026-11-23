/**
 * API 层。
 *
 * **三条硬规则（contracts/api.json）**：
 *   1. 空数据 ≠ 失败 —— 空数据是 200 + `empty: true` + `empty_notice`，
 *      前端要显示那句中文提示，**不许自己编一个空态文案**。
 *   2. 失败必须是真话 —— 4xx/5xx 走统一错误信封，`error.user_hint` 是给人看的中文，
 *      **直接显示它**，不要把 `error.message` 甩给用户。
 *   3. 出处必填 —— 内容类接口拿不到出处就是失败，**不许拿无出处的数据凑数**。
 *
 * 所有请求都走同源 `/api`（开发时由 `web/serve.js` 代理到后端），所以不用处理 CORS。
 */

/** 后端失败。`hint` 是给人看的中文提示，前端直接显示它。 */
export class ApiFail extends Error {
  constructor(code, message, hint, detail) {
    super(message ?? code);
    this.name = 'ApiFail';
    this.code = code ?? 'UNKNOWN';
    this.hint = hint ?? '这个请求失败了，稍后再试一次。';
    this.detail = detail ?? null;
  }
}

async function request(path, { method = 'GET', body = null, query = null } = {}) {
  const url = new URL(path, location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // ⚠️ 这句是给**终端用户**看的，不能带本地开发指令 ——
    //    部署到公网后「先跑 node server/src/index.js」是句错话
    //    （服务器在别处跑着，用户手里根本没有这个进程）。
    //    开发细节进控制台，界面只说「连不上 + 稍后再试」（2026-11-23 22:3x 拟真审计）。
    console.warn('[从心] 网络请求失败', path, err);
    throw new ApiFail('NETWORK_ERROR', String(err?.message ?? err),
      '连不上服务器。这次没读到数据，过一会儿再试一次。');
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiFail(e.code ?? `HTTP_${res.status}`, e.message ?? `HTTP ${res.status}`,
      e.user_hint ?? `请求失败了（HTTP ${res.status}）。`, e.detail ?? null);
  }
  if (!json) {
    throw new ApiFail('BAD_RESPONSE', '后端返回的不是 JSON', '后端返回了意料之外的内容，接口可能出问题了。');
  }
  return json;
}

export const apiGet = (path, query) => request(path, { query });
export const apiPost = (path, body) => request(path, { method: 'POST', body });

// ---------------------------------------------------------------- 具体接口

/** 语气目录：切换器选项 + 当前语气的全部台词。**前端唯一的文案来源。 */
export const getTone = (tone) => apiGet('/api/tone', { tone }).then((r) => r.data);

/** 收藏信号：真实收藏条目，每条自带真实知乎链接（= 卡片出处）。 */
export const getFavorites = (limit = 9) => apiGet('/api/behavior/favorites', { limit }).then((r) => r.data);

/** 关注信号。 */
export const getFollowees = (limit = 9) => apiGet('/api/behavior/followees', { limit }).then((r) => r.data);

/** 创作信号：用户自己写过什么（脚本 4:05 那句「你自己也写过一句」的原料）。 */
export const getContents = (limit = 5) => apiGet('/api/behavior/contents', { limit }).then((r) => r.data);

/** 自述 vs 行为 → 断层。 */
export const getTension = (selfReport, tone) =>
  apiPost('/api/behavior/tension', { self_report: selfReport, tone }).then((r) => r.data);

/** 情境题（每题必带知乎出处）。 */
export const getSituation = ({ topic, count = 2, layer, difficulty, selfReport, answered }) =>
  apiPost('/api/situation/question', {
    topic,
    count,
    layer: layer ?? 'situational',
    difficulty: difficulty ?? 'medium',
    self_report: selfReport ?? null,
    answered_sources: answered ?? [],
    tone: null,
  }).then((r) => r.data);

/**
 * 知识卡片：**知乎问题 + 真实回答**这一对。
 *
 * `source.answer_url` 是**契约层强制必填**（`SourceRef.answer_url` 不再是 nullable，
 * 自检第 11 项机器校验）——**宁可少给一张，也不能给没出处的**。
 *
 * `content` = `source.answer_summary`（上游给的官方摘要截取，**不是 AI 生成**），
 * 而且可能很长（200+ 字、带 `[图片]` 标记）→ **截断/折叠是前端的活**。
 *
 * ⚠️ 额度：吃「问题发现」组，**1 张卡 ≈ 2 次**（1 次问题发现 + 1 次回答摘要），
 * N 张 ≈ 1 + N 次。同主题有 5 分钟缓存 + 按问题 URL 单独缓存，反复演同一主题基本不烧额度。
 *
 * @param {object} opts
 * @param {string} opts.topic 主题词
 * @param {number} [opts.count] 要几张（1—5）
 * @param {string[]} [opts.seenSources] 已经吐过的出处（问题 URL），后端会跳过
 * @param {string} [opts.tone] 语气 id
 * @param {boolean} [opts.sameQuestion] **同题两答**：`true` 时返回**同一个知乎问题下的多条回答**
 *        （两张卡 `source.question_url` 相同、`source.answer_url` 不同）——「吵起来的两边」要的就是这个。
 *        不传 = 默认模式：N 个**不同问题**的卡片。
 */
export const getCards = ({ topic, count = 2, seenSources, tone, sameQuestion }) =>
  apiPost('/api/cards', {
    topic,
    count,
    tone: tone ?? null,
    seen_sources: seenSources ?? [],
    same_question: sameQuestion ? true : false,
  }).then((r) => r.data);

/** 三层认知地形（后端只给参数，前端负责渲染）。 */
export const getTerrain = (tone) => apiGet('/api/terrain', { tone }).then((r) => r.data);

/** 提交作答 → 地形生长。 */
export const answerTerrain = ({ questionId, answerKey, freeText, tone }) =>
  apiPost('/api/terrain/answer', {
    question_id: questionId,
    answer_key: answerKey ?? null,
    free_text: freeText ?? null,
    tone: tone ?? null,
  }).then((r) => r.data);

/** 当前身份：OAuth / 开发期自读。 */
export const getProfile = () => apiGet('/api/auth/profile').then((r) => r.data);

/** 额度。 */
export const getQuota = () => apiGet('/api/quota').then((r) => r.data);
