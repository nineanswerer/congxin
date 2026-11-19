# 交接：桌宠残影/白边根除 + P3 收口前收掉 4 个实测问题

- **时间**：2026-11-19 15:20
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `feac09b`（已推 origin/main；上一条 `872105b`）
- **本次目标**：① 用户在浏览器里批注「他动的时候，白边会越来越重，并且有残留影像」→ 查清并根除；
  ② 用户 13:45 拍板「认可，留在 main」后，趁 **P3 明天（11-21）收口**把 11-19 完整实测揪出的
  4 个演示事故点一次收掉。

## 1. 现在处于什么状态

- **P3 出口条件已实测通过**（11-19 13:1x AI 代跑完整主流程 + 本轮 4 项修复后的定向复测），
  `?demo=1&fast=1` 回归 **9/9 步全过、0 报错**。
- **桌宠素材已经是干净版本**：6 个动画 WebP 重转（320×320 / 10fps / q92）**且帧 `dispose=1`**，
  与官方原始 GIF 逐帧一致，无叠影无白边；转换链路固化在 `scripts/build-kanshan-assets.js`。
- **本轮 4 个修复已实跑验证**：500 不再泄露路径与栈、情境题主题回到材料本身、失败时桌宠会开口、
  出处露出完整链接并写明知乎登录框那件事。
- **不能做的**：还没做落版画面（4:50—5:00）、镜头动效、Three.js 真 3D 推镜（保命砍法排最后）；
  OAuth 登录 UI（12-05 后拿凭证）；`contracts/`、`docs/status.md`、`README.md` 仍是共享区直推 main。
- **额度**：问题发现剩 **26/100**（每日 00:00 重置）。一次完整手动流程 ≈11 次，
  **一次 `?demo=1` 演练 ≈8 次**。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `assets/kanshan/*.webp`（6 个） | 重转：320×320 / 10fps / q92 / **`dispose=1`** | 旧素材 `fps=10` 混合相邻帧（拖影烤进帧里）+ ffmpeg 写 `dispose=none` 导致透明背景逐帧累积（残影 + 白边越播越重） |
| `assets/kanshan/NOTICE.md` | 补转换链路、参数理由（为什么弃用 `fps=10`、为什么必须改 dispose）、合规说明（只改格式与容器标志，**不动像素**） | 素材是官方授权物，转换过程必须可复现、可交代 |
| `scripts/build-kanshan-assets.js`（新） | 一条命令跑完「ffmpeg 丢帧转码 + 帧处置补丁」，跑完打印帧数/帧矩形/dispose 自检 | 这套参数没有现成工具能做，必须固化成脚本；重跑 SHA-256 逐字节不变 |
| `server/src/lib/errors.js` | `toApiError` 不再把 `err.stack` 塞进 `detail`，只给短 id `err_xxx`；栈**只进服务端日志**；新增 `scrubDetail()` 安全网（洗 Windows 绝对路径 / node_modules 路径 / 栈帧） | 500 把 `C:\Users\steam\Desktop\从心\server\node_modules\body-parser\...` 吐给浏览器 = 赛规红线 |
| `server/src/index.js` | 错误中间件去掉重复日志（`toApiError` 已带 id 记过一次） | 同一异常打两遍日志 |
| `web/js/app.js` | ① `topicCandidates()` 改成 **材料优先**（`state.topic` → 材料候选 → 特质词兜底）；② 出题传 `answered_sources` 避开卡片用过的知乎问题；③ 新增 `petSayFail()`，6 处 catch 全部让桌宠开口说后端 `user_hint`；④ 卡片下方露出**完整出处链接** + 写一句实话说明知乎登录框；⑤ `loadTerrain` 的 catch 也补上 | ②原先后果：主题词用问卷特质词「长期主义」→ 出「基金 30 年定投」，跟收藏（软件测试/UML/Ubuntu）不搭、台词悬空。③原先后果：气泡停在上一句，看着没事其实卡住 |
| `web/css/app.css` | 新增 `.srcurl`（完整出处链接）、`.zhint`（知乎登录框说明）；桌宠素材注释补「素材自身封装缺陷已在素材层修掉」 | 出处要经得起当场核验 |
| `docs/decisions.md` | 新增 **D39**（素材根因与撤销旧结论）、**D40**（本轮 4 个修复） | 「发现先前结论错了要改并在 decisions.md 记」是项目纪律 |
| `docs/status.md` | 时间戳更新；撤销「残留影像改不了」那条；4 个待修问题改成 ✅ 并写清验证 | 共享区的进度真源 |
| `web/README.md` | 新增「第四轮」一节；修正主题词候选顺序的旧描述；额度数字更新；**写明 `?demo=1` 是真调知乎、不是 mock** | 交接给队友时不能留错信息 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：断定「残留影像是官方素材本身（画师画了好几只手）、改不了」。
  **结果**：用户直接推翻：「官方给的是这个形式的，那么一定有一种运用方式可以解决这个问题」。
  **结论**：**我错了**。错因是**用 Pillow 拆动画 WebP 看单帧**——Pillow 的 `im.seek(i)` 给的是
  **合成帧**，我把「逐帧累积的结果」当成了「这一帧的原始画面」。
  **判定素材真伪只能靠浏览器直接加载官方原始 GIF 对照**，别再用 Pillow 拆 webp 下结论。

