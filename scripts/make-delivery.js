#!/usr/bin/env node
/**
 * 生成「知乎 AI Works 源码发布」的交付副本（隔离交付源码）。
 *
 * ## 为什么要有这个脚本（11-21）
 *
 *   官方 AI Works 部署 helper 的交付标准跟我们的仓库形态有**三处硬冲突**，
 *   逐条说清楚（依据：官方 helper 的 `references/detection.md` / `protocol.md`）：
 *
 *   1. **运行期只允许读 `PORT` / `HOST` 这两个受管环境变量**。
 *      我们的 `config.js` 还读 `ZHIHU_ACCESS_SECRET` 等自定义变量 ——
 *      官方探测器会判成 `E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED`，**直接阻断打包**。
 *      → 交付副本里密钥**只从文件读**（官方 11.7 口径：「秘钥写入文件直接构建」）。
 *
 *   2. **源码树里不能有写盘操作**。
 *      我们的 `scripts/`、`server/scripts/` 全是写盘工具（打包、回归、冒烟），
 *      云函数文件系统只读，官方探测器会判成 `E_DISK_WRITE_FORBIDDEN`。
 *      → 交付副本只留**运行期需要的文件**，开发脚本一律不进包。
 *
 *   3. **普通 Node 服务必须读 `process.env.PORT`（fallback 9000）并监听 `0.0.0.0`**。
 *      → 仓库版 `config.js` / `index.js` 已经改到位（见 git log），交付副本原样继承。
 *
 * ## 这个脚本做什么
 *
 *   1. 按**白名单**把运行期需要的文件复制到隔离目录（默认 `%TEMP%\congxin`）。
 *      —— 交付目录**在仓库外**，密钥不会落进仓库工作树。
 *   2. 改写交付副本的 `server/src/config.js`：去掉全部自定义环境变量读取。
 *   3. 生成 `_tmp/backend-html-pages.json`：官方要求对「后端会发给浏览器的 HTML」
 *      做源码级审查并附证据（我们的 `/web/` 由 express.static 挂载）。
 *   4. **自检**：扫交付副本的 JS，任何非 PORT/HOST 的 `process.env`、
 *      任何写盘调用，立刻报错退出（不生成一个会被官方探测阻断的包）。
 *
 * ## 用法
 *
 *   node scripts/make-delivery.js                 # 生成交付副本（不带密钥）
 *   node scripts/make-delivery.js --secret        # 同时把 Access Secret 放进交付副本
 *   node scripts/make-delivery.js --out <目录>    # 指定交付目录
 *
 * ⚠️ `--secret` 会把密钥**明文写进交付副本**。官方 11.7 的口径是
 *    「秘钥写入文件直接构建，代码不会上传到仓库」——仓库和仓库历史里不会有它，
 *    但**拿到这个交付包的人能读到**。用之前必须想清楚，并由人拍板。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// --------------------------------------------------------------------- 参数

const args = process.argv.slice(2);
const wantSecret = args.includes('--secret');
const outIndex = args.indexOf('--out');
const secretIndex = args.indexOf('--secret-file');
const SECRET_FILE = secretIndex >= 0 && args[secretIndex + 1] ? args[secretIndex + 1] : null;
const OUT = path.resolve(
  outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : path.join(os.tmpdir(), 'congxin')
);

/**
 * 「这个目录是我生成的」标记文件。
 *
 * 放在**交付目录外面**（同级）—— 放里面的话它会被打进交付 ZIP，
 * 变成一个莫名其妙混进去的 dotfile。
 */
const MARKER = path.join(path.dirname(OUT), '.congxin-delivery');

// --------------------------------------------------------------------- 白名单

/**
 * 交付副本里要带的文件（相对仓库根）。
 *
 * 判据只有一条：**运行期真的要用到它**。
 * 开发脚本、文档、截图、测试冒烟一律不进包 —— 它们写盘、读环境变量，
 * 进了包官方探测器就判 `E_DISK_WRITE_FORBIDDEN` / `E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED`。
 */
const FILES = [
  'package.json',
  'package-lock.json',
  'README.md',
  'contracts/api.json',
  'contracts/contract.json',
  'contracts/taxonomy.json',
  'contracts/tone.json',
  'server/package.json',
  'server/package-lock.json',
  'scripts/build-check.js',
];

const DIRS = [
  'server/src',
  'web/css',
  'web/js',
];

