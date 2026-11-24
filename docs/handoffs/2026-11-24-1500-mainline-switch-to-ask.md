# 交接：换主线 ——「问它」上线，认知闭环整体下线（D66）

- **时间**：2026-11-24 15:05
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `fb62d72`（**本次改动尚未提交、未推送**）
- **本次目标**：用户拍板砍掉认知地图，把产品主线换成「问它」——
  抛一个问题 → 桌宠去知乎搜相似困境 → 判断对策适不适用 → 给方案 + 真实出处。

## 1. 现在处于什么状态

**代码全改完了，文档全改完了，测试全绿，但还没提交、还没推送。**

- 主线链路现在是：**喂收藏 → 吐卡片（带出处）→ 观点对照 →「问它」面板 → 抛问题 → 知乎找相似困境 → 出方案 + 出处**。
- 「认·清」认知闭环**整体下线**：断层 / 情境题 / 认知地形三个接口、三个 service、两个前端文件全删。
- `POST /api/advice` 已实测跑通（真实知乎数据、真实出处、缓存生效）。
- 回归 `scripts/regress-p3.js` **PASS 14 / FAIL 0**；契约自检 `scripts/check-contract.ps1` **PASS 14 / WARN 0 / FAIL 0**。
- **下一步该干的**：① 重跑编码自检 → ② 提交 + 推送 → ③ 重写零 M 白话版（用户本人发）→ ④ 新交接（本文件）。

## 2. 改了什么

### 后端

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `server/src/services/advice.js` | **新建**。`buildAdvice(req)`：知乎搜索 → 前 6 条候选（正文截 700 字）→ 直答 `zhida-thinking-1p5` → 解析 → 编号映射回真实 URL → `verdict/summary/plan/caveat/sources`。两层缓存 `advice:pool:<问题>` 与 `advice:full:<问题>:<语气>`，各 5 分钟 | 新主线核心 |
| `server/src/routes/advice.js` | **新建** `POST /api/advice`，返回 `data` + `meta.cached` / `meta.warnings` | 新主线入口 |
| `server/src/zhihu/endpoints.js` | 新增 `zhihuSearch(query, count=10)` | 上游「搜相似困境」 |
| `server/src/index.js` | 挂 `adviceRouter` | 路由 |
| `server/src/session.js` | 删 6 个会话函数 | 认知闭环下线 |
| `server/src/routes/cognition.js`、`services/{terrain,tension,situation}.js` | **删除**（4 个文件） | 认知闭环下线 |
| `server/src/services/cards.js`、`services/retrieval.js` | 去掉对已删 service 的引用 | 跟着改 |

### 前端

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/js/app.js` | 「问它」面板 `renderAskPanel` / `verdictLabel` / `askAdvice` / `renderAdvice` / `switchToAskTab` / `srcNote`；`state` 改 7 字段；底栏第四块「问过它 N 次」；`init()` 调 `renderAskPanel()`；给 `PetCompanion` 注入 `ask` 回调共用缓存；**新增 `revealAskResult(box)`** | 主线换面板 + 修滚动 bug |
| `web/js/api.js` | 新增 `getAdvice({question,tone})` | 接口层 |
| `web/js/pet-companion.js` | 桌宠对话接后端；`resolveLocal()` 答不了返回 null；`adviceText()` / `adviceLinks()` | 「特化桌宠陪伴功能」 |
| `web/js/onboarding.js` | 7 步 → 4 步；`showDone` 统计改 favorites/asked/sources | 引导跟着主线改 |
| `web/js/demo.js` | 6 步新演练脚本 | 演练跟着主线改 |
| `web/js/quiz.js`、`web/js/terrain.js` | **删除** | 认知闭环下线 |
| `web/index.html` | **一个字没动**（队友地盘） | D65 目录所有权 |

### 契约与脚本

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/api.json` | v0.7，**11 路径**（删 4 + 加 1）；删 19 schema，加 `AdviceRequest/AdviceVerdict/AdviceStep/AdviceSource/AdviceData/AdviceResponse`；`SourceCard.kind` 去掉 `situation_question`；`AdviceStep.source_indexes` 描述改正 | 接口真相源 |
| `contracts/ui-contract.json` | v2，**33 id / 4 class / 1 attr**；释放 6 个认知闭环钩子；加 `ask-input`/`ask-result`/`btn-ask`/`pc__links`/`data-ask-example` | 界面契约 |
| `contracts/tone.json` | **一个字没改**（14 句） | P1 纪律 |
| `scripts/check-contract.ps1` | 第 11 项重写 + 新增「已撤销的认知闭环接口又回来了」检查 | 自检 |
| `scripts/regress-p3.js` | **整体重写**：删认知闭环那几拍，换「问它」整链路 + 「守卫」接口下线检查 + 「出处对账」+ 「再问一次命中缓存」 | 回归 |

