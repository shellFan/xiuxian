# V5.8 — 结算一致性 · 装备词条联动 · 装备合法性 · 真实履历

日期：2026-10-08
角色：实现工程师（ZCode）。本轮不涉及竞品研究，不扩展产品范围。
分支：`gameplay-v2`，基线 HEAD `b51d30300b7b09e6c284d5bfef8a596313903035`

---

## 0. 最终判定

**READY FOR INDEPENDENT QA**

（依据 §6 验收矩阵：全量 138 测试文件 exit=0；真实 EXE 新玩家走查 + 两次重启存档一致；上一轮独立 QA 的 F06/F10 HIGH 项已在本轮复核确认修复在位。不允许宣称 RELEASE CERTIFIED。）

## 1. 本轮发现的真实缺陷与修复

| # | 级别 | 缺陷（源码审计证据） | 修复 |
|---|------|----------------------|------|
| 1 | **P0/HIGH** | `task-service.claimTask` 走 `economy.applyIdleSalary` 发任务工资，但从不调用 `gameDay.addIncome('salary')` —— 任务工资不进首页"今日已赚"、不进日结算（`assets/scripts/services/task-service.ts:241`）。 | `claimTask` 成功路径同步 `gameDay.addIncome('salary', rewardSalary)`，并把 `gameDay.income` 快照纳入失败回滚（task-service.ts）。 |
| 2 | **P0/HIGH** | 统一效果通道 `EffectService.apply`（任务/事件/日常/成就/合成奖励共用）只改 player 字段，不记当日账本 —— 事件奖励工资在日结算中蒸发（`assets/scripts/services/effect-service.ts:9-27`）。 | `apply()` 提交后把正向 salary/cultivation/performance 增量记入 `gameDay.addIncome`（负向 delta 不入账，"支出不是已赚"）。一处修复覆盖全部 5 个调用方（career-event/daily-task/achievement/craft）。 |
| 3 | **P1/HIGH** | 22 个职业专属词条（`skillTagMul`，如"JVM技能+8%"）在 `equipment-content.json` 与 `AffixEffects` 中声明，但从未被 `applyModifiers` 或战斗聚合消费；技能无 tags 字段 —— 装备与 Build 的"联动"是死数据（loot-service.ts:24 声明、全库无消费点）。 | `battle-merge.ts` 新增 `skillTagOf()` 流派 tag 映射（22 tag → 84 技能全覆盖，升级/进化同 tag）；`applyModifiers` 聚合 `skillTagMuls`；`BattleService.stepOnce` 按 run 技能池命中率消费词条增伤（`tagMul = 1 + Σ词条×命中/池大小`，per-run 缓存，start 时失效）。 |
| 4 | **P1/MEDIUM** | `equipItem` 对"未知装备/未持有/槽位不符"返回同一个 false，原因不可观测；损坏档可能出现"已装备但未持有"的幽灵槽位且永不自愈（v2-item-service.ts:256）。 | `equipItem` 三类拒绝原因分流并广播 `rejected` 事件；新增 `sanitizeEquipped()` 自愈（读取路径 `queryEquippedEquipment` 接入：清理显式、告警日志、回写存档），幽灵槽不静默保留也不静默丢失。 |
| 5 | **P1/MEDIUM** | 战斗结算弹窗只显示掉落清单，玩家无法解释"为什么这局打得快/慢"（职业专精、词条、Build 来源全部不可见）。 | `queryBattleSummary` 增加 `buildName/professionName/affixSummary`（每个词条 → 实际命中的 run 技能数）；结算弹窗新增"本局阵容 + 词条命中"区块（ui-overlay.js）。 |
| 6 | **P2/LOW** | `dailyReality`（今日动态）只有任务/剧情/项目延期写入；战斗结局与掉落不进履历，"牛马修仙日"叙事缺失主战斗线。 | `BattleService.claimRewards` 将真实结局（交付/受挫/复盘）+ 击杀数 + 装备掉落中文名写入 `dailyReality`（battle-service.ts，失败不阻塞结算）。 |
| 7 | **P1/HIGH（回归修复）** | 上一 commit e6a320f 的"新玩家欢迎门"误伤旧档：`showWelcomeBackPopup` 对无 `profession` 字段的存档一律跳过 —— 有 pendingEvents/incidents 的回归玩家（desktop-overlay-dom 测试场景）收不到欢迎简报，`#WelcomeContinueBtn` 超时，**全量测试 exit=1**。 | 改为"有真实历史"判断：profession 或 pendingEvents 或 incidents 或 assignedTasks 或 dayIndex>1，任一存在即视为回归玩家（ui-overlay.js:777）。 |

## 2. 修改文件清单（8 业务文件 + 1 测试）

