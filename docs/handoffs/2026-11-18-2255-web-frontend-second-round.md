# 交接：P3 前端第二轮——补 4 个缺口（真卡片 / 台词 / 拖拽 / 跨层桥）

- **时间**：2026-11-18 22:55
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `3661321`（本轮提交紧随其后）
- **本次目标**：用户 2026-11-18 22:0x 拍板「**只补 4 个缺口，不改形态**」（保留「工作台」形态，不改成脚本的「演出」形态）+「**主流程那张卡片换成契约里的真卡片**」→ 由 `nineanswerer` 在 `web/` 上补齐，并把已拍板的东西收尾（文档 / 决策 / 交接 / 自检 / 提交）。

---

## 1. 现在处于什么状态

`web/` 现在是**能演的第二版**：真实知乎数据、全程无 mock，`?demo=1` 演练 **9/9 步全过、0 报错**。

- **4 个缺口已补**：① 主流程卡片走 `POST /api/cards`（每张 = 知乎问题 + 真实回答 + **原回答 URL**）② 契约 14 句台词**全部用上** ③ 收藏可**拖到桌宠身上**开嚼 ④ **跨层桥**画得出来（实拍 3 座）。
- **回归**：完整演练 9/9；另单独验了「拖拽落桌宠」（`dragover` 亮起 → `drop` → 吐 3 张带出处的卡）、「`viewpoints` → `disagree`」两拍台词、跨层桥。
- **自检**：`PASS 13 / WARN 0 / FAIL 0`。
- **额度**：问题发现 **80/100（只剩 20）**，每日 00:00 重置、不结转。**一次完整演练 ≈ 11 次** → 今晚别再练了。
- **⚠️ 一个没做的缺口（要人拍板）**：「知乎上吵起来的两边」**目前不是真的两方**——`POST /api/cards` 的语义是「一个候选问题取一条回答」，拿到的是**同主题的两个不同问题**，数据层没验证观点相反；而契约台词写的是「它们说的是反的」。**修法很便宜、且不多花额度**（后端一次上游调用本来就返回 3 条回答）→ 见第 6 节。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/js/app.js` | ① 新增 `titlePhrases()` / `materialTopicCandidates()` / `fetchCards()`；`topicCandidates()` 改成**特质词优先 + 材料候选兜底** ② `feed()` 改走 `fetchCards({count:3})` 出**真卡片**（知乎问题 + 真实回答 + `answer_url`），不再把收藏映射成卡片 ③ `loadViewpoints()` 候选重试 + 传 `seen_sources` 避开已吐的卡片 ④ 新接 5 句台词（`offer`/`source`/`disagree`/`park`/`closing`）+ 补回 `viewpoints` 一句（见 §3.1） ⑤ 收藏条目 `draggable="true"`，`#pet` 变成 drop 目标 ⑥ `source` 台词挂在 `.card` 上，**无出处的本地材料卡不说这句** | 用户拍板的 4 个缺口 |
| `web/js/terrain.js` | 删死代码 `bridgePath()`；新增 `drawBridges()`——按块**在屏幕上的实际位置**（`getBoundingClientRect`，含 perspective 投影）跨层连线；`MAX_BRIDGES = 4`，超出时如实标注「共 N 座桥，这里画最近 4 座」 | 桥是**跨层**的，画在任何一层的坐标系里两端都会对不上 |
| `web/css/app.css` | `.bridge-overlay`、`.pet.is-drop` 高亮、`.mat` 拖拽光标 | 拖拽与桥的视觉反馈 |
| `web/docs-shot-terrain.png` | 重新实拍（1280×975，**含 3 座跨层桥**；旧图是 1920×1080 且没有桥） | 交付证据要跟代码一致 |
| `web/README.md` | 新增「第二轮」实测记录；**订正接口数**（原文写「12 个调用 / 覆盖 14 个路径中的 12 个」与代码不符 → 实为 **10 个封装、9 个实际调用**）；订正已知问题（卡片折叠其实早就做了）；新增「两方观点」缺口与额度现状 | 文档纪律：事实 / 推断 / 建议要分清，错的要改 |
| `docs/status.md` | 加第二轮里程碑 + 「两方观点」缺口 + 额度现状（80/100）+ 下一步 #1/#4 订正 | 共享区（见 §4.1 的规则冲突提醒） |
| `docs/decisions.md` | 新增 **D36**：只补 4 个缺口不改形态 / 主流程换真卡片 / 主题词策略 / 附带结论「两方观点在契约层无接口支撑」 | 用户的拍板要进决策层 |
| `docs/队友对齐清单.md` | **接口数 13 → 14**（顶部状态行、零 F 分工段、零 G 抬头 + 接口表 + 「14 个接口」、零 H 端点数、零 J、零 K 抬头 + 末尾接口数）；零 K 从「补充三条」改成「**补充四条**」，第 ④ 条 = 卡片接口（形状 + 出处必填 + 空数据≠失败 + 额度提醒 + **「收藏推不出出处，卡片必须走 `/api/cards`」**） | 契约加了 `POST /api/cards`，对外文本要跟上（**由用户自己发**） |

