# 交接：加「说人话」skill——通用去 AI 腔 + 项目专用术语层（两层都落地）

- **时间**：2026-11-19 17:36
- **使用的 AI 平台**：MCode（SideChat 会话 `session_622a4b3b-3fc8-46b6-9471-e934d04673e1`）
- **分支 / commit**：`main` @ `a4f5283`
- **本次目标**：用户问「你有没有能说人话的skill啊？」→ 拍板「两个都要」：先装现成的通用 humanizer，再造一个认得本项目术语的专用版；把 AI 的技术产出翻译成人话。

## 1. 现在处于什么状态

- 本仓库新增**项目级 skill** `.minimax/skills/plain-talk/`（`SKILL.md` + `references/glossary.md`），已提交 `a4f5283`，lint 全绿。
- 本机另装了**通用 skill** `~/.agents/skills/humanizer-zh`（skills.sh 的 `op7418/humanizer-zh`，58.9K 安装量），与项目专用层是**两层**：通用层去 AI 腔，专用层保事实。
- 专用层已随仓库推给队友；本机通过 **junction** 指向同一份文件（`~/.agents/skills/plain-talk` → 仓库目录），**新会话才自动可见**。
- 项目其余部分**没动**：契约仍是 14 路径 / v0.5，后端 14 个路径代码齐全，仓库自检 PASS 13/0/0。
- **额度状态未变**：问题发现 **0/100**（每日 00:00 重置、不结转），完整回归仍要等明天。

## 2. 改了什么

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `.minimax/skills/plain-talk/SKILL.md` | 新增：8 步流程（抽事实清单 → 能核就核 → 映射术语 → 搭结构 → 念数字 → 语气 → 收尾对账 → 可选叠 humanizer）+ 输出契约 + 失败处理 + 1 个例子 | 用户要的是「把技术产出说成人话」，通用 humanizer 不认本项目术语 |
| `.minimax/skills/plain-talk/references/glossary.md` | 新增：20 条术语对照表（每条带「不能删的限定」列）+「数字怎么念」表 +「容易翻错的地方」 | 术语是本项目最大的阅读障碍；限定列防丢失限定条件后变成假话 |
| `docs/decisions.md` | 追加 **D47**（决策层只增不改） | 项目纪律：每条决策写日期、结论、依据、状态 |
| `~/.agents/skills/humanizer-zh/`（仓库外） | `npx skills add op7418/humanizer-zh@humanizer-zh -g -y` | 用户选「两个都要」里的「装现成的」 |
| `~/.agents/skills/plain-talk`（仓库外） | junction → 仓库 `.minimax/skills/plain-talk` | 一份文件两处可见，不复制、不漂移 |

## 3. 试过但没成的（**最重要，别省**）

- **尝试**：用 `edit` 工具对 `SKILL.md` 做一次大段替换（改 Procedure 的 1—7 步）。
  **结果**：报错 `Could not find the exact text in ... The old text must match exactly including all whitespace and newlines.`——多行长块匹配失败（**这个坑本项目已踩过多次**：`contracts/api.json` 的路径段、`docs/decisions.md` 的追加都栽过）。
  **结论**：大段拼接/替换一律用 `write` 整份重写，或用 Node 脚本按文本切分 + 断言「必须命中且只命中一次」，不中就 `exit(2)` 不落盘。

- **尝试**：只把术语对照表当成通用 humanizer 的替代品。
  **结果**：对比评测（同一道题，带 skill vs 不带 skill 各跑一遍）显示**基线版反而更愿意自己核事实**（git / 额度 / 端口 / 压缩包条目逐个核），且带 skill 版**把「今天修了 9 处、还欠 4 件活」整段丢了**。
  **结论**：术语表**不够**。专用层必须管住两件事——①「能核就核」②「事实清单分限定类/信息类，信息类不许整段丢」。这两条已写进 `SKILL.md`（第 1、2、7 步 + Failure handling）。

