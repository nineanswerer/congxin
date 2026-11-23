# 交接：首次上手引导 + 修「认·清」闭环的两处死胡同（P6 首次引导首次落地）

- **时间**：2026-11-23 13:2x — 14:3x
- **对应决策**：D60（`docs/decisions.md`）· 状态条目 B26（`docs/status.md`）
- **任务来源**：用户 11-23 13:2x 指派 —— 「请完成首次上手引导，并验证新用户能独立走通一次『认·清』认知闭环」

---

## 1. 现在处于什么状态

- **首次上手引导已落地并实测通过**：新用户从零走通一次「认·清」闭环，完成卡数字全真。
- **「认·清」闭环的两处死胡同已修**：假陈述 + 哑按钮。
- **契约台词 14 句一字未改**（新增的是**引导文案**，不是桌宠台词）。
- 仓库 `C:\Users\steam\Desktop\从心`，branch `main`。**本次改动尚未提交**（见 §5 第 1 条）。
- 18800 带密钥服务在跑（后台任务 `bg_7419d86a-99be-4b39-bee7-a72ce9404589`，1 小时硬上限）。
- 额度（14:0x 实测）：问题发现 **剩 75/100**、知乎搜索 5000/5000、全网搜索 5000/5000、
  直答 96/100、知乎用户数据 9905/10000、创作 480/500。**演练与实测都吃缓存，同题几乎不烧。**

---

## 2. 改了什么

| 文件 | 改动 |
| --- | --- |
| `web/js/onboarding.js`（**新**） | 首次上手引导：7 步、判据全读真实状态、只写本机、不烧额度 |
| `web/css/onboarding.css`（**新**） | 引导卡 + 目标描边 + 完成卡样式（走 `--p-*` 令牌，浅色模式自动反相） |
| `web/js/app.js` | ① `renderQuiz()` 的主按钮改 id `btn-tension` → **`btn-mirror-run`**（解重名）；② 新增 `startMirror()` / `showSelfReportPrompt()` / `switchToMirrorTab()` / `quizAnsweredCount()` / `quizMissingCount()`；③ `runTension(trigger)` 前置检查「自述没说全 → 不调接口、不下判断」；④ 工作台「看一次断层」绑到 `startMirror()`；⑤ 切到照镜子时**没答过就不说**「跟你刚才说的不太一样」；⑥ `loadTerrain()` 里记闭环走通 + 弹完成卡；⑦ 引入 onboarding 模块、建 `guide`、绑「带我走一遍」 |
| `web/js/demo.js` | 预设答案**提前**写进 `state`（切 tab 那一拍「你说的话」必须已经成立）；画面顺序不变 |
| `web/index.html` | ① 引入 `css/onboarding.css`；② 工作台 section-head 改 `section-head--row` + 加 **「带我走一遍」**按钮；③ **删掉**快捷条里两颗 hidden 死按钮（`btn-reset-quiz` / `btn-situation`，id 重名且无 handler） |

---

## 3. 试过但没成的（**最重要，别省**）

1. **「让桌宠照照镜子」点了没反应** —— 第一次以为是选择器写错，用 `run_script` 点它并比对
   `#mirror-fracture` 前后文本、`[data-pet-bubble]` 前后文本，得到
   `changed:false / bubbleChanged:false` → 确认**根本没有 handler**。
   根因：`$('#btn-tension')` 永远返回**第一个**匹配元素（`index.html:219` 工作台那个），
   `renderQuiz()` 里的 `$('#btn-tension').addEventListener('click', runTension)` 绑错对象。
2. **`id="btn-tension"` 不是唯一一处重名** —— 顺着查发现 `btn-reset-quiz`、`btn-situation`
   也各有两份（快捷条里那份是 `hidden` 的死代码）。**只修一个还会再咬人** → 三个一起处理。
3. **`class="btn primary"` 在 kit 里不存在** —— 反复 grep `web/css` 确认只有
   `.btn--primary` / `.btn--secondary`，所以照镜子面板的按钮**根本没有样式**（哑的）。
   顺手把 `app.js` 里所有 `btn primary` / `btn ghost` 改成 kit 的写法。
4. **「没找到断层·你说的一致」不是后端的锅** —— 读 `server/src/services/tension.js` 确认
   `insufficient` 只管**行为**信号够不够（≥2），不管自述有没有答。
   自述为空 → traits 为空 → 没有断层 → 前端那句「一致」就是**假陈述**。
   → 修在前端（前置检查），**没有改后端契约**。
5. **完成卡第一次没弹出来** —— 引导的 450ms 轮询和 `showDone()` 是同一拍，
   `finish()` → `stop()` → `root.hidden = true` 把刚挂上的完成卡一起杀了。
   → 加 `doneShown` 闸门：`stop()` 在完成卡已挂载时**不隐藏**。
   后来又发现「第二次走通不弹卡」是 `showDone` 的 `if (!first) return;` 生效（**设计如此**，不是 bug）。
6. **目标元素被引导卡挡住** —— 原用 `scrollIntoView({block:'center'})`，目标落在视口正中，
   正好被底部固定的引导卡盖住 → 改成手动 `scrollTo`，把目标放到视口 **30%** 处。