```
assets/scripts/services/effect-service.ts   +8   P0 统一效果通道入当日账本
assets/scripts/services/task-service.ts     +6   P0 任务工资入账 + 回滚覆盖账本
assets/scripts/v57/battle-merge.ts          +38  P1 skillTagOf 22 流派 tag 映射
assets/scripts/v57/loot-service.ts          +36  P1 词条聚合 + 对比视图联动说明 + skillCountWithTag
assets/scripts/v3/battle-service.ts         +53  P1 词条增伤消费 + P2 dailyReality + 缓存
assets/scripts/v2/v2-item-service.ts        +34  P1b equipItem 校验 + sanitizeEquipped
assets/scripts/facade/game-facade.ts        +36  P1b 自愈接线 + P1c battleSummary 可解释化
desktop/ui-overlay.js                       +29  welcome 回归修复 + 结算弹窗词条区块
tests/v58/settlement-affix-consistency.test.ts  新增 7 项回归测试
```

## 3. 关键设计决策（为什么这样做）

1. **账本一致性修在权威路径，不在 UI 缝合。** 首页"今日已赚"读 `gameDay.income`，日结算读同一来源。修 `EffectService`（5 个调用方共享）+ `claimTask` 两个入账点后，三个页面天然一致，无 UI 假数据。
2. **词条联动用派生 tag，不改 84 条技能配置。** `skillTagOf()` 按 id 前缀派生（升级 v2/进化沿用 base 的 tag），零内容迁移成本，配置即代码。
3. **词条口径 = 池命中率加权。** 携带 tag 的技能占 run 技能池比例 × 词条增幅之和。避免"装一件 JVM 书 = 全部技能 +8%"的失控，也让"多拿同流派技能"有真实收益 → Build 决策权交还玩家。
4. **幽灵装备自愈放在读取路径**（`queryEquippedEquipment`），不修 SaveService 迁移层：migrate 保持"只归一化不语义修复"的单一职责，自愈是显式业务行为（告警日志 + 回写），不静默。
5. **复用现有系统，零新建服务。** 本轮 0 个新 service、0 张新存档表；`skillTagMuls` 复用 `EquipmentBattleStats` 聚合管道，`dailyReality` 复用 `messenger.appendReality`。

## 4. 存档兼容性

- 无 schema 变更（saveVersion 仍为 13），无字段新增/删除/改名 → 旧档无损加载。
- `normalizeEquippedEquipment` 迁移守卫在位（C13 测试继续通过）：非法槽位加载时清 null，读取路径再补自愈。
- 新玩家路径不变：职业选择 → 初始键盘（`initialEquipment`）→ 装备工作正常（f02 走查证据）。
- `dailyReality` 新条目 kind 复用现有 `INCIDENT` 枚举，迁移过滤器（isDailyRealityEntry）无需变更。

## 5. 测试与验证

### 5.1 单元/集成回归（全量）
```
npm test → exit=0，Executed 138 test files（含新增 settlement-affix-consistency 7 项）
```
新增测试覆盖：EffectService 入账（正向 3 类 + 负向不入账）、claimTask 账本一致 + 回滚、skillTagOf 映射（7 代表 tag + 无 tag 兜底）、equipItem 三类拒绝 + 授权后成功、sanitizeEquipped 幽灵清理、**词条增伤端到端**（同 seed 两局对比，boosted > plain）、战斗结局入 dailyReality。

### 5.2 真实 EXE 走查（CDP 独立取证，新玩家流）
产物：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
- SHA256(EXE)：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- SHA256(app.asar)：`0e05fd7253fbaca435caf959a680bfe4f4ed6e12803a001f885a29ef3717fab0`
- build manifest gitHead：`b51d303`（基线）+ 本轮未提交修改，构建时间 2026-10-08T07:49Z

证据文件：`ai/qa-final/evidence/v58-play-evidence.json`、`v58-claim-evidence.json`、`v58-play-boot.log`；截图 `ai/qa-final/shots/v58-*.png`（5 张）。

走查步序与结果：

| 步骤 | 结果 | 证据 |
|---|---|---|
| 新玩家首启 → NOW 目标"选择你的牛马道途" | PASS（6 职业、goal 文案正确） | f01 |
| 选择 JAVA_BACKEND → 初始键盘自动穿戴 | PASS（owned=[eq_mech_keyboard]） | f02 |
| 接任务 → 完成领奖 → salary/账本同步 +10 | PASS（ledgerDelta===salaryDelta===rewardSalary） | claim s1 |
| 装备 JVM 词条书（eq_jvm_tome）→ 战斗 | PASS（伤害 32，词条命中 2 技能） | f04 |
| 结算可解释化（Build=JVM调优流 / 职业=代码剑修 / 词条明细） | PASS（字段+弹窗区块） | f04 |
| 战斗受挫入 dailyReality（"⚔ 项目受挫：1 击杀"） | PASS | f05 |
| 重启 1 → 职业/装备/账本/履历完整存活 | PASS（ledgerSalary=10 保持） | s2 |
| 重启 2 → 与重启 1 状态逐字段一致 | PASS（JSON 相等） | s3 |
| 两次优雅关闭（close flush） | PASS（graceful:true ×2） | close1/close3 |
| verdict 汇总 | `{claimConsistent:true, restart1EqualsRestart2:true, ledgerSurvivedRestart:true, closesGraceful:true}` | v58-claim-evidence.json |

