# 交接：「吵起来的两边」改成真的两方——后端 + 契约 + 前端（契约 v0.6）

- **时间**：2026-11-19 13:10
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `2035a14`（本轮提交紧随其后）
- **本次目标**：用户 2026-11-19 拍板「**改后端做成真两方**」→ 把「知乎上吵起来的两边」从
  **同主题的两个不同问题**改成**同一个知乎问题下的两条回答**，并把契约、前端、文档、测试一起改到位。

---

## 1. 现在处于什么状态

「吵起来的两边」现在**在数据层是真的了**：两张卡是**同一个知乎问题下的两条不同回答**。

- **后端**：`POST /api/cards` 新增**可选**参数 `same_question`（传 `true` → 同题多答；不传 → 行为一个字都没变）。
- **契约**：`contracts/api.json` **v0.5 → v0.6**（14 个路径**不变**），`contract.json` 的 `api_contract` 同步 + 规则 1 条。
- **前端**：`loadViewpoints()` 走同题模式；`renderViews()` 认出同题 → 面板标题「**同一个问题的两条回答**」，
  **问题标题只出现一次**，两张卡标成「回答 ①/②」，中间 VS 分界线。
- **额度**：同题两答**只碰 1 个问题 ≈ 1+1 次**，比默认模式（1+N）**省 1 次**。
- **实跑全绿**：接口（长期主义 → 同题两答）、默认模式回归（软件测试 → 3 个不同问题）、
  `server/scripts/smoke-cards.js`（新增断言）、浏览器（两张卡同题不同 `answer_url`）。
- **⚠️ 上游天花板（改不了）**：上游回答对象**只有 4 个字段**，**没有作者、没有立场**
  → 「**来自两个不同的人**」「**观点相反**」**仍然验证不了**；台词「它们说的是反的」仍属**视觉暗示**。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `server/src/services/retrieval.js` | 新增 `answersWithUrls(questionUrl, limit)`：取某个问题下**前 N 条带链接的回答**（一次上游调用本来就返回 3 条） | 同题两答要的是「同一个问题的多条回答」，`firstAnswerWithUrl` 只给第 1 条 |
| `server/src/services/cards.js` | 拆成两种模式：`buildTopicCards()`（默认，N 个不同问题）+ `buildPairCards()`（同题多答）；新增 `same_question` 参数；**回答缓存从「单条」改成「列表」**；新增 `makeCard()` 复用；空数据提示分模式 | 契约 v0.6 的实现；缓存改成列表后**两种模式共用同一次上游调用** |
| `contracts/api.json` | v0.5 → **v0.6**：`CardsRequest` 新增可选 `same_question`；`/api/cards` 描述补「两种模式」表；新增请求示例 `with_same_question` + 响应示例 `pair`；`x-contract` 升 v0.6 | 契约是跨两人的唯一真源，**契约要改就改契约 + 写 ADR** |
| `contracts/contract.json` | `api_contract.version` v0.5 → v0.6；`rules` +1 条（「吵起来的两边」必须是同题不同回答） | 机器可读那一份才是准的 |
| `docs/adr/ADR-0002-same-question-two-sides.md` | **新建 ADR**：背景 / 决策 / 备选 / **被否决的三个方案** / 后果 / 验证方式 | BOOTSTRAP 收工协议：「契约要改就改契约，并写 ADR」 |
| `web/js/api.js` | `getCards()` 加 `sameQuestion` → 请求体 `same_question` | 前端要能要「同题两答」 |
| `web/js/app.js` | `loadViewpoints()` 传 `sameQuestion: true`；`renderViews()` 重写：**认出同题** → 问题标题只出现一次 + 两张卡标「回答 ①/②」；**不是同题就不画 VS**，并把实话写在标题栏 | 没得比就不装；**界面只写可证的事实** |
| `web/css/app.css` | 新增 `.pairq`（同题两答的问题标题样式，带一条红竖线） | 问题标题要一眼看出是「这两张卡共用的题」 |
| `server/scripts/smoke-cards.js` | 新增第 3.5 步：断言**同题**、**不同 `answer_url`**、id 不同、出处三件套齐全；契约段加 `same_question` 断言；**顺手修掉文件里 2 个乱码字符** | 回归脚本要能守住这条不变量 |
| `docs/status.md` | 缺口条目 ⚠️ → ✅（含实跑证据）+ 新增「上游天花板」残留条目；契约版本 v0.5 → v0.6 | 文档纪律 |
| `docs/decisions.md` | 新增 **D37**（结论 1 参数 / 结论 2 额度账 / 结论 3 上游天花板 / 验证 / 状态） | 决策层只增不改 |
| `web/README.md` | 已知问题 #3 改写：从「🔴 要人拍板」改成「✅ 已做」+ 残留说明 | 事实要准 |
| `docs/队友对齐清单.md` | 零 K 第 ④ 条补 `same_question` 参数说明（**队友的 mock 要对得上**） | 对外文本由用户自己发，但内容要先改对 |
| `server/src/index.js` / `services/cards.js` / `routes/cards.js` / `server/README.md` | 版本注释 v0.5 → v0.6；`13 个路径 v0.4` → `14 个路径 v0.6` | 版本漂移要跟上 |

