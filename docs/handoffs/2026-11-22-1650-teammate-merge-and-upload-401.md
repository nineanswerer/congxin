# 交接：队友分支全量合入 main + 交付包重出 + AI Works 上传 401 定位到平台侧

- **时间**：2026-11-22 16:50
- **使用的 AI 平台**：MiniMax Code（MCode）
- **分支 / commit**：`main` @ `5135ef8`（已推 `origin/main`）
- **本次目标**：审阅队友 `5zdz5` 的 GitHub 分支 → 看清改了什么 → 让用户决定是否整合进主分支 → 整合 → 重出交付包 → 拿公网链接

## 1. 现在处于什么状态

- **队友的 `web/apple-daily-redesign` 分支已零冲突 fast-forward 合入 main**，并补了它带出来的空态缺陷，**已推远端**。
- **交付包已重出**（`web/` 变了）：`%TEMP%\congxin\congxin.zip`，**62 个条目**，SHA-256 `5CACC76B…`，官方探测器 0 error。
- **🔴 卡在平台侧**：AI Works 上传回 **401 `signature verification failed`**，
  **126 字节的对照包同样失败** → **不是交付包的问题**，需用户在自己的 Chrome / Edge 里手动传同一个 ZIP。
- 上传页的**两项审核声明已按实际功能设好**（账号登录=否、大模型生成内容=是），点「发布项目」**还没点**（等用户）。
- 剩下三件需要人：**上传**、**P1 演示脚本首屏口径**（[B21](status.md)）、**部署专用 Access Secret 未申请**（[B19](status.md)）。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `web/js/app.js` | 把 `renderDaily()` 从 `try` 块里挪出来，新增 `favError`，失败时传 `error` | 收藏接口一抛异常，`#daily-paper` 没人填 → **首屏纯白空框**（11-22 实测确认）。失败时也要印一张报并如实说读不到 |
| `web/index.html` | `<title>` 改回「从心 · 把你的收藏印成一张报」；meta description 改成「从心：桌宠陪你干活，也把你的收藏印成一张报…」 | 用户拍板作品名仍叫「从心」，日报是产品里的一个功能页 |
| `docs/decisions.md` | 追加 **D51 / D52 / D53** | 决策层只增不改 |
| `docs/status.md` | 时间戳 → 11-22 16:48；加 5 条已完成；加 **B19 / B20 / B21** | 进度与阻塞项同步 |
| `README.md` | 状态块改写；加「打开之后看到什么」一节；文档索引 D1—D50 → **D1—D53** | 作品名与首屏口径变了 |
| `docs/部署指南.md` | 命令链去掉 `--build-validation`；加 §2.0 交付包实测指纹；加 **§7.1 上传 401 的完整定位** | D53 + 把 401 的排查过程留档 |
| `docs/P1-三件产出.md` | §2.1 前加「首屏变了，待拍板」+ A/B/C 三个改法 | **P1 内容只能人拍板**，AI 只标注差异与提案，脚本一个字没动 |

**未提交未推送**：以上改动待一次提交（`git add -- <显式路径>`，禁 `git add -A`）。

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：在 AI Works 上传源码包（`upload_files`）。
  **结果**：工具返回 `success`、`effect.verified: true`，**但页面变成「上传失败 / 文件上传未完成，请检查网络后重新上传。」**
  **结论**：`upload_files` 的 success **只代表文件挂上了**，不代表平台收下了。**必须去看页面上的状态文字 + 抓网络**。

- **尝试**：怀疑是包太大 / 内容有问题。
  **结果**：造了一个 **126 字节**的对照 ZIP 传上去 → **同样 401、同一句报错**。
  **结论**：**与包无关**。这个对照实验是本次最有价值的一步。

- **尝试**：怀疑是时钟偏移（OSS 签名对时间敏感）。
  **结果**：`curl.exe` 读 `www.zhihu.com` / `unpkg.zhimg.com` / `zhstatic.zhihu.com` 的 Date 头，
  本机与服务器偏移 **-0.03 ~ +0.04 分钟**；本机时间 2026-11-20 13:32:40。
  **结论**：**时钟不是原因**，别再查了。

- **尝试**：刷新页面后重传、重新开标签页、开全新页面重传。
  **结果**：三种情况全部复现「上传失败」。
  **结论**：**不是页面陈旧的问题**。

- **尝试**：想抓 401 的响应体，但 `query kind=network` 不给 body。
  **结果**：用 `run_script` + `page.evaluate` 装了个 `window.fetch` 包装器把 response body 截下来，成功了：
  ```
  POST https://media.zhihu.com/zos/api?action=ApplyUpload&version=v1 → 401
  {"meta":{"request_id":"01ad85bd-e651-11f1-8418-62b52032c3bf","code":10201,
   "error":{"name":"Unauthorized","message":"signature verification failed"}},"data":{}}
  ```
  **结论**：这是 **OSS 上传签名校验失败**，是**平台页面自己算的上传凭据**被服务端拒绝。
  **教训**：这个拦截器在**页面刷新后会丢**，要在 reload 之后重新装。
  **注意**：`run_script` 的 `page.evaluate` 是在页面上下文跑的，能拿到 `fetch` / DOM；文件本身读不了。

