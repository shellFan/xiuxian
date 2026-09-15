# Task 3 范围修正报告：按 Web V1 接通合成展示

## 结果

合成页现在只负责展示配方、材料、产物和合成按钮。`GameUIController` 仍从 `CocosBootstrapComponent.instance.facade` 获取真实 `GameFacade`，按钮调用 `facade.craft(recipeId)`，成功后刷新展示并由真实 `GameContext` 的 CraftService 持久化结果。

棋盘格节点仅保留为现有场景契约，由 `GameUIController` 在合成页隐藏；配方展示改为 `CraftPageContent/CraftRecipeList/CraftRecipeRowXX` 的独立宽行，不再把多行文本写入 `BoardCell`，也不创建或绑定 `DragController`、`MergeBoardView`，不依赖拖拽完成合成。材料、产物和合成按钮均在独立 recipe row 中展示。

## 范围修正

- 保留 `GameUIController`、真实 `GameFacade` 和真实 `GameContext`。
- PC V1 默认 Facade 使用 `board: null`；领域 board/recruit/merge 能力仍可通过显式 board 注入，不被 UI 拖拽依赖。
- Craft presentation 使用 `buildCraftViewModel` 渲染材料、产物、可用状态和按钮绑定。
- `describeCraftEffect` 支持真实配置字段 `cultivation`、`mind`、`performance`，并保留 `cultivationExp`、`mindValue`、`kpi` 等兼容字段。
- 本 revision 删除的是 `09bf090` 新增的棋盘/拖拽测试：`tests/ui/merge-board-view.test.ts`，以及 `tests/gameplay/playable-loop.test.ts` 和 `tests/ui/game-ui-controller.test.ts` 中随该提交新增的棋盘/拖拽断言；用户既有的 `tests/board/`、`tests/drag/` 等测试未删除。
- 恢复 Phase 4、Phase 5、release、view-model 预存测试中的显式 `board: null` 语义；这些文件未纳入本次提交。
- 未修改 Phase 2。

## 验证

- focused UI/scene tests：覆盖 recipe row 布局、材料/产物/按钮可读性、按钮行为和字段映射。
- `npm test`：待本 revision 验证。
- `npm run build:game`：待本 revision 验证。

## 提交范围

本次 revision 仅提交 Task 3 修复涉及的 `assets/scenes/Main.scene`、`assets/scripts/ui/game-ui-controller.ts`、Task 3 UI 测试和本报告；工作区中 phase4/phase5/release/desktop/.joycode、桌面运行时、脚本、构建产物、记忆文件等预存变化不纳入提交。既有 `tests/board/`、`tests/drag/` 测试未删除。
