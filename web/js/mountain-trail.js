/**
 * 本机阅读足迹（历史文件名保留为 mountain-trail.js，只为兼容既有 import）
 *
 * 两件事，都只存在**当前浏览器 localStorage**，不上传、不进仓库、不编造：
 *   1. 每日进度：当天读到的真实收藏条数 → 阅读目标刻度（0..1）；
 *   2. 周报里程碑：每周可手动记一块足迹碑，写下当时的真实数据快照与一句话。
 *
 * 诚实口径：
 *   - 进度来自 getFavorites 的真实返回，读不到就是 0，不用假数据填；
 *   - 里程碑是**本机手写记录**，界面明确标「只存在这台设备的浏览器里」，
 *     不冒充知乎官方数据，也不跨设备同步。
 */

const KEY_DAILY = 'congxin.mountain.daily.v1';
const KEY_MILES = 'congxin.mountain.milestones.v1';

function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

/** 本地日期（YYYY-MM-DD），不用 UTC，避免跨时区把「今天」算错。 */
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 周键（YYYY-Www），用于每周一块碑。 */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * 记录今天的真实阅读条数。
 * @param {number} count getFavorites 的真实条数（失败/空就是 0）
 * @returns {{date:string,count:number,progress:number}}
 */
export function recordDailyRead(count) {
  const n = Math.max(0, Number(count) || 0);
  const daily = safeGet(KEY_DAILY) ?? {};
  const date = localDate();
  // 每天 12 条视为登顶；这是「目标刻度」，不是编造的已读数。
  const GOAL = 12;
  daily[date] = { count: n, progress: Math.min(1, n / GOAL), at: Date.now() };
  const dates = Object.keys(daily).sort();
  for (const old of dates.slice(0, -60)) delete daily[old]; // 只留最近 60 天
  safeSet(KEY_DAILY, daily);
  return { date, count: n, progress: daily[date].progress };
}

/** 读今天的进度（不写）。 */
export function todayProgress() {
  const daily = safeGet(KEY_DAILY) ?? {};
  return daily[localDate()] ?? { count: 0, progress: 0, date: localDate() };
}

/** 本机已经记录过阅读足迹的天数（不写、不上传；没有记录就是 0）。 */
export function trailDays() {
  const daily = safeGet(KEY_DAILY);
  return daily && typeof daily === 'object' ? Object.keys(daily).length : 0;
}

/**
 * 立一块周报里程碑。同一周重复调用会更新那块碑，不会堆出一堆。
 * @param {{note?:string, snapshot?:object}} payload note 是用户自己写的足迹；snapshot 是当时的真实数据快照
 * @returns {Array} 全部里程碑（按周升序）
 */
export function plantMilestone(payload = {}) {
  const list = safeGet(KEY_MILES) ?? [];
  const week = weekKey();
  const entry = {
    week,
    date: localDate(),
    note: String(payload.note ?? '').slice(0, 80),
    snapshot: payload.snapshot ?? {},
    at: Date.now(),
  };
  const i = list.findIndex((m) => m.week === week);
  if (i >= 0) list[i] = entry; else list.push(entry);
  list.sort((a, b) => a.week.localeCompare(b.week));
  safeSet(KEY_MILES, list);
  return list;
}

export function listMilestones() {
  const list = safeGet(KEY_MILES);
  return Array.isArray(list) ? list : [];
}

export function removeMilestone(week) {
  const list = listMilestones().filter((m) => m.week !== week);
  safeSet(KEY_MILES, list);
  return list;
}
