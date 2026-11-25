/**
 * 首屏 module 依赖图 —— 把**静态 import 改写成「可重试的动态 import」**。
 *
 * ## 为什么要有这个文件（D74，2026-11-25）
 *
 * 用户上传 1.2.2 出的交付包之后，在 preview 上实测抓到的事实：
 *
 *     GET /web/js/api.js            → 429 EXCEED_RATELIMIT
 *     GET /web/js/pet.js            → 429
 *     GET /web/js/daily.js          → 429
 *     GET /web/js/outro.js          → 429
 *     GET /web/assets-kit/ui/ui.js  → 429
 *
 * CSS 内联（D71）**确实生效了** —— 首屏零 CSS 请求，样式一次到位；
 * 但 **module 依赖图被打残**：`app.js` 的静态 import 链里只要有一个 429，
 * **整张模块图都不执行** —— 于是
 *   - 「问它」的文案没改写（按钮还是「叫它出来聊聊」）
 *   - `/api/auth/profile` 根本没请求（右上角一直「连接中…」）
 *   - 点「问它」没有反应
 *
 * ## 为什么现有的 asset-guard 救不了（2026-11-24 那版）
 *
 * asset-guard 靠 `<script>` 元素的 `onerror` 重挂脚本。对 module 来说：
 *   - module **自己**被 429 → 能重挂，但整张依赖图重新并发拉一遍，
 *     依赖还是随机被打掉 —— **没有「单个模块级」的重试**。
 *   - module 的**某个依赖**被 429 → 整个 module graph 静默失败。
 *
 * ## 这个文件做什么
 *
 * 在**服务端**把静态 import 改写成动态 import：
 *
 *     import { a, b } from './x.js';
 *     ↓
 *     const __fromxinMods = await Promise.all([
 *       globalThis.__fromxinImp('/web/js/x.js'),
 *     ]);
 *     const { a, b } = __fromxinMods[0];
 *
 * `globalThis.__fromxinImp` 是**内联进 HTML 的 classic script**（不占并发名额、
 * 必然早于任何 module 执行），它对**单个模块**做「失败 → 等一等 → 再来一次」
 * （最多 5 次，带随机抖动，避免所有模块同时重试又同时被打掉）。
 *
 * → 429 从「随机打死整页」变成「某个模块晚到几百毫秒」。
 *
 * ⚠️ **只改响应，不改源文件**：队友的 `web/index.html`、`web/css/` 一个字没动，
 *    前端源码在仓库里保持原样（`git diff` 里看不到任何 web/ 改动）。
 *
 * ## 边界（必须诚实，不能吹）
 *
 *   - **只改写静态 import**。`export ... from` 不改写（首屏图里没有这种写法，
 *     遇到了就整模块跳过改写，保持原样）。
 *   - **有循环依赖的模块不改写** —— 动态 import 遇到环会死锁。
 *   - 改写后模块顶层变成 **async module**（顶层 await），Chrome 89+ 支持。
 *   - 改写后静态 live binding 变成快照。首屏图里全部导出都是
 *     `export const / function / class`（**没有 `export let`**）→ 行为不变。
 *   - 只对**首屏依赖图内的模块**生效；图外的模块（比如 assets-kit 里的
 *     scenes/effects 素材）原样返回，不受影响。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/** 首屏页面的 URL 前缀 —— 素材是相对路径，页面固定从 /web/ 进。 */
const WEB_BASE = '/web';

/**
 * 内联进 `<head>` 的 classic script：定义 `globalThis.__fromxinImp`。
 *
 * ⚠️ **必须早于任何 module script 执行**：classic script 是同步阻塞的，
 *    `<script type="module">` 是 defer 语义 → 顺序天然正确。
 * ⚠️ **重试时必须换 query**：浏览器会**记住失败的 module URL** —— 同一个 URL
 *    再 import 一次会直接 reject，**根本不再发请求**（2026-11-25 本地实测：
 *    代理日志里每个模块只记到 1 次 429，第 2 次重试根本没出网）。
 *    所以失败后给 URL 挂一个递增的 `?fromxin_r=N` 再试。
 * ⚠️ **registry 放 globalThis**：多个模块 import 同一个模块时必须拿到**同一个 URL**，
 *    否则那个模块会被执行两遍（`instanceof` 会失效）。
 * ⚠️ **不能用 `</script>` 字面量**（这段会被写进 HTML）。
 */
