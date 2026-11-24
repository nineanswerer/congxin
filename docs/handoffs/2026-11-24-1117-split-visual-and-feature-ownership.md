# 交接：分工定案 —— 队友做视觉与设计，我们做功能（D65）

- **时间**：2026-11-24 11:0x—11:2x
- **使用的 AI 平台**：MCode
- **分支 / commit**：`main` @ 本轮提交（见 `git log`，已推 `origin/main`）
- **本次目标**：用户拍板「不要全部自己做」——把视觉与设计和功能分开，写进仓库并提交
- **对应决策**：D65｜状态条目 B31

---

## 1. 现在处于什么状态

- **分工已经写死成文件**：队友 `5zdz5` 拿 `web/index.html` + `web/css/` + `web/assets/` + `assets/` + `docs/adr/`（**视觉与设计**），
  本会话拿 `web/js/` + `server/` + `contracts/` + `scripts/` + `docs/decisions.md` + `docs/status.md`（**功能**）。
- **接缝只有 `web/index.html` 一处**，用**界面契约**兜住：`contracts/ui-contract.json` 冻结 **39 个 id + 4 个 class + 1 个 data 属性**，
  `scripts/check-contract.ps1` **第 14 项**当场校验（少一个钩子 → `FAIL` 退出码 1）。
- 仓库 `C:\Users\steam\Desktop\从心`，branch `main`，**HEAD == `origin/main`**。
- ⚠️ **零 M（给队友的分工确认稿）还没发** —— 对外发消息是用户本人做，AI 不代劳。
- ⚠️ **交付包依然没产出**（D63）。

---

## 2. 改了什么

| 文件 | 改了什么 |
| --- | --- |
| `contracts/ui-contract.json`（新） | **界面契约**：冻结 `index_ids`(39) / `index_classes`(4) / `index_data_attrs`(1)，外加 `js_owned_*` 三组（问卷选项、引导卡、地形 SVG、陪伴浮窗 —— 都是 JS 动态建的，不在 `index.html` 里）；写明三条规矩 |
| `scripts/check-contract.ps1` | **新增第 14 项「界面契约完整性」**：契约里的钩子少一个 → `FAIL`；我们的 JS 引用了没登记的钩子 → `WARN`。**已反向验证**：把 `id="ch-pet"` 改坏 → 当场 `FAIL 界面契约 ui-contract.json — index.html 里少了 id『ch-pet』`，退出码 1 |
| `docs/分工-视觉与功能.md`（新） | **本次的主交付物**：目录级边界表、接缝处理、提交方式、**双方各自的交付物与验收标准**、每天同步节奏 |
| `docs/协作规范.md` | 「目录所有权」表改成新的分家；新增「`web/` 按视觉 / 功能分家」一节；`web/` 临时接管那段保留为沿革；「其他」里补一条「队友的改动一律走 PR」 |
| `docs/decisions.md` | 追加 **D65**（只增不改） |
| `docs/status.md` | 追加 **B31** + 「已完成」补一条 + 更新时间 |
| `docs/队友对齐清单.md` | 追加 **零 M**（分工定案 + 首屏 mp4 删除的说明 + 提交方式 + 本轮交付物），**可整段复制发给队友** |
| `web/README.md` | 「第六轮」标题的时间戳修正（22:3x → 22:0x—22:1x） |
| `docs/产品说明计划书.md`、`docs/队友体验指南.md` | 自检项数 13 → 14（D1—D55 → D1—D65、交接份数同步）—— 都是**面向人的现行口径**，不是历史记录 |

---

## 3. 试过但没成的（**最重要，别省**）

1. **第一版钩子提取只抓到 1 个 id —— 因为代码不用 `getElementById`。**
   前端取元素统一走 `const $ = (sel, root = document) => root.querySelector(sel)`，
   按 `getElementById` 扫只命中 1 个。
   → **教训**：扫界面钩子要扫**所有选择器字符串字面量**（`#` / `.` / `[` 开头的），
   复合选择器（`#mirror-quiz .opt[data-qid=...]`）里的 id 也要抓出来。

2. **大写十六进制颜色被当成了 id。**
   `terrain.js` 里的 `'#B7332C'` 被扫成 id。
   → **修法**：id 必须**小写开头**（`#[a-z][a-z0-9-]*`）—— 本项目所有 id 都是小写，颜色都是大写，一刀切干净。

