# 存档与数据安全规范

> 路由：存档/迁移/防丢档任务 → `save-systems` 技能 + 本文件。
> 核心原则（与 save-systems 技能一致）：**原子写、版本迁移、fail-closed**；存档安全高于任何功能便利。

## 1. 现状锚点

| 机制 | 位置 | 要点 |
|---|---|---|
| 版本号 | model/save-data.ts:4 `CURRENT_SAVE_VERSION = 15` | GameSaveData 按版本分段注释（:312 起 V2/6 → V6.3/15） |
| 存储键 | services/save-service.ts:15 `DEFAULT_SAVE_KEY='game-save'` | 单 key 全量 JSON |
| 加载 | save-service.ts:27-45 `load()` | 解析/迁移失败抛 `SaveLoadError`，**fail-closed：绝不静默新建档覆盖原档**（:40-43 注释 F01 BLOCKER） |
| 迁移 | save-service.ts:109 起 `migrate()` | 入口守卫拒绝 `saveVersion > CURRENT`；**白名单逐字段归一化**（isNonNegativeSafeInteger + 补默认值），专项函数如 migrateAutoPolicy(:926)、卡组预设清洗(:548)、migrateCharacterSetupStatus(:1141) |
| 写入 | save-service.ts:53-67 `saveAt()` | 单 key 原子整写；当前无 hash/校验和 |
| 存储层 fail-closed | services/storage-adapter.ts | LOAD_FAILED 后 `markFailClosed()` 写锁，所有写路径 no-op（F10） |
| 备份/校验（**设计在案未接线**） | services/save-service-v2.ts（261 行） | validate → backup → write → verify；primary→backup→refuse 加载链；`game-save-backup` 键。**生产组合根 game-context.ts:253 仍 new SaveService(V1)，V2 无任何 import、无测试**——状态与接线条件见 §4 |
| 离线防重复 | idle-service.ts:76 `lastIdleSettlementId` 持久化比对（重复→ZERO_RESULT+duplicate）+ offline-reward-service.ts exactly-once（`claimedDoubleSettlementIds`、广告重复回调不重复发奖）+ 时钟回拨检测（clockAnomaly） | tests/offline/offline-exactly-once.test.ts 等 6 文件 |

## 2. 存档变更标准流程（硬性）

1. 新字段先在 `save-systems` 技能约束下回答四个问题：要不要持久化？丢了的后果？旧档默认值？回滚兼容？
2. `GameSaveData` 增字段 + 版本分段注释（写明 V 号）+ `CURRENT_SAVE_VERSION +1`。
3. `migrate()` 白名单补字段归一化（新字段必须有默认值分支；禁止信任存档内数值：一律 isNonNegativeSafeInteger 等校验）。
4. 必跑：`tests/save/`（save-service、save-compat-e2e、save-regression-lock）+ 离线相关 `tests/offline/`。
5. 存档回归锁测试（save-regression-lock）覆盖的字段集合如有增删，在 PR 说明里点名。

## 3. 禁止事项

- 禁止把业务对象直接 JSON.stringify 进存档（必须经 GameSaveData 白名单字段）。
- 禁止 catch 存档错误后静默清档/新建档——fail-closed 是铁律。
- 禁止绕过 SaveService 直接读写 localStorage。
- 禁止用「清缓存重进」作为兼容方案写进用户指引。
- 事务性奖励（离线结算、广告双倍、晋升结果）必须有 exactly-once 锚点，先落盘后发奖。

## 4. SaveServiceV2 接线条件（目标态，独立开发任务）

backup/校验机制属于数据安全增强，接入前必须同时满足：

1. save-service-v2 全路径单测（primary 损坏→backup 恢复；verify 失败→restore；refuse 分支不写新档）；
2. 迁移在 V2 链路中的位置明确（validate 先于 migrate）；
3. save-compat-e2e 扩展 V2 场景；
4. 组合根切换为一次性 commit（禁止 V1/V2 混跑双写）。

在上述完成前，任何文档/实现不得声称"项目已有存档备份/校验和机制"——当前生产态是：**V1 fail-closed 单 key，无备份、无校验和**（如实表述）。