export const MODULE_IMP_HELPER = `(function () {
  var ATTEMPTS = 5;
  var BASE_DELAY = 380;
  var registry = globalThis.__fromxinReg || (globalThis.__fromxinReg = Object.create(null));
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function imp(spec) {
    var abs = String(spec);
    var tries = 0;
    function attempt() {
      var url = registry[abs] || abs;
      return import(url).catch(function (err) {
        tries += 1;
        if (tries >= ATTEMPTS) throw err;
        registry[abs] = abs + (abs.indexOf('?') >= 0 ? '&' : '?') + 'fromxin_r=' + (tries + '_' + Date.now());
        return sleep(BASE_DELAY * tries + Math.floor(Math.random() * 240)).then(attempt);
      });
    }
    return attempt();
  }
  globalThis.__fromxinImp = imp;
})();`;

// ---------------------------------------------------------------- 源码扫描

/**
 * 跳过一段字符串字面量，返回结束位置（不含结束引号）。
 *
 * @param {string} code
 * @param {number} start 引号位置
 * @returns {{value: string, end: number} | null}
 */
function readStringLiteral(code, start) {
  const quote = code[start];
  let i = start + 1;
  let value = '';
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') {
      value += code[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === quote) return { value, end: i + 1 };
    value += ch;
    i += 1;
  }
  return null;
}

/**
 * 在 `from` 之前跳过一段字符串字面量（import clause 里理论上可能有）。
 */
function skipString(code, start) {
  const r = readStringLiteral(code, start);
  return r ? r.end : start + 1;
}

/**
 * 在 code 中找到 import clause 之后的 `from` 关键字位置。
 *
 * @param {string} code
 * @param {number} from clause 起点
 * @returns {number} `from` 的位置；找不到返回 -1
 */
function findFromKeyword(code, from) {
  let i = from;
  let depth = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(code, i);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0 && code.startsWith('from', i)) {
      const prev = code[i - 1] ?? ' ';
      const next = code[i + 4] ?? ' ';
      if (/\s/.test(prev) && !/[\w$]/.test(next)) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * 读一条**动态** import：`import(<expr>)`。
 *
 * ⚠️ 首屏图里的动态 import 大多不是字面量，而是运行时算出来的：
 *    `import(new URL('ui/ui.js', HERE).href)`、`import(new URL(\`${name}/fragment.js\`, BASE).href)`
 *    → spec 到底是什么，静态分析不出来，**只能原样保留表达式**，
 *      由调用模块自己用 `import.meta.url` 解析（改写时包一层 `new URL(expr, import.meta.url)`）。
 *
 * @param {string} code
 * @param {number} start `import` 关键字位置
 * @returns {{expr: string, start: number, end: number} | null}
 */
function readDynamicImport(code, start) {
  let i = start + 'import'.length;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  if (code[i] !== '(') return null;

  let depth = 0;
  let j = i;
  let argStart = i + 1;
  let exprEnd = -1;
  let sawComma = false;

  while (j < code.length) {
    const ch = code[j];
    const next = code[j + 1];
    if (ch === '"' || ch === "'" || ch === '`') { j = skipString(code, j); continue; }
    if (ch === '/' && next === '/') { while (j < code.length && code[j] !== '\n') j += 1; continue; }
    if (ch === '/' && next === '*') {
      j += 2;
      while (j < code.length && !(code[j] === '*' && code[j + 1] === '/')) j += 1;
      j += 2;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      if (depth === 1 && ch === '(') argStart = j + 1;
      j += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        if (!sawComma) exprEnd = j;
        return { expr: code.slice(argStart, exprEnd).trim(), start, end: j + 1 };
      }
      j += 1;
      continue;
    }
    if (ch === ',' && depth === 1) { sawComma = true; exprEnd = j; j += 1; continue; }
    j += 1;
  }
  return null;
}