---

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `page.mouse` 的 down / move / up 模拟「把收藏拖到桌宠身上」。
  **结果**：**HTML5 拖拽根本没被触发**——`dragover` 没进（`#pet` 上的 `is-drop` 类始终没加上），
  `drop` 也没进，卡片数还是 0。Playwright 的 `mouse` 事件**不会驱动浏览器的原生拖拽控制器**。
  **结论**：验 HTML5 DnD 要**合成 `DragEvent` + `DataTransfer`**（标准做法，见 §4.2 的代码）；
  `page.mouse` 那条路别再试了。

- **尝试**：用 `page.evaluate` 读 DOM 当作「不靠谱」，打算全靠 `query(kind:"text")`。
  **结果**：**上一份交接里那条结论要撤销** —— 这个 provider 上 `page.evaluate` **能用**，
  `pageEvaluate.calls` 正常、DOM 读得到、还能派发事件（`document.querySelector('#btn-views').click()` 真实生效）。
  唯一报错的是脚本体里直接调 `page.viewportSize()` → `ReferenceError: page is not defined`（只有 `page.evaluate` 内部拿得到 `page`）。
  **结论**：**用 `page.evaluate` 做断言和驱动，比 `query` 快得多**；`query` 留着读可见文本。

- **尝试**：`open_tab` 开一个新标签做「干净页面」的验证。
  **结果**：**活动标签会漂**——`open_tab` 之后 `inspect` 报的是新标签的 URL，
  但下一条 `run_script` 打到的却是**另一个标签**（`?demo=1&fast=1` 那个）。
  于是出现了「刚切到照镜子面板，断层、地形、『地形长出了一块』就已经在了」的怪现象，
  白查了半天。**教训**：跑脚本前先 `page.evaluate(() => location.href)` **确认自己在哪一页**，
  不要相信上一步 `inspect` 的 URL。

- **尝试**：靠「同主题 5 分钟缓存」免费重跑一次完整演练来更新地形截图。
  **结果**：距上一次演练已经过了 **8 小时**（缓存 TTL 300 秒），缓存早过期 → 重跑要烧 ~11 次额度。
  **结论**：**不重跑卡片**。改走「切照镜子 → 答 6 题 → 断层 → 出题 → 作答」这条路径，
  只花情境题那 2—3 次，就能拿到地形 + 桥，截图照样是真的。

- **尝试**：用内置浏览器的 `screenshot` 直接存成仓库里的 `.png`。
  **结果**：**provider 是把截图落盘成 `.jpg` asset**（`C:\Users\steam\.minimax\v2\assets\YYYY\MM\DD\HH-MM-SS-...-browser-comment-....jpg`），
  不是 `.png`，也不在仓库里。
  **结论**：截图 → 找 asset 里的 `.jpg` → `System.Drawing` 转成 PNG 再进仓库（见 §4.2）。

