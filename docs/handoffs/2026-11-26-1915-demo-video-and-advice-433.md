# 交接 · 2026-11-26 19:15 · 演示视频成片 + 正式域名 433 兜底

## 一、这一轮做完什么

1. **演示视频已出片**：`.ctx/out/从心-演示视频.mp4` —— **97.6 秒 / 10.8MB / 1920×1080 / H.264 + AAC**。
   - 11 拍全走完；**录制期零上游调用**（fetch 回放命中 `favorites/cards/cardsv/advice` 各 1 次）。
   - **暗色模式**录制（黑底青字）。亮色是刺眼荧光绿（`--p-inv-bg #9AE187`），桌宠和台词气泡都糊。
   - 旁白：温润男声 **8 段共 57.3 秒**（原 n5 拆成 n5a / n5b）。
   - 字幕：ASS（微软雅黑），结尾压体验地址 `https://pekropd3uupx.aiworks.site`。
   - 抓到的数据是真的：`feed.json` / `views.json` / `favorites.json` / `advice.json` 全是真跑出来的上游响应，录制时只做回放。
2. **正式域名 `/api/advice` 的 433 找到真因并修了**（D77）。

## 二、433 的真因（全部实测）

- 上游直答是**异步任务**：任务 3 秒没回就回 **HTTP 433** + `{"ret_code":200401,"ret_msg":"<base64>"}`，
  `ret_msg` 解开是 `Waiting task timed out after 3 seconds`。
- **同一份代码、同一个 prompt**：本机成功（端到端 7 秒），**正式域名必超时**
  → 不是「部署的是旧代码」（已 diff 过，`server/src` 从出包到现在没动过 advice 那条链路），
  是**出口链路耗时把上游那 3 秒的等待窗口吃掉了**。
- 之前 433 时我们只拿到 `statusText`，**上游真正的失败原因写在 body 里** → 已在 `client.js` 补读。

## 三、改了什么（都在 `server/`，本会话所有权目录）

- `server/src/services/advice.js`：**按档位往下走**
  ① `zhida-thinking-1p5` + 全量材料 → ② `zhida-fast-1p5` + 全量材料 → ③ `zhida-fast-1p5` + 精简材料（3 条 × 320 字）。
  - 每档都是一次**真实上游调用** → 最坏烧 3 次直答（100 次/天那组），同一问题 5 分钟内走缓存不再烧。
  - `thinking` 一旦在这台机器超时过，后面不再拿它当第一档（`thinkingTimedOut` 标记）。
  - 档位用 `buildMaterial(candidates, {limit, excerptLen})` 控长度，**编号仍与候选下标一一对应**（出处回指不受影响）。
  - 全档位都被上游超时打掉 → **抛真话错误**（502「知乎那边暂时不稳定」），不包装成「没整理出格式」。
- `server/src/zhihu/client.js`：非 2xx 时读一次 body，把 `ret_code` / `ret_msg`（解 base64）放进错误信封的 `upstream`。

## 四、验证

- 本地 `POST /api/advice`（127.0.0.1:9000，用本机密钥）→ **200**，verdict=partially_applicable，
  **5 步方案 + 4 条出处**，每步带依据编号，来源含作者与赞同数。
- `scripts/check-contract.ps1` → **PASS 14 / WARN 0 / FAIL 0**。
- 成片抽帧看过：同题两答带出处链接 →「问它」5 步每步标「依据 N 条」→ 依据区 3 条知乎原回答 → 结尾体验地址字幕，**都在**。

## 五、还没做 / 要人拍板

1. **服务端修复还没部署** → 正式域名现在点「问它」**仍然 433**。部署是对外可见动作，**要用户点名授权**（D74 那次是用户手动上传 AI Works 包）。
2. **视频还没交到黑客松表单**（通道 12-05 10:00 才开）。
3. **时长口径变了**：实测旁白只有 57.3 秒，成片按 **1:38** 剪（不是分镜原写的 2:00）
   → `docs/演示视频-分镜与口播.md` 与 `docs/演示视频-口播稿.md` 的时间码**要按成片改成实际剪辑**（本轮没改，等用户认可这个改口）。
4. **旁白稿仍待用户审**（内容层：旁白、镜头、节奏）。
5. **配音方式**：现在是 TTS 合成（②），用户可改成自己念（①）。
6. **不露脸 / 不加 BGM**（AI 的默认，要改要用户说）。
7. **`#btn-tension`「看一次断层」/ `#btn-terrain`「看认知版图」两个哑按钮还在**（队友地盘，我们不能改）
   → **视频镜 3 的工作台全景会拍到它们**，要么队友删，要么构图避开。

## 六、用量（用户 11-26 明确关注）

- **知乎侧没超**（`GET /api/quota`，不计入消耗）：问题发现 31/100、**直答 30/100**、知乎搜索 30/5000、用户数据 48/10000。
- **MCode 套餐侧**：本机运行时数据库 `local_runtime_token_usage` 记着每一轮 token。
  今天（11-26 00:00 起）**所有会话 998,395**（输入+输出，不含缓存读），其中**本线程 834,806**；缓存读另计 32.5M。
  全部会话累计 40.15M（含缓存读 1.52B）。
- **实时查法**：`node .ctx\usage-sqlite.mjs`（本机可跑，数秒出结果）；
  **套餐的日总额度只有桌面端用量面板看得到** —— 本机没有任何配置文件存着它。
- **硬上限**：这条线程**没有 goal**，`update_goal` 设不了 `token_budget`（要 `expected_goal_id`）
  → 需要用户在 MCode 里给本线程建一个 goal，之后 AI 用 `update_goal` 把它设成**日限额的一半**。

## 七、这一轮踩到的坑（别再踩）

- **CDP `Fetch` 域在本环境完全无效**（请求根本没被拦下来）→ 只能用 `Page.addScriptToEvaluateOnNewDocument` 注入 `window.fetch` 补丁。
- **前端 `api.js` 传的是 URL 对象**（`fetch(url, {...})`），补丁只认字符串就会**全部漏掉**，`__replayHits` 永远是 0
  → 三种形态都要认：字符串 / URL 实例（`.href`）/ Request 对象（`.url`）。
- `ffmpeg` 的 `-i` 输入数组**必须展平**，否则会变成 `-i,路径` 一个参数 → `Unrecognized option`。
- ffmpeg 滤镜里的 Windows 盘符冒号：`subtitles=filename='C\:/path/subs.ass':fontsdir='C\:/Windows/Fonts'`（整段用单引号包住）。
- `.ctx/rec/advice-shakeout.json` 是**彩排夹具（假数据）**，禁止入片；真实数据在 `.ctx/rec/advice.json`。
