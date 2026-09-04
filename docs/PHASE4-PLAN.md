# Phase 4 UI / Content Implementation Plan

> Agentic workers: use subagent-driven-development for bounded content work; the root owns architecture, integration and final verification.

**Goal:** 交付可审查、可接入而未擅自上线的 Phase 4 产品化包。

**Architecture:** 保留 Phase 3 GameContext 与全部 Service。UI 走 View → Presenter/ViewModel → 同一个 GameContext 的服务边界。新增配置放独立候选命名空间，不替换运行配置；不制作虚假可运行 Prefab。

**Tech Stack:** Cocos Creator 3.8.4、TypeScript、JSON、Markdown；无新依赖。

## Global Constraints

- 只在 `D:/git/fan/xiuxian-ui` 的 `phase4-ui-content` 工作；禁止修改主线工作区、merge、force push。
- 基线 `b9a1eb77e33424f39545baa1b05e1a4179025fd8`；创建前主线 clean，tracked diff 为空，untracked 为空。fetch 后本地主线领先远程 4 commits，使用本地最新提交，不推主线 ref。
- UI 不直接操作 PlayerData。新增功能只设计接口，不重新实现任何 Service。
- 国潮修仙 × 互联网办公室 × Q版牛马；竖屏 750×1334；按钮触摸区域至少 88×88 逻辑单位。
- 不看广告可以正常玩。广告按钮明确写“看广告”；不做强制插屏。
- 候选事件总量至少 80，含至少 10 彩蛋；成就至少 30，至少 5 隐藏；每日模板 10–15，建议每日 5–6。
- 不修改现有 career-events.json / achievements.json / daily-tasks.json；扩展与呈现映射放 assets/configs/phase4/。
- Effect 只允许 salary / performance / cultivation / mind 的有限数值。稀有概率、随机每日、隐藏成就均为接入前需求，不声称已启用。
- 本轮默认不新增 TypeScript：已有 UI 可复用，先交付 binding contract 与有节点尺寸的 HUD 设计；UI CODE 状态明确为未实施，不伪称界面已运行。

## 设计选择

1. 直接替换运行配置：可立即试玩，但会改变主线概率与经济，放弃。
2. 只写散文文档：低风险，但内容无法机械校验，放弃。
3. **采用独立候选 JSON + 完整接入文档**：可机器验证、无主线行为变化；需后续显式接入。

## Task 1 — 产品与 UI 规范（root）

- [x] 创建 `docs/UI-IA.md`：15 页面，每页完整目的/入口/退出/信息/主次按钮/状态/空/错/动画/广告。
- [x] 创建 `docs/UI-DESIGN-SYSTEM.md`、`assets/configs/ui-theme.json`、`assets/configs/ui-mock-data.json`：主 HUD 布局、组件/按钮/Modal 状态机、安全区、长屏、DEV_ONLY 示例。
- [x] 创建 `docs/COCOS-PREFAB-ARCHITECTURE.md`、`docs/UI-BINDING-CONTRACT.md`：全部指定 Prefab 的节点/属性/事件/复用映射，六个 VM 的类型、生命周期及错误处理。
- [x] 核查 27 部分要求逐一有文件落点，JSON 能解析，文档中候选与已实现不混淆。

## Task 2 — 候选内容（Luna bounded batch，可用时）

Requirements are in `docs/PHASE4-CONTENT-BRIEF.md`.

- [x] 读取现有三套内容及 Effect 类型，记录不变的源 ID。
- [x] 创建 `assets/configs/phase4/office-events.json`、`achievements.json`、`daily-tasks.json`，完成去重、字段检查和逐条语义检查。
- [x] 创建 `docs/CONTENT-INTEGRATION.md`：源配置映射、接入门槛、概率分母、奖励预算、现有能力缺口。
- [x] root 独立检查每条文案、选择的收益代价和奖励预算；不以数量合格代替审查。

## Task 3 — 视觉与接入（root）

- [x] 创建 `CHARACTER-VISUAL-GUIDE.md`、`CULTIVATION-VISUAL-GUIDE.md`、`OFFICE-SCENE-GUIDE.md`：10职业、4境界、7办公室层级。
- [x] 创建 `ANIMATION-GUIDE.md`、`AUDIO-GUIDE.md`、`assets/configs/audio-plan.json`：触发、时长、优先级、取消/静音/限流。
- [x] 创建 `IAA-DESIGN.md`、`NUMBER-FORMAT.md`、`BALANCE-PRESENTATION.md`、`ASSET-STRUCTURE.md`、`ART-GENERATION-PROMPTS.md`：7广告位、统一展示、真实源数值、资源命名、统一风格可复制生图提示。

## Task 4 — 验证与交付

- [x] 在 `docs/validation/phase4-content-check.cjs` 提供无依赖检查器：数量、去重、选项、Effect、隐藏/每日分类、源数据不可变、候选未被业务加载、文档存在与 token 引用、JSON 合法。
- [x] 运行 `node docs/validation/phase4-content-check.cjs`，故意破坏内存 fixture 验证检查器能拒绝重复 ID/非法 Effect/不足数量，然后恢复合法输入 PASS。
- [x] 运行 `npm test`、`npm run build`、`npm run ai:check`、`git diff --check`；仅静态验证，不称 Cocos Editor 验证。
- [x] 独立 review：需求覆盖与内容质量双判断，重要问题修完复审。
- [x] 输出并显式追踪 `ai/reports/PHASE4-UI-CONTENT-REPORT.md`；限定文件 stage/commit；push 仅 `phase4-ui-content`，验证远端 SHA。
- [x] 最终报告写明 UI 代码未新增、Prefab/资源/广告尚待接入、Cocos 与手机验证必需；然后停止。
