# ADR-0001 · 采用上下文四层机制应对双 AI 平台协作风险

- **状态**：已采纳
- **日期**：2026-11-17
- **决策人**：nineanswerer（与 5zdz5 对齐后采纳）
- **关联**：`contracts/contract.json` 的 `governance` 块；[docs/协作规范.md](../协作规范.md)
- **契约影响**：新增 `governance.context_layers`、`governance.commit_message_required_lines`、`governance.handoff_required_before` 三项

## 背景

2026-11-17 队友对"GitHub 版本提交 + 两个人分别用不同的 AI 平台"提出疑虑。

核心风险是：**Git 只记录 diff，不记录"为什么这么改"和"试过什么失败了"**。
两个 AI 平台 = 两个互不相通的记忆体，换平台后只能靠"读代码考古 + 猜对方意图"来重建上下文——
每次重建要烧掉约 30% 的会话上下文，而且**猜错时并不知道自己猜错了**。

当时的赛程：距 12-04 报名与组队截止 17 天，真实开发窗口约 19 天 / 约 38 人时。
**这个问题必须在写第一行业务代码之前解决**，否则纠错成本会随代码量线性上升。

## 决策

采用**上下文四层**（L0 契约 / L1 身份 / L2 决策 / L3 交接），全部进 Git，
配三个强制动作（BOOTSTRAP / HANDOFF / commit 三行），由 `scripts/check-contract.ps1` 自检。

详见 [docs/协作规范.md](../协作规范.md)。

## 备选方案

- **A**：只依赖 GitHub 的版本历史与 PR 讨论，不加上下文机制
- **B**：全队统一用一个 AI 平台
- **C**：上下文存外部 wiki / 笔记软件
- **D**：直接采用云端会话里已实测跑通的通用 kit（`zhihu-s3-context-kit`，28 文件）

## 被否决的方案

### 方案 A：只依赖 GitHub 的版本历史与 PR 讨论

- **当时为什么考虑**：零额外成本，GitHub 本来就是官方认可的评审加分项
- **为什么放弃**：Git diff 不携带"为什么"和"试过什么失败"。跨 AI 平台时，下一个 AI 会把上一轮的错误当既成事实继续往上叠（上下文污染链）；而 `git bisect` 找不到语义冲突的元凶——因为它没有语法错误

### 方案 B：全队统一用一个 AI 平台

- **当时为什么考虑**：单一记忆体，不会漂移
- **为什么放弃**：队友已选定自己的平台，且**双模型交叉审查是别人没有的免费优势**——两个模型的盲区不同，交叉审一次能捞出单模型审不出的问题。**把"两个 AI"当风险是误判**，它同时是资产

### 方案 C：上下文存外部 wiki / 笔记软件

- **当时为什么考虑**：不在代码库里，不干扰开发
- **为什么放弃**：官方明确要求"保留 AI 交互记录、设计底稿和开发日志"作为创作佐证，**评审看的是仓库**。外部工具没有版本历史；而且两个人 + 两个 AI 都要能改同一份，又要再引入一套一致性机制——比直接进 Git 复杂

### 方案 D：直接搬用云端会话产出的通用 kit

- **当时为什么考虑**：已实测跑通，脚本齐全，端到端验证过
- **为什么放弃**：它是为 **Linux 工作区**写的 bash 脚本（`/workspace` 路径假设、`verify.sh`、hook 依赖 sh），且**自带一份 AGENTS.md**，与本项目已有的 AGENTS.md 冲突——两套规则并存必然互相漂移。改为**按同样的设计为本仓库重做**：PowerShell 脚本、现有 AGENTS.md 作为 L1 唯一真源

## 后果

**好处**

- 换 AI 平台有明确读档点（BOOTSTRAP → 交接记录），不用考古
- commit 强制三行后，`git log` 从装饰品变成可用的决策记录——尤其 `Tried:` 记的是失败路径，这是代码和 git diff 里都看不到的信息
- 官方要的"创作佐证"三样（AI 交互记录 / 设计底稿 / 开发日志）刚好被这套机制覆盖，**两个 AI 平台一起干活从风险变成可以讲的卖点**

**代价**

- 每次提交多写三行
- 每次换平台要多跑一次 BOOTSTRAP
- `AGENTS.md` 有 120 行硬上限（超了自检 FAIL）——仓库级 context 文件过长会持续抬高每次会话的推理成本，却不普遍提升任务成功率

**何时该重新审视**

如果发现自检脚本频繁拦人、导致大家开始用 `--no-verify` 绕过，说明约束过重。
届时调 `contracts/contract.json` 的 `governance` 块，并写新 ADR 记录这次放宽的理由。

## 验证方式

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1
```
期望：**PASS 8 / WARN 0 / FAIL 0**。

Hook 拦截与放行三条用例：

```bash
# 应被拒：只有标题 + 无三行
bash .githooks/commit-msg /tmp/msg_bad1.txt
# 应被拒：Tried: 为空
bash .githooks/commit-msg /tmp/msg_bad2.txt
# 应放行：三行齐全
bash .githooks/commit-msg /tmp/msg_good.txt
```

实测结果见 [docs/handoffs/2026-11-17-1233-首次协作机制落地.md](../handoffs/2026-11-17-1233-首次协作机制落地.md)。
