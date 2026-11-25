# 交接：D74 真 preview 连刷 5 次验收通过（37 个 429 全部自愈）

- **时间**：2026-11-25 11:50
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `ca9617e`（D74 已推 origin/main）；本会话新增的 D75 文档改动**尚未提交**
- **本次目标**：用户上传 D74 交付包后指示「连刷 5 次 preview，核验 helper 注入、资源改写、429 与 console error」→ 在**真 preview**（浏览器 SSO 登录态）上做验收。

## 1. 现在处于什么状态

**preview 塌陷这条线已经闭环，不再是阻塞项。** D74 的服务端 import 改写在真机上确认生效：
5 次连刷共 37 个 429（其中 19 个打在 module script 上）**全部自愈**，5 次 console **零 error**，
四种塌陷一个都没出现。

改动已落到 `docs/decisions.md` **D75** 与 `docs/status.md` §二（阻塞项里那条 🔴【D74】已删除），
但**还没 commit** —— 缺 `Context:` 行（纪律见 `prompts/COMMIT_MSG.md`，AI 不许代写）。

剩下的硬截止仍是：12-04 前拿到**正式公网链接**、12-05 10:00 参赛项目通道开启（见 `docs/status.md` §三）。
主链路按 D74 §8 继续**冻结** —— 功能不加码，只做收口与演示准备。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `docs/decisions.md` | 追加 **D75**（真机验收事实 + 三条判断 + 排除项 + 未验项） | 真机结论必须进决策层，否则下一轮会重犯「荧光绿当 bug 追」「去改 module-loader 而不是查图片链」这两个错 |
| `docs/status.md` | 「最后更新」改 `11:5x`；§二 顶部新增 D75 条目；**§三 删除 🔴【D74】阻塞项** | 阻塞项已解除，留在原地会误导下一个人 |
| `docs/handoffs/2026-11-25-1150-preview-verify.md` | 本文件 | 收工协议要求 |

**代码零改动** —— 本次是纯验收，只读不写业务代码。

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：`mcp_browser` 的 `run_script` 传 `async (page) => { ... }`（函数表达式）来跑探测。
  **结果**：返回 `success: true` 但 `pageEvaluate.calls: 0`、`logs: []` —— **函数体根本没被执行**，也没报错。
  **结论**：`run_script` 的 `code` 必须是**函数体**（`page`/`assert`/`console` 直接在作用域里），
  不是函数表达式。写成 `const r = await page.evaluate(async () => {...}); return r;` 才对。
  这个坑很隐蔽 —— 看起来「成功了」，实际什么都没跑。**下一个 AI 务必先跑一行 `console.log` 探针确认。**

- **尝试**：用 `reload` 刷新 preview。
  **结果**：第一次 `reload` 后 tab 变成 `about:blank`，紧接着 `run_script` 报
  `BROWSER_PAGE_UNAVAILABLE: Open or inspect an HTTP(S) page in the current Browser tab before using run_script`。
  **结论**：`reload` 在这条带 SSO 跳转链的地址上**可能失败**。失败后用 `navigate`（同 URL）回去，
  不要卡在那儿；后面 4 次 `reload` 都正常。

- **尝试**：拿线上 `app.js` 的长度跟本地比大小，判断线上是不是旧版本。
  **结果**：线上 `t.length` = 42,860，本地 `Buffer.length` = 56,448 —— 一度判定「线上比仓库还旧」，
  **结论**：**这是口径错误，不是版本问题**。`t.length` 是 **UTF-16 字符数**，`Buffer.length` 是**字节数**，
  文件里有中文注释，两者不等。`pet.js` 同理（7,914 字符 = 9,848 字节，线上与仓库**完全一致**）。
  **比大小前先统一口径**（一律用 `decodedBodySize` / `Buffer.length` / 字节数）。

- **尝试**：在每次刷新后用 `fetch()` 主动拉 HTML 和 6 个模块来检查内容。
  **结果**：**主动放弃了这个方案** —— 探测本身会占用平台的并发额度，
  **可能自己把要测的 429 打出来**，污染样本。
  **结论**：改用 `performance.getEntriesByType('resource')` 做**零额外请求**的被动测量
  （`responseStatus` 拿状态码、`decodedBodySize` 拿字节数），只有最后一次收尾才做一次主动 fetch 读 HTML。

- **尝试**：用正则 `/<script>\s*\(function \(\) \{/` 判断 helper 是不是内联 script。
  **结果**：`helperIsInlineScript: false` —— **正则猜错了，不是页面有问题**。
  **结论**：别用这个字段下结论；`globalThis.__fromxinImp` 是函数（`helperDefined: true`）才是可靠判据。

## 4. 下一个 AI 接手前必须知道的事

