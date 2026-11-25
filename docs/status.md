# status.md — 当前进度

最后更新：2026-11-25 12:4x
赛事：知乎黑客松 S3·湾区共创季（`activity_code=zhihu_hackathon_2026_p3`）

> ⚠️ **2026-11-24 12:0x 起产品主线已换**（D66）：**认知地图不做，「认·清」认知闭环整条线下线**，
> 新主线 = **「问它」**（你抛一件事 → 知乎找相似困境 → 判断适不适用 → 给能照着做的方案 → 每步点回知乎原文）。
> 详见 [decisions.md](decisions.md) D66 与本文档 B32 / B33。

## 一、关键时间点

| 时刻 | 事项 | 距今 |
| --- | --- | --- |
| 2026-11-17 | **当天**。规则已读通，选题定位已定，双 AI 协作机制已落地，代码未开工 | 1 |
| 11.18 / 11.20 / 11.22 / 11.23 / 11.24 / 11.26 / 11.27 / 11.28 | 清华深研院 / 港城大 / 哈工大深圳 / 南科大 / 深大 / 港大 / 华南理工 校园宣讲 | 1—11 天 |
| 2026-12-04 15:59 | **报名截止**（官方 `registration_end_at`） | 17 天 |
| 2026-12-05 10:00 | **创建项目通道开启**（官方 `project_start_at`）+ 线上开幕式 + API 讲解 + 技术专家 1V1 | 19 天 |
| 2026-12-07 02:00 | 组队截止 / **提交截止，此后不可改任何文件**（官方 `project_end_at` = `team_end_at`，窗口共 **40 小时**） | 21 天 |
| 2026-12-11 上午 | 初审结果通知，前 15 名进决赛 | 25 天 |
| 2026-12-19 | 决赛，深圳线下 + 腾讯会议 + 视频号，5 分钟 Demo + 3 分钟 Q&A | 33 天 |
| 2026-12-19 | 人气奖评选窗口同日结束 | 33 天 |

> ⚠️ **上表三个时刻已按官方接口校正**（11-22 17:1x 读 `GET /api/v4/brand_influence/api/hackathon/config`）：
> `registration_end_at` = **12-04 15:59:59**、`project_start_at` = **12-05 10:00**、`project_end_at` = `team_end_at` = **12-07 02:00**（窗口 40 小时）。
> **此前笔记里的「12-04 23:59 报名截止 / 12-07 10:00 提交截止」与官方接口对不上 → 一律以官方接口为准，提交截止按 12-07 02:00 算。**
> 官方 timeline 还把 **12-07 标为「决赛路演，巅峰对决」**，与本表「12-19 决赛」并存 —— **这一条待向赛事组确认**（不影响我们 12-07 02:00 前提交）。

**开发可用时间 ≈ 19 天 / 约 38 人时**（2 人 × 5—10 小时/周 × 2.6 周，中位估计）。范围必须按人时裁剪，见 `decisions.md` D5 / D10 / D11。

## 二、已完成

- **✅✅✅【D76】AI Works 项目「从心」**已正式发布** —— 正式公网链接到手，口径改写已落库（2026-11-25 11:5x—12:3x）** —— 用户问卷拍板「**现在就点发布**」+「**按建议改这三处**」→ 执行到底：**正式公网链接 = `https://pekropd3uupx.aiworks.site`**（根路径 302 → `/web/`；`/web/` **命令行直连 200、无需知乎 SSO**）；知乎项目详情页 `https://www.zhihu.com/project/detail/240909` 的「**体验项目**」已内嵌该域名 → 评委在知乎项目页里能直接体验。**发布流程实测**：`deploy_status` `not_started`→**`published`**、`review_status` `reviewing`→**`passed`**、`formal_url` 空→正式域名（约 7 秒走完）；`published_at=1795581054`、`state=1`、`has_draft=false`。**口径改写共 5 处**（D38「数据层给不出的结论不许写」）：`project_detail` 4 处（`接入你的知乎收藏`→`读取知乎收藏内容`；`你收藏过的内容，还会每日汇总`→`收藏内容会每日汇总`；`选取两条立场不同的真实回答`→`选取两条真实回答`；删 `绑定知乎收藏后，`）+ `description` 1 处（`卡片带出处也带真实分歧`→`卡片带出处也带两条真实回答`）。**终验**：平台现存 `project_detail` len 1175 / `<b>`×4 / `<li>`×8 / `<h3>`×3，SHA-256 `d3141460c834c3c19c41e21ab1f5c4d7157160bc01bee33ef0ca4755f71793a7`，与「会话记录里的原文 + 同样 4 处改动」**逐字一致** ✅。**正式域名实测 3 次加载**：helper 索引 445648 < `</head>` 445683 < 第一个 module script 459533、13 张内联 `<style>`、静态 import 归零、`app.js` 56,891 字节（= 改写后）→ **D74 的改写在正式域名同样生效**；第 1 次 **9 个 429**（6 个打在 module 上 → 全部靠 `?fromxin_r=1_<ts>` 自愈），第 2/3 次 **各 0 个 429**、48 个资源全正常、API 全 200、**console 0 error**。⚠️ **D22「12-04 前拿到正式链接」提前约 9 天解除**；**正式域名无 SSO 门禁 → 所有访问者都可能烧我们的知乎额度，配额归属未取证**。⚠️ **不在 AI Works 侧加「站外链接」/「GitHub 仓库」发布方式** —— 平台原文「完成任意一种即可发布项目」，加 GitHub 可能让平台改从 GitHub 源码构建、替掉我们的交付包。完整证据与未取证项见 `decisions.md` **D76**。
- **✅✅【D75】D74 在真 preview 上连刷 5 次验证通过（2026-11-25 11:3x—11:5x）** —— 用户上传 D74 交付包后指示「连刷 5 次 preview，核验 helper 注入、资源改写、429 与 console error」→ **D74 在真机确认生效**：
  **helper 注入**：位置 `445648` < `</head>` `445683` < 第一个 module script `459533`，且 `globalThis.__fromxinImp` 是函数（5/5 次）；**`app.js` 实收 56,891 字节 = 改写后**（未改写是 56,448）、**`ui/ui.js` 40,453 字节 = 改写后**、`pet.js` 9,848 字节原样返回（无 import 不改写）；CSS 仍是 **12 张内联 + 1 条 `<link rel=stylesheet>`**。
  **5 次连刷共 37 个 429，其中 19 个打在 module script 上 —— 全部自愈**：最狠的一次 `pet.js` 连吃 2 个 429、第 3 次拿到完整 9,848 字节；`ui.js` 出现 `?fromxin_r=1` 429 → `?fromxin_r=2` 200。**5 次 console 全部零 error**；四种塌陷一个都没出现（按钮「问它一件事」、右上角「还没接知乎登录」、刘看山图全在、`brokenImgs` 空、`heroLead` 正常）。
  ⚠️ **429 本身没消失**（每刷 5—10 个，平台并发限流所致）—— D74 不是消灭 429，是让 429 **不再致命**。打中图片和 `/api/*` 的那些由 **D71 的既有机制**接住（`api.js` 平台级 429 重试 + asset-guard 图片换 query 重取）。
  ⚠️ 平台仍强制 `cache-control: private, no-store` → 我们的 `STATIC_MAX_AGE_SEC` **公网不生效**，每刷都必然重新拉全部资源 → **「5 次连刷」必须当验收动作做，不能靠缓存糊过去**。
  ⚠️ **首屏那条荧光绿不是塌陷** —— `#9AE187` = `--p-inv-bg`，`backgrounds.js` 把 `candy-on-black` 调色板在 **light 模式**下反转了（dark 模式才是黑底青字）。别再追这条。
  完整证据与边界见 `decisions.md` **D75**。
- **✅✅✅【D74】preview 上「module 依赖图被打死」已修：服务端把静态 import 改写成**带重试的动态 import（2026-11-25 10:3x—11:2x）** —— 用户上传 D73 出的 1.2.2 包后回复「**上传完成了**」；我在 preview 上实测（浏览器 SSO 登录态）抓到**第二个成因**：**D71 的 CSS 内联确实生效了**（首屏**零 CSS 请求**），但 **5 个 JS 模块被平台 429 打掉**（`/web/js/api.js`、`pet.js`、`daily.js`、`outro.js`、`/web/assets-kit/ui/ui.js`）→ `app.js` 的静态 import 链里有一个 429，**整张模块图就不执行** → 首屏按钮还是「叫它出来聊聊」（D71 的 `renderHeroAsk()` 没跑）· 右上角一直「连接中…」· 点「问它」没反应。
  **为什么 D71 的 asset-guard 救不了**：它靠 `<script>` 的 `onerror` **重挂脚本** —— module **自己**被 429 能重挂，但**整张依赖图重新并发拉**，依赖还是可能再被打掉；module 的**某个依赖**被 429 则整张图静默失败，**没有「单模块级」重试**。而且它原来每个 script **只重试 1 轮**。
  **撞出来的两个非直觉的坑**：① **浏览器会记住失败的 module URL** —— 同一个 URL 再 `import()` 一次直接 reject、**根本不再发请求**（限流代理日志里每个模块只记到 1 次 429）→ 处置是失败后挂递增的 `?fromxin_r=N` 再试；② 首屏的动态 `import()` **大多不是字面量**（`import(new URL('ui/ui.js', HERE).href)`）→ 静态分析拿不到 spec，**必须原样保留表达式**，由调用模块自己用 `import.meta.url` 解析。
  **处置（全部在 `server/`，`web/` 源文件一个字没动）**：新增 `server/src/lib/module-loader.js` —— 扫描源码里**真实**的 module 引用（跳过注释；⚠️ `assets-kit/ui/ui.js` 的文件头注释里就有一行假 import，纯正则会把它当真改掉）· 构建首屏依赖图（**实测 12 个模块**）· Tarjan 找环（**实测无环**；有环的整模块跳过，动态 import 遇环会死锁）· **在响应时**把静态 import 改写成 `const __fromxinMods = await Promise.all([globalThis.__fromxinImp('/web/js/api.js'), ...])` + 解构 · 把动态 `import()` 改写成 `globalThis.__fromxinImp(new URL(<原表达式>, import.meta.url).href)` · 内联一个 classic script 到 `</head>` 之前定义 `globalThis.__fromxinImp`（单模块最多重试 **5 次**，380ms×n + 随机抖动，**失败后换 query 绕开浏览器的失败记忆**；registry 放 `globalThis` → 同一模块不会被执行两遍）。同时把 asset-guard 的 script 重试从 **1 轮放宽到 6 轮**。
  **验证（本地限流代理复现，5 个模块前 2 次请求直接回 429）**：第 1 次全 429 → 第 2 次（重试**真的出网了**）全 429 → 第 3 次 **5 个全 200**；总耗时约 **1.5 秒**；**零 console error**（改写前 3 个 uncaught exception）；首屏按钮恢复成「**问它一件事**」；**回归 14 拍 PASS 14 / FAIL 0**（含「问它」那拍：判断 `partially_applicable` · 4 步方案 · 2 条真实出处 · 缓存命中）；**契约自检 PASS 14 / WARN 0 / FAIL 0**；3 个改动文件编码检查全过。
  ⚠️ **还没在真 preview 上验证** —— 要等用户重新上传新包后连刷；平台对带 query 的请求另有口径未验证；最坏情况 5 次重试约 4 秒才放弃（会慢，但不会半死）。
  **附：口径澄清**（用户问「为什么不介入大模型 AI」）—— 我们**已经在用**知乎直答 `zhida-thinking-1p5`（推理模型，20—35 秒）；不接第三方通用大模型**不违规**（官方「底层大模型不限」），取舍是出处链会断／交付环境只放行 `PORT`+`HOST`（第三方 key 只能明文进包）／直答是赛事白给额度／直答已 20—35 秒且 60 秒是硬超时线／`zhida-agent` 实测不能用；JeV 不接（D66）。想加码的性价比排序：**知乎知识库 RAG（500/天）> 小工具 PDF 解析（10/天）> 两段式直答 > 第三方大模型** —— 主链路在 12-04 拿正式链接前**冻结**。
- **✅✅✅【D73】对账官方 Skill 规范 + 升到 1.2.2 重出包（2026-11-25 10:1x—10:28）** —— 用户贴出官方 `zhihu-ai-works-deploy-helper` 的使用说明（「**先只读探测；展示阻断项和执行边界，确认后再构建**」）问「我们遵循了吗？」。
  **对账结论：漏了两步，且版本落后** —— ① 没跑官方 step 0 的更新检查 ② 没做过「只读探测 → 展示阻断项 → 确认后再构建」这个顺序 ③ 只解压调脚本，**没做官方 README 的 `npx skills add -g` 安装**。
  **补跑只读探测（这正是官方要的那一步）**：**在当前项目目录（仓库根）上探测 = `Status: blocked`，5 个 error**（`E_DISK_WRITE_FORBIDDEN`、`E_LOCAL_PERSISTENCE`、`E_PORT_CONTRACT_UNSAFE`、`E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED`、`E_AGENT_BUILD_REQUIRED`）—— **证据全部指向 `.ctx/*.mjs` 一次性脚本与 `scripts/make-delivery.js` / `predeploy-check.js` 这些开发期文件，运行期代码不在其中**；外加 warning `W_SENSITIVE_SOURCE_FILE`（`server/.env.example`）。
  **在交付副本上探测 = `Status: review-required`，5 个 finding 全是 warning、0 error** → 可构建。
  **→ 结论：仓库根这条路按官方规范走不通**，官方 SKILL.md 自己也要求在「隔离交付源码」上做 —— 这正是 D56/D70「只带运行期文件进包」的原因。
  **版本落后已修**：`check_skill_update.py` 报远端已是 **1.2.2**（`localVersion 1.2.0` → `remoteVersion 1.2.2`，SHA-256 `0d4c1c82…`）→ **已下载并逐项核对** → `npx --yes skills add <dir> -g --agent '*' -y` **全局安装到 `~\.agents\skills\zhihu-ai-works-deploy-helper`**。
  **⚠️ 用 1.2.0 出的包过不了 1.2.2 的校验器**（`backend.deploy.json is not the deterministic output of deploy-plan.json` + `backend penultimate CustomStep must verify the pipeline CloudBase CLI`）→ **用 1.2.2 重出**。
  **1.2.2 新增随包采集**：`collection_data.py begin` 在项目内建 `_tmp/seo.intent.json` / `_tmp/deploy.remediation.json` → 收录 **1 条项目意图**（`id ba30329d-fa07-42a7-93d1-30c69db51669`，目标受众=黑客松评审 + 被具体难事困住的普通用户）→ 归档器 `collection.exported` 两个文件、`warnings: []` → **已实际读 ZIP 里的这两个文件核对，与项目文件逐字一致**。
  **Windows 两个坑**（已记进 D73）：`install_skill_update.py` 内部调 `npx` 不带 `.cmd` → `[WinError 2]`，得手动 `npx --yes skills add ... --agent '*' -y`（不加 `--agent '*' -y` 会 `[SKILLS_PROMPT_REQUIRES_TTY]` 什么都没装）；`validate_deploy_output.py` 的 0755 判定在 Windows 必误报 → 打 `os.name != "nt"` 补丁，⚠️ **1.2.2 顶部没有 `import os`，只改判定行会 `NameError`，必须连 import 一起加**。
  **新包**：`%TEMP%\congxin\congxin.zip` · **3,148,394 字节 / 87 条目** · **SHA-256（补执行位之后）`4ba10377faf3d11df1476e425e2a59f0207312a6d8faba31e6c1de4b2367e72e`**。
  **官方链全 exit 0**（1.2.2：inspect → write_backend_runtime → write_deploy_descriptors → validate「deployment input validation passed」→ settle_agent → create_project_archive → fix-zip-exec-bit）。
  **交付副本真机冒烟全过**：`/api/health` 200 · `/api/quota` 200（**计数确实会涨**：知乎搜索 1 / 问题发现 4 / 直答 1）· `/api/tone` 200 · `/web/` 200（**460,679 字符 · 12 个内联 `<style>` · 守护脚本已注入**）· `POST /api/advice` **200 / 10.9 秒**（`applicable` + 4 步方案 + 4 条真实出处）。
  **端口交付标准：Agent 没为它改过源码** —— 仓库源 `config.js` 本来就是 `process.env.PORT` → fallback **9000**、监听 **`0.0.0.0`**，交付副本与仓库源逐字一致。
  **ZIP 校验**：87 条目 · `testzip()` 无错 · `scf_bootstrap` **0755** · 无 `node_modules`/`docs`/`.git`/`__pycache__`/`.env` · 两个采集文件在包里且内容一致。