---

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 PowerShell 的 `Invoke-RestMethod` 直接发中文 JSON 去测接口。
  **结果**：后端收到的 `topic` 是 **`????`**（四个问号）→ 知乎搜不到 → 返回 `empty: true`，
  一度以为后端的同题模式写错了。
  **根因**：**PowerShell 5.1 把请求体按 ASCII 发出去**，中文全变问号。
  **结论**：测带中文的请求**必须自己编码**：
  `$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)` 再 `Invoke-RestMethod -Body $bytes -ContentType 'application/json; charset=utf-8'`。
  （另外：PowerShell 5.1 **不支持 `??` 运算符**，脚本里别写。）

- **尝试**：一个补丁脚本同时改 `api.json` 和 `contract.json`。
  **结果**：`api.json` 改成功了（7 处），`contract.json` **被我自己的断言挡住没写**——
  我以为 `api_contract.rules` 有 14 条，实际 13 条。
  **结论**：**断言要按真实值写**；一个脚本改多个文件时，**后半段失败不会回滚前半段**——
  宁可拆成两个脚本，各自带守卫。

- **尝试**：用 `write` 工具写「会生成 JS 代码」的补丁脚本。
  **结果**：脚本里的**反引号把模板字符串截断了** → `SyntaxError: Unexpected identifier`。
  同一次还发现**一个中文字被写成 3 个 `U+FFFD` 替换字符**（写回时静默损坏）。
  **结论**：**凡是要写含反引号的 JS，先把内容写成 `.md` / `.txt` 文件，再用 Node 读进来追加**；
  每次写完**立刻扫一遍 `U+FFFD`**（`([regex]::Matches($t,[char]0xFFFD)).Count`）。

- **尝试**：跨天之后直接调 `mcp_browser`。
  **结果**：`SKILL_REQUIRED`（浏览器技能凭证在压缩/换天后失效）。
  **结论**：**报 `SKILL_REQUIRED` 就重新 `skill` 加载一次**，别去猜别的。

- **发现（不是失败，但决定了这次能做成什么样）**：**上游回答对象只有 4 个字段**。
  2026-11-19 用 `server/scripts/probe-answer-shape.js` 打了原始响应，
  keys 恒为 `ContentType, ContentToken, Url, Summary` —— **没有作者名，也没有立场**。
  → 「同题两答」能做；「**来自两个不同的人**」「**观点相反**」**做不了**。
  → 面板只写「同题 · 两条真实回答」，**台词里的「它们说的是反的」仍属视觉暗示**。

