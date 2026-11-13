# V7.0 存档兼容性报告（TASK-060~063）

## 1. 历史格式覆盖（真实存在的历史 Schema）

| 版本格式 | 覆盖方式 | 结果 |
|---|---|---|
| v13（V5.x 时代，无 V6.x 字段） | tests/save/save-compat-e2e.test.ts 基线 + **真实引擎启动验证**（本机 v13 档 + 当前 Cocos bundle） | **PASS**：迁移成功（老友归来补录流程出现、职级/境界保留「小组骨干·筑基初期」、无崩溃、无错误屏） |
| v14/v15（V6.x，含 v63AutoBattle/v64Equipment/v64Retention） | tests/save/* + 服务层单测（旧档加载字段默认值） | **PASS**（169 文件全绿，多轮） |
| 当前 v15 + 本轮新增字段 | normalizeV64Equipment/normalizeV64Retention（877fcb5 保护提交补齐） | **PASS** |

真实启动证据：`ai/reports/v70/v70-oldsave-boot.json` + `screenshots/oldsave/oldsave-boot.png`。

## 2. 存档文件格式（实测核实）

- 磁盘格式：`<XIUXIAN_USER_DATA>/xiuxian-save/save.json` = `{ "game-save": "<JSON 字符串>" }`
  （ElectronStorageAdapter 以顶层键缓存）。backup.json 同目录，原子写（temp→校验→替换）。
- 本轮发现并修正：构造测试档必须使用包装格式；裸 JSON 会被当作无档
  （自动按新玩家处理，不会崩溃 —— 失败安全）。

## 3. 异常存档（TASK-061）

| 场景 | 行为 | 依据 |
|---|---|---|
| 空存档/无档 | NO_SAVE → 新玩家创建流程 | adapter loadResult |
| 缺失字段 | migrate() 补安全默认（逐字段） | save-service 单测 |
| 损坏 JSON | LOAD_FAILED → fail-closed，**不覆盖旧档**（F01/F10 机制，V5.9 引入） | save-service/storage-adapter 单测 |
| saveVersion 超前 | 拒绝并 fail-closed | migrate 行 110 |
| 极大数值 | isFiniteNumber/isNonNegativeSafeInteger 过滤 | normalize 系列 |
| 未知/旧字段 | 白名单式重建对象，不透传 | migrate() |
| 裸格式 save.json | 视为无档（新玩家），不崩溃 | 本轮实测（卡牌 E2E 排障过程） |

## 4. 奖励幂等（TASK-062）

| 奖励源 | 幂等机制 | 测试 |
|---|---|---|
| 自动战斗奖励 | 状态机内一次性结算（击杀时） | 单测 |
| 离线收益 | settlementId 防重复 + OFFLINE_MAX_SECONDS 封顶 | 单测（含创建期零结算，本轮新增） |
| 每日目标 | claimDailyGoal 重复领取拒绝 | 单测（v64-service） |
| 七日目标 | sevenDayClaimed 记录 | 单测 |
| 成就 | claimedAchievementIds 去重 | 单测 |
| 卡牌奖励 | claimBattleCardReward(null=放弃) 幂等 | 引擎单测 |
| 创建期 | 门控期间零收益（本轮 P0-1） | 本轮 4 项新单测 |

## 5. 快速操作（TASK-063）

- 连续点击：tapAttack/技能按钮为幂等动作（冷却/状态校验在服务层），实测连点无异常。
- 升级/升星连点：灵石/碎片不足时服务层拒绝（单测覆盖）。
- 退出保存：main.cjs F05 close 拦截 → 渲染层 flush → 2 秒超时强关；autosave 60s。
- 页面切换结算：权威状态在服务层，UI 刷新不产生二次结算（舞台常驻改造后 tick 局部更新）。
