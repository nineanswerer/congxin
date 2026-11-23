# 交接：引导指的目标别被引导卡盖住（D61 · D60 的收尾修复）

- **时间**：2026-11-23 16:4x — 17:1x
- **对应决策**：D61（`docs/decisions.md`）· 状态条目 B27（`docs/status.md`）
- **任务来源**：D60 的引导做完后复验，发现引导圈的 target 被固定在底部的引导卡压住

---

## 1. 现在处于什么状态

- **引导圈的 target 不会再被引导卡盖住**：7 步每一步实测 `overlap: false`。
- **只改了 `web/js/onboarding.js` 一个文件**（+131 / −15），没碰 `app.js`、`index.html`、任何 CSS。
- **台词目录 14 句一字未改**（改的全是引导的指向逻辑，不碰台词）。
- 仓库 `C:\Users\steam\Desktop\从心`，branch `main`。
  **本地 HEAD = `8f0568c`，`origin/main` = `8f0568c`（已推上去了）。**
- 18800 带密钥服务在跑（1 小时硬上限，会自灭，需重启）。
- 额度（17:0x 实测）：问题发现 **剩 71/100**、知乎用户数据 **剩 9884/10000**；
  知乎搜索 / 全网搜索 / 直答 / 创作 本轮未额外消耗（同题走缓存）。

---

## 2. 改了什么

| 文件 | 改动 |
| --- | --- |
| `web/js/onboarding.js` | ① `scrollToTarget()` 改成「算位置 + 必要时垫空白」两段式；② 新增 `padEl()` / `releasePad()`，在文档末尾垫 `#ob-scroll-pad` 补可滚动量，引导结束撤掉并同步修正 `scrollY`、**把节点一并删掉**；③ 问卷那步目标从整个 `#mirror-quiz` 改成**动态指向第一道没答的题**（新增 `firstUnansweredQuestion()` + `step.resolve`）；④ `findTarget()` 支持 `step.resolve`；⑤ `check()` 每轮重新解析动态目标 + 刷新 `hint`（新增 `refreshHint()`）；⑥ 第 6 步兜底 `#mirror-fracture` → `#panel-mirror` |

---

## 3. 试过但没成的（**最重要，别省**）

1. **第一版「调偏移量」的算法对第 1/2/7 步看着没问题，第 3 步就露馅** ——
   复盘发现它其实**只对「文档够高」的目标成立**。第 3 步目标在文档绝对位置 **3378**，
   页面总高 3601、视口 720 → **最大可滚动量只有 2881**，
   而把它顶到卡片上方需要 **3174**。**文档就这么高，滚不出那个位置** ——
   这不是偏移量算得准不准的问题，是**物理上滚不到**。
   → 教训：引导卡是 `position: fixed`，**它在文档流之外**；
   目标被压住的根因是**文档里没有足够的滚动余量**，不是滚得不够准。

2. **垫空白的第一版是错的：越垫越不够** ——
   写的是「`need = desired - maxScroll + 24`」，但 `maxScroll` 取的是
   `documentElement.scrollHeight - vh`，**这个 scrollHeight 已经含了垫上去的高度**。
   于是每垫一次、基准就变一次，缺口永远补不满（实测第 3 步垫了 317px 还是差一截）。
   → 改法：基准必须是「**不含**垫高的文档高度」：
   `baseH = documentElement.scrollHeight - cur`（`cur` = 当前垫高），
   `need = desired - (baseH - vh) + 24`。**这个坑已写进代码注释，别再犯。**

3. **第 4 步指向整个 `#mirror-quiz` 容器必然被压住** ——
   那个容器 **543px 高**，卡片固定在底部，中间那几道题怎么滚都会被压。
   → 改成指向**第一道还没答的题**（95px 高），答完自动往前挪。
   顺带发现 `hint` 不会自己刷新（圈已经挪到下一题、进度还写着旧数字），
   → 把 `hint` 刷新抽成 `refreshHint()`，`check()` 每轮调。

4. **第 6 步目标 `#btn-situation` 一开始找不到** ——
   它是 `runTension()` 的 innerHTML 里插进 DOM 的，**没跑完断层就不存在**。
   → 兜底不能写 `#mirror-fracture`（空容器时 `isVisible` 判 false，等于没有兜底），
   改用 `#panel-mirror`。

