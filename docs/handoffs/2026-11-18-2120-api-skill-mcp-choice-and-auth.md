# 交接：接入方式定案（维持 API 直连）+ 登录四路径落地

- **时间**：2026-11-18 21:20
- **使用的 AI 平台**：MCode（SideChat，会话 `session_622a4b3b-3fc8-46b6-9471-e934d04673e1`）
- **分支 / commit**：`main` @ `dda7fe6`（本次提交待生成）
- **本次目标**：调研知乎开放平台的 **API / Skill / MCP** 三种接入方式，判断哪个适合本项目；用户拍板「全落」后把结论落进契约层、改 B4、记 D34，并补上后端实现。

## 1. 现在处于什么状态

- **接入方式已定案**：产品运行时继续走后端直连 HTTP API（D15 成立，本轮**实测**坐实：MCP 只有 4 个工具、Skill 只有 4 个搜索包、OAuth 只有 API 支持）。开发期可以用官方 CLI / MCP，那是工具不是依赖。
- **契约从 9 路径扩到 13 路径**（`contracts/api.json` v0.4）：新增 `GET /api/auth/profile`、`GET /api/auth/login`、`GET /api/auth/callback`、`POST /api/auth/logout` + 5 个 schema + `x-auth` 协议段。**后端 13 个路径全部有代码**。
- **B4 的答案拿到了**：App ID / App Key **由赛事页面在项目创建后分配**，黑客松**不走通用邮件申请流程**——之前准备的「发邮件申请」那套作废，不要发。
- **但 OAuth 联调窗口可能只剩 12-05 → 12-07**（推断）：提报入口 12-05 10:00 才开。所以 **Demo 必须不依赖 OAuth 也能跑**。
- **额度是当前最硬的约束**：问题发现 **100 次/天**（问题推荐 + 回答摘要共用），2026-11-18 21:00 实测只剩 **81**。
- 前端 `web/` 仍然**一行都没有**，队友侧零进展，P3 明天（11-21）收口。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `contracts/api.json` | 13 路径（+4 auth）+ 5 个 schema + `x-auth` 段；`x-contract` 从 v0.2/8 路径同步到 v0.4/13 路径；**订正 `demo_shape` 里已作废的 82% → 67%** | 契约是跨两人的唯一真源；两个 auth 路径是 OAuth 联调必需 |
| `contracts/contract.json` | `api_contract` 升 v0.4、`frozen_endpoints` 补到 13、规则 +4 条、新增 `auth` 块、额度加 2026-11-18 实测快照 | 机器可读那一份才是准的 |
| `contracts/CONTRACTS.md` | 接口表补 auth 四行；新增「登录（OAuth）」一节（含 6 条协议坑）；额度表补实测剩余 | 人读的那一份 |
| `scripts/check-contract.ps1` | 第 11 项 9 → **13 路径**；加验 `AuthProfileData` 必填与 `AuthMode` 枚举；**密钥扫描排除「右值是函数调用」**（见 §3 第 8 条） | 契约变了自检必须拦得住；扫描器误报要修但不能放宽对真密钥的拦截 |
| `server/src/zhihu/oauth.js` | **新增**：授权页 URL、换 token、读授权用户资料 | OAuth 客户端。**`uid` 用正则从原文抠**（见 §3 第 10 条） |
| `server/src/lib/auth-session.js` | **新增**：OAuth 会话 Map、Cookie 读写、**AsyncLocalStorage 请求级上下文** | Token 只留服务端；会话 token 要能自动流到上游调用层 |
| `server/src/routes/auth.js` | **新增**：4 个登录路由 | 契约承诺了就不能是 404 |
| `server/src/zhihu/client.js` | 上游鉴权优先用**当前会话**的 OAuth token（`authContext.getStore()?.accessToken`），没有才退回 `config.oauthToken` | 每个登录用户读自己的数据 |
| `server/src/config.js` | 加 `oauthRedirectUri` / `frontOrigin` / `sessionCookieName` / `cookieSecure`；有 App ID 就要有 Redirect URI | OAuth 配置项 |
| `server/src/index.js` | 挂 `authRouter` + `authContextMiddleware`；health 加 auth 统计；启动日志打印登录入口是否就绪 | 注册路由 |
| `server/scripts/smoke-auth.js` | **新增**：25 项断言，**不耗额度、不需要凭证** | OAuth 拿不到凭证时也要能自检 |
| `server/.env.example` / `server/README.md` | 补新环境变量；README 的接口表从 5 个补到 13 个（原来还写着 4 个「还没实现」） | 文档跟代码对齐 |
| `docs/decisions.md` | **追加 D34**（决策层只增不改） | 接入方式定案 + OAuth 凭证路径 |
| `docs/status.md` | B4 行改写（路径已确认 + 协议坑 + 窗口风险）；P2 行、已完成区、下一步第 3/5/6 条同步接口数 | 状态别骗人 |
| `docs/rules-知乎S3.md` | **新增第十五节**：文档站机制、MCP/Skill 实测、OAuth 6 条坑、额度实测、两条可写进计划书的官方口径 | 事实归档 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `Invoke-WebRequest` 批量探测 26 个 `developer.zhihu.com/docs?key=xxx`。
  **结果**：**全部返回 1238 字节**——那是 SPA 空壳（`<div id="root">` + 一个 umi bundle），一篇文档也没抓到。
  **结论**：直接抓 HTML 没意义。**真正的数据源是 `https://developer.zhihu.com/console/api/v3/docs`**（一个 JSON，10 大节 / 31 篇）。以后查开放平台文档打这个。