- **✅✅【D72】含 D71 修复的新交付包已出（2026-11-25 10:0x—10:16）** —— 用户拍板「**现在出新包**」（D63 要点名授权，已拿到）。
  **出包前 `make-delivery.js` 连续两次当场报错退出**（两次都是自检按设计工作，不是 bug）：
  ① **HTML 证据行找不到** —— D71 把 `index.html` 改成自定义 handler 后，证据行还指着旧的 `express.static` 挂载写法 → 证据行换成 handler 挂载 + 根路径重定向（**证据行必须与源码逐字一致，不许留假证据**）；
  ② **`server/src/lib/web-static.js:173 读了非受管环境变量 STATIC_MAX_AGE_SEC`** —— 官方 AI Works 只放行 `PORT`/`HOST`，别的 `process.env.*` 会被官方探测器判 `E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED` **直接阻断打包** → **仓库源保留这个开关**（本地开发用），**交付副本写死 300 秒**（`patchWebStatic()`；平台把 Cache-Control 改写成 `private, no-store`，这值在公网上本来就不生效）。
  **官方 helper 七步全 exit 0**（inspect → write_backend_runtime → write_deploy_descriptors → validate「deployment input validation passed」→ settle_agent → create_project_archive → fix-zip-exec-bit）。
  **产物**：`%TEMP%\congxin\congxin.zip` · **3,147,493 字节 / 85 条目** · **SHA-256（补执行位之后）`f99727d510dc3b75b412d5b0a38dd23ec9b0b715833f44de65ec86d360f49186`**。
  **交付副本真机冒烟全过**（解压到独立目录 + `npm ci` 68 包 + 起真实进程 18805）：
  `/api/health` 200 · `/api/quota` 200 · `/api/tone` 200（**`data.lines` 是对象不是数组，14 句全在**）· `/web/` 200 · `POST /api/advice` **200 / 11.5 秒**（`partially_applicable` + **4 步方案，每步带 `source_indexes` 依据编号** + **5 条真实出处**，含 `https://www.zhihu.com/question/.../answer/...` 与作者名）→ 再问一次 **2 毫秒命中缓存**（`meta.cached=true`）。
  **D71 的修复在交付副本里真的生效**：`/web/` 输出 **460,679 字符** · **`<style data-inline-from>` 12 个** · `<link rel=stylesheet>` 只剩 1 条（Google Fonts）· **资源守护脚本已注入**（`data-gfailed` + `?gr=` 都在）· `/web/css/app.css` → `public, max-age=300` · `/assets/kanshan/idle.webp` → `public, max-age=3600`。
  **ZIP 校验**：85 条目 · `testzip()` 无错 · `scf_bootstrap` **0755** · 无 `node_modules`/`docs`/`.git`/`__pycache__` · `asset-guard.js` 在包里 · `secrets/access_secret` 在包里（有意为之，赛后轮换密钥）。
  ⚠️ **新发现的事实**：**部署专用密钥的额度计数与开发密钥不是同一份** —— 交付副本读到的 9 项额度**全是满额**（直答 100/天 used=0、知乎搜索 5000、问题发现 100…），而 11-24 22:30 在**开发密钥**上实测直答是 **27/100**。→ **线上站点的直答额度是独立的 100 次/天**，演示前不用担心跟本地抢。
- **✅✅【D71】preview「每次刷新长得都不一样」的根因锁定 = CloudBase 平台并发限流，修复已写完并本地验证通过（2026-11-24 22:0x—22:4x）** —— 用户贴 preview 链接说「看着很难看」+ 补录屏说「每次刷新都是不一样的，并且都很奇怪」。**实测证据（不是推断）**：preview 响应头 `x-cloudbase-upstream-type: Tencent-SCF_HTTP`（**每个静态资源都回源到我们的 SCF 云函数**）· `server: BLB/25.12.0.2`（EdgeOne 最外层）· 429 body `{"code":"EXCEED_RATELIMIT","message":"Client 127.0.0.6 exceeds rate limit."}`（**平台文案**）· `cache-control` 被平台改写成 `private, no-store` → 每次刷新全量重下。**并发实测**：首屏同域并发约 **26 个** → 冷启动期容量 ~6 → **8 个 429 + 6 个 200**；热身 9 个并发全 200，再打 12 个 → 11 个 200 + 1 个 429。**打掉哪几个是随机的** → 每次缺的东西不一样 → 每次长得不一样。塌陷形态对应关系实测到：缺 `backgrounds.css`/`companion-home.css` → 整屏荧光绿 · 缺 `layout.css` → 文字叠在一起 · 缺 `remixicon.css` → 图标变方块 · 缺 `idle.webp` → 刘看山变三个 alt 文字 · 缺 `/api/tone` → 桌宠没台词 · 缺 `/api/auth/profile` → 右上角「知乎没连好」（用户录屏 6 帧形态完全不同，正是这一条）。**处置全部落在我们自己的 `server/` + `web/js/`，队友目录一个字没碰**：① **`server/src/lib/web-static.js` 重写** —— 12 张 `<link rel="stylesheet">` **原地**内联成 `<style>`（保持文档顺序 → 级联顺序不变，相对 `url()` 改绝对路径，只 2 处真相对 url），`/web`/`/web/`/`/web/index.html` 改自定义 handler 且**排在 `express.static` 之前** ② **`server/src/lib/asset-guard.js` 新建** —— 内联注入资源守护脚本（图片/script 被 429 打掉自动重试；**不做 CSS 重试**，避免 FOUC）③ **`web/js/api.js`** —— API 退避重试，但**只重试平台级 429**（没到后端、没烧知乎额度），**我们自己的 `ZHIHU_RATE_LIMITED` 绝不重试**（否则再烧一次直答额度）④ 静态资源加缓存头 `STATIC_MAX_AGE_SEC`（默认 300 秒，**平台目前强制 `no-store`，这条先备着**）。**顺带把首屏大字口径切成「问它」**（D66 换了主线但首屏还是旧口径，评审第一眼看到的仍是已下线的产品）—— 沿用代码里已有的「只在还是旧值时才改」惯例（`ASK_TAB_OLD_TITLE` 模式），**队友自己改了我们的代码自动让位**。**实测**：本地 `/web/` 输出 459,004 字符 · `<style data-inline-from>` **12 个** · `<link rel="stylesheet">` 只剩 1 条（Google Fonts，正确跳过）· 浏览器实测背景图/图标/刘看山/底栏 9·0·1 全正常 · console **只有 1 条 log、无 error** · 「问它」面板渲染正常、手动提问返回真实方案 · **契约自检 PASS 14 / WARN 0 / FAIL 0 · 完整回归 PASS 14 / FAIL 0 · 轻量回归 PASS 7 / FAIL 0** · 编码自检 `BOM=N / U+FFFD=0 / CRLF=0`。⚠️ **修复没上线** —— preview 此刻仍指向旧包，见阻塞项。
- **✅【D70】AI Works 部署包已出，官方 helper 七步全跑通**（2026-11-24 20:20—20:50）：
  helper 从平台 step=2 页面**印着的公开地址**直接下（`zhstatic.zhihu.com/skill/application/d6c1-260923/zhihu-ai-works-deploy-helper_v1.2.0.zip`，
  126,719 字节）→ `build-check` PASS 11 → `inspect_node_project` exit 0 → `write_backend_runtime` → `write_deploy_descriptors`
  → `validate_deploy_output` **「deployment input validation passed」exit 0** → `settle_agent` → `create_project_archive`
  → `fix-zip-exec-bit`。
  **产物**：`%TEMP%\congxin\congxin.zip` · **3,139,474 字节 / 84 条目** ·
  **SHA-256（补执行位之后）`bc5e2f2141ad2d5bafdae190b312bec1debbbddeca24f32076d63176d95f4e5c`**。
  **交付副本真机冒烟全过**：`/api/health` 200 · `/api/quota` 200 · `/api/tone` 200（14 句）· `/web/` 200 ·
  `POST /api/advice` **200 / 17.6 秒**（4 步方案 + 5 条真实出处）→ 再问一次 **3 毫秒**命中缓存；
  平台自己的 `npm ci`（68 个包）· `npm ls --omit=dev` 本地也实测过。
  ⚠️ **上传侧平台返 401**（签名校验失败）—— 同尺寸对照包同样失败 → **不是包的问题**，改为用户在自己浏览器手动上传。
- **✅【D69】契约四份文件已同步到 v0.7 / 11 路径**（2026-11-24 20:20—20:40）：
  `contracts/api.json`（v0.7 · `info.description` 整段重写）· `contracts/contract.json`（v0.7 · 11 个 `frozen_endpoints` +
  **新增 `voided_endpoints`** 记 4 个作废路径）· `contracts/CONTRACTS.md`（接口表 / 产品结构段 / 专属底线 / 台词数 13→14 / 新增「「问它」」整节）·
  `scripts/build-check.js`（14→11 路径）。
  **并把「冻结清单 == api.json 路径」焊进 `check-contract.ps1` 第 11 项**（加固，不新增第 15 项）——
  正向 **PASS 14 / WARN 0 / FAIL 0**，**两项反向验证都拦得住**（删冻结清单项 → FAIL；删作废登记 → FAIL）。
- **✅【D68】P1 台词「先这样」已落文档**（2026-11-24 20:15 用户拍板）：
  `contracts/tone.json` **14 句一个字未改**（含认知闭环下线后不再调用的 `mirror`/`fracture`/`question`/`bridge`/`insufficient` —— **保留不删**）；
  新主线 3 句桌宠话**继续当前端固定文案，不进目录**；**新主线不新增任何台词**。`docs/P1-三件产出.md` §2.6 已逐处标注。
- **✅ 静帧 2 已按新主线重画**（用户「图片你上新」）：
  `docs/p1-frames/frame-2-ask.html` + `.png`（1600×900）——
  主题从「2.5D 认知地图 + 断层」换成「**问它**」，画面里每一条数据都是 **11-24 真实调用 `POST /api/advice` 的那次输出**
  （问题 / 判断 `partially_applicable` / 4 步方案 / 5 条出处 / 依据编号一一对应）。
  旧的 `frame-2-terrain-fracture.*` **已删除**（概念已下线，留着会被误当成现行插图）。
  另出 **AI Works 建站封面图** `docs/aiworks/cover-icon.png`（1024×1024，深蓝渐变 + 真刘看山 + 同款字标）。
- **✅ 计划书已定稿 v1.0**（用户「计划书可以定稿」）：
  `docs/产品说明计划书.md` 去掉全部「待人审」标记 · §2.4 / §3.2 的实测数字换成 11-24 当天**两次实跑的真值**
  （失眠 → `applicable` 5 步 5 出处；拖延 → `partially_applicable` 4 步 5 出处）并注明「**步数与条数每次实跑会变，但形状固定**」·
  新增 §5.8 部署包实况 · 补「AI Works『项目说明』精简版」 · 待补清单只剩**公网体验链接**与演示视频。
- **✅ 回归与自检全绿**（2026-11-24 20:5x）：完整回归 **PASS 14 / FAIL 0**（含「问它」三拍：判断/方案/出处对账 + 缓存命中）·
  轻量回归 **PASS 7 / FAIL 0** · 契约自检 **PASS 14 / WARN 0 / FAIL 0** · 编码自检 U+FFFD=0 / 无 BOM / 纯 LF。
- 读通官网规则全文（`/api/content`，2026-11-14 版）→ [rules-知乎S3.md](rules-知乎S3.md) 第十一节。
- **读通官方飞书《知乎黑客松S3- 技术指南》正文**（11-16，该文档公开可读）→ rules 第十一节 11.1—11.10。**解决了三个此前悬空的问题**：800 美元到底是什么（看山积分，D21）、作品要不要做在看山工作台上（不用，官方 FAQ"不限制 Agent 开发工具"）、怎么部署（AI Works 源码发布，且"前端+Node 后端无数据库"有官方口径背书 D15，D22）。
- 下载官方 Skill 包 `zhihu-cli-skill.zip`（107 KB），读通 `references/hackathon.md`（S3 开发者手册摘要）、`hackathon-oauth.md`、`cli.md` → rules 第十二节。**含官网未列的 9 类额度、OAuth 凭证领取时机、提交前检查全本 9 条、人气奖与 OAuth 登录人数的关系。**
- 查到 S2 校园新锐季完整结果（450 校 / 1878 人 / 435 份作品 + 获奖作品形态）→ rules 第十三节，**这是本项目最重要的参照系**。
- 读队友原始提案《Agent Pet OS：概念映射与全量工程目录实战白皮书》，归档于 [sources/队友桌宠想法-原始.txt](sources/队友桌宠想法-原始.txt)。
- 确定选题定位、形态、技术选型、开发顺序、奖线策略 → [decisions.md](decisions.md) D9—D14。
- 建立项目目录：`AGENTS.md` / `docs/` / `docs/sources/`。
- **GitHub 仓库已建并推送**：**<https://github.com/nineanswerer/congxin>**（public，branch `main`），队友 `5zdz5` **已是 collaborator（push 权限），无待处理邀请**（11-16 22:42 经 GitHub API 核实）。密钥不在仓库内（双重确认：rg 扫描 + `git log -p --all`）。**仓库名 11-17 由 `zhihu-study-pet` 改为 `congxin`**——作品名定为「从心」，但 GitHub 会把仓库名里的非 ASCII 字符规范化成连字符，纯中文名不可用（见 D26）。
- **双 AI 协作机制已落地并实跑验证**（D25 / ADR-0001）：上下文四层 L0 契约（`contracts/`）、L1 身份（`AGENTS.md` 为唯一真源，五个平台文件只做指针）、L2 决策（`docs/decisions.md` + `docs/adr/`）、L3 交接（`docs/handoffs/`）；四份提示词（BOOTSTRAP / HANDOFF / CROSS_REVIEW / COMMIT_MSG）；`.githooks/commit-msg` 强制 `Context:`/`Tried:`/`Verify:` 三行；`scripts/check-contract.ps1` 自检**实跑 PASS 8 / WARN 0 / FAIL 0**；hook 实测**空洞提交被拒、`Tried:` 为空被拒、格式正确放行**。
- **机制已升级为"全自动触发"**（D25 结论 6–7）：四个触发点全部自动化 —— **开工**（五个平台指针文件被平台自动加载并指向 `prompts/BOOTSTRAP.md`，新 AI 自己读、自己等确认，**换 AI 平台不用人粘提示词**）、**拉取**（`.githooks/post-checkout` 自动打印开工清单）、**收工**（协议内置交接与自检要求，AI 自己做）、**提交**（人说的理由由 AI 转录进 `.ctx/current.md`，hook 自动填 `Context:` 行，**人不用手改 commit message**）。**人真正要做的只剩"跟 AI 说一句为什么改"。** 自检扩到 **10 项**，实跑 **PASS 10 / WARN 0 / FAIL 0**；commit-msg hook 三个用例实测通过（自动填充 / 空 `Tried:` 被拒 / 人手写优先）。
- **与队友完成首轮对齐**（11-17）：D14（桌宠是主体、知识卡片是产出物）与 D19（角色沿用官方刘看山）**均已定**。队友对"GitHub 提交 + 两人分别用不同 AI"提出疑虑 → 见 D25 与 `docs/协作规范.md`。
- **产品级 API 契约 v0 已冻结**（11-17 晚）→ [contracts/api.json](../contracts/api.json)：**OpenAPI 3.1**。**方向拍板后扩到 v0.2 / 8 个路径**（`/api/behavior/favorites`、`/api/behavior/followees`、`/api/behavior/contents`、`POST /api/behavior/tension`、`POST /api/situation/question`、`GET /api/terrain`、`POST /api/terrain/answer`、`/api/quota`）。**队友现在就能起 mock 并行开工，不必等后端。** 三条硬规则（出处必填 / 空数据≠失败 / 失败说真话）+ 断层诚实底线（至少 2 个信号）已加进 `scripts/check-contract.ps1` 第 11 项，**改坏契约会被自检拦下**。详见 [decisions.md](decisions.md) D28 / D29、交付话术见 [队友对齐清单.md](队友对齐清单.md) 零 G。
- **🔴 产品方向已拍板（B13 关闭，D29）**（11-17 19:05）：**桌宠是交互主体，「认·清」认知闭环是桌宠里的一个功能环节**——不是推翻重做，队友的构想完整保留为亮点模块。形态 **2.5D 分层认知地图 + 断层真 3D 推镜**；闭环位置 **桌宠主动发起的「照镜子」环节**（主流程的一段，不是并列第二条线）；行为对照 **三个信号都做，底线是至少 2 个独立可用**。**D14 原样成立、不需要修订**（原先"若换方向 D14 要修订"的警告作废）。制作阶段已按此重排（见下节 P1—P9）。
- **✅ 分类体系 B14 初版已出（机器可读部分就绪）**（11-17 22:5x）：`contracts/taxonomy.json` = 主题 6 类 + 论证结构 5 类 + 关键词规则 + `unknown` 兜底；`docs/分类体系-B14.md` 是给人看的说明。**已加进自检第 12 项**（类目字段齐全、unknown 在位、阈值 ≥1）。回归脚本 `server/scripts/classify-check.js` **13/13 一致**（收藏 9 + 关注 3 + 创作 1）。详见 D30。
- **✅ `server/` 后端骨架已跑通**（11-17 22:3x）：`server/src/**` = 鉴权 + 退避重试 + 限流处理 + TTL 缓存 + 请求去重 + 分类 + 归一化；**已实现 4 个接口**（`/api/health`、`/api/quota`、`/api/behavior/favorites`、`/api/behavior/followees`、`/api/behavior/contents`）。**真调知乎实跑通过**（`node server/scripts/smoke.js`），密钥只从环境变量读、**不入库**。
- **✅ 认知闭环的 4 个接口已实现并实跑通过**（11-17 23:0x）：`POST /api/behavior/tension`、`POST /api/situation/question`、`GET /api/terrain`、`POST /api/terrain/answer` —— **契约里的 8 个路径现在全部有代码了**。真调知乎跑通（`node server/scripts/smoke-cognition.js`）：断层标签实测输出「你说你重「长期主义」，但你收藏的 **67%（6/9 条）**是「怎么立刻上手」」（强度 0.67 / 置信度 0.6）；情境题题面由 `zhida-fast-1p5` 改写而**出处来自上游**；作答后长出地形块并连上「内倾情感」的桥；伪造 `question_id` 正确返回 404。详见 D31。
- **✅ P1 三件产出已起草**（11-17 22:5x）：`docs/P1-三件产出.md`（一句话场景 ×2 + 5 分钟逐秒脚本 + 静帧说明），静帧 ×2 已出图（`docs/p1-frames/*.png`，1600×900，HTML 稿可改）。**场景与口径已拍板**（主流程 A / 照镜子 A / 口径 67%），台词与镜头仍待逐句审。
- **✅ P1 剩余 4 件事已拍板（11-18，D33）**：① **台词语气做成可选项、默认温和陪伴** ② **Demo 素材用真实知乎数据、不写死文档** ③ **断层断言句保留、不软化**（不确定性用 `confidence_note` + 证据兜） ④ **无刘看山版静帧本期不做**。四项都已落进代码与契约层，**台词逐句仍待人审**。
- **✅ 桌宠语气契约层已落地（11-18）**：`contracts/tone.json` = 2 个语气 × **14 句**台词 + `default: gentle`（**用户拍板过**，自检第 13 项机器校验）；新增 `GET /api/tone`（第 **9** 个路径，切换器选项 + 全部台词）；4 个认知接口接受可选 `tone` 并回 `tone` + `pet_lines`。**实测边界**：同一份自述在 `gentle` / `lively` 下，断层 `label` / 强度 / 置信度 / 信号数 / 证据数**逐字相同**，只有台词变 → `server/scripts/smoke-cognition.js` 里有这条断言。另有**不耗额度**的语气回归脚本 `server/scripts/smoke-tone.js`。
- **✅ 自检扩到 13 项**（11-18 12:0x）：新增第 13 项（语气契约完整性 + 默认值必须是 `gentle` + 台词里不许带数字）；第 11 项同步到 9 个接口并加验 `ToneId.default`。实跑 **PASS 13 / WARN 0 / FAIL 0**。
- **✅ 接入方式定案 + 登录四路径落地（11-18 21:0x，D34）**：**维持后端直连 HTTP API**（MCP 实测只有 4 个工具、Skill 只有 4 个搜索包、OAuth 只有 API 支持 → 三条硬理由，D15 坐实）。契约扩到 **13 个路径**（新增 `GET /api/auth/profile` / `login` / `callback`、`POST /api/auth/logout`），`api.json` 升 **v0.4**；后端 4 个路由**全部已实现**（`server/src/routes/auth.js` + `server/src/zhihu/oauth.js` + `server/src/lib/auth-session.js`），`server/scripts/smoke-auth.js` **实跑全绿**（不耗额度、不需要凭证）。登录身份用 `AsyncLocalStorage` 接进上游调用层（`client.js` 优先用**会话里**的 OAuth token，每个登录用户读自己的数据）。**开发期无会话时 `GET /api/auth/profile` 返回 `developer_account` 模式、昵称字段为 null——不编昵称。**
- **✅ 「Demo 不依赖 OAuth 也能跑」已用真实进程验过（11-18 22:0x）**：起真实后端进程打真实 HTTP，**15/15 全过**——无 Cookie / 过期会话 → `profile` 仍 **200 + `mode: developer_account`**（不是 401）；无 OAuth → `GET /api/behavior/favorites` **200 并拿到真实收藏 9 条**；无凭证 → `login`/`callback` **401 `OAUTH_REQUIRED`（不伪造跳转）**；`logout` 幂等。→ **OAuth 真联调窗口即使只有 12-05 → 12-07，Demo 主路径也不受影响。**
- **⚠️ 本机两个操作坑（11-18 22:0x 实测）**：① **8787 端口绑不上**（`listen EACCES: permission denied 0.0.0.0:8787`，不是被占用，是被系统拒）→ 本地起后端要 `$env:PORT=18787`。② **问题发现额度剩 79/100**（每日 00:00 重置、不结转），这是主路径最紧的一根弦 → `smoke-cognition.js` 每跑一次要 2—4 次问题发现，**别多跑**；不耗额度的是 `smoke-tone.js`（纯逻辑）与 `smoke-auth.js`（25 项，不碰上游）。**11-18 22:1x 复查：已降到 56/100**（`POST /api/cards` 也吃这个额度：1 张卡 ≈ 2 次，N 张 ≈ 1+N；同主题有 5 分钟缓存；**额度计数有延迟，跑完等 15 秒才变**，别因「没涨」以为没花）。**11-18 22:59 再查：已到 87/100（只剩 13）** —— 一次完整演练 ≈ 11 次（3 张主流程卡 + 2 张观点卡 + 情境题）；**每日 00:00 重置、不结转**。
- **✅ `web/` 前端第一版已出并实跑验证（11-18 21:4x，P3 收口）**：队友 11-17 起联系不上，用户 11-18 21:3x 拍板「队友那边先不管，你先弄一版能用的」→ **`web/` 由 `nineanswerer` 临时接管**（目录归属已改，`docs/协作规范.md` 记了原因与 5 条边界）。**零依赖、零构建、零 npm 包**：`serve.js`（静态服务 + `/api` 代理）+ `index.html` + `css/app.css` + `js/{api,pet,quiz,terrain,app,demo}.js`。**已跑通**：桌宠渲染 + 开场台词（取自 `/api/tone`）+ 语气切换器（温和陪伴 / 活泼）+ 真实收藏 9 条 + 底栏真实统计（9 条收藏 / 44% 工具与环境 / 778 天跨度 / 1 个独立行为信号）+ 「照镜子」问卷→断层→情境题→作答→2.5D 地形。**无头 Chrome 实拍**：`web/docs-shot-1.png`（1600×900）。**接了契约 14 个路径中的 12 个**；未接的 3 个是 OAuth 登录（凭证 12-05 才拿得到，Demo 不依赖）。**前端不写死台词、不内置 mock 素材**（见 `web/README.md` 的交接说明）。
- **✅ 密钥扫描覆盖 `web/`**（11-18 21:4x）：`check-contract.ps1` 第 4 项用 `git ls-files --cached --others --exclude-standard`，**未跟踪的新文件也进扫描** → 实跑扫描 111 个文件（含 `web/` 全部 9 个）未发现疑似密钥。
- **✅ 全链路演练实跑 9/9 步通过，并揪出 4 个真 bug 已修**（11-18 22:0x）：用内置浏览器跑 `?demo=1` 走完「喂收藏 → 补观点 → 照镜子 → 问卷 → 断层 → 出题 → 作答 → 地形」——**真实知乎数据，全程无 mock**。**修掉的 4 个 bug**：① **情境题永远空**——主题词是从收藏标题切 n-gram 猜出来的，猜出 `ubuntu`，知乎搜不到 → 改成**按可靠性排序挨个试**（问卷自述特质词 → 已有 topic → n-gram 兜底，最多 3 个，单个失败不算整段失败）；② **地形盖住整屏**——`.terrain-wrap` 这条 CSS **从来没被用过**，`.terrain` 的 `inset:0` 锚到了整个 `.stage` → 补上定位上下文；③ **断层标记错位**——overlay 自己撑满容器、与图层不在同一坐标系 → 改成和图层同一个盒子；④ **三层互相压、文字糊成一片** → 画布 300→220px、层间距 ±190、摘要截断 7 字、块宽 104。**截图**：`web/docs-shot-1.png`（主流程）、`web/docs-shot-terrain.png`（2.5D 地形 + 断层标记）。

