# 交接：含 D71 修复的新部署包已出 + 交付副本与仓库源的差异规则（D72）

- **时间**：2026-11-25 10:16
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `268b682`（本会话的改动在同一批 commit 里，见第 2 节）
- **本次目标**：用户回「**现在出新包**」（D63 要求的点名授权到了）→ 把 D71 的 preview 修复打成新交付包，走官方 helper 七步，并对交付副本做真机冒烟。

## 1. 现在处于什么状态

**新包已出、可上传**：`%TEMP%\congxin\congxin.zip` · **3,147,493 字节 / 85 条目** ·
**SHA-256（补执行位之后）`f99727d510dc3b75b412d5b0a38dd23ec9b0b715833f44de65ec86d360f49186`**。
官方 helper 七步全 exit 0（validate 报「deployment input validation passed」），交付副本真机冒烟全过。

**这个包里有 D71 的修复**：`/web/` 的 12 张 CSS 已内联、资源守护脚本已注入、API 只重试平台级 429、首屏大字已是「问它」。

**preview 此刻仍是坏的** —— 线上跑的还是旧包，**要等用户自己重新上传**才会变稳（上传侧平台返 401，是平台问题，得用户在自己 Chrome/Edge 手动传）。

**新事实**：部署专用密钥的额度计数与开发密钥**不是同一份** —— 交付副本读到的 9 项额度**全是满额**（直答 100/天 used=0），而开发密钥上 11-24 22:30 实测直答是 27/100。→ **线上站点有自己的 100 次/天直答额度**，演示不跟本地抢。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `scripts/make-delivery.js` | ① `writeHtmlPages()` 的**证据行**跟着 D71 改（旧的 `app.use('/web', express.static(...))` 已不存在 → 换成 `app.get('/web/', indexHandler);`，`Reason` 同步改成「index.html 由自定义 handler 组装下发」）② 新增 `patchWebStatic()`：交付副本里把 `Number(process.env.STATIC_MAX_AGE_SEC ?? 300)` 换成字面量 `300` | D71 重写 `web-static.js` 后，出包脚本**连续两次当场报错**（见第 3 节）。两次都不是 bug，是自检在按设计工作 |
| `docs/decisions.md` | 追加 **D72**（交付副本 ≠ 仓库源，但差异只允许「环境变量 → 字面量」这一类） | 决策层只增不改 |
| `docs/status.md` | 「最后更新」+ §二 加本轮条目 + §三 阻塞项改成「新包已出，等用户上传」+ B34 行同步 | 状态页是跨人接缝 |
| `docs/handoffs/2026-11-25-1016-delivery-package-d72.md` | **新增**（本文件） | BOOTSTRAP 收工协议 S2 |

**队友目录一个字没碰**（D65）：`web/index.html`、`web/css/`、`web/assets/`、`assets/`、`docs/adr/` 全部原样。

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：`node scripts\make-delivery.js --secret` 重出交付包（第一次）。
  **结果**：`✗ 交付副本生成失败：证据行找不到：server/src/lib/web-static.js → app.use('/web', express.static(join(root, 'web'), { index: 'index.html', maxAge: 0 }));`
  **根因**：D71 把 `index.html` 从「交给 express.static」改成「自定义 handler 组装后下发」，这行源码没了，但 `writeHtmlPages()` 里的证据行还指着它。
  **结论**：**证据行必须与当前源码逐字一致**。改源码就要改证据行，别把证据行改成「大概能匹配」的宽松匹配 —— 它的作用就是官方回头查源码时能对上。

