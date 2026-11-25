# 交接：preview 的第二个成因（module 依赖图被 429 打死）→ 服务端 import 改写（D74）

- **时间**：2026-11-25 11:30
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main`（本会话的改动在同一批 commit 里，见第 2 节）
- **本次目标**：用户回复「**上传完成了**」并问「**为什么不介入大模型 AI？**」→ ① 在 preview 上验证上传后的效果，② 回答大模型口径，③ 修掉验证中暴露的塌陷。

## 1. 现在处于什么状态

**答两件事：**

**① 大模型口径 —— 我们已经在用大模型了。**
`server/src/services/advice.js:59` 只写死一个模型名：`const MODEL = 'zhida-thinking-1p5'`（知乎直答·深度思考档，推理模型，实测 20—35 秒）。「问它」的判断/结论/方案全是它写的，每问烧 1 次直答额度（100/天）。没接的是**第三方通用大模型**（GPT/Claude/DeepSeek）与 JeV —— **接了不违规**（官方规则明说「底层大模型不限」），是产品与工程取舍：出处链会断（模型编 URL，破坏「每条建议点回知乎原文」这个核心卖点）／交付环境只放行 `PORT`+`HOST`（第三方 key 只能明文进源码进 ZIP）／直答是赛事白给额度而第三方要自备 key 与钱／直答已 20—35 秒且 60 秒是硬超时线／`zhida-agent` 实测不能用。JeV 不接的理由见 D66（不产文字、要额外第三方 key 与部署环境变量、12-04 前只有本机一套 secret；换模型只是改 `advice.js` 里一个常量）。

**② preview 上传后仍然是半死的 —— 但 D71 的修复生效了，塌陷有第二个成因。**
用户 10:36 上传了 D73 出的 1.2.2 包 → 我在 preview 上实测（浏览器 SSO 登录态）：

| 观察项 | 结果 |
| --- | --- |
| D71 的 CSS 内联 | ✅ **生效** —— 首屏**零 CSS 请求**，样式一次到位 |
| JS 模块 | ❌ **5 个被平台 429 打掉**：`/web/js/api.js`、`pet.js`、`daily.js`、`outro.js`、`/web/assets-kit/ui/ui.js` |
| 页面 | 首屏按钮还是「叫它出来聊聊」（D71 的 `renderHeroAsk()` 没跑）· 右上角一直「连接中…」· 点「问它」没反应 |

**根因**：ESM 语义 —— `app.js` 的静态 import 链里只要有一个模块 429，**整张模块图就不执行**。
这是「每次刷新长得都不一样」的**第二个成因**（第一个是 CSS，D71 已治）。

**本轮已修并验证通过**（见第 6 节），**新包已出，等用户重新上传**。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `server/src/lib/module-loader.js` | **新增**（约 600 行）。扫描源码里**真实**的 module 引用（跳过注释与字符串）· 构建首屏依赖图 · Tarjan 找环 · **在响应时**把静态 import 改写成 `await Promise.all([globalThis.__fromxinImp('/web/js/api.js'), ...])` + 解构 · 把动态 `import()` 改写成 `globalThis.__fromxinImp(new URL(<原表达式>, import.meta.url).href)` · 内联 helper `MODULE_IMP_HELPER` | 平台并发限流会随机打死首屏模块；改写后**单个模块被 429 就自己重试**，不连累整张图 |
| `server/src/lib/web-static.js` | ① `buildIndexHtml()` 在 `</head>` 之前注入 `MODULE_IMP_HELPER` ② `mountWeb()` 新增一个排在 `express.static` **之前**的 JS handler：图内模块 → 改写后下发，图外模块 → 原样放行 ③ 依赖图带 mtime 缓存（开发期改 import 立刻生效） | 改写必须发生在**响应层**（`web/` 源文件一个字不动） |
| `server/src/lib/asset-guard.js` | script 重试从 **1 轮放宽到 6 轮**（原来 `data-gretried` 一旦置位就再也不重试 → 连续两轮限流就彻底死）；文件头注释补 D74 说明 | 平台连续限流时要有耐心 |
| `docs/decisions.md` | 追加 **D74**（实测事实表 · 两个非直觉的坑 · 处置 · 边界 · 验证表 · 未验证项 · 大模型口径澄清） | 决策层只增不改 |
| `docs/status.md` | 「最后更新」+ §二 加 D74 条目 + §三 阻塞项第一条换成 D74（新包指纹 + 冒烟结果） | 状态页是跨人接缝 |
| `docs/handoffs/2026-11-25-1130-module-import-retry.md` | **新增**（本文件） | BOOTSTRAP 收工协议 S2 |

**队友目录一个字没碰**（D65）。**`web/` 下的前端源文件一个字没动** —— `git diff` 里看不到任何 `web/` 改动，改写只发生在服务端响应时。
交付副本与仓库源的差异仍只有「环境变量 → 字面量」那一类（D72）。

## 3. 试过但没成的（**最重要，别省**）

- **尝试（第一版改写器）**：把模块内的相对 import 算成站点绝对 URL。
  **结果**：算出来是 `/js/api.js` —— **少了 `/web` 前缀** → 404。
  **根因**：`posix.dirname('/' + moduleRel)` 得到 `/js`，而站点页面固定从 `/web/` 进。
  **结论**：必须以 `WEB_BASE + '/' + moduleRel` 为基准。

- **尝试**：用正则筛 `<script type="module" src="...">` 里的入口。
  **结果**：**入口列表为空** → 依赖图 0 个模块 → 整个改写静默不生效。
  **根因**：过滤条件写成 `if (!src.startsWith('.') && !src.startsWith('/')) continue;` —— 本项目的相对路径是 `js/app.js`（既不以 `.` 也不以 `/` 开头）→ **被当成裸模块名滤掉**。
  **结论**：判据应该是「既没有斜杠也没有点」才是裸模块名。

- **尝试**：扫描动态 `import()` 时要求 `import` 关键字在**行首**。
  **结果**：`await import('./demo.js')`、`import(new URL('ui/ui.js', HERE).href)` **全部漏掉** → `system.js` 的 ui/ui.js 加载仍然没有重试保护。
  **结论**：动态 import 不在行首是常态（`await import(...)` 很常见），只要求前面不是标识符字符。

- **尝试（最关键的一个坑）**：让重试直接重发**同一个 URL**。
  **结果**：限流代理日志里每个模块**只记到 1 次 429**，第 2 次重试**根本没出网**；浏览器在 4.2 秒后抛 `TypeError: Failed to fetch dynamically imported module`。
  **根因**：**浏览器会记住失败的 module URL** —— 同一个 URL 再 `import()` 一次会直接 reject，**根本不再发请求**。
  **结论**：失败后必须给 URL 挂一个**新的 query**（`?fromxin_r=N`）再试。

- **尝试**：把 helper 放在 HTML 里，让它用相对路径 import 依赖模块。
  **结果**：路径解析会错（helper 所在脚本的 base 是**文档**，不是调用模块）。
  **结论**：静态 import 由**服务端**算成绝对 URL；动态 import 保留原表达式，由**调用模块自己**用 `import.meta.url` 解析（`new URL(expr, import.meta.url).href`）。

- **尝试**：用 asset-guard 那套「重挂整个 module 图」的办法救被 429 的依赖。
  **结果**：module **自己**被 429 时能重挂，但**整张依赖图重新并发拉一遍**，依赖还是可能再被打掉；module 的**某个依赖**被 429 则整张图静默失败。
  **结论**：**没有「单模块级」重试就治不了根** → 必须是改写 import 这条路。

- **尝试**：用正则扫 import 语句。
  **结果**：`web/assets-kit/ui/ui.js` 的**文件头注释里**有一行 `import ui from './assets/ui/ui.js'; ui.loadAll(document);` → 纯正则会把它当成真 import 改写掉 → 那个路径不存在 → 模块直接挂。
  **结论**：必须写跳过注释与字符串的扫描器（本轮 `scanModuleRefs`）。

- **尝试**：给 `observe-seo` 传上一轮的 `intent_id` 想复用同一条意图。
  **结果**：`{"warnings": [{"code": "W_COLLECTION_SKIPPED", "kind": "seo", "reason": "intent_id is not in current project state; inspect before merging"}]}`，exit 1。
  **根因**：`collection_data.py begin` 会**重建**采集状态并清空 `intents` → 旧 id 不在当前 state 里，脚本拒绝凭空引用。
  **结论**：只能新建（会拿到新 id）。

- **尝试**：用 1.2.0 的参数名跑 1.2.2 的 `inspect_node_project.py`。
  **结果**：`error: the following arguments are required: --root`；后面 `write_backend_runtime` / `write_deploy_descriptors` / `validate_deploy_output` 连锁失败（`deploy-plan.json` 不存在）。
  **结论**：**1.2.2 用 `--root`**，1.2.0 才用 `--project-root`。

- **尝试**：直接起服务跑回归。
  **结果**：回归 3 拍挂「401 · 没有可用的知乎凭据」。
  **根因**：`config.js` 的密钥来源里**没有** `C:\Users\steam\.zhihu-cli\access_secret` 这个路径（它在 `ZHIHU_ACCESS_SECRET_FILE` 或 `secrets/access_secret` 里），我启动时漏了设环境变量。
  **结论**：本地起服务要 `$env:ZHIHU_ACCESS_SECRET_FILE='C:\Users\steam\.zhihu-cli\access_secret'`（**交付副本不用**，它读包里的 `secrets/access_secret`）。

- **尝试**：把动态 import 的第二个参数（legacy options）也包进 `new URL(...)`。
  **结果**：会拼出非法 URL。
  **结论**：只取第一个参数（`readDynamicImport` 里 `sawComma` 时截断表达式），第二个参数丢掉（实际项目里没用到）。

## 4. 下一个 AI 接手前必须知道的事

- **D74 的核心机制（改代码前先读这段）**：服务端在**响应 `.js` 时**把静态 import 改写成
  ```js
  const __fromxinMods = await Promise.all([globalThis.__fromxinImp('/web/js/api.js'), ...]);
  const { apiGet, getTone, ... } = __fromxinMods[0];
  ```
  `globalThis.__fromxinImp` 是**内联进 `</head>` 之前**的 classic script（同步执行 → 必然早于任何 module）。
  **helper 里的 `import(spec)` 是语法级的**：它的 base 取「调用点所在的脚本」→ 所以 **spec 必须是绝对 URL**；
  静态 import 由服务端算绝对路径，动态 import 用 `new URL(expr, import.meta.url).href` 在调用模块里解析。
  **失败重试必须换 query**（浏览器会记住失败的 module URL）；**registry 放 `globalThis`**（多个模块 import 同一个模块时要拿到同一个 URL，否则那个模块会执行两遍、`instanceof` 失效）。
  **改写只对首屏依赖图内的模块生效**；**有循环依赖的模块整模块跳过**（动态 import 遇环会死锁）；**`export ... from` 的模块跳过**。

- **`web/` 下的前端源文件一个字都没改** —— 别去找什么「前端改了 import」，改写全在 `server/src/lib/`。

- **本地起服务做验证（两个环境变量都要给）**：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  $env:PORT='18803'; $env:HOST='127.0.0.1'
  $env:ZHIHU_ACCESS_SECRET_FILE='C:\Users\steam\.zhihu-cli\access_secret'
  Start-Process -FilePath 'node' -ArgumentList 'server/src/index.js' -WorkingDirectory 'C:\Users\steam\Desktop\从心' -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\svc.log" -RedirectStandardError "$env:TEMP\svc.err"
  ```
  ⚠️ **漏掉 `ZHIHU_ACCESS_SECRET_FILE` 的症状**：回归 3 拍报「401 · 没有可用的知乎凭据」（不是代码 bug）。

