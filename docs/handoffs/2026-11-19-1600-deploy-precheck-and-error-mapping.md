# 交接：台词逐句审拍板落库 + 部署预检三件套 + 三处错误映射回归契约

- **时间**：2026-11-19 16:00
- **使用的 AI 平台**：MCode（MiniMax Code）
- **分支 / commit**：`main` @ `36dd7ae`（已推 origin/main；本交接为下一个 commit）
- **本次目标**：① 把用户对台词逐句审的三项拍板落库（D45）② 做部署预检 / 打包 / 部署指南，压 **12-04 前必须拿到正式公网链接**这条硬截止 ③ 做明早额度满额后的一键回归脚本。过程中另修了三处「实现和契约对不上」的真 bug。

## 1. 现在处于什么状态

- **P3 明天（11-21）收口**；提报窗口 **12-05 10:00 → 12-07 10:00 冻结**；**正式公网链接必须 12-04 前拿到**。
- **台词已全部拍板落库**：脚本现为 **18 拍 + 1 边界态**，`contracts/tone.json` 的 **14 句 × 2 语气一个字没改**，14 句全部在册（D45）。
- **部署侧除「上传与发布」外全部就绪**：`node scripts\predeploy-check.js` 一条命令出 **ZIP（77 文件 / 1901 KB）+ manifest + 「部署前 9 条检查」对照报告**，实跑全绿。**上传 / 发布必须由用户在平台点**（用户已拍板的口径）。
- **今天额度已耗尽**：问题发现 **used=100 / remaining=0**（每日 00:00 重置、不结转）→ **完整回归必须等 11-20 00:00 之后**。`--light` 模式不烧额度（已实跑 6/6 PASS）。
- **服务在跑**：后端 18787（`bg_e9b3e47a`，带密钥，新代码）、前端 18788（`bg_cdf4ea0e`）。
- **本轮所有改动已提交并推送**（`454cd52` + `36dd7ae`），工作区干净。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `docs/P1-三件产出.md` | §二 脚本排入 `fracture`（3:50—4:05）与 `insufficient`（3:25 边界态）；4:05 补「等地图出来 ≈4—5 秒再点断层标记」操作备忘；3:25 / 3:50 的引文改为**屏幕原文**；「桌宠台词」列说明区分气泡 / 面板上的字 | 用户 11-19 15:3x 逐句审拍板（D45）。原引文是**意译**，屏幕上根本没有那两句 |
| `docs/decisions.md` | 追加 **D45**（台词拍板）与 **D46**（部署面收口：密钥三来源 / 缺凭据不退出 / 部署包白名单 / 额度耗尽映射 / 坏 JSON 400 / scripts 全 ESM） | 决策层只增不改 |
| `docs/status.md` | 「已完成」补 4 条；「下一步」重排并补「明早额度满额后跑完整回归」与部署就绪状态；时间戳更新 | 记录纪律：失败与未验证数据显式标注 |
| `README.md` | D1—D45 → **D1—D46**；补 `docs/部署指南.md` 入口；「部署形态」段补**密钥三种来源**与**部署前自检**命令；状态行补「部署包已就绪（尚未上传）」与 12-04 硬截止 | 交付物自述要跟得上代码 |
| `scripts/build-check.js`（新） | 检查一份源码树能不能当作品跑，**11 项**（必需文件 / 素材 / 契约 / package.json / ESM / 静态挂载与顺序 / 密钥来源 / 不依赖 docs/）；模块 + CLI 双用 | 部署前先知道自己漏了什么 |
| `scripts/pack-deploy.js`（新） | **白名单**打包（不是扫全仓库）；排除 `node_modules` `.git` `.ctx` `dist` `docs` `.env*` `access_secret` `secrets/` 与 5 张文档截图；出 `.manifest.json`（SHA-256 + 字节数） | 白名单比排除法安全：以后仓库多出什么都不会被带进去 |
| `scripts/predeploy-check.js`（新） | **六步**预检 → 源码树检查 → 打包 → **解包到临时目录** → 对解包结果再检查 → **把本机 Access Secret 读进内存逐文件比对包里有没有它** → 临时目录**真起进程**探 5 个 URL → 仓库自检 → 出 9 条检查对照报告 | 「包里有没有密钥」这件事必须机器判，不能靠人眼 |
| `scripts/regress-p3.js`（新） | 按 5 分钟 Demo 脚本顺序走 **HTTP** 全链路，**15 拍**逐拍打印期望/实际/判定，末尾出逐拍对照清单；`--light` 不烧额度；独立 `x-session-id: regress-p3` | 明早额度满额后一条命令跑完，不用手点 15 处 |
| `scripts/build-kanshan-assets.js` | CJS → **ESM**（`import` + `fileURLToPath(import.meta.url)`） | 根 `package.json` 加 `"type":"module"`（D42）后，**整个素材脚本跑不起来** |
| `server/src/config.js` | 加 `resolveAccessSecret()`：env → env 指的文件 → 4 个约定路径；`assertConfig()` 改为返回问题清单 | 官方口径是「秘钥写入文件直接构建」，只读 env 会启动失败 |
| `server/src/index.js` | 启动自检：缺凭据**警告 + 照常启动**，不 `process.exit(1)` | CrashLoop 让评委看到空白页，比诚实的报错更糟 |
| `server/src/lib/errors.js` | `toApiError` 映射 body-parser 的 `entity.parse.failed` → `VALIDATION_ERROR`（400）+ hint「请求格式不对，检查一下发过来的内容」 | 坏 JSON 回 500「我们正在查」是假提示 |
| `server/src/zhihu/client.js` | 上游 `Code=30002` → `ZHIHU_QUOTA_EXHAUSTED`（429 / retryable false）；`Code=20001` → `ZHIHU_AUTH_INVALID`；无任何凭据时**不白跑上游** | 契约 `x-error-codes` **早就定义** `ZHIHU_QUOTA_EXHAUSTED`，只是代码从没抛过 |
| `server/.env.example` | 补 `ZHIHU_ACCESS_SECRET_FILE` 与约定路径说明 | 密钥来源文档化 |
| `.gitignore` | 补 `secrets/` `.secrets/` | 约定路径不能被误提交 |
| `package.json` | 新增 `build` / `deploy:pack` / `deploy:check` / `regress` 脚本 | 平台的构建步骤有兜底 |
| `package-lock.json`（新） | lockfileVersion 3，69 包 | 部署时 `npm install` 可复现 |
| `docs/部署指南.md`（新） | 现状表 → 一条命令跑预检 → 平台四步 → **密钥怎么给**（三种方式 + 怎么验配对没配对）→ 端口 → **preview 上必须自己走一遍的 7 步清单** → 9 条摘要 → 常见故障表 | 上传与发布由人做，手不能没有 |
| `web/js/terrain.js` | 修掉注释里**先前遗留**的 U+FFFD 乱码（`决定块<U+FFFD>视觉体量` → `决定块的视觉体量`） | 编码纪律：全库 U+FFFD 计 0 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `node -e "require('./contracts/api.json')"` 读契约路径。
  **结果**：`ReferenceError: require is not defined` —— 根 `package.json` 是 `"type":"module"`，`.ctx/` 下的临时脚本也在根目录内，**同样是 ESM**。之前以为 `node -e` 走 CJS，**这是错的**：`node -e` 在 `"type":"module"` 的包里也走 ESM。
  **结论**：写临时脚本一律用 `.mjs` 或 `import`，别指望 `require`。