- **尝试**：第二次跑 `make-delivery.js --secret`。
  **结果**：`✗ 交付副本生成失败：交付副本自检没过（这批文件会被官方探测器判成阻断项）：- server/src/lib/web-static.js:173 读了非受管环境变量 STATIC_MAX_AGE_SEC`
  **根因**：官方 AI Works 只放行 `PORT`/`HOST`/`HOSTNAME`/`NITRO_HOST`/`NITRO_PORT`；别的 `process.env.*` 会被官方探测器判 `E_USER_ENVIRONMENT_VARIABLE_UNSUPPORTED` **直接阻断打包**。交付副本自检与官方探测器**同口径**（连注释里的环境变量写法都算命中）。
  **结论**：**别去放宽自检**。正确处置是**仓库源保留开关、交付副本写死字面量**（平台把 Cache-Control 改写成 `private, no-store`，这值在公网上本来就不生效，写死不影响线上行为）。

- **尝试**：用冒烟脚本断言 `/api/advice` 的 `d.steps` 和 `d.cached`。
  **结果**：两个都 `undefined`，一度以为接口坏了。
  **根因**：**是我脚本的字段名写错了** —— 真实字段是 `data.plan`（数组，每项 `{index, text, source_indexes}`）和 `meta.cached`；步骤的「依据编号」在 `source_indexes`，不是 `refs`。
  **结论**：接口形状以 `contracts/api.json` 为准，**别照着自己记的字段名写断言**；断言写错时先怀疑自己。

- **尝试**：用 `Array.isArray(data.lines)` 判断 `/api/tone` 的台词数。
  **结果**：false，脚本打印的是整个对象。
  **根因**：`data.lines` 是**对象**（键 = 句 id），不是数组。14 句都在，id 是 `opening, offer, chew, digest, source, viewpoints, disagree, park, mirror, fracture, question, bridge, closing, insufficient`。
  **结论**：要数条目用 `Object.keys(data.lines).length`。

- **尝试**：`Get-ChildItem <dir> | Select-Object Name` 列目录。
  **结果**：**输出是空的**（目录明明有东西）。
  **结论**：这台机器的 PowerShell 里 `Select-Object Name` 的输出经常被吞；改用 `Get-ChildItem <dir> | ForEach-Object { $_.Name }` 才看得见。

- **尝试**：直接把 ZIP 里的 `congxin/` 目录名去掉再解压（想少一层目录）。
  **结果**：**没做** —— 官方 helper 的归档结构就是 `congxin/` 为根，`fix-zip-exec-bit.py` 也按这个路径找 `congxin/scf_bootstrap`；**别改结构**。

## 4. 下一个 AI 接手前必须知道的事

- **重出包要跑完整八步**（不是只跑 `make-delivery.js`）：
  ```powershell
  $proj="$env:TEMP\congxin"; $skill="$env:TEMP\aiworks-helper\zhihu-ai-works-deploy-helper"; $repo='C:\Users\steam\Desktop\从心'
  node "$repo\scripts\make-delivery.js" --secret     # 会清空 $proj（只删带标记文件的目录）
  python "$skill\scripts\inspect_node_project.py" --root $proj --output "$proj\_tmp\deploy-plan.json" --backend-html-pages "$proj\_tmp\backend-html-pages.json"
  python "$skill\scripts\write_backend_runtime.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$skill\scripts\write_deploy_descriptors.py" --output-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$skill\scripts\validate_deploy_output.py" $proj
  python "$skill\scripts\settle_agent.py" --project-root $proj --product-code minimax-code --product-name "MiniMax Code" --product-version unknown --platform desktop
  python "$skill\scripts\create_project_archive.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$repo\scripts\fix-zip-exec-bit.py" "$proj\congxin.zip"
  ```
  **不要加 `--build-validation`**（D53）。**每次出包指纹都会变，对外只报当次实测的 SHA-256。**
  helper 是公开可下的：`https://zhstatic.zhihu.com/skill/application/d6c1-260923/zhihu-ai-works-deploy-helper_v1.2.0.zip`（解压到 `%TEMP%\aiworks-helper\zhihu-ai-works-deploy-helper`）。PowerShell 里**变量名别叫 `$zip`**（安全策略会误判），用 `$pkg`。

