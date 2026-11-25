# 交接：AI Works 项目「从心」正式发布，正式公网链接到手，口径改写落库

- **时间**：2026-11-25 12:40
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ `07b9cd8`（本轮尚未提交，落档后会前进）
- **本次目标**：把「现在就点发布」这个授权执行到底 —— 改项目说明口径 → 发布 → 验正式域名 → 落档。

## 1. 现在处于什么状态

1. **AI Works 项目「从心」已正式发布**（`project_id = 240909`），正式公网链接 **`https://pekropd3uupx.aiworks.site`**（根路径 302 → `/web/`，**命令行直连 200、不需要知乎 SSO**）。
2. **知乎项目详情页 `https://www.zhihu.com/project/detail/240909` 的「体验项目」已内嵌该域名** → 评委在知乎项目页里能直接体验。
3. **D22「12-04 前拿到正式公网链接」已解除**（提前约 9 天）。
4. **黑客松侧参赛项目仍未创建**（`binding.project = {}`，创建通道 **12-05 10:00** 才开）→ 这是唯一剩下的动作。
5. **主链路继续冻结**（D74 §8 口径）：只做收口与演示准备，功能不加码。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `docs/decisions.md` | 新增 **D76**（发布流程实测 + 口径改写 + 正式域名 3 次加载数据 + 未取证风险） | 本轮事实进决策层，避免下个 AI 重新摸索发布流程与改写口径 |
| `docs/status.md` | ① 顶部「最后更新」→ 11-25 12:4x；② 「已完成」段顶部加 D76 条目；③ 阻塞项里「公网链接」从 🔴 改为 ✅ 并写明正式链接；④ D70 的 401 改为 ✅（用户手动上传成功）；⑤ B22 行补上「正式链接已就绪」的填法；⑥ §五 开头加「12-05 开闸后一次走完」的 7 步 | 让下一个 AI 一眼看到「正式链接已拿到、只剩黑客松建项目」 |
| `docs/handoffs/2026-11-25-1240-publish-formal-url.md` | 本文件 | 收工协议 S2 |

**没有改任何运行期代码。** `server/`、`web/`、`contracts/` 本轮**零改动** —— 这是一次「发布 + 口径修正 + 落档」的动作。

### 平台侧改了什么（不是仓库文件，但更重要）

| 对象 | 改了什么 | 为什么 |
| --- | --- | --- |
| `project_detail` | 4 处：`接入你的知乎收藏`→`读取知乎收藏内容`；`你收藏过的内容，还会每日汇总`→`收藏内容会每日汇总`；`选取两条立场不同的真实回答`→`选取两条真实回答`；删掉 `绑定知乎收藏后，` | D38「数据层给不出的结论不许写」。技术依据：`/api/behavior/favorites` 用**服务端自己的密钥**取数，**没有用户绑定流** → 「你的」是 over-claim；「立场不同」在 `contracts/api.json:892` 里写明数据层给不出 |
| `description` | 1 处：`卡片带出处也带真实分歧`→`卡片带出处也带两条真实回答` | 同上（**执行时才发现的第 5 处**，与用户批准的 3 处同口径） |
| 发布状态 | `deploy_status` `not_started`→`published`；`review_status` `reviewing`→`passed`；`formal_url` 空→正式域名 | 用户授权「**现在就点发布**」 |

**终验**：平台现存 `project_detail` = len 1175 / `<b>`×4 / `<li>`×8 / `<h3>`×3，
SHA-256 `d3141460c834c3c19c41e21ab1f5c4d7157160bc01bee33ef0ca4755f71793a7`，
与「会话记录里的原文 + 同样 4 处改动」**逐字一致** ✅。其余字段（`name`/`version`/`tags`/`cover_url`/`work_url`/`github_url`/`source_payload`）**未动**。

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `GET /api/v4/creation_project/drafts/240909` 复核发布后的草稿。
  **结果**：`{"status":40010,"msg":"项目草稿不存在"}` —— 发布后草稿被平台清掉，**这条复核路径失效**。
  **结论**：发布后要复核 → 改用 `GET /api/v4/creation_project/projects/240909`（含 `formal_url` / `published_at` / `source_project.latest_source_release`）。

- **尝试**：复核 `project_detail` 是否真的存上，先用 `GET .../drafts/240909` 取回再比。
  **结果**：同上 40010，取不到草稿。
  **结论**：**发布后只能靠 `projects/240909` 拿线上真值**（它返回的 `project_detail` 含 `data-pid`，len 1395 —— 比草稿态多的是平台自己加的属性，不是我们的文案）。