- **尝试**：跑 `node scripts\build-kanshan-assets.js` 重生成素材。
  **结果**：一启动就报 `require is not defined`（脚本还是 CJS），而根 `package.json` 早已是 ESM（D42 加的）——**素材脚本已经哑了一段时间，只是没人跑它**。
  **结论**：D42 那次改 `type: module` 时必须把所有 `scripts/*.js` 一起过一遍。已转 ESM 并实跑验证（6 个动作逐字节重转，`assets/` **无 diff**）。

- **尝试**：用 `node --check` 检查 ESM / CJS 混用。
  **结果**：**查不出来** —— `require` 是合法 JS 语法，`node --check` 不做模块解析。
  **结论**：只能实跑，或看最近的 `package.json` 有没有 `"type":"module"`。

- **尝试**：完整回归跑第二遍。
  **结果**：**13/14 PASS**，唯一 FAIL 是 4:15 情境题，上游 `Code=30002 quota exceeded`。脚本**如实报 FAIL 并继续跑完**（这是对的行为，不是 bug）。
  **结论**：这是**额度真的耗尽了**，不是代码问题。完整回归必须等 00:00 重置。

- **尝试**：回归脚本读地形响应。
  **结果**：第一次跑 14/15，唯一 FAIL 是「地形 3 层 + 断层标记」这拍——脚本以为 `data.terrain.layers` 是数组，实际是**对象**，键为 `self_reported` / `behavioral` / `situational`。
  **结论**：后端返回的 `layers` 是**按层名分键的对象**，不是数组。

- **尝试**：用 `curl.exe -d '{...}'` 发 JSON 测坏 JSON。
  **结果**：被 PowerShell 吃掉引号，测出来的是**另一种**失败。
  **结论**：PowerShell 下发 JSON 一律用 `node -e` + `JSON.stringify`。

- **尝试**：在 `.ctx/` 下写验证脚本后用 `node .ctx\xxx.js` 跑。
  **结果**：第一次成功（因为没用到 require），第二次挂在 `require('fs')`。
  **结论**：见上面第 1 条。

- **尝试**：第一次写 `status.md` 时用 `edit` 替换「残留缺口」那条 bullet 来插入新内容。
  **结果**：**把那条原有 bullet 整条替换掉了**（新内容不含原条目）。
  **结论**：`edit` 的 `old_string` 要是**锚点**，不是「要被换掉的东西」；插入新条目要**保留锚点全文**。发现后已补回。

