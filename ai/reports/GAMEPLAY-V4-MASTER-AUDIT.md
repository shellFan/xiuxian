# GAMEPLAY V4 MASTER AUDIT — 《牛马修仙传》

> 生成时间：2026-09-21 凌晨（Overnight Productization / Alpha Productization）
> 分支：`gameplay-v2`（基线 `6cd2a7b` = origin/web-v1-playable，此后 28 个提交）
> 原则：以本地真实代码为准；已有成熟实现复用，PARTIAL 补齐，MISSING 实现，重复合并。

## 系统地图

| SYSTEM | FILES | CONFIG | SAVE | FACADE | UI | TESTS | RUNTIME | STATUS |
|---|---|---|---|---|---|---|---|---|
| GameClockV2（9-18 工作窗/午休/周末/夜班） | v2/v2-clock.ts | — | devTimeOffsetMs | queryGameClock/queryTimeUntilOffWork | 顶栏时钟 | work-today-time | ✅ | **DONE** |
| GameDayService（工作日生命周期/今日局势） | v2/game-day-service.ts | v2/daily-situations.json(42) | player.gameDay | queryGameDay/queryDailySituation | 顶栏局势 | phase1-core | ✅ | **DONE** |
| WorkTodayService（只读时间投影） | v3/work-today-service.ts | — | gameDay.durations | queryWorkToday | 中栏 WorkToday 卡 | work-today-* | ✅ | **DONE** |
| OvertimeService（显式加班会话） | v3/overtime-service.ts | — | overtimeStats + **V4: activeOvertimeSession** | queryOvertime/startVoluntaryOvertime/finishOvertime | WorkToday 卡 | overtime-* ×7 | ✅ | **DONE（V4 补持久化+发薪）** |
| V2Economy（四模式收益/局势流） | v2/v2-economy-service.ts | idle.json | remainders | queryIdleEfficiency 等 | 速率行 | wage-window-gate | ✅ | **DONE（V4 补工资入账）** |
| V2EventEngine（配置驱动/链/冷却/pending） | v2/event-engine.ts + v2-event-service.ts | v2/events.json(129) + v3/overtime-content.json(70) + **v3/workplace-content.json(46)** | eventFlags/eventChainState/pendingEvents | queryV2*/resolveV2Event/devForceEvent | V2 事件 Modal | phase2-events + v4-workplace | ✅ | **DONE（V4 扩 46 事件）** |
| NPC 关系/周末 | v2/npc-weekend-service.ts | —（TS 内置 6 NPC） | relationships/eventFlags | queryNpcViews/chooseWeekend | NPC 页/周末 Modal | phase4-npc | ✅ | **DONE（V4 加 mem: 记忆旗标）** |
| 日/周结算 | v2/v2-settlement-service.ts | promotion-titles.json | dailyHistory/weeklyHistory | settleDay/queryCanSettleDay | 下班结算 Modal | phase5-settlement | ✅ | **DONE（V4 增 V4 字段）** |
| PromotionV2（渡劫答辩） | v2/v2-settlement-service.ts | v2/promotion-titles.json | — | startPromotionDefense 等 | 渡劫页/Modal | phase5 | ✅ | **DONE** |
| 心魔 InnerDemon | v2/inner-demon-service.ts | — | innerDemon/activeDemons | queryInnerDemon | 心魔 chip | phase1 | ✅ | **DONE** |
| 物品 Craft（丹药/功法/法宝/材料） | v2/v2-item-service.ts + craft-service | v2/items.json + craft.json | materials/owned* | v2Craft 等 | 合成页 | phase3-items | ✅ | **DONE（无合成牛马残留）** |
| Evidence 证据 | v3/evidence-service.ts（V4 新增） | — | evidence[] | queryEvidence | 左栏证据袋+Modal | v4-workplace | ✅ | **DONE（V4 新建）** |
| Responsibility 责任/甩锅 | v3/responsibility-service.ts（V4 新增） | workplace-content.json 案件来源 | responsibilityCases[] | queryResponsibilityCases/acceptBlameCase/clearCaseWithEvidence | 结算行/事件内 | v4-workplace | ✅ | **DONE（V4 新建）** |
| Incident 生产事故 | v3/incident-service.ts（V4 新增） | workplace-content.json | incidents[] | queryIncidentState/mitigate/recover/completePostmortem | 事件+待办 | v4-workplace | ✅ | **DONE（V4 新建）** |
| TechnicalDebt 技术债 | v3/tech-debt-service.ts（V4 新建） | — | technicalDebt{} | queryTechDebt/repayTechDebt | 事件 effects | v4-workplace | ✅ | **DONE（V4 新建）** |
| AssignedTask 指派任务/假 P0 | v3/assigned-task-service.ts（V4 新建） | workplace-content.json | assignedTasks[] | queryAssignedTasks/complete/refuse | 右栏今日待办 | v4-workplace | ✅ | **DONE（V4 新建）** |
| Career 10 级 | career-service.ts | career.json（新 10 级 ✅） | careerLevel | queryCareer | 角色卡 | achievements 测试 | ✅ | **DONE（V4 清理旧称谓残留）** |
| Achievement | achievement-service.ts | achievements.json + overtime + **workplace(9)** | unlocked/claimed | queryAchievement* | 成就页 | achievement-service | ✅ | **DONE（V4 加 LIFETIME_STAT）** |
| Offline/挂机 | idle/offline-reward-service | idle.json | lastIdleSettlementId | claimOfflineReward 等 | 离线弹窗 | idle 测试 | ✅ | **DONE** |
| PC Home Dashboard | desktop/ui-overlay.js+css | — | — | 全量桥接 | **一屏 Dashboard** | pc-overlay-layout | ✅ 1280×720 无滚动实测 | **DONE（V4 重构）** |
| Electron 壳 | desktop/main.cjs | — | storage.cjs | — | — | — | ✅ | **DONE（V4: 1280×720/min1150×680）** |
| 项目/副本/战斗（Dungeon/Combat/Boss/Loot） | — | — | — | — | — | — | ❌ | **MISSING（见下方说明）** |
| Legacy Merge/Recruit/Board | game/merge-board, services | worker.json | workers(deprecated) | queryBoard(deprecated) | 无 | legacy 测试 | board=null | **LEGACY-ISOLATED（不进 Runtime）** |