- **限流代理（本地复现平台限流的办法，`.ctx/limit-proxy.mjs`）**：
  ```powershell
  node .ctx\limit-proxy.mjs      # 18804 → 18803；指定模块前 N 次直接回 429
  ```
  ⚠️ 代理日志里每个模块**应该出现 N+1 次**（N 次 429 + 1 次 200）—— **只出现 N 次就说明重试没出网**（浏览器记住失败 URL 那个坑）。

- **重出包要跑完整九步**（1.2.2；⚠️ `inspect_node_project.py` 用 `--root`）：
  ```powershell
  $v122="$env:TEMP\aiworks-helper\v122\zhihu-ai-works-deploy-helper"; $proj="$env:TEMP\congxin"; $repo='C:\Users\steam\Desktop\从心'
  node "$repo\scripts\make-delivery.js" --secret
  python "$v122\scripts\collection_data.py" --project-root $proj begin
  # 写 $proj\_tmp\.aiworks-collection\seo-input.json（{intent, queries}）后：
  python "$v122\scripts\collection_data.py" --project-root $proj observe-seo --input "$proj\_tmp\.aiworks-collection\seo-input.json"
  python "$v122\scripts\inspect_node_project.py" --root $proj --output "$proj\_tmp\deploy-plan.json" --backend-html-pages "$proj\_tmp\backend-html-pages.json"
  python "$v122\scripts\write_backend_runtime.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$v122\scripts\write_deploy_descriptors.py" --output-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$v122\scripts\validate_deploy_output.py" $proj
  python "$v122\scripts\settle_agent.py" --project-root $proj --product-code minimax-code --product-name "MiniMax Code" --product-version unknown --platform desktop
  python "$v122\scripts\create_project_archive.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$repo\scripts\fix-zip-exec-bit.py" "$proj\congxin.zip"
  ```
  **每次出包指纹都会变，对外只报当次实测的 SHA-256。** PowerShell 里变量名别叫 `$zip`。
  ⚠️ `begin` 会清空 `intents` → 每轮都要重新 `observe-seo`。