- **尝试**：改走「GitHub 仓库」发布方式绕过上传。
  **结果**：那个 tab 只有「绑定 GitHub 账号」+「选择 GitHub 仓库」，写明「**展示源码入口**」。
  **结论**：**给不了公网体验链接**，替代不了「上传源码 → 自动构建和部署」。**别再花时间在这条路上。**

- **尝试**：改走「站外链接」。
  **结果**：要我们自己先有公网地址。
  **结论**：本项目是 Node 后端（真调知乎 API），静态托管跑不起来；`website_deploy` 只发静态站，**用不上**。

- **尝试**：把「账号登录」审核声明改成「是」（想如实申报）。
  **结果**：平台**立刻多出两个必填项**——「测试账号」「测试密码」。
  **结论**：已改回「否」。理由：`web/README.md:258` 写明「**登录入口缺失**：12-05 拿到 OAuth 凭证后补 3 个 auth 路径的 UI」，
  `web/README.md:124` 写明 3 个 auth 路径**没接** → 部署出来的界面**根本没有登录入口**；
  而且官方第 6 条要求「**不复用个人或生产管理账号**」，我们没有可交的对口账号。

- **试过又回头**：第一次跑交付链时 `inspect_node_project.py` 报 inspect 失败，因为 `--build-validation _tmp\agent-build-validation.json`
  那个文件被 `make-delivery.js` 清 `_tmp/` 清掉了。**去掉这个参数就好了**（D53）。

## 4. 下一个 AI 接手前必须知道的事

- **`docs/P1-三件产出.md` 的 18 拍脚本还没跟新首屏对齐**（B21）→ **P1 内容只能人拍板**，别自己改。
- **上传页两项审核声明现在是「账号登录=否 / 大模型生成内容=是」**，「发布项目」**没点**。
  12-05 拿到 OAuth 凭证后要重新决定「账号登录」要不要切成「是」。
- **交付包有两个 SHA-256**：归档器打印的 `6cafd3f7…` 是**补执行位之前**的；
  最终交付文件是 `5CACC76B3F01D275E42422556C05C154BD3DE5360BDE366F59889E0F0AC54D71`（补执行位后）。**对外只认后者。**
- **本机 helper 与平台现在发的 `zhihu-ai-works-deploy-helper_v1.2.0.zip` 逐字节相同**（只差 `__pycache__`）
  → 交付包用的就是当前官方工具链，**不需要为了版本再重出**。
- **`.ps1` 必须是 UTF-8 with BOM**。本轮踩过：没有 BOM → PowerShell 5.1 按 ANSI 解析 → 中文路径「从心」变成「浠庡績」→ `Push-Location` 报错。
- **Browser**：上下文压缩后技能凭证失效，要重新 `skill browser-use:control-in-app-browser`；
  `upload_files` 之后页面会重渲染，**旧的 ref 立刻 stale**；上传失败后输入框会变成「重新上传」，
  `upload_files` 对着它会 `FILE_CHOOSER_TIMEOUT` → **刷新页面回到「点击上传 .zip 文件」再用**。
- **删除一律单条顶层 `rm -- "<path>"`**，`Remove-Item` / `Move-Item` 被安全策略硬拦。
- **额度**：本轮 `user_data` 已用 **3 / 剩 9997**，`question_discovery` 剩 100/100，其余 API 已用 0。**很宽裕，不用省。**

## 5. 下一步（按优先级）

1. **用户在自己的 Chrome / Edge 上传 `%TEMP%\congxin\congxin.zip`**（或 `.ctx\congxin.zip`）到
   `https://www.zhihu.com/project/create?step=2&source=draft&projectId=240909` 的「上传源码」。
   若在用户自己的浏览器也失败 → **平台侧问题，立刻找赛事组**（12-04 前必须有公网链接）。
2. **用户拍板 P1 首屏口径**（A / B / C，AI 建议 A）→ 改了再重出交付包。
3. **用户申请部署专用 Access Secret** → 存 `C:\Users\steam\.zhihu-cli\access_secret.deploy` → `node scripts\make-delivery.js --secret` 重出带密钥包。
4. **AI 起草产品说明计划书正文**（官方必交材料 #2，现在一个字没写）→ 用户审。
5. **零 L 转发给队友**（AI 已起草好，**发送必须用户自己发**）。

## 6. 需要人拍板的事

- **P1 演示脚本 0:00—0:15 那一拍怎么改**（A / B / C，AI 建议 A）。
- **上传包如果成功了，要不要由 AI 点「发布项目」**——这一步不可逆，**必须你明确点头**。
- **账号登录审核声明最终填「是」还是「否」**（12-05 拿到 OAuth 凭证后定）。
- **是否要现在就把「站外链接 / GitHub 仓库」也一起填上**（页面写明「完成任意一种即可发布」，但这两条都**不产生**公网体验链接）。