5. **浏览器里 `run_script` 的 `code` 必须是 async function 体** ——
   传函数表达式报 `Function statements require a function name`；
   传裸代码 `localStorage.removeItem(...)` 报 `localStorage is not defined`
   （脚本跑在 worker 里，页面对象要用 `page.evaluate(() => ...)`）。

6. **推送被网络打断 12 次** —— 本机到 github.com:443 极不稳：
   先是连续 10 次 `Recv failure: Connection was reset` / `Failed to connect`，
   后台重试任务也是 10 次全挂；**后来一次普通重试第 2 次就成功了**。
   → 结论：**别把「推不上去」当成阻塞，它大概率是瞬时抖动，多试几次就行**。

---

## 4. 实测记录（干净 profile，2026-11-23 16:5x — 17:0x）

| 检查 | 结果 |
| --- | --- |
| 7 步每步 target vs 引导卡 | ✅ **全部 `overlap: false`** |
| 第 1 步（桌宠 307px 高） | ✅ target 80–387 / 卡 456–644，不重叠 |
| 第 3 步（标签按钮） | ✅ 垫 317px 后 target 207–251 / 卡 478–644 |
| 第 4 步（问卷） | ✅ 动态指向 q1→q6，每步 95px 高，`overlap: false` |
| 答 6 题 | ✅ 圈逐题挪；hint 实时「已答 1/6 … 5/6」；答完自动进第 5 步 |
| 第 5 步（照镜子） | ✅ 真实接口 200，断层真出来 1 条 |
| 第 6 步（情境题） | ✅ 真实知乎问题 + 出处；接口 200（耗时 10.6s） |
| 第 7 步（版图） | ✅ 三层真渲染 |
| 完成卡 | ✅ 「真实收藏 9 条 · 问卷 6/6 · 断层 1 条 · 情境题 1 道 · 认知版图 3/3 层」 |
| 垫高余量回收 | ✅ 引导结束后 `padH` 归 **0px**，页面不留痕 |
| 演练 `?demo=1` | ✅ 引导不弹（`obHidden: true`）、无遗留垫高 |
| 控制台 | ✅ **0 错 0 警告** |
| 回归 | ✅ `node scripts\regress-p3.js --light --base http://localhost:18800` → **PASS 6 / FAIL 0** |
| 契约自检 | ✅ `check-contract.ps1` → **PASS 13 / WARN 0 / FAIL 0**（密钥扫描 1761 文件无命中） |
| 编码 | ✅ 无 BOM、纯 LF、无 U+FFFD |

---

## 5. 提交

| commit | 内容 |
| --- | --- |
| `6f44132` | D60：首次上手引导 + 修「认·清」闭环两处死胡同 |
| `8f0568c` | D61：引导指的目标别被引导卡盖住（垫空白 + 动态指向下一道题） |
| `93d0933` | 文档：D61 / B27 / 本交接 |
| `197472e` | 收尾：垫出来的空白用完就删，别在页面上留痕 |

Context（hook 从 `.ctx/current.md` 自动填）：
`首次上手引导原为 P6 空缺；目标是新用户能独立走通一次「认·清」认知闭环`

✅ **`origin/main` 已到 `197472e`**（本地 = 远端）。

⚠️ **推送到 GitHub 极不稳**：本机到 github.com:443 时通时不通，
实测连续 12 次 `Recv failure: Connection was reset` / `Failed to connect`，
DNS 只解析到 1 个 IP（57.155.223.240），TCP 层能通但**传输中被掐**。
**没有可用代理**（`gh` CLI 的 token 也已失效，需要用户重新 `gh auth login`）。
→ 结论：**多试几次就能推上去**，别当成真阻塞。

---

## 6. 还没做的（**别当成已完成**）

- ⚠️ **P5/P6 其余打磨仍未做**：界面拟真、动画节奏、文案、排版。
- ⚠️ **AI Works 上传 401 未解**（平台侧 OSS 签名）→ **必须用户在自己 Chrome/Edge 手动传**，**12-05 10:00 前修好**。
- ⚠️ **部署专用 Access Secret 未申请**（`C:\Users\steam\.zhihu-cli\access_secret.deploy` 仍不存在）。
- ⚠️ **交付包未重出**（D58 已降级为非当前优先级）。
- ⚠️ **「发布项目」按钮未点**（最终不可逆，需用户明确确认）。
- ⚠️ **P4 真 3D 推镜**（队友负责，未做）。
- ⚠️ 计划书人审、演示视频（人录）、3—5 人试用（11-28 前）、零 L·补稿（用户自己发）—— **全是人的活**。
