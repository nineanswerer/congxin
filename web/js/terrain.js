/**
 * 三层认知地形 —— **2.5D 分层地图**（D29 结论 2）。
 *
 * **后端只给参数，前端负责渲染**（D29 结论 6）：
 *   - `position.x / position.y`：层内归一化坐标（0—1）
 *   - `height`：层内相对高度（0—1），决定块的视觉体量
 *   - `fractures[].axis_x / axis_y`：断层在平面上的位置 —— 断层特写就推到这里
 *   - `intensity`：断层强度，决定配色与视觉张力
 *
 * 渲染用 **SVG + CSS `perspective`**，不做自由漫游 3D。
 * 断层特写这版是 **CSS 强视差**（缩放 + 位移 + 断层高亮）；
 * **Three.js 真 3D 推镜留给队友**（保命砍法里它排最后，见 docs/status.md）。
 */

import { escapeHtml } from './pet.js';

const KIND_COLOR = {
  core: { fill: 'rgba(183,51,44,.18)', stroke: 'rgba(183,51,44,.78)', text: '#7A2A25' },
  observed: { fill: 'rgba(200,136,81,.20)', stroke: 'rgba(200,136,81,.78)', text: '#7A5230' },
  grown: { fill: 'rgba(30,48,39,.20)', stroke: 'rgba(30,48,39,.78)', text: '#1E3027' },
};

const LAYER_STYLE = [
  { key: 'self_reported' },
  { key: 'behavioral' },
  { key: 'situational' },
];

const W = 760;
const H = 220;

/** 背景框的内边距（与 `layerSvg` 里那个 rect 的 x=18 对齐）。 */
const PAD_X = 18;
/** 块默认宽 / 下限宽（再窄就装不下字了）/ 块间最小间隙。 */
const BLOCK_W = 104;
const BLOCK_MIN_W = 52;
const BLOCK_GAP = 10;

function px(x) { return 34 + x * (W - 78); }
function py(y) { return 34 + y * (H - 96); }