- **交付副本真机冒烟（这次用的流程）**：
  ```powershell
  $smoke="$env:TEMP\congxin-smoke74"
  python -c "import zipfile,shutil,os; d=os.path.join(os.environ['TEMP'],'congxin-smoke74'); shutil.rmtree(d,ignore_errors=True); zipfile.ZipFile(os.path.join(os.environ['TEMP'],'congxin','congxin.zip')).extractall(d); print(d)"
  npm --prefix "$smoke\congxin" ci
  $env:PORT='18806'; $env:HOST='127.0.0.1'
  Start-Process -FilePath 'node' -ArgumentList 'server/src/index.js' -WorkingDirectory "$smoke\congxin" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\smoke74.log" -RedirectStandardError "$env:TEMP\smoke74.err"
  node .ctx\smoke-d74.mjs        # 本轮新写的：接口 + CSS 内联 + module 改写（18 项）
  node .ctx\smoke-advice74.mjs    # 「问它」实跑（烧 1 次直答额度）
  ```
  交付副本里的 `secrets/access_secret` 会被 `config.js` 自动读到，**不用设环境变量**。
  ⚠️ **别用 `Get-Content` 看服务日志**（中文按 ANSI 读会乱码，那是显示问题不是服务问题）。

- **本轮实测到的事实（可直接引用）**：
  - 依赖图 **12 个模块**：`js/{app,api,pet,mountain-trail,pet-companion,outro,daily,onboarding}.js` + `assets-kit/{system,motion,layout}.js` + `assets-kit/ui/ui.js`；**环依赖：无**。
  - **6 个被改写**（`app.js`、`daily.js`、`pet-companion.js`、`layout.js`、`system.js`、`ui/ui.js`）；其余 6 个无 import → 原样返回。
  - 限流代理复现：第 1 次全 429 → 第 2 次全 429 → **第 3 次 5 个全 200**，总耗时约 **1.5 秒**，**零 console error**（改写前是 3 个 uncaught exception），首屏按钮恢复成「**问它一件事**」。
  - 交付副本冒烟 **PASS 18 / FAIL 0**：`/web/` 461,527 字符 · `<style data-inline-from>` **12 个** · `<link rel=stylesheet>` 只剩 1 条 · helper 已注入且在第一个 module script 之前 · `app.js` 改写后无静态 import 语句 · `system.js` + `ui/ui.js` 的动态 import 已包上重试 · `pet.js` 原样返回 · `/api/tone` 14 句。
  - `POST /api/advice` → **200 / 13.5 秒**，`verdict=partially_applicable`、**plan 4 步（每步带 `source_indexes`）**、**4 条真实出处**（`zhuanlan.zhihu.com/p/...` 真实链接）。
  - 回归 **PASS 14 / FAIL 0**；契约自检 **PASS 14 / WARN 0 / FAIL 0**；3 个改动文件编码检查全过（`BOM=N / U+FFFD=0 / CRLF=0`）。