/**
 * 扫出源码里所有**真实的** module 引用（静态 import + 动态 import）。
 *
 * ⚠️ 必须跳过注释 —— `web/assets-kit/ui/ui.js` 的文件头注释里就有一行
 *    `import ui from './assets/ui/ui.js'; ui.loadAll(document);`
 *    用纯正则会把它当成真 import 改写掉 → 那个路径不存在 → 模块直接挂。
 *
 * @param {string} code
 * @returns {Array<{kind: 'static'|'dynamic', clause: string|null, spec: string, expr: string, start: number, end: number}>}
 */
export function scanModuleRefs(code) {
  const out = [];
  let i = 0;
  let lineStart = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];

    // 行注释
    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i += 1;
      continue;
    }
    // 块注释
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    // 字符串
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(code, i);
      continue;
    }
    // import 关键字
    if (code.startsWith('import', i)) {
      const after = code[i + 6] ?? ' ';
      const beforeChar = code[i - 1] ?? ' ';
      // 动态 import：`import(` —— **不要求在行首**（`await import('./x.js')` 很常见）
      if (!/[\w$.]/.test(beforeChar) && after === '(') {
        const dyn = readDynamicImport(code, i);
        if (dyn) {
          out.push({ kind: 'dynamic', clause: null, spec: null, expr: dyn.expr, start: dyn.start, end: dyn.end });
          i = dyn.end;
          lineStart = dyn.end;
          continue;
        }
      }
      // 静态 import：必须位于行首的空白之后
      const before = code.slice(lineStart, i);
      if (/^[ \t]*$/.test(before) && !/[\w$.]/.test(after)) {
        const stmt = readImportStatement(code, i);
        if (stmt) {
          out.push({ kind: 'static', clause: stmt.clause, spec: stmt.spec, expr: null, start: stmt.start, end: stmt.end });
          i = stmt.end;
          lineStart = stmt.end;
          continue;
        }
      }
    }
    if (ch === '\n') lineStart = i + 1;
    i += 1;
  }

  return out;
}

/** 只取静态 import（保留旧接口）。 */
export function scanImports(code) {
  return scanModuleRefs(code).filter((r) => r.kind === 'static');
}

/**
 * 解析一条 import 语句。
 *
 * @param {string} code
 * @param {number} start `import` 关键字位置
 */
function readImportStatement(code, start) {
  const n = code.length;
  let i = start + 'import'.length;
  while (i < n && /\s/.test(code[i])) i += 1;

  // 副作用 import：import './x.js';
  if (code[i] === '"' || code[i] === "'") {
    const lit = readStringLiteral(code, i);
    if (!lit) return null;
    let end = lit.end;
    while (end < n && (code[end] === ' ' || code[end] === '\t')) end += 1;
    if (code[end] === ';') end += 1;
    return { clause: null, spec: lit.value, start, end };
  }

  // 其余：<clause> from '<spec>'
  const fromIdx = findFromKeyword(code, i);
  if (fromIdx < 0) return null;
  const clause = code.slice(i, fromIdx).trim();
  let k = fromIdx + 4;
  while (k < n && /\s/.test(code[k])) k += 1;
  if (code[k] !== '"' && code[k] !== "'") return null;
  const lit = readStringLiteral(code, k);
  if (!lit) return null;
  let end = lit.end;
  while (end < n && (code[end] === ' ' || code[end] === '\t')) end += 1;
  if (code[end] === ';') end += 1;
  return { clause, spec: lit.value, start, end };
}

/**
 * 源码里有没有 `export ... from '...'`（再导出）。
 *
 * 有的话**整个模块跳过改写** —— 再导出没法用动态 import 表达。
 * @param {string} code
 */
