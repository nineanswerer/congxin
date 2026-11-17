@AGENTS.md

## Claude Code 专属

- 本文件**只做指针**。项目通用规则一律写在根目录 `AGENTS.md`，此处不要复制正文。
- 若发现根目录没有 `AGENTS.md`，**立刻停下来提醒人**，不要凭猜测继续。

---

# 自动执行的工作协议（不用人提醒、不用人粘贴）

**开工协议全文见 [`prompts/BOOTSTRAP.md`](prompts/BOOTSTRAP.md)。Claude Code 打开本仓库时会自动加载本文件，因此：**

1. **开工前自己读 `prompts/BOOTSTRAP.md`**，按里面的顺序读契约 → 规则 → 决策 → 进度 → 最新交接，
   然后复述现状、**停下来等用户确认**，确认后才准改文件。
2. **收工前按同一份协议的「收工协议」段执行**：
   - 把用户明确说过的改动理由写进 `.ctx/current.md`（格式 `Context: <理由>`）→ commit hook 会自动填进 commit message
   - 按 `prompts/HANDOFF.md` 写一份交接到 `docs/handoffs/`
   - 跑 `powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1`
3. **改了别人负责的目录** → 先在 `docs/协作规范.md` 的「目录所有权」里确认，冲突就提出来，不要默默覆盖。