- **✅ P3 前端第二轮：补 4 个缺口 + 全链路回归（11-18 22:0x—22:5x）**：用户拍板「**只补 4 个缺口，不改形态**」（保留「工作台」形态，不改成脚本的「演出」形态）+「**主流程那张卡片换成契约里的真卡片**」。① **主流程卡片改走 `POST /api/cards`** —— 每张 = 知乎问题 + 真实回答 + **原回答 URL**（实测 3 张真卡片，带真实知乎链接）；② **台词从 9 句补到契约 14 句全用上**（新接 `offer`/`source`/`viewpoints`/`disagree`/`park`/`closing`）；③ **收藏可以拖到桌宠身上开嚼**（`dragover` 亮起 → `drop` → 吐卡片）；④ **跨层桥画出来了**（按块在**屏幕上的实际位置**连，含 perspective 投影；实拍 3 座绿虚线桥）。**回归**：`?demo=1&fast=1` **9/9 步全过、0 报错**；另单独验了拖拽落桌宠、`viewpoints`→`disagree` 两拍台词、跨层桥。截图 `web/docs-shot-terrain.png` 已更新（含 3 座桥）。
- **✅「吵起来的两边」改成真的两方（11-19 12:5x，用户拍板「改后端做成真两方」）**：`POST /api/cards` 新增**可选**参数 `same_question`（契约 v0.5 → **v0.6**，14 个路径**不变**）。传 `true` → 返回的卡片全部来自**同一个知乎问题下的不同回答**（`source.question_url` 相同、`source.answer_url` 不同）；不传则**行为一个字都没变**。**额度反而省 1 次**（同题两答只碰 1 个问题 ≈ 1+1 次，默认模式是 1+N 次）——因为上游 `question_answers` **一次调用本来就返回 3 条回答**，而原来的代码只用第 1 条。**实跑证据**：`POST /api/cards {"topic":"长期主义","count":2,"same_question":true}` → 同题两条回答（`question/2023732891524310793`）；默认模式 `count:3` → 三个不同问题（没被改坏）；`server/scripts/smoke-cards.js` 加了断言并**实跑全绿**；浏览器实跑 → 面板标题「**同一个问题的两条回答**」，问题标题只出现一次，两张卡标成「回答 ①/②」且原回答链接不同。**决策与备选方案见 [adr/ADR-0002](adr/ADR-0002-same-question-two-sides.md)**。
- **⚠️ 残留缺口（上游天花板，不是我们能补的）**：上游回答对象**只有 4 个字段**（`ContentType` / `ContentToken` / `Url` / `Summary`，11-19 实测）——**没有作者、没有立场**。所以「**来自两个不同的人**」「**观点相反**」仍然**无法在数据层验证**。**台词已按用户 11-19 拍板改成可证版本**（见 D38）：`viewpoints` =「同一个问题的两条答案，我都带来了——原话，附链接。」、`disagree` =「同一个问题，两条答案。我不替你选。」——**只说数据说得出的事实**。**面板文案同样只写「同题 · 两条真实回答」**，不写「来自两个人」。
- **✅ 台词逐句审的 3 件事已拍板落库 + 脚本引文逐字校准（11-19 15:3x，D45）**：`fracture`（3:50—4:05，与数据陈述句同一拍）与 `insufficient`（3:25 **边界态**，只在信号不足时出现）**都排进脚本**；4:05 补**给主持人的操作备忘**（点「看地形」→ **等地图出来 ≈4—5 秒** → 再点断层标记），**上台不念**。顺带查出**第三类「脚本说会演、屏幕上没有」**：3:25 与 3:50 原引的两句数据陈述句**是意译**，屏幕原文在后端 `label` / `behavioral_side.summary` 里 → 已逐字校准，并写明「**桌宠台词**」列混了两种字（气泡 = 14 句语气台词；面板上的字 = 数据陈述句，照抄别改写）。**台词目录 14 句 × 2 语气一个字没改**；脚本现为 **18 拍 + 1 边界态，14 句全部在册**。
- **✅✅ 部署预检 + 打包 + 部署指南三件套已出（11-19 15:4x—16:0x，D46）** —— 直接冲着 **12-04 前必须拿到正式公网链接**这条硬截止去的：① **`scripts/build-check.js`**（ESM，模块 + CLI）：检查一份源码树能不能当作品跑，**11 项**（必需文件 14 个 / 刘看山 6 动作素材每个 ≥10KB / 契约 api.json 14 路径 + tone.json 默认 gentle + 14 句 + taxonomy.json 6 主题类 / 根 package.json 的 `start`+`express`+`engines` / server 是 ESM / **静态只挂 `/web/` 与 `/assets/` 没挂仓库根** / **挂载顺序接口→静态→404** / **密钥支持三种来源** / 运行时不依赖 `docs/`）；② **`scripts/pack-deploy.js`**：**白名单**打包（不扫全仓库），显式排除 `node_modules` `.git` `.ctx` `dist` `docs` `.env*` `access_secret` `secrets/` 与 5 张文档截图，另出 `.manifest.json`（每文件 SHA-256 + 字节数）；③ **`scripts/predeploy-check.js`**：**六步**预检 → 源码树静态检查 → 打包 → **解包到临时目录** → 对解包结果再检查 → **把本机 Access Secret 读进内存逐文件比对包里有没有它** → 在临时目录**真起进程**探 5 个 URL → 跑仓库自检 → 生成「部署前 9 条检查」对照报告。**实跑全绿**：源码树 **PASS 11/0/0** + 解包结果 **PASS 11/0/0** + 密钥比对「包里没有本机 Access Secret」+ 起进程探测 `302 /`·`200 /web/`·`200 /assets/kanshan/idle.webp`·`200 /api/health`·`404 /api/nope` + 仓库自检 **PASS 13/0/0**；部署包 **76 文件 / 1882 KB**（排除 5 张文档截图前是 5678 KB，压掉 67%）；④ **`docs/部署指南.md`**（9.5KB）：平台四步 + **密钥怎么给**（三种方式 + 怎么验配对没配对）+ 端口 + **preview 上必须自己走一遍的 7 步清单** + 9 条摘要 + 常见故障表。
- **✅ 顺带修掉三处「实现和契约对不上」的真 bug（同一批，D46）** —— 这些在本地演示看不出来，**在评委浏览器里就是假提示和空白页**：
  ① **密钥注入形态错配**——官方口径是「**秘钥写入文件直接构建**」，而 `server/src/config.js` **只读环境变量** → 按官方那样注入会启动失败 → 已加 `resolveAccessSecret()`（env → env 指的文件 → 约定路径 `secrets/access_secret` 等 4 处）；② **缺凭据会崩成 CrashLoop**——原来缺密钥就 `process.exit(1)` → 评委打开链接是一片空白 → 改为**警告 + 照常启动**，缺凭据的接口回**真实错误提示**、不返回假数据（正合赛规第 7 条）；③ **额度耗尽提示是假的**——`ZHIHU_QUOTA_EXHAUSTED` 在错误目录和 `contracts/api.json` 的 `x-error-codes` 里**早就定义**（hint「今天的调用次数用完了，明天再来」），但**代码里从没抛出过** → 实测上游 `Code=30002 / "quota exceeded"` 时前端显示「知乎那边暂时不稳定，稍后重试」（**重试没用**）→ 已让实现回到既有契约（**不动契约**）；另把上游 `Code=20001` 映射到 `ZHIHU_AUTH_INVALID`、**坏 JSON 从 500 改回 400 `VALIDATION_ERROR`**。**重启后实测**：额度耗尽 → **429** `ZHIHU_QUOTA_EXHAUSTED` / 「今天的调用次数用完了，明天再来」/ `retryable:false`；坏 JSON → **400** `VALIDATION_ERROR` / 「请求格式不对，检查一下发过来的内容」。
