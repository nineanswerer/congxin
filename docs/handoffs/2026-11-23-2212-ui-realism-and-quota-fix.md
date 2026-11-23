# 交接：界面拟真四处拍板（首屏官方 WebP / 顶栏收进详情 / 错误码只进 console / 开发术语换产品口吻）+ 额度取数 bug

- **时间**：2026-11-23 21:5x — 22:1x
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `732687b`（已推 `origin/main`）
- **本次目标**：P5「界面拟真」—— 把界面上的开发者痕迹全部换成产品口吻
- **对应决策**：D64｜状态条目 B30

---

## 1. 现在处于什么状态

- **P5 现在只剩「P6 观感」**（动画节奏 / 文案 / 排版），而那部分 **AI 判不了，要队友或用户提 ≤5 条**。
- 本轮做完了**界面拟真**：静态扫 `web/` + 浏览器实地核对，共定位 **9 处开发者痕迹**，按用户 11-23 22:0x 的四处拍板全部改完，
  并在 **18800（好密钥）/ 18801（坏密钥）** 两个服务上实测过。
- 仓库 `C:\Users\steam\Desktop\从心`，branch `main`，**本地 HEAD = `origin/main` = `4cea974`**（本轮改动未提交）。
- **台词目录 14 句一个字都没动**（P1 纪律，AI 不得自行增删）。
- ⚠️ **交付包从头到尾没产出过**（D63）。本轮**没有**跑 `make-delivery.js` / `predeploy-check.js`。
- ⚠️ **队友还没被告知**：首屏那个 AI 生成 mp4（队友 11-23 12:45 的 `9601112` 提交的）**已被删除**，换成官方 WebP。

---

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/index.html` | ① 顶栏 `#pill-profile` 由 `<span>` 改 `<button class="pill pill--toggle">`（带 `aria-expanded` / `aria-controls="nav-detail"`），新增 `#nav-detail` 详情面板（`#detail-identity` / `#detail-quota`），`#pill-quota` 改 `hidden`；② 首屏 `<video id="ch-pet-video">` → `<img class="ch__pet-img" src="../assets/kanshan/idle.webp">` | 顶栏只留一句短状态；首屏换官方素材 |
| `web/css/app.css` | `.nav__status` 加 `position: relative`；新增 `.pill--toggle`（**只写 cursor + focus-visible + aria-expanded 色**）、`.nav__detail` 面板、`.nav__detail-row` | 详情面板展开样式；`.pill--toggle` 不能写 border/background（见 §4） |
| `web/css/companion-home.css` | `.ch__pet-frame video, .ch__pet-fallback` 一组规则 → `.ch__pet-frame img.ch__pet-img`（`object-fit: contain; padding: 5%`）；删掉 `.no-video` 回退三条 | 首屏从 video 换成 img |
| `web/js/app.js` | ① `showFail()` 去掉 `<span class="code">${code}</span>`，错误码改 `console.warn(\`[从心] ${where} 失败：${code}\`)`；② `petSayFail()` 气泡只念中文 hint，**不挂 note**；③ `loadProfile()` developer_account → 顶栏「还没接知乎登录」；④ `loadQuota()` 成功 → 数字进 `#detail-quota`、`#pill-quota` 隐藏；失败 → 后端 `user_hint` **直接回顶栏**；⑤ 新增 `initNavDetail()`（点胶囊展开 / 点外面 / Esc 收起）；⑥ `renderStrip()` 「—个独立行为信号」→「还没比信号」、底栏去掉复现命令；⑦ 删掉首屏 video 的 `no-video` 回退 JS 块 | 错误码藏起来只进 console；开发术语换产品口吻 |
| `web/js/pet-companion.js` | ① 来源标签「真实数据」→「它查到的」、「台词目录」/「本地记忆」→「它记着的」；② 兜底话不再提「台词目录」；③ **额度取数修真 bug**；④ 免责说明改「和它自己记着的话」；⑤ `setMood()` 里首屏同步改 `#ch-pet .ch__pet-img` | 产品口吻 + 修真 bug |
| `web/js/api.js` | `NETWORK_ERROR` hint 改部署语境中性文案（「连不上服务器。这次没读到数据，过一会儿再试一次。」），开发细节留 `console.warn` | 不在界面上教人怎么起本地服务 |
| `web/README.md` | 新增「第六轮（2026-11-23 22:3x）：界面拟真审计」一节：9 处改动对照表 + quota bug 说明 | 交接清单 |
| `web/assets/companion/pet-idle-motion.mp4` | **删除**（AI 生成视频，画面右下角烧着「视频由AI生成」水印 + 边缘马赛克；与页脚「刘看山形象来自知乎官方黑客松开放素材」声明冲突。作者是队友 `5zdz5`，commit `9601112`） | 声明冲突 |
| `docs/decisions.md` | 追加 **D64**（只增不改） | 决策层留痕 |
| `docs/status.md` | 追加 **B30** + 「已完成」补一条 + 更新时间 | 进度留痕 |