7. **`run_script` 30 秒上限** —— 一次跑完整闭环会被 `SCRIPT_TIMEOUT` 打断
   （返回 `pageErrors: []`，页面本身没错）。**拆成几段跑**，每段之间用 `snap()` 记录状态。
8. **`edit` 工具匹配失败** —— `index.html` 里那颗按钮实际带 `type="button"`，
   我按记忆写 `old_string` 少了这一段 → 报「找不到原文」。**先 `read` 再 `edit`**。
9. **`write` 覆盖 `onboarding.js` 时自己写出了 bug** —— `showDone()` 替换了 `root.innerHTML`，
   之后 `start()` 会操作已被销毁的节点 → 改成 `mountMain()` 可重挂载。

---

## 4. 下一个 AI 接手前必须知道的事

- **演练模式会掩盖按钮绑定 bug**。`web/js/demo.js` 走的是**函数直调**（`runTension()` 等），
  **绕过 DOM 事件** → 演练 10 步全过，真实用户一点就断。
  **改任何按钮绑定之后，必须在浏览器里真点一次**，不能只看演练日志。
- **`demo.js` 的预设答案必须早于切 tab 写进 `state`**：切到照镜子那一拍桌宠要说
  「跟你刚才说的不太一样」，那一刻 `state.quizPicked` 必须已经有答案，否则这句话是假的。
  （画面顺序不用变：选中态仍然是切过去之后才亮。）
- **台词目录是唯一真源且只有 14 句**。引导文案**不是台词**，放在 `web/js/onboarding.js` 里；
  要给桌宠加台词必须改 `contracts/tone.json` **并且需要人拍板**。
- **`.ob` 是引导容器的 class，不是 id**（`document.querySelector('#ob')` 查不到）。
- **完成卡只弹第一次**（`congxin.loop.v1` 已存在就只更新记录不弹）。
  想再验一次：先 `localStorage.removeItem('congxin.loop.v1')`，再点一次「看地形」。
- **本机存储键**（都只在这台浏览器里）：
  `congxin.onboard.v1`（`{seen, skipped, at}`）· `congxin.loop.v1`（`{at, stats}`）·
  `congxin.pet.memory.v1` · `congxin.mountain.daily.v1` · `congxin-theme`。
- **`web/css`、`web/js` 是整目录进交付包** → 本次新增的两个文件**自动进包**
  （`make-delivery.js` 的 `DIRS`），已实测 81 个文件、运行时引用自检全部命中。
- **18800 服务 1 小时硬上限会自灭**，灭了就重启：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  $env:PORT='18800'; $env:HOST='0.0.0.0'
  $env:ZHIHU_ACCESS_SECRET = [System.IO.File]::ReadAllText("$HOME\.zhihu-cli\access_secret").Trim()
  node server/src/index.js
  ```
- **浏览器上下文压缩后凭证失效** → 重新 `skill` 加载 `browser-use:control-in-app-browser`。
  运行时重启后 FilePanel 标签页会变成 `about:blank`，要重新 `navigate`。
- **`run_script` 的 code 必须是 async function 体**（不能写成 `async function(page){...}` 表达式）。

---

## 5. 下一步（按优先级）

1. **提交本次改动**（未提交）。Context 行**必须由人给**（`prompts/COMMIT_MSG.md` 硬规矩）——
   用户 11-23 13:2x 的原话可作结论文本：
   「首次上手引导原为 P6 空缺；目标是新用户能独立走通一次『认·清』闭环」。
   提交时：`git fetch origin` → `git pull --rebase origin main` → **显式路径** `git add --`（禁 `-A`）
   → 先把 Context 写进 `.ctx/current.md`（hook 自动带入）→ `git commit -F .ctx\msg-xxx.txt`。
2. **P5/P6 其余打磨**（界面拟真 / 动画节奏 / 文案 / 排版）—— 首次引导只是这一项里的一项。
3. **队友：P4 真 3D 推镜**（认知闭环的记忆点，队友负责，未做）。
4. **计划书人审**（§2.2 区别那句 + §三 数字表述）。
5. **用户自己发零 L·补 稿给队友**；**拍演示视频**（按 D55 新开场顺序，人录）。
6. **B10 约 3—5 人试用**（11-28 前）—— 现在有了引导，「试用」能直接看出第几步卡住。
7. **B14 等队友确认分类体系三件事**。
8. **问赛事组**：12-04 前公网链接是硬规则还是自定余量；12-07 是提交截止还是决赛路演日。
9. **已推后**：用户申请部署专用 Access Secret → 重出交付包 → Chrome/Edge 手动传包（401 未解，12-05 10:00 前必须修好）。

---

## 6. 需要人拍板的事

1. **本次 commit 的 Context 行**（AI 只转录，不推断）。
2. **是否 force-push 重写 `0061915` 的 Context**（共享 main，会打断队友，需点头；未动）。
3. **队友说的「新分支」具体指哪个** —— 现在 main 上多的是 `9601112`；若指另一个未推的分支或他私有沙盒（404 看不到），要他自己说清。
4. **确认审核声明最终填「是/否」**（12-05 拿 OAuth 凭证后定）；封面是否上传；D10「可安装 PWA」补不补；是否填「站外链接 / GitHub 仓库」。
5. **P1 台词逐句人审**仍未做（本次**没有动任何台词**，但引导文案是新写的 UI 文案，不在 P1 台词范围内）。
