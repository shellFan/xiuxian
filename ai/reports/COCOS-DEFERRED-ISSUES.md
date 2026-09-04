# Cocos Creator 延期验证项（Phase 3）

> 沙箱环境无法启动 Cocos Creator Editor / 微信小游戏预览，以下验证项延期至本地 Cocos Creator 3.8 LTS 环境执行。

## 1. UI Component 运行时渲染验证

**级别**：LOW（Service 级测试已全覆盖，仅运行时渲染待确认）

**涉及文件**（11 个 Cocos Component，含 23 处 `@ccclass` / 82+ 处 `@property`）：

| Component | 文件 | `@ccclass` | `@property` 数 |
| --- | --- | --- | --- |
| MainView | `assets/scripts/ui/main-view.ts` | ✅ | 9 |
| MergeBoardView | `assets/scripts/ui/merge-board-view.ts` | ✅ | 8 |
| WorkerView | `assets/scripts/ui/worker-view.ts` | ✅ | 1 |
| ToastView | `assets/scripts/ui/toast-view.ts` | ✅ | 2 |
| FeedbackView | `assets/scripts/ui/feedback-view.ts` | ✅ | 4 |
| GameBootstrapComponent | `assets/scripts/core/game-bootstrap-component.ts` | ✅ | 0 |
| Phase2Root | `assets/scripts/ui/phase2/phase2-root-component.ts` | ✅ | 12 |
| CareerPanel | `assets/scripts/ui/phase2/career-panel-component.ts` | ✅ | 10 |
| KpiPanel | `assets/scripts/ui/phase2/kpi-panel-component.ts` | ✅ | 2 |
| EventPopup | `assets/scripts/ui/phase2/event-popup-component.ts` | ✅ | 4 |
| PromotionPopup | `assets/scripts/ui/phase2/promotion-popup-component.ts` | ✅ | 4 |

**验证步骤**：
1. 在 Cocos Creator 3.8 LTS 中打开 `assets/scenes/Main.scene`
2. 确认 MainView 节点下 Phase2Root 子节点存在且组件绑定正确
3. 运行预览，验证底部 tab 切换（WORKPLACE/SECT/MERGE/EVENT）
4. 验证 Work/Fishing 模式切换
5. 验证 KPI 面板（≥3 项）实时刷新
6. 验证 Career Event 弹窗 resolve/choose 按钮
7. 验证 Promotion 入口三选项与结果文案
8. 验证离线奖励弹窗（普通/双倍互斥）
9. 重启后验证存档恢复（含 officeLevel/promotionFailCount/lastIdleSettlementId/tutorialStep/tutorialCompleted/dailyTasks/dailySignIn）

## 2. 场景挂载集成测试

**级别**：LOW（`tests/scene/static-scene-integrity.test.ts` 已通过静态验证）

**验证步骤**：
1. 确认 `GameBootstrapComponent` 在 Main.scene 中正确挂载
2. 确认 `Phase2Root` 在 MainView 下作为子节点存在
3. 确认 4 面板（CareerPanel/KpiPanel/EventPopup/PromotionPopup）引用非空
4. 确认 4 tab 按钮 + Work/Fish 按钮绑定事件

## 3. 微信小游戏平台适配

**级别**：LOW（`PlatformService` 已抽象，`wechat` 分支已实现但 `enabled: false`）

**涉及文件**：
- `assets/scripts/services/platform/platform-service.ts` — 4 种平台（mock/web/desktop/wechat）
- `assets/scripts/services/platform/wechat-reward-provider.ts` — 微信激励视频（当前 fallback 到 MockRewardProvider）
- `assets/configs/platform.wechat.json` — `enabled: false, rewardedVideoAdUnitId: ""`

**验证步骤**：
1. 设置 `platform.wechat.json` 的 `enabled: true` 和真实 `rewardedVideoAdUnitId`
2. 在微信开发者工具中构建并预览
3. 验证 `WechatRewardProvider.requestReward()` 调用 `wx.createRewardedVideoAd`
4. 验证 `PlatformService.isWechatMiniGame()` 返回 `true`
5. 验证 `onShow`/`onHide` 生命周期回调正确触发

## 4. Cocos 资源管理

**级别**：LOW（当前未使用 `cc.resources` / `cc.assetManager` 动态加载）

**现状**：
- 所有配置通过 `ConfigService.loadFromJson()` 同步加载（JSON 被 Cocos 构建管线自动打包）
- 未使用 `director.loadScene()` / `cc.resources.load()` / `cc.assetManager`
- 场景仅 `Main.scene` 一个，无动态场景切换

**未来风险**：
- 若新增资源动态加载（如远程配置、热更新资源包），需测试 Cocos 资源释放与内存管理
- 若新增多场景，需验证 `director.loadScene()` 场景切换时 `GameContext` 生命周期

## 5. ccclass/property 装饰器 Shim 验证

**级别**：LOW（`tsc --noEmit` 已通过，运行时需确认 shim 正确降级）

**涉及文件**（6 处 `property` shim 定义 + 1 处 `as any` 视图层）：
- `assets/scripts/ui/main-view.ts` — `property` shim + `as any`（line 161）
- `assets/scripts/ui/merge-board-view.ts` — `property` shim
- `assets/scripts/ui/worker-view.ts` — `property` shim
- `assets/scripts/ui/toast-view.ts` — `property` shim
- `assets/scripts/ui/feedback-view.ts` — `property` shim
- `assets/scripts/ui/phase2/ui-bits.ts` — 统一 `property` + `resolveCocosType` 导出

**验证步骤**：
1. 在 Cocos 运行时确认 `@ccclass` 装饰器正确注册组件
2. 确认 `@property` 装饰器在 Inspector 面板正确显示序列化字段
3. 确认 `resolveCocosType('Label')` / `resolveCocosType('Button')` / `resolveCocosType('Node')` / `resolveCocosType('UIOpacity')` 正确解析为 Cocos 类型
4. 建议后续统一收敛到 `ui-bits.ts` 单一导出，消除 5 处重复 shim 定义

## 6. 禁用模式搜索结果（Phase 3 确认）

| 模式 | 结果 | 说明 |
| --- | --- | --- |
| `Math.random()` | **0 处**（仅 `random-provider.ts` 合法封装） | ✅ |
| `Date.now()` | **0 处**（仅 `clock.ts` 合法封装） | ✅ |
| `wx.createRewardedVideoAd` | **0 处**（统一走 `MockRewardProvider`） | ✅ |
| `TODO` / `FIXME` | **0 处** | ✅ |
| `as any` / `: any` | **7 处**（仅 UI 装饰器 shim + 1 处视图层 `as any`） | LOW，与 Phase 2 一致 |

## 7. Phase 3 新增 Service 的 Cocos 集成点

| Service | Cocos 集成需求 | 状态 |
| --- | --- | --- |
| TutorialService | UI 弹窗引导步骤展示 | 延期（Service 级已测试，UI 绑定待 Editor 验证） |
| DebugService | 开发者快捷操作面板 | 延期（仅开发环境使用） |
| DailyTaskService | 每日任务列表 UI 展示 | 延期（Service 级已测试，UI 组件待 Phase 4+） |
| AchievementService.checkAll | 成就弹窗/列表 UI | 延期（Service 级已测试，UI 组件待 Phase 4+） |

---

**结论**：以上 7 项均为 LOW 级别，Service 级测试已全覆盖。延期原因仅为沙箱无法启动 Cocos Creator Editor，需在本地 Cocos 3.8 LTS 环境中人工验证运行时渲染与平台适配。