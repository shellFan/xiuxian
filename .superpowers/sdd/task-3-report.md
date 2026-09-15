# Task 3 范围修正报告：按 Web V1 接通合成展示

## 结果

合成页现在只负责展示配方、材料、产物和合成按钮。`GameUIController` 仍从 `CocosBootstrapComponent.instance.facade` 获取真实 `GameFacade`，按钮调用 `facade.craft(recipeId)`，成功后刷新展示并由真实 `GameContext` 的 CraftService 持久化结果。

棋盘格节点继续作为现有场景的视觉布局容器和场景契约，不再创建或绑定 `DragController`、`MergeBoardView`，也不依赖拖拽完成合成。棋盘相关源码测试保持不变；本次仅清理 TypeScript 生成的 `tests/.compiled` 陈旧输出，并补充了由最小 UI fake 触发真实合成按钮回调的行为测试。

## 范围修正

- 保留 `GameUIController`、真实 `GameFacade` 和真实 `GameContext`。
- PC V1 默认 Facade 使用 `board: null`；领域 board/recruit/merge 能力仍可通过显式 board 注入，不被 UI 拖拽依赖。
- Craft presentation 使用 `buildCraftViewModel` 渲染材料、产物、可用状态和按钮绑定。
- 恢复 Phase 4、Phase 5、release、view-model 预存测试中的显式 `board: null` 语义；这些文件未纳入本次提交。
- 未修改 Phase 2。

## 验证

- `npm test`：通过，执行 72 个测试文件。
- `npm run build:game`：通过。

## 提交范围

本次提交仅包含 Task 3 修复所需的 `game-ui-controller.ts.meta`、Task 3 UI/gameplay 测试和本报告。工作区中 phase4/phase5/release/view-model、桌面运行时、脚本、构建产物、记忆文件等预存变化未纳入提交；没有删除源码测试。
