/**
 * 一次性探针：把上游 `content/question_answers` 的**原始字段**打出来。
 *
 * 为什么需要：要做「同一问题下的两条回答 = 吵起来的两方」，
 * 得知道上游的回答对象里**有没有作者名**（`P1` 脚本要「来自两个不同的人」）。
 * 只看我们自己封装的 `SourceRef` 看不到原始字段，所以直接打上游。
 *
 * 额度：1 次「问题发现」（`content/question_answers`）。
 */
import { getQuestionAnswers } from '../src/zhihu/endpoints.js';

const QUESTION_URL = process.argv[2] ?? 'https://www.zhihu.com/question/14446476348';

const r = await getQuestionAnswers(QUESTION_URL, 3);
console.log('items 数:', r.items?.length ?? 0);
for (const [i, it] of (r.items ?? []).entries()) {
  console.log(`--- 第 ${i + 1} 条的字段 ---`);
  console.log('keys:', Object.keys(it ?? {}).join(', '));
  const brief = {};
  for (const [k, v] of Object.entries(it ?? {})) {
    brief[k] = typeof v === 'string' && v.length > 90 ? `${v.slice(0, 90)}…` : v;
  }
  console.log(JSON.stringify(brief, null, 2));
}
