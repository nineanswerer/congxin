# 从心 — 知乎黑客松 S3 · 湾区共创季参赛项目

> **作品名 / 队名：从心**｜仓库：<https://github.com/nineanswerer/congxin>
> 团队：2 人（`nineanswerer` / `5zdz5`）｜活动：`activity_code=zhihu_hackathon_2026_p3`
> **当前状态：选题定位与工程基线建设阶段，尚未进入功能开发。**
>
> *（仓库名用拼音 `congxin` 而非中文「从心」：GitHub 会把仓库名里的非 ASCII 字符规范化成连字符——实测 `从心x` 改完真名变成 `-x`，纯中文 `从心` 会变成 `-` 并与已有仓库冲突。所以作品名是「从心」，仓库名必须是 ASCII。）*

## 这是什么

一个**以桌宠为交互主体**的学习搭子：用户把手上的资料（PDF / 网页 / Markdown）交给桌宠，桌宠产出**每张都能回溯到原文出处**的知识卡片，并在卡片上补上**知乎上真实存在的不同观点及其原始回答链接**。

产品叙事的主次关系：**桌宠是交互主体（有人格、有情绪、有反馈），知识卡片是它的产出物，知乎开放能力是它的信息来源。**

### 三条差异点

1. **有出处的观点对照** — 卡片不给黑盒摘要，给知乎上真实的不同答案及其链接，让用户看到分歧本身。
2. **问题反哺** — 桌宠指出"你这个主题，知乎上正在被问的问题"，把私人资料与公共讨论连起来。
3. **陪伴而非工具** — 桌宠对状态有反应（思考、打盹、答错后的沮丧），让"整理资料"不再像 chores。

## 技术选型（已定，详见 [docs/decisions.md](docs/decisions.md)）

| 项 | 决定 | 依据 |
| --- | --- | --- |
| 形态 | Web 应用（可安装 PWA），不做 Tauri | 38 人时预算 + OAuth / 人气奖只对 Web 友好 |
| 后端 | 直连知乎开放平台 HTTP API，**单进程进程内 Map 存会话，零数据库、零中间件** | 官方 FAQ：前端 + Node 后端且不含数据库写入 → 可用 AI Works 部署 |
| 渲染 | SVG + CSS / Framer Motion 做状态动画 | 不用 Pixi.js + Matter.js，省 2—3 天 |
| 知乎主路径 | `question recommend` + `question answers`（返回**原始回答链接**），直答仅兜底 | 官方文档：观点比较不要用直答替代搜索 |
| 额度 | 缓存 + 去重 + 实时额度查询 + 额度耗尽真实提示，**绝不返回伪造数据** | 官方开发文档要求；提交前检查第 7 条 |

## 文档

| 文件 | 内容 |
| --- | --- |
| [docs/brief.md](docs/brief.md) | 产品定义、目标用户、场景、首版范围与验收条件 |
| [docs/decisions.md](docs/decisions.md) | D1—D26，每条含日期 / 结论 / 依据 / 状态 |
| [docs/status.md](docs/status.md) | 已完成、阻塞项、倒排计划 |
| [docs/协作规范.md](docs/协作规范.md) | **两个人、两个不同 AI 平台如何共用一份 Git 历史**（上下文四层 + 三个动作 + 目录分工） |
| [docs/队友对齐清单.md](docs/队友对齐清单.md) | 与队友对齐 D14 / D19 的逐条谈法（含白皮书 9 概念处置表） |
| [docs/rules-知乎S3.md](docs/rules-知乎S3.md) | 官方规则、技术指南正文、额度对照、实测记录 |
| [docs/方案评估-认知地形.md](docs/方案评估-认知地形.md) | **方案评估（不是决策）**：队友新构想「认·清」认知地形的可行性核查——三处实测出来的技术事实 + 人时估算 + 保内核换形态的推荐方案 |
| [contracts/CONTRACTS.md](contracts/CONTRACTS.md) | 契约层：不可变事实（赛程 / 额度 / 技术底座 / 合规红线） |
| [docs/adr/](docs/adr/) | 决策层：背景复杂的决策单独展开，**"被否决的方案"不许空** |
| [docs/handoffs/](docs/handoffs/) | 交接层：每次会话一份，AI 自己写，换 AI 平台前的读档点 |
| [prompts/](prompts/) | 四份可直接复制的提示词：BOOTSTRAP / HANDOFF / CROSS_REVIEW / COMMIT_MSG |
| [AGENTS.md](AGENTS.md) | 团队协作规则（事实纪律、原创与合规、工程纪律、文档纪律、授权边界、双 AI 协作） |
| [assets/kanshan/NOTICE.md](assets/kanshan/NOTICE.md) | 刘看山素材来源与使用限制 |

## 双 AI 协作机制

两个人各用**不同的 AI 平台**并行开发、共用一个 GitHub 仓库。Git 只记录"改成了什么"，
不记录"为什么这么改"和"试过什么失败了"——所以本仓库用**上下文四层**补上：

```
L0 契约层  contracts/contract.json + CONTRACTS.md   不可变事实，机器可读 + 自检
L1 身份层  AGENTS.md                                 唯一真源，各平台文件只做指针
L2 决策层  docs/decisions.md + docs/adr/              只增不改，"被否决的方案"不许空
L3 交接层  docs/handoffs/                            每次会话一份，让 AI 自己写
```

配套三个动作：**换平台前 BOOTSTRAP**（读契约→复述→等确认）、**会话结束前 HANDOFF**、
**每次提交带 `Context:`/`Tried:`/`Verify:` 三行**（hook 强制）。

提交前自检：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1
```

两个 AI 平台一起干活不是风险，**是可以拿出来讲的创作佐证**——官方明确建议保留 AI 交互记录、设计底稿与开发日志，这套机制刚好覆盖这三样。

## 合规声明

- **原创性**：本项目核心功能与主要创新由团队独立形成，不复用任何已公开发布或已获奖项目的代码与成品。
- **刘看山 IP**：`assets/kanshan/` 内的素材来自知乎官方 IP 素材包，**仅本届比赛期间可用，赛后不得商用**；素材缺失时状态机自动降级为静态占位，业务逻辑不受影响。
- **密钥**：Access Secret / App Key / OAuth Token **不出现在源码、前端响应、日志、截图与视频中**，只存在于构建产物与服务端环境变量。
- **接口调用**：遵守知乎开放平台调用规范，不做批量、高频、刷屏与重复调用。
- **创作佐证**：本仓库的 Git 提交历史与 `docs/` 目录共同构成本项目的 AI 协作记录与开发日志。

## 队友提案说明

队友原始提案《Agent Pet OS》**已确定不公开入库**（2026-11-17 决定），仓库中不含该文件。
其中提出的企业级架构建议（Kafka / Neo4j / Redis / K8s / 微服务 / 多 Agent 并发 / 数字分身 / A2A）已在 [decisions.md](docs/decisions.md) D5 中逐条说明取舍理由——**取舍理由本身进仓库，原始提案不进**。