/** 截断中文标题，别把块撑破。 */
function clip(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

/**
 * 层内块布局 —— **碰撞避让**（web/README 已知问题 #6）。
 *
 * 为什么会叠：后端 `server/src/services/terrain.js` 里自述层与行为层按
 * `x = (i + 1) / (total + 1)` **等距**铺开，情境层有一半按 hash 出随机位置。
 * 块宽固定 104px、画布可用宽 724px —— 块一多，等距间距就小于块宽，直接糊在一起；
 * 随机位置还会偶然撞车。
 *
 * 做法（只动渲染，不改后端契约）：
 *   1. 块多时先**自适应缩窄块宽**，让 n 个块放得下；
 *   2. 按 position.x 排好序后**沿 x 轴推开**，保证相邻块间距 ≥ 块宽 + 间隙；
 *   3. 右边界越界反向压回；仍放不下时均匀铺开——**宁可贴边，也不让两块重叠**。
 *
 * 返回每块算好的几何量，`blockSvg` 只管画，不再自己算坐标。
 *
 * 导出仅供自测（`node --input-type=module` 跑边界用例），运行时不从外部调用。
 */
export function layoutBlocks(list) {
  const n = list.length;
  if (!n) return [];

  const avail = W - PAD_X * 2;

  // 1. 自适应块宽 + 间隙：n 块 + (n-1) 个间隙塞不进可用宽 → 先缩块，再缩间隙。
  //    这样无论一层有多少块，总宽都不会超过画布（极端密度下也绝不重叠）。
  let w = BLOCK_W;
  let gap = BLOCK_GAP;
  if (n * w + (n - 1) * gap > avail) {
    w = (avail - (n - 1) * gap) / n;
    if (w < BLOCK_MIN_W) {
      w = BLOCK_MIN_W;
      gap = n > 1 ? Math.max(2, (avail - n * w) / (n - 1)) : 0;
    }
  }
  w = Math.max(BLOCK_MIN_W, Math.min(BLOCK_W, Math.floor(w)));

  // 2. position.x ∈ [0,1] → 块中心的可用落点区间
  const left = PAD_X + w / 2;
  const right = W - PAD_X - w / 2;
  const span = Math.max(0, right - left);

  const items = list.map((b, idx) => ({
    b,
    idx,
    x: left + (b.position?.x ?? 0.5) * span,
    y: py(b.position?.y ?? 0.5),
    w,
    h: 30 + (b.height ?? 0.4) * 24,
  })).sort((a, b) => a.x - b.x || a.idx - b.idx);

  // 3. 左 → 右推开
  for (let i = 1; i < items.length; i++) {
    const need = items[i - 1].x + w + gap;
    if (items[i].x < need) items[i].x = need;
  }

  // 4. 右越界 → 反向压回（保持相对顺序与最小间隙）
  const maxX = W - PAD_X - w / 2;
  if (items[items.length - 1].x > maxX) {
    items[items.length - 1].x = maxX;
    for (let i = items.length - 2; i >= 0; i--) {
      const cap = items[i + 1].x - w - gap;
      if (items[i].x > cap) items[i].x = cap;
    }
  }

  // 5. 左越界（块密度到极限）→ 均匀铺开，保证绝对不重叠
  if (items[0].x < left) {
    const step = w + gap;
    items.forEach((it, i) => { it.x = left + i * step; });
  }

  return items;
}

/** 按块宽决定每行能放几个字（字号 11px，留 12px 边距）。 */
function charsPerLine(w) {
  return Math.max(3, Math.floor((w - 12) / 11));
}

function blockSvg(item) {
  const { b, x, y, w, h } = item;
  const c = KIND_COLOR[b.kind] ?? KIND_COLOR.core;
  const rx = x - w / 2;
  const ry = Math.max(8, y - h);

  const lines = clip(b.label, charsPerLine(w) * 2).split('');
  const half = Math.ceil(lines.length / 2);
  const l1 = lines.slice(0, half).join('');
  const l2 = lines.slice(half).join('');

  return `
    <g class="blk" data-block-id="${escapeHtml(b.id)}">
      <rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="8"
            fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2"/>
      <text class="lblock" x="${x}" y="${ry + 15}" text-anchor="middle" fill="${c.text}">${escapeHtml(l1)}</text>
      ${l2 ? `<text class="lblock" x="${x}" y="${ry + 27}" text-anchor="middle" fill="${c.text}">${escapeHtml(l2)}</text>` : ''}
      <text class="lsub" x="${x}" y="${ry + h + 12}" text-anchor="middle">${escapeHtml(clip(b.summary, 7))}</text>
    </g>`;
}

function layerSvg(layer, key) {
  const blocks = layoutBlocks(layer?.blocks ?? []).map(blockSvg).join('');
  const name = layer?.label ?? key;
  const emptyHint = (layer?.blocks ?? []).length
    ? ''
    : `<text class="lsub" x="380" y="118" text-anchor="middle" fill="#8A8579">（这层还是空的）</text>`;
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(name)}">
      <rect x="18" y="14" width="${W - 36}" height="${H - 42}" rx="12"
            fill="rgba(74,59,50,.05)" stroke="rgba(74,59,50,.16)"/>
      <text class="lname" x="34" y="36">${escapeHtml(name)}${
        layer?.type ? `　·　${escapeHtml(layer.type)}` : ''
      }</text>
      ${blocks}
      ${emptyHint}
    </svg>`;
}

/**
 * 把「桥」画在地图上。
 *
 * ⚠️ **桥是跨层的**（自述层 ↔ 情境层），所以**不能**画在任何一层的坐标系里 ——
 * 那样两端会对不上。必须按每个块**在屏幕上的实际位置**连：
 * `getBoundingClientRect()` 取到的位置已经含了 `perspective` 投影和 `translateZ` 位移，
 * 连出来的线正好搭在两个块之间。
 *
 * 桥画在 z=0（覆盖整张地图的 overlay），语义上就是「从上面那层连到下面那层」。
 */
const MAX_BRIDGES = 4;

function drawBridges(terrainEl, bridges) {
  if (!bridges?.length) return;
  const rect = terrainEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const posOf = (id) => {
    if (!id) return null;
    const el = terrainEl.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
  };

  // 桥会**随作答累积**（每答一题多一座）——全画出来会变成一团乱麻。
  // 只画最近的几座，但**如实写出总数**，不假装只有一座。
  const total = bridges.length;
  const shown = bridges.slice(-MAX_BRIDGES);
  const paths = [];
  for (const br of shown) {
    const a = posOf(br.links?.[0]);
    const b = posOf(br.links?.[1]);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 30;
    paths.push(`
      <path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"
            fill="none" stroke="rgba(30,48,39,.80)" stroke-width="2" stroke-dasharray="5 4"/>
      <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="3" fill="rgba(30,48,39,.95)"/>
      <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="3" fill="rgba(30,48,39,.95)"/>`);
  }
  if (!paths.length) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'bridge-overlay');
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  svg.innerHTML = paths.join('');
  terrainEl.appendChild(svg);

  if (total > shown.length) {
    const hint = document.createElement('div');
    hint.className = 'terrain-hint';
    hint.style.bottom = '30px';
    hint.textContent = `共 ${total} 座桥，这里画最近 ${shown.length} 座`;
    terrainEl.appendChild(hint);
  }
}

/**
 * 渲染地形。
 * @param {HTMLElement} wrap 外层（`.terrain-wrap` 由这里创建）
 * @param {object} data `GET /api/terrain` 的 data
 * @param {(fracture:object)=>void} onFracture 点击断层标记时回调
 */
export function renderTerrain(wrap, data, onFracture) {
  const layers = data?.layers ?? {};
  const fractures = data?.fractures ?? [];

  // ⚠️ 三层之间的间距（translateY / translateZ）**不写死在这里**——
  // 写死在 JS 里，窄屏下图层整体缩小、间距却不变 → 三层会散架。
  // 改成 CSS 变量 `--layer-dy` / `--layer-dz`，由 app.css 按断点收缩。
  const layerHtml = LAYER_STYLE.map((s) => {
    const layer = layers[s.key];
    return `
      <div class="layer" data-layer="${s.key}">
        ${layerSvg(layer, s.key)}
      </div>`;
  }).join('');

  // 断层：画在「说的你」与「做的你」之间的裂口上
  // （overlay 与中间层同盒子，所以这里用的是中间层的坐标系）
  const fractureHtml = fractures.map((f) => {
    const x = px(f.axis_x ?? 0.5);
    const y = 34 + (f.axis_y ?? 0.5) * 14;
    const amp = 8 + (f.intensity ?? 0.5) * 12;
    const path = `M ${x - 26} ${y - amp} L ${x - 9} ${y + amp * 0.6} L ${x + 4} ${y - amp * 0.8}
                  L ${x + 15} ${y + amp * 0.4} L ${x + 28} ${y - amp * 0.5}`;
    const color = (f.intensity ?? 0) > 0.6 ? '#B7332C' : '#C88851';
    return `
      <g class="fracture-mark" data-fracture-id="${escapeHtml(f.id)}" style="cursor:pointer">
        <path class="fracture-line" d="${path}" fill="none" stroke="${color}"
              stroke-width="${2 + (f.intensity ?? 0.5) * 2}" stroke-linecap="round" opacity=".85"/>
        <circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/>
        <text class="lsub" x="${x}" y="${y - 16}" text-anchor="middle" fill="${color}">
          断层 · 强度 ${Math.round((f.intensity ?? 0) * 100)}%
        </text>
      </g>`;
  }).join('');

  // 断层标记：**必须和图层同一个盒子**（同一个 viewBox、同一个 transform），
  // 否则坐标对不上 —— 之前它自己撑满整个 wrap，标记跑到地图外面去了。
  const overlay = fractures.length
    ? `<div class="layer layer-overlay" data-layer="overlay">
         <svg class="fracture-overlay" viewBox="0 0 ${W} ${H}" role="img" aria-label="断层标记">
           <g pointer-events="auto">${fractureHtml}</g>
         </svg>
       </div>`
    : '';

  // ⚠️ `.terrain-wrap` 是**定位上下文**（position:relative）——
  // 没有它，`.terrain` 的 `inset:0` 会锚到整个 `.stage`，地图直接盖住整屏。
  wrap.innerHTML = `
    <div class="terrain-wrap">
      <div class="terrain" data-terrain>
        ${layerHtml}
        ${overlay}
      </div>
      <div class="terrain-hint">${fractures.length ? '点断层标记 → 特写' : '还没有断层'}</div>
    </div>`;

  wrap.querySelectorAll('[data-fracture-id]').forEach((g) => {
    g.addEventListener('click', () => {
      const f = fractures.find((x) => x.id === g.dataset.fractureId);
      if (f && onFracture) onFracture(f);
    });
  });

  // 桥最后画（要在 DOM 落定之后量位置）
  const terrainEl = wrap.querySelector('[data-terrain]');
  if (terrainEl) drawBridges(terrainEl, data?.bridges ?? []);
}

/** 断层特写（CSS 强视差版）。 */
export function zoomFracture(wrap, on) {
  const t = wrap.querySelector('[data-terrain]');
  if (t) t.classList.toggle('is-zoom', on);
}