- **尝试**：用草稿里的 `project_detail` 长度当「改写有没有生效」的判据。
  **结果**：**误判风险** —— 草稿态 len 1175，线上 len 1395，差 220 字符是平台加的 `data-pid` 等属性，**不是文案差异**。
  **结论**：比长度**必须**先剥掉平台注入的属性，或直接比 SHA-256 / 逐字内容。

- **尝试**：把「点发布」当成一步操作。
  **结果**：点完只是跳到 detail 页，`formal_url` 还是空的，要轮询才等到。
  **结论**：**点发布后必须轮询 `projects/240909`**，看 `deploy_status` → `published` + `formal_url` 非空才算完；本轮约 **7 秒**。

- **尝试**：在 AI Works 发布方式里同时勾「站外链接」和「GitHub 仓库」。
  **结果**：**没点**（在提交前拦下了）。
  **结论**：平台原文「完成任意一种即可发布项目」；加 GitHub 可能让平台**改从 GitHub 源码构建**、**替掉我们上传的 CloudBase 交付包** → 等于把 D74/D75 的修复全作废。**GitHub 链接留给黑客松表单的选交加分项。**

- **尝试**：确认「读取知乎收藏」是不是 over-claim。
  **结果**：查 `server/src/routes/behavior.js:43` → `/api/behavior/favorites` 用**服务端自己的密钥**取数，**没有任何用户绑定流** → 「你的知乎收藏」在技术上不成立，确实是 over-claim。
  **结论**：口径要改，不只是措辞洁癖。

- **尝试**：复核说明原文时，用「我印象里平台有 8 个 `<b>`」当基准。
  **结果**：**误读**。用会话原始记录 `messages.jsonl` 提取原文，逐字数出来是 **`<b>`×4**（不是 8）。
  **结论**：**会话原始记录是唯一真值源**，不要靠记忆里的计数。提取脚本：`.ctx/check-orig-desc.mjs`（递归 walk 找字符串）。

- **尝试**：发布后用命令行 `curl` 正式域名。
  **结果**：**200**（但 preview 域名同一套命令是 302→SSO）。
  **结论**：正式域名**没有 SSO 门禁** → 好处是评委点开就能用；**副作用是所有访问者都可能烧我们的知乎额度，配额归属未取证**。

- **尝试**：在正式域名上做「主动 fetch 探测」。
  **结论**（沿用 preview 的教训）：**不主动发请求**，用 `performance.getEntriesByType('resource')` 的 `responseStatus` + `decodedBodySize` **零请求被动测**。

- **尝试**：查发布后是不是还有额外审核环节 / 审核时长上限。
  **结果**：**没查到**，本轮审核秒过不代表以后秒过。
  **结论**：**未取证**，别写进任何对外承诺里。

## 4. 下一个 AI 接手前必须知道的事

**必须先跑的命令**
```powershell
cd 'C:\Users\steam\Desktop\从心'
powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1    # PASS 14 / WARN 0 / FAIL 0
node .ctx\check-encoding.mjs docs\decisions.md docs\status.md docs\handoffs\2026-11-25-1240-publish-formal-url.md
```

**12-05 10:00 通道开闸后，一次走完这 7 步（顺序不能乱）**
1. 创建参赛项目 —— 黑客松侧 `binding.project` 现在是 `{}`
2. 选赛道 **8 = AI × 陪伴与交互**（D54；`tags=[7]` 那个 7 是内容分类，不是赛道）
3. 填项目信息
4. **填可运行体验链接 → `https://pekropd3uupx.aiworks.site`**（官网要求「网页须提供公网链接」）
5. 挂**产品说明计划书** `docs/产品说明计划书.md`（**必交**）
6. 挂 **GitHub 仓库链接** `https://github.com/nineanswerer/congxin`（**选交加分**）
7. 提交（**每队限 1 个作品**；官方接口硬值 `project_end_at` = **12-07 02:00**，窗口 **40 小时**）

**页面与接口**
- 黑客松主页：`https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p3`
- 官方指南：`https://hackathon-s3.event.zhihu.com/` → 点「阅读指南」展开 `02 / SUBMISSION` 卡片
- 正式公网：`https://pekropd3uupx.aiworks.site`（302 → `/web/`）
- preview：`https://pekropd3uupx.preview.aiworks.site/web/`（302 跳知乎 SSO）