**额度取数 bug（本轮最实的发现）**：

额度接口的真实形状是 `{apis:[{api_id,total,used,remaining}]}`，
原代码读的是 `quota.questions?.remaining` / `quota.user_data?.remaining` —— **这两个键根本不存在**，
所以桌宠答额度只会念两个「—」。现按 `api_id` 取真值，文案：
「知乎那边的额度今天还剩：问题发现 46/100，用户数据 9611/10000（每天重置）。」

---

## 3. 试过但没成的（**最重要，别省**）

1. **想去掉 AI 视频里的水印 —— 做不到，只能换素材。**
   「视频由AI生成」是**烧进像素**的（ffmpeg 抽帧 `.ctx\pet-frame.png` 可见），**重编码去不掉**。
   → 结论：**别再试重编码去水印**，唯一的路是换官方素材（`assets/kanshan/*.webp`）。

2. **长字符串里写中文，编辑工具把一个「」写成了坏字符（U+FFFD）。**
   追加 D64 时 `edit` 工具把 `「它记着的」` 的左引号写坏，文件里出现 3 个 `U+FFFD`。
   → 教训：**每次写完中文长文必须扫一遍 U+FFFD**：
   ```powershell
   $s=[System.IO.File]::ReadAllText('docs\decisions.md',[System.Text.Encoding]::UTF8); $s.Contains([char]0xFFFD)
   ```
   用 `write` 工具一次写完整文件比 `edit` 拼字符串稳。

3. **`edit` 工具的 `old_string` 必须逐字精确** —— 缩进差 2 格就失败；
   改大块模板串时（`renderStrip`）**必须把整段 old_string 写全**，否则会留下残留文本。
   → 需要看文件精确内容时最稳的是 `node -e` 逐行打印（注意见下一条）。

4. **`node -e` 在 PowerShell 里内层单引号会被吃掉。**
   `node -e "console.log('| BOM')"` → node 收到的是 `console.log(| BOM')`，直接 SyntaxError。
   → 教训：**在 PowerShell 里查文件属性直接用纯 PowerShell**：
   ```powershell
   $b=[System.IO.File]::ReadAllBytes($f); $s=[System.Text.Encoding]::UTF8.GetString($b)
   $s.Contains("`r`n")   # CRLF
   $s.Contains([char]0xFFFD)  # 坏字符
   ```
   同理 **`Get-Content` 读中文会乱码**（默认 ANSI），要读就 `[System.IO.File]::ReadAllText($f,[System.Text.Encoding]::UTF8)` 或用 read 工具。

5. **`.pill--toggle` 一开始差点和原胶囊长得不一样。**
   kit 的 `system.css:488` 里 `.pill` 已经定义了 `display/align/gap/height:32px/border/background`。
   → **`.pill--toggle` 里只写 cursor + focus-visible + aria-expanded 的颜色变化**，**不要写 border / background / height**，
   否则那颗胶囊外观会和原来不一致。

6. **窄视口下 `#nav__status` 本来就整个消失，不是这次改坏的。**
   kit 的 `system.css` 有 `@media (max-width: 1023px) { .nav:not(.is-open) .nav__actions > :not(.btn--primary) { display:none } }`。
   → 要在窄视口做视觉验证，**注入页内样式**（仅验证用，不改仓库）：
   `@media (max-width:1023px){ .nav:not(.is-open) .nav__actions > :not(.btn--primary){ display:flex !important } }`

7. **本轮 `run_script` 里的 `page.evaluate` 没回传任何结果** —— `logs` 是空数组、`pageEvaluate.calls: 0`、
   `run` 的返回值不出现在工具结果里；往页面里塞 `<pre>` 再 `query` 也读不到。
   → 教训：**别指望在页面里现算数**。要么用**离线几何 + 文件取证**（ffmpeg 抽帧、量像素），
   要么就老老实实截图肉眼看。

8. **背景图水印这件事，一开始判断成「有风险」，最后是几何算出来「没有风险」。**
   `cover` 必然在一个方向上裁切，而 `scale(1.1)` 又从右侧切掉一截 —— 两条一叠加，
   **可见源图 x 上限是个常数 ≈1370**，跟视口宽高比、滚动位置都无关。
   → 教训：**「可能露出」这种话要么给出算式，要么别写进决策文档**；
   写进文档的每条风险，下一个 AI 都会当真去处理（这次差点白动队友的文件）。

---

## 4. 下一个 AI 接手前必须知道的事

**已知未修的问题（别当成已修）**

- ✅ **首屏背景图 `web/assets/companion/A_calm_healing_style_digital_i_2026-11-23T03-34-53.png` 右下角的「AI生成 WORKBUDD」水印不用管。**
  之前记的「矮/宽视口可能露出」是保守估计，**已被几何核算推翻**：水印在源图占 x ≈ 1416—1536，
  而 `.ch-sky`（`inset:-8%` + `cover` + `center 42%` + `scale(1.1)`，全宽居中、只有这一处引用）
  的**可见源图 x 上限恒为 ≈1370**（`scale(1.1)` 从右再切 0.1255 屏宽）→ **永远裁在可见区外**。
  详见 `docs/decisions.md` D64「补充核实」。**不需要裁图，也别去动队友的文件。**
