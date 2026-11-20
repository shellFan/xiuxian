# 性能规范

> 路由：性能任务 → `performance-optimization` 技能 + 本文件。
> 铁律：**先测量，后优化**（技能核心原则）。没有测量数据的"优化 PR"不予合入。
> 上游无微信小游戏专属技能；微信侧约束并入 COCOS_CREATOR_STANDARDS.md §4。

## 1. 测量手段（现状如实记录）

| 手段 | 状态 |
|---|---|
| 类型检查/全量测试 | `npm test` 等价链路（188 个测试文件，2026-11-21 实测通过） |
| 内容完整性 | `npm run content:check` / `gameplay-v2:check` |
| UI 截图探针 | ai/reports/v10-ultimate/screenshots（desktop 18 场景 + mobile 5 分辨率档）+ docs/QA/screenshots |
| 平衡模拟 | node tools/v58-balance-sim.cjs（Gate） |
| FPS/内存剖析 | **尚未接线**（无 perf 探针脚本）；低帧率问题先复现→截图/录屏→再定位；接入剖析探针属独立任务，不空谈数据 |

## 2. 预算类硬指标（可静态核对）

| 项 | 上限 | 来源 |
|---|---|---|
| 图集组内存 | ui_common 12 / career 各 16 / events 等 4 / office 常驻 21 峰值 28 MiB | docs/ASSET-BUDGET.md |
| 并发特效 | ≤3，粒子 ≤12 | ANIMATION-GUIDE |
| 音频通道 | ≤4 SFX + 1 BGM，超限丢最旧低优先 | AUDIO-GUIDE |
| 触摸热区 | ≥88（过小热区会引发误触重试） | UI-DESIGN-SYSTEM |
| 离线收益 | 分段 + 封顶，无无上限累计 | GAME_ECONOMY |

## 3. Cocos/微信优化要点（按项目现状适用）

1. **事件解绑**：订阅/解绑成对（onEnable/onDisable 对称）；show/hide 用返回的 unsubscribe（platform-service 契约）。长时间运行泄漏主要来源。
2. **Tween 清理**：节点回池/面板关闭停止 tween 并复原状态（GAME_FEEL §2）。
3. **对象池**：当前代码库未使用 NodePool/instantiate 动态池（git grep 实测 0）——棋盘格用固定槽位渲染。引入池化前先证明 GC 压力真实存在（技能的 GC spike 方法论），避免为池而池。
4. **合批**：同图集同层级渲染（SPRITE-ATLAS-PLAN）；避免每帧 setLayout；UI 刷新事件驱动不轮询（UI_UX §3）。
5. **资源释放**：effects 组用完释放；背景切换双驻留计入峰值；`assetManager` 释放路径要在测试中覆盖。
6. **启动时间**：configs 静态导入已最小化运行时加载；新增大 JSON 先评估体积，必要时拆文件（不引入运行时 bundle 装载，见 COCOS §2.4）。
7. **微信限制**：包体/分包、胶囊避让、后台暂停（见 COCOS §4）；广告 SDK 异常不得阻塞主循环。

## 4. 性能问题处理流程

1. 复现 + 记录（设备/分辨率档/步骤/截图）；
2. 归类 CPU/GPU/内存（技能方法论；Cocos 下关注 draw call、纹理内存、GC）；
3. 最小改动修复 + 回归测试/预算核对；
4. 结果写入 ai/reports/ 对应报告；需要长期预算约束的写入本文件 §2 表。