- **当前包**：`%TEMP%\congxin\congxin.zip` · **3,157,497 字节 / 88 条目** ·
  **SHA-256（补执行位之后）`afc7b477e2538ea384b27f8ccf219644d767ac00a6f45ebf1b67a02ab26206fe`**。
  （上一版 3,148,394 字节 / 87 条目 / `4ba10377…` 已被取代。）

- **目录所有权（D65）**：队友 `5zdz5` = `web/index.html`、`web/css/`、`web/assets/`、`assets/`、`docs/adr/`；本会话 = `web/js/`、`server/`、`contracts/`、`scripts/`、`docs/decisions.md`、`docs/status.md`。本轮**全在 `server/` 与 `docs/`**。

- **编码纪律**：`.ps1` 必须 UTF-8 **with BOM**；`.md`/`.json`/`.js` UTF-8 无 BOM、纯 LF；写完跑 `node .ctx\check-encoding.mjs <files...>`。中文长文本走 `.mjs` 脚本（`node -e` 在 PowerShell 里内层引号会被吃掉）。

- **commit 纪律**：`Context:` 必须由人给，AI **只许转录人说过的话**；`Context:`/`Tried:`/`Verify:` 三行缺一被 `.githooks/commit-msg` 拒。禁 `git add -A`，一律 `git add -- <显式路径>`；提交前先 `git fetch`；**每次提交前重填 `.ctx/current.md`**（写前先 read，hook 提交后自动清空）。