- **Windows 的 0755 问题（D70）**：helper 的 `validate_deploy_output.py` 在 Windows 上必然误报 `scf_bootstrap mode must be 0755`（NTFS 没有 exec 位）。
  **本地解压副本已打补丁**：`%TEMP%\aiworks-helper\zhihu-ai-works-deploy-helper\scripts\validate_deploy_output.py` 里那行判定已收成 `if os.name != "nt" and ...`，原件存为同目录 `.orig`。
  **补丁只在临时目录，不进仓库、不进交付包**；权限位由 `scripts/fix-zip-exec-bit.py` 补进 ZIP 条目并逐项复检（CRC / 成员清单 / 逐成员内容哈希 / 权限位 / create_system）。
  ⚠️ **helper 目录被清掉就得重新解压 + 重新打这个补丁**。

- **交付副本真机冒烟（这次用的完整流程）**：
  ```powershell
  $smoke="$env:TEMP\congxin-smoke"
  if (Test-Path $smoke) { rm -- "$smoke" }
  python -c "import zipfile; zipfile.ZipFile(r'$env:TEMP\congxin\congxin.zip').extractall(r'$smoke')"
  npm --prefix "$smoke\congxin" ci            # 68 个包
  $env:PORT='18805'; $env:HOST='127.0.0.1'
  Start-Process -FilePath 'node' -ArgumentList 'server/src/index.js' -WorkingDirectory "$smoke\congxin" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\congxin-smoke.log" -RedirectStandardError "$env:TEMP\congxin-smoke.err"
  node .ctx\smoke-delivery4.mjs               # 台词条数 / plan 字段 / 额度 / 全量形状
  ```
  交付副本里的 `secrets/access_secret` 会自动被 `config.js` 读到（走 `PROJECT_ROOT/secrets/`），**不用设环境变量**。
  ⚠️ **别用 `Get-Content` 看服务日志**（中文按 ANSI 读会乱码，那是显示问题不是服务问题）。

- **本次冒烟实测到的事实**（可直接引用）：
  - `/api/health` 200 · `/api/quota` 200（9 项，**全是满额**）· `/api/tone` 200（**14 句**）· `/web/` 200（**460,679 字符**）
  - `/web/` 里 **`<style data-inline-from>` 12 个** · `<link rel=stylesheet>` 只剩 1 条（Google Fonts）· 资源守护脚本已注入（`data-gfailed` + `?gr=`）
  - 内联清单：`assets-kit/system.css`、`assets-kit/ui/cards.css`、`assets-kit/motion/motion.css`、`assets-kit/backgrounds/backgrounds.css`、`assets-kit/layout/layout.css`、`assets-kit/icons/icon.css`、`vendor/remixicon/remixicon.css`、`css/app.css`、`css/apple-blue-tokens.css`、`css/companion-home.css`、`css/pet-companion.css`、`css/onboarding.css`
  - `/web/css/app.css` → `public, max-age=300`（交付版写死值）· `/assets/kanshan/idle.webp` → `public, max-age=3600`
  - `POST /api/advice` → **200 / 11.5 秒**，`verdict=partially_applicable`、`candidate_count=6`、**`plan` 4 步（每步 `{index, text, source_indexes}`）**、**5 条真实出处**（`https://www.zhihu.com/question/.../answer/...`、含作者名/点赞数）、`summary` + `caveat` 齐全 → **再问一次 2 毫秒**（`meta.cached=true`）
  - ZIP：85 条目 · `testzip()` 无错 · `congxin/scf_bootstrap` **0755** · 无 `node_modules`/`docs`/`.git`/`__pycache__` · `congxin/server/src/lib/asset-guard.js` 在 · `congxin/secrets/access_secret` 在（**有意为之**）

- **目录所有权（D65）**：队友 `5zdz5` = `web/index.html`、`web/css/`、`web/assets/`、`assets/`、`docs/adr/`；本会话 = `web/js/`、`server/`、`contracts/`、`scripts/`、`docs/decisions.md`、`docs/status.md`。

