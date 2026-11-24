/**
 * 进程内会话存储。**零数据库**（D22：官方 FAQ 明确「前端 + Node 后端且不含数据库写入」可用 AI Works 部署）。
 *
 * ## 2026-11-24：认知闭环下线后，这里被清空了（决策 D66）
 *
 * 原来这个文件存的是「认知闭环」的东西：
 *   - 发出去过的**情境题**（`question_id` → 题面 + 出处 + 选项）
 *   - 用户对情境题的**作答**（→ 地形上长出来的块）
 *   - 最近一次的**自述**（前端问卷结果）
 *
 * 那三个接口（`/api/situation/question`、`/api/terrain`、`/api/terrain/answer`）
 * 已随认知闭环一起下线，**这三个函数的唯一调用方就是它们** → 一并删掉。
 *
 * ## 新主线（「问它」）为什么不需要会话状态
 *
 * `POST /api/advice` 是**无状态**的：用户抛一个问题 → 知乎搜 → 直答判断 → 给方案。
 * - 「问过什么」由**前端 localStorage** 记（桌宠伴侣的本机记忆，见 `web/js/pet-companion.js`）
 * - 「同一个问题别重复烧额度」由**缓存**解决（`lib/cache.js`，5 分钟）
 * → 所以后端不需要为它建会话状态。
 *
 * 保留 `sessionStats()` 是因为 `/api/health` 要用它看进程内状态。
 */

const MAX_SESSIONS = 200;

const sessions = new Map();

function newSession(id) {
  return { id, createdAt: Date.now() };
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

/** 会话统计，给 /api/health 看。 */
export function sessionStats() {
  return {
    sessions: sessions.size,
  };
}
