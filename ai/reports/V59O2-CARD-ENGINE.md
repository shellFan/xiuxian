# V5.9-O.2 交付报告：回合制卡牌战斗引擎

生成时间：2026-11-06 ｜ 分支：`gameplay-v2` ｜ 起始 SHA：`7116dea`（origin/gameplay-v2）

## 结论

`CARD_ENGINE=COMPLETE`（P0 引擎 + 桥接 + 旧 tick 隔离 + 存档迁移全部落地并有测试背书）。

## 关键提交

| 提交 | 内容 |
|---|---|
| `d6ea0b2` | 确定性回合制卡牌引擎（状态机/RNG/效果/抽弃牌/奖励）+ 21 项引擎测试 |
| `a00420d` | 服务桥接（敌人生成/Boss 回合化/奖励/迁移）+ facade 命令 + 10 个旧战斗测试文件迁移 |
| `12f02fb` | desktop 卡牌 UI（手牌/能量/意图/奖励/卡组页/引导）+ 24 项 DOM 测试 |
| `b3a60a5` | 晋升门禁持久化 + 签到时区修复 + 战斗平衡校准（模拟器驱动） |

## 架构（单一权威状态）

```text
desktop/ui-overlay.js + ui-battle-card.js（渲染/命令转发，零数值改写）
  └─ GameFacade.playBattleCard / endBattleTurn / claimBattleCardReward / queryBattleCard
       └─ BattleService（run.mode='CARD'，run.card 为权威 CardBattleState）
            └─ CardBattleService（世界桥接：Build/装备/疲劳/职业/宗门/命格聚合、
                波次生成、Boss 机制回合化、奖励池、存档迁移）
                 └─ card-engine.ts（纯状态机；CardRng 可序列化种子随机）
                      └─ assets/configs/v59o/card-battle.json（数据驱动卡牌表）
```

- 阶段状态机：`NOT_STARTED→BATTLE_START→PLAYER_TURN_START→PLAYER_TURN→ENEMY_TURN→TURN_SETTLEMENT→…`；胜利 `VICTORY_SETTLED→REWARD_SELECTION→FINISHED`，失败 `DEFEAT_SETTLED→FINISHED`。
- 旧 tick 自动攻击隔离：`game-loop-service.ts:104` 调用保留，但 `BattleService.tick()` 在 CARD 模式直接返回（零伤害/零行动），伤害只发生在 `playBattleCard/endBattleTurn`。
- 旧 tick 存档迁移：`storedRun()` 检测无 card 字段的 FIGHTING 旧档 → 按放弃结算（掉落 30%）+ 存档，绝不伪造进行中战斗。

## 卡牌系统

- **数据驱动**：`assets/configs/v59o/card-battle.json` —— 基础攻击/防御、四职业专属、六命格专属、技能/特殊（消耗/保留/状态牌/诅咒牌）、升级链（+1/+2 由加载器生成）。
- **初始卡组**：5 攻击 + 4 防御 + 1 职业卡 + 1 命格卡（§14）。开局抽 5、每回合 3 能量、回合抽 5、手牌上限 10。
- **效果引擎**：DAMAGE（倍率/穿透/AOE）、BLOCK、HEAL、DRAW、ENERGY、APPLY_STATUS（力量/虚弱/易伤/闪避/失明/中毒/回气/降费/虚境）、REMOVE_STATUS、DISCARD_HAND、ADD_CARD_TO_HAND、CONDITIONAL。
- **确定性**：splitmix32 计数器 RNG（state={seed,counter} 进存档）；同 seed 全序列可复现（测试验证）。
- **幂等**：actionId 去重（双击/重复回调零二次结算）；奖励 claimed 标记持久化后才允许 UI 确认。

## 敌人回合与 Boss（§21/§22）

- 意图系统：攻击（数值可见）/攻击+削弱/防御/强化/削弱/召唤/特殊行动；玩家回合开始前可见（UI 渲染）。
- Boss 机制秒→回合换算（`secondsToTurns`，2s≈1 回合）：SUMMON/RAGE/ENRAGE/LOCK_SKILL（死锁诅咒入手牌）/ATTACK_SPEED_DEBUFF（虚弱转译）/HP_DRAIN/PROMOTE_MINION/DODGE/BLIND（+精神内耗状态牌）/RANDOM；Phase2 HP 阈值触发；REVIVE/LINKED 复活钩子（伪死不计杀不给经验）。
- 预警：触发前 1 回合写入战斗日志（⚠️）。

## 战斗奖励与卡组成长（§26~§28）

- 胜利：3 候选（职业池 70% 保底 + 稀有度加权 62/28/10）+ 放弃；领取入 `player.cardCollection`（幂等）。
- 升级：灵石消耗（BASIC 20/COMMON 30/RARE 60/EPIC 100），+1/+2 链，真实生效（下次开局使用升级版实例）。
- 卡组页：项目页展示卡组构成/费用/稀有度/升级按钮。

## 存档（§39/§40）

- `activeBattleRun.card`（cardVersion=1）全量持久化：牌堆顺序（数组序）、手牌、能量、状态、敌人意图、rng、奖励、uidCounter。
- 恢复校验 `isCardBattleState`；损坏即安全清除，绝不复活假战斗。
- 测试覆盖：出牌后保存 → 重启 → 手牌/能量/回合/牌堆/敌人/随机计数器全一致，且可继续出牌。

## 测试

| 套件 | 结果 |
|---|---|
| tests/v59o/card-engine.test.ts | 21/21 |
| tests/v59o/card-battle-service.test.ts | 9/9 |
| tests/v59o/card-ui-dom.test.ts（Electron DOM） | 24/24 |
| tests/v59o/progression-hardening.test.ts | 4/4 |
| 全量 `npm test` | **164 个测试文件全部通过，exit 0** |

## 未完成问题

- 无 P0 遗留。技能获得（升级三选一）当前只改属性快照，不直接生成卡牌（卡牌成长走战后奖励），属后续增强（P2）。