- ⚠️ **队友尚未被告知**首屏 AI 视频已换成官方 WebP，且他的 mp4 被删了 → 待用户决定何时同步 5zdz5。
- ⚠️ **额度耗尽（`ZHIHU_QUOTA_EXHAUSTED`）仍未实测触发过**（走同一条 `showFail` 路径，错误目录已核对，没真把额度烧光）。

**服务怎么起（本机开发用）**

```powershell
cd 'C:\Users\steam\Desktop\从心'

# 18800 带密钥（1 小时硬上限会自灭）
$env:PORT='18800'; $env:HOST='0.0.0.0'
$env:ZHIHU_ACCESS_SECRET = [System.IO.File]::ReadAllText("$HOME\.zhihu-cli\access_secret").Trim()
node server/src/index.js

# 18801 坏密钥（失败态实测专用）：让「凭据失效」那条分支真的走一遍
$env:PORT='18801'; $env:HOST='127.0.0.1'
$env:ZHIHU_ACCESS_SECRET = '<随便填一串错的字符串，不要用真密钥>'
node server/src/index.js
```

⚠️ 18801 那行的值**绝不能进仓库** —— 本仓库公开，契约自检会扫「赋值形式」的密钥并直接 FAIL。
探活用 `/api/quota`（`/api/health` 不存在，404）。两个服务**都会自灭**，报 `fetch failed` 先怀疑它自灭了。

**验证命令**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1                          # 期望 PASS 13 / WARN 0 / FAIL 0
node scripts\regress-p3.js --light --base http://localhost:18800                              # 期望 PASS 6 / FAIL 0
```

⚠️ 回归脚本**默认 base 是 18787**，不带 `--base` 会打在错的服务上。

**浏览器坑**

- **浏览器会缓存 `web/js/app.js`** —— 验前端改动**必须开新标签页或加 cache-busting 参数**（本轮用 `?v=audit5` / `?v=audit6`）。
- `run_script` / `query` / `click` / `screenshot` **都会跟随最近 `open_tab` 选中的标签页**；动手前先 `open_tab`。
- `run_script` 的 code 必须是 **async function 体**；页面对象用 `await page.evaluate(() => ...)`；**30 秒硬上限**，要拆段跑。
- Browser 面板视口可能变成 **851×775 CSS px**；`page.setViewportSize` **不存在**，改不了视口。

**目录所有权**

- 本轮动的 `web/`、`docs/decisions.md`、`docs/status.md` 归本会话；`web/assets/companion/pet-idle-motion.mp4` **是队友的文件**（已删，见 §6）。
- `assets/`、`docs/adr/` 归队友 `5zdz5`，本轮**没动**。

---

## 5. 下一步（按优先级）

1. ~~**提交 + 推上 `origin/main`**~~ —— ✅ **已完成（11-23 22:2x）：`732687b`，已推上 `origin/main`**（本轮 8 个 web 文件 + 2 个文档 + 1 份交接）。
2. **P6 动画节奏 / 文案 / 排版** —— 队友提 ≤5 条，纯观感，AI 判不了。
3. **P4 真 3D 推镜** —— 队友负责，未做。
4. **B10** 约 3—5 人试用（11-28 前）；**B14** 等队友确认分类体系三件事。
5. **计划书人审**（§2.2 区别那句 + §三 数字表述）、**演示视频（人录）**、**零 L·补稿（用户自己发）**。
6. **AI Works 上传 401（B20）** → 需用户在 Chrome/Edge 手动传，**必须在 12-05 10:00 前修好**。
7. **部署专用 Access Secret（B19）** → 用户申请后存 `C:\Users\steam\.zhihu-cli\access_secret.deploy`。
8. ⚠️ **交付包在用户点名之前不产出**（D63）；打包 / 上传 / 发布各自独立授权。

---

## 6. 需要人拍板的事

1. ~~**首屏背景图的「AI生成 WORKBUDD」水印怎么处理**~~ —— ✅ **已核实（11-23 22:3x）：不用动**，
   几何核算证明它永远在可见区外（见 §4）。
2. **什么时候、由谁知会队友 5zdz5**：首屏 AI 视频换成官方 WebP + 他的 mp4 被删。
3. **是否 force-push 重写 `0061915` 的 Context**（共享 main，会打断队友）—— 一直没动。
4. **队友说的「新分支」具体指哪个** —— 要他自己说清。
5. **待问赛事组**：「12-04 前公网链接」是硬规则还是自定余量；12-07 是提交截止还是决赛路演日。
6. **12-05 拿 OAuth 凭证后**：审核声明最终填「是/否」；封面是否上传；D10「可安装 PWA」补不补；是否填「站外链接 / GitHub 仓库」。
