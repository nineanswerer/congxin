/**
 * 《从心日报》· 头版渲染
 *
 * ## 它是什么
 * 把「你收藏 / 读过的东西」印成一张复古报刊头版——这是「从心」长期要做的事：
 * 每天把真实的阅读痕迹沉淀成一份可回看的报纸，让「次日再来」有个理由。
 *
 * ## 三条硬规则（沿用 contracts/api.json）
 *   1. **只用真实数据** —— 条目、分类、时间、额度全部来自接口，不编往期、不造引言。
 *   2. **空 ≠ 失败** —— 空数据显示后端的 empty_notice。
 *   3. **出处必填** —— 每条索引都能点回知乎原文；拿不到 url 的条目不进索引。
 *
 * ## 「每日」怎么体现
 * 报头印**当天日期 + 期号**（北京时间）。期号 = 年内第几天，例如 2026-11-21 是第 325 期。
 * 往期不做历史存档（项目原取舍：不做长期留存）——每一期都是当天真实数据的快照。
 */

import { escapeHtml } from './pet.js';

/** 北京时间当天日期与期号（年内第几天）。 */
function todayIssue() {
  // 用 UTC 偏移 8 小时拿到北京日历日，避免本机时区影响报头日期。
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getUTCDay()];
  const start = Date.UTC(y, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - start) / 86400000) + 1;
  return {
    dateText: `${y} 年 ${m} 月 ${d} 日 · 星期${week}`,
    issue: String(dayOfYear).padStart(3, '0'),
    ymd: `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`,
  };
}

/** 把秒级时间戳印成「M月D日」，取自真实收藏时间。 */
function stampDate(sec) {
  if (!sec || !Number.isFinite(Number(sec))) return '';
  const d = new Date(Number(sec) * 1000 + 8 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** 域名摘要，作报纸里的「出处」小字。 */
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * 渲染头版。
 * @param {HTMLElement} root       日报容器
 * @param {object} opts
 *   @param {object} opts.favorites getFavorites 的真实返回
 *   @param {object} opts.quota     getQuota 的真实返回
 *   @param {object} opts.profile   getProfile 的真实返回（可选）
 *   @param {string} opts.error     读收藏失败时的真实提示（可选）
 */
export function renderDaily(root, opts = {}) {
  if (!root) return;
  const { favorites, quota, profile, error } = opts;
  const { dateText, issue, ymd } = todayIssue();

  const items = (favorites?.items ?? []).filter((it) => it?.url);
  const cats = favorites?.category_distribution ?? [];
  const span = favorites?.span ?? {};
  const collected = favorites?.collected_count ?? items.length;

  // 额度：只取真实数字，拿不到就印「—」，不编。
  const apis = quota?.apis ?? [];
  const findQuota = (id) => apis.find((a) => a.api_id === id);
  const discovery = findQuota('question_discovery');
  const userData = findQuota('user_data');
  const fmtQuota = (a) => a ? `${a.remaining}/${a.total}` : '—';

  // 阅读版图：真实分类分布，用墨色深浅的横条表示占比（无第二种颜色）。
  const maxRatio = Math.max(1, ...cats.map((c) => Number(c.ratio) || 0));
  const catRows = cats.map((c) => {
    const ratio = Number(c.ratio) || 0;
    const pct = Math.round(ratio * 100);
    const bar = Math.max(6, Math.round((ratio / maxRatio) * 100));
    return `
      <div class="daily-cat">
        <span class="daily-cat-name">${escapeHtml(c.category ?? '未分类')}</span>
        <span class="daily-cat-bar"><i style="width:${bar}%"></i></span>
        <span class="daily-cat-pct num">${pct}%</span>
      </div>`;
  }).join('');

  // 今日索引：每条真实收藏 = 报纸里的一条要闻，点击查看知乎原文。
  const indexRows = items.length
    ? items.map((it, i) => {
        const when = stampDate(it.fav_time ?? it.created_at);
        const meta = [it.author?.name ? `文 / ${it.author.name}` : '', when, it.content_type === 'answer' ? '回答' : '文章']
          .filter(Boolean).join(' · ');
        return `
        <article class="daily-item">
          <span class="daily-item-no num">${String(i + 1).padStart(2, '0')}</span>
          <div class="daily-item-body">
            <h4><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title ?? '(无标题)')}</a></h4>
            <div class="daily-item-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="daily-item-host">${escapeHtml(hostOf(it.url))}</span>
        </article>`;
      }).join('')
    : `<div class="empty-hint">${escapeHtml(favorites?.empty_notice ?? error ?? '今天还没有可印的收藏。')}</div>`;

  const spanText = span.distinct_days
    ? `${span.distinct_days} 天 · 跨 ${span.span_days ?? '—'} 天`
    : '—';
  const owner = profile?.name ? escapeHtml(profile.name) : '你';

  root.innerHTML = `
    <div class="daily-paper">
      <!-- 报头 -->
      <header class="daily-masthead">
        <div class="daily-mast-top">
          <span>第 ${issue} 期</span>
          <span>知乎真实收藏 · 每日一印</span>
          <span>${escapeHtml(ymd)}</span>
        </div>
        <h1 class="daily-name">从<em>心</em>日报</h1>
        <div class="daily-mast-bottom">
          <span>${escapeHtml(dateText)}</span>
          <span>${escapeHtml(owner)} · 阅读存档</span>
        </div>
      </header>

      <!-- 今日要闻索引 -->
      <section class="daily-section">
        <div class="daily-section-head"><b>今日索引</b><span class="daily-section-sub">你收藏 / 读过的 ${collected} 条</span><span class="rule"></span></div>
        <div class="daily-index">${indexRows}</div>
      </section>

      <!-- 两栏：阅读版图 + 阅读跨度 -->
      <div class="daily-cols">
        <section class="daily-section">
          <div class="daily-section-head"><b>阅读版图</b><span class="daily-section-sub">按知乎真实分类</span><span class="rule"></span></div>
          <div class="daily-cats">${catRows || '<div class="empty-hint">暂无分类数据</div>'}</div>
        </section>
        <section class="daily-section">
          <div class="daily-section-head"><b>本期数据</b><span class="rule"></span></div>
          <div class="daily-facts">
            <div class="daily-fact"><span class="k">收藏条数</span><span class="v num">${collected}</span></div>
            <div class="daily-fact"><span class="k">阅读跨度</span><span class="v">${escapeHtml(spanText)}</span></div>
            <div class="daily-fact"><span class="k">问题发现额度</span><span class="v num">${fmtQuota(discovery)}</span></div>
            <div class="daily-fact"><span class="k">用户数据额度</span><span class="v num">${fmtQuota(userData)}</span></div>
          </div>
          <p class="daily-fineprint">数据来自你的知乎真实收藏与当日额度；每张卡片都能点回原文。往期不存档，每期都是当天快照。</p>
        </section>
      </div>
    </div>`;
}