/** `web/` 下单独挑的文件（`web/serve.js` 是开发服务器、`docs-shot-*.png` 是截图，都不进包）。 */
const WEB_FILES = ['web/index.html'];

/** 刘看山素材：只要运行期用到的 6 个动作 + 授权说明。 */
const ASSET_FILES = [
  'assets/kanshan/idle.webp',
  'assets/kanshan/thinking.webp',
  'assets/kanshan/cheer.webp',
  'assets/kanshan/greet.webp',
  'assets/kanshan/sleep.webp',
  'assets/kanshan/play.webp',
  'assets/kanshan/NOTICE.md',
];

// --------------------------------------------------------------------- 工具

function copyFile(rel) {
  const from = path.join(ROOT, rel);
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return rel;
}

function copyDir(rel) {
  const from = path.join(ROOT, rel);
  const to = path.join(OUT, rel);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) copyDir(childRel);
    else if (entry.isFile()) copyFile(childRel);
  }
}

function readOut(rel) {
  return fs.readFileSync(path.join(OUT, rel), 'utf8');
}

function writeOut(rel, text) {
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text, 'utf8');
}

/**
 * 替换一段文本。**锚点找不到就直接报错退出** ——
 * 仓库源码漂了以后，这里必须响，而不是悄悄生成一个错的交付包。
 */
function replace(rel, oldText, newText, label) {
  const before = readOut(rel);
  if (!before.includes(oldText)) {
    throw new Error(
      `锚点找不到（${label}）：${rel}\n` +
        `仓库源码可能已经漂了。请同步更新 scripts/make-delivery.js 的替换锚点。\n` +
        `--- 找不到的片段 ---\n${oldText.slice(0, 200)}`
    );
  }
  const after = before.replace(oldText, newText);
  if (after === before) throw new Error(`替换没生效（${label}）：${rel}`);
  writeOut(rel, after);
  return { rel, label };
}

/** 在文件里按「整行精确匹配」找 1-based 行号。找不到就报错。 */
function findLine(rel, exactLine) {
  const lines = readOut(rel).split('\n');
  const index = lines.findIndex((line) => line.trim() === exactLine.trim());
  if (index < 0) {
    throw new Error(`证据行找不到：${rel} → ${exactLine}`);
  }
  return index + 1;
}

// --------------------------------------------------------------------- 改写

/**
 * 交付副本的 `config.js` 改写清单。
 *
 * 每一条都是**从环境变量改成字面量/文件**，不删任何功能：
 * 本期 Demo 不依赖 OAuth（审核声明「账号登录功能」= 否），
 * 密钥走官方 11.7 的「写入文件」口径。
 */