- **尝试**（一次真实的翻车）：以为两个服务还开着，直接开浏览器跑回归。
  **结果**：`NAVIGATION_FAILED: net::ERR_CONNECTION_REFUSED`。
  原因：**后台任务有 1 小时上限**，跑到就被回收（task 里写的是 `Background bash timed out after 3600000ms`）。
  **结论**：**每次开工先探端口**，断了就重启两个服务（命令见 §4.2）。

- **发现（不是失败，但很要紧）**：**「知乎上吵起来的两边」现在不是真的两方**。
  `POST /api/cards` 的语义是「一个候选问题取一条回答」，所以「知乎上大家怎么说」拿到的是
  **同主题的两个不同问题**（实测：「有没有知名度不高，好用的的软件啊？」+「你使用过最好的AI软件推荐?」），
  **数据层没有验证这两张卡观点相反**，而契约台词写的是「它们说的是反的」。
  **修法很便宜**：后端 `getQuestionAnswers(questionUrl, 3)` **一次上游调用本来就返回 3 条回答**，
  改成「同一问题取前两条有链接的回答」就是真的两方，**不多花额度**（反而省 1 次）。
  **但这是契约 + 后端改动，不在用户拍板的「只补 4 个缺口」范围内 → 本轮没做，等人拍板。**

### 3.1 用户点名要补进交接的三条

1. **卡片语义替换**：主流程那张卡**从「我的收藏」换成契约里的真卡片**——
   走 `POST /api/cards`，每张 = **知乎问题 + 真实回答 + 原回答 URL**（`source.answer_url` 必填，缺了就不给这张卡）。
   代价是**吃「问题发现」额度**；收益是「每张都能点回知乎原文」这句台词**终于是真的**。
   配套：**主题词不能只猜一个**——知乎搜不到就诚实返回空，前端必须**真的换个说法再试**，
   候选按可靠性排序：**收藏里 `answer` 型条目的标题**（它本身就是知乎问题标题）→ 标题剥体裁词后的短语 → n-gram 兜底。
2. **桥的画法**：桥是**跨层**的（自述层 ↔ 情境层），**不能画在任何一层的坐标系里**——那样两端对不上。
   必须按每个块**在屏幕上的实际位置**连（`getBoundingClientRect()`，这个位置已经含了 `perspective` 投影和 `translateZ` 位移）。
   桥会**随作答累积**，全画出来是一团乱麻 → 最多画最近 4 座，但**如实写出总数**。
3. **真卡片的额度代价**：`N 张卡 ≈ 1+N 次`「问题发现」（一次 `question_recommendations` 出最多 20 个问题 = 1 次，
   每个问题再花 1 次 `question_answers`）。**主流程 3 张 = 4 次；「知乎上大家怎么说」2 张 = 3 次**；
   一次完整演练 ≈ 11 次。**同主题 5 分钟缓存**，**每日 00:00 重置不结转**，**计数有延迟（跑完等 15 秒才变）**。

---

## 4. 下一个 AI 接手前必须知道的事

### 4.1 目录归属（**以 `docs/协作规范.md` 为准**）

| 谁 | 范围 |
| --- | --- |
| `nineanswerer` | `server/`（知乎 API 对接、卡片生成、额度与缓存）、`docs/decisions.md`、`contracts/`、`web/`（2026-11-18 起临时接管） |
| `5zdz5` | `assets/`、`docs/adr/`、`docs/handoffs/`、`web/`（暂时交出） |

> ⚠️ **上一份交接（`2026-11-18-2212-web-frontend-first-version.md`）§4.1 的分工表与 `docs/协作规范.md` 不一致**，
> 而且把「并行会话」和「队友」混成了两栏——**事实是并行会话的 git 作者也是 `nineanswerer`**（`git log --format='%an'` 全部是它），
> 所以上一份那张表是错的。**以 `docs/协作规范.md` 为准。**

