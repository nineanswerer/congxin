/**
 * 认知闭环冒烟测试：真调知乎，跑通 tension / terrain / situation / terrain-answer 四个接口。
 *
 * 用法：
 *   $env:ZHIHU_ACCESS_SECRET = "<你的 Access Secret>"
 *   node scripts/smoke-cognition.js
 *
 * ⚠️ 会消耗额度：问题发现 100/天、直答 100/天。跑一次大约用掉 2—4 次问题发现 + 1 次直答。
 * 密钥只从环境变量读，**不写进任何文件**。
 */

import { buildTension } from '../src/services/tension.js';
import { buildTerrain, applyTerrainAnswer } from '../src/services/terrain.js';
import { buildSituationQuestions } from '../src/services/situation.js';
import { rememberQuestion, rememberSelfReport } from '../src/session.js';

const ok = (label) => console.log(`\n✅ ${label}`);
const info = (label, value) => console.log(`   ${label}: ${value}`);
const SESSION = 'smoke';

const selfReport = {
  type: 'INTJ',
  dimension_scores: { Fi: 0.8, Ti: 0.7, Se: 0.2, Ne: 0.3 },
  traits: ['长期主义', '体系化', '重视逻辑一致'],
};

try {
  // ---------------------------------------------------------------- 1. tension
  rememberSelfReport(SESSION, selfReport);
  const tension = await buildTension(selfReport, { limit: 20 });
  ok('POST /api/behavior/tension');
  info('可用信号', (tension.available_signals || []).join('、') || '（无）');
  info('信号数', tension.signal_count);
  info('信号不足', tension.insufficient ? `是 —— ${tension.insufficient_reason}` : '否');
  info('有断层', tension.has_tension);
  info('语气', `${tension.tone}（默认应为 gentle）`);
  info('行为侧分类', (tension.behavioral?.categories || []).map((c) => `${c.category} ${c.count}`).join(' / ') || '（无）');
  for (const f of tension.fractures || []) {
    info('断层', `[${f.axis}] ${f.label}`);
    info('  强度/置信度', `${f.intensity} / ${f.confidence}`);
    info('  自述侧', f.self_reported_side.summary);
    info('  行为侧', f.behavioral_side.summary);
    info('  行为侧证据数', (f.behavioral_side.evidence || []).length);
    info('  说明', f.confidence_note);
  }
  info('桥接提示', tension.bridge_hint ?? '（无）');

  // ------------------------------------------------- 1.5 语气：说法变，事实不变
  //
  // 这是拍板结论（2026-11-18）：语气是**可选项**，只改桌宠自己说的话；
  // 断层 label / 强度 / 置信度 / 信号数一个都不许动。
  const lively = await buildTension(selfReport, { limit: 20, tone: 'lively' });
  ok('语气切换（gentle → lively）');
  info('台词 mirror', tension.pet_lines.mirror);
  info('        ', lively.pet_lines.mirror);
  info('台词 fracture', tension.pet_lines.fracture);
  info('            ', lively.pet_lines.fracture);
  const sameFacts =
    tension.signal_count === lively.signal_count &&
    tension.fractures.length === lively.fractures.length &&
    (tension.fractures[0]?.label ?? '') === (lively.fractures[0]?.label ?? '') &&
    (tension.fractures[0]?.intensity ?? -1) === (lively.fractures[0]?.intensity ?? -2) &&
    (tension.fractures[0]?.confidence ?? -1) === (lively.fractures[0]?.confidence ?? -2);
  if (sameFacts && tension.pet_lines.fracture !== lively.pet_lines.fracture) {
    ok('语气只改说法、不改事实（label / 强度 / 置信度 / 信号数逐字相同）');
  } else {
    console.log('\n❌ 语气切换越界了：要么事实变了，要么台词没变');
    process.exit(1);
  }

  // ---------------------------------------------------------------- 2. terrain
  const terrain = await buildTerrain(selfReport, { sessionId: SESSION, tone: 'lively' });
  ok('GET /api/terrain');
  info('语气', terrain.tone);
  info('台词 fracture', terrain.pet_lines.fracture ?? '（null）');
  for (const [k, layer] of Object.entries(terrain.layers)) {
    info(`层 ${k}`, `${layer.label} · ${layer.blocks.length} 块`);
    for (const b of layer.blocks) {
      info('  块', `${b.id} ${b.label} @ (${b.position.x}, ${b.position.y}) h=${b.height}`);
    }
  }
  info('断层标记数', terrain.fractures.length);
  for (const f of terrain.fractures) {
    info('  标记', `${f.id} ${f.from_layer}→${f.to_layer} @ (${f.axis_x}, ${f.axis_y}) i=${f.intensity}`);
  }
  info('桥', terrain.bridges.length);
  info('空态提示', terrain.empty_notice ?? '（无）');

  // ---------------------------------------------------------------- 3. situation
  const sit = await buildSituationQuestions({
    topic: 'MBTI',
    layer: 'situational',
    count: 1,
    answered_sources: [],
    self_report: { type: 'INTJ' },
    difficulty: 'medium',
    tone: 'lively',
  });
  ok('POST /api/situation/question');
  info('语气', sit.tone);
  info('台词 question', sit.pet_lines?.question ?? '（无）');
  info('候选池', `${sit.candidates.length} 个问题`);
  for (const c of sit.candidates.slice(0, 4)) info('  候选', `${c.question_title} ← ${c.question_url}`);
  info('出题数', sit.questions.length);
  info('空态提示', sit.empty_notice ?? '（无）');
  info('警告', (sit.warnings || []).join('、') || '（无）');
  for (const q of sit.questions) {
    info('题面', q.stem);
    info('  真实问题', q.source.question_title);
    info('  真实问题 URL', q.source.question_url);
    info('  原回答 URL', q.source.answer_url ?? '（无）');
    info('  回答摘要', (q.source.answer_summary ?? '').slice(0, 60));
    info('  选项', (q.options || []).map((o) => `${o.key}. ${o.label}`).join(' | ') || '（无）');
    info('  对焦', `${q.targets.dimension} / ${(q.targets.traits || []).join('、')}`);
    info('  生成模型', q.generated_by ?? '（未用模型）');
    rememberQuestion(SESSION, q);
  }

  // ---------------------------------------------------------------- 4. terrain/answer
  if (sit.questions.length === 0) {
    console.log('\n⚠️ 没有出到题，跳过 terrain/answer 的验证');
  } else {
    const q = sit.questions[0];
    const answerKey = q.options?.[0]?.key ?? null;
    const ans = await applyTerrainAnswer({
      sessionId: SESSION,
      questionId: q.id,
      answerKey,
      freeText: null,
      tone: 'lively',
    });
    ok('POST /api/terrain/answer');
    info('语气', ans.tone);
    info('台词 bridge', ans.pet_lines?.bridge ?? '（无）');
    info('长出的块', `${ans.block.id} ${ans.block.label}`);
    info('  摘要', ans.block.summary);
    info('  坐标', `(${ans.block.position.x}, ${ans.block.position.y}) h=${ans.block.height}`);
    info('新桥', ans.new_bridges.length);
    for (const b of ans.new_bridges) info('  桥', `${b.label} ← ${b.links.join(' + ')}`);
    info('新断层', ans.new_fractures.length);
    for (const f of ans.new_fractures) info('  断层', f.label);
    info('地形情境层块数', ans.terrain.layers.situational.blocks.length);

    // 404 分支：伪造 question_id
    try {
      await applyTerrainAnswer({ sessionId: SESSION, questionId: 'src_deadbeef', answerKey: 'A' });
      console.log('\n❌ 伪造 question_id 没有被拒（应该是 404）');
      process.exit(1);
    } catch (err) {
      if (err.code !== 'QUESTION_NOT_FOUND') throw err;
      ok('伪造 question_id 被正确拒绝');
      info('错误码', `${err.code} / HTTP ${err.httpStatus}`);
      info('用户提示', err.userHint);
    }
  }

  console.log('\n✅ 认知闭环四个接口全部跑通');
} catch (err) {
  console.error('\n❌ 失败：', err?.message || err);
  if (err?.upstream) console.error('   上游：', err.upstream);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
}