- **✅ D42 遗留回归修掉：`scripts/` 变 ESM 把素材脚本改坏了（11-19 15:4x）** —— 根 `package.json` 加 `"type": "module"` 后，`scripts/build-kanshan-assets.js` 里的 CJS `require()` / `__dirname` **整个素材脚本跑不起来** → 已转 ESM（`import` + `fileURLToPath(import.meta.url)`），实跑 6 个动作逐字节重转后 **`assets/` 无 diff**（顺带再验一次 D39 参数定案）。⚠️ **`node --check` 查不出 CJS/ESM 混用**，只能实跑或看最近的 `package.json`。
- **✅✅ 完整回归 15 拍全过（11-20 11:5x）—— P3 主流程已达到「可交人看」的状态** —— 额度 00:00 重置后实跑 `node scripts\regress-p3.js`：**PASS 15 / FAIL 0 / 共 15 拍**。逐拍：首屏 **9 条真实收藏** + 跨度 778 天集中在 6 天 ✅ ｜ 关注列表 **3 个** ✅ ｜ 创作信号 **1 条**（4:05 那句用户原话的来源）✅ ｜ 语气目录 **default=gentle / 14 句** ✅ ｜ 登录态 `developer_account` ✅ ｜ 失败态 404 + 契约信封 + 中文提示「这个地址好像写错了」✅ ｜ 吐 **3 张卡带全出处** ✅ ｜ 出处是 `zhihu.com` **真链接**（`question/2031669488362505576/answer/2040099563361587802`）✅ ｜ **同题两答**（同 question_url / 不同 answer_url）✅ ｜ 断层 **3 个信号 / 强度 0.67 / 4 条证据** ✅ ｜ 断层标签**与脚本逐字一致** ✅ ｜ 行为侧陈述句含 **778 天 / 只集中在 6 天** ✅ ｜ 情境题**带出处** ✅ ｜ 作答长出新地块 + 1 座桥 ✅ ｜ 地形 **3 层 + 断层标记 1 处** ✅。⚠️ **上次唯一的 FAIL 确实是撞上额度用光，不是代码问题** —— 这次额度足就全绿。**实际只烧了 6 次「找问题」**（不是预估的 11）：同题两答与 5 分钟缓存省掉了；另用直答 1 次、知乎用户数据 20 次、创作能力 4 次，**「找问题」还剩 94 次**，够排练好几遍完整演示。
- **✅ 明早额度满额后的一键回归脚本已出（11-19 16:0x）** —— **`scripts/regress-p3.js`**：按 5 分钟 Demo 脚本顺序走 **HTTP** 全链路，每拍打印「期望/实际/判定」，末尾出**逐拍对照清单**；覆盖 **15 拍**（首屏真实收藏 + 跨度统计 → 关注 3 个 → 创作 1 条 → 语气目录 14 句 → 登录态 `developer_account` → 404 契约信封 → 吐 3 张带出处真卡 → 出处是 zhihu.com 真链接 → 同题两答 → 断层 3 信号/强度 0.67/4 条证据 → 断层标签逐字比对 → 行为侧陈述句含 778 天 → 情境题带出处 → 作答长新地块 → 地形 3 层 + 断层标记）；带 `x-session-id: regress-p3` **独立会话**（不串味）、`--light`（**不烧额度**）、跑前跑后额度快照。**实跑**：`--light` **6/6 PASS、0 消耗**；完整版第一次 **14/15**（唯一 FAIL 是脚本读错地形响应结构——实际是 `data.terrain.layers` 为**对象**，已修）；修后第二次 **13/14**，唯一 FAIL 是 4:15 情境题 —— **上游 `Code=30002 quota exceeded`**（说明额度真的耗尽了，脚本**如实报 FAIL 并继续跑完**）；**11-20 额度重置后第三次跑 = 15/15 全过**。
- **✅ 落版实现（脚本最后一拍 4:50—5:00，11-20 12:0x）** —— 5 分钟 Demo 脚本 18 拍里**唯一还没实现**的一拍（§2.4 原标【提】）。**内容按 P1 脚本逐字实现**：作品名「从心」· 赛道「AI × 陪伴与交互」·「每张卡片都能点回知乎原话」，桌宠回到 `idle`。**这一拍没有台词**（台词在上一拍 4:30—4:50 的 `closing`）→ **不归语气目录管**，文案在 `web/index.html`，逻辑在**新文件 `web/js/outro.js`**（注释写明为什么单独一个文件）。**四种触发**：顶栏「落版」按钮 / 键盘 `O` 或 `End` / `Esc` 关 / `?demo=1` 演练**第 9 步自动出**。**实测**：单进程形态下浏览器实拍——按键出（opacity 0→1、`aria-hidden` 同步、桌宠切 idle）、`Esc` 收、按钮点击出、**`?demo=1` 演练 10 步全过**（新增第 9 步「落版」）**console 0 error / 0 warning、29 个请求全 200/304、0 失败**。**素材缺失时降级**（图加载不出来就隐藏图、只留文字，D19 的要求）。
- **✅ 队友体验入口已就绪（11-20 12:5x）** —— 用户问「怎么让队友知道相关内容、让他体验」，产出三件：① **新建 `docs/队友体验指南.md`**（给队友的操作手册：3 分钟速跑、Access Secret 怎么自己申请、三种体验方式、**人眼要判的三件事**、需要回的三件事、故障排查表）；② **`docs/队友对齐清单.md` 加「零 L」节**（可直接复制转发的一段话 + **发送口径**：零 G/H/K 至今**都没发过**，只发零 L 即可，零 G 降级为「队友要接手代码时才补发」）；③ **README** 状态行更新到 11-20 + 文档索引加一行。**密钥方案：不共享本机 Access Secret** —— 官方 14.3 明确 Access Secret 由开发者**自行申请**（单账号最多 20 个、**同账号共享额度**），队友用**自己的**知乎账号申请一个即可，**不占本方额度池**；这也正面解掉官方提交前检查第 6 条「**提交的体验账号不复用个人或生产管理账号**」——各自用自己的账号，公网链接里不会露出本方个人数据。**实跑验证**：仓库根 `npm start` → `/web/` 与 `/api/health` 均 **200**、前端静态自动挂载；密钥放 `secrets/access_secret`（仓库根）与 `server/secrets/access_secret`（`cd server`）**两条路径都实测读得到**（stderr 无警告）；**空文件 → stderr 打「⚠️ 配置不完整 —— 没读到知乎 Access Secret」**（证明警告机制有效，即前一次"无警告"确实等于读到了）。⚠️ **测试用的假密钥文件已删除**（`secrets/`、`server/secrets/` 已清理，仓库内无残留）。
- **✅ 一键本地启动脚本 `scripts/start-local.ps1`（11-20 13:0x）** —— 本会话内后台常驻服务**已被回收 4 次**（每次都是 1 小时硬上限，表现是「演示到一半服务没了」且无任何报错），这个坑值得一次性修掉。脚本行为：**体检 → 前台常驻**（`Ctrl+C` 才停，不受任何超时限制）：① Node 版本 ≥20（实测本机 24.19.0）② 依赖装没装（缺就 `npm install`，只有 express 一个）③ **密钥在不在**（按 `config.js` 同一套优先级找 4 处：env → `ZHIHU_ACCESS_SECRET_FILE` → 仓库根 `secrets/access_secret` → **本机知乎 CLI 落点 `~\.zhihu-cli\access_secret`**，最后这条是新增的——用户密钥本来就在那儿，之前每次都得手敲 env）④ 端口有没有被占（被占就提示换 `-Port`）。**读不到密钥也照常起**，接口回真实错误提示。**实跑**：`-Check` 体检四项全绿；真启动后 `/web/` **200**、`/api/health` **200**、**`/api/quota` 真的回上游数据**（问题发现 used=19）→ 证明密钥确实生效、真调知乎。**`.ps1` 按规矩写成 UTF-8 with BOM**（实测 BOM `EF BB BF`、U+FFFD 0、纯 LF 行尾）。已接进 README「快速开始」与队友体验指南的「方式 A」。
- **✅ 队友 `web/apple-daily-redesign` 分支已全量合入 main（11-22，D51）** —— 队友 `5zdz5` 的 7 个提交（11-21，+1125 / −380，9 个文件）：《从心日报》头版做成默认首屏、Apple HIG 风改造（含深浅双模式）、hallmark 审计全清、桌宠指针跟随与转场、地形块碰撞避让。**merge-base = `94d6b75` → 零冲突 fast-forward**，HEAD 前进到 `b7959d2`。**合前逐项核对过**：① 日报字段与后端契约对得上（`buildFavoritesSignal` / `computeSpan` / `normalizeContentItem` / `distribution('topic')` 四组字段逐个比对 `server/src/services/behavior.js` + `server/src/lib/classify.js`；`computeSpan` 空时回 `null`，日报侧 `?? {}` 兜住）② **无外链**（`web/` 里所有 `https?://` 只有 localhost 开发地址与 SVG 命名空间，`web/css/` 无任何 `url()` → 评审现场断网不会白屏）③ **后端一行没改**，只用现有 `/api/behavior/favorites`、`/api/quota`、`/api/auth/profile`。
- **✅ 作品名口径回「从心」+ 日报空态兜底（11-22，D51）** —— 用户拍板「作品名仍叫『从心』，日报算产品里的一个功能页」。`<title>从心日报 · …</title>` → `<title>从心 · 把你的收藏印成一张报</title>`，meta description 改成「从心：桌宠陪你干活，也把你的知乎收藏与阅读痕迹印成一张复古报刊头版，每张都能点回原文。」**报头刊名「从心日报」保留**（它是产品里那份报纸的刊名，不是作品名）。**顺手补掉队友分支带出来的一个真缺陷**：`renderDaily()` 原先写在 `try` 块里、又在 `await getFavorites(9)` 之后 → 收藏接口一抛异常，`#daily-paper` 无人填 → **首屏纯白空框**（11-22 实测确认）→ 已把渲染移到 try/catch 之外，失败时传 `error`，**照常印一份报**并如实说「知乎凭据没配好或已失效，这次读不到知乎上的数据。」，额度显示「—」不编数字。实测：18801 端口**无密钥**起服务 → `/api/behavior/favorites` 回 401 → 首屏照常出报，不留白。commit `5135ef8`，已推 `origin/main`。
- **✅ 交付包重出 + 官方探测器全链跑通（11-22，D53）** —— `web/` 变了（新增 `daily.js` + `apple-tokens.css`），交付包重出：**62 个条目**、`scf_bootstrap` = 0755 / 其余 61 个 0644、`testzip` 全过、**无 `.env` / `node_modules` / `docs/` / `.git` / 任何密钥**；官方探测器 **exit 0 / 0 error / 3 warning**（`W_DYNAMIC_ROUTES`×2、`W_HEALTHCHECK_ABSENT`×1）；`build-check` 对交付目录 **PASS 12 / WARN 0 / FAIL 0**。**交付链不再需要 `--build-validation`**（那个文件在 `_tmp/` 里活不过第二次重跑，且官方归档器 `SKIP_FILES` 里有它 → 对交付包没意义）。⚠️ **两个 SHA-256 别混**：归档器打印的是补执行位**之前**的 `6cafd3f7…`，最终交付文件是 `5CACC76B3F01D275E42422556C05C154BD3DE5360BDE366F59889E0F0AC54D71`。**本机 helper 与平台现在发的 `zhihu-ai-works-deploy-helper_v1.2.0.zip` 逐字节相同**（只差 `__pycache__`）→ 交付包用的就是当前官方工具链。
- **🔴 AI Works 上传被平台侧挡住，已定位到具体原因（11-22，D52）** —— **不是我们的包的问题**：平台 step=2「上传源码」传包 → 页面报「**上传失败** / 文件上传未完成，请检查网络后重新上传。」逐段抓包：`GET /api/v4/creation_project/source_upload/precheck` → **200**（包合规）→ 加载 `unpkg.zhimg.com/ali-oss@6.8.0` → `POST https://media.zhihu.com/zos/api?action=ApplyUpload&version=v1` → **401**，响应体原文 `{"code":10201,"error":{"name":"Unauthorized","message":"signature verification failed"}}`。**造了一个 126 字节的对照 ZIP 传上去 → 同样 401、同一句报错**；刷新页面 / 重新开标签页 / 换全新页面，全部复现；时钟因素排除（本机与 `www.zhihu.com` / `unpkg.zhimg.com` / `zhstatic.zhihu.com` 的 Date 头偏移 < 0.05 分钟）。→ **OSS 上传签名校验失败，是平台页面自己算的上传凭据被拒**。另外两条路替代不了：**站外链接**要我们自己先有公网地址（本项目是 Node 后端，静态托管跑不起来）；**GitHub 仓库**只「展示源码入口」还要绑 GitHub 账号，**不给公网体验链接**。→ **下一步：用户在自己的 Chrome / Edge 里手动传同一个 ZIP**（见 B20）。
- **✅ 上传页两项审核声明已按实际功能改正（11-22）** —— 原先两项都是「否」。**「大模型生成内容」改为「是」**（情境题题面确实由知乎直答 `zhida-fast-1p5` 改写）。**「账号登录」保持「否」**：本地核实 `web/README.md:258`「**登录入口缺失**：12-05 拿到 OAuth 凭证后补 3 个 auth 路径的 UI」、`web/README.md:124`「3 个 auth 路径**没接**」——部署出来的界面根本没有登录入口（顶栏显示「开发期自读（还没接知乎登录）」）；且选了「是」平台会强制要「测试账号 / 测试密码」，我们**没有可交的对口账号**（官方第 6 条还要求「不复用个人或生产管理账号」）。**这两项在点「发布项目」之前都能再改**，等 12-05 拿到 OAuth 凭证后再定是否切「是」。
- **✅ 已合并的分支已清理（11-23 12:5x）** —— 远端 `web/apple-daily-redesign`（PR #1 已 ff 合并，分支内容 100% 已在 main）+ 本地 `review/apple-daily-redesign` **都已删掉**，`git ls-remote origin` 现在只剩 `main`。删前逐条核对过：`merge-base --is-ancestor` = 是、`git log origin/main..origin/web/apple-daily-redesign` = **空** → **删掉零丢失**。另：分支头 `b7959d2` 的提交时间（11-21 17:28）**早于** PR 合并时间（11-22 16:39）→ 是**当初忘了删**，不是队友新推的。`refs/pull/1/head` 是 GitHub 的 PR 存档，**不需要也不该删**。
- **✅ 队友 11-23 新提交 `9601112` 已验：没打坏主流程，但带来了交付包白名单缺口（11-23 13:0x，D57）** —— 队友直接往 main 推了「陪伴空间改 Apple 玻璃风并加桌宠动效视频（去山/多端/双模式）」（11 个文件、+4024 / −103）：新首屏「读过的东西，它会替你记着」、**companion 陪伴浮窗**（点桌宠搭话，本地规则回应 + 台词目录，**如实写「不是 AI 大模型、记忆只在这台浏览器」**）、桌宠动效视频、remixicon 图标字体、陪伴空间背景图、深浅双模式。**主流程没坏**：回归 **PASS 15 / FAIL 0**、契约自检 **PASS 13 / WARN 0 / FAIL 0**、浏览器 console **0 错**、网络 **0 失败**。**但交付包白名单漏了 4 个文件**（`web/vendor/remixicon/` 的 css + woff2、`web/assets/companion/` 的背景图 + mp4）—— **是 D56 那道打包自检当场报错抓住的**（它第一次真正派上用场）→ 已把这两个目录**整目录**加进白名单，并让自检认得「运行时拼目录」的纯文件名 → 交付副本实测：9 个新文件**全 200**、静态资源**0 失败**、console **0 错**、10 条失败全是无密钥的 API 401（诚实降级，页头写「额度没读到」）。
- **✅ 交付包降级为「非当前优先级」，先把功能做完（11-23 13:1x，D58）** —— 用户明示「交付包先不着急给，先把所有的功能什么的做好再说」→ **打包 / 申请部署密钥 / 上传全部推后到功能收口之后**；代码侧该修的照修（D57 的白名单 + 打包自检属于**开发期的代码活**，不是交包动作，**要留着** —— 队友再往 `web/` 加运行期文件时打包当场报错，防的是线上白屏）。⚠️ **连带判断**：`web/` 还会继续变（**P4 真 3D 推镜**未做、**P5/P6** 未开始）→ **交包要等这些做完**，否则要重出好几次 —— 「先做功能」和「最后只交一次包」是同一件事。
- **✅ commit 的 Context 改成写「结论」，不抄聊天原文（11-23 13:1x，D59）** —— 三行格式（标题 + `Context` / `Tried` / `Verify`）是**仓库自己的规矩**（`prompts/COMMIT_MSG.md` 定义 + `.githooks/commit-msg` 本地强制，缺任意一行拒绝提交），**不是 AI 发明**；但「把聊天原话整段抄进 Context」是 **AI 的做法**，而且规范原文就写着「**Context 行必须由人给，AI 不许代写**」→ 已在 `prompts/COMMIT_MSG.md` 加一节「**写成结论，不要写成聊天记录**」（含正反例与判定标准：半年后单独读还成立吗）→ **从这条起 Context 只写结论式理由**，原始对话只留在本地 `.ctx/`（已 gitignore）与交接文档里。⚠️ **已推送的那条 `0061915` 的 Context 仍在公开历史里**（本仓库是公开的）→ 要不要 force-push 重写共享 main，**等用户点头**，未动。
- **✅ P5「界面拟真」按用户拍板改完并双服务实测（11-23 22:0x—22:1x，D64）** —— 静态扫 `web/` + 浏览器实地核对（18800 好密钥 / 18801 坏密钥两个服务）共定位 **9 处开发者痕迹**；用户四问**全选推荐项**：① 首屏大桌宠换**官方刘看山 WebP 动效**（`assets/kanshan/idle.webp`）—— 原先的 AI 生成 mp4 **画面里烧着「视频由AI生成」水印**，与页脚「形象来自知乎官方黑客松开放素材」的声明冲突，**该文件已删除**；② 顶栏两个胶囊**收进可展开详情**（`#nav-detail` 面板：身份 / 今日额度），顶栏只留一句短状态，`#pill-quota` 默认隐藏（**额度失败的原因仍直接上顶栏，不藏进折叠** —— 收起数字可以，藏原因不行，D62 / 官方第 7 条）；③ **英文错误码从界面藏起来只进 console**（`showFail()` 去掉 `<span class="code">`，改 `console.warn`）；④ 其余开发者痕迹**全部换成产品口吻**（来源标签「真实数据」→「它查到的」、「台词目录」→「它记着的」、兜底话不再提台词目录、底栏去掉复现命令、网络失败提示改中性文案）。**顺手修一个功能 bug**：额度接口真实形状是 `{apis:[{api_id,total,used,remaining}]}`，原代码读的键根本不存在 → **桌宠答额度只会念两个「—」**，现按 `api_id` 取真值。**实测**：首屏是官方 WebP（挥手、清晰、无水印）／顶栏只剩「● 还没接知乎登录」／额度胶囊默认隐藏／展开才见「身份 / 今日额度」／桌宠答额度报真数字／坏密钥下界面**无英文错误码**、控制台 **3 warn / 0 error**；契约自检 **PASS 13 / WARN 0 / FAIL 0**；回归 **PASS 6 / FAIL 0**。⚠️ **台词目录 14 句一字未改**。⚠️ **未做**：P6 动画/文案/排版；**队友尚未被告知首屏 AI 视频已换成官方 WebP**（那个 mp4 是队友 `9601112` 提交的）。✅ 顺带核实：首屏背景图右下角那个「AI生成 WORKBUDD」水印**不用管** —— 几何核算证明任何视口、任何滚动位置，可见源图 x 上限恒为 ≈1370 < 水印左边界 1416，**永远裁在可见区外**（D64 补充核实）。
- **✅ 分工定案：队友做视觉与设计，我们做功能（11-24 11:1x，D65）** —— 用户原话「不要全部自己做吧，让队友做视觉和设计的部分，我们做功能这些的部分，最好是分开分工，写到仓库文件中」。**目录级硬边界**：队友 `5zdz5` = `web/index.html` + `web/css/` + `web/assets/` + `assets/` + `docs/adr/`；本会话 = `web/js/` + `server/` + `contracts/` + `scripts/` + `docs/decisions.md` + `docs/status.md`。**接缝只有 `web/index.html` 一处** → 用**界面契约**兜住：新增 `contracts/ui-contract.json` 冻结 **39 个 id + 4 个 class + 1 个 data 属性**，**我们要加界面元素一律在 `web/js/` 里建 DOM**；`check-contract.ps1` **新增第 14 项**当场校验（钩子少一个 → `FAIL` 退出码 1）。**实测**：自检 **PASS 14 / WARN 0 / FAIL 0**；把 `id="ch-pet"` 改坏 → 当场 `FAIL`，改回即恢复。**提交方式**：队友走 PR（D41 触发条件「队友回来」已满足），我们继续直推 main。**新文件 `docs/分工-视觉与功能.md`**（完整边界 + 双方交付物 + 验收标准）、`docs/协作规范.md` 目录所有权表已改、给队友的确认稿写进 `docs/队友对齐清单.md` **零 M**（**待用户发送**）



