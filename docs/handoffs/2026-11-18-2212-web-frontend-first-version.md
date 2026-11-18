# 交接：`web/` 前端第一版——从零行到「能演」

- **时间**：2026-11-18 21:47
  （文件名前缀用 `2212` 而不是墙钟的 `2147`，是为了接在上一份 `2026-11-18-2210-knowledge-cards-endpoint.md` 之后——**那份的文件名比它的实际写入时间（21:39）快了约 30 分钟**，而「按文件名最新的一份」这条读取规则依赖字典序，不能插队。）
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `10d2714`（并行会话提交「带出处的卡片接口」那次；本次前端提交紧随其后）
- **本次目标**：用户 2026-11-18 21:3x 拍板「**队友那边先不管，你先弄一版能用的**」→ 由 `nineanswerer` 亲手写 `web/`，做一版 P3 能演的前端。**P3 明天 11-21 收口。**

---

## 1. 现在处于什么状态

`web/` 从**零行**变成**可演的第一版**（真实知乎数据，**全程无 mock**），已用无头 Chrome 实拍验证。

- **后端**：14 个路径全部实现并实跑通过（并行会话 11-18 提交 `10d2714`）。
- **前端**：接了契约 14 个路径中的 **12 个**；未接的 3 个是 OAuth 登录（`/api/auth/login`、`/api/auth/callback`、`/api/auth/logout`）——**凭证 12-05 才由赛事页面分配**（B4），现在接了也只会拿到 `401 OAUTH_REQUIRED`。**Demo 主路径不依赖 OAuth**（已用真实进程验过）。
- **两个服务当前还开着**：后端 `http://localhost:18787`（task `bg_078ab4ae`）、前端 `http://localhost:18788/web/`（task `bg_6be0d855`）。
- **自检**：`PASS 13 / WARN 0 / FAIL 0`（含第 4 项密钥扫描——它用 `git ls-files --cached --others --exclude-standard`，**未跟踪的新文件也进扫描**，所以 `web/` 9 个文件是被扫过的）。
- **额度**：问题发现 **74/100**、用户数据 9846/10000、直答 96/100。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/serve.js` | **零依赖**静态服务 + `/api` 代理（仓库根为静态根，`/` → `/web/`） | 页面与接口同源 → 前端不用处理 CORS、也不用写死后端地址；部署时前后端同进程，把静态挂到主服务即可，**前端一行不用改** |
| `web/index.html` | 单页骨架：顶栏（身份 / 额度 / 语气切换器）、桌宠 + 材料盘、主流程面板、照镜子面板、底栏统计 | D29：桌宠是主体，认知闭环是桌宠的一个功能环节 → 两条都在同一页、一个 tab 切换 |
| `web/css/app.css` | 设计系统与全部样式（沿用 P1 静帧的设计令牌） | 静帧已经拍板，别另起一套视觉语言 |
| `web/js/api.js` | 接口层：统一错误信封 → `user_hint`；**失败一律说真话** | 官方检查第 7 条：接口失败/额度耗尽/空数据要给真实提示 |
| `web/js/pet.js` | 桌宠状态机 + 气泡台词 | D19：官方 6 状态 + 自建 `eating`/`emitting`/`error` 过渡，**不自绘角色** |
| `web/js/quiz.js` | 6 题自述问卷 + 前端计分 | 后端只收 `{ type, dimension_scores, traits }` |
| `web/js/terrain.js` | 2.5D 分层认知地图（SVG + CSS `perspective`） | D29 拍板 2.5D 用 SVG；**真 3D 推镜留给队友**（保命砍法里排最后） |
| `web/js/app.js` | 主逻辑，把上面几个串起来 | — |
| `web/js/demo.js` | `?demo=1` 演练模式（自动跑一遍 Demo 脚本骨架） | 决赛只有 5 分钟，中途点错一下就断节奏 → 提前演练 |
| `web/README.md` | 跑法 / 目录结构 / 接了哪些接口 / **交接给队友时必须分清的两类东西** / 已知问题 | 目录归属已临时移交，队友回来要接手 → 交接说明必须落盘 |
| `web/docs-shot-1.png` | 无头 Chrome 实拍（1600×900） | 交付证据 |
| `docs/协作规范.md` | 目录所有权：`web/` 改给 `nineanswerer`，记了原因 + 5 条边界 | BOOTSTRAP 第 4 条：改别人负责的目录要先在协作规范里确认 |
| `docs/status.md` | 同步前端里程碑、额度现状（74/100）、B16 交接阻塞项、下一步重排 | 文档纪律 |

---

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：让前端直接跨域调后端（`http://localhost:18787`）。
  **结果**：CORS 要在两边都配；更致命的是**部署形态变了**——AI Works 源码发布后前后端是同一个进程，没有 `:18787` 这个地址可写。
  **结论**：改成 `web/serve.js` 做同源代理，前端代码里只出现相对路径 `/api/*`。**前端永远不要写死后端地址。**

