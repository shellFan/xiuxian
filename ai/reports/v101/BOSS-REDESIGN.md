# V10.1 Boss 战重做（BOSS-REDESIGN）

目标：每个 Boss 有专属玩法，玩家必须改变打法；登场/阶段/击杀演出齐备。

## 一、V10.1 新增 5 大 Boss（v57/battle-extension.json）

| Boss | HP/攻 | 核心机制（回合化） | 玩法决策 |
|---|---|---|---|
| **KPI暴君** boss_kpi_tyrant | 880/15 | **JUDGE 绩效审判**（每 3 回合，1 回合蓄力预警）+ RAGE | 蓄力窗口内打出 ≥10% Boss 最大生命伤害 → **打断**（Boss 虚弱 2、无伤害）；否则 2.5 倍审判重击。玩家权衡：攒爆发打断 vs 稳健防御硬吃 |
| **加班魔王** boss_overtime_demon | 820/13 | **MORALE_DRAIN 加班磨蚀**（每 2-3 回合：玩家虚弱 +1、Boss 自愈 4% 最大生命）+ 减速 | 快攻止损 vs 稳健续航的抉择；拖延越久 Boss 越滚雪球 |
| **Bug巨兽** boss_bug_behemoth | 900/14 | **SUMMON**（每 2-3 回合召唤偶现Bug妖，上限 3，P2 缩短为每 2 回合）+ PROMOTE_MINION（升级小怪为 P0） | 优先清召唤物（断滋养）还是集火 Boss |
| **需求幻魔** boss_req_phantom | 760/13 | **COST_CURSE 需求费率上调**（每 3-4 回合：下一手手牌费用 +1，意图可见）+ RANDOM | 提前积攒能量/降费牌应对；能量管理成为核心决策 |
| **版本灾厄** boss_version_calamity | 960/16 | RAGE + LOCK_SKILL + **Phase 2「版本回滚风暴」**：攻击 ×1.4 且模式切换（双段连击 ↔ 1.5 倍重击交替） | Phase 2 后必须重新阅读意图、重排防御节奏 |

新增机制类型已并入 `BossMechanic` 联合类型（JUDGE/COST_CURSE/MORALE_DRAIN），秒→回合换算沿用 `secondsToTurns`（2 游戏秒 ≈ 1 回合）。

## 二、JUDGE 打断窗口实现

- 蓄力回合：`planIntent` 置 `telegraphed.JUDGE=true`，记录 `timers.judgeRefHp`（窗口起点 HP）与
  `timers.judgeNeed = ceil(maxHp × interruptHpPct)`（缺省 10%）。
- 执行回合：`runBossSpecial('JUDGE')` 比较 `judgeRefHp - hp`：
  - ≥ need → **打断成功**：Boss 虚弱 2 层、本回合无伤害，`lifetimeStats.bossJudgesInterrupted` 统计 +1；
  - < need → 绩效审判落下：经 `ctx.strikePlayer`（引擎提供的真实结算通道，走格挡/闪避/虚弱全链路）造成 2.5 倍攻击。
- UI：敌人意图区显示打断进度条（`ux-bc-judgewindow`），满额变绿提示"✦ 审判可打断！"。

## 三、既有 Boss 机制保持（不重建）

- 18 个既有 Boss 机制（SUMMON/RAGE/ENRAGE/LINKED/REVIVE/LOCK_SKILL/减速/吞噬/强化爪牙/闪避/致盲/RANDOM）全部保留。
- Phase 2（HP 阈值行为真实改变）保留；版本灾厄新增 P2 攻击模式切换。

## 四、登场/阶段/击杀演出

| 时机 | 演出 | 实现 |
|---|---|---|
| Boss 登场 | `bossWave`：全屏「⚔ Boss名 登场」横幅 + 重震屏 + 音效（1.6s 自动淡出，不阻塞输入） | `ui-game-feel.js showBossBanner`，`diffAndFeel` 波次推进 + BOSS 单位检测 |
| Phase 2 | 既有 `bossPhase2` 事件 + ⛔ P2 标签保留 | — |
| 软狂暴预警 | 战斗日志 + 首次触发横幅级提示「🔥 Boss 越来越暴躁了」 | `planIntent` T18 起软狂暴 |
| 击杀 | `kill`：目标消融粒子 + 闪白（`ux-gf-kill`） | `diffAndFeel` 敌人 hp→0 检测 |
| 审判打断 | 战斗日志「✦ 打断成功！」+ 进度条变绿 | — |

## 五、测试覆盖（tests/v101/card-v101.test.ts）

- JUDGE 打断成功（不命中玩家 + Boss 虚弱 + 窗口基准清除）
- JUDGE 未打断（2.5 倍审判命中）
- COST_CURSE 写入 pendingHandCostDelta（下一手费用 +1、消费后清零、只持续一手）
- MORALE_DRAIN（玩家虚弱 + Boss 自愈）
- 5 Boss 注册 + 机制齐备校验
- 版本灾厄 Phase2 定义存在