### 文档

| 文件 | 改了什么 |
| --- | --- |
| `docs/decisions.md` | D29 结论 2 标「已撤销」；**新增 D66 完整条目**（背景 / 队友原话 / 三问拍板 / 8 条决定 / D29 七条结论存活对照表 / 两条实测结论 / 两条不能放松的结论 / 依据 / 状态 / 未做待人清单） |
| `docs/status.md` | 时间戳改 12:35 + 顶部「主线已换」提示；新增 B32（换主线）、B33（「问它」链路实测）；制作阶段总表 P4 行划掉、合计 55→43；产品结构图换 D66 现行版；硬约束 #3 作废；下一步加第 12 条 |
| `docs/产品说明计划书.md` | v0.1 → **v0.2**：§一 一句话重写；§2.2 区别句重写（标【待人审】）；新增 §2.4「问它」怎么用知乎能力；§3.2 重写；§4.1 能力表；§5.1 API 14→11；§5.2 契约 v0.6/14→v0.7/11；§5.3 失败语义表；§5.5 取舍表加认知地图与 JeV 两行；§5.7 整节替换 |
| `docs/分工-视觉与功能.md` | §0 表加 D66 变更提示；钩子数 39→33 / 44→38；`fracture-*`→`ask-*`；队友交付物表 P4 标【D66 已撤销】+ 新增「删掉两个失效按钮」 |
| `docs/P1-三件产出.md` | §1.2 重写；§2.3/§2.4/§2.5 按小节整体替换；§2.6 末尾旧表换成新主线 3 句固定文案；§2.7 加 D66 作废提示；§三 静帧 2 标【D66 已下线，待人拍板重画】；顶部加 D66 横幅 |
| `web/README.md` | 顶部 D66 横幅；接口 14→11；演练口径改新链路；目录结构表加 `pet-companion.js`/`onboarding.js`、删 `quiz.js`/`terrain.js`；视觉语言段地形配色那句作废；「调了哪些接口」整节重写；「交接给队友」取舍改写；已知问题 4/6/7/8 条更新；**新增「第七轮」新主线实测记录** |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：把格式要求（JSON 或标记式）放在 **system 消息**里，让模型按格式返回。
  **结果**：`zhida-thinking-1p5` 和 `zhida-fast-1p5` **两个都无视**，自由发挥长文、完全不按格式。
  **结论**：**格式指令必须和材料一起写在 user 消息里** —— system 只放角色 + 原则。
  最终方案：system（角色+原则）+ user（`FORMAT_INSTRUCTIONS` + 材料 + 问题），一次就完美听话。

- **尝试**：给直答加 `response_format: {type:'json_object'}`。
  **结果**：**被上游忽略**（参数传了，返回照样是自由文本）。
  **结论**：别再指望这个参数。改用「标记式输出 + 容错解析器」：
  `parseMarked()` 容错（Markdown 粗体 / 全半角冒号 / 编号位置 / `[1,3]` 引用），
  保留 JSON 兜底 `parseModelJson()`，解析失败自动重试一次（`RETRY_PREFIX` + temperature 0）。

- **尝试**：用 `zhida-agent` 拿真实知乎链接。
  **结果**：**给不出真实链接**（编的）。
  **结论**：直答是「改写者」不是「检索者」→ **出处字段一律来自上游接口**，
  模型只回**编号**，后端把编号映射回真实 URL。

- **尝试**：想用「问题发现」当「搜相似困境」的上游。
  **结果**：额度只有 **100/天**，太紧。
  **结论**：改用 **`zhihu_search`（5000/天）**。

- **尝试**：在答案渲染完就完事，不做任何滚动处理。
  **结果**：用户点完「让它帮我想想」**以为没反应** —— 工作台是「固定高度 + 内部滚动」窗口
  （`web/index.html:225` 的 `.app-frame__body`），答案落在窗口内部滚动区，页面滚动看不到。
  **结论**：必须主动 `scrollIntoView`。已做 `revealAskResult(box)`，
  成功/空/异常三个分支都调；`scrollMarginBottom='96px'` 避开右下角悬浮桌宠。

