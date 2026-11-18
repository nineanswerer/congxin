/**
 * 进程内会话存储。**零数据库**（D22：官方 FAQ 明确「前端 + Node 后端且不含数据库写入」可用 AI Works 部署）。
 *
 * 存什么：
 *   - 发出去过的情境题（`question_id` → 题面 + 出处 + 选项）
 *   - 用户对情境题的回答（→ 地形上长出来的块）
 *   - 最近一次的自述（前端问卷结果）
 *
 * 为什么必须存：**`POST /api/terrain/answer` 要校验 question_id 是不是本会话发过的**——
 * 不校验的话，前端可以随便传一个 id 伪造"长出一块地"。契约里 404 的语义也依赖这个。
 *
 * 丢失成本：进程重启后作答记录会丢，地形回到初始状态。**这是刻意的取舍**——
 * 本届比赛期内的用法是「当场演一遍」，不做长期留存。
 */

const MAX_SESSIONS = 200;
const MAX_QUESTIONS_PER_SESSION = 50;

const sessions = new Map();

function newSession(id) {
  return {
    id,
    createdAt: Date.now(),
    questions: new Map(), // question_id -> SourceCard
    answers: new Map(),   // question_id -> { answer_key, free_text, block }
    selfReport: null,
  };
}

/** 取（没有就建）一个会话。 */
export function getSession(id = 'dev') {
  const key = String(id || 'dev');
  let s = sessions.get(key);
  if (!s) {
    s = newSession(key);
    sessions.set(key, s);
    // 进程内 Map 不清理会涨；超过上限就淘汰最老的（不做持久化，所以淘汰没风险）
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) sessions.delete(oldest[0]);
    }
  }
  return s;
}

/** 记住一道发出去的情境题。 */
export function rememberQuestion(sessionId, card) {
  const s = getSession(sessionId);
  if (s.questions.size >= MAX_QUESTIONS_PER_SESSION) {
    // 超出上限就淘汰最早的一道
    const oldest = [...s.questions.keys()][0];
    s.questions.delete(oldest);
  }
  s.questions.set(card.id, card);
  return card;
}

/** 取一道发出去过的题；没有就返回 null（调用方据此抛 404）。 */
export function findQuestion(sessionId, questionId) {
  return getSession(sessionId).questions.get(String(questionId)) ?? null;
}

/** 记住一次作答与长出的地形块。 */
export function rememberAnswer(sessionId, questionId, answer) {
  getSession(sessionId).answers.set(String(questionId), answer);
  return answer;
}

/** 某会话的全部作答（按作答顺序）。 */
export function listAnswers(sessionId) {
  return [...getSession(sessionId).answers.entries()].map(([questionId, a]) => ({ questionId, ...a }));
}

/** 记下最近一次的自述。 */
export function rememberSelfReport(sessionId, selfReport) {
  getSession(sessionId).selfReport = selfReport;
  return selfReport;
}

/** 取最近一次的自述。 */
export function getSelfReport(sessionId) {
  return getSession(sessionId).selfReport;
}

/** 会话统计，给 /api/health 看。 */
export function sessionStats() {
  return {
    sessions: sessions.size,
    questions: [...sessions.values()].reduce((a, s) => a + s.questions.size, 0),
    answers: [...sessions.values()].reduce((a, s) => a + s.answers.size, 0),
  };
}
