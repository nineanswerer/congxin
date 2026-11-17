@AGENTS.md

## Claude Code 专属

- 本文件**只做指针**。项目通用规则一律写在根目录 `AGENTS.md`，此处不要复制正文。
- 若发现根目录没有 `AGENTS.md`，**立刻停下来提醒人**，不要凭猜测继续。
- 新会话先执行 [`prompts/BOOTSTRAP.md`](../prompts/BOOTSTRAP.md)：读契约 → 复述状态 → **等人确认后才准改文件**。
- 会话结束前执行 [`prompts/HANDOFF.md`](../prompts/HANDOFF.md)：让 Claude 写交接记录，人不代写。
- 提交前跑 `powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1`。
- 改了别人正在改的文件 → 先在 `docs/handoffs/` 最新一份里确认，冲突就提出来，不要默默覆盖。
