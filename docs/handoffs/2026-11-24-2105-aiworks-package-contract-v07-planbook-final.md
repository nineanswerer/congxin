# 交接：官方 helper 打包出 ZIP + 契约升 v0.7 + 计划书定稿 + 静帧 2 重画

- **时间**：2026-11-24 21:05
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `824c1e4`（本会话的改动尚未提交，见第 1 节）
- **本次目标**：用户 20:15 给了六件事 —— ① 贴出部署专用 Access Secret ② 演示视频不急 ③ 计划书可以定稿 ④ 台词先这样 ⑤ 图片你上新 ⑥ 公网链接用户自己做，要 AI **按截图一步步教**并**给一张能放在「加号」位的图**。

## 1. 现在处于什么状态

**能上传的交付包已经出来了**：`%TEMP%\congxin\congxin.zip`（3,139,474 字节 / 84 条目 / SHA-256 `bc5e2f2141ad2d5bafdae190b312bec1debbbddeca24f32076d63176d95f4e5c`），官方 helper 七步全 exit 0，交付副本真机冒烟全过。
**唯一卡点是平台上传侧返 401**（签名校验失败，同尺寸对照包同样失败 → 不是包的问题），用户需在自己浏览器手动上传。
**契约四份文件已同步到 v0.7 / 11 路径**（D69），自检 PASS 14 / WARN 0 / FAIL 0，并新加了「冻结清单 == api.json 路径」的焊死校验（两项反向验证都拦得住）。
**计划书已定稿 v1.0**，**静帧 2 已按「问它」重画**，**台词按 D68 保持现状一个字未改**，**AI Works 封面图已出**。
三套自检全绿：契约 PASS 14、完整回归 PASS 14 / FAIL 0、轻量回归 PASS 7 / FAIL 0。
**未提交**：本会话改了 10 个文件（见第 2 节），工作树有未提交改动。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/api.json` | **v0.7** · `info.summary` + `info.description` 整段重写（产品结构段 / 接口表删 4 行加 `/api/advice` / 硬规则 1 / 渲染责任段）+ 6 处零散 schema 说明 | D66 改了主线但这份没跟着改（D69） |
| `contracts/contract.json` | `api_contract.version` v0.6→**v0.7** · `frozen_endpoints` 换 11 个（含 `POST /api/advice`）· **新增 `voided_endpoints`** 记 4 个作废路径 | 冻结清单必须与实际接口一致；作废不等于从未存在 |
| `contracts/CONTRACTS.md` | 接口表删 4 行 / 加 `/api/advice` + 作废说明块 / 产品结构段（2026-11-17→2026-11-24）/ 专属底线换成「每步带依据编号」/ 台词数 13→**14** / 新增「「问它」（`POST /api/advice`）」整节 | 人读版必须与机器可读版同步 |
| `scripts/build-check.js` | `REQUIRED_API_PATHS` 14→**11** · 成功文案按 `.length` 动态拼 | 原来还在按旧主线要接口，跑官方链第 1 步直接 FAIL |
| `scripts/check-contract.ps1` | **加固第 11 项**（不新增第 15 项）：校验 `frozen_endpoints` == `api.json` 的 `METHOD path` 集合，且 4 个作废路径必须登记进 `voided_endpoints` | 两份各写各的 → 换台机器接手时静默出错 |
| `docs/decisions.md` | 追加 **D68**（台词保持现状）/ **D69**（契约四份同步 + 焊死校验）/ **D70**（官方 helper 链条 + Windows 0755 处理） | 决策层只增不改 |
| `docs/P1-三件产出.md` | §2.5 实测数字换成当次真值 · §2.6 表里 5 句「待拍板去留」全改成「✅ D68：保持现状」· 3 句前端固定文案状态列同上 · §三 静帧 2 换成「问它」 | 用户「台词先这样」「图片你上新」落地 |
| `docs/产品说明计划书.md` | **v1.0 定稿**：去「待人审」· §2.4/§3.2 实测数字换真值 + 注明「步数会变、形状固定」· 新增 §5.8 部署包实况 · §5.5 加「不自制打包器」· 附「AI Works『项目说明』精简版」更新 · 待补清单只剩公网链接与视频 | 用户「计划书可以定稿」 |
| `docs/部署指南.md` | §2 加 **2.a 官方 helper 公开下载地址** + **2.b 七步** · §2.0 指纹换成 2026-11-24 那份 · §2.1 补「本地副本打 POSIX-only 补丁」的具体做法 | 下个 AI 换机器重跑不用再摸索 |
| `docs/status.md` | 「最后更新」+ §二 加本轮五条 + §三 加「上传 401」阻塞项 | 状态页是跨人接缝 |
| `docs/p1-frames/frame-2-ask.html` / `.png` | **新增**（1600×900）—— 静帧 2 重画为「问它」主题 | 用户「图片你上新」 |
| `docs/aiworks/cover-icon.html` / `.png` | **新增**（1024×1024）—— AI Works 建站「+」位封面图 | 用户要能放在截图「加号」位置的图 |
| `docs/p1-frames/frame-2-terrain-fracture.html` / `.png` | **已删除** | 认知地图已下线，留着会被误当现行插图 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：在 WSL 里跑官方 helper 全链，避开 Windows 的 `st_mode` 没有 exec 位。
  **结果**：WSL 有个 `OctoLoop` 发行版，但磁盘镜像缺失 —— `Wsl/Service/CreateInstance/MountDisk/ERROR_PATH_NOT_FOUND`。
  **结论**：这台机器**没有可用 POSIX 环境**（也没 docker、没 msys2 python）。Windows 上的 0755 问题只能按 D70 的办法处理，别再试 WSL。

- **尝试**：直接跑 `python scripts/validate_deploy_output.py <proj>`。
  **结果**：`error: scf_bootstrap mode must be 0755` / `validation failed: 1 error(s)`，exit 1。
  **根因**：Windows 上 Python 对普通文件的 `st_mode` 永远是 `0o666`/`0o444`，**没有 Unix exec 位可表达** → 这条判定在 Windows 上必然误报，与产物合规无关（内容校验其实已通过，错误只有这一条）。
  **结论**：已改**本地解压副本**（`%TEMP%\aiworks-helper\...\scripts\validate_deploy_output.py`）把该判定改成 `if os.name != "nt" and ...`，另存 `.orig` 原件。**补丁只在临时目录，不进仓库、不进交付包**；权限位由 `scripts/fix-zip-exec-bit.py` 补进 ZIP 条目并逐项复检。

- **尝试**：用 `node -e` 内联改 `contracts/api.json` 与 `contracts/CONTRACTS.md`。
  **结果**：PowerShell 把内层引号吃掉 —— `Bad character escape sequence, expected 4 hex characters`。
  **结论**：**中文长文本一律走 `.mjs` 脚本文件**（本轮连踩两次：`node -e` 写 json、测试脚本里 `console.log` 带中文都被吃掉）。本轮所有长段落替换都走 `.ctx/*.mjs` + MISS 报告。

- **尝试**：用 `edit` 工具改 `contracts/CONTRACTS.md` 的接口表。
  **结果**：`rep('接口表加 /api/advice')` 未命中 —— 我把卡片行的第三列记成了「主流程」，实际是 `` `user/question_recommendations` + `content/question_answers` ``。
  **结论**：接口表改之前**先读那一行的真实内容**，别凭记忆写 old_string。

- **尝试**：PowerShell 里 `(Get-Content ...) -replace ... | Set-Content` 改脚本。
  **结果**：被本地安全策略拦下 —— `Local hard safety policy blocked bash: write/delete targets cannot be verified safely after a command working directory change.`
  **结论**：**命令里不要先 `cd` 再写文件/删除**；改文件用 `write`/`edit` 工具，命令不带 `cd`。

- **尝试**：冒烟脚本里 `try { body = await r.json() } catch { body = await r.text() }`。
  **结果**：`TypeError: Body is unusable: Body has already been read`（`/web/` 返回 HTML 不是 JSON → `json()` 已经把流读掉了）。
  **结论**：**先 `await r.text()` 再 `JSON.parse`**，不要 `json()` + `text()` 混用。

- **尝试**：反向验证脚本里用正则 `/冻结清单与 api\.json 对不上/` 去匹配报错。
  **结果**：`命中=false`，但退出码确实是 1 —— **是我测试脚本的正则写错了**（脚本里写的文案是「不一致」，我测的是「对不上」），**不是校验没生效**。
  **结论**：反向验证要看**报错原文**，别只看退出码；我的正则和被测文案对不上时，先确认是不是自己在测错东西。

- **被推翻的思路**：想让 `scf_bootstrap` 在磁盘上真的变成 0755（`os.chmod` → `stat`）。**做不到**，NTFS 就没有这个概念。别再试。

## 4. 下一个 AI 接手前必须知道的事

- **`.ctx/` 里一堆 `.mjs` 脚本是本轮的临时工具**（`fix-api-desc` / `fix-contracts-md` / `add-advice-row` / `harden-check-item11` / `neg-test-frozen` / `debug-check-out` / `show-plan` / `verify-zip` / `check-injection` / `check-dangling-refs` / `smoke-delivery` / `show-advice-plan` / `finalize-planbook` ×2 / `update-p1-doc` / `update-deploy-guide` / `update-status` / `add-decisions` / `patch-validator-windows`）。**`.ctx/` 已 gitignore**，留着无害，但**它们是一次性脚本**，别当成长期工具依赖。

- **交付包在 `%TEMP%\congxin\`**，**不在仓库里**。重新出包：
  ```powershell
  node scripts\make-delivery.js --secret    # → %TEMP%\congxin（会清 _tmp/）
  ```
  然后**必须重跑官方七步**（make-delivery 会把 `_tmp/` 清空，helper 的产物全没了）：
  ```powershell
  $proj="$env:TEMP\congxin"; $skill="$env:TEMP\aiworks-helper\zhihu-ai-works-deploy-helper"; $repo='C:\Users\steam\Desktop\从心'
  python "$skill\scripts\inspect_node_project.py" --root $proj --output "$proj\_tmp\deploy-plan.json" --backend-html-pages "$proj\_tmp\backend-html-pages.json"
  python "$skill\scripts\write_backend_runtime.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$skill\scripts\write_deploy_descriptors.py" --output-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$skill\scripts\validate_deploy_output.py" $proj
  python "$skill\scripts\settle_agent.py" --project-root $proj --product-code minimax-code --product-name "MiniMax Code" --product-version unknown --platform desktop
  python "$skill\scripts\create_project_archive.py" --project-root $proj --plan "$proj\_tmp\deploy-plan.json"
  python "$repo\scripts\fix-zip-exec-bit.py" "$proj\congxin.zip"
  ```
  **不要加 `--build-validation`**（D53）。**每次出包指纹都会变**，对外只报当次实测的 SHA-256。

- **helper 是公开可下的**，不用找任何人要：`https://zhstatic.zhihu.com/skill/application/d6c1-260923/zhihu-ai-works-deploy-helper_v1.2.0.zip`。PowerShell 里**变量名别叫 `$zip`**（会被安全策略误判成 `zip -m`），用 `$pkg`。

- **`.ps1` 必须 UTF-8 with BOM**，`.md`/`.json` UTF-8 无 BOM 纯 LF。改 `.ps1` 用 `.mjs` 脚本写（`'\uFEFF' + s`），别用 `edit` 工具（可能丢 BOM）。改完跑 `node .ctx\check-encoding.mjs <files...>`。

- **契约自检**：`powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1`，期望 **PASS 14 / WARN 0 / FAIL 0**。
  **回归**：`node scripts\regress-p3.js --light --base http://localhost:18801`（PASS 7）与 `node scripts\regress-p3.js --base http://localhost:18801`（PASS 14，**会烧 1 次直答**）。服务 1 小时自灭，`fetch failed` 先怀疑它自灭了。

- **目录所有权（D65）**：队友 `5zdz5` = `web/index.html`、`web/css/`、`web/assets/`、`assets/`、`docs/adr/`；本会话 = `web/js/`、`server/`、`contracts/`、`scripts/`、`docs/decisions.md`、`docs/status.md`。**我们不碰 `web/index.html`**；新增界面在 `web/js/` 建 DOM，样式走 CSS 变量。

- **`web/index.html` 里 `btn-tension` / `btn-terrain` 还留着**（认知闭环的历史残留），**等队友删**，我们不引用了。`contracts/ui-contract.json` 已把这批钩子标记为「已释放」。

- **`README.md` 里还有 `web/docs-shot-terrain.png`（认知地形截图）** —— 在队友地盘，**本轮没动**，要在 README 提报前处理掉。

- **GitHub push** 走 Clash 代理：`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 -c http.lowSpeedLimit=0 -c http.lowSpeedTime=600 push origin main`。**禁 `git add -A`**，一律 `git add -- <显式路径>`。

- **commit 的 `Context:` 必须由人写**（`.githooks/commit-msg` 强制 `Context:`/`Tried:`/`Verify:` 三行）。本轮用户已给候选 A 的方向：**Context 写结论，不抄聊天原文**。

## 5. 下一步（按优先级）

1. **用户在自己浏览器上传 `%TEMP%\congxin\congxin.zip` 到 AI Works step=2**（平台上传侧 401 是平台问题，不是包的问题）—— 详见本会话给用户的「一步步做公网链接」指引。
2. **提交并推送本会话的 10 个文件改动**（`.ctx/current.md` 写好 `Context:` 再 commit）。
3. **12-05 10:00 参赛项目通道开启后**：把 AI Works 建站成果绑定到参赛项目 + 拿 OAuth 凭证（App ID / App Key），接登录入口。
4. **删掉 README 里的认知地形截图**（队友地盘，需先沟通）。
5. **Demo 逐秒脚本按 D66 重排镜头顺序**（台词按 D68 一句不增不删，只换镜头）。

## 6. 需要人拍板的事

- **上传失败后怎么办**：用户自己浏览器也失败的话，是找赛事组（官方小助手微信 / openplatform@zhihu.com）还是继续重试？—— 建议找赛事组，别反复重试。
- **12-04 前公网链接拿不到的话怎么办**：AI Works 建站（12-05 前）与参赛绑定（12-05 10:00 后）本来就是两件事，**有没有必要在 12-04 前先建站拿到一个能访问的链接**，还是等 12-05 通道开了再一起做？—— 这影响用户接下来几天怎么排。
- **`docs/产品说明计划书.md` 的 AI Works「项目说明」精简版**（约 700 字）—— 内容 AI 已按事实写好，**要不要逐字过一遍再粘贴**？（粘贴到平台 step=1 的「项目说明」字段前，人可以再改；字段现在是空的。）
- **「问它」的展示顺序**：计划书里现在把「卡片主流程」写在前、「问它」写在后，但演示开场（口播版）已经改成桌宠先出场。**Demo 与计划书的叙事顺序要不要对齐**？
- **演示视频**（用户说「不急」）：要不要在 12-04 前预留拍摄时间？—— 视频与截图都必须不含密钥，**部署专用密钥已出现在对话记录里，赛后要轮换**。
- **`web/index.html` 里 `btn-tension` / `btn-terrain` 的删除**：已写进给队友的零 N，但队友还没回。**要不要催一次**？
