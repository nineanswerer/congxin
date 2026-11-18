# `web/` —「从心」前端

桌宠是交互主体，「认·清」认知闭环是桌宠里的一个功能环节（[D29](../docs/decisions.md)）。

> **目录归属（2026-11-18 起）**：`web/` 由 `nineanswerer` **临时接管**。
> 队友 `5zdz5` 回来后要改这里请**走 PR**，不要直推 `main`——
> 避免两边 AI 各写一套前端互相覆盖。背景与边界见 [协作规范](../docs/协作规范.md)。

---

## 跑起来

需要**两个进程**（前端不打包、不依赖任何 npm 包，零依赖）。

```powershell
# 1) 后端（必须换端口：本机 8787 绑不上，listen EACCES）
cd 'C:\Users\steam\Desktop\从心\server'
$env:ZHIHU_ACCESS_SECRET = (Get-Content -Raw 'C:\Users\steam\.zhihu-cli\access_secret').Trim()
$env:PORT = '18787'; node src/index.js

# 2) 前端
cd 'C:\Users\steam\Desktop\从心\web'; node serve.js
```

打开 **<http://localhost:18788/web/>**。

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `18788` | 前端端口 |
| `API_BASE` | `http://localhost:18787` | 后端地址（`serve.js` 把它代理成同源 `/api`） |

**为什么要代理**：页面与接口同源 → 前端不用处理 CORS，也不用在前端里写死后端地址；
部署时（AI Works）前后端同进程，把静态目录挂到主服务上即可，**前端一行不用改**。

### 演练模式

决赛只有 5 分钟，中途点错一下就断节奏。

| 地址 | 作用 |
| --- | --- |
| `?demo=1` | 自动跑一遍 Demo 脚本骨架（喂材料 → 吐卡片 → 补观点 → 照镜子 → 断层 → 情境题 → 作答 → 地形） |
| `?demo=1&fast=1` | 节奏 ×0.25，截图/自测用 |
| `?demo=1&quiz=deep` | 预设一套「先想通整条路」的答案 |

> ⚠️ **演练也会真调知乎**：`POST /api/cards` 吃「问题发现」额度（1 张卡 ≈ 2 次）。
> 同主题有缓存，反复演同一主题基本不烧额度；**换主题会真的花**。

---

## 目录结构

| 文件 | 职责 |
| --- | --- |
| `index.html` | 单页骨架（顶栏 / 桌宠 / 主流程 / 照镜子 / 底栏统计） |
| `css/app.css` | 设计系统与全部样式（沿用 P1 静帧的设计令牌） |
| `js/api.js` | 接口层：统一错误信封 → `user_hint`；**失败一律说真话，不造假数据** |
| `js/pet.js` | 桌宠状态机 + 气泡台词 |
| `js/quiz.js` | 6 题自述问卷 + 前端计分 |
| `js/terrain.js` | 2.5D 分层认知地图（SVG + CSS `perspective`） |
| `js/app.js` | 主逻辑（把上面几个串起来） |
| `js/demo.js` | `?demo=1` 演练模式 |
| `serve.js` | 零依赖静态服务 + `/api` 代理（**开发期用**，部署时不需要） |

## 调了哪些接口

`js/api.js` 里共 12 个调用，覆盖契约 14 个路径中的 12 个：

| 用途 | 路径 |
| --- | --- |
| 语气目录 + 台词 | `GET /api/tone` |
| 收藏 / 关注 | `GET /api/behavior/favorites`、`GET /api/behavior/followees` |
| 断层 | `POST /api/behavior/tension` |
| 情境题 | `POST /api/situation/question` |
| **带出处的卡片** | `POST /api/cards` |
| 地形 / 作答 | `GET /api/terrain`、`POST /api/terrain/answer` |
| 身份 / 额度 | `GET /api/auth/profile`、`GET /api/quota` |

**没接的 3 个**：`POST /api/auth/login`、`GET /api/auth/callback`、`POST /api/auth/logout`。
**原因**：OAuth 凭证 12-05 提报入口开放后才由赛事页面分配（[B4](../docs/status.md)），
现在接了也只会拿到 `401 OAUTH_REQUIRED`。**Demo 主路径不依赖 OAuth**（已用真实进程验过）。
→ 12-05 拿到 App ID / App Key 后再补这一步。

---

## 交接给队友时必须分清的两类东西

按 [协作规范](../docs/协作规范.md) 的要求：

**为了赶上 11-21 做的取舍（可以推翻）**

- 2.5D 用 **SVG + CSS `perspective`** 而不是 Three.js；断层特写先用 CSS 强视差
  （**真 3D 推镜留给队友**，它在保命砍法里排最后）。
- 单页应用、零构建、零依赖，没有组件化、没有状态管理库——**这是为了当天能跑起来**。
- 问卷 6 题、计分在前端做（后端只收 `{ type, dimension_scores, traits }`）。
- 卡片列表用 `<ul>` 平铺，没做小屋 / 检索 / 标签。

**按 D29 / D19 必须保留的（不能推翻）**

- **桌宠是主体**，认知闭环是桌宠的一个功能环节，不是并列第二条线。
- **台词不写死在前端**：全部从 `GET /api/tone` 取（真源是 `contracts/tone.json`）；
  加载失败就如实提示，**不内置兜底文案**。
- **卡片出处只来自知乎真实内容**；本地拖入的文本明确标注「没有知乎出处」。
- **不自绘角色**：只用官方刘看山 6 个状态动画 + 自建的 `eating`/`emitting`/`error` 过渡。
- 失败 / 额度耗尽 / 空数据 → **给真实提示，绝不返回伪造兜底数据**。

---

## 已知问题（下一版要处理）

1. **登录入口缺失**：12-05 拿到 OAuth 凭证后补 3 个 auth 路径的 UI。
2. **卡片正文可能很长**：上游 `content` 字段是官方摘要截取，200+ 字且带 `[图片]` 标记
   → 截断 / 折叠还没做。
3. **地形只长出一层**：三层结构没实现（保命砍法里第 7 位）。
4. **追问链只保留了一次**（保命砍法第 4 位）。