> ⚠️ **两处规则本身有冲突，需要人拍板**（本轮没改规范）：
> ① `docs/协作规范.md` 写「共享区（`contracts/`、`docs/status.md`、`README.md`）改动走 PR，不直接推 main」，
> 但同一份文件的分支模型又写「main 始终可跑，**禁止直接推（除文档）**」——而 `docs/status.md` 正是文档。
> ② `docs/协作规范.md` 把 `docs/handoffs/` 划给 `5zdz5`，但 `prompts/BOOTSTRAP.md` 的收工协议要求**每次会话**都往那里写交接。
> 本轮的处理：**按协议写交接（新文件，不动别人的）**；**提交仍直推 main**（与本仓库全部历史一致）——**这两处都等用户表态**。

### 4.2 必须先跑的命令

```powershell
# 0) 先探端口（后台任务 1 小时会被回收）
foreach ($p in 18787,18788) { try { (Invoke-WebRequest "http://localhost:$p/" -UseBasicParsing -TimeoutSec 4).StatusCode } catch { "port $p DOWN" } }

# 1) 后端（8787 绑不上，必须换端口）
cd 'C:\Users\steam\Desktop\从心\server'
$env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
$env:PORT = '18787'; node src/index.js

# 2) 前端（零依赖）
cd 'C:\Users\steam\Desktop\从心\web'; node serve.js   # → http://localhost:18788/web/

# 3) 不耗额度的回归（可以随便跑）
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-tone.js   # 14 项
cd 'C:\Users\steam\Desktop\从心\server'; node scripts/smoke-auth.js   # 25 项

# 4) 自检（期望 PASS 13 / WARN 0 / FAIL 0）
powershell -ExecutionPolicy Bypass -File 'C:\Users\steam\Desktop\从心\scripts\check-contract.ps1'

# 5) 提交（显式路径，禁 git add -A）
git add -- web/js/app.js web/js/terrain.js web/css/app.css web/README.md web/docs-shot-terrain.png docs/status.md docs/decisions.md docs/队友对齐清单.md docs/handoffs/<新文件>.md
```

**验 HTML5 拖拽（浏览器里）** —— `page.mouse` 不行，必须合成事件：

```js
// run_script 的 code 里
const r = await page.evaluate(() => {
  const mat = document.querySelector('.mat');
  const pet = document.querySelector('#pet');
  const dt = new DataTransfer();
  dt.setData('text/plain', (mat.textContent || '').trim());
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  fire(mat, 'dragstart'); fire(pet, 'dragover');
  const lit = pet.classList.contains('is-drop');   // 期望 true
  fire(pet, 'drop');
  return { lit };
});
```

**截图进仓库**（provider 存的是 jpg asset）：

```powershell
# 1) 找到最新的 asset：
Get-ChildItem 'C:\Users\steam\.minimax\v2\assets\YYYY\MM\DD' -Filter '*.jpg' | Sort-Object Length -Descending | Select-Object -First 3
# 2) 转 PNG（PowerShell 5.1 自带 System.Drawing）：
Add-Type -AssemblyName System.Drawing
$im = [System.Drawing.Image]::FromFile($src); $im.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $im.Dispose()
```

### 4.3 坑

- **`page.evaluate` 能用**（上一份交接说它不靠谱，**已撤销**）——它是这个 provider 上最快的断言/驱动手段。
- **活动标签会漂**：`open_tab` 后 `inspect` 看到的 URL 不一定是下一条 `run_script` 打到的页面 → **先 `page.evaluate(() => location.href)` 确认**。
- **`page.mouse` 触发不了 HTML5 拖拽**（见 §3）。
- **浏览器脚本体里直接调 `page.viewportSize()` 会报 `page is not defined`**（只有 `page.evaluate` 内部拿得到 `page`）。
- **`POST /api/cards` 吃「问题发现」额度**：N 张 ≈ 1+N 次；同主题 5 分钟缓存；**额度计数有延迟（跑完等 15 秒才变）**。
- **后台任务 1 小时上限**：两个服务会被静默回收 → 浏览器报 `ERR_CONNECTION_REFUSED`。
- **`git add -A` 被禁**：工作区有并行会话的中间产物。一律 `git add -- <显式路径>`；提交前先 `git fetch`。
- **上游额度每日 00:00 重置、不结转**。
- **`.ps1` 必须是 UTF-8 with BOM**；工作区行尾统一 LF。
- **`edit` 的锚点会模糊匹配**；改多行大段用 Node 脚本做**精确替换 + 命中数断言**（本轮 4 个文档都是这么改的：`old` 串必须**恰好命中 1 次**，否则整份补丁不写盘）。
- **`read` 工具读无 BOM UTF-8 按 ANSI 读 → 中文乱码**；中文输出走 Node 或写文件后再读。

