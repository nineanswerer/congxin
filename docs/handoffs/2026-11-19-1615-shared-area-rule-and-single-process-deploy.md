# 交接：共享区直推拍板落库 + 补上单进程部署形态

- **时间**：2026-11-19 16:15
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `48d8ee8`（已推 origin/main；本文件本身待提交）
- **本次目标**：① 收掉本会话前半程遗留的**交接文档提交**；② 用户 15:4x 拍板「**共享区直推 main（照旧）**」
  → 落库成 D41 并把规范原文改成和实践一致；③ 顺着「提交前检查第 1 条要公网体验链接」往下查，
  **发现仓库根本无法单进程跑起来** → 补齐部署形态（D42）；④ 顺手把 README 与实现对齐，
  原文写着「尚未进入功能开发」「D1—D26」，是评委打开仓库看到的第一屏。

## 1. 现在处于什么状态

- **官方提交前 9 条里，第 1 条（体验链接支持评委走完主流程）从「不可能」变成「只差授权」**：
  后端现在同进程挂前端静态，`npm install && npm start` 一个进程即完整作品（D42，实测通过）。
  **部署本身没做**——AI Works 源码发布、打包上传、拿正式公网链接都是对外可见动作，**需用户授权**。
- **协作机制里再没有悬着的矛盾**：共享区走不走 PR（D41）、`docs/handoffs/` 归属（D43）都拍完了，
  `docs/协作规范.md` 原文已同步，不再留没人执行的规则。
- **README 不再自相矛盾**：状态行、D1—D40、快速开始、选型表述全部与实现一致（0257f0a）。
- **不能做的**：演示视频没拍（第 4 条硬要求，只能人录）；OAuth 登录 UI 没做（凭证 12-05 后）；
  D10 定的「可安装 PWA」**没落地**（无 manifest / service worker，README 已写成实话）。
- **额度**：问题发现剩 **24/100**（本会话后半程一次没烧——验证只走 `user_data`，用了 3 次）。
- **服务在跑**：后端 `http://localhost:18787`（**已用新代码重启**，含静态挂载）、前端 `http://localhost:18788/web/`。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `docs/handoffs/2026-11-19-1520-…md` | 本会话前半程的交接文档落库并提交（`011e95e`） | 收工协议要求；前半程只写了文件没提交 |
| `README.md` | ① 状态行从「尚未进入功能开发」改成真实进度（含未提报/未部署/无 OAuth/没视频）② `D1—D26` → `D1—D40` ③ 新增「快速开始」：两进程命令 + 主流程 7 步 + 两张实拍图 ④ 技术选型表里「可安装 PWA」「Framer Motion」改成实话 ⑤ 补 `docs/P1-三件产出.md`、`web/README.md` 两条文档链接 | 评委打开仓库第一眼看到的就是这份；原文与实现严重不符 |
| `docs/decisions.md` | 新增 **D41**（共享区默认直推 main）、**D42**（单进程部署形态）、**D43**（`docs/handoffs/` 照旧写） | 「发现先前结论错了要改并在 decisions.md 记」+ 决策层只增不改 |
| `docs/协作规范.md` | ① 「共享区改动走 PR」→ 改成直推并写死触发条件 ② 「每天至少合并一次」→ 改成推送频率 ③ 目录所有权表下补 `docs/handoffs/` 的例外说明 | 规范与实践不一致时，下一个会话还会卡在同一个地方 |
| `docs/status.md` | 新增 B17（共享区 PR 冲突已关闭）、P7 行补「单进程部署已就绪」、下一步第 9 条补部署现状、时间戳更新 | 共享区是进度真源 |
| `server/src/lib/web-static.js`（新） | `mountWeb(app)`：挂 `/web/` 与 `/assets/`，`/` 302 到 `/web/`；仓库根自动探测 + `WEB_STATIC_ROOT` / `WEB_STATIC=off` 两个开关 | **D22 当初假设「把静态目录挂到主服务上」这一步一直没做**，仓库当时无法单进程跑起来，AI Works 打包会踩空 |
| `server/src/index.js` | 引入 `mountWeb`，调用点放在**接口路由之后、404 兜底之前**；启动日志加一行「前端页面：/web/」 | 顺序反了 `/api/*` 会被静态吃掉，或静态永远轮不到 |
| `package.json`（新，根目录） | `start: node server/src/index.js`、`engines.node>=20`、`dependencies: express` | AI Works「源码发布」要的正是「能 npm install && npm start 起全站」的包 |
| `web/README.md` | 新增「部署形态：**一个进程 = 完整作品**（D42）」一节：三个地址、只挂两个目录的理由、挂载顺序、环境变量开关 | 交接给队友时不能留「还要起两个服务」的错信息 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：`gh repo view nineanswerer/congxin --json visibility` 查仓库是否公开。
  **结果**：`HTTP 401: Bad credentials (https://api.github.com/graphql)` —— gh 的 keyring 令牌已失效
  （和 status.md B11 记的「gh 令牌失效、但 Git Credential Manager 里有可用令牌」是同一件事）。
  **结论**：**别指望 `gh` 查仓库状态**；改用 `web_fetch` 打开仓库页即可确认——
  页面里有 `"repository_public": "true"`，这比 gh 的输出可靠。

