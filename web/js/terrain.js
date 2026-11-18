/**
 * 三层认知地形 —— **2.5D 分层地图**（D29 结论 2）。
 *
 * **后端只给参数，前端负责渲染**（D29 结论 6）：
 *   - `position.x / position.y`：层内归一化坐标（0—1）
 *   - `height`：层内相对高度（0—1），决定块��视觉体量
 *   - `fractures[].axis_x / axis_y`：断层在平面上的位置 —— 断层特写就推到这里
 *   - `intensity`：断层强度，决定配色与视觉张力
 *
 * 渲染用 **SVG + CSS `perspective`**，不做自由漫游 3D。
 * 断层特写这版是 **CSS 强视差**（缩放 + 位移 + 断层高亮）；
 * **Three.js 真 3D 推镜留给队友**（保命砍法里它排最后，见 docs/status.md）。
 */

import { escapeHtml } from './pet.js';

const KIND_COLOR = {
  core: { fill: 'rgba(74,158,255,.22)', stroke: 'rgba(74,158,255,.75)', text: '#cfe4ff' },
  observed: { fill: 'rgba(255,180,84,.20)', stroke: 'rgba(255,180,84,.75)', text: '#ffd9a8' },
  grown: { fill: 'rgba(93,211,158,.20)', stroke: 'rgba(93,211,158,.75)', text: '#b6f0d6' },
};

const LAYER_STYLE = [
  { key: 'self_reported', dy: -104, dz: 70 },
  { key: 'behavioral', dy: 0, dz: 0 },
  { key: 'situational', dy: 104, dz: -70 },
];

const W = 760;
const H = 300;

function px(x) { return 34 + x * (W - 78); }
function py(y) { return 34 + y * (H - 92); }

/** 截断中文标题，别把块撑破。 */
function clip(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function blockSvg(b) {
  const c = KIND_COLOR[b.kind] ?? KIND_COLOR.core;
  const x = px(b.position?.x ?? 0.5);
  const y = py(b.position?.y ?? 0.5);
  const h = 14 + (b.height ?? 0.4) * 34;
  const w = 118;
  const rx = x - w / 2;
  const ry = y - h;

  const lines = clip(b.label, 10).split('');
  const half = Math.ceil(lines.length / 2);
  const l1 = lines.slice(0, half).join('');
  const l2 = lines.slice(half).join('');

  return `
    <g class="blk" data-block-id="${escapeHtml(b.id)}">
      <rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="8"
            fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2"/>
      <text class="lblock" x="${x}" y="${ry + 15}" text-anchor="middle" fill="${c.text}">${escapeHtml(l1)}</text>
      ${l2 ? `<text class="lblock" x="${x}" y="${ry + 27}" text-anchor="middle" fill="${c.text}">${escapeHtml(l2)}</text>` : ''}
      <text class="lsub" x="${x}" y="${ry + h + 13}" text-anchor="middle">${escapeHtml(clip(b.summary, 16))}</text>
    </g>`;
}

function layerSvg(layer, key) {
  const blocks = (layer?.blocks ?? []).map(blockSvg).join('');
  const name = layer?.label ?? key;
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(name)}">
      <rect x="18" y="16" width="${W - 36}" height="${H - 44}" rx="12"
            fill="rgba(255,255,255,.028)" stroke="rgba(255,255,255,.10)"/>
      <text class="lname" x="34" y="38">${escapeHtml(name)}${
        layer?.type ? `　·　${escapeHtml(layer.type)}` : ''
      }</text>
      ${blocks}
    </svg>`;
}

/**
 * 渲染地形。
 * @param {HTMLElement} wrap 外层（带 perspective）
 * @param {object} data `GET /api/terrain` 的 data
 * @param {(fracture:object)=>void} onFracture 点击断层标记时回调
 */
export function renderTerrain(wrap, data, onFracture) {
  const layers = data?.layers ?? {};
  const fractures = data?.fractures ?? [];

  const layerHtml = LAYER_STYLE.map((s) => {
    const layer = layers[s.key];
    const blocks = (layer?.blocks ?? []).length;
    return `
      <div class="layer" data-layer="${s.key}"
           style="transform: translateY(${s.dy}px) translateZ(${s.dz}px) rotateX(12deg);">
        ${layerSvg(layer, s.key)}
        ${blocks === 0 ? `<text class="lsub" x="380" y="150" text-anchor="middle" fill="#6d7689">（这层还是空的）</text>` : ''}
      </div>`;
  }).join('');

  // 断层：画在「说的你」与「做的你」之间的裂口上
  const fractureHtml = fractures.map((f) => {
    const x = px(f.axis_x ?? 0.5);
    const y = py(f.axis_y ?? 0.5) - 52;
    const amp = 8 + (f.intensity ?? 0.5) * 12;
    const path = `M ${x - 26} ${y - amp} L ${x - 9} ${y + amp * 0.6} L ${x + 4} ${y - amp * 0.8}
                  L ${x + 15} ${y + amp * 0.4} L ${x + 28} ${y - amp * 0.5}`;
    const color = (f.intensity ?? 0) > 0.6 ? '#ff6b6b' : '#ffb454';
    return `
      <g class="fracture-mark" data-fracture-id="${escapeHtml(f.id)}" style="cursor:pointer">
        <path class="fracture-line" d="${path}" fill="none" stroke="${color}"
              stroke-width="${2 + (f.intensity ?? 0.5) * 2}" stroke-linecap="round" opacity=".85"/>
        <circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/>
        <text class="lsub" x="${x}" y="${y - 22}" text-anchor="middle" fill="${color}">
          断层 · 强度 ${Math.round((f.intensity ?? 0) * 100)}%
        </text>
      </g>`;
  }).join('');

  const overlay = fractures.length
    ? `<svg class="fracture-overlay" viewBox="0 0 ${W} ${H}"
         style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
         <g pointer-events="auto">${fractureHtml}</g>
       </svg>`
    : '';

  wrap.innerHTML = `
    <div class="terrain" data-terrain>
      ${layerHtml}
      ${overlay}
    </div>
    <div class="terrain-hint">${fractures.length ? '点断层标记 → 特写' : '还没有断层'}</div>`;

  wrap.querySelectorAll('[data-fracture-id]').forEach((g) => {
    g.addEventListener('click', () => {
      const f = fractures.find((x) => x.id === g.dataset.fractureId);
      if (f && onFracture) onFracture(f);
    });
  });
}

/** 断层特写（CSS 强视差版）。 */
export function zoomFracture(wrap, on) {
  const t = wrap.querySelector('[data-terrain]');
  if (t) t.classList.toggle('is-zoom', on);
}

/** 桥：自述块 ↔ 新长出的块，画成一条曲线。 */
export function bridgePath(bridges, layers) {
  const posOf = (id) => {
    for (const layer of Object.values(layers ?? {})) {
      const b = (layer?.blocks ?? []).find((x) => x.id === id);
      if (b) return { x: px(b.position?.x ?? 0.5), y: py(b.position?.y ?? 0.5) - 30 };
    }
    return null;
  };
  return (bridges ?? []).map((br) => {
    const a = posOf(br.links?.[0]);
    const b = posOf(br.links?.[1]);
    if (!a || !b) return '';
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 26;
    return `<path d="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" fill="none"
                  stroke="rgba(93,211,158,.6)" stroke-width="1.6" stroke-dasharray="4 4"/>`;
  }).join('');
}