- **✅ P3 闭环完整实测通过（11-19 13:1x，AI 代跑「人手点一遍」）**：用内置浏览器把 P3 出口条件的**整条主流程手动点了一遍**（拖拽用合成 DragEvent + DataTransfer，不是走 `?demo=1` 自动脚本）。**逐段结果**：① 首屏 9 条真实收藏 + 底栏真实统计（9 条 / 44% 工具与环境 / 778 天跨度 / 1 个独立行为信号）+ 额度标签「问题发现 剩 80/100」✅ ② 拖一条收藏到桌宠 → `is-drop` 亮起 → `chew` → 吐 **3 张真卡片**（知乎问题 + 真实回答 + 原回答 URL）✅ ③ 点「出处」→ **真的打开了知乎原回答页**（标题「有没有便宜的ERP软件推荐？ - 知乎」，URL 与卡片 href 逐字一致）✅ ④ 「知乎上大家怎么说」→ **同题两答**（同 `question_url: 1982853673722872065`、不同 `answer_url`，问题标题只出现一次，卡上标「回答 ①/②」，中间 VS 分界线）✅ ⑤ 切「照镜子」→ `mirror` 台词主动发起 → 6 题问卷 ✅ ⑥ 断层：标签**逐字对上脚本 3:25 那句**「你说你重「长期主义」，但你收藏的 **67%（6/9 条）**是「怎么立刻上手」」，强度 67% / 置信度 60% / 由 3 个信号推断，证据栏挂 3 条真实收藏链接 ✅ ⑦ 情境题（带知乎问题标题 + 原回答链接，模型改写题面）✅ ⑧ 作答 → 地形长出一块 + 「新桥：这道题答出了你自述里的内倾思维」✅ ⑨ 三层地形 + 断层标记（点标记 → CSS 强视差推近特写）→ `closing`「从心。你想清楚了什么，它才算数。」✅
  - **网络账**：整轮 **28 个请求全 200、0 失败**；**console 0 error / 0 warning**；`?demo=1&fast=1` 回归 **9/9 步全过**（console 只有 9 条 demo 步骤日志）。
  - **失败态两头都是真话（已实跑）**：断网 → 面板显示「去知乎翻失败：连不上后端。先确认 node server/src/index.js 在跑（端口用 18787…）」+ `NETWORK_ERROR`；额度耗尽 → 「去知乎翻失败：问题发现额度用完了，等明天 00:00 重置再来」+ `QUOTA_EXHAUSTED`；桌宠切 `error` 态（灰度）、按钮自动恢复可点。**后端错误信封也验过**：404 → `NOT_FOUND`「这个地址好像写错了」；缺 topic → 400 `VALIDATION_ERROR`「还没告诉我这堆资料是关于什么的，换个说法再试」；伪造 `question_id` → 404。
  - **节奏（真实耗时，冷缓存）**：首屏 2.2s ｜ 拖拽→吐卡 **≈6s** ｜ 补观点 **≈3s**（缓存命中 **0.35s**）｜ 断层 **6.5s** ｜ 情境题 **4.6s** ｜ 作答 **5.0s** ｜ 地形 **3.5—4s** → **纯后端等待 ≈31s**，加人工操作（拖一条、答 6 题、答情境题、念台词）≈2 分钟 → **5 分钟够用，有富余**。⚠️ **决赛现场服务器是冷的**，第一拍要留 6 秒，别按热缓存的 0.35 秒排节奏。
- **✅ 顺手修掉一个演示事故级布局 bug（11-19 13:0x）**：`.stage` 是 grid 但**没定义行高** → 隐式行按内容撑到 645px（> 可用 504px）→ **左栏「材料」列表溢出、压在底栏统计行上，文字重叠**（1920×1080 实拍复现）。修法：`grid-template-rows: minmax(0, 1fr)` 锁行高 + `.pet { min-height:0; overflow-y:auto }` + `.pet > * { flex:none }`（**flex 子项默认会被压扁** → 气泡小字被裁一半）+ 滚动条收窄到 6px（原 15px 会压在气泡上）。修后实测：气泡完整、底栏干净、左右两栏各自滚动。
- **✅ 本次实测发现的 4 个待修问题已全部修掉（11-19 13:45—15:0x，P3 收口前，用户认可素材改动留在 main 后由本会话实施）**：① **500 响应泄露服务器绝对路径与堆栈**——`toApiError` 把 `err.stack` 塞进 `error.detail`，坏 JSON 会把 `C:\Users\steam\Desktop\从心\server\node_modules\body-parser\...` 原样吐给浏览器（赛规红线）→ **响应里只留短 id**（如 `err_srg5g39a`），栈**只进服务端日志**，另加 `scrubDetail()` 安全网统一洗路径/栈帧；② **情境题主题漂移**——问卷特质词排在最前 → 主题词「长期主义」召回的是「基金 30 年定投」，跟收藏（软件测试/UML/Ubuntu）不搭、台词悬空 → **改成 `state.topic`（这轮实际喂它的主题）优先**，材料侧其次、特质词兜底，并把卡片用过的知乎问题 URL 传 `answered_sources`；实测情境题现在来自知乎原问题「**新人如何入门和学习软件测试？**」，改写成「你整理了一份软件测试入门学习资料…先补全提取码 vs 先更新最新内容」——**跟收藏接得上**；③ **失败时桌宠不说话**——新增 `petSayFail()`，6 处 catch 全部改成**桌宠自己开口说后端 `user_hint`** + 小字注错误码；实测停掉后端后气泡立刻说「后端没起来。先跑 node server/src/index.js（记得换端口，别用 8787）。」；④ **点出处被知乎登录遮罩挡正文**——实测知乎对未登录用户**回答页与专栏页都弹**（正文在遮罩后面，关掉 ✕ 就能读；「无障碍模式」不改 URL、没法直链）→ 卡片下方**露出完整出处链接**（原来只显示域名）+ 写一句实话「知乎未登录会弹登录框，关掉就能看正文」。**决策与取证见 [decisions.md](decisions.md) D40。** ⚠️ **额度提醒**：问题发现实测剩 **26/100**（11-19 15:1x）；一次完整手动流程 ≈ 11 次，**一次 `?demo=1` 演练 ≈ 8 次**（演练是自动点击器、**不是 mock**，它真调知乎；同主题有 5 分钟缓存）→ 今天还能跑 2 套左右，00:00 重置。
- **✅ 台词逐句审的前置准备做完，并对出 3 个「脚本 vs 代码」对不上的地方（11-19 16:2x—16:5x，D44）**：① **「承诺句」早于事实**——代码在发知乎请求**之前**就说「嚼出来了，这几张每张都能点回原文」，冷缓存实测那一步要 **4.4 秒**，台上会看到**桌宠说卡片好了、屏幕上一张卡都没有**（补观点那句「我都带来了」更糟，卡一到就被下一句顶掉）→ **台词一个字没改，只改说的时机**：`digest` 挪到卡片渲染之后、`viewpoints` 挪到观点卡渲染之后并与 `disagree` 隔 **2 秒**（`pet.say()` 是替换不是排队）；② **`fracture` 那句代码会说、脚本没排**；③ **脚本 4:05 那句「你自己也写过一句」从来没实现**——前端压根没有 `/api/behavior/contents` 的封装，**4:05 那一拍在台上是空的** → 已补上：接创作信号、取正文**第一句**（不念整篇）、断层那一拍就取材，点断层标记开特写时桌宠念「你自己也写过一句——『**我的收藏夹里有 200 篇 PDF，一篇都没用上。**』」——**这是用户自己写在知乎上的原话，与脚本逐字一致**；取不到就照实退回数据陈述，**不编也不拿假引文充数**。**冷启动实测**：喂卡片 t=0.03 气泡「我再嚼嚼」`cards=0` → t=4.38 气泡「嚼出来了」`cards=3`（同一拍落地）；4:05 手动流程跑通（问卷 → 对照 → 看地形 → 等 ≈4—5 秒 → 点断层标记 → 原话出现）。**逐句审的对照表与待拍板 3 件事见 [P1-三件产出.md](P1-三件产出.md) §2.6 / §2.7。**
- **✅ 桌宠「白边越来越重」查清并修掉（11-19 13:3x，用户在浏览器里批注触发）**：用户在内置浏览器里指了「他动的时候，白边会越来越重，并且有残留影像」。**根因查清了**——官方素材 `assets/kanshan/*.webp` **6 个全是动画 WebP**（VP8X `ANIM=YES`，160×160，10fps，30—60 帧，`dispose=none`），而 CSS 把 `filter: drop-shadow()` / `grayscale()` 和 transform 动画**直接作用在 `<img>` 上** → Chrome 逐帧重新合成、滤镜边缘累积 → **白边越来越重**。**修法**：`filter` 和 transform 动画一律搬到**外层 wrapper**（`.petfigure`），`<img>` 保持 `filter:none; transform:none`；拖拽光晕改用伪元素 `radial-gradient`（**不用 filter**）；失败态的灰度滤镜改成 `opacity`。**实测**：修后 `<img>` 的 computed `filter`/`transform` 全为 `none`，白边消失；chew 动画实测落在 wrapper 上（`figAnim: chew` / `imgAnim: none`）。
- **✅✅「残留影像」也修掉了 —— 上一条的结论是错的，本条推翻它（11-19 13:3x—14:1x，用户要求继续查）**：13:2x 本会话说「残留影像是官方素材本身、改不了」——**错**。用户坚持「官方给的是这个形式的，一定有一种运用方式可以解决」是对的。**真因分三层**：① 旧转码命令的 `fps=10` 是恒定帧率滤镜，**把相邻帧混合**成一帧 → 手臂拖影烤进帧里；② **ffmpeg/libwebp 对动画一律写 `dispose=none + blend=alpha`，而素材是透明背景 → 第 N 帧叠在第 N-1 帧上，越播越重**（旧素材在 HEAD 里同样是 `dispose=0`，**不是新转码引入的**）；③ CSS 滤镜叠加在动画 WebP 的 `<img>` 上（13:3x 已修）。**当时判断错的原因**：用 Pillow 拆动画 WebP 看到的是**合成帧**，把累积结果当成了原始画面——**判定素材真伪只能靠浏览器直接加载官方原始 GIF 对照**。**改法**：纯丢帧 `select=not(mod(n\,2)),setpts=N/(10*TB)`（不混合）+ 保持原始 **320×320**（页面按 210px 显示）+ 质量 q78 → **q92** + **把每个 ANMF 头的 dispose 由 0 改成 1**（还原到背景，ffmpeg 无此开关，只能改容器标志位、不动像素）。全部收敛到 **`scripts/build-kanshan-assets.js`**（跑完打印帧数/帧矩形/dispose 自检，重跑 SHA-256 逐字节不变）。**验证**：官方 GIF ↔ 旧 WebP ↔ 新 WebP 三方并排连拍——旧素材叠影明显（thinking 三个身体、cheer 多个黑球、greet 多只手、play 多个足球），**新素材 6 个动作逐帧与官方 GIF 一致，只有一只手臂/一个黑球**；6 个动作映射逐个核对无误（待机/电波+灯泡/弥撒/挥手/Zzz/运球）；真机 `/web/` 连拍三帧干净无白边。**决策与取证见 [decisions.md](decisions.md) D39**。
- **✅ 窄屏布局一并修好（同一批，用户批注「整个的布局合理吗」）**：① `.stage` 左栏 `400px` 固定 → `clamp(300px, 28vw, 400px)`（**940px 视口下左栏原来吃掉 42%**）；② 顶栏窄屏隐藏副标题与「语气」二字，`logo`/pill/按钮加 `white-space: nowrap`（**940px 下「从心」原来竖排成两行**）；③ 底栏统计加 `nowrap` + `flex-wrap`（**原来「44% 工具与环境」在词中间断行**），窄屏把「真实账号实测」说明换到第二行、不丢；④ 材料列表**不再自己滚**（消除左栏**两条**滚动条），统一由 `.pet` 滚。**无头 Chrome 实拍** 940×775 与 1440×900 两档均正常；`?demo=1&fast=1` 回归 9/9 步全过、0 错误。
- **🟡 布局上还剩的（按 D36「不改形态」留给 P5/P6，不在 P3 收口范围）**：宽屏下右栏在「主流程还没开始」时是 1000px 空白（只有一句空态引导）——这是**工作台形态**的固有结果，不是 bug；真 3D 推镜仍留给队友。
- **✅ 赛道已拍板：留「AI × 陪伴与交互」（11-22 17:1x，D54）** —— 队友倾向赛道一，AI 核了四处原始依据后给判断、用户拍板。**依据**：① 官方奖池里**终极黑客奖 15 支共 ¥74,000「统一评奖、不分赛道」**，赛道直接影响的只有主题单项奖 **¥2,000**（3 个赛道各 1 支，约占主奖池 ¥84,000 的 2.4%）；② 赛道一的原型被 **S2 一等奖 MeetMind学脉（清华 ¥3 万，「收藏夹→口播板书→课程」）** 占住，我们的日报是同一族（§13.2 自己写下的风险）；③ 赛道二原文写着「**AI 学习伙伴 / 桌面数字助手 / 数字桌宠类创意原型**」+ 配刘看山 IP，且 S2 六个获奖作品**全是内容生成物、没有常驻的拟人化陪伴体**；④ **留赛道二 = 代码 4 处文案零改动、交付包不用重出、不用再碰还在报 401 的上传通道**。**连带**：平台「项目分类」保持**情感陪伴**（内容分类 ≠ 赛道，已核实）。⚠️ **更正**：此前口算的「终极黑客奖 ¥85,000」是错的，实际 **¥74,000**。
- **✅ 官方提交流程已取证（11-22 17:1x）** —— 用 `page.evaluate` 读官方接口拿到硬事实：① `project_tracks` = **7 = AI × 知识与探索 / 8 = AI × 陪伴与交互 / 9 = AI × 出海**（**赛道就在「创建项目」这一步选**）；② 黑客松页的「＋创建项目」按钮 **`aria-disabled="true"`、`title="创建项目通道将于12月5日10:00开启"`** → **12-05 10:00 之前根本创建不了参赛项目**，这解释了「参赛项目 (0)」，不是我们漏了什么；③ `GET .../hackathon/me` 显示 `binding = {team:{team_id:120227,name:"从心",role:1}, project:{}}` → **手上 AI Works 的草稿 `projectId=240909` 没有绑定到队伍**；④ **AI Works 表单里没有赛道字段**（step=1 只有名称/简介/分类/版本/说明，step=2 只有发布方式+审核声明），「项目分类」是 12 个内容分类（知识学习/知乎探索/人文漫游/创作设计/行业应用/金融投资/效率工具/互动游戏/DSH 插件/**情感陪伴**/生活决策/其他），**与赛道是两个字段**。
- **✅ P1 开场口径已按拍板改写（11-22 17:1x，D55）** —— `docs/P1-三件产出.md` §2.1 从「待拍板 + A/B/C 三案」改成**已拍板：桌宠先出场、日报紧跟**：产品首屏不动（不用重出交付包），录屏第一下点「翻开内页 ↓」，0:00—0:05 桌宠工作台 + `lines.opening`、0:05—0:10 滚回顶部给日报头版一瞥（**无台词纯画面**）、0:10—0:15 `lines.offer`；**后 17 拍全部不变**，**台词目录 14 句一个字没改**（新增拍是无台词画面，否则会踩 D44「脚本说会演、屏幕上没有」）。⚠️ **AI 早先的「A：把首屏拍成日报」建议已随 D55 撤销**。

- **✅✅ 换主线完成（11-24 12:0x—12:3x，D66）**：**认知地图不做，「认·清」认知闭环整条线下线**，新主线 = **「问它」** —— 你抛一件事 → 知乎搜**相似的困境** → 直答 `zhida-thinking-1p5` 判断**适不适合你这个具体情况** → 给一个**能照着做**的方案 → **每一步都能点回知乎原文**。**后端**：新增 `server/src/services/advice.js`（`buildAdvice()`：搜索 → 取前 6 条候选（正文截 700 字）→ 直答 → 解析 → 编号映射回真实 URL，两层缓存各 5 分钟）+ `server/src/routes/advice.js`（`POST /api/advice`）+ `endpoints.js` 的 `zhihuSearch(query, count=10)`；**删 6 个文件**。**前端**：`app.js` 的「问它」面板（`renderAskPanel` / `verdictLabel` / `askAdvice` / `renderAdvice` / `srcNote`）、`onboarding.js` **7 步 → 4 步**、**顺带修好一条没人调的线**（引导走完原来不弹完成卡 → 现在会弹「你刚刚自己问通了「问它」」+ 真实数字）、`demo.js` 新 6 步演练脚本、`pet-companion.js` **桌宠对话接后端**（答案和出处都来自知乎上那些答题人）、`api.js` 换 `getAdvice()`。**契约**：`api.json` **v0.7 / 11 个路径**（删 4 个认知闭环路径 + 19 个只服务它们的 schema，加 `AdviceRequest` / `AdviceVerdict` / `AdviceStep` / `AdviceSource` / `AdviceData` / `AdviceResponse`）、`ui-contract.json` **v2 / 33 个 id**（释放 6 个认知闭环钩子）、`check-contract.ps1` 第 11 项重写 + 新增「已撤销的认知闭环接口又回来了」检查。**实测**：`/api/advice` HTTP 200（判断 + 6 步方案 + 4 条真实出处 + `cached` 命中）；浏览器实测渲染正常 + 引导完成卡数字全真；**回归 14/14 绿、契约自检 14/14 绿**。**顺手修一个真 bug**：答案渲染在工作台「固定高度 + 内部滚动」窗口内，不主动滚动用户会以为没反应 → 加 `revealAskResult()`。⚠️ **两条实测结论别改回去**：格式要求必须和材料一起写进 **user** 消息（放 system 里模型直接无视）、`zhihu_search` **能给原回答 URL**（推翻 11-18 的旧记录）。⚠️ **台词目录 14 句一字未动**（P1 纪律）。