## 关键结论

### DONE BEFORE（V3 及之前已有，本轮直接复用）
8 小时工作日/时钟/午休、周末系统、四工作模式、事件引擎+链+冷却、NPC 关系、
心魔、晋升答辩、日/周结算、材料/功法/装备/合成、成就、离线收益、存档迁移框架。

### COMPLETED TONIGHT（V4）
1. **工资记账收口**：普通工资/修为逐 tick 记入 `gameDay.income`（此前日报少记普通工资）；
   摸鱼工资沉淀为 `settlementInputs.paidFishingSalary`（此前 `recordSettlementInput` 零调用）。
2. **加班会话持久化**：`activeOvertimeSession` 随存档恢复，重启/重开不再"洗掉"进行中的加班；
   付费加班在 `finish()` 一次性发薪（1.5×，周末/补偿 2.0×），免费加班永远 0（有测试锁定）。
3. **Evidence / Responsibility / Incident / TechDebt / AssignedTask** 五个 V4 领域服务
   （assets/scripts/v3/），事件效果与门控全链打通（evidence 解锁选项、openCase、
   raiseIncident、assignTask、techDebt、startOvertime、lifetime）。
4. **47 个职场地狱事件**（6 条多阶段链）：甩锅反击链、抢功链、需求改单链、上线地狱链、
   事故复盘链、假/真 P0 对照链 + 老板/产品/测试/会议/NPC/周末/L7+ 管理层事件；
   23 个证据选项、22 个指派任务效果、8 个案件/事故效果、10+ 强硬选项。
5. **NPC 记忆**：`mem:<NPC>:<FLAG>` 旗标（BLAMED_PLAYER_SUCCEEDED / BLAME_FAILED /
   STOLE_CREDIT / PLAYER_HELPED），后续事件按记忆解锁不同选项。
6. **首页 PC Dashboard**：1280×720 一屏（顶栏/左角色/中核心/右待办），实测三个分辨率
   `scrollable=false`；子 Modal（时间线/购买力/全部待办/证据袋）内滚动。
7. **Electron**：默认 1280×720、min 1150×680。
8. **Career 称谓统一**：achievements/progression/i18n/ui-mock-data 中旧称谓清零。
9. **存档 v8**：新增 7 个 V4 字段 + 迁移/消毒（损坏 session 丢弃不信任）。
10. **引擎修复**：① events.json 44 处 `successChance` 对象（效果被静默丢弃）；
    ② 调度器 rng 盐恒定导致整天事件退化为单一 roll；③ 局势 eventWeights 从未接入 pick。
11. **平衡模拟修正**：模拟器现在按真实节奏即时处理事件（此前一天只结算 1 个事件）。

### STILL PARTIAL
- 事故复盘的 UI 呈现走通用事件 Modal（复盘链 `wp_incident_review_*` 是 3 阶段事件），
  没有独立的"复盘"场景页 —— 玩法成立，表现层复用。
- 周末"飞剑传书"内容目前 2 个周末事件（wp_weekend_boss_msg / wp_weekend_oncall）+
  周末四选一活动；尚未到"≥12 周末事件"的内容量目标。
- 晋升答辩的"受事件历史影响"只通过 promotionModifier/旗标部分接入。

### MISSING（本轮明确不做 / 记录在案）
- **Dungeon / Combat / Monster / Boss / Loot / Build**：仓库中完全没有战斗实现
  （审计 grep 零命中）。V4 优先级决策：先收口"职场地狱"主环（事件/责任/事故/结算），
  战斗竖切留待下一轮。当前"项目"概念以任务/事故/技术债形式存在于工作环中。
- Offline PendingDecision 的"逐个处理 4 件破事"欢迎页（pending 队列本身已工作）。

### REMOVED DUPLICATION / CLEANUP
- 无新建重复 Service（全部挂在 v3/ 命名空间下，复用 GameContext 装配）。
- `desktop/build/` 下的历史产物目录（web-desktop.phase8-precopy-* / runtime-probe-old）
  不在 git 跟踪内，未清理文件系统。

## 验收证据
- `npm run build:game`（tsc）✅
- `npm test`：101 个测试文件全绿（含 tests/v4/v4-workplace.test.ts 16 项回归）
- `npm run content:check` ✅（V2/V3/V4 三池 ID 唯一 + 内容量下限校验）
- Electron Runtime 截图：`ai/reports/screenshots/`（home-1280x720/1600x900/1920x1080/
  work/fishing/1755/free-overtime/blame-event/daily-settlement，均真实运行时数据，
  scrollable=false 实测记录在同目录 *.json）