- **尝试**：改 `server/src/index.js`，把静态目录挂到后端上（这样前后端一个进程就完事）。
  **结果**：**故意没做**。`server/src/index.js` 是并行会话的地盘，它 11-18 21:3x 刚提交过 `10d2714` 动过这个文件；**两个 AI 会话共用同一个工作树、同一个 `main` 分支**（不是分叉），我在它正在改的文件上动手会撞车。
  **结论**：`web/serve.js` 作为**开发期独立进程**存在，部署时再把静态挂到主服务上。**不要为了「干净」去改 `server/src/index.js`。**

- **尝试**：用收藏做卡片出处（省掉 `POST /api/cards` 的额度）。
  **结果**：9 条收藏里 **8 条是专栏文章**，推不出「问题 URL + 原回答 URL」；`content/question_answers` 的 `Url` 字段是唯一能给原回答 URL 的地方。
  **结论**：**卡片必须走 `POST /api/cards`；收藏只能当开场材料。** 前端把「拖进来的文本」明确标注「没有知乎出处」。

- **尝试**：把台词写死在前端（省一次 `GET /api/tone`）。
  **结果**：违反 D33 的「台词唯一真源是 `contracts/tone.json`」，「语气可选项」直接变摆设。
  **结论**：台词**全部**从 `GET /api/tone` 取；加载失败就**如实提示，不内置兜底文案**。

- **尝试**：给前端内置一份 mock 素材，开场不用等接口。
  **结果**：官方检查第 9 条——**不得把 Mock 写成完成**。
  **结论**：不内置 mock；开场素材实时拉该账号的真实收藏。

- **尝试**：前端也绑 8787。
  **结果**：`listen EACCES: permission denied 0.0.0.0:8787`——**不是被占用，是被系统拒**（后端同样绑不上）。
  **结论**：**前端 18788 / 后端 18787**，两个都不能用 8787。

- **尝试**：用 `edit` 工具在 JSON 里插一个路径。
  **结果**：两次把 JSON 改坏（`Bad control character in string literal` / `Expected ',' or '}' after property value`）——**`edit` 参数里的 `\n` 会变成真实换行**，而且**锚点会模糊匹配**，会把上一个路径的闭合括号吃掉。
  **结论**：改 JSON 优先用短锚点（≤3 行）+ 改完**立刻** `node -e "JSON.parse(...)"` 验一次。

- **尝试**：用 `read` 工具读中文 JSON / Markdown。
  **结果**：无 BOM 的 UTF-8 被按 ANSI 读 → **中文乱码**，一度以为文件被改坏。
  **结论**：中文输出走 Node 或写文件后再读；`.ps1` 必须是 **UTF-8 with BOM**。

---

## 4. 下一个 AI 接手前必须知道的事

### 4.1 目录归属（**别越界**）

| 谁 | 范围 |
| --- | --- |
| `nineanswerer`（本会话） | `web/**`、`docs/队友对齐清单.md`、`docs/status.md`、`docs/P1-三件产出.md`、`docs/协作规范.md` |
| 并行会话 | `contracts/**`、`server/**`、`docs/decisions.md`、`docs/handoffs/**` |