- **✅✅ 「问它」面板样式变量化 + 直答超时修复（11-24 19:3x—20:0x，D67）** —— **两件事，都实测过**。① **面板视觉终于能交出去了**：原先面板样式写成内联 `style="..."`，**内联优先级高于 class，队友在 `web/css/` 里改不动** —— 「面板视觉归队友」这条承诺**兑现不了**；现改成 `var(--ask-xxx, 默认值)` + 18 个 `ask__*` 语义 class（登记进 `ui-contract.json` 的 `js_owned_classes`），队友在 `web/css/` 里加一行 `:root { --ask-card-border: 2px solid #3b82f6 }` 就能改，**双方零冲突**。**浏览器实测 11 个变量逐个覆盖全部生效**（卡片 3px dashed 蓝 / 步骤线 2px solid 绿 / 出处条 7px double 紫 / 输入框 5px solid 红）。⚠️ **踩过的坑**：变量塞在 `border:` 简写里时，值必须是**完整简写** —— 只写颜色会让整条边框失效（宽度归 0），已写进 `分工-视觉与功能.md` §4.1 与 `队友体验指南.md`。② **直答白烧额度**（真 bug，D67）：`client.js` 对所有上游用同一个 10 秒超时 + 最多重试 4 次，而直答是**推理模型**（真实 20—35 秒）→ **一次「问它」实际烧 5 次直答额度**（82→77），而额度只有 100/天（全项目最紧）；改后**冷启动 10.4 秒、只烧 1 次**、缓存命中 2.1 秒，**完整回归 PASS 14 / FAIL 0**（改前那两拍是真的挂了：504 超时）。前端加了 8 秒后的第二段等待提示（「还在等知乎那边回话……这一步可能要 20—40 秒。」—— **只说在等，不假装有进度**，D62）。**顺带收口**：`docs/队友体验指南.md` 头部状态行、第 7 节文档表、6 处过期表述全部更新（队友照着跑不会再找不到已下线的断层/情境题/地形）。

## 三、阻塞项

- **✅【D70】AI Works 上传侧 401 → 用户手动上传成功（11-25 上午）**：AI 侧仍是 `ApplyUpload` 签名校验失败（平台侧），**用户在自己的 Chrome/Edge 手动上传同一个 ZIP 即成功** → 确认**不是交付包的问题**。⚠️ 后续再出包要重传，**先走用户手动上传这条路**，AI 侧重试无意义。
- **✅ 公网链接已拿到（2026-11-25 12:0x，D76）**：AI Works 项目「从心」**已正式发布** → **正式公网链接 `https://pekropd3uupx.aiworks.site`**（根路径 302 → `/web/`；**命令行直连 200、不需要 SSO**），知乎项目详情页 `https://www.zhihu.com/project/detail/240909` 的「体验项目」已内嵌该域名。**D22「12-04 前拿到正式链接」这条硬约束提前约 9 天解除。**⚠️ 剩下的仍需 **12-05 10:00 通道开闸**后在黑客松侧创建参赛项目（见 B22）；⚠️ 正式域名对所有访问者开放 → 每个人的访问都可能消耗**我们的**知乎配额，**配额归属未取证**。

| # | 事项 | 现状 | 谁来推 |
| --- | --- | --- | --- |
| B1 | ~~zhihu-cli 安装~~ | ✅ 已完成。0.6.3 @ `C:\Users\steam\AppData\Local\ZhihuCLI\current\zhihu-cli.exe` | — |
| B2 | ~~Access Secret~~ | ✅ **已恢复**。用户新建了第二个 Secret 并提供；写入 `~/.zhihu-cli/access_secret`（gitignore）后 `/api/v1/quota` 返回 200，额度与 11-16 上午实测**完全一致** | — |
| B3 | ~~赛事专属额度（800 美元）~~ | ✅ **已领取**。但澄清：800 美元 = **看山积分**（工作台内模型算力），**不是**开放平台 API 额度 → 见 D21 | — |
| B3-新 | ~~开放平台额度差距原因~~ | ✅ **已查明并解决**：真因是**账号未实名认证**。11-16 18:47 实名后复查 `/api/v1/quota`：搜索 **5000**、热榜 **100**、直答 **100**、问题发现 **100**、知识库 **500**、创作能力 **500**、用户数据 **10000**、小工具 **10** —— **与官网标称完全一致**。不存在"赛事专属额度"，D17/D21/D23 的相关表述已由 **D24** 推翻重写 | — |
| B4 | **OAuth 凭证（App ID / App Key）** | ✅ **路径已确认（2026-11-18，官方 Skill 包 `references/hackathon-oauth.md` 原文）**：**由赛事页面在项目创建后分配**，黑客松**不走通用邮件申请流程** —— **不要发邮件、不要编造提前领取入口**。取密钥路径 `zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p3`（12-05 提报入口开放后去取）。⚠️ **窗口风险（推断）**：OAuth 真联调窗口可能只有 **12-05 → 12-07** → **Demo 必须不依赖 OAuth 也能跑**（Access Secret 读账号本人数据 + mock）。另：官方标了 6 条协议待确认（回调参数叫 `authorization_code`、`state` 不回传、**token 1 小时过期且无 refresh token**）→ 契约已加 4 个 auth 路径 + `x-auth` 段（D34） | 12-05 后由用户取 |
| B5 | ~~技术指南正文~~ | ✅ **已读通**（该飞书文档公开可读，无需登录）→ rules 第十一节 11.1—11.10。含 800 美元定义、开放能力 10 类、AI Works 部署流程、4 条 FAQ | — |
| B6 | ~~与队友对齐 D14 定位~~ | ✅ **已完成**（11-17 队友回"可以，差不多"）：桌宠是主体、知识卡片是产出物，队友无异议；角色沿用官方刘看山（D19 已定，队友未提原创形象） | — |
| B7 | ~~队名 / 作品名~~ | ✅ **已定并已提交**（11-17）：作品名与队名均为 **「从心」**，**报名系统已填**。仓库名用拼音 `congxin`——GitHub 把仓库名里的非 ASCII 字符规范化成连字符，纯中文名不可用（D26） | — |
| B8 | ~~大连交大是否为合作院校~~ | ✅ **关闭**（11-17，用户决定）：院校合作不追。校内冠军 ¥2,000 不纳入计划，精力全部投到作品本身 | — |
| B9 | **决赛是否赴深圳** | 用户选"待定"。已按**线上腾讯会议**准备关键路径，线下作为可选增量（D16） | 12 月中旬再定 |
| B10 | **需求验证（3—5 人试用）** | 未安排 | 队友 |
| B11 | ~~GitHub 登录~~ | ✅ **已解决**：`gh` keyring 令牌虽失效，但 **Git Credential Manager 里有可用的 `nineanswerer` 令牌**，已用它建仓并推送。仓库：**`https://github.com/nineanswerer/congxin`**（public，队友 `5zdz5` **已是 collaborator，push 权限**，无待处理邀请） | — |
| B12 | ~~队友原始提案能否公开~~ | ✅ **已定**（11-17）：**不公开入库**。仓库中不含该文件；其中的架构取舍理由已逐条写进 D5，**取舍理由进仓库、原始提案不进** | — |
| B13 | ~~产品方向是否换成「认·清」认知地形~~ | ✅ **已关闭**（11-17 19:05，D29）。**不是换方向** —— 桌宠是主体，「认·清」认知闭环是桌宠里的一个功能环节。形态 2.5D + 断层真 3D 推镜；闭环位置 = 桌宠主动发起的「照镜子」环节；行为对照三个信号都做。**D14 原样成立不需修订**。契约同步扩到 8 个接口 | — |
| B14 | **分类体系（category taxonomy）跨两人** | 🟡 **初版已出，等队友有空确认**（11-17 22:5x）：机器可读的 `contracts/taxonomy.json` 已就绪并进了自检第 12 项，**但「6 类够不够用 / 名字顺不顺口」「未归类在 UI 怎么显示」「要不要进计划书」这三件仍然只有我这一边拍**。**未确认前不能算冻结**（`status` 仍写"初版"） | 两人一起（队友有空时） |
| B15 | **P1 三件产出**（一句话场景 ×2 + Demo 逐秒脚本 + 静帧 ×2） | 🟡 **7 件事已拍板，剩台词逐句 + 镜头待审**（11-18，D33）：场景 A/A、口径 67%、语气可选项（默认温和）、素材实时化、断层断言保留、无 IP 静帧不做。**台词已进契约层 `contracts/tone.json`**，等用户在 P1 脚本上逐句审 | 用户（逐句审）→ 队友 |
| B16 | **`web/` 临时接管的交接** | 🟡 **前端第一版已出（11-18 21:4x），队友那边还没接手**（11-17 起联系不上）。`web/` 目录归属已改给 `nineanswerer`（`docs/协作规范.md` 记了原因 + 5 条边界）；**队友回来后要改 `web/` 走 PR、不直推 main**，避免两边 AI 各写一套前端互相覆盖。交接清单在 `web/README.md`（明确区分「赶 11-21 做的取舍」与「按 D29/D19 必须保留的」） | 队友有空后接手 |
| B17 | **共享区改动走不走 PR** | ✅ **已关闭**（11-19 15:4x，**D41**）：规范原文写「走 PR、不直推 main」，但仓库至今 **0 个 merge commit、只有 `main` 一个分支**，PR 从未真正用过；队友 11-17 起联系不上没人合并，P3 明天收口、提报 12-07 截止 → **用户拍板「直推 main（照旧）」**。触发条件写死在 D41：队友联系不上 **且** 在交付窗口内 → 直推；**队友回来或他明确要看 diff → 改走 PR**。`docs/协作规范.md` 已同步改成和实践一致 | — |
| B18 | **`docs/handoffs/` 归属与越界写入** | ✅ **已关闭**（11-19 16:1x，**D43**）：规范说该目录归队友 `5zdz5`，但 BOOTSTRAP **收工协议**要求每场会话写一份交接——**用户拍板「照旧写（协议要求）」**。边界写死在 `docs/协作规范.md`：**例外只针对交接文档**（这是团队机制，不是替队友干活）；`assets/`、`docs/adr/` 仍只归队友（`assets/` 11-19 13:45 已认可，`docs/adr/` 没动过） | — |
| B19 | **部署专用 Access Secret 未申请** | 🔴 **还没申请**。`C:\Users\steam\.zhihu-cli\access_secret.deploy` **仍不存在** → 现在能出的包是**无密钥包**（先用它把上传流水线跑通、拿到公网链接）。带密钥包要等这个文件就位后 `node scripts\make-delivery.js --secret` 重出（**赛后要删掉这个密钥**，D49） | 用户 |
| B20 | **AI Works 上传 401（平台侧 OSS 签名）** | 🔴 **已定位，不是我们的包**：`POST https://media.zhihu.com/zos/api?action=ApplyUpload&version=v1` → **401**，`{"code":10201,"message":"signature verification failed"}`。**126 字节对照包同样失败**；刷新页面 / 新标签页 / 全新页面都复现；precheck 200、时钟无偏差。→ **改由用户在自己的 Chrome / Edge 里手动传同一个 ZIP**（`.ctx/congxin.zip` / `%TEMP%\congxin\congxin.zip`）。若自己的浏览器也失败 → 平台侧问题，**立刻找赛事组**。⚠️ **新增硬约束（11-22 17:1x）**：**创建项目通道 12-05 10:00 才开**（见 B22）→ **这个 401 必须在 12-05 10:00 前修好**，否则开闸当天传不上去 | 用户 → 必要时找赛事组 |
| B21 | ~~P1 演示脚本首屏口径~~ | ✅ **已关闭**（11-22 17:1x，D55）：用户拍板 **桌宠先出场、日报紧跟** → `docs/P1-三件产出.md` §2.1 已改写成三拍（0:00—0:05 工作台 + `lines.opening`／0:05—0:10 日报头版一瞥（**无台词纯画面**）／0:10—0:15 `lines.offer`），**后 17 拍全部不变、台词目录 14 句一个字没动、代码零改动**（不用重出交付包）。⚠️ 镜头与滚动节奏仍属 P1 内容、待人审 | — |
| B22 | **参赛项目还没创建（创建通道 12-05 10:00 才开）** | 🔴 **已查明，不是我们漏了什么**：黑客松页「＋创建项目」按钮 **`aria-disabled="true"`、`title="创建项目通道将于12月5日10:00开启"`**；`GET .../hackathon/me` → `binding = {team:{team_id:120227,name:"从心",role:1}, project:{}}` → **AI Works 侧草稿 `projectId=240909` 没有绑定到队伍**。**赛道在创建项目那一步选**（`project_tracks`：7 = AI × 知识与探索 / **8 = AI × 陪伴与交互** / 9 = AI × 出海 → 选 **8**，D54）。**12-05 10:00 一开闸要一次走完**：创建项目 → 选赛道 **8** → 填信息 → **填可运行体验链接 = `https://pekropd3uupx.aiworks.site`（已就绪，D76）** → 挂**产品说明计划书**（必交）→ 挂 **GitHub 仓库链接** `https://github.com/nineanswerer/congxin`（选交加分）→ 提交。⚠️ **AI Works 侧不要加「站外链接」/「GitHub 仓库」发布方式**（D76 §6）；GitHub 链接留给黑客松表单。⚠️ 官方 timeline 把 **12-07 标为「决赛路演，巅峰对决」**、`project_end_at` = **12-07 02:00**（此前笔记写 10:00，以官方为准） | 用户（12-05 10:00）→ 必要时找赛事组 |
| B23 | **交付包已作废，且重出前有个会打空线上站点的坑** | ✅ **坑已填（11-22 18:0x，D56）**：assets-kit 怎么进包已定并实施 —— **只带 15 个运行期文件**（浏览器实测清单，不是猜的），并新增 `checkRuntimeRefs()` **打包自检**：少一个文件当场报错退出，列出缺哪个。**交付副本实测**：13 个静态引用**全 200**、5 个动态加载文件**全 200**、`effects/fx.js` 404（符合预期，页面不需要）、浏览器渲染完整（改之前这里白屏）、网络面板 **0 个静态资源 404**；无密钥时降级**诚实**（只有 2 个 401，页头如实写「额度没读到」）。⚠️ **交付包本身仍待重出**（现存 ZIP 对应旧代码）：需先申请到部署专用密钥（B19），再 `node scripts\make-delivery.js --secret` 一次重出。⚠️ **已按 D58 降级为非当前优先级** —— 先把功能做完再交，别现在重出 | AI（重出包）+ 用户（先申请密钥） |
| B24 | **队友改版有没有把主流程打坏** | ✅ **没打坏（11-22 18:0x）**：后端 `node scripts\regress-p3.js` **PASS 15 / FAIL 0**（15 拍全过，含 3 张带出处真卡、断层强度 0.67、情境题带出处、认知地图 3 层）；浏览器 `?demo=1` 演练 **10 步全跑完、console 0 错、网络 62 个请求 0 失败**；工作台 9 条真实收藏 / 照镜子 6 题 / 断层标签逐字对上 / 地形新地块 / 落版页全部真实渲染。静态引用逐条核对**零断链**（4 处看似断链的 import 全在文档注释里，不是真代码）。✅ **「gate/consistency 开放 FAIL」已查明不卡我们（11-23 12:4x）**：那个 gate 是 **taste-skill 自己的审美审计工具**（`.taste-skill/build.json` 写 `by: "gate.mjs --start"`），**不是**仓库的构建/契约检查 → 仓库 `npm run build` 与 `check-contract.ps1` 均通过（PASS 13 / 0 / 0）→ **不阻塞交付，也不必修**。另：队友 11-23 新提交 `9601112` 也**没打坏主流程**（回归 15/15、契约 13/13、浏览器 0 错 0 失败） | — |
| B25 | **交付包因队友 11-23 新文件再次出现白名单缺口** | ✅ **已补并验证（11-23 13:0x，D57）**：`web/vendor/remixicon/`（图标字体 css + woff2）与 `web/assets/companion/`（背景图 + 桌宠动效 mp4）**4 个文件原本漏带** → 上线会**掉图标、桌宠动效区和陪伴空间背景是空的**。**是 D56 那道打包自检当场报错抓住的**（它第一次真正派上用场）→ 已把这两个目录**整目录**加进白名单，并让自检认得「运行时拼目录」的纯文件名（`pet-companion.js` 的 `['idle.webp', ...]`）。交付副本实测：9 个新文件**全 200**、静态资源**0 失败**、console **0 错**。⚠️ **交付包仍待重出**（同 B23：需先申请部署密钥，再 `make-delivery --secret`）—— **重出必须带队友 11-23 的新文件**。⚠️ **已按 D58 降级为非当前优先级**（`web/` 还会变，先做完 P4/P5/P6 再交） | AI（已实施）+ 用户（重出包） |
| B26 | **新用户能不能自己走通一次「认·清」闭环** | ✅ **能了（11-23 13:2x—14:2x，D60）**。干净 profile 实测发现**两处死胡同 + 一处哑按钮**：(1) 新用户一个字没答就点「看一次断层」，拿到的是**假陈述**「你说的和你做的在这几个维度上是一致的」；(2) `id="btn-tension"` 重名 → 照镜子面板那颗主按钮「让桌宠照照镜子」**没有 handler**（实测点了不执行）；(3) 那两颗按钮用 `class="btn primary"`，而 kit 里只有 `.btn--primary` → **按钮没样式**。⚠️ **演练模式 10 步全过却从没发现** —— 因为 `demo.js` 走函数直调，**绕过了按钮绑定**。已修：入口统一成 `startMirror()`、**自述没答全就不调接口也不下判断**（只说「问卷还差 N 题」）、台词「跟你刚才说的不太一样」在没答时闭嘴（演练脚本不受影响）。并新增**首次上手引导** `web/js/onboarding.js`（7 步，判据全读真实状态、不烧额度、不替用户做）+ `web/css/onboarding.css` + 工作台「带我走一遍」重开入口。**实测**：新用户从零走通一次闭环（收藏 9 条 / 问卷 6/6 / 断层 1 条 / 情境题 1 道 / 版图 3/3 层），完成卡数字全真；演练 `?demo=1` 10 步全过且不弹引导；控制台 **0 错 0 警告**；回归 **PASS 6 / FAIL 0**；契约自检 **PASS 13 / WARN 0 / FAIL 0**；交付包自检**全部命中**（`onboarding.js` / `onboarding.css` 已进包）。⚠️ **台词目录 14 句一字未改**（新增的是引导文案，不是桌宠台词）；**P5/P6 其余打磨（界面拟真 / 动画节奏 / 文案 / 排版）仍未做** | — |
| B27 | **引导指的目标会不会被引导卡盖住** | ✅ **不会了（11-23 16:5x—17:0x，D61）**。D60 的引导做完后复验，发现**引导圈的 target 被固定在底部的引导卡压住** —— 用户看到的是「圈在一处、卡压一处」，等于没指到。**三处根因都不是调偏移量能解决的**：(1) 第 3 步目标在文档绝对位置 3378、页面总高 3601、视口 720 → **最大可滚动量只有 2881**，把它顶到卡片上方需要 3174，**文档就这么高、滚不出那个位置**；(2) 第 4 步指向整个 `#mirror-quiz` 容器（**543px 高**），卡片必然压住中间几道题；(3) 第 6 步 `#btn-situation` 是**跑完断层后才插进 DOM** 的，没跑出来时这一步什么都不指。已修：① **文档不够高就在末尾垫一段空白**补足可滚动量，引导结束撤掉并同步修正 `scrollY`（⚠️ 垫高基准必须是「**不含**垫高的文档高度」—— 第一版拿已含垫高的 `scrollHeight` 去比，**越垫越不够**，这是最容易再犯的坑，已写进代码注释）；② 问卷那步改**动态指向「第一道没答的题」**（95px），答完自动往前挪，`hint` 也改成每轮刷新（否则会出现「圈挪了、进度数字没挪」）；③ 第 6 步兜底改 `#panel-mirror`（`#mirror-fracture` 空容器时不可见，当兜底等于没有）。**实测**：7 步每步目标 vs 引导卡 **全部 `overlap: false`**；答 6 题圈逐题挪、hint 实时「已答 N / 6 题」；完整闭环走通且完成卡数字全真（收藏 9 / 问卷 6-6 / 断层 1 / 情境题 1 / 版图 3-3）；垫高余量已回收归 0；演练 `?demo=1` 引导不弹、无遗留；控制台 **0 错 0 警告**；回归 **PASS 6 / FAIL 0**；契约自检 **PASS 13 / WARN 0 / FAIL 0**。⚠️ **台词目录 14 句一字未改**（改的全是引导的指向逻辑，不碰台词） | — |
| B28 | **台词第 14 句 `insufficient` 在「自述不可比」这一支上不够精确** | ✅ **已关闭（11-23 21:5x）—— 用户拍板：原样保留**。D62 加了新分支：自述侧**一个可比维度都没有**时（729 种答法里的 16 种），后端走 `insufficient` + `warnings: ["self_report_not_comparable"]`，界面标题已经是准确的「**你还没说清自己重什么。**」。**桌宠气泡仍说台词目录第 14 句「这次信号不够我下判断——先不照了。」** —— 信号其实是够的（3 个真实行为信号），缺的是自述侧可比维度。用户选择**原样保留**：读作「**可对照的**信号不够」成立，而**精确的原因由界面标题 + reason 承担**（标题与 reason 已经说清「是你这边没说清」）；让桌宠改念后端那句 60 字的 `insufficient_reason` 反而会毁掉 P5 要的拟真感。**台词目录 14 句一个字都没动**，**代码零改动**（本条只是记账，不产生 diff） | — |
| B29 | **交付包纪律：只有用户点名才产出** | 🔴 **硬规则（11-23 21:4x，D63）**：用户明确「不要交付包，只有我要求给交付包的时候再给」。→ **默认不跑 `make-delivery.js` / `predeploy-check.js`**，不主动产出对外包，也不把包当成交付物挂出来；打包、上传、发布各自独立授权。**本轮已执行**：此前误跑的自检副本 `.ctx\delivery-check` 已删除，**对外 ZIP 从头到尾没产出过**。⚠️ 与 B19 / B23 / B25 不冲突 —— 那三条讲的是「真要交时怎么交」，本条讲的是「**现在不要交**」 | AI（守规矩）+ 用户（点名才产出） |
| B30 | **界面拟真：界面上的开发者痕迹** | ✅ **已按用户拍板改完并实测（11-23 22:0x—22:1x，D64）**。静态扫 `web/` + 浏览器实地核对共定位 **9 处开发者痕迹**；用户四问**全选推荐项**：① 首屏换**官方 WebP 动效**（`assets/kanshan/idle.webp`）—— 原 AI 生成 mp4 带「视频由AI生成」烧屏水印，与页脚素材声明冲突，**文件已删**；② 顶栏两个胶囊收进**可展开详情**（`#nav-detail`：身份 / 今日额度），顶栏只留一句短状态，`#pill-quota` 默认隐藏；③ **英文错误码只进 console**，界面不再显示；④ 其余开发者痕迹**全部换成产品口吻**（来源标签 / 兜底话 / 底栏出处 / 网络失败提示）。**顺手修一个功能 bug**：额度接口真实形状是 `{apis:[{api_id,total,used,remaining}]}`，原代码读的键不存在 → **桌宠答额度只会念两个「—」**，现按 `api_id` 取真值。**实测**：18800 好密钥 + 18801 坏密钥两边都过；坏密钥下界面无英文错误码、控制台 **3 warn / 0 error**；契约自检 **PASS 13 / WARN 0 / FAIL 0**；回归 **PASS 6 / FAIL 0**。⚠️ **台词目录 14 句一字未改**。⚠️ **未做**：P6 动画/文案/排版；**队友尚未被告知首屏 AI 视频已换官方 WebP**（那个 mp4 是队友 `9601112` 提交的）。✅ 背景图水印经核实**不用动**（可见源图 x 上限 ≈1370 < 水印左边界 1416，见 D64 补充核实） | AI（已改）+ 用户（知会队友） |
| B31 | **分工：视觉与设计 vs 功能** | ✅ **已按用户拍板分家并落地（11-24 11:0x—11:2x，D65）**。用户原话：「不要全部自己做吧，让队友做视觉和设计的部分，我们做功能这些的部分，最好是分开分工」。**目录级硬边界**：队友 `5zdz5` 拿 `web/index.html` + `web/css/` + `web/assets/` + `assets/` + `docs/adr/`（**视觉与设计**）；本会话拿 `web/js/` + `server/` + `contracts/` + `scripts/` + `docs/decisions.md` + `docs/status.md`（**功能**）。**接缝只有 `web/index.html` 一处**，用**界面契约**兜住：新增 `contracts/ui-contract.json`（冻结 **39 个 id + 4 个 class + 1 个 data 属性**），**我们要加界面元素一律在 `web/js/` 里建 DOM**；`scripts/check-contract.ps1` **新增第 14 项**当场校验 —— 钩子少一个 → `FAIL`（退出码 1），JS 引用未登记钩子 → `WARN`。**实测**：自检 **PASS 14 / WARN 0 / FAIL 0**；反向把 `id="ch-pet"` 改坏 → 当场 `FAIL 界面契约 ui-contract.json — index.html 里少了 id『ch-pet』`，改回即恢复全绿。**提交方式**：队友的改动**走 PR**（D41 触发条件「队友回来」已满足 —— 视觉改动可能打断我们的 JS 契约），我们自己那半边**继续直推 main**。**完整边界 + 双方交付物 + 验收标准**见 `docs/分工-视觉与功能.md`；给队友的确认稿在 `docs/队友对齐清单.md` **零 M** | AI（已落地）+ 用户（发给队友） |
| B32 | **换主线：认知地图砍掉，「问它」上线** | ✅ **已按用户拍板换完（11-24 12:0x—12:3x，D66）**。用户带来队友原话（「抛给他一个问题 → 通过知乎搜索相似困境 → 找对策 → 判断采用与否 → 给出方案」）并明确「**认知地图不打算做了**」，三问**全选推荐项**：① **认知闭环全砍**（断层 / 情境题 / 认知地形三个接口 + 三个 service + 前端渲染全拆，卡片主流程保留）② **直答一条龙**（`zhida-thinking-1p5`，**不接 JeV**）③ **知乎搜索（5000/天）**做上游（不占「问题发现 100/天」）。**代码**：新增 `server/src/services/advice.js` + `server/src/routes/advice.js` + `endpoints.js` 的 `zhihuSearch()`；**删 6 个文件**（`routes/cognition.js` / `services/tension.js` / `services/situation.js` / `services/terrain.js` / `web/js/quiz.js` / `web/js/terrain.js`）；`web/js/` 换成「问它」面板 + 4 步引导 + 新演练脚本 + 桌宠对话接后端。**契约**：`api.json` v0.7（**11 个路径**）、`ui-contract.json` v2（33 个 id）。⚠️ **零 M 白话版当前那版还在要求队友做 P4 真 3D 推镜 + 认知地图 —— 已过期，不能发** | AI（已完成）+ 用户（重写零 M 后自己发） |
| B33 | **「问它」链路能不能真跑通、出处是不是真的** | ✅ **能（11-24 12:0x—12:3x，实测）**。`POST /api/advice` 实跑 **HTTP 200**：`verdict=applicable` + 一句话结论 + **6 步方案**（每步带「依据 N 条」）+ **4 条真实出处**（含 `https://www.zhihu.com/question/.../answer/...` 与 `zhuanlan.zhihu.com/p/...`）+ `candidate_count=6`；再问一次 `cached=true` 命中缓存。**浏览器实测**（18801）：首屏 → tab 切到「问它 · 它帮你找答案」→ 抛问题 → 方案卡 + 依据标注 + 出处列表全部渲染正常；4 步引导走完出完成卡（「你刚刚自己问通了「问它」」+ 真实数字）。**回归重写**：`scripts/regress-p3.js` 新增「出处对账」与「认知闭环接口必须 404」两拍 → **PASS 14 / FAIL 0**（轻量版 7/7，零额度消耗）；契约自检 **PASS 14 / WARN 0 / FAIL 0**。**顺手修一个真 bug**：工作台是「固定高度 + 内部滚动」窗口，答案渲染在窗口内部 → 不主动滚一下用户会以为没反应，已加 `revealAskResult()`。⚠️ **两条实测结论别改回去**：格式要求必须和材料一起写进 **user** 消息（放 system 里模型直接无视）；`zhihu_search` **能给原回答 URL**（推翻了 11-18 的旧记录） | AI（已完成） |
| B34 | **preview 部署版「每次刷新长得都不一样」** | ✅ **根因已查明并修好，但没上线（11-24 22:0x—22:4x，D71）**。**不是审美问题、也不是我们代码的问题** —— 是 **CloudBase 平台并发限流**（429 body `{"code":"EXCEED_RATELIMIT","message":"Client 127.0.0.6 exceeds rate limit."}`；`x-cloudbase-upstream-type: Tencent-SCF_HTTP` → 每个静态资源都回源 SCF；平台把 `cache-control` 改写成 `private, no-store` → 每次刷新全量重下）。**首屏同域并发约 26 个、冷启动容量 ~6 → 8 个 429 + 6 个 200**，**打掉哪几个随机** → 每次缺的不一样 → 每次长得不一样。**修复（全部在我们自己的 `server/` + `web/js/`）**：12 张 CSS 内联进 `index.html`（级联顺序不变）· 内联注入资源守护脚本（图片/script 被 429 打掉自动重试）· API **只重试平台级 429**、**我们自己的 `ZHIHU_RATE_LIMITED` 绝不重试**（免得再烧直答额度）· 静态资源加缓存头备着。**顺带把首屏大字口径切成「问它」**（沿用「只在还是旧值时才改」惯例）。**实测**：本地 `/web/` 459,004 字符 · 12 个内联 `<style>` · 浏览器 console 无 error · 契约自检 **PASS 14 / WARN 0 / FAIL 0** · 回归 **PASS 14 / FAIL 0**。⚠️ **修复已进新包**（11-25 10:28，D73 用官方 1.2.2 重出：3,148,394 字节 / 87 条目 / SHA-256 `4ba10377faf3d11df1476e425e2a59f0207312a6d8faba31e6c1de4b2367e72e`，交付副本冒烟全过、12 张 CSS 确认已内联）→ **等用户在 AI Works step=2 重新上传**，preview 才会变稳 | AI（已出包）+ 用户（上传） |


