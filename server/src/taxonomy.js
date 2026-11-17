/**
 * 分类体系读取器。
 *
 * **唯一真源是 contracts/taxonomy.json**（契约层）——后端算、前端显示，
 * 口径必须只有一份。找不到文件就**大声失败**，绝不用内置副本兜底
 * （两份一定会漂，AGENTS.md 第 1 节：区分事实与推断，不要自己挑一个信）。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// server/src/taxonomy.js → ../../contracts/taxonomy.json
export const TAXONOMY_PATH = resolve(here, '..', '..', 'contracts', 'taxonomy.json');

let cachedTaxonomy = null;

export function loadTaxonomy() {
  if (cachedTaxonomy) return cachedTaxonomy;
  let raw;
  try {
    raw = readFileSync(TAXONOMY_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `读不到分类体系契约：${TAXONOMY_PATH}\n` +
        `这是契约层的唯一真源，缺了就必须报错——不要在本文件里内置副本兜底。\n` +
        `原始错误：${err.message}`
    );
  }
  try {
    cachedTaxonomy = JSON.parse(raw);
  } catch (err) {
    throw new Error(`分类体系契约不是合法 JSON：${TAXONOMY_PATH} —— ${err.message}`);
  }
  return cachedTaxonomy;
}