- **尝试**：让模型给**整体**引用列表，然后自己给每步配依据。
  **结果**：实测发现**模型确实逐条给了**（每步 refs 不同，如 `[2,6]` / `[5]` / `[1,6]`）。
  **结论**：契约里 `AdviceStep.source_indexes` 的旧描述是错的，已改成
  「逐步骤优先：模型给某一步标了编号就用它；没标的退回到整体引用列表」。
  `bindSteps()` 就是这个逻辑。

- **尝试**：写 `docs/P1-三件产出.md` §2.6 旧表替换时用 `edit` 工具传长段落。
  **结果**：**old_string 不匹配失败**（文件里那段的空格/换行和我记的不一样）。
  **结论**：长段落替换改用 `.ctx/splice-p1.mjs` 那种**按小节标记 splice 的 Node 脚本**；
  `edit` 只适合短、唯一的锚点。（另：`edit` 工具的参数名是 `new_string`，写成 `newString` 会报校验错。）

- **尝试**：用 `run_script` 的 `page.evaluate` 在页面里取答案全文。
  **结果**：**本轮 `page.evaluate` 不回传结果**（页面内取数不可用）。
  **结论**：改用 `mcp_browser query kind=text`（传 `selector:'#ask-result'`）读答案全文。

- **尝试**：在 18801 上继续跑回归，但服务已死。
  **结果**：`fetch failed` —— **服务 1 小时自灭**（预期内，不是 bug）。
  **结论**：`fetch failed` 先怀疑服务自灭，先看 `/api/quota` 或 `/api/health` 探活。

## 4. 下一个 AI 接手前必须知道的事

**当前坏掉 / 没修的**

- **本次改动全部未提交、未推送**。`git status` 里有 22 个 `M`/`D` + 2 个 `??`。
  提交前**必须**先 `git fetch origin`，**禁 `git add -A`**，一律 `git add -- <显式路径>`。
- **`.ctx/current.md` 必须先 read 再写**，只写一行 `Context: <理由>`（hook 自动填进 commit message，提交后清空成 0 字节）。
  **Context 必须由人给，AI 不许代写**；本仓库公开，只写结论式理由，**禁止抄聊天原文**。
- **零 M 白话版必须重写**（`docs/队友对齐清单.md`）—— 当前那版还要求队友做 P4 真 3D 推镜 + 认知地图，**已过期不能发**。
  要去掉 P4、加新主线、解释**为什么用直答而不是 JeV**、并提醒队友删 `index.html` 里的
  「看一次断层」「看认知版图」两个按钮。**用户本人发。**
- **`web/index.html` 里仍留着 `btn-tension` / `btn-terrain`**（`:239/:240`）—— 队友地盘，我们没绑 handler，需要请队友删。
- **右下角悬浮桌宠（`.pc`）会压住工作台右下角按钮** —— 本次靠 `scrollMarginBottom:96px` 绕开，属队友 CSS 事项，未正式提出。
- **编码自检本轮还没重跑**（改了 `web/js/app.js`、`contracts/api.json`、`scripts/regress-p3.js`、5 个 docs、`web/README.md`）。

**必须先跑的命令**

```powershell
cd 'C:\Users\steam\Desktop\从心'

# 本地带密钥起服务（18801；端口别用 18787，本机绑不上）
$env:PORT='18801'; $env:HOST='127.0.0.1'
$env:ZHIHU_ACCESS_SECRET = [System.IO.File]::ReadAllText("$HOME\.zhihu-cli\access_secret").Trim()
node server/src/index.js

# 契约自检（期望 PASS 14 / WARN 0 / FAIL 0）
powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1

# 回归（默认 base 18787，必须带 --base）
node scripts\regress-p3.js --light --base http://localhost:18801
node scripts\regress-p3.js        --base http://localhost:18801

# 编码自检
node .ctx\check-encoding.mjs <files...>
```

**坑**

