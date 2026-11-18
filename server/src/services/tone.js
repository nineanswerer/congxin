/**
 * 桌宠语气。
 *
 * **产品里给用户一个语气切换，但默认就是温和陪伴**（用户 2026-11-18 拍板）：
 * > 「台词口语度做成可选项，且默认就是当前这版（温和陪伴）。产品里给一个语气切换，
 * > 但别把默认改成活泼的。」
 *
 * ## 唯一真源是 contracts/tone.json
 *
 * 文案写在契约层，后端与前端读的是同一份（跟 taxonomy.json 同一个套路）：
 * 前端要显示语气名、切换语气，契约层是双方都能看到的唯一一份。
 * **本文件不内置台词副本** —— 两份一定会漂。
 *
 * ## 语气只影响「桌宠自己说的话」
 *
 * `lines` 里的台词随语气变；
 * **数据陈述句不受影响** —— 断层 label、证据、置信度说明是事实陈述，
 * 换个口气不会让它更真，也不会让它更假。
 *
 * ⚠️ 默认值是**被用户拍板过的**，所以 `scripts/check-contract.ps1` 第 13 项会机器校验
 *    `default === 'gentle'` —— 有人手滑改默认值会被自检拦下。
 */

import { loadTone } from '../tone.js';

/** 取语气；不认识的值**回落到契约里的 default**，不报错。 */
export function resolveTone(value) {
  const doc = loadTone();
  const key = String(value ?? '').trim().toLowerCase();
  const lines = doc.lines ?? {};
  const tone = lines[key]
    ? { id: key, ...(doc.options?.find((o) => o.id === key) ?? {}) }
    : { id: doc.default, ...(doc.options?.find((o) => o.id === doc.default) ?? {}) };
  return { ...tone, lines: lines[tone.id] ?? {} };
}

/** 取一句台词，`{n}` 这类占位符会被替换（当前模板里没有占位符，留着防手滑）。 */
export function line(tone, key, vars = {}) {
  const t = resolveTone(tone);
  const raw = t.lines[key] ?? '';
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
  );
}

/**
 * 一次生成整组台词。
 *
 * **所有 key 永远都在**（不适用的置 `null`），前端按 key 取即可，
 * 不用先判断这个接口有没有这个 key。
 *
 * @param {string} tone
 * @param {{signalCount?:number, hasFracture?:boolean, insufficient?:boolean}} vars
 */
export function petLines(tone, vars = {}) {
  const t = resolveTone(tone);
  const n = vars.signalCount ?? 0;
  const insufficient = vars.insufficient ?? n < 2;
  const out = {};
  for (const key of Object.keys(t.lines)) {
    out[key] = line(t.id, key, { signalCount: n });
  }
  // 状态门控：不适用的台词给 null，而不是给一句用不上的漂亮话
  if (!vars.hasFracture) out.fracture = null;
  if (!insufficient) out.insufficient = null;
  return out;
}

/** 给前端渲染语气切换器用的列表。 */
export function toneList() {
  const doc = loadTone();
  return (doc.options ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    is_default: Boolean(o.is_default),
    description: o.description ?? null,
  }));
}

/**
 * 语气目录：切换器要的东西 + 当前语气的全部台词。
 *
 * 前端调一次这个接口就能拿到切换器选项与所有台词；
 * 主流程里那些**没有专属接口**的台词（开场、咀嚼、吐卡片）也从这里取。
 */
export function toneCatalog(tone) {
  const doc = loadTone();
  const t = resolveTone(tone);
  const lines = {};
  for (const key of Object.keys(t.lines)) lines[key] = line(t.id, key);
  return {
    tone: t.id,
    name: t.name ?? t.id,
    is_default: t.id === doc.default,
    default: doc.default,
    options: toneList(),
    lines,
  };
}