## 四、开发顺序与倒排计划

### 阶段 0：验引擎 ✅ 已完成（2026-11-16 17:45）

Access Secret 已配置（`zhihu-cli auth set` 因其自带校验环节报 `AUTH_INVALID`，但**同一凭证手工调 HTTP API 返回 200**，判定为 CLI 客户端侧问题，不影响本项目按 D15 直连 HTTP）。

实测结论（凭证 `…c730`，账号为普通自申请 Access Secret）：

| 能力 | 结果 | 关键观察 |
| --- | --- | --- |
| 额度查询 `/api/v1/quota` | ✅ 200 | 9 类额度。**当时测到的直答/热榜只有 2 次/天，是未实名认证的降级额度**；实名后为 100 次/天（D24） |
| 知乎搜索 `/api/v1/content/zhihu_search` | ✅ 200 | 返回 `Title` / `ContentText` / `AuthorName` / `AuthorityLevel`，含原文正文 |
| 主题问题推荐 `/api/v1/user/question_recommendations` | ✅ 200 | 查"RAG 与微调如何选择"直接命中《如果构建行业垂直大模型，到底是用RAG还是微调？》等真实问题 + 完整 URL |
| 问题回答摘要 `/api/v1/content/question_answers` | ✅ 200 | 返回 `ContentType` / `ContentToken` / **`Url`（原回答链接）** / `Summary`（服务摘要，非 AI 生成） |
| 直答 `POST /v1/chat/completions` | ✅ 200 | **OpenAI 兼容**，`model=zhida-fast-1p5`，返回标准 `chat.completion`；回答质量高，含判断顺序与代价分析 |

**结论：D12 的主路径完全成立**，且比预期更好——`question recommend` 找到的问题与我们的场景高度相关，`question answers` 直接给出**可点击回跳的原回答链接**，这正是"每张卡片可回溯出处"的技术基础。

**同时暴露一个严重约束**（⚠️ 该结论已由 **D24** 修订）：见 [rules-知乎S3.md](rules-知乎S3.md) 第十四节的额度对照表——当时测到的**直答只有 2 次/天**。事后查明真因是**账号未实名认证**，实名后直答为 **100 次/天**、搜索 **5000 次/天**，与官网标称完全一致，**不存在"赛事专属额度"这一层**。

- 探测脚本已固化为项目资产：`scripts/probe-zhihu.ps1`（可重复运行，参数 `-Only` 选择能力，`-SkipHot` 跳过耗额度项）
- 凭证读取顺序：环境变量 `ZHIHU_ACCESS_SECRET` → `~/.zhihu-cli/access_secret`（旁路存储，已 gitignore）→ 交互输入
- **本次已消耗**（11-16 上午，未实名账号的降级额度口径）：知乎搜索 1/10、问题发现 2/10、直答 1/2、全网搜索 0/10、热榜 0/2

### 阶段 1：定形状（11-17 晚 — 11-18 上午）★ **方向已拍板 —— 可以动手做视觉稿了**

> ✅ **方向已定（D29，11-17 19:05）**：**桌宠是交互主体，「认·清」认知闭环是桌宠里的一个功能环节**（不是推翻重做）。
> 形态：**2.5D 分层认知地图 + 断层真 3D 推镜**；闭环位置：**桌宠主动发起的「照镜子」环节**；行为对照：**三个信号都做，至少 2 个可用**。
> → **D14 原样成立，不需要修订**（原先挂着的"若换方向 D14 要修订"警告作废）。
> 评估依据存档：[方案评估-认知地形.md](方案评估-认知地形.md)。

- ✅ **刘看山 IP 素材已到位并完成优化**：`assets/kanshan/`，6 个动作 WebP 合计 915 KB，默认只加载 idle 158 KB。授权说明见 `assets/kanshan/NOTICE.md`（比赛期间可用、赛后禁商用）。
- ✅ 动作内容已逐帧核对，并完成状态映射（见 decisions.md D19）。**"电波"（坐着看电脑 + 灯泡）正好对应"去知乎检索"这个核心动作。**
- ✅ 三个官方缺口已定处理方式（见 D19 风险与缓解）：吞咽 / 吐卡片 / 失败用 CSS 过渡与状态气泡，不自绘角色。
- ✅ **D14 / D19 已与队友对齐定案**（11-17）—— ✅ D29 拍板后**确认不需要修订**
- ✅ **作品名 / 队名已定为「从心」并已提交进报名系统**（11-17）。仓库名 `congxin`（GitHub 命名限制，见 D26）。
- ✅ **队友原始提案不公开入库**（11-17 决定），仓库中不含该文件。
- ✅ **方向已拍板**（D29）→ 契约从 5 个接口扩到 **8 个**（新增 `tension` / `terrain` / `terrain/answer`），`contracts/api.json` v0.2
- ✅ **11-18 再扩到 9 个**（新增 `GET /api/tone`，桌宠语气目录 + 全部台词）→ `contracts/api.json` **v0.3**
- ✅ 一句话场景定义 ×2（主流程 + 照镜子环节）→ ✅ **已拍板（候选 A / 候选 A）**（`docs/P1-三件产出.md`）
- ✅ 5 分钟决赛 Demo 逐秒脚本（**主流程 3 分钟 + 照镜子 1.5 分钟**）→ ✅ **已拍板 7 件事**，台词逐句待审
- ✅ 静帧 ×2（桌宠 + 2.5D 认知地图）→ ✅ **已出图**（`docs/p1-frames/*.png`，1600×900，HTML 稿可改）；**无 IP 版本期不做（已拍板）**