- **尝试**：用 `web_fetch` 抓 `?key=skill` / `?key=mcp`。
  **结果**：抓到的正文是 **`authorization`（鉴权）**页，URL 也被重写成 `?key=authorization`。
  **结论**：**无效 key 会回落到默认页**。「抓到了一篇文档」≠「这个 key 存在」。判断能力是否存在要看 `/console/api/v3/docs` 的 key 清单。
- **尝试**：用 `Invoke-WebRequest` 调 `GET https://developer.zhihu.com/api/v1/quota` 查额度。
  **结果**：`{"Code":20001,"Message":"Authorization failed","Data":null}`——但**同样的密钥用 node fetch 就是 200**。
  **结论**：**PS 5.1 的 `Invoke-WebRequest` 处理 `Authorization` 头有问题**。测上游**一律用 node**，不要用 PowerShell 直连。
- **尝试**：用 `edit` 工具改 `contracts/api.json` 的多行块。
  **结果**：长块匹配反复失败（一次都没中）。
  **结论**：大段拼接**一律用 Node 脚本按文本切分**，且每个替换都断言「必须命中且只命中一次」，不中就 `exit(2)` 不落盘。
- **尝试**：第一次跑那个 Node 脚本。
  **结果**：`FAIL tags.auth: 命中 0 次`。
  **结论**：`contracts/api.json` 是 **CRLF** 行尾。脚本内统一 `CRLF → LF` 处理、落盘时还原。
- **尝试**：修完 CRLF 第二次跑。
  **结果**：`SyntaxError: Expected ',' or '}' after property value in JSON at position 1819`。
  **结论**：我往 description 字符串里插了 `mode: "oauth"`——**未转义的双引号把 JSON 字符串提前截断了**。往 JSON 字符串里插内容时，双引号要么转义、要么改用中文引号。
- **尝试**：第三次跑，`doc.x-contract.frozen_endpoints.length`。
  **结果**：`ReferenceError: contract is not defined`。
  **结论**：JS 把 `doc.x-contract` 解析成**减法**。带连字符的键一律用 `doc['x-contract']`。
- **尝试**：提交前跑自检，`client.js` 触发密钥扫描 FAIL。
  **结果**：`[FAIL] 密钥扫描 — 发现 1 处：server\src\zhihu\client.js:31`。
  **原因**：新写的 `const oauthToken = oauthTokenForRequest(...)`——右值是**函数调用**，不是硬编码密钥，但正则 `token\s*[:=]\s*<16+ 标识符>` 看不出来。
  **处理**：给扫描器加了一条**窄排除**——右值标识符后面紧跟 `(` 就不算。**用 5 个用例正反向验证过**：函数调用右值（不拦）、字面量密钥（拦）、无引号字面量（拦）、`process.env`（不拦）、配置文件里的裸串（拦）。**没有放宽对真密钥的拦截。**
- **尝试**：想在仓库里放一个假密钥文件来验证扫描器，然后删掉。
  **结果**：`Remove-Item` 被安全策略拦截（永久删除不允许）。
  **结论**：改用**不落盘**的方式——直接把正则和 5 条样例在 PowerShell 里跑对拍。**以后别在仓库里造垃圾文件做验证。**
- **被推翻的旧结论**：`docs/rules-知乎S3.md` 14.7 写着「`developer.zhihu.com/docs?key=billing_price` 实抓是模板占位页」——**已过时**。那是因为只抓到 SPA 空壳；按 `/console/api/v3/docs` 取，`billing_price` **有实质内容**（服务价格表）。已在第十五节标注。

