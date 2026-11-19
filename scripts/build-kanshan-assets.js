#!/usr/bin/env node
/**
 * 重转刘看山官方素材：官方原始 GIF → 本项目用的动画 WebP。
 *
 * 为什么需要这个脚本（11-19 实测取证，见 docs/decisions.md D39）：
 *
 * 1) **不能用 `fps=10`**：那是恒定帧率滤镜，会把相邻帧**混合**成一帧 →
 *    手臂拖影被**烤进帧里**。
 * 2) **要用 `select=not(mod(n,2))` + `setpts=N/(10*TB)`**：纯丢帧不混合，
 *    输出严格 10fps。（`setpts=N/TB` 会写成 1000ms/帧 → 慢 10 倍。）
 * 3) **必须把 ANMF 的 dispose 从 0 改成 1**：ffmpeg/libwebp 对动画一律写
 *    `dispose=none + blend=alpha`，而素材是**透明背景** → 第 N 帧叠在第 N-1 帧上，
 *    越播越重（残留影像 + 白边）。改成 `dispose=background` 后，浏览器每帧后
 *    清空画布，下一帧从干净底上重画。ffmpeg 没有对应开关，只能改容器里的标志位。
 *
 * 用法：node scripts/build-kanshan-assets.js
 * 依赖：ffmpeg（带 libwebp）。原始 GIF 需先按 NOTICE.md 归档到
 *       docs/sources/kanshan_material/dynamic/。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'sources', 'kanshan_material', 'dynamic');
const DST = path.join(ROOT, 'assets', 'kanshan');

/** 官方 GIF 文件名 → 本项目状态名（映射已逐个对着官方 GIF 画面核过） */
const MAP = [
  ['04-daiji', 'idle'],      // 待机
  ['03-dianbo', 'thinking'], // 电波：坐着看笔记本、头顶亮灯泡
  ['02-misa', 'cheer'],      // 弥撒
  ['06-dadagun', 'greet'],   // 打滚 / 挥手
  ['01-ahoge', 'sleep'],     // 呆毛 / Zzz
  ['05-yunqiu', 'play']      // 运球 / 踢球
];

const VF = 'select=not(mod(n\\,2)),setpts=N/(10*TB)';

/** 把每一帧 ANMF 头的 dispose 标志从 0（不还原）改成 1（还原到背景） */
function fixDispose(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  let animOff = -1;
  const flags = [];
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const dataOff = off + 8;
    if (fourcc === 'ANIM') animOff = dataOff;
    else if (fourcc === 'ANMF') flags.push(dataOff + 15);
    off = dataOff + size + (size % 2);
  }
  if (!flags.length) throw new Error('不是动画 WebP（没有 ANMF）：' + file);
  for (const p of flags) buf[p] = (buf[p] & 0xfc) | 0x01;
  if (animOff >= 0) { buf[animOff] = 0; buf[animOff + 1] = 0; buf[animOff + 2] = 0; buf[animOff + 3] = 0; }
  fs.writeFileSync(file, buf);
  return flags.length;
}

/** 读一遍容器结构，顺手当自检 */
function inspect(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  const frames = [];
  let canvas = null;
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const dataOff = off + 8;
    if (fourcc === 'VP8X') {
      canvas = { w: buf.readUIntLE(dataOff + 4, 3) + 1, h: buf.readUIntLE(dataOff + 7, 3) + 1 };
    } else if (fourcc === 'ANMF') {
      frames.push({
        w: buf.readUIntLE(dataOff + 6, 3) + 1,
        h: buf.readUIntLE(dataOff + 9, 3) + 1,
        dur: buf.readUIntLE(dataOff + 12, 3),
        dispose: buf[dataOff + 15] & 0x03
      });
    }
    off = dataOff + size + (size % 2);
  }
  const rects = new Set(frames.map(f => f.w + 'x' + f.h));
  const disposes = new Set(frames.map(f => f.dispose));
  return { canvas, count: frames.length, rects: [...rects], disposes: [...disposes], bytes: buf.length };
}

let total = 0;
for (const [gif, name] of MAP) {
  const src = path.join(SRC, gif + '.gif');
  const dst = path.join(DST, name + '.webp');
  if (!fs.existsSync(src)) {
    console.error('缺少原始 GIF：' + src + '（见 assets/kanshan/NOTICE.md 的归档说明）');
    process.exit(1);
  }
  const r = spawnSync('ffmpeg', [
    '-y', '-i', src,
    '-vf', VF,
    '-c:v', 'libwebp', '-lossless', '0', '-quality', '92', '-loop', '0', '-an',
    dst
  ], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('ffmpeg 失败：' + gif + '\n' + (r.stderr || ''));
    process.exit(1);
  }
  const frames = fixDispose(dst);
  const info = inspect(dst);
  total += info.bytes;
  console.log(
    name.padEnd(9) +
    ' ← ' + gif + '.gif   ' +
    info.canvas.w + '×' + info.canvas.h + '  ' +
    info.count + ' 帧  ' +
    'rect=' + info.rects.join(',') + '  ' +
    'dispose=' + info.disposes.join(',') +
    '  ' + Math.round(info.bytes / 1024) + ' KB'
  );
  if (frames !== info.count) console.error('  ⚠️ 帧数对不上');
}
console.log('合计 ' + Math.round(total / 1024) + ' KB → ' + DST);
