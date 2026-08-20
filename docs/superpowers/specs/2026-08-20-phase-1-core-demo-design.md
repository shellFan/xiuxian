# 《牛马修仙传》Phase 1 核心 Demo 设计

## 目标

在 Cocos Creator 3.8 LTS + TypeScript 中实现可运行、可拖拽合成、可产生工资并可本地保存/恢复的竖屏 2D 核心 Demo。第一阶段只实现 Lv1~Lv6、4×4 棋盘、免费招聘、工资、基础反馈和稳定性测试，不进入广告、登录、后台、排行、宗门、挂机等第二阶段内容。

## 执行策略

先完成真实 Provider/Cocos Preflight，再按 TASK-001~TASK-012 串行执行。每个正式 Task 必须经过 Codex Luna Developer、Build/Test、Codex Sol Reviewer；BLOCKER/HIGH 返回 Luna 修复，最多 3 轮，超过后 ESCALATED。任何失败状态不得手工改为 DONE。

## 系统架构

依赖方向固定为 `UI → Game Services → Domain/Model → Config/Save`。游戏模型是唯一事实来源，UI 仅呈现状态和发送用户意图。

- `GameBootstrap` 创建唯一 `GameContext`，统一持有 Config、Save、Economy、Merge 等服务。
- `ConfigService` 加载 `worker.json`、`economy.json`、`game.json`，提供 Lv1~Lv6 与棋盘/经济配置。
- `PlayerData`/`GameSaveData` 保存工资、最高等级、棋盘 Worker 和时间戳。
- `SaveService` 是 localStorage 唯一入口，负责初始化、非法 JSON 保护、迁移和关键动作保存。
- `MergeBoard`/`MergeCell`/`WorkerEntity` 负责放置、移动、合成、序列化和恢复，不依赖 Cocos Node。
- `EconomyService` 根据配置发放合成工资，防止重复与负数奖励。
- `MainView`/`MergeBoardView`/`WorkerView`/`ToastView` 负责交互和显示；拖拽用 `IDLE/DRAGGING/MERGING` 锁避免竞态。
- `EventBus` 只承载工资变化、合成、解锁、存档加载等跨模块事件。

## 核心数据流

招聘：按钮 → Game Service → 棋盘查找空位 → 创建唯一 Worker ID → 更新模型 → 保存 → UI 刷新；满棋盘时只发 Toast。

拖拽：WorkerView 采集触摸 → BoardView 转换目标格 → Merge Service 查询模型 → 空格则移动、不同级恢复、同级进入合成。合成期间锁定交互；成功后删除两个旧 Worker、创建高级 Worker、发工资、更新最高等级、保存并播放反馈。Lv6+Lv6 只提示，不创建 Lv7。

恢复：Bootstrap → Config 加载 → SaveService 读取/迁移 → MergeBoard 恢复 → UI 根据模型重建，不通过 Node 数量推断数据。

## Cocos 工程设计

创建 `assets/scenes/Main.scene`、`assets/scripts/{core,game,model,services,ui,utils}`、`assets/{prefabs,configs,textures,audio,bundles}` 和 Cocos 3.8 所需项目元数据。Main 场景包含 Canvas、标题/职级/工资、4×4 棋盘、招聘按钮和提示区。Worker 第一阶段使用卡片/Emoji/等级文字，不引入正式美术或第三方动画框架。

## 测试与验证

- 纯领域逻辑使用 Node/TypeScript 自动测试，覆盖 Config、Save、Board、Merge、Economy 和竞态保护。
- `npm run ai:check` 验证 orchestrator；TypeScript 检查独立验证业务代码。
- Sol Final Review 检查路径、状态单一来源、事件解绑、Tween 生命周期、Cocos/微信小游戏兼容性和未解决的 BLOCKER/HIGH。
- Cocos Editor 未实际启动时，报告只能写静态检查通过；必须列入人工验证，不能声称 Editor/真机通过。

## Task 边界

TASK-001~012 保持总指令给定职责和依赖顺序。每个 Task 使用最小 allowedPaths，不使用 `**` 全仓放行；TASK-012 只做整体验收和必要的小范围修复，不新增大型功能。

## 完成标准

12 个 Task 全部 DONE，或者在不丢失验收条件的情况下合理合并且所有 Acceptance Criteria 满足；Mock ai:check、业务 TypeScript、自动测试和 Sol Final Review 均通过；工作区无越界修改；生成 `ai/reports/PHASE-1-RESULT.md`。若 Cocos Editor 无法启动，最终状态不得高于 PARTIAL，直到人工 Editor 验证完成。