**`web/` 现在归 `nineanswerer`**（2026-11-18 临时接管，理由与 5 条边界写在 `docs/协作规范.md`）。队友 `5zdz5` 回来后要改 `web/` **走 PR，不直推 main**。

### 4.2 必须先跑的命令

```powershell
# 后端（8787 绑不上，必须换端口）
cd 'C:\Users\steam\Desktop\从心\server'
$env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
$env:PORT = '18787'; node src/index.js

# 前端（零依赖）
cd 'C:\Users\steam\Desktop\从心\web'; node serve.js   # → http://localhost:18788/web/

# 不耗额度的回归（可以随便跑）
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-tone.js   # 14 项
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-auth.js   # 25 项

# 自检（期望 PASS 13 / WARN 0 / FAIL 0）
powershell -ExecutionPolicy Bypass -File 'C:\Users\steam\Desktop\从心\scripts\check-contract.ps1'

# 无头 Chrome 截图（已验证可用）
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --disable-gpu --hide-scrollbars `
  --force-device-scale-factor=1 --window-size=1600,900 --virtual-time-budget=9000 `
  --screenshot='C:\Users\steam\Desktop\从心\web\docs-shot-1.png' 'http://localhost:18788/web/'
```

### 4.3 坑

- **`git add -A` 被禁**：工作区有并行会话的中间产物。一律 `git add -- <显式路径>`；提交前先 `git fetch`。
- **`POST /api/cards` 吃「问题发现」额度**：1 张卡 ≈ 2 次，N 张 ≈ 1+N；同主题 5 分钟缓存。**额度计数有延迟（跑完等 15 秒才变）**——别因「没涨」以为没花。
- **上游额度每日 00:00 重置、不结转。**
- **改别人负责的目录 → 先在 `docs/协作规范.md` 的「目录所有权」里确认**，冲突就提出来。
- **`.ps1` 必须是 UTF-8 with BOM**；工作区行尾统一 LF。
- **`edit` 的锚点会模糊匹配**：改完关键文件**必须回读确认**。

### 4.4 硬约束（官方检查 9 条，摘要）

密钥不入源码/前端响应/日志/截图/视频；接口失败/额度耗尽/空数据给**真实提示**；禁止批量高频调用；**不得把 Mock 写成完成**；刘看山 IP **仅本届比赛期间可用**，赛后禁商用；**不自绘角色**。

---

## 5. 下一步（按优先级）

1. 🔴 **人亲手把 P3 闭环点一遍**（真实数据、不 mock）：拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 追问 → 知乎补观点 → 卡片列表 → 照镜子 → 断层 → 情境题 → 作答 → 地形长块。**重点看失败态提示是不是真的、节奏对不对**——这一步不需要再写功能。
2. 🟡 **补 `web/README.md`「已知问题」的 4 条**：OAuth 登录入口（等 12-05 凭证）/ 卡片正文截断折叠（上游 `content` 可能 200+ 字带 `[图片]` 标记）/ 三层地形 / 追问链。
3. 🟡 **零 G / 零 K 的接口数从 13 改成 14**（契约现为 14 个路径），零 K 再补一条「卡片必须走 `/api/cards`，收藏推不出出处」。**由用户自己发。**
4. 🟡 **P1 台词 14 句逐句审**（`contracts/tone.json` 与 `docs/P1-三件产出.md` §二），**只能人拍板**。
5. 🟢 队友回来后按 `web/README.md` 交接 `web/`（走 PR）。

---

## 6. 需要人拍板的事

1. **零 G / 零 H / 零 K 由用户自己发**（零 J 暂缓，留在仓库不删）。零 K 需要**新版文本**（14 接口版），我已把要改的点列在 `docs/status.md` 第五节第 4 条。
2. **P1 台词 14 句逐句审**——AI 只能排版，不能替人定稿。
3. **B14 分类体系三件事**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）——等队友有空一起定；**未确认前 `status` 保持「初版」**。
4. **B10 需求验证（3—5 人试用）**——11-28 前要做，12-05—12-07 校园宣讲是现成渠道。
5. **B9 决赛是否赴深圳**——用户此前选「待定」。
