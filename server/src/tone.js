/**
 * 语气目录读取器。
 *
 * **唯一真源是 contracts/tone.json**（契约层）——后端与前端读的是同一份，
 * 口径必须只有一份。找不到文件就**大声失败**，绝不用内置副本兜底
 * （两份一定会漂，AGENTS.md 第 1 节：区分事实与推断，不要自己挑一个信）。
 *
 * 与 taxonomy.js 同构：契约层只增不改，缺了就必须报错。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// server/src/tone.js → ../../contracts/tone.json
export const TONE_PATH = resolve(here, '..', '..', 'contracts', 'tone.json');

let cachedTone = null;

export function loadTone() {
  if (cachedTone) return cachedTone;
  let raw;
  try {
    raw = readFileSync(TONE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `读不到语气契约：${TONE_PATH}\n` +
        '这是契约层的唯一真源，缺了就必须报错——不要在本文件里内置副本兜底。\n' +
        `原始错误：${err.message}`
    );
  }
  try {
    cachedTone = JSON.parse(raw);
  } catch (err) {
    throw new Error(`语气契约不是合法 JSON：${TONE_PATH} —— ${err.message}`);
  }
  return cachedTone;
}
