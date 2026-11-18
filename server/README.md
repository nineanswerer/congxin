# server — 「从心」后端

知乎开放平台调用层 + 行为对照接口。**单进程、零数据库、零中间件**（D22）。

## 跑起来

```powershell
cd server
npm install
copy .env.example .env        # Windows；macOS/Linux 用 cp
# 编辑 .env，填入 ZHIHU_ACCESS_SECRET
node src/index.js
```

默认监听 `http://localhost:8787`。

> ⚠️ **`.env` 已被 gitignore。密钥只存在于服务端进程环境里**——
> 不进仓库、不进前端响应、不进日志（官方提交前检查第 6 条）。

## 已实现的接口

| 方法 | 路径 | 说明 | 契约 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 + 缓存统计（自检用，不在契约里） | — |
| GET | `/api/quota` | 额度透传 | `contracts/api.json` |
| GET | `/api/behavior/favorites` | 收藏信号（收藏跨度 + 主题分布） | `contracts/api.json` |
| GET | `/api/behavior/followees` | 关注信号（关注对象类型分布） | `contracts/api.json` |
| GET | `/api/behavior/contents` | 创作信号（论证结构 + 活跃度） | `contracts/api.json` |
| POST | `/api/behavior/tension` | 张力信号：自述 vs 行为 → 断层 | `contracts/api.json` |
| POST | `/api/situation/question` | 情境题生成（每题必带知乎出处） | `contracts/api.json` |
| GET | `/api/terrain` | 三层认知地形 + 断层 + 桥 | `contracts/api.json` |
| POST | `/api/terrain/answer` | 提交情境题回答 → 地形生长 | `contracts/api.json` |
| GET | `/api/tone` | 桌宠语气目录 + 全部台词 | `contracts/api.json` |
| GET | `/api/auth/profile` | 当前登录用户资料（两种模式） | `contracts/api.json` |
| GET | `/api/auth/login` | 发起知乎授权（302 跳转） | `contracts/api.json` |
| GET | `/api/auth/callback` | 授权回调：换 token、建会话 | `contracts/api.json` |
| POST | `/api/auth/logout` | 退出登录、清会话（幂等） | `contracts/api.json` |

**契约里的 13 个路径全部有代码**（`contracts/api.json` v0.4）。
其中 9 个已实跑真知乎；4 个登录路径由 `scripts/smoke-auth.js` 覆盖（不耗额度、不需要凭证）。

## 目录

```
server/
  .env.example            环境变量模板（密钥不进仓库）
  package.json
  scripts/
    smoke.js              冒烟：真调知乎，看四个接口的输出
    smoke-auth.js         登录自检：不耗额度、不需要 OAuth 凭证
    classify-check.js     分类回归：比对人工标注基线
  src/
    index.js              入口 + 统一错误出口
    config.js             环境变量 + 启动自检（缺配置大声失败）
    taxonomy.js           读取 contracts/taxonomy.json（唯一真源）
    lib/
      errors.js           统一错误信封 + 错误码表
      cache.js            进程内缓存 + 请求去重
      classify.js         关键词分类器
    services/
      behavior.js         上游数据 → 产品级形状的归一化
    zhihu/
      client.js           HTTP 调用层（鉴权 / 退避重试 / 限流）
      endpoints.js        上游端点封装
    routes/
      quota.js
      behavior.js
```

## 三条必须守住的东西

1. **不生成没有出处的内容** —— 情境题与知识卡片的 `source` 必填（AGENTS.md 第 3 节）。
2. **空数据 ≠ 失败** —— 空数据走 200 + `empty: true` + `empty_notice`；失败走 4xx/5xx 统一错误信封。
3. **失败必须是真话** —— `error.user_hint` 是**给人看的中文**，不允许空、不允许英文原始报错（官方检查第 7 条）。

## 上游接口的三个坑（2026-11-17 实测）

| 坑 | 表现 | 处理 |
| --- | --- | --- |
| **收藏类路径不是 `/favorites/*`** | `/api/v1/user/favorites/lists` 与 `/favorites/recent` 都是 **404** | 真实路径是 `/api/v1/user/collections`、`/api/v1/user/favlists`、`/api/v1/user/favlist_contents`（后者 `FavlistUrlToken` 必填） |
| **`ContentType` 必填，且必须用 `all`** | 不传返回 `Code=10001`；只查 `article`/`answer` 会拿到 **0 条**（账号唯一创作是 `pin`），被误判成「没有创作」 | 默认 `all`；`pin` 的 `Summary` 基本是正文全文，别当摘要截断 |
| **秒级限流** | 连续调用返回 `Code=30001 second limit exceeded` | 客户端层退避重试（指数退避 + 抖动）；请求层缓存 + 去重 |

## 开发期 vs 上线后

| | 鉴权 | 读谁的数据 |
| --- | --- | --- |
| 开发期（现在） | `Authorization: Bearer <Access Secret>` + `X-Request-Timestamp` | **Access Secret 所属的那个账号**（自己） |
| 上线后（12-05 起） | 上面这套 **+ `X-OAuth-Token`**（来自**当前登录会话**） | **任意登录用户**（谁登录就读谁） |

**接口形状完全相同** → 12-05 拿到 App ID / App Key 换上就行，**不返工**。

登录身份用 `AsyncLocalStorage` 带进上游调用层（`src/lib/auth-context` 见 `src/lib/auth-session.js`），
所以**每个登录用户读的是自己的数据**，不用给每个 service 函数传一遍 token。

### OAuth 的三条底线

1. **App ID / App Key 由赛事页面在项目创建后分配**，**不走通用邮件申请流程**——没到手就别找入口。
2. **OAuth Token 只留服务端**：浏览器只拿一个随机 session id（`HttpOnly` + `SameSite=Lax` Cookie）。
3. **Token 过期就停止读取**（官方 `expires_in=3600`，**没有 refresh token**），
   **不静默切回 Access Secret 所属账号**。

凭证没到位时，`/api/auth/login` 与 `/api/auth/callback` **诚实返回 401 `OAUTH_REQUIRED`**，
**不伪造跳转**；`/api/auth/profile` 走 `developer_account` 模式，昵称字段为 null——**不编昵称**。