- **被否决的做法（别再试）**：把上游返回的回答顺序当成「正反两派」。
  上游 \`question_answers\` 的顺序是**热度顺序，不是立场顺序**——
  11-19 实测拿到的那一对其实是同一问题的**两个不同角度**（「大脑睡眠时仍在工作」vs「俄罗斯方块睡眠实验」），
  **根本不是对立观点**。**拿热度当立场 = 编数据。**

---

## 4. 下一个 AI 接手前必须知道的事

### 4.1 目录归属（**以 `docs/协作规范.md` 为准**）

| 谁 | 范围 |
| --- | --- |
| `nineanswerer` | `server/`、`docs/decisions.md`、`contracts/`、`web/`（2026-11-18 起临时接管） |
| `5zdz5` | `assets/`、`docs/adr/`、`docs/handoffs/`、`web/`（暂时交出） |

> ⚠️ 本轮往 **`docs/adr/`** 写了 ADR-0002（该目录按分工表属 `5zdz5`）——
> 理由是 `prompts/BOOTSTRAP.md` 收工协议明写「**契约要改就改契约，并写 ADR**」，
> 而 ADR 用**唯一编号的新文件**、**没动任何已有 ADR**。**这一处越界等用户表态。**

### 4.2 必须先跑的命令

```powershell
# 0) 探端口（后台任务 1 小时会被回收）
foreach ($p in 18787,18788) { try { (Invoke-WebRequest "http://localhost:$p/" -UseBasicParsing -TimeoutSec 4).StatusCode } catch { "port $p DOWN" } }

# 1) 后端（8787 绑不上，必须换端口）
cd 'C:\Users\steam\Desktop\从心\server'
$env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
$env:PORT = '18787'; node src/index.js

# 2) 前端（零依赖）
cd 'C:\Users\steam\Desktop\从心\web'; node serve.js   # → http://localhost:18788/web/

# 3) 不耗额度的回归
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-tone.js   # 14 项
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-auth.js   # 25 项

# 4) 耗额度的卡片回归（会花约 2—4 次「问题发现」）
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-cards.js

# 5) 自检（期望 PASS 13 / WARN 0 / FAIL 0）
powershell -ExecutionPolicy Bypass -File 'C:\Users\steam\Desktop\从心\scripts\check-contract.ps1'

# 6) 提交（显式路径，禁 git add -A）
git add -- contracts/api.json contracts/contract.json server/src/services/cards.js server/src/services/retrieval.js `
  server/scripts/smoke-cards.js web/js/app.js web/js/api.js web/css/app.css docs/... 
```

**测带中文的接口（PowerShell 5.1 必须自己编码）**：

```powershell
$json = '{"topic":"长期主义","count":2,"same_question":true}'
$r = Invoke-RestMethod -Uri 'http://localhost:18787/api/cards' -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 40
```

### 4.3 坑

- **PowerShell 5.1**：中文请求体**必须 UTF-8 字节**；**不支持 `??`**；`Get-Content` 默认编码会毁中文（用 `-Encoding UTF8`）。
- **`write` 工具写含反引号的 JS 会截断模板字符串** → 先写成 `.md` 再用 Node 读入追加。
- **写完立刻扫 `U+FFFD`**（一个中文字会静默变成 3 个替换字符）。
- **契约补丁脚本的断言按真实值写**；一个脚本改多个文件时后半段失败**不会回滚**前半段。
- **`page.evaluate` 在这个 provider 上能用**（上一份交接说它不靠谱，**已撤销**）——
  是最快的断言/驱动手段；但**脚本体里直接调 `page.viewportSize()` 会报 `page is not defined`**。
- **浏览器活动标签会漂**：`open_tab` 后 `inspect` 看到的 URL 不一定是下一条 `run_script` 打到的页面
  → **先 `page.evaluate(() => location.href)` 确认**。