```js
// 黑客松侧（浏览器内 fetch，带 SSO cookie）
'/api/v4/brand_influence/api/hackathon/config?activity_code=zhihu_hackathon_2026_p3'
'/api/v4/brand_influence/api/hackathon/me?activity_code=zhihu_hackathon_2026_p3'
'/api/v4/brand_influence/api/hackathon/teams/120227?activity_code=zhihu_hackathon_2026_p3'  // 不带 activity_code 会 status40010
// AI Works 侧（发布后唯一可用的复核路径）
'GET /api/v4/creation_project/projects/240909'
```

**坑（会踩死人）**
- **AI Works 上传侧 401 是平台侧**（`ApplyUpload` 签名校验失败）→ **只能用户手动上传**；AI 侧重试无意义。用户手动传是成功的。
- **正式域名对所有人开放** → 每个访问者都可能消耗我们的知乎额度；**按 access_secret 还是按终端用户计未取证**。
- **`D74` 改写不覆盖 `import(new URL(...))`** —— `web/js/app.js:1317` 的 `import(new URL('./demo.js', import.meta.url).href)` 未走 `__fromxinImp` → `demo.js` 无 module 级重试保护（D74 既有行为）。
- **发布后 `GET .../drafts/240909` 一定 40010** → 用 `projects/240909`。
- **平台 `cache-control` 在公网被改写成 `private, no-store`** → `STATIC_MAX_AGE_SEC` 不生效，每次刷新全量重下 → **必须连刷验收**。
- **比大小前统一口径**：`t.length` 是 UTF-16 字符数，`Buffer.length` 是字节数，中文注释下不等。
- **PowerShell `Get-Content` 读 UTF-8 无 BOM 中文会乱码**（控制台问题，不是文件问题）→ 用 Node 读。
- **`.ps1` 必须存 UTF-8 with BOM**；`.md`/`.json`/`.js` UTF-8 无 BOM、纯 LF。
- **禁 `git add -A`** → 一律 `git add -- <显式路径>`。
- **目录所有权（D65）**：队友 `5zdz5` = `web/index.html`、`web/css/`、`web/assets/`、`assets/`、`docs/adr/`；本会话 = `web/js/`、`server/`、`contracts/`、`scripts/`、`docs/decisions.md`、`docs/status.md`。
- **交付包纪律（D63 / B29）**：**不主动产出交付包**，打包、上传、发布各自独立授权。

## 5. 下一步（按优先级）

1. **12-05 10:00 通道开闸 → 按上面 7 步一次走完提交**（硬截止 **12-07 02:00**）。
2. **12-05 后取 OAuth 凭证**（App ID / App Key，赛事页面分配，不走邮件）→ 接登录入口；**Demo 主路径不依赖 OAuth 也能跑**（已用真实进程验过）。
3. **决定要不要拍演示视频**（选交加分项；**需排期，12-04 前**）。
4. **补发队友那条**（用户自己发）：额度纠正（未实名：搜索 10 次/天、**直答 2 次/天**）+ 面板变量清单指路 `docs/分工-视觉与功能.md` §4.1。
5. **要不要给「加大模型」排期** —— 知乎知识库 RAG（500/天）性价比最高，但会打破 12-04 前的主链路冻结。

## 6. 需要人拍板的事

- **README 认知地形截图删不删**（队友地盘）。
- **`btn-tension` / `btn-terrain` 两个哑按钮删不删**（队友地盘）。
- **首屏下方「日报/工作台」section 的旧口径是否统一**（队友地盘）。
- **Demo 逐秒脚本按 D66 重排镜头顺序**（台词按 D68 **不增不删**，14 句一字未动）。
- **要不要拍演示视频**（需拍摄排期，12-04 前）。
- **要不要给「加大模型」排期**（知乎知识库 RAG 会打破 12-04 前冻结）。
- **SEO 意图**（id `498a6e05-90b1-4627-bbea-3bf1b0f003f3`）表述是否改；可用 `observe-seo` 按 intent_id 刷新（**每次出包前都要重跑，否则旧 intent_id 被拒 `W_COLLECTION_SKIPPED`**）。
- **部署专用密钥 `C:\Users\steam\.zhihu-cli\access_secret.deploy` 赛后删除并轮换**。
- **简介「真实分歧」改成「两条真实回答」是否认可** —— 已按 D38 自行改掉（D38 是已定决策），如不同意可用同一 API 一行改回。