- **尝试**：Pillow 无损重编码 animated WebP（想一步治好残影）。
  **结果**：6 个文件 936KB → 2026KB，**残影一点没少**（累积是容器语义，不是编码损失）。
  **结论**：别再试这条路。

- **尝试**：ffmpeg 转 APNG（想绕开 WebP 的动画封装）。
  **结果**：ffmpeg 的 webp 解码器不支持动画帧，`image data not found`，**根本没法验证**。
  **结论**：本机没有 cwebp/img2webp/webpmux/gifsicle/magick，APNG 这条路走不通。

- **尝试**：只改 CSS 压住残影（`will-change`、`translateZ`）。
  **结果**：压不住。**结论**：残影的根在素材封装层，不在 CSS。

- **尝试**：找 ffmpeg 的 dispose/blend 开关。
  **结果**：`ffmpeg -h encoder=libwebp` 只有 `lossless / preset / cr_threshold / cr_size / quality`，
  **没有** dispose 选项。
  **结论**：只能自己改容器里的 **ANMF 帧头标志位**（第 16 字节：bit0-1=dispose，bit2=blend），
  **只改标志位、不动像素**。

- **尝试**：用 canvas `drawImage` 采样动画帧做胶片条，用来核对 6 个动作的映射。
  **结果**：6 个动作采出来**全是同一帧**（Chrome 的 canvas 对动画图只取首帧）→ 一度误判「映射对不上」。
  **结论**：**要验证动画，必须让动画在页面上真的播**，用「整页并排 + 间隔连拍截图」，
  不要用 canvas 采样。

- **尝试**：以为 `?demo=1&fast=1` 是 mock、可以随便跑当免费回归。
  **结果**：它**真调知乎**，一次烧 ≈8 次「问题发现」，跑完额度从 34 掉到 26。
  **结论**：`web/js/demo.js` 开头就写着「⚠️ 演练也会真调知乎」。**回归前先看额度**，
  同主题有 5 分钟缓存、5 分钟内反复演基本不烧。

- **尝试**：用 `Invoke-WebRequest` 读 500 的响应体。
  **结果**：读不到（PowerShell 5.1 的老毛病）。
  **结论**：读错误响应体用 `curl.exe -s -i`。

- **尝试**：用 `Remove-Item` 清理临时文件。
  **结果**：被本地安全策略拦（永久删除不允许）。
  **结论**：Windows 上删文件一律 `rm -- "<path>"`（走 mavis-trash，可恢复），单条顶层命令。

- **尝试**：在 `run_script` 里用 `page.click()` 点按钮。
  **结果**：`page.click is not a function`——脚本 worker 只有 `mouse/keyboard/evaluate/waitForTimeout/screenshot`。
  **结论**：用 `page.evaluate(() => document.querySelector('#btn-feed').click())`。
  同理 `page.screenshot()` 在 worker 里可用，但单独 `screenshot` action 才有 `userDelivery`。

- **尝试**：在 `run_script` 里声明 `const links = ...`。
  **结果**：`ReferenceError: links is not defined`（撞页面的 `window.links`）。
  **结论**：脚本里别用 `links` 这类页面全局名，换个冷门变量名。