### 5.3 Release Gate 回归确认（无回归）
- fail-closed：`markFailClosed` → `doPersist` 三重守卫链路在位（cocos-bootstrap-component.ts:157/172、electron-storage-adapter.ts:179-185）；corrupt-matrix C01-C20 全过。
- close flush：本轮两次真实 EXE 优雅关闭验证；F10"fail-closed 后不重写"守卫未被触碰。
- 自然战败/主动放弃结果页：battle defeat/abandon 终局测试继续通过；本轮在 claimRewards 增加的 reality 写入包在 try/catch 中，不阻塞结算。
- exactly once：`rewardsClaimed` 幂等守卫未改动；新增入账位于守卫之后。
- 用户存档保护：走查前整体快照，走查后 SHA256 一致恢复（701b56c1…）。

## 6. 验收矩阵

| Gate | 结果 |
|---|---|
| TypeScript 编译（tsconfig.game） | PASS |
| 全量测试 138 文件 | PASS（exit=0） |
| 新增回归 7 项 | PASS |
| fresh PC 构建（web-desktop → pack:portable） | PASS |
| 真实 EXE 新玩家闭环（职业→任务→奖励→战斗→词条→结算→履历） | PASS |
| 两次重启存档一致 | PASS |
| close flush / fail-closed / 幂等 / 装备丢失 / 任务奖励丢失 | PASS（无回归） |
| UI 假按钮 / 无来源数据 | 无新增（本轮修复的入账口径消除了"今日已赚"与任务奖励的不一致源） |

## 7. 剩余风险与未验证项

| 项 | 级别 | 说明 |
|---|---|---|
| F06/F10 复核为"代码在位"，未按独立 QA 字面口径重新取证 | MEDIUM | 上一轮（96b6ad9 报告）两项 HIGH 的修复代码本轮确认存在且测试通过，但"mentor 实际耗时毫秒级测量"与"嵌套损坏字节级零写入"需独立 QA 复验。 |
| 词条增伤的平衡性 | LOW | 22 词条当前最大 +8%/词条、池加权后实际增益 ≤8%；未做长线数值模拟，建议 QA 抽样对比同 Build 战斗时长。 |
| `queryBattleSummary` 的 affixSummary 在低频路径每次 map 全装备库 | LOW | 装备库 ≤110 条且仅在结算弹窗调用一次，无热路径影响；如需可加缓存。 |
| firstWeekStory 期间的 dailyReality 密度 | LOW | 首周剧情 + 战斗履历同写 dailyReality，UI 上限 40 条（迁移层 slice），无溢出风险但展示密度未做玩家测试。 |
| 走查 f03 首次失败为脚本缺陷 | — | `advanceDevTime` 不影响任务计时（TaskService 走基准时钟）；已改用 startedAt 回拨 fixture 复验，真实玩家按 16× 时钟正常流逝。 |

## 8. 延后到 V5.9（本轮明确不做）

- NPC 记忆驱动的后续事件分支（assistChance 消费点扩展到事故作证/跨职业求助的实际触发链）。
- 装备词条升级/重铸（词条当前为固定值，无养成线）。
- 四职业专属装备专属 Boss 机制差异化（已有 22 怪物池 + 机制引擎，策略文案需一轮产品打磨）。
- AIGC 叙事扩展架构（保持离线预设完整可玩为前提，另行立项）。

## 9. SHA 与提交

| 项 | 值 |
|---|---|
| Base SHA | b51d30300b7b09e6c284d5bfef8a596313903035 |
| Final SHA | （推送后回填，见 git log） |
| EXE SHA256 | e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1 |
| ASAR SHA256 | 0e05fd7253fbaca435caf959a680bfe4f4ed6e12803a001f885a29ef3717fab0 |
| 推送目标 | origin/gameplay-v2（分批提交，见下） |

## 10. 用户存档保护记录

- 走查前备份：`/tmp/v58-userdata-backup/`（save.json SHA `701b56c1e6819cf4…` + save.backup.json）。
- 走查使用隔离测试档（freshSave 后仅测试数据），结束后原档 SHA256 逐字节一致恢复。
- 未执行任何 stash/checkout/restore/reset；全程 HEAD 未变（b51d303），改动仅工作区。