3. **`node -e` 在 PowerShell 里跑不了多行脚本，且 `require` 会炸。**
   内层单引号被 PowerShell 吃掉；就算写成文件，根 `package.json` 有 `"type": "module"` → `.js` 会被当 ESM。
   → **修法**：脚本写成 **`.cjs`** 再 `node xxx.cjs`，别用 `node -e`。

4. **bash 里「先 `cd` 再写文件」被本地安全策略拦了。**
   → **修法**：用 `write` 工具落文件，命令里**不带 `cd`**（工具默认就在仓库根）。

5. **`edit` 工具的 old_string / new_string 写反了一次**（把新内容当 old 传，直接匹配失败）。
   → 教训：老改这块就要重读文件拿准确原文，别凭记忆拼。

6. **日期写错了。**
   本轮改动是在 **11-24 上午**做的（上一轮提交是 11-23 22:13—22:18，中间隔了一夜），
   我第一遍把 D65 / B31 / 协作规范全写成「11-23 22:2x」。
   → **教训**：跨天接着干，**每份文档里的时间戳都要用 `Get-Date` 核一遍**，别沿用上一轮的印象。

---

## 4. 下一个 AI 接手前必须知道的事

**界面契约怎么用**

| 谁 | 要做什么 |
| --- | --- |
| 我们 | 新增界面元素 → **在 `web/js/` 里建 DOM**（`document.createElement` / `innerHTML` 模板），**不改 `web/index.html`**；新钩子登记进 `contracts/ui-contract.json`（否则第 14 项会 `WARN`） |
| 队友 | `web/index.html` / `web/css/` / `web/assets/` 随便改 —— 但契约里那 44 个钩子**不许删改**；要动 → **先改契约文件、再提 PR** |

**钩子清单怎么重新生成**

```powershell
# .ctx\extract-hooks.cjs（临时脚本，跑完删）：扫 web/js/*.js 的选择器字面量
node .ctx\extract-hooks.cjs
```

⚠️ 提取时**必须过滤大写十六进制颜色**（id 只认小写开头）。

**自检基线变了**：从 **PASS 13** 变成 **PASS 14**（新增「界面契约完整性」）。
历史文档里的「实跑 PASS 13」是当时的记录，**不用改**；但**面向人的现行口径**（计划书、队友体验指南）已更新。

**命令**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-contract.ps1    # 期望 PASS 14 / WARN 0 / FAIL 0
node scripts\regress-p3.js --light --base http://localhost:18800        # 期望 PASS 6 / FAIL 0
```

⚠️ `scripts/check-contract.ps1` **必须保持 UTF-8 with BOM**（PowerShell 5.1 否则按 ANSI 读 → 中文乱码）。
本轮用 `edit` 改过，**BOM 还在**（改完验证过）。

**`.ps1` / 文档的编码纪律**：`.ps1` = UTF-8 with BOM；`.md` / `.json` = UTF-8 无 BOM、纯 LF；写完扫 `U+FFFD`。

---

## 5. 下一步（按优先级）

1. **把零 M 发给队友**（`docs/队友对齐清单.md`，整段可复制）—— 用户本人发。
2. **队友这一轮的交付物**：P6 观感 ≤5 条、P4 真 3D 推镜、首屏与陪伴空间视觉打磨、桌宠动效与素材（验收标准见 `docs/分工-视觉与功能.md` §4）。
3. **第一单 PR 我们陪跑**（队友没用过这个仓库的 PR 流程）。
4. **AI Works 上传 401（B20）** → 用户在 Chrome/Edge 手动传，**12-05 10:00 前修好**。
5. **部署专用 Access Secret（B19）** → 用户申请后存 `C:\Users\steam\.zhihu-cli\access_secret.deploy`。
6. **P4 / P6 之外的收口**：计划书人审、演示视频（人录）、B10 试用（11-28 前）、B14 分类三件事、问赛事组两件事。
7. ⚠️ **交付包在用户点名之前不产出**（D63）。

---

## 6. 需要人拍板的事

1. **零 M 什么时候发、要不要改口吻** —— 对外发消息是用户本人做，AI 不代劳。
2. **队友的 PR 由谁合、什么时候合** —— 仓库至今 0 个 merge commit，PR 流程没用过。
3. **队友回来之后，`web/README.md`（前端交接清单）归谁** —— 现在记在我们名下，队友读但改要跟我们说。
4. **首屏 mp4 删除这件事要不要单独说** —— 已经写进零 M 里了，用户觉得太重可以拿掉。
5. **计划书里「两个 AI 平台协作」那段要不要补分工表** —— 补了更有说服力，但计划书仍待用户人审。
