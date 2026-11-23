# 交接：清理已合并分支 + 补交付包白名单（队友 11-23 新提交带出来的 4 个漏带文件）

- **时间**：2026-11-23 13:0x
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `9601112`（队友提交）+ 本次未提交改动
- **本次目标**：① 删掉已合并的远端 `web/apple-daily-redesign` + 本地 `review/apple-daily-redesign`；② 队友 11-23 直推 main 的 `9601112` 带来的**交付包白名单缺口**补上并验证。

## 1. 现在处于什么状态

- 远端**只剩 `main` 一个分支**（`refs/pull/1/head` 是 GitHub 的 PR 存档，正常，不需要也不该删）。
- 交付链已经能正确装进队友 11-23 新增的 4 个运行期文件；**交付副本实测 0 个静态 404**。但**交付包本身还没重出**（等部署专用密钥）。
- 队友这次改动**没打坏主流程**：回归 PASS 15 / FAIL 0、契约自检 PASS 13 / WARN 0 / FAIL 0、浏览器 console 0 错、网络 0 失败。
- 硬时间线不变：**12-04 15:59 报名截止 → 12-05 10:00 创建项目通道 → 12-07 02:00 提交截止**。AI Works 上传的 401 **必须在 12-05 10:00 前修好**。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `scripts/make-delivery.js` | `DIRS` 增加 `web/vendor/remixicon`、`web/assets/companion`（**整目录**，不是逐个文件） | 队友新加的图标字体（css + woff2）和陪伴空间素材（背景图 + 动效 mp4）**4 个文件原本漏带** → 上线会掉图标、桌宠动效区和陪伴空间背景是空的 |
| `scripts/make-delivery.js` | `checkRuntimeRefs()` 增加 `byBase`（按文件名索引），纯文件名（不含目录）按「运行时拼目录」处理：包里有同名文件就放过并记一条说明，**一个同名文件都没有才报错** | `web/js/pet-companion.js` 的 `map[mood] = ['idle.webp', ...]` 路径是运行时才拼的（`` `../assets/kanshan/${file}` ``），静态扫不出完整路径，D56 的自检会**误报成缺件** |
| `scripts/make-delivery.js` | `checkRuntimeRefs()` 返回值从 `problems[]` 改成 `{ problems, notes }`；主流程把 `notes` 逐条打印出来 | 放过哪些要**留痕**，不能悄悄放过 |
| `docs/decisions.md` | 追加 **D57** | 决策层只增不改 |
| `docs/status.md` | 「已完成」新增 2 条 bullet（分支清理、队友新提交已验）；**B24 改写**（gate/consistency 划掉）；**新增 B25** | 状态文档要反映最新事实 |
| 远端 `web/apple-daily-redesign` | **已删除** | PR #1 已 ff 合并，内容 100% 在 main |
| 本地 `review/apple-daily-redesign` | **已删除** | 同上 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：在交付副本里用**环境变量**传密钥（`$env:ZHIHU_ACCESS_SECRET=...; node server/src/index.js`）。
  **结果**：`/api/quota` 回 **401**。
  **原因**：`make-delivery.js` 的 `patchConfig()` 会把 `server/src/config.js` 改写成**只读文件**（平台注入形态），环境变量那条路在交付副本里被去掉了。
  **结论**：交付副本要带密钥，必须 `node scripts\make-delivery.js --secret` 把密钥写进 `secrets/access_secret`。**但验证「静态资源完整性」根本不需要密钥** —— 我这次就是靠这一点在交付副本上跑完了浏览器验证。

- **尝试**：在交付副本（18801）上跑完整演练验证 API。
  **结果**：10 个 API 全 **401**（quota / favorites ×2 / contents / cards / tension / situation ×3 / terrain）。页头如实显示「额度没读到」，日报区显示「还没嚼出卡片。先点「用我的收藏喂它」。」——**这是预期的诚实降级，不是 bug**。
  **结论**：交付副本的**静态资源验证**与**API 验证**要分开做，前者不烧额度，后者要真密钥。

- **尝试**：一条命令里先 `cd` 再删目录（`cd 'C:\Users\steam\Desktop\从心'; & 'C:\Users\steam\.minimax\bin\mavis-trash.cmd' -- ".ctx\delivery-check"`）。
  **结果**：被本地硬安全策略拦下，原文：
  `Permission denied for bash: Local hard safety policy blocked bash: write/delete targets cannot be verified safely after a command working directory change.`
  **结论**：删除操作要**单独一次调用 + 绝对路径**，不要跟在 `cd` 后面。

