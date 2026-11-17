## 这次改了什么

<!-- 一两句说清做了什么、为什么。给评审看，不给自己看。 -->

## 关联

- ADR / 决策：<!-- docs/decisions.md 的 D 编号，或 docs/adr/ADR-XXXX -->
- 契约影响：<!-- 无 / contracts/contract.json 的哪一项 -->

## 自查

- [ ] 跑过 `powershell -ExecutionPolicy Bypass -File scripts/check-contract.ps1`，无 FAIL
- [ ] 没引入数据库 / 中间件 / 微服务
- [ ] 密钥没有进源码、前端响应、日志
- [ ] 接口失败、额度耗尽、空数据都有**真实提示**，没有伪造兜底数据
- [ ] 没有顺手重构无关代码

## 给另一个 AI 平台看（交叉审查）

<!--
把 diff 喂给另一个平台的 AI，让它用 prompts/CROSS_REVIEW.md 的格式审一遍。
两个模型盲区不同——这是我们俩用不同 AI 的独有优势。
-->

审查结论：<!-- 通过 / 有条件通过 / 需要修改 -->

## 交接

<!-- 这次改动是否值得写一份 docs/handoffs/ 记录？换 AI 平台前必须写。 -->