function patchConfig() {
  const changes = [];

  // (1) 引入项目根定位（不依赖工作目录 —— 容器里的 cwd 不一定是代码根）
  changes.push(
    replace(
      'server/src/config.js',
      "import fs from 'node:fs';\nimport path from 'node:path';",
      "import fs from 'node:fs';\nimport path, { dirname } from 'node:path';\nimport { fileURLToPath } from 'node:url';\n\nconst HERE = dirname(fileURLToPath(import.meta.url)); // server/src\nconst PROJECT_ROOT = path.resolve(HERE, '../..');      // 项目根",
      'config.js：加项目根定位'
    )
  );

  // (2) 密钥：只从文件读，去掉两个环境变量分支
  changes.push(
    replace(
      'server/src/config.js',
      `/**
 * Access Secret 的读取顺序（**先到先得**）：
 *   1. 环境变量 \`ZHIHU_ACCESS_SECRET\`
 *   2. 环境变量 \`ZHIHU_ACCESS_SECRET_FILE\` 指向的文件
 *   3. 上面那几个约定路径
 *
 * **读到的值永远不打印、不写日志、不进任何响应体。**
 */
export function resolveAccessSecret() {
  const fromEnv = (process.env.ZHIHU_ACCESS_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  const explicit = (process.env.ZHIHU_ACCESS_SECRET_FILE || '').trim();
  if (explicit) {
    const value = readSecretFile(explicit);
    if (value) return value;
  }

  for (const rel of SECRET_FILE_FALLBACKS) {
    const value = readSecretFile(path.resolve(process.cwd(), rel));
    if (value) return value;
  }

  return '';
}`,
      `/**
 * Access Secret 的读取方式（**交付版：只从文件读**）。
 *
 * ⚠️ 官方 AI Works 交付规范只允许运行期读 \`PORT\` / \`HOST\` 两个受管环境变量，
 *    读别的变量会被官方探测器判成 \`E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED\` 直接阻断打包。
 *    官方 11.7 的口径正是「**秘钥写入文件直接构建**」，所以这里只认约定路径。
 *
 * **读到的值永远不打印、不写日志、不进任何响应体。**
 */
export function resolveAccessSecret() {
  for (const base of [PROJECT_ROOT, process.cwd()]) {
    for (const rel of SECRET_FILE_FALLBACKS) {
      const value = readSecretFile(path.resolve(base, rel));
      if (value) return value;
    }
  }

  return '';
}`,
      'config.js：密钥只从文件读'
    )
  );

  // (3) OAuth / 回跳地址：本期用不到，写成字面量
  changes.push(
    replace(
      'server/src/config.js',
      `  // OAuth。设置 oauthToken 后行为接口读登录用户的数据（形状相同）。
  oauthToken: process.env.ZHIHU_OAUTH_TOKEN || '',
  oauthAppId: process.env.ZHIHU_OAUTH_APP_ID || '',
  oauthAppKey: process.env.ZHIHU_OAUTH_APP_KEY || '',

  // OAuth 授权回调地址。必须与赛事页面登记值**逐字符一致**（协议/域名/端口/路径/尾部斜杠/Query 都算）。
  oauthRedirectUri: process.env.ZHIHU_OAUTH_REDIRECT_URI || '',

  // 授权完成后回前端的地址（302 的落点）。留空则回站点根。
  frontOrigin: process.env.FRONT_ORIGIN || '',`,
      `  // OAuth。**交付版不读环境变量**（官方规范只放行 PORT / HOST）。
  // 本期 Demo 不依赖 OAuth（平台审核声明「账号登录功能」= 否），所以一律留空。
  oauthToken: '',
  oauthAppId: '',
  oauthAppKey: '',

  // OAuth 授权回调地址（本期留空；App ID / App Key 由赛事页面在项目创建后分配）。
  oauthRedirectUri: '',

  // 授权完成后回前端的地址（302 的落点）。留空则回站点根。
  frontOrigin: '',`,
      'config.js：OAuth 相关改字面量'
    )
  );

  // (4) Cookie Secure：公网链接是 https，固定开
  changes.push(
    replace(
      'server/src/config.js',
      `  // Cookie 是否加 Secure。生产默认开；本地 http 调试可显式关掉。
  cookieSecure: (process.env.SESSION_COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',`,
      `  // Cookie 加 Secure：公网链接是 https，必须开。
  cookieSecure: true,`,
      'config.js：cookieSecure 固定为 true'
    )
  );

  // (5) 缺凭据时的提示文案改成与交付版一致
  changes.push(
    replace(
      'server/src/config.js',
      `      '没读到知乎 Access Secret（ZHIHU_ACCESS_SECRET / ZHIHU_ACCESS_SECRET_FILE / secrets/access_secret 都试过了）'`,
      `      '没读到知乎 Access Secret（secrets/access_secret 等约定路径都试过了）'`,
      'config.js：缺凭据提示文案'
    )
  );

  return changes;
}

/**
 * 交付副本的 `package.json` 改写。
 *
 * ## 为什么交付版没有 `build` 脚本
 *
 *   官方交付协议对「**入口就是已提交源码、没有构建产物**」的项目有专门通道：
 *   构建步骤退化成 `test -f <运行入口>`。
 *   而我们的 `npm run build` 跑的是 `scripts/build-check.js` —— 它是**部署面自检**，
 *   一个文件都不产出。真让它当 build，官方描述符生成器会直接报错：
 *   「backend build requires at least one BuildArtifact」。
 *
 *   所以：交付版**不声明 build**，让它走官方的「无构建」通道；
 *   仓库版**保留 build**（本地跑自检用），交付前手动对交付目录跑一遍：
 *   `node scripts/build-check.js <交付目录>`。
 *
 *   开发用的脚本（dev:web / deploy:pack / deploy:check / regress）指向的文件
 *   根本没进包，留着只会让人在平台上跑出一个「找不到文件」。
 */