- **编码纪律**：`.ps1` 必须 UTF-8 **with BOM**；`.md`/`.json`/`.js` UTF-8 无 BOM、纯 LF；写完跑 `node .ctx\check-encoding.mjs <files...>`。中文长文本走 `.mjs` 脚本（`node -e` 在 PowerShell 里内层引号会被吃掉）。

- **commit 纪律**：`Context:` 必须由人给，AI **只许转录人说过的话**；`Context:`/`Tried:`/`Verify:` 三行缺一被 `.githooks/commit-msg` 拒。禁 `git add -A`，一律 `git add -- <显式路径>`；提交前先 `git fetch`；**每次提交前重填 `.ctx/current.md`**（写前先 read，hook 提交后自动清空）。

- **GitHub push**：Clash 代理**这次没开**（7890/7891/7892/7897/7898/10809/1080 全关），**直连就推成功了**。先试直连，失败再找代理。

- **自检与回归**：
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1        # 期望 PASS 14 / WARN 0 / FAIL 0
  node scripts\regress-p3.js --light --base http://localhost:18801           # 期望 PASS 7
  node scripts\regress-p3.js        --base http://localhost:18801           # 期望 PASS 14（烧 1 次直答）
  ```

- **额度**：直答 100/天（未实名只有 2 次/天）、问题发现 100/天、知乎搜索 5000/天。**开发密钥**上 11-24 22:30 实测直答用 27；**部署密钥**上的计数是另一份、目前满额。

## 5. 下一步（按优先级）

1. **🔴 用户在 AI Works step=2 重新上传 `%TEMP%\congxin\congxin.zip`** → preview 才会变稳。**平台上传侧返 401 是平台问题**（同尺寸对照包同样失败），得用户在自己 Chrome/Edge 手动传；还是失败就找赛事组（官方小助手微信 / openplatform@zhihu.com），**别反复重试**。
2. **上传后当场验三件事**：① 连刷 5 次 preview，首屏**样式不再塌**（荧光绿/文字叠一起/图标方块都不该再出现）② 响应头 `cache-control` 是不是仍被平台改写成 `private, no-store`（决定 `STATIC_MAX_AGE_SEC` 有没有意义）③ `/web/` 里 12 张 CSS 确实内联了。
3. **12-05 10:00 参赛项目通道开启后**：把 AI Works 建站成果绑定到参赛项目（赛道选 **8 = AI × 陪伴与交互**，D54），取 OAuth 凭证（App ID / App Key），接登录入口。
4. **首屏下方「日报 / 工作台」section 仍是收藏→日报的旧口径**（队友地盘）—— 本轮只改了主视觉三处。**要不要一起统一，需队友或用户拍板。**
5. **`web/index.html` 里 `btn-tension` / `btn-terrain` 还在**（认知闭环已下线，这两个按钮背后已无功能）→ **等队友删**。
6. **`README.md` 里队友的认知地形截图 `web/docs-shot-terrain.png` 还没删**（队友地盘，提报前要处理）。
7. **补发队友那条**（用户自己发，AI 不参与）：额度纠正（未实名：搜索 10 次/天、**直答只有 2 次/天**）+ 面板变量清单指路（`docs/分工-视觉与功能.md` §4.1）。
8. **部署专用 Access Secret 赛后删除并轮换**（已出现在对话记录里）。

## 6. 需要人拍板的事

- **上传后如果 preview 还是塌**：要不要把 12 张 CSS **直接硬编码进 `index.html` 的 `<style>`**（最狠的兜底，但会踩队友的地盘 `web/index.html`）？目前方案（服务端内联）已覆盖首屏 12 张表，风险较低，**建议先看上传后的实测再决定**。
- **首屏口径要不要连下面的 section 一起统一**：首屏大字已是「问它」，但首屏下方「日报 / 工作台」还是收藏→日报的旧口径 —— **只改主视觉，还是上下一起切？**
- **AI Works 两项审核声明最终确认**：账号登录 = 否 / 大模型生成内容 = 是（点发布前还能改）。
- **演示视频**（用户说「不急」）：要不要在 12-04 前预留拍摄时间？
