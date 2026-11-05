# V5.9-O.2 实现地图（回合制卡牌战斗引擎）

生成时间：2026-11-05 ｜ 分支：`gameplay-v2` ｜ 基线 SHA：`7116dea`（origin/gameplay-v2）

## 0. 环境事实（本轮核实）

| 项 | 状态 | 证据 |
|---|---|---|
| 开发目录 | `D:\git\fan\xiuxian-gv2`（独立 worktree，分支 `gameplay-v2`） | 原 `D:\git\fan\xiuxian` 工作树有未提交修改，本轮不触碰 |
| Node | v22.22.2（`D:\git\fan\tools\node-v22.22.2-win-x64`）+ npm 10.9.7 | 本机无系统 Node，HBuilderX 内置 node 仅作应急 |
| TypeScript 基线 | `tsc -p tsconfig.game.json --noEmit` exit 0 | 2026-11-05 在 worktree 执行 |
| 全量测试基线 | `npm test` → 160 个测试文件全部通过 exit 0 | 同上 |
| Electron | `desktop/node_modules/electron/dist/electron.exe` 存在（主树复制） | O.1 的下载超时未在本机复现 |
| Cocos Creator | 3.8.4 安装于 `C:\ProgramData\cocos\editors\Creator\3.8.4\CocosCreator.exe` | 官方直链 `download.cocos.com/CocosCreator/v3.8.4/CocosCreator-v3.8.4-win-101001.zip` |
| git push | git 可达 GitHub（fetch exit 0） | curl 直连 github 超时，git 正常 |

## 1. 现状战斗调用链（真实源码核实）

```text
desktop/ui-overlay.js battleHtml() (1515-1607)
  └─ data-action="battleSkill"/"abandonBattle" (3803-3828)
       └─ GameFacade.castBattleSkill/abandonBattleRun (game-facade.ts 602-608/787)
            └─ BattleService.castSkill/tick/chooseSkill/abandon (v3/battle-service.ts)
                 └─ stepOnce() 355-431：玩家按 intervalSec 自动攻击 + 敌人 timer 攻击
GameLoopService.step() → context.battle.tick(seconds)  (game-loop-service.ts 104，唯一外部伤害注入点)
状态容器：context.player.activeBattleRun（unknown 类型，isBattleRunState 1318 + normalizeBattleRun save-service 726 双重校验）
波次：WAVES 5 波（3N/3N/2N+E/1E/1B），怪物/boss 来自 v3/battle-content.json + v57/battle-extension.json（mergeById 合并，battle-merge.ts）
Boss 机制：按秒计时（timers/everySec），10 种 mechanic + Phase2（battle-service 433-522）
奖励：claimRewards(run, defeated) 1030-1112，rewardsClaimed 幂等，失败 30% 折算，联动任务/事故/周目标/履历
```

**O.1 缺陷确认（本轮复核仍成立）**：无手牌、无能量、无回合、无主动出牌、玩家伤害唯一来源是 tick 自动攻击。

## 2. 目标架构

```text
┌ desktop/ui-overlay.js ── battle-screen/hand/card/intent/reward/status 模块（本轮拆分）
│     data-action: battlePlayCard / battleEndTurn / battleSelectCard / battleReward...
├─ GameFacade（新增出牌/结束回合/奖励命令，全部走 saveService）
├─ BattleService（保持 current/finished/canStart/start/abandon/dismissFinished 兼容语义）
│     └─ 委托 ↓
├─ v59o/card-battle/CardBattleService（桥接层：世界属性聚合、敌人生成、奖励发放、持久化）
│     ├─ card-engine.ts   纯函数状态机：阶段/出牌/结束回合/敌人回合/抽弃牌/能量/状态效果
│     ├─ card-database.ts 卡牌定义加载（JSON 数据驱动）
│     └─ card-rng.ts      可保存恢复的种子化 RNG（mulberry32 + counter）
└─ 存档：player.activeBattleRun 新增 card 状态（cardBattle: {...}, cardBattleVersion: 1）
     旧 tick 存档迁移：FIGHTING 且无 card 字段 → 安全结算（按已有 loot 30% 发放）后清除
```