function patchPackageJson() {
  const pkg = JSON.parse(readOut('package.json'));
  pkg.scripts = {
    start: 'node server/src/index.js',
  };
  writeOut('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  const serverPkg = JSON.parse(readOut('server/package.json'));
  serverPkg.scripts = {
    start: 'node src/index.js',
  };
  writeOut('server/package.json', `${JSON.stringify(serverPkg, null, 2)}\n`);
}

// --------------------------------------------------------------------- 自检

const ALLOWED_ENV = new Set(['PORT', 'HOST', 'HOSTNAME', 'NITRO_HOST', 'NITRO_PORT']);

const DISK_WRITE_PATTERNS = [
  /\bfs\.writeFile(?:Sync)?\s*\(/,
  /\bfs\.appendFile(?:Sync)?\s*\(/,
  /\bfs\.createWriteStream\s*\(/,
  /\bfs\.write(?:Sync)?\s*\(/,
  /\bfs\.mkdir(?:Sync)?\s*\(/,
  /\bfs\.rm(?:Sync)?\s*\(/,
  /\bfs\.unlink(?:Sync)?\s*\(/,
  /\bfs\.rmdir(?:Sync)?\s*\(/,
  /\bfs\.rename(?:Sync)?\s*\(/,
  /\bfs\.mkdtemp(?:Sync)?\s*\(/,
];

function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walkJs(full, out);
    } else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// 官方探测器的三条正则（inspect_node_project.py 里同款）：
// 点取、下标取、解构；这三条命中之外的任何 process.env 引用都算「动态访问」。
const ENV_ACCESS = /\bprocess\s*\.\s*env\s*\.\s*([A-Za-z_$][\w$]*)/g;
const ENV_BRACKET = /\bprocess\s*\.\s*env\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
const ENV_DESTRUCTURE = /\{([^{}]+)\}\s*=\s*process\s*\.\s*env\b/g;
const ENV_REFERENCE = /\bprocess\s*\.\s*env\b/g;

/**
 * 交付副本自检：只允许 PORT/HOST 这几个环境变量，且不许有写盘调用。
 *
 * ⚠️ 这里**故意跟官方探测器的口径一致**：它扫的是原始文本，**注释里出现
 *    环境变量写法同样算命中**。所以自检也扫注释 —— 宁可在这里红，
 *    也不要生成一个到了官方那边才被阻断的包。
 */
function selfCheck() {
  const problems = [];

  for (const file of walkJs(OUT)) {
    const rel = path.relative(OUT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');

    const recognized = [];
    for (const pattern of [ENV_ACCESS, ENV_BRACKET]) {
      for (const match of text.matchAll(pattern)) {
        if (!ALLOWED_ENV.has(match[1])) {
          problems.push(`${rel}:${lineOf(text, match.index)} 读了非受管环境变量 ${match[1]}`);
        }
        recognized.push([match.index, match.index + match[0].length]);
      }
    }
    for (const match of text.matchAll(ENV_DESTRUCTURE)) {
      for (const item of match[1].split(',')) {
        const name = item.split(':')[0].split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name) && !ALLOWED_ENV.has(name)) {
          problems.push(`${rel}:${lineOf(text, match.index)} 读了非受管环境变量 ${name}`);
        }
      }
      recognized.push([match.index, match.index + match[0].length]);
    }
    for (const match of text.matchAll(ENV_REFERENCE)) {
      const inside = recognized.some(([start, end]) => start <= match.index && match.index < end);
      if (!inside) {
        problems.push(`${rel}:${lineOf(text, match.index)} 动态取环境变量`);
      }
    }

    text.split('\n').forEach((line, index) => {
      for (const pattern of DISK_WRITE_PATTERNS) {
        if (pattern.test(line)) {
          problems.push(`${rel}:${index + 1} 有写盘调用（云函数文件系统只读）`);
          break;
        }
      }
    });
  }

  if (problems.length > 0) {
    throw new Error(
      `交付副本自检没过（这批文件会被官方探测器判成阻断项）：\n  - ${problems.join('\n  - ')}`
    );
  }
  return problems;
}

/** 字符偏移 → 1-based 行号。 */
function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

// --------------------------------------------------------------------- HTML 证据

/**
 * 官方要求：后端如果会把 HTML 发给浏览器，必须逐个页面记录
 * 「项目根相对路径 + 源码证据」，传给 `--backend-html-pages`。
 *
 * 我们的页面只有 `web/index.html` 一个，证据是挂载它的那几行源码。
 */
function writeHtmlPages() {
  const staticLine = "app.use('/web', express.static(join(root, 'web'), { index: 'index.html', maxAge: 0 }));";
  const redirectLine = "app.get('/', (req, res) => res.redirect(302, '/web/'));";
  const mountLine = 'const web = mountWeb(app);';

  const pages = [
    {
      Path: 'web/index.html',
      Reason:
        '后端在接口路由之后、404 兜底之前用 express.static 挂载 /web 目录（index 指向 web/index.html），' +
        '根路径 302 到 /web/；所以浏览器能拿到这个 HTML 页面。',
      Evidence: [
        {
          File: 'server/src/lib/web-static.js',
          Line: findLine('server/src/lib/web-static.js', staticLine),
          Text: staticLine,
        },
        {
          File: 'server/src/lib/web-static.js',
          Line: findLine('server/src/lib/web-static.js', redirectLine),
          Text: redirectLine,
        },
        {
          File: 'server/src/index.js',
          Line: findLine('server/src/index.js', mountLine),
          Text: mountLine,
        },
      ],
    },
  ];

  writeOut('_tmp/backend-html-pages.json', `${JSON.stringify(pages, null, 2)}\n`);
  return pages;
}

// --------------------------------------------------------------------- 主流程

function main() {
  console.log('=== 生成 AI Works 交付副本 ===');
  console.log(`仓库：${ROOT}`);
  console.log(`交付：${OUT}`);

  // 只删「我们自己造出来的」目录（有标记文件才认），避免误删别的东西
  if (fs.existsSync(OUT)) {
    const owned =
      fs.existsSync(MARKER) || fs.existsSync(path.join(OUT, 'scf_bootstrap'));
    if (!owned) {
      throw new Error(
        `${OUT} 已存在且不像是本脚本生成的 —— 不敢删。` +
          '请换一个 --out 目录，或自己先清空它。'
      );
    }
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(MARKER, 'congxin delivery\n', 'utf8');

  const copied = [];
  for (const rel of FILES) copied.push(copyFile(rel));
  for (const rel of DIRS) copyDir(rel);
  for (const rel of WEB_FILES) copied.push(copyFile(rel));
  for (const rel of ASSET_FILES) copied.push(copyFile(rel));

  console.log(`\n[1/4] 复制运行期文件：${copied.length + countDirFiles()} 个`);

  const changes = patchConfig();
  console.log(`[2/4] 改写 config.js：${changes.length} 处`);

  patchPackageJson();

  const pages = writeHtmlPages();
  console.log(`[3/4] 生成 _tmp/backend-html-pages.json：${pages.length} 个页面`);

  selfCheck();
  console.log('[4/4] 自检通过：没有非受管环境变量、没有写盘调用');

  if (wantSecret) {
    // 优先用**部署专用**的密钥（跟日常开发用的分开，方便赛后单独撤销）。
    const sources = [
      SECRET_FILE,
      path.join(os.homedir(), '.zhihu-cli', 'access_secret.deploy'),
      path.join(ROOT, 'secrets', 'access_secret'),
      path.join(os.homedir(), '.zhihu-cli', 'access_secret'),
    ].filter(Boolean);
    const source = sources.find(
      (file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()
    );
    if (!source) {
      throw new Error(
        '没找到 Access Secret。\n' +
          '  申请入口：https://developer.zhihu.com/profile → 登录 → 申请新 Access Secret\n' +
          '  拿到后存成其中一个文件（本脚本按顺序找）：\n' +
          '    1. --secret-file <你指定的路径>\n' +
          '    2. ~/.zhihu-cli/access_secret.deploy   ← 推荐（部署专用，跟开发用的分开）\n' +
          '    3. <仓库>/secrets/access_secret\n' +
          '    4. ~/.zhihu-cli/access_secret          ← 日常开发在用的那个（不建议）'
      );
    }
    const value = fs.readFileSync(source, 'utf8').trim();
    writeOut('secrets/access_secret', `${value}\n`);
    console.log('');
    console.log('  ⚠️ 已把 Access Secret 明文写进交付副本：secrets/access_secret');
    console.log('     仓库与仓库历史里没有它；但拿到这个交付包的人能读到。');
    console.log('     来源：', source);
  }

  console.log('');
  console.log('下一步（在交付目录里跑）：');
  console.log(`  cd "${OUT}"`);
  console.log('  python <helper>/scripts/inspect_node_project.py --root . --output _tmp/deploy-plan.json \\');
  console.log('      --backend-html-pages _tmp/backend-html-pages.json');
  console.log('');
}

function countDirFiles() {
  let count = 0;
  for (const rel of DIRS) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else count += 1;
      }
    };
    walk(path.join(ROOT, rel));
  }
  return count;
}

try {
  main();
} catch (error) {
  console.error('');
  console.error('✗ 交付副本生成失败：');
  console.error(String(error?.message ?? error));
  process.exit(1);
}
