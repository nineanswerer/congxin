# 交接：桌宠语气做成可选项（契约层）+ P1 剩余 4 件事落文档

- **时间**：2026-11-18 12:07
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `349d3ac`（+ 待提交的文档批次）
- **本次目标**：把用户 2026-11-18 拍板的 4 件事落到代码与文档——① 语气做成可选项、默认温和陪伴；② Demo 素材用真实知乎数据不写死文档；③ 断层断言句保留不软化；④ 无刘看山版静帧本期不做。并把状态同步到 `docs/队友对齐清单.md` 的进度行与 `docs/P1-三件产出.md` 第四节。

## 1. 现在处于什么状态

- **后端 9 个接口全部有代码并真调知乎跑通**（本轮新增第 9 个 `GET /api/tone`）；`contracts/api.json` 升到 v0.3。
- **桌宠语气是跨两人的契约**：`contracts/tone.json` 是唯一真源（2 个语气 × **14 句**台词，`default: gentle`）；后端读它、前端从 `GET /api/tone` 取文案，**前端不许自己抄一份台词**。
- **P1 的 7 件事已拍板**（场景 A/A、67%、语气可选项、素材实时化、断言保留、无 IP 静帧不做）→ 决策记在 `docs/decisions.md` D33。**台词逐句与镜头仍待用户审**。
- **`web/` 前端一行都还没写**——P3 主线（11-21 收口）完全在队友手上。认知闭环的渲染（2.5D 地图 + 3D 推镜 + 问卷）也在他那边。
- **对手：零 G / 零 H 由用户自己发；零 J 暂缓发送（内容留在仓库不删）**；零 K（接口数 8→9 的增补草稿）**未发，等用户决定**。
- **自检 13 项实跑 PASS 13 / WARN 0 / FAIL 0**。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/tone.json`（新） | 2 个语气 × 14 句台词 + `default: gentle` + `line_keys` + 5 条规则 | 语气文案必须**只有一份真相**，后端与前端读同一个文件 |
| `server/src/tone.js`（新） | 契约读取器，读不到就**大声失败** | 照 `server/src/taxonomy.js` 的模式；不内置副本兜底（两份必漂） |
| `server/src/services/tone.js` | 重写：`resolveTone` / `line` / `petLines` / `toneList` / `toneCatalog` | 从契约读；`petLines` 所有 key 永远在，不适用的置 `null` |
| `server/src/services/tension.js` | `tone` + `pet_lines`，insufficient 分支显式门控 | 语气只影响台词，不影响断层判定 |
| `server/src/services/situation.js` / `terrain.js` | 接受 `tone`，返回 `tone` + `pet_lines` | 4 个认知接口形状统一，前端按 key 取 |
| `server/src/routes/cognition.js` | 透传 `tone`；**张力缓存键加语气** | 不加的话活泼请求会命中温和语气的缓存 |
| `server/src/routes/tone.js`（新）+ `server/src/index.js` | `GET /api/tone`（第 9 个路径）；health 加 `tone_version` / `tone_default` | 前端一次调完拿到切换器选项 + 全部台词（含没有专属接口的主流程台词） |
| `contracts/api.json` | v0.3；新增 `/api/tone` 路径、`ToneId`/`ToneOption`/`PetLines`/`ToneCatalog` 等 schema；4 个认知接口加 `tone` 入参与 `tone`/`pet_lines` 出参 | 契约是约束不是文档，改坏要被自检拦下 |
| `contracts/contract.json` / `contracts/CONTRACTS.md` | 新增 `tone` 块；接口数 8→9 | 契约层只增不改 |
| `scripts/check-contract.ps1` | 新增**第 13 项**（语气契约：默认必须 gentle、两个语气 14 句齐全、**台词里不许带数字**）；第 11 项同步到 9 接口并加验 `ToneId.default` | 默认语气是用户拍板过的，手滑改要被机器拦下 |
| `server/scripts/smoke-tone.js`（新） | **不消耗任何知乎额度**的语气全链路自检（14 项断言） | 语气是纯逻辑，改完能秒级回归 |
| `server/scripts/smoke-cognition.js` | 加语气对照断言：**事实逐字相同、台词不同**，越界就 `exit 1` | 这是「语气不越界」的可执行定义 |
| `docs/decisions.md` | 新增 **D33**（4 件事拍板 + 契约 8→9 + 留痕） | 人拍板的事要有据可查 |
| `docs/P1-三件产出.md` | 文首加 4 件已拍板；§二 台词全部对齐契约层、素材改「实时拉的真实收藏」；§三 写明无 IP 版不做；**§四 从「还需要拍板」改为「已拍板的 4 件事」**；§五 诚实边界更新 | 用户点名要改这一节 |
| `docs/队友对齐清单.md` | 进度行标注**零 J 暂缓 / 零 G·零 H 照原计划**、接口 8→9；零 J 标题改「暂缓发送」；零 I 处加「82% 是示例」警示；**新增零 K 草稿（未发）** | 接口数变了队友需要知道，但发不发由用户定 |
| `docs/status.md` | 已完成项 + B15 + 下一步 + P2/P4 行同步 | 状态页是唯一的进度真源 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：在 `contracts/api.json` 的 `info.description` 里用 `edit` 插一行接口表。
  **结果**：`SyntaxError: Bad control character in string literal in JSON at position 1128 (line 7 column 968)`。
  **原因**：`edit` 的参数里我打的是**真实换行**，而那行在 JSON 里必须写成转义序列 `\n`。真实换行落进字符串里就破坏了 JSON。
  **结论**：**改 JSON 文件里的字符串时，参数里要打 `\n`（两个字符），不要打真实换行**；改完立刻 `node -e "JSON.parse(...)"` 验一次。

- **尝试**：用同一个 `edit` 把 `/api/tone` 路径插到 `paths` 末尾，锚点取 `      }\n    }\n  },\n  "components": {`。
  **结果**：JSON 解析报 `Expected ',' or '}' after property value in JSON at position 43450 (line 1009 column 5)`。
  **原因**：锚点匹配到了 `/api/quota` 路径内部的闭合括号，把**该路径的收尾吃掉了**，新路径被嵌进了 `/api/quota` 里面。
  **结论**：在 JSON 里插路径这种操作，锚点必须**唯一且包含足够上下文**（比如带上 `"paths": {` 或下一个路径的 key）；插完必须回读文件确认括号层级，再跑 JSON.parse。

- **尝试**：把 `tone` 参数加进张力接口的缓存键。
  **结果**：第一次改的时候**漏了**——缓存键仍是 `tension:${sessionId}:${type}:${traits}`。
  **结论**：**任何影响响应体的参数都必须进缓存键**，否则会出现「换了语气拿到上一种语气的缓存」这种极难查的 bug。

- **尝试**：给 `edit` 的 `old_string` 里写带 emoji（✅）和中文全角括号的长段落。
  **结果**：有一次报 `Could not find the exact text`，但另几次**内容明显有差异也报成功**（工具似乎容忍模糊匹配）。
  **结论**：**改完关键文件必须回读确认**，尤其是 JSON 与 Markdown；长段落改成多个短锚点分别改更稳。

- **尝试**：想在 `contracts/tone.json` 里放「引用用户自己创作原话」的那句台词。
  **结果**：自己否掉了。
  **原因**：上游创作摘要**会被截断**，模板化会把不完整的引用说成完整的 → 违反「台词里不许写会变的引文」这条规则。
  **结论**：那句留在 P1 脚本里标注【实】，**不进语气目录**；要显示得由后端从创作信号取原文拼（属 P3）。

## 4. 下一个 AI 接手前必须知道的事

- **必须先跑**：`powershell -ExecutionPolicy Bypass -File 'C:\Users\steam\Desktop\从心\scripts\check-contract.ps1'` → 期望 **PASS 13 / WARN 0 / FAIL 0**。
- **语气回归（不耗额度，跑得快）**：`cd server; node scripts/smoke-tone.js`。
- **真调知乎回归（耗额度：问题发现 100/天、直答 100/天）**：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心\server'
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  node scripts/smoke-cognition.js
  ```
  注意：`smoke-cognition.js` 会跑两次 `buildTension`（gentle + lively），**上游调用次数翻倍**，但都在 `user_data 10000/天` 里，无压力。
- **`.ps1` 必须是 UTF-8 with BOM**（用 `edit` 改现有 `.ps1` 时 BOM 会保留；用 `write` 新建则要自己保证）。
- **仓库工作区行尾统一是 LF**；`core.autocrlf=true` + `.gitattributes` 的 `text: auto` 会在提交时归一化，`git diff --stat` 不会因此炸开，**不用手工改行尾**。
- **`edit` 的参数里 `\n` 是两个字符（转义序列），真实换行会落进文件**——改 JSON 字符串时这是最容易踩的坑。
- **密钥只在 `C:\Users\steam\.zhihu-cli\access_secret`**（仓库外、已 gitignore），只在本机，不外传队友，前端不碰。
- **禁 `git add -A`**：工作区有并行会话产生的中间产物，一律 `git add -- <显式路径>`；提交前先 `git fetch`。
- **`.ctx/current.md`** 提交后会被 hook 自动清空 —— **每次提交前都要重新写用户的原话**。
- **零 J 暂缓、零 K 未发**：这两个都是「内容已写好但用户没让发」的状态，**不要替用户发出去**。
- **接口数已从 8 变 9**：已发出的零 G 里写的是 8，零 K 草稿是增补。

## 5. 下一步（按优先级）

1. **P3 主线**：`server/` 产出**带出处的卡片 JSON**（`question_recommendations → question_answers → 卡片`），这是队友前端开工的依赖，也是自检第 9 条「不得把 Mock 写成完成」的落点。
2. **等用户审台词**：14 句在 `contracts/tone.json`，逐句对照 `docs/P1-三件产出.md` §二 的脚本拍板；用户改台词 → 改契约 → 跑 `smoke-tone.js` → 提交。
3. **B14 三件事等队友有空确认**（6 类够不够用 / 未归类在 UI 怎么显示 / 要不要进计划书）；未确认前 `contracts/taxonomy.json` 的 `status` 保持「初版」。
4. **B10 需求验证**：11-28 前约到 3—5 人试用。
5. **确认 App ID / App Key 是否已可获取**（B4，12-05 创建项目后才分配）。

## 6. 需要人拍板的事

- **零 K 要不要发**：接口数 8→9 + 语气接口 + 正确口径 67% 都在草稿里了，**发不发、什么时候发由用户定**。
- **零 J 什么时候发**：暂缓了，但零 I 里的 82% 仍是错的数，队友若先按 82% 写前端会白写。
- **14 句台词逐句是否通过**：目前是 AI 抄脚本 + 补齐的版本，**用户还没逐句审过**。
- **「零 I 的 82%」要不要直接改**：文件里保留的是已发原文（历史记录），所以只在旁边加了警示而没有改正文——用户若要改成直接写 67%，需要明确说一声。