- **bash 里「先 `cd` 再写文件/删除」会被本地安全策略拦** → 用 write 工具落文件、命令不带 `cd`。
- **`.ps1` 必须 UTF-8 with BOM**；`.md`/`.json` UTF-8 无 BOM、纯 LF；写完扫 `U+FFFD`。
- **PowerShell `Get-Content` 读中文乱码** → 用 `[System.IO.File]::ReadAllText($f,[System.Text.Encoding]::UTF8)` 或 read 工具。
- **`node -e` 在 PowerShell 里内层引号被吃掉**；ESM 临时脚本写 `.mjs`（`.cjs` 是 CommonJS）；仓库内脚本写 `.js`（根 `package.json` 有 `"type":"module"`）。
- **浏览器缓存 `web/js/app.js`** → 验前端改动必须开新标签页或加 `?v=xxx`。
- **契约自检会扫密钥** → 假密钥也不行；公开仓库里连「故意写错的密钥」都不能以 `XXX_SECRET=...` 形态出现。
- **`/api/health` 存在但探活用 `/api/quota` 更稳**；服务 1 小时自灭。
- **交付包纪律（D63）**：**不要主动产出或交付「交付包 / 发布包 / 上传包」**，
  只有用户明确要求时才能做；**禁主动跑 `make-delivery.js` / `predeploy-check.js`**。
  打包、上传、发布各自独立授权。**本项目至今没产出过对外 ZIP。**
- **`.ctx/` 已 gitignore** —— 收尾时删临时件：`probe-zhihu-search.mjs`、`app-ask-section.js`、
  `splice-app.mjs`、`scan-hooks.mjs`、`check-encoding.mjs`、`surgery-api.mjs`、`probe-zhida*.mjs`（4 个）、
  `advice-out.json`、`splice-p1.mjs`。
- **GitHub 链路时通时不通**：DNS 解析到 57.155.223.240，TCP443 能建连但 TLS 被 reset；SSH22 banner 被拒；
  Clash Verge 只有 `clash-verge-service`（无代理端口）。**开前端即可恢复**。
  推送命令：`git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=0 -c http.lowSpeedTime=600 push origin main`。
- **Windows 删除规则**：`rm -- "<绝对路径>"`（转发到 mavis-trash），**必须是 targets-only 的单条命令**。

## 5. 下一步（按优先级）

1. **重跑编码自检**（本轮改了 8 个文件）→ `node .ctx\check-encoding.mjs <files...>`
2. **提交 + 推送**（网络不稳，多试几次；禁 `git add -A`；每次提交前重填 `.ctx/current.md`）
3. **重写零 M 白话版** → 用户本人发给队友（内容要点见 §4）
4. **新交接文档** → 已在 `docs/handoffs/2026-11-24-1500-mainline-switch-to-ask.md`（本文件）
5. **删 `.ctx/` 临时件**
6. **AI Works 上传 401** → 用户在自己 Chrome/Edge 手动传，**12-05 10:00 前必须解决**

## 6. 需要人拍板的事

1. **P1 台词逐句人审**（还没做）。
2. **新主线用不到的五句台词**（`mirror` / `fracture` / `question` / `bridge` / `insufficient`）**去留要拍板**
   —— `contracts/tone.json` 的 14 句**一个字都不能由 AI 自行增删**。
3. **新主线 3 句前端固定文案怎么处置**（不在 14 句目录里）：
   「有想不通的事就说一声，我上知乎替你翻翻。」「我去知乎上找找，看有没有人遇到过一样的。」
   「这次没找到能对得上的。我不给你一个查无出处的答案。」→ 加进目录 / 就当前端固定文案 / 改写？
4. **计划书 §2.2 区别那句 + §三 数字表述**（已标【待人审】）。
5. **静帧 2 要不要重画**（画的是认知地图 + 断层，已下线）→ 重画 / 并进静帧 1 / 本期不做？
6. **是否 force-push 重写 `0061915` 的 Context**（共享 main，会打断队友，需点头）。
7. **队友说的「新分支」具体指哪个** —— 要他自己说清。
8. **队友的 PR 由谁合、什么时候合**（仓库至今 0 个 merge commit；约定第一单我们陪跑）。
9. **P6 动画节奏 / 文案 / 排版** —— 等队友提 ≤5 条。
10. **AI Works 上传 401** —— 平台侧问题（`signature verification failed`，code 10201，126 字节对照包同样失败），需用户手动传。
11. **部署专用 Access Secret** → 用户申请后存 `C:\Users\steam\.zhihu-cli\access_secret.deploy`。
12. **问赛事组**：「12-04 前公网链接」是硬规则还是自定余量；12-07 是提交截止还是决赛路演日。
13. **「发布项目」按钮**（最终不可逆）—— 要动作前 `ask_user` 确认。
14. **审核声明最终填「是/否」**（12-05 拿 OAuth 凭证后定）；封面是否上传；D10「可安装 PWA」补不补；是否填「站外链接 / GitHub 仓库」。
15. **打开 Clash Verge 前端** → 之后可写本机 `http.proxy`（**不提交**）。
