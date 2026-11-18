# 交接：分类体系进契约层 + server/ 8 接口全通 + P1 三件产出拍板出图

- **时间**：2026-11-17 23:35
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `35703cc`（**已推送 `origin/main`**，本地与远端一致）
- **本次目标**：按用户给的顺序做三件事——① 起 P1 三件产出（AI 起草、人审）；② 起草分类体系 B14 初版（拿真实收藏/关注数据跑）；③ 按 `contracts/api.json` 写 `server/` 后端骨架（真调知乎出 JSON）。用户同时交代：**队友联系不上，别等他，往前推**；零 G / 零 H / 零 J 用户自己发。
- **中途追加**：用户拍板 P1 三件事后，**继续把契约里剩下的 4 个接口补齐并实跑通过**。

---

## 1. 现在处于什么状态

- **契约里的 8 个路径现在全部有代码、全部真调知乎跑通过**（`node server/scripts/smoke.js` + `node server/scripts/smoke-cognition.js`）。
- **P1 三件产出已起草并部分拍板**：场景 A/A + 口径 67% 已定并落盘；**台词与镜头仍待逐句审**（剩 4 件事）。静帧 ×2 已出图。
- **`web/` 前端一行都还没写**——这是最大的空档。后端全通 ≠ 产品完了。
- **自检 PASS 12 / WARN 0 / FAIL 0**（`powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1`）。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/taxonomy.json`（新） | 主题 6 类 + 论证结构 5 类 + 关键词规则 + `unknown` 兜底 + `known_limits` | 分类是跨两人的接口（后端算、前端显示），口径必须只有一份，放契约层 |
| `contracts/api.json` | `CategoryBucket` 加 `score` / `tied_with`；`focus` 与 `argument_structure` 加 `tied` / `tied_with`；`x-upstream` 补「问题发现大小写」实测 | 同分时第一名只是数组顺序的产物，必须能如实说出口 |
| `contracts/contract.json` / `CONTRACTS.md` | 同步 taxonomy 与 api 规则 | 契约层变更规则（同批改） |
| `docs/分类体系-B14.md`（新） | 分类清单 + 每类占比 + 判定规则 + 回归用例 + 已知限制 | 给人看的说明 |
| `server/**`（新，全套） | 鉴权 + 退避重试 + 限流 + TTL 缓存 + 去重 + 分类 + 归一化 + **会话存储** + 4 个行为接口 + **4 个认知闭环接口** | 用户点名的后端骨架；真调知乎出 JSON 就算过 |
| `server/scripts/classify-check.js` | 基线 12 → **13 条**（加创作 1 条） | 规则一改就红，红了就是提醒人重新拍板 |
| `server/scripts/smoke-cognition.js`（新） | 认知闭环四接口冒烟，含 404 分支 | 真调知乎跑通 = 过 |
| `scripts/check-contract.ps1` | 新增**第 12 项**（taxonomy 完整性）；修密钥扫描对 `process.env.` 的误报 | taxonomy 进契约层必须能自检 |
| `docs/decisions.md` | 新增 **D30 / D31 / D32** | 口径修正 + 4 接口落地 + 上游大小写事实 |
| `docs/status.md` | 已完成段、阻塞项、下一步同步 | 进度同步 |
| `docs/P1-三件产出.md`（新） | 一句话场景 ×2 + 5 分钟逐秒脚本 + 静帧 + 待拍板清单 | P1 主交付 |
| `docs/p1-frames/*.html` + `*.png`（新） | 两张 1600×900 静帧（HTML 稿 + PNG） | 用官方刘看山真素材搭，不自绘角色 |
| `docs/队友对齐清单.md` | **新增零 J**（修正 82% → 67%） | 已发出的零 I 里 82% 是随手写的示例数字，会让队友写错前端 |

**本次提交**：`8277812` taxonomy → `44da80d` server 骨架 → `c98dcac` D30/进度 → `fe9ba10` P1 起草 → `cb4066b` 认知闭环 4 接口 → `35703cc` P1 定稿 + 零 J + D31/D32（均已推送）。

---

## 3. 试过但没成的（**最重要，别省**）

- **`Query=MBTI` 连续返回 0 条**，一度以为是自己的代码写错了。
  **对照实验后确认是上游的事**：`Query=MBTI` 连测 3 次全 0，`Query=mbti` 连测 2 次稳定 5 条，同一时刻 `人格测试` / `认识自己` / `RAG` 都正常，额度 `question_discovery 98/100`——**不是额度问题，是上游字面匹配对大小写敏感**。
  **结论**：后端主查一次，**查不到才降级到小写再试一次**（不做并集，免得 `RAG`→`rag` 匹配到 `storage` 噪声），命中时写 `query_lowercase_fallback` 警告。
  **教训**：**上游返回空 ≠ 自己代码写错。** 先用不同写法做对照实验（大小写、中英文、同义词），再判断责任方。

- **密钥扫描把「契约字段 `answer_token` 直接赋上游字段」判成疑似泄露**（值长得像 16+ 位随机串）。
  **结论**：**不放松扫描规则**（密钥宁可误报也不放过），改代码写法——包一层 `tokenStr()`。
  **附带坑**：改完之后**注释里原样写出那个模式，自己把扫描器 trigger 了**；后来**交接文档里又写了一遍，同样 trigger**。
  **结论**：**文档和注释都参与扫描**——描述"某个模式"时不要原样贴出那个模式。

- **`to_layer is not defined`** —— `terrain.js` 里写了 `const toLayer = ...` 却在对象字面量里用 `to_layer`。
  **教训**：写派生规则前**先看清上游数据结构**。

- **分类分布桶里只有类目名、没有类目 id** —— 断层规则要按 id 匹配「上手型类目」，得先用 `taxonomy.json` 把 id 翻成名字。**第一版按 id 匹配，结果一条断层都出不来。**

- **第一版 2.5D 静帧用 `rotateX(56deg)` 压整个平面** —— **层里的中文全被压扁读不了**，引文框还被右侧面板盖住，第三层被底栏切掉。
  **结论**：2.5D 要**浅透视**（`rotateX(12deg)` + `translateZ` 拉层差），文字必须正着放。

- **第一版静帧 1 的「正/反」角标叠在右边那张卡上** —— `.card` 没设 `position: relative`，绝对定位落到了 `.split` 上。**绝对定位子元素前先确认父级有 `position`。**

- **用 in-app Browser 面板截图尺寸不可控** —— 改用本机 Chrome 无头 `--headless=new --window-size=1600,900 --screenshot=`，出**精确 1600×900**。**本机要出静态图，优先找 Chrome/Edge 无头。**

- **`edit` 工具多行 `old_string` 不可靠**（跨 50 行整块匹配失败）；`node -e` 内联长字符串会被 PowerShell 引号转义打断（报 `Expected unicode escape`）。
  **结论**：长文本追加用 `edit` 配**短且唯一的锚点**（如上一条决策的最后 2 行）；`node -e` 只跑短命令。

- **`cd` 之后写/删文件被安全策略拦**（`Permission denied for bash: ...after a command working directory change`）；`rm` 夹在别的命令里也会被拦（`requires the targets-only trash marker`）。
  **结论**：写文件用 `write` 工具（绝对路径）；删除必须是**独立的一行顶层命令**，目标给绝对路径、字面量。

---

## 4. 下一个 AI 接手前必须知道的事

- **必须先跑一遍**（密钥在仓库外，**只在本机**，不外传队友、前端不碰）：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  powershell -ExecutionPolicy Bypass -File 'scripts\check-contract.ps1'   # 期望 PASS 12 / WARN 0 / FAIL 0
  cd server
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  node scripts/smoke.js            # 四个行为接口
  node scripts/smoke-cognition.js  # 认知闭环四接口（会花 2—4 次问题发现 + 1 次直答额度）
  node scripts/classify-check.js   # 13/13
  ```
- **额度提醒**：直答 **100/天**、问题发现 **100/天**、用户数据 10000/天。演示前先查 `/api/quota`。
- **中文输出必须走 Node 或写文件后再读**，**绝不能从 PowerShell 控制台读**（按 ANSI 显示成乱码）。本项目已因此误标过一次收藏标题和知乎问题标题。
- **`edit` 工具 ≤3 行的短块 100% 成功**；大段拼接用短锚点或整文件 `write`。
- **`.ps1` 必须是 UTF-8 with BOM**；`edit` 改现有 `.ps1` 时 BOM 会保留。
- **Git**：工作区可能有**另一个 AI 会话并发提交**（这次撞见过 `eaf3c7f`）。**提交前先 `git fetch`**；**禁止 `git add -A`**（工作区有并行会话的中间产物），一律 `git add -- <显式路径>`。
- **推 GitHub 偶发 `Connection was reset` / `Failed to connect to port 443`** —— 重试即可（这次后台重试循环第 1 次就成功）。
- **静帧重出图**（改了 HTML 之后）：
  ```powershell
  & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --disable-gpu --hide-scrollbars `
    --force-device-scale-factor=1 --window-size=1600,900 --virtual-time-budget=4000 `
    --screenshot="C:\Users\steam\Desktop\从心\docs\p1-frames\frame-2-terrain-fracture.png" `
    'file:///C:/Users/steam/Desktop/%E4%BB%8E%E5%BF%83/docs/p1-frames/frame-2-terrain-fracture.html'
  ```
  ⚠️ URL 里的中文目录要 percent-encode（`从心` → `%E4%BB%8E%E5%BF%83`）。
- **目录所有权**（见 `docs/协作规范.md`）：`web/` 与 `assets/` 归队友 `5zdz5`；`server/` 与 `contracts/` 归 nineanswerer；`docs/status.md` 与 `README.md` 共享走 PR。
- **对外动作**（发消息给队友、发布部署、改报名信息、提交作品）**必须用户明确授权**。
- **静帧用官方刘看山素材**（`assets/kanshan/*.webp`，透明底动画 sprite）。**赛后禁商用**，本届可用。

---

## 5. 下一步（按优先级）

1. **🔴 P1 剩下 4 件事待用户审**（`docs/P1-三件产出.md` §4）：台词口语度、Demo 素材、断层断言语气、要不要额外做无刘看山版。
2. **🔴 零 J 待用户发**（`docs/队友对齐清单.md` 零 J）：修正 82% → 67%。零 G / 零 H 同样用户自己发。
3. **🔴 前端 `web/` 开局**（P3 主线）：后端 8 接口全通，队友可以对着 `contracts/api.json` 开工；**认知闭环的渲染（2.5D 地图 + 3D 推镜 + 问卷）完全在队友手上**。P3 必须在 **11-21** 收口。
4. **P2 收口**：`web/` 能显示卡片 + 出处链接；命令行跑通 `question_recommendations → question_answers → 卡片`。
5. **B14 三件事等队友有空确认**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）——**未确认前 `taxonomy.json` 的 `status` 保持「初版」**。
6. **B10 需求验证（3—5 人试用）**：11-28 前要约到人。**B4 App ID / App Key**：12-05 创建项目后才分配。
7. **P7 审核是外部依赖**：正式公网链接必须 12-04 前拿到，总表已把 P7 排到 11-30。

---

## 6. 需要人拍板的事

1. **P1 剩余 4 件事**（见第 5 节第 1 条）。
2. **断层那句话的主语**：「你不是没有体系，你是一遇任务就只做眼前那一步」是**断言**。要不要换成更留余地的一句（「我们先看看这是不是」）？
3. **Demo 素材**：要不要用**真实的知乎文档**（收藏里那篇 Ubuntu 装机教程）当拖入的 PDF？真实素材更硬，但内容偏技术、跟「报告」的叙事不搭。
4. **静帧要不要额外做一套无刘看山版本**（赛后继续用）。
5. **创作信号（n=1）在 Demo 里讲不讲**：讲显得诚实但弱；不讲又要说明为什么不讲。
6. **零 G / 零 H / 零 J 什么时候发**：三份都是对外动作，**用户自己发**，AI 不参与。

---

## 7. 本次会话的诚实边界

- **数字全部来自真实账号实测**（`node server/scripts/smoke.js` 可复现），P1 文档与两张静帧里没有一处编造的数据或链接。
- **台词、节奏、镜头仍是提案**，一句都还没拍板。
- **8 个接口都通了，但前端 `web/` 一行都还没写**。
- **创作信号只有 1 条样本**，论证结构是「痛点式」但**与「步骤式」同分**，是弱结论——演示时不要拿它当结论讲。
- **断层文案里的 67% 是「工具与环境 4 + 工程与方法 2」两类合计**；类目一改这个数就变。