## 4. 下一个 AI 接手前必须知道的事

- **必跑命令**（改完契约/后端后）：
  ```powershell
  powershell -ExecutionPolicy Bypass -File 'C:\Users\steam\Desktop\从心\scripts\check-contract.ps1'
  node 'C:\Users\steam\Desktop\从心\server\scripts\smoke-auth.js'      # 不耗额度
  node 'C:\Users\steam\Desktop\从心\server\scripts\smoke-tone.js'       # 不耗额度
  node 'C:\Users\steam\Desktop\从心\server\scripts\smoke-cognition.js'  # ⚠️ 需要 ZHIHU_ACCESS_SECRET
  ```
- **编码 / 行尾**：`contracts/api.json` = **CRLF、无 BOM**；`scripts/check-contract.ps1` = **LF、有 BOM**（改完必须验前 3 字节是 `239,187,191`）；`contract.json` / `*.md` = LF、无 BOM。
- **密钥位置**：`C:\Users\steam\.zhihu-cli\access_secret`（仓库外，已 gitignore）。**只放 nineanswerer 这边，不外传给队友。**
- **额度**：2026-11-18 21:00 实测剩余 —— 问题发现 **81/100**（主路径，最紧）、直答 97/100、热榜 100/100、创作 483/500、用户数据 9911/10000、搜索各 5000。**每日北京时间 00:00 重置，不结转。**
- **OAuth 协议坑**（都在 `contracts/api.json` 的 `x-auth` 段）：回调参数叫 `authorization_code`（**不是** `code`）但换 token 的表单字段叫 `code`；**回调不返 `state`**（做不到标准 CSRF 校验）；**只有 `access_token` + `expires_in=3600`，没有 refresh token**；`code: 20000` 是成功。
- **`uid` 会丢精度**：上游 `uid` 是 int64（超 JS 安全整数）。`server/src/zhihu/oauth.js` 里用**正则从原始文本抠数字**，`JSON.parse` 后的那个 `json.uid` 不用。**改这段别手贱。**
- **`zhihu-cli` 本机没装**（只有 `~/.zhihu-cli/access_secret` 文件），`zhihu-cli` 不在 PATH。要用先跑官方 setup（`developer-cdn.zhihu.com/.../zhihu-cli-skill.zip`）。
- **官方 MCP 地址**：`https://developer.zhihu.com/api/mcp/v1`（Streamable HTTP，`Authorization: Bearer <Access Secret>`），**只有 4 个工具**：`global_search` / `hot_list` / `zhida` / `zhihu_search`。
- **另一个 AI 会话在同一仓库并发工作**（作者 `nineanswerer <787922829@qq.com>`）→ 提交前先 `git fetch`，改 `docs/decisions.md` 前确认没被覆盖。**禁用 `git add -A`**，一律 `git add -- <显式路径>`。

## 5. 下一步（按优先级）

1. 🔴 **前端归属**（P3 明天 11-21 收口）：队友能不能动手？不能的话要不要我写？**这是现在最大的风险**，比 OAuth 紧急得多。
2. 🔴 **P3 闭环可演**：拖入资料 → 咀嚼 → 吐卡片 → 点开原文 → 追问 → 知乎补观点 → 卡片列表，**必须不用 mock 能演一遍**。
3. 🟡 **零 K 发给队友**：正文已交付纯版本，**由用户自己发**。零 G / 零 H / 零 J 都不必单独发。
4. 🟡 **B15 台词逐句审 + 镜头**（14 句台词在 `contracts/tone.json` 与 `docs/P1-三件产出.md` §二）。
5. 🟡 **B10 约 3—5 人试用**（11-28 前）。**12-05—12-07 校园宣讲**（港城大/哈工大深圳/南科大/深大/港大/华南理工）是现成的招募渠道，但**人气奖 12-05 才开算**。
6. 🟢 **12-05 去赛事页面取 App ID / App Key** → 填进 `.env` → 真跑一次 OAuth 联调 → 把 `developer_account` 模式换成 `oauth` 模式验一遍。

## 6. 需要人拍板的事

- **前端谁来写**（队友 / 用户自己 / AI 代写）——**P3 明天收口，这件不定下来后面全塌**。
- **OAuth 联调窗口只押 12-05 → 12-07 的情况下，Demo 要不要彻底不依赖 OAuth**（我的建议：要，OAuth 做成加分项）。
- **零 K 是否今天就发**给队友（内容已定稿，等用户按发送）。
- **决赛是否赴深圳**（B9，用户之前选「待定」，12 月中旬再定）。
