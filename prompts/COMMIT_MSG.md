# COMMIT MESSAGE 规范

> 由 `.githooks/commit-msg` 在本地强制。安装：`powershell -ExecutionPolicy Bypass -File scripts/install-hooks.ps1`
> 紧急情况可 `git commit --no-verify` 绕过——但请在群里说一声。

## 格式

```
<type>(<scope>): <祈使句意图，≤50 字符>

Context: <为什么这么改，一到两行>
Tried:   <试过什么、什么失败了>
Verify:  <怎么验证的：跑了什么命令 / 看了什么输出>
```

`type` 取值：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf`

## 为什么强制三行

**Git 只记录"改成了什么"，不记录"为什么这么改"和"试过什么失败了"。**
两个 AI 平台 = 两个互不相通的记忆体。如果只有一行 `update model` 这种零信息量的标题，
三个月后你看到分数 0.83，根本不知道那是哪版代码跑出来的、当时试过什么。

三行里最值钱的是 `Tried:`——它记录的是**失败路径**，那是代码和 git log 里都看不到的信息。

## ⚠️ Context 行必须由人给，AI 不许代写

AI 写 diff 时看得见"改成了什么"，但它**不知道"为什么"**——决策可能发生在你脑子里、
在上一次会话里、在队友的消息里。AI 硬写出来的 Context 只会是 diff 的复述，
看起来煞有介事，实则零信息量，而且会污染下一个 AI 的判断。

**做法**：让 AI 生成标题和 `Tried:`（它确实知道试过什么），`Context:` 你自己写一行。

## 例子

```
feat(cards): 卡片加知乎原始回答链接

Context: 评审要求每张卡片可回溯出处，question_answers 返回的 Url 是唯一来源
Tried:   先用直答生成摘要，出处只有知乎话题页，点进去找不到具体回答
Verify:  本地跑 scripts/probe-zhihu.ps1 -Only question_answers，响应里 Url 可直接回跳
```

## hook 行为

- 缺 `Context:` / `Tried:` / `Verify:` 三行中任意一行 → **拒绝提交**，提示补上
- 三行为空 → **拒绝提交**
- 空 commit（只有标题）→ 拒绝
- 标题超过 50 字符 → 拒绝
- 紧急绕过：`git commit --no-verify`（请在群里说一声）
