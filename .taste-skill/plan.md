# 从心日报 · tasteskill 改造计划

Line 1 — kind: software（AI 工具；受众 = 黑客松评委 + 普通学习者；主行动 = 生成日报）。

Line 2 — deal: hero=centred（x.ai 式居中大标题 + 一个真实产品窗口从光框里升起）；palette=candy-on-black（近黑 #000 底 + 青绿 #93f1f7 强调——AI 工具行业的现成配色，比之前的奶油纸更贴这个品类）；type=funnel（Funnel Display/Sans + DM Mono，友好明亮、与"桌宠陪伴"调性合）；moment=iris-opens（1 个，section 内）；nav-mega / footer-statement / close-type / surface-pairs / solid / initial；radius=soft。
Voice: technical-dry；Pairs: 精确但不冷、短句为主、空状态才留一点人味；Person: 产品作主语、"你"指读者所得；Sentences 8–16 词；Humour: 首屏/数据/FAQ 无；House words: 收藏、日报、认知地图、出处（同一词不换说法）；Never: 自我美德词、名字双关、数字堆砌。

## Sections（每屏一节，h2 在前，equal edges；把现有功能按软件页配方重排）

1. `hero`（1 屏，`data-enter`）— 一句硬事实：你的 4 条知乎收藏。视觉 = centred 的**真实日报窗口**（沿用现有真实数据：报头/索引/版图），不是假 UI。主按钮"生成日报"= 现有喂收藏动作。
2. `app-frame`（1–2 屏）— 产品主体：把真实的《从心日报》窗口整块呈现（当前 daily.js 渲染的真实 DOM）。app-frame 只在 hero 与此处出现（object 上限 3 节：hero / app-frame / 地形）。
3. `features`（1 屏，features-2x2）— 四个真实能力：收藏 → 卡片（含出处）、三层认知地图、断层对照、桌宠陪读。每个卡片配真实 UI 片段或真实图标（icons.mjs scan）。
4. `terrain`（1 屏，`surface-pairs` 的一节，放 moment=iris-opens）— 三层认知地图的真实地形（renderTerrain 真实数据）；这是软件页的 diagram/visual 节，也是唯一 moment 所在。
5. `faq`（1 屏）— 真实问题：出处从哪来、额度多少、往期是否存档（如实：只当天快照不存档）、密钥放哪（本地 secrets 文件）。无发明事实。
6. `footer.closing`（1 屏，footer-statement + close-type）— 报名"从心"大字 + 主行动"生成日报" + 法律行（品牌/年份/出处说明）。无虚构地址/电话/邮箱。

## 约束与取舍

- 保留全部真实数据接线（daily/app/pet/terrain/quiz/api），改造只在 `web/index.html` + `web/css/` + 必要的 JS 挂类；不碰 server/contracts。
- 桌宠（刘看山）是官方素材：作 hero 窗口内的陪读形象与一处 featured 卡，遵循官方赛期可用性；不画假图标冒充真实产品图标。
- kit 复制到 `web/assets-kit/`，不编辑 kit 自身文件。
- 现有 outro 落版（演示最后一拍）保留，但不占页面 section 网格（演示触发式浮层）。