- **`page.mouse` 触发不了 HTML5 拖拽** → 合成 `DragEvent` + `DataTransfer`。
- **`POST /api/cards` 吃「问题发现」额度**：默认模式 N 张 ≈ 1+N 次；**同题两答 ≈ 1+1 次**；
  同主题 5 分钟缓存；**额度计数有延迟（跑完等 15 秒才变）**。
- **后台任务 1 小时上限**：两个服务会被静默回收 → 浏览器报 `ERR_CONNECTION_REFUSED`。
- **`git add -A` 被禁**：工作区有并行会话的中间产物。一律 `git add -- <显式路径>`；提交前先 `git fetch`。
- **上游额度每日 00:00 重置、不结转**。
- **`.ps1` 必须是 UTF-8 with BOM**；工作区行尾统一 LF。

### 4.4 硬约束（官方检查 9 条，摘要）

密钥不入源码/前端响应/日志/截图/视频；接口失败/额度耗尽/空数据给**真实提示**；禁止批量高频调用；**不得把 Mock 写成完成**；刘看山 IP **仅本届比赛期间可用**，赛后禁商用；**不自绘角色**。

---

## 5. 下一步（按优先级）

1. ✅ **`disagree` 台词已改**（用户 2026-11-19 拍板「改成『同一个问题，两条答案。我不替你选。』」）：
   `disagree` =「同一个问题，两条答案。我不替你选。」；
   同一拍上一句 `viewpoints`（原「知乎上吵起来的两边…」）**同样的超述**，一并改成
   「同一个问题的两条答案，我都带来了——原话，附链接。」
   → 同步改了 `contracts/tone.json`、`contracts/api.json` 里嵌的副本、`docs/P1-三件产出.md`、
   `docs/p1-frames/frame-1-pet-cards.html`（+ 重出图）。见 D38。
2. 🔴 **人亲手把 P3 闭环点一遍**（真实数据、不 mock）：拖一条收藏到桌宠 → 嚼 → 吐卡片 → 点出处 →
   **「知乎上大家怎么说」（同题两答）** → 照镜子 → 断层 → 出题 → 作答 → 地形 + 桥。**AI 已跑通并逐项取证**，
   但人还没手动点过——重点看**节奏**（5 分钟够不够）。
3. 🟡 **零 G / 零 H / 零 K 由用户自己发**——文本已改好（14 个接口 + 零 K 第 ④ 条含 `same_question`）。
   **只有零 I 真的发出去过。**
4. 🟡 **P1 台词 14 句逐句审**（`contracts/tone.json` 与 `docs/P1-三件产出.md` §二）——**只能人拍板**。
5. 🟢 **落版画面**（4:50—5:00）、**镜头动效**（吸入/飞出/推近/滑入/地图升起）没做；
   **Three.js 真 3D 推镜**留给队友（保命砍法里排最后）。

---

## 6. 需要人拍板的事

1. ~~**`disagree` 台词改不改**~~ → **已改**（用户 11-19 拍板，见第 5 节第 1 条与 D38）。
2. **共享区要不要走 PR**——`docs/协作规范.md` 说共享区改动走 PR，同一份文件又说「除文档」可直推 main；
   本轮沿用历史做法**直推 main**（含 `contracts/api.json`）。要不要把规范改成明确的说法？
3. **`docs/adr/` 的归属**——分工表划给 `5zdz5`，但收工协议要求契约改动必须写 ADR。
   本轮写了 **ADR-0002**（新文件，没动已有 ADR）。
4. **P1 台词 14 句逐句审**——AI 只能排版，不能替人定稿。
5. **B14 分类体系三件事**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）——等队友有空一起定；
   **未确认前 `status` 保持「初版」**。
6. **B10 需求验证（3—5 人试用）**——11-28 前要做，12-05—12-07 校园宣讲是现成渠道。
7. **B9 决赛是否赴深圳**——用户此前选「待定」。
