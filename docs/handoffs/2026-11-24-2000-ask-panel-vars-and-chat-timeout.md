# 交接：面板样式交给队友 + 直答别再白烧额度

- **时间**：2026-11-24 20:0x
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `d3030d5`（**本轮的改动尚未提交**，见 §5 第 1 条）
- **本次目标**：用户问「**按照我要发给队友的部分，我们还有什么没做？**」—— 盘点功能侧欠账；
  零 N（唯一要发给队友的那条）**用户已经发出去了**。

## 1. 现在处于什么状态

- **新主线「问它」已上线并跑通**（D66）：抛问题 → 知乎搜相似困境 → 直答判断适用性 → 给方案 → 每步能点回知乎原文。
  `/api/advice` 实测 200（5 步方案 + 5 条真实出处），完整回归 **PASS 14 / FAIL 0**。
- **本轮修了两件事**：① 面板样式变量化，让队友在 `web/css/` 里真能改（原先内联样式队友改不动，承诺兑现不了）；
  ② 直答超时的白烧额度 bug（一次「问它」原本烧 5 次直答额度，改后烧 1 次）。
- **功能侧能做的基本做完了**；剩下的全是**要人做**的：P1 台词人审、计划书人审、部署密钥申请、AI Works 上传、
  演示视频、试用邀请、**以及一条要补给队友的额度纠正**。
- **零 N 用户已发出**，等队友回三件事：删两个失效按钮 / ≤5 条观感反馈 / 分类体系三件（最紧急）。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/js/app.js` | `ASK_STYLE` 全部改成 `var(--ask-xxx, 默认值)`；加 **18 个 `ask__*` 语义 class**；等待提示分两段（8 秒后换话） | 内联样式优先级高于 class，队友在 `web/css/` 里改不动 → 「面板视觉归队友」兑现不了 |
| `contracts/ui-contract.json` | `js_owned_classes` 2 → **20**（新增 18 个 `ask__*`） | 新 class 必须登记，否则自检第 14 项 WARN |
| `server/src/config.js` | 新增 `chatTimeoutMs: 60_000` | 直答是推理模型（20—35 秒），10 秒超时必然踩中 |
| `server/src/zhihu/client.js` | `callUpstreamJson` 新增 `timeoutMs` / `maxAttempts` / `retryOnTimeout` 三个可选参数 | 要能给直答单独一套策略，又不动其余上游调用 |
| `server/src/zhihu/endpoints.js` | `chatComplete` 用 `chatTimeoutMs` + `maxAttempts: 2` + **`retryOnTimeout: false`** | 超时多半已计费 → 重试就是白烧直答额度（100/天最紧） |
| `web/js/app.js`（等待提示） | 8 秒后换一句「还在等知乎那边回话……这一步可能要 20—40 秒。」 | 30 秒静默用户会以为卡死；**只说在等，不假装有进度**（D62） |
| `docs/decisions.md` | 追加 **D67**（决策层只增不改） | 这次修的是真 bug，得留记录 |
| `docs/status.md` | 「已完成」加一条；「下一步」加第 13 条（三件要人做的） | 进度文件是下个 AI 的入口 |
| `docs/分工-视觉与功能.md` | 新增 **§4.1「问它」面板：队友能改什么」**（11 个变量 + 18 个 class + 简写坑）；改 §4 那句不准的口径 | 承诺要写清楚，队友才知道怎么改 |
| `docs/队友体验指南.md` | 头部状态行、第 7 节文档表、§6 第 3 条、6 处过期表述全部更新 | 队友照着跑不该再找到已下线的断层/情境题/地形 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：把面板样式做成「颜色变量 + 固定宽度」的写法（`border:1px solid var(--ask-border, 颜色)`）
  **结果**：浏览器实测 —— 队友按变量名写成 `--ask-input-border: 5px solid rgb(255,0,0)` 时，
  **整条边框直接消失**（宽度变 0、颜色变黑）。原因是 `border: 1px solid 5px solid red` **不是合法的 border 值**，
  声明在计算值阶段就失效了。
  **结论**：**凡是塞进简写属性里的变量，值必须是完整简写**。最终方案：
  4 个「完整简写型」变量（`--ask-input-border` / `--ask-card-border` / `--ask-src-border` / `--ask-step-line`）
  + 7 个「单值型」变量。这条已写进 `app.js` 注释和两份文档，**别改回去**。
- **尝试**：给 `--ask-border` 一个「只改颜色」的语义（更不容易写错）
  **结果**：**行不通** —— 内联样式把 border 的宽度/样式/颜色**一起锁死**了，
  队友写 `.ask__card { border-width: 2px }` 也压不过内联。
  **结论**：宽度只能靠变量给 → 变量塞在简写里 → 就得给完整简写。**没有第三条路**。
- **尝试**：完整回归里「问它」那一拍挂了就当成偶发网络问题，重跑一次就算
  **结果**：重跑确实过了（35.4 秒成功），**但 `/api/quota` 显示直答从 82 掉到 77** ——
  一次「问它」实际烧了 **5 次**直答额度。
  **结论**：**不是偶发**。10 秒超时 × 最多 4 次重试 × 推理模型 20—35 秒 = 必然踩。
  「慢」和「烧额度」是同一个 bug 的两面，**别当偶发处理**。
- **尝试**：`node -e "..."` 里写中文长字符串再 append 到 `docs/decisions.md`
  **结果**：PowerShell 把内层引号吃了 → `SyntaxError: Expected ',', got 'ident'`。
  **结论**：**中文长文本一律走 `.mjs` 脚本文件**（`.ctx/` 已 gitignore），别用 `node -e`。

## 4. 下一个 AI 接手前必须知道的事

- **本轮改动还没提交**：涉及 `web/js/app.js`、`contracts/ui-contract.json`、`server/src/config.js`、
  `server/src/zhihu/client.js`、`server/src/zhihu/endpoints.js`、`docs/decisions.md`、`docs/status.md`、
  `docs/分工-视觉与功能.md`、`docs/队友体验指南.md`。**提交前 Context 必须由人给**（D59）。
- **必须先跑的自检**（服务起在 18801）：

  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1     # 期望 PASS 14 / WARN 0 / FAIL 0
  node .ctx\check-encoding.mjs <改动的文件>                            # 期望 U+FFFD=0 / 无 BOM / 纯 LF
  node scripts\regress-p3.js --light --base http://localhost:18801      # PASS 7 / FAIL 0（零额度）
  node scripts\regress-p3.js        --base http://localhost:18801       # PASS 14 / FAIL 0
  ```