- **本地服务端口**：`18803` 跑仓库当前代码（带 `ZHIHU_ACCESS_SECRET_FILE`）、`18806` 跑交付副本冒烟、
  `18804` 是限流代理（`.ctx/limit-proxy.mjs`，本轮已 kill 掉）。`18801/18802` 是旧代码。
- **本地起服务必须给两个环境变量**，否则回归会报 401：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  $env:PORT='18803'; $env:HOST='127.0.0.1'
  $env:ZHIHU_ACCESS_SECRET_FILE='C:\Users\steam\.zhihu-cli\access_secret'
  ```
  （`config.js` **不认** `C:\Users\steam\.zhihu-cli\access_secret` 这个默认路径，必须显式指 `*_FILE`。）
- **改写后字节数基准**（判断线上跑的是不是改写版，就比这两个数）：
  | 文件 | 未改写 | D74 改写后 |
  | --- | --- | --- |
  | `web/js/app.js` | 56,448 字节 | **56,891** |
  | `web/assets-kit/ui/ui.js` | 40,405 字节 | **40,453** |
  | `web/js/pet.js` | 9,848 字节 | 9,848（无 import，不改写） |
- **preview 域名命令行 curl 一律 403**（要知乎 SSO 登录态）→ 只能用内置 Browser 验。
- **`cache-control` 被平台强制成 `private, no-store`** → `STATIC_MAX_AGE_SEC` 公网**不生效**，
  每刷都重新拉全部资源 → 「连刷 5 次」必须当验收动作做。
- **首屏那条荧光绿不是塌陷** —— `#9AE187` = `--p-inv-bg`，`backgrounds.js` 在 **light 模式**下反转了
  `candy-on-black` 调色板。**别再当 bug 追**（D75 §4 有完整解释）。
- **当前承重墙是 D71 的两条链，不是 D74** —— 图片（asset-guard 换 query 重取）与 `/api/*`
  （`api.js` 平台级 429 重试）。**再出塌陷先查这两条**，别一上来改 `module-loader`。
- **编码纪律**：`.md` UTF-8 无 BOM、纯 LF；写完跑 `node .ctx\check-encoding.mjs <files...>`。
  PowerShell 的 `Get-Content` 读无 BOM UTF-8 会显示乱码，**那是控制台问题不是文件问题** —— 用 Node 读。
- **Git 纪律**：禁 `git add -A`；一律 `git add -- <显式路径>`；提交前先 `git fetch`；
  `.ctx/current.md` 写 `Context: <人给的理由>`，hook 自动填进 commit message 并在提交后清空该文件。
- **本会话新建的临时脚本**（`.ctx/` 下，已 gitignore，不进仓库）：
  `verify-pkg74.mjs`（交付包 vs 工作树逐字节比对）、`diff-webstatic.mjs`（逐行 diff）。

## 5. 下一步（按优先级）

1. **给 D75 的 commit 一句 `Context:`** → commit + push（只改 `docs/`，代码零改动）。
2. **12-04 前拿到正式公网链接**（审核时间不可控）—— 这是当前唯一硬截止。
3. **12-05 10:00 参赛项目通道开启后**：绑定参赛项目（赛道 8）、取 OAuth 凭证（App ID / App Key）、接登录入口。
4. 演示准备：Demo 逐秒脚本按 D66 重排镜头顺序（台词按 D68 一句不增不删，只换镜头）；演示视频预留拍摄时间。
5. 收尾清单：README 认知地形截图要不要删、`btn-tension`/`btn-terrain` 要不要删（**都在队友地盘**，需队友或用户拍板）；
   部署专用 Access Secret 赛后删除并轮换。

## 6. 需要人拍板的事

- **D75 commit 的 `Context:` 原文** —— 纪律要求人给、AI 只许转录。候选（结论式，半年后仍成立）：
  - 「D74 已在真 preview 连刷 5 次验证通过，37 个 429 全部自愈、零 console error → preview 塌陷不再是阻塞项」
  - 「真机验收证明承重墙在 D71 的图片与 API 重试链，不在 module 改写 → 后续排查方向据此调整」
  - 用户自写一句
- **README 认知地形截图**（`web/docs-shot-terrain.png`）删不删 —— 认知闭环已按 D66 下线，截图是否属于残留由用户/队友定。
- **`btn-tension` / `btn-terrain`** 两个按钮删不删 —— 同上，在队友的 `web/index.html` 里（**我方不擅自动队友目录**）。
- **首屏下方「日报 / 工作台」section 还是收藏→日报旧口径**，与新主线「问它」不一致 —— 是否本轮统一？同样属队友地盘。
- **要不要给「加大模型」排期** —— D74 §8 的性价比排序是「知乎知识库 RAG（500/天）> 小工具 PDF 解析（10/天）> 两段式直答 > 第三方大模型」；
  但主链路在 12-04 拿正式链接前冻结，**默认不排期**，要加码需用户明确拍板。
