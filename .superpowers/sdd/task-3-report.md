# Task 3 范围修正报告：按 Web V1 接通合成展示

## 结果

合成页现在只负责展示配方、材料、产物和合成按钮。`GameUIController` 仍从 `CocosBootstrapComponent.instance.facade` 获取真实 `GameFacade`，按钮调用 `facade.craft(recipeId)`，成功后刷新展示并由真实 `GameContext` 的 CraftService 持久化结果。

棋盘格节点继续作为现有场景的视觉布局容器和场景契约，不再创建或绑定 `DragController`、`MergeBoardView`，也不依赖拖拽完成合成。旧的棋盘拖拽回归测试已调整为只验证显式注入真实 board 时 Facade/Context 仍可用；不再符合 Web V1 的棋盘视图测试已移除。

## 范围修正

- 保留 `GameUIController`、真实 `GameFacade` 和真实 `GameContext`。
- PC V1 默认 Facade 使用 `board: null`；领域 board/recruit/merge 能力仍可通过显式 board 注入，不被 UI 拖拽依赖。
- Craft presentation 使用 `buildCraftViewModel` 渲染材料、产物、可用状态和按钮绑定。
- 恢复 Phase 4、Phase 5、release、view-model 预存测试中的显式 `board: null` 语义；这些文件未纳入本次提交。
- 未修改 Phase 2。

## 验证

- `npm test`：通过，执行 73 个测试文件。
- `npm run build:game`：通过。

## 提交范围

本次提交仅包含 Task 3 范围修正：`GameUIController`、Facade 的 PC V1 默认 board 入口、Task 3 UI/gameplay 测试和本报告。工作区中 phase4/phase5/release/view-model、桌面运行时、脚本、构建产物、记忆文件等预存变化未纳入提交。