- **尝试**：手打中文长句时混进了一个 `<U+FFFD>`（U+FFFD）。
  **结果**：写 `status.md` 的第 9 条时出现「能给人看的<U+FFFD>西」。
  **结论**：全库扫 U+FFFD —— 结果揪出 `web/js/terrain.js` 里**上一轮就留下的**同类乱码（`决定块<U+FFFD>视觉体量`），已一并修掉。**每次写完文档都要扫。**

- **被推翻的结论（上一轮的）**：`web/js/terrain.js` 的 U+FFFD 一直存在，说明上一轮改这个文件时**没扫过 U+FFFD**。「写完扫 U+FFFD」这条纪律当时就没落实。已补上并写进本交接。

## 4. 下一个 AI 接手前必须知道的事

- **公网部署还没做**：形态、包、预检、指南都齐了，**只差「用户授权 + 人在 AI Works 平台点」**。不要自己上传、不要自己发布。**正式链接必须在 12-04 前拿到。**
- **额度**：问题发现 **0/100**，00:00 重置。明早第一条命令就是 `node scripts\regress-p3.js`（≈11 次问题发现）。**别在今天跑完整回归。**
- **端口**：本机 **8787 绑不上**（EACCES），后端必须 **18787**。
- **起后端**（改动 `contracts/tone.json` 或 `server/src/**` 后**必须重启**）：
  ```powershell
  cd 'C:\Users\steam\Desktop\从心\server'
  $env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
  $env:PORT = '18787'; node src/index.js
  ```
- **后台 bash 任务 1 小时上限会静默 kill** → 开工先探端口（前后端本轮各被回收过一次）。
- **`node -e` 与临时脚本都可能是 ESM**：根 `package.json` 是 `"type":"module"` → `scripts/`、`server/`、根下所有 `.js` 全是 ESM。**新增 `.js` 写 ESM**（要 CJS 就用 `.cjs`）。
- **`rm` 一次只能一条顶层命令**（`Remove-Item` 被拦）；`rm` 与其他语句同一条会被拦。
- **`.ctx/` 已 gitignore**，但里面堆了本轮及往轮的临时文件；写完记得清。`.ctx/current.md` 被 commit-msg hook 在提交后**自动清空** —— 下次要填 Context 时**必须先 `read` 再 `write`**，否则写工具会因「文件已变」拒绝。
- **密钥**：`C:\Users\steam\.zhihu-cli\access_secret`（仓库外、gitignore），只在本机，前端永远不碰。
- **目录所有权**：`assets/`、`docs/adr/` 归队友 `5zdz5`；`web/`、`server/`、`contracts/`、`docs/decisions.md` 归本会话。`docs/handoffs/` 是**例外**（协议要求照旧写）。共享区**默认直推 main**（D41）。
- **不要动 `docs/adr/`**（队友目录），也不要改 `contracts/` —— 契约层已冻结（D28）。

## 5. 下一步（按优先级）

1. **明早 00:00 后跑完整回归**：`node scripts\regress-p3.js`（≈11 次问题发现）。上一次是 13/14，唯一 FAIL 是额度耗尽；重置后应为 14/15 或 15/15。
2. **授权公网部署**：AI Works 源码发布 → 上传 `dist/deploy/` 里的 ZIP → preview → 正式发布。步骤见 `docs/部署指南.md`。**12-04 前必须有正式链接。**
3. **人亲手把 P3 闭环点一遍**（真实数据、不 mock）——AI 已代跑 9/9 + HTTP 回归 15 拍；**人眼**要判的三件：5 分钟够不够、台词念出来顺不顺、失败态提示像不像人话。
4. **拍演示视频**（第 4 条硬要求，逐秒脚本在 `docs/P1-三件产出.md` §二）。**只能人录。**
5. **零 G / 零 H / 零 K 由用户自己发**（文本已改好；核实过**只有零 I 真的发过**）。
6. **B14 三件事等队友确认**（6 类够不够用 / 未归类怎么显示 / 要不要进计划书）；**B10 约 3—5 人试用**（11-28 前）；**B4** 12-05 后取 App ID / App Key（**不发邮件**）。
7. **保命砍法尾巴**（P3 之后）：落版画面（4:50—5:00）、镜头动效、Three.js 真 3D 推镜。

## 6. 需要人拍板的事

- **公网部署的授权**（形态 + 包 + 预检 + 指南都已就绪，**上传与发布要人在平台点**）。
- **演示视频谁来录、录哪一版**（AI 不能录）。
- **PWA 补不补**（D10 定的「可安装 PWA」至今未落地，README 已写成实话；**收口前别动 service worker**，缓存风险）。
- **零 G / 零 H / 零 K 何时发**（AI 不参与发送）。
- **D47 及以后**：如果额度耗尽时要不要**自动降级**（例如情境题直接给本地题面 + 明确标注「今天额度用完了，这道题是我自己编的」）—— 这是产品决策，**当前实现是回错误码、不降级**，符合赛规第 7 条「失败说真话」但体验上要人定。