- **GitHub push**：Clash 代理**没开**时**直连就能推**（前几轮都是直连成功）。先试直连，失败再找代理。

## 5. 下一步（按优先级）

1. **🔴 用户在 AI Works step=2 重新上传 `%TEMP%\congxin\congxin.zip`（3,157,497 字节那版）** → preview 才会真的稳。
   ⚠️ 平台上传侧返 401（`ApplyUpload` 签名校验失败）是**平台问题**（同尺寸对照包同样失败）→ 用户在自己 Chrome/Edge 手动传；还是失败就找赛事组，**别反复重试**。
2. **上传后当场验四件事**：① 连刷 5 次 preview，四种塌陷（荧光绿 / 文字叠一起 / 图标方块 / 刘看山变 alt 文字）都不该再出现 ② 首屏按钮是「**问它一件事**」③ 右上角不再是「连接中…」 ④ `cache-control` 是不是仍被平台改写成 `private, no-store`（**预期仍是**，平台强制，我们只是备着）。
3. **12-05 10:00 参赛项目通道开启后**：绑定参赛项目（赛道选 **8 = AI × 陪伴与交互**，D54）、取 OAuth 凭证（App ID / App Key）、接登录入口。
4. **首屏下方「日报 / 工作台」section 仍是收藏→日报的旧口径**（队友地盘）—— 只改了主视觉三处。**要不要一起统一，需队友或用户拍板。**
5. **`web/index.html` 里 `btn-tension` / `btn-terrain` 还在**（认知闭环已下线）→ **等队友删**。
6. **`README.md` 里队友的认知地形截图 `web/docs-shot-terrain.png` 还没删**（队友地盘，提报前要处理）。
7. **补发队友那条**（用户自己发，AI 不参与）：额度纠正（未实名：搜索 10 次/天、**直答只有 2 次/天**）+ 面板变量清单指路（`docs/分工-视觉与功能.md` §4.1）。
8. **部署专用 Access Secret 赛后删除并轮换**（已出现在对话记录里）。

## 6. 需要人拍板的事

- **本轮 commit 的 `Context:` 怎么写** —— 纪律要求由人给、AI 只许转录人说过的话。本轮用户说过的是「上传完成了」和「为什么不介入大模型 AI」，**都不是改动理由** → 需要用户给一句（或授权转录哪一句）。
- **要不要现在给「加大模型」排期**：D74 已把大模型口径写进 `docs/decisions.md` §8，但**没有动代码**。主链路在 12-04 拿正式链接前冻结；知乎知识库（RAG，500/天）是性价比最高的加码项 —— **要不要做、什么时候做，等用户拍板**。
- **那条 SEO 意图要不要改**：本轮收录了 1 条（**新 id `498a6e05-90b1-4627-bbea-3bf1b0f003f3`**，上一版那个 id 因 `begin` 清空 state 已失效），目标受众 = 评审黑客松作品的评委 + 遇一件具体难事想找办法的普通用户。它**会随 ZIP 一起交付给平台**。表述要改可以让我改（`observe-seo` 支持按 `intent_id` 刷新）。
- **首屏口径要不要连下面的 section 一起统一**：首屏大字已是「问它」，下面「日报 / 工作台」还是收藏→日报的旧口径。
- **AI Works 两项审核声明最终确认**：账号登录 = 否 / 大模型生成内容 = 是（点发布前还能改）。
- **演示视频**（用户说「不急」）：要不要在 12-04 前预留拍摄时间？