**验收**：队友看完画面 + 脚本，回一句"对，就是这个"。**没有这张认可，后面 55 人时全是赌博。**

---

### 制作阶段总表（代码冻结 12-07 10:00，倒排 · **D29 重排**）

> **人时口径**：11-17 晚 → 12-07 10:00 是 19.5 天 ≈ 2.79 周，2 人 × 5—10 小时/周 ≈ **28—56 人时，中位 42**。
> **下表合计 55 人时 —— 是贴着上限排的**（意味着两人每周都要接近 10 小时上限）。**中位 42 口径下缺 13 人时**，靠下面「保命砍法」兜底。
> ⚠️ D27 那版按 43 人时排的是"只有桌宠主线"的口径；认知闭环净增约 11—14 人时后必须重排。

**产品结构（D29 拍板 · ⚠️ D66 已换成下面那版）**：

```
主流程：资料 → 桌宠咀嚼 → 吐带出处的卡片 → 追问 → 知乎补观点
                                        │
                        桌宠主动发起 ↓（同一个后端进程）
                                        ▼
「照镜子」环节：自述 → 行为对照 → 断层 → 情境题 → 答完长出一块地形
```

**产品结构（D66 现行 · 11-24）**：**桌宠是交互主体**；「认·清」认知闭环整条下线，换成**「问它」**。

```
主流程：资料 → 桌宠咀嚼 → 吐带出处的卡片 → 追问 → 知乎补观点
                                        │
                        桌宠主动发起 ↓（同一个后端进程）
                                        ▼
「问它」环节：你抛一件事 → 知乎找相似的困境 → 判断适不适合你这个情况
           → 给一个能照着做的方案 → 每一步都能点回知乎原文
```

| # | 阶段 | 时间 | 人时 | 产出（**能给人看的**） | 验收标准 |
| --- | --- | --- | --- | --- | --- |
| **P1** | 定形状 | 11-17 晚 — 11-18 上午 | 4 | 一句话场景 ×2（主流程 + 照镜子环节）+ 5 分钟 Demo 逐秒脚本 + **静帧 ×2**（桌宠 + 2.5D 认知地图） | 队友认可画面 |
| **P2** | 骨架 + API 契约 | 11-17 晚 — 11-19 | 10 | ✅ **契约已冻结**（`contracts/api.json`，**14 个路径**，v0.6）｜✅ `server/` 最小闭环：真调知乎 → 产出**带出处的卡片 JSON**（`POST /api/cards`）｜✅ `web/` 能显示卡片 + 桌宠待机 | 命令行跑通 `question_recommendations → question_answers → 卡片`；网页看得到卡片和出处链接 |
| **P3** | **桌宠主线**闭环可演 | 11-19 — 11-21 | 11 | 拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 追问 → 知乎补观点 → 卡片列表（**小屋砍掉，只留列表**）｜✅ **`web/` 第一版已出（11-18 21:4x，真实数据、无 mock）** | **能完整演一遍 Demo 脚本的主流程段，不用 mock** → 待人手点一遍验节奏 |
| **P4** | ~~**认知闭环「照镜子」**~~ **【D66 已下线，11-24】** | ~~11-21 — 11-24~~ | ~~12~~ | ~~桌宠主动发起 → 自述问卷（前端）→ 三个行为信号 → **断层出现** → 情境题 → 答完长出地形 → 2.5D 分层认知地图 + 断层真 3D 推镜~~ **→ 换成「问它」新主线（见下）** | ~~断层出现在地图上~~ **→ 出处能点回知乎原文** |
| **P5** | 拟真 + 失败态 | 11-24 — 11-25 | 5 | 界面不像骨架；接口失败 / 额度耗尽 / 空数据 / **信号不足**的真实提示；缓存与去重 | 每种失败手动点一遍，提示是真的 |
| **P6** | 打磨 | 11-25 — 11-27 | 3 | 动画节奏、文案、排版、首次引导 | 队友提 ≤5 条，改完 |
| **P7** | 部署 + 审核 ★硬截止 | 11-27 — 11-30 | 5 | AI Works 源码发布 → preview → 提交审核｜✅ **单进程部署形态已就绪（11-19，D42）**：`npm install && npm start` 一个进程即完整作品 | **拿到已审核的正式公网链接** |
| **P8** | 试用 + 材料 | 11-28 — 12-03（与 P5/P6 并行） | 3 | 3—5 人真实试用记录；计划书、README；官方 9 条检查逐条过 | 9 条可判定通过 |
| **P9** | 冻结提交 + OAuth | 12-05 10:00 — 12-07 10:00 | 2 | 作品提交 + 补充说明；OAuth 联调完成 | 已提交，且 OAuth 通了 |
| — | 运营 + 决赛（窗口外） | 12-05 — 12-19 | 3 | 项目广场推广、OAuth 计入人气奖、决赛 Q&A | 有真实传播数据 |
| | **合计（窗口内 P1—P9）** | | **55**（D66 后实际约 **43**） | | |

> ⚠️ **D66 已重排这张表**（2026-11-24 12:0x）：**认知地图不做，认知闭环整条线下线** → **P4 那一格（12 人时）作废**，
> 其中约 **8—9 人时**转到新主线 **「问它」**（`POST /api/advice`：知乎搜索 → 直答判断适用性 → 给方案 → 映射回真实出处），
> **净省约 3—4 人时**；剩下的 **2.5D 地图 + 真 3D 推镜（队友那 5 人时）整体取消**。
>
> **新主线（P4'）**：
> ```
> 主流程：资料 → 桌宠咀嚼 → 吐带出处的卡片 → 追问 → 知乎补观点
>                                        │
>                        桌宠主动发起 ↓（同一个后端进程）
>                                        ▼
> 「问它」环节：你抛一件事 → 知乎找相似的困境 → 判断适不适合你这个情况
>            → 给一个能照着做的方案 → 每一步都能点回知乎原文
> ```
> **验收标准**：屏幕上出现「判断 + N 步方案 + 每步的依据编号 + N 条真实知乎出处」，点出处能回到原文。
> **已达成**（11-24 12:3x 实测）：6 步方案 + 4 条真实出处，见 B33。

### 四条硬约束（最容易踩死的地方）

1. **P7 的审核时间是外部依赖，不可控。** 12-07 提交后代码冻结，**正式公网链接必须在 12-04 前就拿到**（D22）→ 所以 P7 排到 11-30，不是 12-01。
2. **P3 必须在 11-21 收口。** 后面的打磨、部署、试用、材料全都建立在"闭环能演"之上；P3 一拖，后面全是补救。
3. ~~**P4 必须在 11-24 收口。** 认知闭环是这次的新增亮点，而 2.5D 地图 + 真 3D 推镜恰恰是**返工成本最高**的部分（视觉定错了后面全要改）。P4 一拖到 11-26 之后，记忆点就会带着毛刺上台。~~ **【D66 已作废】** —— 认知闭环整条线下线，这一条的约束对象不存在了。**换成**：新主线「问它」是台上**唯一的新增亮点**，必须在 **11-26 前收口**（它要接后端、要真烧知乎额度，返工成本同样最高）。
4. **P1 今晚必须出。** 场景和 Demo 脚本没定，代码写多少都是猜。

### 保命砍法（**中位 42 人时口径下缺 13 人时，按这张表从上往下砍**）

| 砍什么 | 省 | 代价 |
| --- | --- | --- |
| 桌宠台词的直答生成 → 模板 + 数据拼 | 1 | 几乎无（契约里本来就定为默认走模板） |
| PDF 拖拽入口 → 只做粘贴文本 / 传链接 | 1.5 | 小 |
| 卡片导出 | 1 | 小（评审看闭环，不看导出） |
| 追问链：多次追问 → 只保留一次 | 1 | 中 |
| 拟真 P5：5 → 3 人时 | 2 | 中（界面粗糙会伤"产品体验与设计感"10%） |
| 打磨 P6：3 → 2 人时 | 1 | 小 |
| ~~认知地图：三层全渲染 → 断层层 + 简化两层~~ | ~~2~~ | ~~中~~ **【D66 已作废】** 认知地图整条线不做 |
| ~~**真 3D 推镜 → 纯 CSS 强视差断层特写**~~ | ~~2.5~~ | ~~大~~ **【D66 已作废】** 2.5D 地图 + 真 3D 推镜整体取消（队友那 5 人时直接省下） |
| **合计** | **13.5**（D66 后实际约 **10**） | |

### 可砍清单（按砍掉代价从小到大）

| 先砍 | 代价 |
| --- | --- |
| 热榜功能 | 几乎无（D24 已判定与主线关联弱） |
| 小屋的检索 / 标签体系 | 小（能放能看就行，检索留到 P5 有余力再说） |
| PDF 解析入口 | 中（用"粘贴文本 / 传网页"先替代，PDF 仍留本地 `pdfjs-dist` 但不做拖拽优化） |
| 导出功能 | 中（评审看的是闭环与观点对照，导出加分有限） |
| ~~多宠物 / 多 Agent / 插件生态~~ | **已在 D5 砍掉，不再讨论** |
| ~~自动双向链接图谱~~ | 已在 D5 砍掉 |

**绝对不能砍**：卡片带出处（D12 的技术基础，也是评审"完成度"和"AI 场景价值"两项权重的落点）、失败时的真实提示（官方检查第 7 条）、密钥不入库（官方检查第 6 条）、**断层诚实底线**（至少 2 个独立信号，不够就要说不够）、**出处必填**。


## 五、下一步（按依赖顺序）

> **🔴 本轮（11-25 12:0x）之后的第一优先级：12-05 10:00 通道开闸 → 创建黑客松参赛项目 → 一次走完提交。****正式公网链接已就绪**（`https://pekropd3uupx.aiworks.site`，D76），**产品说明计划书已就绪**（`docs/产品说明计划书.md`），**GitHub 仓库已就绪**（`https://github.com/nineanswerer/congxin`，public）。**官方接口硬值 `project_end_at` = 12-07 02:00 → 窗口只有 40 小时，每队限 1 个作品。**

1. ✅ **P3 前端第一版 + 第二轮补缺口都已出（11-18 21:4x / 22:5x）** —— `web/` 从零行 → 可演版本 → 补 4 个缺口，**用真实知乎数据**（收藏 9 条 + 真实带出处的卡片）跑通，**全程无 mock**。剩下的是 `web/README.md`「已知问题」里的：登录入口（等 12-05 OAuth 凭证）/ 追问链 / 三层地形的碰撞避让 / **「两方观点」要不要真做**（见上面那条 ⚠️）。
2. 🔴 **P3 闭环已由 AI 代跑完整实测通过（11-19 13:1x）** —— 拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 知乎补观点 → 照镜子 → 断层 → 出题 → 作答 → 地形，**九段全过，28 个请求 0 失败，失败态两头都是真话**（详见「已完成」）。**剩下只差「人眼看一遍」**：5 分钟够不够、台词念出来顺不顺、失败态提示读起来像不像人话——这三件 AI 判不了。**下一步不是再写功能，是人坐在电脑前点一遍。**
3. ✅ **台词逐句审已拍板落库（11-19 15:3x，D45）**：`fracture` 与 `insufficient` **都排进脚本**、4:05 补操作备忘、脚本引文**逐字校准**（3:25 / 3:50 原引是意译，屏幕上没有那两句）→ 脚本现为 **18 拍 + 1 边界态，契约台词 14 句全在册**，台词目录**一字未改**。**镜头动效**仍待审。
4. ✅ **完整回归已跑通，15 拍全过（11-20 11:5x）** —— 额度 00:00 重置后跑 `node scripts\regress-p3.js`：**PASS 15 / FAIL 0**，覆盖首屏 9 条真实收藏 + 关注 3 个 + 创作 1 条 + 语气目录 14 句 + 登录态 `developer_account` + 404 契约信封 + 3 张带出处真卡 + 出处是 zhihu.com 真链接 + 同题两答 + 断层 3 信号/强度 0.67/4 条证据 + 断层标签逐字对上 + 行为侧含 778 天 + 情境题带出处 + 作答长新地块 + 地形 3 层 + 断层标记。**上次唯一的 FAIL 就是撞上额度用光，这次证明不是 bug。** ⚠️ **实测只烧了 6 次「找问题」**（不是预估的 11）——同题两答与 5 分钟缓存省掉了；另用掉直答 1 次、知乎用户数据 20 次、创作能力 4 次。**剩 94 次**，够排练好几遍完整演示。
5. ✅ **零 G / 零 K 的接口数已改成 14（11-18 22:5x）—— 文本已改好，只差用户自己发**：零 G 的接口表与「13 个接口」**全部改成 14**（新增 `POST /api/cards`）；零 K 从「补充三条」改成「**补充四条**」，第 ④ 条 = 卡片接口（请求/响应形状 + 出处必填 + 空数据≠失败 + 额度提醒 + **「收藏推不出出处，卡片必须走 `/api/cards`」**），末尾接口数 13→14。**核实过的事实：只有零 I 真的发出去过**（零 G / 零 H / 零 K 都还没发），零 J 暂缓、内容留在仓库不删。零 H 是追问触发式，**他问了才发**。**全部由用户自己发，AI 不参与。**
6. 🟡 **定死分类体系**（B14）：初版已出，**等队友有空确认三件事**；未确认前不算冻结。
7. **12-05 提报入口开放后去赛事页面取 App ID / App Key**（B4，路径已确认）：**不要发邮件申请**。OAuth 联调窗口可能只有 12-05 → 12-07，但 **Demo 主路径不依赖 OAuth**（已用真实进程验过：没有登录态时行为接口照样读得到真实收藏 9 条）。
8. ✅ **方向已拍板（B13 关闭，D29）**｜✅ **零 I 已发**｜✅ **契约 14 个路径全部实现并实跑**｜✅ **P1 七件事已拍板（D33）**｜✅ **接入方式定案：维持 API 直连（D34）**｜✅ **「Demo 不依赖 OAuth 也能跑」已验**｜✅ **`web/` 前端第一版已出并实跑（11-18 21:4x）**。
9. **P1—P9 按总表推进**，每阶段结束必须拿到"能给人看的东西"才算过。
10. 🔴 **P7 的审核时间是外部依赖**：AI Works 正式公网链接要等内容审核通过，**12-04 前必须完成一次已审核发布**（总表已把 P7 排到 11-30，别拖）。✅ **部署形态本身已就绪（11-19，D42）**：后端进程同进程挂前端静态，实测**一个进程就能出完整作品**（`/` → 302 → `/web/`，13 个请求全 200、console 0 错、9 条真实收藏正常）。✅ **打包与预检也已就绪（11-19，D46）**：`node scripts\predeploy-check.js` 一条命令出 **ZIP + manifest + 「部署前 9 条检查」对照报告**，**实跑全绿**；步骤见 `docs/部署指南.md` —— **剩下的只是「用户授权 → 人在平台点上传 → 等审核」**。⚠️ **11-24 22:4x 补（D71）**：preview 之所以「每次刷新都不一样」是**平台并发限流随机打掉静态资源**，代码已修好（CSS 内联 + 资源守护 + 只重试平台级 429）→ **必须重出包并重新上传才会变稳**（出包需用户点名授权，D63）。
11. **人时是紧的**：总表合计 55 人时贴着上限（可用 28—56）。D66 砍掉认知闭环后**实际约 43 人时**，缺口从 13 缩到约 3。⚠️ **「最后才砍真 3D 推镜」这条已作废**（D66：2.5D 地图 + 真 3D 推镜整体取消）→ 现在要盯的是 **P7 的外部审核时间**和 **P6 的观感打磨**。
12. 🔴 **换主线后必须由人做的三件（AI 不能代劳）**：
    - **零 M 白话版重写** —— 当前 `fb62d72` 那版还在要求队友做 P4 真 3D 推镜 + 认知地图，**已过期不能发**；新版要去掉这两项、加上「问它」新主线、并说清**为什么用直答而不是 JeV**（JeV 不产文字、要多一个第三方 key + 部署环境变量；后面想换随时能换）。
    - **请队友删 `web/index.html` 里的「看一次断层」「看认知版图」两个按钮** —— 我们已不绑 handler，点它们现在什么都不会发生（队友的地盘，我们不能改）。
    - **P1 台词逐句人审** —— 新主线用不到的五句（`mirror` / `fracture` / `question` / `bridge` / `insufficient`）**去留要用户拍板**，AI 不得自行删。

13. 🔴 **本轮（11-24 20:0x）新冒出来的、要人做的三件（AI 不能代劳）**：
    - **队友的额度认知要纠正** —— 零 N 第 ④ 段写的是「没有实名认证每天只有 10 次调用额度」，**实测未实名是分能力的**：搜索 10 次/天、**直答只有 2 次/天**（`rules-知乎S3.md` 14.5）。队友按 10 次算会以为「问它」能跑 10 次，**实际第 3 次就撞额度** → **要补一句话告诉他**（顺带告诉他实名认证能把直答提到 100 次/天）。
    - **「问它」面板的变量清单要告诉队友** —— 零 N 第 ④ 项说了「面板视觉交给你调整」，但**清单在文档里、消息里没有** → 让他看 `docs/分工-视觉与功能.md` §4.1 或 `docs/队友体验指南.md` 第 6 节（含「变量塞在简写里必须写全」的坑）。
    - **演示前先预热缓存** —— 「问它」冷启动 10 秒、上游慢时更久；**赛前先问一遍同一个问题**，把 5 分钟缓存填上，现场就是 2 秒。

## 六、记录纪律

- 每次实质开发后更新本文件的"已完成"与"阻塞项"。
- 失败、未验证、演示数据在文档里必须显式标注，不与真实结果混写。
- 涉及对外动作（发布、联系他人、提交资料、报名信息变更）需用户明确授权后执行。
- 官方规则可能继续更新（官网 `/api/content` 支持 30 秒轮询更新）。每次进入开发前复查一次"最后更新"时间。