- **尝试**：第一次提交 README 时，commit message 文件只写了 `Context:` / `Tried:` / `Verify:` 三行，**忘了标题行**。
  **结果**：commit-msg hook 报
  `标题格式不对。期望: <type>(<scope>): <祈使句>` + `标题 179 字节（约 59 个中文字），超过 50 字符上限`。
  **结论**：**msg 文件第一行必须是标题**，三行说明写在标题 + 空行之后；hook 的 autofill 会把 Context 插在标题后的第一个空行处。

- **尝试**：用 PowerShell `Get-Content` 读 `docs/status.md`、`server/package.json`。
  **结果**：控制台中文全是乱码（`鈥?褰撳墠杩涘害`…）。
  **结论**：**这是 PowerShell 5.1 按 ANSI 读 UTF-8 无 BOM 文件的显示问题，文件本身没坏**。
  看中文内容用 `read` 工具或 `node` 读字节，**别拿控制台乱码去判断文件是否损坏**（差点误判）。

- **尝试**：`edit` 改 status.md 的 P7 行，`old_string` 用 `read` 工具显示的那一行。
  **结果**：`Could not find the exact text` —— **`read` 与 `grep` 对同一行的加粗标记显示不一致**
  （`read` 显示 `**部署 + 审核 ★硬截止**`，`grep` 与原始字节都是 `部署 + 审核 ★硬截止`）。
  **结论**：**`edit` 的 `old_string` 必须以原始字节为准**——
  用 `node -e "console.log(JSON.stringify(fs.readFileSync(f,'utf8').split('\n')[157]))"` 打印原始行，
  别照抄 `read` 的输出。

- **尝试**：`curl.exe -s <quota> | node -e "JSON.parse(...)"` 解析额度。
  **结果**：`SyntaxError: Unexpected token '﻿', "﻿﻿{"data":"... is not valid JSON` —— **管道带了 BOM**。
  **结论**：额度这种小 JSON **直接看 curl 原始输出**就行，别再套 node 解析。

- **尝试**：确认根目录那堆 `dark-echo-*.jpg` / `skin-*.png` / `videos/*.mp4` 会不会混进仓库。
  **结果**：`git ls-files --error-unmatch` 全部**未入库**；`.gitignore` 已覆盖
  （`dark-echo-*.jpg`、`skin-*.png`、`videos/`、`_extract.ps1`、`octosense-*.md`）。
  **结论**：**仓库对外是干净的**，那些是本地另一个项目的残留，**不用管、也别删**（可能用户还要用）。

- **尝试**：给 PWA 补 `manifest.webmanifest` + service worker。
  **结果**：**没做**——不是试了失败，是**判断不该现在做**：
  ① D10 是「形态决策」不是 P3 出口条件；② service worker 缓存静态资源正是「评委看到旧版」的高发原因
  （本项目已经吃过 webp 缓存的亏）；③ P3 明天就收口。
  **结论**：**别在收口前动 SW**。README 已把「可安装 PWA」写成「尚未落地」，不撒谎就行。

- **尝试**：先停 18799 测试实例再停 18787 旧实例，然后重启。
  **结果**：端口冲突与「老实例还在跑旧代码」两个坑一起出现；
  处理办法是**先停新的、再停旧的、最后起一个**。
  **结论**：**改后端代码后要重启才能生效**，重启顺序：**停测试实例 → 停正式实例 → 起正式实例**。

## 4. 下一个 AI 接手前必须知道的事

- **服务要先起来**（后台 bash 任务 1 小时上限会被静默回收，**开工先探端口**）：

  ```powershell
  # 后端（8787 绑不上，必须 18787）；改完 contracts/tone.json 也必须重启
  cd 'C:\Users\steam\Desktop\从心\server'
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  $env:PORT = '18787'; node src/index.js
  # 前端（开发期双进程；单进程形态见下）
  cd 'C:\Users\steam\Desktop\从心\web'; node serve.js
  ```

- **两种跑法都活了**：
  - 开发双进程：前端 `http://localhost:18788/web/`（`web/serve.js` 把 `/api` 代理到 18787）
  - **单进程（部署形态）**：只起后端 → `http://localhost:18787/web/`（**根路径 302 过去**）；
    素材在 `/assets/kanshan/*.webp`；接口同源 `/api/*`。**前端一行代码不用改。**
  - 环境变量：`WEB_STATIC_ROOT`（显式指定仓库根）、`WEB_STATIC=off`（退回只发 API）。