- **尝试**：用 `edit` 给 `docs/status.md` 的表格加 B25 行。
  **结果**：old_string 写的是 B24 整行、new_string 只放了 B25 → **B24 被整行替换没了**（同一次编辑里没有别的内容锚定）。
  **结论**：表格行追加要用「old = 锚点行、new = 锚点行 + 新行」这种写法，别只放新行。**已修回**，现 B24 / B25 都在（`docs/status.md:121-122`）。

- **被推翻**：交付副本起不来时，第一反应怀疑「`.ctx/delivery-check` 缺 node_modules」→ **不是**。Node 会**向上**找仓库那份 node_modules，所以放在仓库内的副本能直接跑。

- **差点走错**：本想把交付副本放到 `%TEMP%` 再 junction 过去 → 上一轮已经证明 `mavis-trash` 拒收 junction，得连带回收整个外层目录。**直接放仓库内 `.ctx/` 最省事**（`.ctx/` 已 gitignore）。

## 4. 下一个 AI 接手前必须知道的事

- **本次改动还没提交**（收工时提交，提交前记得重新填 `.ctx/current.md`）。
- 起本地带密钥服务（18800）：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心'
  $env:PORT='18800'; $env:HOST='0.0.0.0'
  $env:ZHIHU_ACCESS_SECRET = [System.IO.File]::ReadAllText("$HOME\.zhihu-cli\access_secret").Trim()
  node server/src/index.js
  ```
  ⚠️ 后台跑有 **1 小时硬上限**；要常驻用 `powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1`。
- 回归**必须带 `--base`**：`node scripts\regress-p3.js --base http://localhost:18800`（默认 base 是 18787，不带会连错端口）。`--light` 不烧额度。
- 交付副本生成到**仓库内** `.ctx/` 下：`node scripts\make-delivery.js --out ".ctx\delivery-check"`。
- 打包自检的**两条新规则**（D57）：① 纯文件名按「运行时拼目录」处理；② 一个同名文件都没有才报错。改 `checkRuntimeRefs()` 时别把这条改回严格模式。
- 队友 11-23 的 `9601112` 是**直接进 main** 的（不是分支）→ 以后拉代码先 `git fetch origin`，本地可能落后（这次就是落后 1 个提交才发现）。
- **Browser skill 的凭证会被上下文压缩清掉** → 压缩后第一次用 Browser 必须先 `skill` 加载 `browser-use:control-in-app-browser`，否则返回 `SKILL_REQUIRED`。
- 提交纪律：**禁 `git add -A`**，一律 `git add -- <显式路径>`；提交前 `git fetch` + `git pull --rebase origin main`；**每次提交前都要重新填 `.ctx/current.md`**（commit hook 会自动把它填进 commit message，提交完该文件被清空成 0 字节）。
- `docs/handoffs/` 是 `docs/协作规范.md` 里唯一的例外目录（D43），本会话已按协议往里写。

## 5. 下一步（按优先级）

1. **用户申请部署专用 Access Secret** → 存 `C:\Users\steam\.zhihu-cli\access_secret.deploy`（B19）。
2. **重出交付包**：`node scripts\make-delivery.js --secret` → 归档。**必须包含队友 11-23 的新文件**（打包自检会兜住，但别跳过 `--secret`）。
3. **用户在 Chrome / Edge 手动传包**（401 未解，**12-05 10:00 前**必须修好；建议顺序「先修 401 → 再重出包」，别重出两次）。
4. **计划书人审**（§2.2「和上届 MeetMind 的区别」那句 + §三 数字表述）。
5. **用户自己发零 L·补 稿给队友**；**拍演示视频**（按 D55 新开场顺序，人录）；**B10 约 3—5 人试用**（11-28 前）。
6. **问赛事组**：「12-04 前公网链接」是硬规则还是自定余量；12-07 到底是提交截止还是决赛路演日。

## 6. 需要人拍板的事

- **队友说的「新分支」到底指哪个** —— 现在 main 上已经多了 `9601112`。如果他指的是**另一个还没推上来的分支**（或者在他那个 404 的私有沙盒里），要他自己说清楚，AI 看不到。
- **交付包要不要带队友新加的 1.4 MB 背景 PNG**（`web/assets/companion/A_calm_healing_style_digital_i_2026-11-23T03-34-53.png`）—— 压缩能省 ~1 MB，但那是队友的素材，要不要动得他点头。
- **账号登录审核声明最终填「是/否」**（12-05 拿到 OAuth 凭证后定）；封面是否上传；D10「可安装 PWA」补不补；是否填「站外链接 / GitHub 仓库」。
- **P4 真 3D 推镜**由队友做，但交付包重出前必须确认他改完没有 —— **重出包之前不要再让队友动 `web/`**，否则又要重出一次。
