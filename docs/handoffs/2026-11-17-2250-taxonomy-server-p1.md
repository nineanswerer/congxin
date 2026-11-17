# 交接：分类体系进契约层 + server/ 骨架跑通 + P1 三件产出起草

- **时间**：2026-11-17 22:50
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `c98dcac`（已推送 `origin/main`）
- **本次目标**：按用户给的顺序做三件事——① 起 P1 三件产出（AI 起草、人审）；② 起草分类体系 B14 初版（拿真实收藏/关注数据跑）；③ 按 `contracts/api.json` 写 `server/` 后端骨架（真调知乎出 JSON）。用户同时交代：**队友联系不上，别等他，往前推**；零 G / 零 H 用户自己发。

---

## 1. 现在处于什么状态

- **三件事全部完成**：B14 分类体系已进契约层并进自检；`server/` 骨架已跑通并真调知乎；P1 三件产出已起草（**文本等用户拍板，静帧已出图**）。
- **能跑的**：`server/` 里 `GET /api/health`、`/api/quota`、`/api/behavior/favorites|followees|contents` 已实现，`node server/scripts/smoke.js` 实跑通过；`node server/scripts/classify-check.js` 13/13 一致；`scripts/check-contract.ps1` **PASS 12 / WARN 0 / FAIL 0**。
- **不能跑的**：契约里另外 4 个接口（`POST /api/behavior/tension`、`POST /api/situation/question`、`GET /api/terrain`、`POST /api/terrain/answer`）**一行代码都还没写**——P1 Demo 脚本里 3:00 之后的 1.5 分钟全靠这 4 个接口。
- **还差什么**：P1 的**内容**必须用户拍板（见第 6 节）；`web/` 前端还没开始（归队友）。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/taxonomy.json`（新） | 主题 6 类 + 论证结构 5 类 + 关键词规则 + `unknown` 兜底 + `known_limits` | 分类是跨两人的接口（后端算、前端显示），口径必须只有一份，放契约层 |
| `contracts/api.json` | `CategoryBucket` 加 `score` / `tied_with`；`focus` 加 `tied` / `tied_with`；`argument_structure` 加 `tied` / `tied_with` | 同分时第一名只是数组顺序的产物，必须能如实说出口 |
| `contracts/contract.json` / `CONTRACTS.md` | 同步 taxonomy 与 api 规则（该目录要求同批改） | 契约层变更规则 |
| `docs/分类体系-B14.md`（新） | 分类清单 + 每类占比 + 判定规则 + 回归用例 + 已知限制 | 给人看的说明（机器可读在契约层） |
| `server/**`（新，全套） | 鉴权 + 退避重试 + 限流 + TTL 缓存 + 去重 + 分类 + 归一化 + 4 个路由 | 用户点名的后端骨架；真调知乎出 JSON 就算过 |
| `server/scripts/classify-check.js` | 基线从 12 条扩到 **13 条**（加创作 1 条），锁的是当前规则输出 | 规则一改就红，红了就是提醒人重新拍板 |
| `scripts/check-contract.ps1` | 新增**第 12 项**（taxonomy 完整性）；修密钥扫描对 `process.env.` 的误报 | taxonomy 进了契约层必须能自检；`accessSecret: process.env.X` 被判泄露会让自检长期红着 |
| `docs/decisions.md` | 新增 **D30** | 记录口径修正 + 同分/截断底线 + 扫描规则变更 |
| `docs/status.md` | 已完成段补 server/ + taxonomy + 自检 12 项；B14 行改状态；下一步重排 | 进度同步 |
| `docs/P1-三件产出.md`（新） | 一句话场景 ×2（各 3 个候选）+ 5 分钟逐秒脚本 + 静帧说明 + **6 件待拍板** | P1 主交付，等用户审 |
| `docs/p1-frames/*.html` + `*.png`（新） | 两张 1600×900 静帧（HTML 稿 + 无头 Chrome 出的 PNG） | 静帧用官方刘看山真素材搭，不自绘角色 |

**三次提交**（远端已同步）：
- `8277812` `feat(taxonomy)` — 分类体系进契约层
- `44da80d` `feat(server)` — server/ 骨架 + 自检改动
- `c98dcac` `docs(status)` — D30 + 进度同步 + 出处标题修正

---

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `edit` 工具改 `docs/decisions.md`，`old_string` 用了跨 50 行的整块。
  **结果**：匹配失败（`Could not find the exact text`）。中途还试过用 `node -e` 拼字符串追加，**PowerShell 里的引号转义把 JS 模板字符串打断了**，报 `Expected unicode escape`。
  **结论**：**长文本追加不要用 `node -e` 内联**。改用 `edit` 工具配一个**短且唯一的锚点**（如上一条决策的最后 2 行）就能一次成功。`node -e` 只适合跑短命令。

- **尝试**：在 `cd` 之后用 `Set-Content` 写临时调试脚本到相对路径。
  **结果**：`Permission denied for bash: Local hard safety policy blocked bash: write/delete targets cannot be verified safely after a command working directory change.`
  **结论**：**`cd` 之后不要写/删文件**。写文件用 `write` 工具（绝对路径），删除用**单独的顶层** `rm -- "<绝对路径>"`（同一行里夹别的命令会被拦）。

- **尝试**：用 `rm` 删临时脚本时写成 `rm -- <path>` 并跟了别的命令。
  **结果**：`Windows recoverable-delete plan requires the targets-only trash marker.`
  **结论**：删除必须是**独立的一行顶层命令**，目标给绝对路径、字面量。

- **尝试**：第一版静帧 2 用 `rotateX(56deg)` 把整层压成斜面。
  **结果**：**层里的中文全被压扁读不了**，引文框还被右侧面板盖住，第三层被底栏切掉。
  **结论**：2.5D 要**浅透视**（`rotateX(12deg)` + `translateZ` 拉开层差），**不要用大角度压整个平面**；文字必须正着放。

- **尝试**：第一版静帧 1 的「正/反」角标。
  **结果**：两张卡都只显示一个角标，且叠在右边那张卡上。
  **原因**：`.card` 没设 `position: relative`，绝对定位的角标落到了 `.split` 上，两张卡的角标重叠。
  **结论**：绝对定位子元素前**先确认父级有 `position`**。

- **尝试**：判断「痛点式 vs 步骤式同分」时，先在 `distribution()` 的**桶之间**比 `count`/`score`。
  **结果**：**判不出来**。因为 `distribution()` 是**每条内容只进一个桶**，同分的两类里只有一个桶有内容。
  **结论**：同分必须在 **`classify()` 层**（同一条内容对多个类各打多少分）取，`distribution()` 再把它聚合上去。教训：**先看清数据结构再写判定**。

- **尝试**：用 in-app Browser 面板截图出静帧。
  **结果**：**改用本机 Chrome 无头模式**——`C:\Program Files\Google\Chrome\Application\chrome.exe` 存在，直接 `--headless=new --window-size=1600,900 --screenshot=...` 就能出**精确 1600×900** 的图，不用迁就面板尺寸。
  **结论**：**本机要出静态图，优先找 Chrome/Edge 无头，不要用 Browser 面板。**

- **发现（不是失败，是纠正）**：`docs/分类体系-B14.md` 原先写创作那条是「痛点式」，但**规则实跑判的是「步骤式」**（命中「然后」「流程」）。文档与代码不一致。
  **处理**：收紧关键词表——步骤式删「然后」「方法」（中文连接词，几乎每段都有，留着会到处误命中）、痛点式把裸「缺」换成「缺少」并加「没用」（裸「缺」会误命中「缺省值」「缺陷」）。
  **诚实边界**：收紧后结果是「痛点式」，但它**与「步骤式」同分（各 1 分）**，只是类目数组顺序在前——**弱结论，已在文档、`sample_note` 和 `tied` 字段里明写**。
  **教训**：**收紧规则的理由是「文档与代码不一致」，不是「想让某个样本好看」**——这条已写进 D30。

---

## 4. 下一个 AI 接手前必须知道的事

- **必须先跑一遍**（环境密钥在仓库外，**只在本机**，不外传给队友、前端不碰）：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  powershell -ExecutionPolicy Bypass -File 'scripts\check-contract.ps1'   # 期望 PASS 12 / WARN 0 / FAIL 0
  cd server
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  node scripts/smoke.js            # 真调知乎四接口
  node scripts/classify-check.js   # 13/13
  ```
- **中文输出必须走 Node 或写文件后再读**，**绝不能从 PowerShell 控制台读**（按 ANSI 显示成乱码）。本项目已经因此误标过一次收藏标题和知乎问题标题。
- **`edit` 工具多行 `old_string` 不可靠**：≤3 行的短块 100% 成功，大段拼接改用短锚点或整文件 `write`。
- **`.ps1` 必须是 UTF-8 with BOM**；用 `edit` 改现有 `.ps1` 时 BOM 会保留，新增的 `.ps1` 要手动转码。
- **Git 操作**：工作区可能有**另一个 AI 会话并发提交**（这次就撞见过 `eaf3c7f`）。**提交前先 `git fetch`**，并且**禁止 `git add -A`**（工作区有 255 个并行会话的中间产物），一律 `git add -- <显式路径>`。
- **密钥扫描规则刚改过**：正则现在**明确排除 `process.env.` 取值**（否则 `server/src/config.js` 一直误报）。改这条规则时**必须重跑回归**——3 个真实泄露写法（裸字符串 / 带引号长串 / 等号无引号）必须仍被判泄露。
- **静帧重出图的命令**（改了 HTML 之后）：
  ```powershell
  & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --disable-gpu --hide-scrollbars `
    --force-device-scale-factor=1 --window-size=1600,900 --virtual-time-budget=4000 `
    --screenshot="C:\Users\steam\Desktop\从心\docs\p1-frames\frame-2-terrain-fracture.png" `
    'file:///C:/Users/steam/Desktop/%E4%BB%8E%E5%BF%83/docs/p1-frames/frame-2-terrain-fracture.html'
  ```
  ⚠️ URL 里的中文目录要 percent-encode（`从心` → `%E4%BB%8E%E5%BF%83`）。
- **要改别人的东西先看 `docs/协作规范.md` 的「目录所有权」**：`web/` 与 `assets/` 归队友 `5zdz5`，`server/` 与 `contracts/` 归 nineanswerer，`docs/status.md` 与 `README.md` 共享走 PR。
- **对外动作**（发消息给队友、发布部署、改报名信息、提交作品）**必须用户明确授权**才能做。

---

## 5. 下一步（按优先级）

1. **🔴 等用户拍板 P1 的 6 件事**（见第 6 节）——`docs/P1-三件产出.md` 已列好待拍板清单。拍板后：把定稿写进 `docs/决策稿-方向拍板.md` 或新建 `docs/P1-定稿.md`，并同步队友（零 I 里那个 **82% 是示例**，真实值是 44% 或 67%，**口径要统一**）。
2. **🔴 补齐契约里剩下的 4 个接口**：`tension` / `situation/question` / `terrain` / `terrain/answer`。P4 认知闭环全靠它们，**不能拖到 P4 才开始**。按 D29 结论 5，情境题要复用主流程「知乎补观点」的检索链路。
3. **🔴 零 G / 零 H 由用户自己发**（用户已确认，AI 不参与）——发完把 `docs/队友对齐清单.md` 的状态同步掉。
4. **P2 收口**：`server/` 最小闭环要能命令行跑通 `question_recommendations → question_answers → 卡片`，`web/` 能显示卡片和出处链接。
5. **B14 三件事等队友有空确认**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）——**未确认前 `taxonomy.json` 的 `status` 保持「初版」，不许写「已冻结」**。
6. **B10 需求验证（3—5 人试用）**：11-28 前要约到人。**B4 App ID / App Key**：12-05 创建项目后才分配。
7. **P7 审核是外部依赖**：正式公网链接必须 12-04 前拿到，总表已把 P7 排到 11-30。

---

## 6. 需要人拍板的事

1. **P1 一句话场景**：主流程选 A / B / C？照镜子选 A / B / C？——AI 推荐**主流程 A + 照镜子 A**，照镜子 C 降级成 4:05 的「补刀」拍。
2. **桌宠台词的口语度**：现在的台词偏「温和陪伴」，要不要更活泼（「我给你炫一个」）或更克制？
3. **Demo 素材**：要不要用**真实的知乎文档**（比如收藏里那篇 Ubuntu 装机教程）当拖入的 PDF？真实素材更硬，但内容偏技术、跟「报告」的叙事不搭。
4. **断层那句话的主语**：「你不是没有体系，你是一遇任务就只做眼前那一步」是**断言**。要不要换成更留余地的一句（「我们先看看这是不是」）？
5. **⚠️ 口径不一致要修**：已发给队友的**零 I** 里写的是「你收藏的 **82%** 是 Y」——那是**示例数字**，真实值是 **44%**（工具与环境）或 **67%**（工具+工程方法两类合计）。最终稿用哪个，要跟队友说清楚，否则队友按 82% 去做前端。
6. **静帧要不要额外做一套「无刘看山」版本**：官方 IP **赛后禁商用**（本屆可用）。要不要提前备一套占位版以备赛后继续用？
7. **创作信号（n=1）在 Demo 里讲不讲**：讲显得诚实但弱；不讲又要说明为什么不讲。

---

## 7. 本次会话的诚实边界

- **数字全部来自真实账号实测**（`node server/scripts/smoke.js` 可复现），P1 文档与两张静帧里没有一处编造的数据或链接。
- **台词、节奏、镜头全是提案**，一句都还没拍板。
- **P1 Demo 脚本里 3:00 之后那 1.5 分钟涉及的 4 个接口还没写**——脚本是「要长成什么样」，不是「已经长成了」。
