# BOOTSTRAP — 开工协议（各 AI 平台自动读取这一份）

> **这份文件现在有两种用法，效果完全一样：**
>
> 1. **自动（推荐）** —— 各平台的指针文件（`CLAUDE.md` / `.cursor/rules/00-project.mdc` / `.gemini/settings.json` / `.aider.conf.yml` / `.github/copilot-instructions.md`）在**打开仓库时就被平台自动加载**，并指向本文件。**AI 开工前应自己读它，不需要人手动粘贴、不需要人提醒。**
> 2. **手动** —— 人想省事时，也可以把下面「协议正文」整段粘给 AI。
>
> 两种方式读的是同一份文件，所以不会出现"两边说法不一致"。

---

# 协议正文

【BOOTSTRAP】这是本项目的一次新会话（可能刚从另一个 AI 平台切过来）。**禁止跳步，禁止在完成下面第 3 步之前修改任何文件。**

仓库根目录：`C:\Users\steam\Desktop\从心`
当前分支：见 `git rev-parse --abbrev-ref HEAD`

## 1. 先读，不要问

按顺序读完这些，**不要一边读一边动手**：

1. `contracts/contract.json` — 不可变事实（赛程、额度、技术底座、合规红线）
2. `AGENTS.md` — 团队规则（事实纪律 / 原创与合规 / 工程纪律 / 文档纪律 / 授权边界）
3. `docs/decisions.md` — 已有决策，含每条的依据与状态
4. `docs/status.md` — 当前进度、阻塞项、倒排计划
5. `docs/handoffs/` 下**按文件名最新的一份** — 上一个 AI 留下的交接

## 2. 复述，不要总结成一句套话

用你的话回答下面四段，每段 2—4 行：

- **现在这个项目处于什么状态**（能跑的、不能跑的、还差什么）
- **上一轮定下了什么**（列出最近 3 条决策及其依据）
- **哪些文件是别人正在改的 / 哪些是雷区**（路径级别）
- **你这次打算先做什么、为什么**

## 3. 等确认

把上面四段复述完，**停下来等人确认**，然后才允许改文件。
如果第 1 步里读到的东西互相矛盾（例如 `contracts/contract.json` 与 `docs/status.md` 对不上），
**明确指出矛盾，不要自己挑一个信**。

## 4. 工作期间的硬约束

- 密钥（Access Secret / App Key / OAuth Token）**不写进任何文件、不打印到终端输出、不提交**
- 需要调知乎接口时，**先查额度**（`GET https://developer.zhihu.com/api/v1/quota`），并遵守缓存 + 去重
- 接口失败 / 额度耗尽 / 空数据 → **给真实提示，绝不返回伪造兜底数据**
- 改动前先在 `docs/decisions.md` 找有没有相关决策；**有冲突就提出来，不要默默按自己的理解写**
- 涉及对外可见或不可逆的动作（发布部署、联系他人、提交资料、改报名信息）→ **先问，不自己动**
- 提交前跑 `powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1`

## 5. 别做的事

- 不要重构你没被要求重构的东西
- 不要引入 Kafka / Neo4j / Redis / K8s / 微服务这类中间件
- 不要把两个 AI 的工作"揉成一次提交"——谁的改动谁的提交
- 不要为了测试通过而放宽契约；契约要改就改契约，并写 ADR

---

# 收工协议（同一个会话结束前自动执行，不等人提醒）

## S1. 把"为什么"落盘

**人明确说过的**改动理由，写进 `.ctx/current.md`（一行）：

```
Context: <人说过的理由，原话转录，不要自己推断>
```

- `commit-msg` hook 会在 `Context:` 缺失时**自动**用这一行填进 commit message → 人不用手改 commit message
- 提交成功后该文件被自动清空
- **只写人说过的话。** 人没说过原因就留空让人补；自己推断出来的 Context 是零信息量，只会污染下一个 AI

## S2. 写交接

按 `prompts/HANDOFF.md` 写一份交接到 `docs/handoffs/`。**AI 自己写，人只审阅。**

## S3. 跑自检

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1
```

有 FAIL 就不能提交。