### 关键决策

1. **单一权威状态**：卡牌战斗全部状态在 `CardBattleState`，持久化于 `activeBattleRun.card`；旧字段（hp/enemies/wave）保留镜像供 goal-director/home-service 等只读消费。
2. **旧 tick 隔离**：`game-loop-service.ts:104` 调用保留，但 `BattleService.tick()` 在卡牌战斗中不再产生任何伤害/行动；伤害与敌人行动只发生在 `endPlayerTurn()` 同步结算的敌人回合。
3. **复用而非重建**：波次、怪物、Boss 名录、掉落、Build、装备聚合、疲劳、夜间加成全部复用；Boss 机制秒→回合换算（2s≈1回合，everySec/2 取整为回合间隔，持续秒→持续回合）。
4. **卡牌=技能载体**：基础卡组 5 攻击 + 4 防御 + 1 职业；升级三选一继续产出技能，技能同时转化为卡牌加入卡组；奖励选卡进入 `player.cardCollection` 跨战斗生效。
5. **确定性**：开局生成 seed，全部关键结算走 card-rng；seed+counter 进存档，可回放。
6. **状态机**（§10 令）：`NOT_STARTED→BATTLE_START→PLAYER_TURN_START→PLAYER_TURN→ENEMY_TURN→TURN_SETTLEMENT→PLAYER_TURN_START`；`PLAYER_TURN` 内子动作 `PLAY_CARD/SELECT_TARGET/END_TURN`；胜利走 `REWARD_SELECTION→FINISHED`，失败直接 `FINISHED`。所有非法跳转抛 `CardBattleError`。

### 状态机防重/幂等

- 出牌：phase 校验→手牌校验→能量校验→目标校验→执行（先扣费后结算，失败回滚为整体拒绝，无半次出牌）。
- actionId 去重：每个 run 维护 `lastActionId`，重复 actionId 直接忽略。
- 结束回合：仅 PLAYER_TURN 可触发，ENEMY_TURN 期间再入被拒。
- 奖励：`cardReward.pending` + `cardReward.claimed` 幂等标记，持久化后才允许 UI 确认。

## 3. 修改面（allowedPaths）

| 文件 | 动作 |
|---|---|
| `assets/scripts/v59o/**`（新建） | card-types / card-rng / card-database / card-engine / card-battle-service |
| `assets/configs/v59o/card-battle.json`（新建） | 数据驱动卡牌表 |
| `assets/scripts/v3/battle-service.ts` | 委托卡牌引擎；tick 停止伤害；桥接奖励/存档迁移 |
| `assets/scripts/facade/game-facade.ts` | 新增 playBattleCard/endBattleTurn/claimBattleCardReward 等 |
| `assets/scripts/services/save-service.ts` | card 状态校验/迁移 |
| `assets/scripts/model/player-data.ts` + `save-data.ts` | cardCollection 字段 |
| `desktop/ui-overlay.js` + 新模块 `desktop/ui-battle-card.js` | 卡牌 UI |
| `game-loop-service.ts` | 注释更新（调用保留，行为变维护性 no-op） |
| `tests/v59o/**` 新增；`tests/v3/battle-*.test.ts` 等迁移 | 测试 |

## 4. 执行顺序（P0→P2）

1. card-rng → card-types → card-database（JSON）→ card-engine（纯状态机）+ 引擎单测。
2. CardBattleService 桥接（属性/敌人/奖励/存档）+ BattleService 改造 + tick 隔离。
3. 旧战斗测试迁移（v3/v4 断言从 tick 语义改为卡牌语义）。
4. Facade 命令 + desktop 卡牌 UI（拆分模块）。
5. Boss 机制回合化、四职业卡组、宗门/命格联动。
6. 战斗模拟（100 普通/50 精英/30 Boss/4×30 职业）+ 30/100 日长周期。
7. 历史缺陷修复（晋升门禁/每日任务/签到/自由职业）。
8. EXE 构建（Cocos web build → desktop 打包）+ 隔离存档 E2E + 20min soak。
9. 新手引导、动画反馈。
10. 报告 ×5 + 阶段性提交推送。
