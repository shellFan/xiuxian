# UI/UX 设计规范（入口）

> 路由：UI 任务 → `game-ui-ux` 技能 + 本文件。**深度规格不在本文件重复**，见下方权威文档表；本文件负责入口、优先级与验收。

## 1. 权威文档表（按优先级）

| 主题 | 权威文档 | 状态 |
|---|---|---|
| 布局坐标/安全区公式/层级 | docs/UI-DESIGN-SYSTEM.md（750×1334 基准，`L=max(insetLeft,24)` 等） | token 为候选，未被 UI 运行时加载 |
| Token 定义 | assets/configs/ui-theme.json（schema：docs/schema/ui-theme.schema.json，PHASE4_CANDIDATE，runtimeEnabled=false） | 候选 |
| 信息架构 | docs/UI-IA.md | 现行 |
| 视图绑定/所有权 | docs/UI-BINDING-CONTRACT.md（GameBootstrap 一个 GameContext；UiSessionPort；View 禁读 PlayerData） | 设计接口，phase2 view-models 为旧适配层 |
| 状态矩阵 | docs/UI-STATE-MATRIX.md | 现行 |
| Prefab 规格 | docs/COCOS-PREFAB-ARCHITECTURE.md | 规格先行 |
| 面屏验收 | docs/UI-SCREEN-ACCEPTANCE.md | 现行 |
| 奖励 UX 状态 | docs/REWARD-UX-STATE.md | 现行 |

## 2. 组件硬规则（来自 UI-DESIGN-SYSTEM，摘录为检查项）

1. 一屏一个 Primary Button（`token:colors.primary`）；提交期间 loading 态。
2. Danger 操作必须 ConfirmModal 后执行；Disabled 按钮不收触摸且**旁边显示原因**，不得只降透明度。
3. Reward Button 文案「看广告 ×2」；rewarded 态显示「已领取」（IAA-DESIGN 文案契约）。
4. 触摸热区 ≥88；图标 48 + 形状+标签双编码（不可只靠红绿区分）。
5. 层级 office → board → hud → mask → modal → tutorial → toast；Toast 不遮主按钮。
6. 字体放大 1.3 倍不破版；长标签两行截断；资源缩写可点开完整值。
7. 视口窄于可用下限时折叠为「更多」，出现负坐标直接报 unsupported viewport error，不渲染无效几何。

## 3. 事件驱动刷新（game-ui-ux 技能核心要求）

- UI 刷新由 `EventBus<GameEvents>` 事件驱动（game-events.ts 类型表），**禁止轮询**（每帧/每秒读快照刷 UI 的实现不予合入）。
- View 只能从 facade `snapshot()` 取只读 DTO；数值展示用 utils/number-formatter（docs/NUMBER-FORMAT.md）。

## 4. 新 UI 交付检查单

- [ ] token 引用走 `token:<JSON路径>`，无硬编码色值/尺寸
- [ ] 安全区 L/R/T/B 公式正确应用（避胶囊、不叠加最小边距）
- [ ] 订阅在 Presenter 单点维护，离开面板解绑（UI-BINDING-CONTRACT）
- [ ] 按钮/状态符合 §2 全部 7 条
- [ ] 空态/加载态/错误态/满盘禁用原因都有 UI 表达（UI-STATE-MATRIX）
- [ ] `tsc --noEmit` + `tests/ui/` 新用例 + 截图（desktop + mobile 360~430 宽度档，参照 ai/reports/v10-ultimate/screenshots 结构）