- **尝试**：用 `Remove-Item` 清理评测临时目录。
  **结果**：永久删除被安全策略拦截。
  **结论**：别删。评测产物留在 `%TEMP%\eval-plain-talk\`（`baseline.md` / `with-skill.md` / `with-skill-r2.md`），留着给下一个 AI 对照。

- **尝试**：评估要不要用 `request_plugin` 把官方市场的 `humanizer` 插件拉进来。
  **结果**：该插件 `recommendable: false`，且**只处理英文文本**，与中文场景不匹配。
  **结论**：不装、不推。真要通用去 AI 腔，用 skills.sh 的 `humanizer-zh`（已装）。

## 4. 下一个 AI 接手前必须知道的事

- **目录归属没变**：`web/**`、`docs/status.md`、`docs/队友对齐清单.md`、`docs/P1-三件产出.md`、`docs/协作规范.md` 归主对话；本会话管 `contracts/**`、`server/**`、`docs/decisions.md`、`docs/handoffs/**`。
  **本轮新增了 `.minimax/`（新目录，不与任何一方冲突）**——`docs/协作规范.md` 的目录所有权表**还没加这一行**，那是主对话的文件，要改让它自己改。
- **`docs/status.md` 的接口数已经不是 13 了**（本会话之前记录的「仍 13」是过期信息）：status.md 第 46 行已写「接了契约 **14** 个路径中的 12 个」。
- **提交纪律**：禁 `git add -A`，一律 `git add -- <显式路径>`；同一仓库有另一个 AI 会话并发工作，**提交前先 `git fetch`**（本轮 fetch 后 origin/main 与 HEAD 一致，无冲突）。
- **`Context:` 行由人给**：本轮写进 `.ctx/current.md`（用户原话转录），commit-msg hook 自动填进 commit message 并清空该文件。下一个会话若要提交，**先确认 `.ctx/current.md` 里有用户说过的理由**。
- **Windows 编码**：`.ps1` 必须 UTF-8 **with BOM**；`contracts/api.json` 是 CRLF 无 BOM；本轮新增的两个 `.md` 是 **LF、无 BOM、U+FFFD = 0**（第一次写 glossary 时出现过 3 个 U+FFFD，已修）。
- **skill 发现路径**：MCode 本机读 `~/.agents/skills/`；仓库里的 `.minimax/skills/` 是项目级正本。队友用别的平台需自行软链。
- **skill-creator 的流程**：`skill({name:"skill-creator"})` → 读 `references/commands-windows-powershell.md` → `node <skill-creator>/scripts/lint-skill.js <skill目录>` → 用两个 `worker` 子任务做带/不带 skill 的对比评测，评测产物写 `%TEMP%\eval-<skill名>\`。

## 5. 下一步（按优先级）

1. **等第二轮评测结果**（`%TEMP%\eval-plain-talk\with-skill-r2.md`）：看补了「能核就核」和「信息类不许丢」之后，带 skill 版是否不再丢信息类事实。
2. **明早额度重置后跑完整回归**：`node scripts\regress-p3.js`（≈11 次问题发现），末尾出逐拍对照清单。
3. **补 `docs/协作规范.md` 的目录所有权表**（主对话的文件）：加一行 `.minimax/skills/` 归 `nineanswerer`。
4. **术语表随项目演进补**：出现新黑话就往 `references/glossary.md` 加一行，别让没收录的词每次现编。
5. **用户侧的老待办没变**：上平台上传拿正式链接（12-04 前）、人亲手点一遍 P3、录演示视频、零 G / 零 H / 零 K 自己发。

## 6. 需要人拍板的事

- **`docs/协作规范.md` 的目录所有权要不要加 `.minimax/skills/`**：那文件归主对话管，本会话没动。要加的话得由用户或主对话来改。
- **队友要不要也用这个 skill**：仓库里有了正本，但队友的 AI 平台可能不读 `.minimax/`。要不要在 `docs/队友对齐清单.md` 里写一句「把 `.minimax/skills/plain-talk` 软链到你的 skills 根目录」——那文件也是主对话管的，等用户点头。
- **术语表要不要扩到「给评委看的版本」**：现在只覆盖「给人解释」和「给队友转发」两种读者；评审摘要（5 分钟 Demo + 3 分钟 Q&A 口径）要不要单独出一套说法，用户定。