export function hasReExport(code) {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return /(^|\n)\s*export\s+[\s\S]*?\sfrom\s*(['"])/.test(stripped);
}

// ---------------------------------------------------------------- 改写

/**
 * 把 import clause 变成对象解构能吃的形式。
 *
 *   `{ a, b as c }` → `{ a, b: c }`
 *   `D, { a }`       → `{ default: D, a }`
 *   `* as N`         → 命名空间，单独处理
 *
 * ⚠️ clause 原文（含换行与注释）**原样保留** —— 只把 `as` 换成 `:`。
 *    注释里的 "as" 被误换成 ":" 也只是注释内容变了，不影响语法。
 *
 * @param {string} clause
 * @returns {{kind: 'named'|'default'|'namespace'|'mixed', text: string}}
 */
function normalizeClause(clause) {
  const c = clause.trim();

  // import * as N from '...'
  const ns = /^\*\s+as\s+([\w$]+)$/.exec(c);
  if (ns) return { kind: 'namespace', text: ns[1] };

  // import D from '...'
  const def = /^([\w$]+)$/.exec(c);
  if (def) return { kind: 'default', text: `default: ${def[1]}` };

  // import D, { a, b } from '...'
  const mixed = /^([\w$]+)\s*,\s*(\{[\s\S]*\})$/.exec(c);
  if (mixed) {
    const inner = mixed[2].replace(/\bas\b/g, ':');
    return { kind: 'named', text: `default: ${mixed[1]}, ${inner.replace(/^\{|\}$/g, '')}` };
  }

  // import { a, b as c } from '...'
  if (c.startsWith('{')) {
    return { kind: 'named', text: c.replace(/\bas\b/g, ':').replace(/^\{|\}$/g, '') };
  }

  return { kind: 'unknown', text: c };
}

/**
 * 改写单个模块：静态 import → 动态 import + 单模块重试。
 *
 * @param {string} code 模块源码
 * @param {string} moduleRel 模块在 web/ 下的相对路径（如 'js/app.js'）
 * @returns {{code: string, changed: boolean, deps: string[], reason?: string}}
 */
export function rewriteModule(code, moduleRel) {
  const refs = scanModuleRefs(code);
  const statics = refs.filter((r) => r.kind === 'static');
  const dynamics = refs.filter((r) => r.kind === 'dynamic');

  if (statics.length === 0 && dynamics.length === 0) {
    return { code, changed: false, deps: [], reason: 'no-import' };
  }
  if (statics.length > 0 && hasReExport(code)) {
    return { code, changed: false, deps: statics.map((i) => i.spec), reason: 're-export' };
  }

  const edits = [];

  // ---- 静态 import：合并成一个 Promise.all 块 ----
  if (statics.length > 0) {
    const first = statics[0];
    // 第一个 import 之前必须只有注释/空白 —— 否则把 import 合并到一处会改变执行顺序。
    const head = code.slice(0, first.start);
    if (head.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim() !== '') {
      return { code, changed: false, deps: statics.map((i) => i.spec), reason: 'import-not-at-top' };
    }

    const calls = [];
    const bindings = [];
    for (const [idx, imp] of statics.entries()) {
      calls.push(`  globalThis.__fromxinImp(${JSON.stringify(absUrl(moduleRel, imp.spec))}),`);
      if (imp.clause !== null) bindings.push({ clause: imp.clause, index: idx });
    }

    const lines = ['const __fromxinMods = await Promise.all([', ...calls, ']);'];
    for (const b of bindings) {
      const norm = normalizeClause(b.clause);
      if (norm.kind === 'namespace') {
        lines.push(`const ${norm.text} = __fromxinMods[${b.index}];`);
      } else if (norm.kind === 'named' || norm.kind === 'default') {
        lines.push(`const { ${norm.text} } = __fromxinMods[${b.index}];`);
      } else {
        // 认不出来的 clause —— 不改这个模块
        return { code, changed: false, deps: statics.map((i) => i.spec), reason: 'unknown-clause' };
      }
    }

    // 第一个静态 import → 整块；其余静态 import → 删掉
    for (const imp of statics) {
      edits.push({
        start: imp.start,
        end: imp.end,
        text: imp === first ? lines.join('\n') : '',
      });
    }
  }

  // ---- 动态 import：就地替换成带重试的版本 ----
  //     spec 是运行时算出来的（`new URL('ui/ui.js', HERE).href`）→ 表达式原样保留，
  //     由**调用模块自己**用 import.meta.url 解析（helper 在 HTML 里，解析不了相对路径）。
  for (const d of dynamics) {
    edits.push({
      start: d.start,
      end: d.end,
      text: `globalThis.__fromxinImp(new URL(${d.expr}, import.meta.url).href)`,
    });
  }

  edits.sort((a, b) => a.start - b.start);

  let out = '';
  let pos = 0;
  for (const e of edits) {
    if (e.start < pos) continue; // 重叠保护（理论上不会发生）
    out += code.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  out += code.slice(pos);

  return { code: out, changed: true, deps: statics.map((i) => i.spec) };
}

/**
 * 模块内相对路径 → 站点绝对 URL。
 *
 * @param {string} moduleRel 模块在 web/ 下的相对路径
 * @param {string} spec import 里的 specifier
 * @returns {string}
 */
export function absUrl(moduleRel, spec) {
  if (!spec.startsWith('.')) return spec;
  const dir = posix.dirname(`${WEB_BASE}/${moduleRel}`);
  return posix.normalize(posix.join(dir, spec));
}

// ---------------------------------------------------------------- 依赖图

/**
 * 从 index.html 里取出 `<script type="module" src="...">` 的入口。
 *
 * @param {string} html
 * @returns {string[]} 相对 web/ 的路径
 */
export function findModuleEntries(html) {
  const re = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    // 裸模块名（'lodash' 这种，既没有斜杠也没有点）不是本项目的文件 → 跳过
    if (!src.includes('/') && !src.includes('.')) continue;
    out.push(src.replace(/^\.?\//, ''));
  }
  return out;
}

/**
 * 构建首屏 module 依赖图，并算出每个模块是否在**循环依赖**里。
 *
 * @param {string} webDir web/ 目录绝对路径
 * @param {string[]} entries 入口模块（相对 web/）
 * @returns {{modules: Map<string, {code: string, deps: string[]}>, cyclic: Set<string>}}
 */
export function buildModuleGraph(webDir, entries) {
  const modules = new Map();
  const queue = [...entries];

  while (queue.length) {
    const rel = posix.normalize(queue.shift());
    if (modules.has(rel)) continue;
    const file = join(webDir, rel);
    if (!existsSync(file)) continue;
    let code;
    try {
      code = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const imports = scanImports(code);
    const deps = [];
    for (const imp of imports) {
      if (!imp.spec.startsWith('.')) continue;
      const depRel = posix.normalize(posix.join(posix.dirname(rel), imp.spec));
      deps.push(depRel);
      if (!modules.has(depRel)) queue.push(depRel);
    }
    modules.set(rel, { code, deps });
  }

  return { modules, cyclic: findCycles(modules) };
}

/**
 * 找出处于循环依赖里的模块（Tarjan 强连通分量，size > 1 或自环）。
 *
 * @param {Map<string, {deps: string[]}>} modules
 * @returns {Set<string>}
 */
export function findCycles(modules) {
  const cyclic = new Set();
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;

  const strongconnect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    const node = modules.get(v);
    for (const w of node?.deps ?? []) {
      if (!modules.has(w)) continue;
      if (!index.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }

    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) {
        for (const c of comp) cyclic.add(c);
      } else {
        const only = comp[0];
        const selfLoop = (modules.get(only)?.deps ?? []).includes(only);
        if (selfLoop) cyclic.add(only);
      }
    }
  };

  for (const v of modules.keys()) {
    if (!index.has(v)) strongconnect(v);
  }

  return cyclic;
}
