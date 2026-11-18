/**
 * 自述问卷（6 题）——**前端出题、前端计分**（D29 结论 5）。
 *
 * 后端不负责出题也不负责算 MBTI：前端算完把
 * `{ type, dimension_scores, traits }` 传给 `POST /api/behavior/tension`。
 *
 * ## 这份问卷在量什么
 *
 * 量的是「**你怎么说自己**」——自述侧。后端拿它跟「你实际在收藏什么」比，
 * 得出断层。所以每个选项同时带：
 *   - `dims`：认知功能维度的权重（Fi / Ti / Se / Ne / …）
 *   - `traits`：特质词。**特质词里出现「长期主义 / 体系化」这类深度词**，
 *     后端才会拿它跟上手型收藏去比。
 *
 * ⚠️ **选了「先跑起来 / 照着做」就是没有断层** —— 那说明你说的和做的本来就一致，
 * 这是诚实结果，不是 bug。断层出现与否由真实数据决定，**前端不许伪造**。
 */

export const QUESTIONS = [
  {
    id: 'q1',
    title: '接到一个没做过的任务，你第一件事是什么？',
    sub: '凭第一反应选，不用想哪个更"正确"。',
    options: [
      { k: 'A', text: '先把整条路想清楚，再动手', dims: { Ti: 0.8, Ne: 0.3 }, traits: ['长期主义', '体系化'] },
      { k: 'B', text: '先做出一个能跑的版本，边做边想', dims: { Se: 0.8, Te: 0.3 }, traits: ['行动优先'] },
      { k: 'C', text: '先找几篇教程，照着做一遍', dims: { Se: 0.6, Si: 0.4 }, traits: ['跟随参考'] },
    ],
  },
  {
    id: 'q2',
    title: '你怎么判断一个东西「做完了」？',
    sub: '',
    options: [
      { k: 'A', text: '能不能串成一套完整的方法', dims: { Ti: 0.7, Ni: 0.3 }, traits: ['完整', '体系化'] },
      { k: 'B', text: '能不能跑通', dims: { Se: 0.7, Te: 0.3 }, traits: ['结果优先'] },
      { k: 'C', text: '是不是最快的那条路', dims: { Se: 0.6, Ti: 0.4 }, traits: ['效率优先'] },
    ],
  },
  {
    id: 'q3',
    title: '学一个新东西，你更想搞清楚什么？',
    sub: '',
    options: [
      { k: 'A', text: '它背后的原理', dims: { Ti: 0.8, Ni: 0.2 }, traits: ['原理', '深入'] },
      { k: 'B', text: '怎么用起来', dims: { Se: 0.7, Te: 0.3 }, traits: ['实用优先'] },
      { k: 'C', text: '别人怎么评价', dims: { Fe: 0.7, Se: 0.3 }, traits: ['参考他人'] },
    ],
  },
  {
    id: 'q4',
    title: '你的收藏夹一般是什么状态？',
    sub: '',
    options: [
      { k: 'A', text: '分好类，越攒越成体系', dims: { Ni: 0.7, Si: 0.3 }, traits: ['系统化', '规划'] },
      { k: 'B', text: '攒了很多，但基本没再看', dims: { Se: 0.5, Ti: 0.3 }, traits: ['囤积待用'] },
      { k: 'C', text: '随手看到就存', dims: { Se: 0.6, Ne: 0.4 }, traits: ['即兴收集'] },
    ],
  },
  {
    id: 'q5',
    title: '和别人一起做事时，你更在意？',
    sub: '',
    options: [
      { k: 'A', text: '彼此理解与关系', dims: { Fi: 0.8, Fe: 0.2 }, traits: ['关系', '共情'] },
      { k: 'B', text: '推进得快', dims: { Te: 0.8, Se: 0.2 }, traits: ['效率优先'] },
      { k: 'C', text: '结论站得住', dims: { Ti: 0.8, Ni: 0.2 }, traits: ['逻辑一致'] },
    ],
  },
  {
    id: 'q6',
    title: '三个月后回看今天，你希望因为什么被记住？',
    sub: '',
    options: [
      { k: 'A', text: '把某件事想透，做成一套方法', dims: { Ni: 0.8, Ti: 0.4 }, traits: ['长期主义', '深度'] },
      { k: 'B', text: '交付了能用的东西', dims: { Te: 0.6, Se: 0.4 }, traits: ['结果优先'] },
      { k: 'C', text: '帮到了身边具体的人', dims: { Fi: 0.8, Fe: 0.4 }, traits: ['陪伴', '关系'] },
    ],
  },
];

/**
 * 计分。
 * @param {Record<string, number>} picked  { q1: 0, q2: 2, ... }（选项下标）
 * @returns {{type:string, dimension_scores:object, traits:string[]}}
 */
export function scoreQuiz(picked) {
  const raw = {};
  const traitSet = new Set();

  for (const q of QUESTIONS) {
    const idx = picked[q.id];
    if (idx === undefined || idx === null) continue;
    const opt = q.options[idx];
    if (!opt) continue;
    for (const [dim, w] of Object.entries(opt.dims ?? {})) {
      raw[dim] = (raw[dim] ?? 0) + w;
    }
    for (const t of opt.traits ?? []) traitSet.add(t);
  }

  const max = Math.max(...Object.values(raw), 0);
  const dimension_scores = {};
  for (const [dim, v] of Object.entries(raw)) {
    dimension_scores[dim] = max > 0 ? Math.round((v / max) * 100) / 100 : 0;
  }

  // 主导维度（不是完整的 MBTI 四字母码 —— 我们只测了这几个维度，别假装测全了）
  const top = Object.entries(raw).sort((a, b) => b[1] - a[1])[0];
  const type = top ? top[0] : 'Fi';

  return { type, dimension_scores, traits: [...traitSet] };
}

/** 维度中文名（跟后端 `DIMENSION_LABELS` 保持一致）。 */
export const DIMENSION_LABELS = {
  Fi: '内倾情感', Fe: '外倾情感',
  Si: '内倾感觉', Se: '外倾感觉',
  Ti: '内倾思维', Te: '外倾思维',
  Ni: '内倾直觉', Ne: '外倾直觉',
};