### 4.4 硬约束（官方检查 9 条，摘要）

密钥不入源码/前端响应/日志/截图/视频；接口失败/额度耗尽/空数据给**真实提示**；禁止批量高频调用；**不得把 Mock 写成完成**；刘看山 IP **仅本届比赛期间可用**，赛后禁商用；**不自绘角色**。

---

## 5. 下一步（按优先级）

1. 🔴 **人亲手把 P3 闭环点一遍**（真实数据、不 mock）：拖一条收藏到桌宠 → 嚼 → 吐卡片 → 点出处（**新标签打开知乎原回答**）→ 「知乎上大家怎么说」→ 切照镜子 → 答问卷 → 断层 → 出题 → 作答 → 看地形 + 桥。
   **AI 已经把这条路径跑通并逐项取证**，但**人还没手动点过**——重点看**节奏**（5 分钟够不够）和**失败态提示是不是真的**。这一步不需要再写功能。
2. 🔴 **「两方观点」拍板**：要么接受「同主题的两个不同问题」（当前文案有超述风险），要么让后端改成「同一问题下的两条回答」（**不多花额度**）。见 §6.1。
3. 🟡 **零 G / 零 H / 零 K 由用户自己发**——**文本已经改好**（接口数 14、零 K 补了第 ④ 条），见 `docs/队友对齐清单.md`。零 I 之外**没有任何一节真的发出去过**。
4. 🟡 **P1 台词 14 句逐句审**（`contracts/tone.json` 与 `docs/P1-三件产出.md` §二）——**只能人拍板**。
5. 🟢 **落版画面**（脚本 4:50—5:00）没做；**镜头动效**（吸入/飞出/推近/滑入/地图升起）基本没做；**Three.js 真 3D 推镜**留给队友（保命砍法里排最后）。
6. 🟢 队友回来后按 `web/README.md` 交接 `web/`（走 PR）。

---

## 6. 需要人拍板的事

1. **「两方观点」怎么做**（本轮新暴露）——
   (a) 保持现状：两张卡是**同主题的不同问题**，台词「它们说的是反的」在数据上**没被验证**，有被追问的风险；
   (b) 改后端 + 契约：`POST /api/cards` 增加一个可选参数，让它返回**同一个知乎问题下的两条回答**——
   **零额外额度**（`getQuestionAnswers(questionUrl, 3)` 一次调用本来就返回 3 条），改动小，但要动契约。
2. **共享区要不要走 PR**——`docs/协作规范.md` 说共享区改动走 PR，同一份文件又说「除文档」可直推 main；
   本轮沿用历史做法**直推 main**。要不要把规范改成明确的说法？
3. **`docs/handoffs/` 的归属**——规范划给 `5zdz5`，但收工协议要求每次会话都写那里。本轮按协议写了**新文件**（没动别人的）。
4. **P1 台词 14 句逐句审**——AI 只能排版，不能替人定稿。
5. **B14 分类体系三件事**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）——等队友有空一起定；**未确认前 `status` 保持「初版」**。
6. **B10 需求验证（3—5 人试用）**——11-28 前要做，12-05—12-07 校园宣讲是现成渠道。
7. **B9 决赛是否赴深圳**——用户此前选「待定」。