- **服务**：`18801`（带密钥起）。**18800 会被 1 小时自灭回收**；`fetch failed` 先怀疑它自灭了。
  ```powershell
  $env:PORT='18801'; $env:HOST='127.0.0.1'
  $env:ZHIHU_ACCESS_SECRET = [System.IO.File]::ReadAllText("$HOME\.zhihu-cli\access_secret").Trim()
  node server/src/index.js
  ```
- **浏览器缓存 `web/js/app.js`** → 验前端改动要开新标签页或换 host（`127.0.0.1` vs `localhost` 是不同源，缓存分开）。
- **`run_script` 的 `page.evaluate`**：本轮**能**回传值（`value` 字段）；但 `document.title` 兜底那招也可用。
- **编码纪律**：`.ps1` 必须 UTF-8 **with BOM**；`.md` / `.json` UTF-8 无 BOM、纯 LF。
- **Git 纪律**：禁 `git add -A`；提交前先 `git fetch`；每次提交前重填 `.ctx/current.md`（只写 `Context: <理由>` 一行，写前先 read）。
- **额度现状**（11-24 20:0x 实读 `/api/quota`）：直答 **76/100**（最紧）、问题发现 88/100、知乎搜索 4985/5000。
  **未实名认证的密钥直答只有 2 次/天** —— 这条要纠正给队友（他消息里按 10 次算的）。
- **目录所有权（D65）**：我们只碰 `web/js/`、`server/`、`contracts/`、`scripts/`、`docs/decisions.md`、`docs/status.md`；
  `web/index.html` / `web/css/` / `web/assets/` / `assets/` / `docs/adr/` **是队友的，不碰**。

## 5. 下一步（按优先级）

1. **提交并推送本轮改动**（9 个文件，见 §4 第一个 bullet）—— 跑完上面四组自检再提交；**Context 等用户给**。
2. **给用户一条「补发给队友」的消息**（用户自己发，AI 不参与）：
   - **额度纠正**（必须）：未实名是分能力的 —— 搜索 10 次/天、**直答只有 2 次/天**，
     「问它」问一次就烧 1 次直答；实名认证后直答提到 100 次/天。
   - **面板变量清单指路**：让他看 `docs/分工-视觉与功能.md` §4.1（含「变量塞在简写里必须写全」的坑）。
3. **写交付包/部署相关时先问用户** —— D63：**不要主动产出交付包**，用户点名才做。
4. **等队友回三件事**：删「看一次断层」「看认知版图」两个按钮 / ≤5 条观感反馈 / 分类体系三件（最紧急，后端要靠它写逻辑）。
5. **部署专用 Access Secret 申请**（`~/.zhihu-cli/access_secret.deploy` 仍不存在）——
   **AI Works 上传 401** 必须在 **12-05 10:00 前**解决。

## 6. 需要人拍板的事

- **P1 台词逐句人审** —— 新主线用不到的五句（`mirror` / `fracture` / `question` / `bridge` / `insufficient`）
  去留**用户拍板**（AI 不得自行删）；新主线 3 句前端固定文案的处置也待拍板。
- **计划书 §2.2 区别那句 + §三 数字表述** —— 待人审。
- **静帧 2 要不要重画** —— 画的是已下线的认知地图 + 断层。
- **是否 force-push 重写 `0061915` 的 Context**（共享 main，影响队友）—— 未动。
- **队友的 PR 由谁合、什么时候合**（仓库至今 0 个 merge commit；约定第一单我们陪跑）；
  **队友说的「新分支」具体指哪个** —— 待队友说清。
- **右下角悬浮桌宠（`.pc`）压住工作台右下角按钮** —— 靠 `scrollMarginBottom:96px` 绕开，属队友 CSS 事项，**还没正式提出**。
- **问赛事组两个问题**：「12-04 前公网链接」是硬规则还是自定余量；12-07 是提交截止还是决赛路演日。