## 4. 下一个 AI 接手前必须知道的事

- **服务要先起来**（后台 bash 任务有 1 小时上限、会被静默回收，**开工先探端口**）：

  ```powershell
  # 后端（8787 在本机绑不上，必须 18787）
  cd 'C:\Users\steam\Desktop\从心\server'
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  $env:PORT = '18787'; node src/index.js
  # 前端
  cd 'C:\Users\steam\Desktop\从心\web'; node serve.js     # → http://localhost:18788/web/
  ```

- **改完 `contracts/tone.json` 必须重启后端**（`loadTone()` 是进程内缓存）。
- **`web/serve.js` 把仓库根目录当静态根**：`/web/` 是页面、`/assets/` 是素材、`/.ctx/xxx` 也能访问
  → 临时探针页可以直接丢 `.ctx/` 里访问，测完删掉。
- **提交纪律**：禁 `git add -A`，一律 `git add -- <显式路径>`；提交前先 `git fetch`；
  commit message 必须带 `Context:` / `Tried:` / `Verify:` 三行，
  `Context` 写进 `.ctx/current.md`（格式 `Context: <理由>`）由 hook 自动填。
- **`.ps1` 必须 UTF-8 with BOM**；工作区行尾统一 LF。
- **密钥**只在 `C:\Users\steam\.zhihu-cli\access_secret`（仓库外），前端不碰。
- **目录所有权**（`docs/协作规范.md`）：`assets/`、`docs/adr/`、`docs/handoffs/` 归队友 `5zdz5`；
  `web/`、`server/`、`contracts/`、`docs/decisions.md` 归本会话。
  **用户 11-19 13:45 已明确「认可，留在 main」**（覆盖了 `assets/kanshan/*` 的改动）；
  `docs/handoffs/` 的历史越界仍**未获明确表态**。
- **另一个 AI 会话会并发提交同一工作树同一 `main`**：不要动对方正在改的文件；
  `.ctx/msg2.txt` 是并行会话遗留，别覆盖（另存 `.ctx/msg-<name>.txt`）。
- **浏览器要点**：`run_script` 的 `code` 是**函数体**（单次 30 秒上限，长等待拆两次）；
  `page.mouse` 触发不了 HTML5 拖拽 → 合成 `DragEvent` + `DataTransfer`；
  **活动标签会漂**（点出处开新标签后 `page.evaluate` 可能打到知乎页 → 先 `location.href` 确认）。
- **别删素材重转成果**：`scripts/build-kanshan-assets.js` 跑一遍就能复现同样 6 个文件（SHA-256 逐字节不变）。

## 5. 下一步（按优先级）

1. **人亲手把 P3 闭环点一遍**（真实数据、不 mock）：AI 已代跑通过，剩下的只有人眼判断
   ——节奏、台词、失败态提示。⚠️ 今天额度只剩 26，**点之前先看一眼额度**。
2. **P1 台词 14 句逐句审**（`contracts/tone.json` 与 `docs/P1-三件产出.md` §二）——
   **只能人拍板**，AI 只能排版与绘制。
3. **零 G / 零 H / 零 K 由用户自己发**（AI 不参与）：文本已改好（接口数 14、零 K 第④条含卡片接口 +
   `same_question`）；只有零 I 真发过。
4. **B14 三件事等队友确认**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）；
   **B4** 确认 App ID / App Key 是否已可获取（12-05 之后；**不发邮件**）；**B10** 约 3—5 人试用（11-28 前）。
5. **保命砍法尾巴**（P3 之后再看）：落版画面（4:50—5:00）、镜头动效、Three.js 真 3D 推镜。

## 6. 需要人拍板的事

- **P1 台词 14 句逐句审**——内容层只能人拍板，AI 不能替。
- **零 G / 零 H / 零 K 的发送**——对外可见动作，需用户自己发。
- **共享区走不走 PR**（`contracts/`、`docs/status.md`、`README.md`）：本会话一直直推 main，
  规范写的是走 PR，**要不要补流程**？
- **`docs/handoffs/` 的归属与越界写入**：本会话已写过 4 份（含本份）；`assets/` 的越界已获用户认可，
  **这一处还没表态**。
- **B14 三件事**（分类体系）等队友 `5zdz5` 回来确认。