- **单进程只挂 `/web/` 与 `/assets/`**，**不挂仓库根**——`docs/`、源码、`.ctx/` 不暴露。
  `web/serve.js`（开发期）是**把仓库根当静态根**，两者暴露面不一样，别混。
- **提交纪律**：禁 `git add -A`，一律 `git add -- <显式路径>`；提交前先 `git fetch`；
  commit message **第一行必须是标题**，然后 `Context:` / `Tried:` / `Verify:` 三行；
  `Context` 也可写进 `.ctx/current.md`（格式 `Context: <理由>`）由 hook 自动填。
- **共享区（`contracts/`、`docs/status.md`、`README.md`）现在默认直推 main**（D41）——
  触发条件：队友联系不上 **且** 在交付窗口内。**队友回来或他要看 diff → 改走 PR。**
- **`docs/handoffs/` 照旧写**（D43）：收工协议是团队机制，不是越界写队友的活；
  但 `assets/`、`docs/adr/` 仍只归队友，越界要用户单独认可（`assets/` 已认可，`docs/adr/` 没动过）。
- **另一个 AI 会话会并发提交同一工作树同一 `main`**：不要动对方正在改的文件；
  `.ctx/msg2.txt` 是并行会话遗留，别覆盖（另存 `.ctx/msg-<name>.txt`）。
- **`.ps1` 必须 UTF-8 with BOM**；工作区行尾统一 LF；**写完扫 `U+FFFD`**（Node 读字节查才准）。
- **密钥**只在 `C:\Users\steam\.zhihu-cli\access_secret`（仓库外、gitignore），前端不碰。
- **浏览器要点**（本会话用到的）：
  - `run_script` 的 `code` 是**函数体**（单次 30 秒上限）；worker 里**没有 `page.click`** → 用 `page.evaluate(() => el.click())`。
  - **活动标签会漂** → 先 `page.evaluate(() => location.href)` 确认；新开页面用 `open_tab`（保留旧标签）。
  - `query(kind:'network')` 能一次拿到整页请求账（method/status/mimeType/duration）——**核「同源 API 通不通」用它**。
  - `query(kind:'console')` 返回 `entries: []` 就是**零报错**。
- **额度**：问题发现剩 **24/100**（每日 00:00 重置、不结转）。一次完整手动流程 ≈ 11 次、一次 `?demo=1` 演练 ≈ 8 次
  （演练是自动点击器、**不是 mock**，真调知乎）。**回归前先看额度。**

## 5. 下一步（按优先级）

1. **授权公网部署**（第 1 条硬要求）：形态已就绪（D42），剩下是「AI Works 源码发布 → 打包 → 上传 → preview → 等审核」。
   ⚠️ **正式公网链接必须 12-04 前拿到**（内容审核是外部依赖）→ 按总表 P7 排在 11-27—11-30，别拖。
2. **拍演示视频**（第 4 条硬要求）：只能人录。`docs/P1-三件产出.md` §二 有 5 分钟逐秒脚本（18 拍 13 句）。
3. **人亲手点一遍 P3 闭环**（AI 已代跑 9/9 通过，剩人眼判断节奏/台词/失败态）。⚠️ 今天额度只剩 24，**点之前先看额度**。
4. **P1 台词 14 句逐句审**（`contracts/tone.json` 与 `docs/P1-三件产出.md` §二）——**只能人拍板**，AI 只能排版与绘制。
5. **零 G / 零 H / 零 K 由用户自己发**（AI 不参与）：文本已改好（接口数 14、零 K 第④条含卡片接口 + `same_question`）；只有零 I 真发过。
6. **B14 三件事等队友确认**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）；
   **B4** 确认 App ID / App Key 是否已可获取（12-05 之后；**不发邮件**）；**B10** 约 3—5 人试用（11-28 前）。
7. **保命砍法尾巴**（P3 之后）：落版画面（4:50—5:00）、镜头动效、Three.js 真 3D 推镜。
8. **可选**：D10 的「可安装 PWA」（manifest + service worker）——**别在收口前动**，SW 缓存是「评委看到旧版」的高发原因。

## 6. 需要人拍板的事

- **公网部署的授权**——部署、打包上传、拿正式公网链接都是对外可见动作，**AI 不擅自做**。
- **演示视频**——只能人录；要不要先录一版粗的占位。
- **P1 台词 14 句逐句审**——内容层只能人拍板，AI 不能替。
- **零 G / 零 H / 零 K 的发送**——对外可见动作，需用户自己发。
- **D10 的「可安装 PWA」补不补**——补则要承担 SW 缓存风险；不补则 README 里那句得一直挂着「尚未落地」。
- **B14 三件事**（分类体系）等队友 `5zdz5` 回来确认。
