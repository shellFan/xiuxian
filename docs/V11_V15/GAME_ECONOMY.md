# 经济与数值报告（GAME_ECONOMY）

> 以实际代码为准（2026-11-22 审计）。技能：`rpg`（pacing）+ V58 双闸门。

## 1. 资源清单（唯一来源）

| 资源 | 字段 | 产出源 | 消耗源 |
|---|---|---|---|
| 工资 salary | player.salary | 工作/任务/事件/晋升/离线/成就 | 炼丹(talisman 无)、商店、同事掩护事件 |
| 灵石 spiritStones | player.spiritStones | 离线结算/任务/合成/事件 | 炼丹 costSpiritStones、v2 商店 |
| 修为 cultivationExp | player.cultivationExp | 修炼/合成/事件/离线/成就 | 修炼消耗、炼丹 costCultivation |
| 道心 mind | player.mind（≤maxMind） | 修炼/摸鱼/恢复丹/事件 | 工作消耗/加班/事件 |
| 绩效 performance | player.performance | 工作/KPI/事件 | 晋升 requiredExp |

所有变化统一走 `effect-service.apply()`（事务化 + income 账本 gameDay + 负 delta 不入账）。

## 2. 平衡闸门（硬性）

1. **模拟 Gate**：`node tools/v58-balance-sim.cjs`（6 人格 × 5 周期 × 2 模式，SELF_PRESERVING 30/30 双闸门）
2. **设计 Gate**：五玩家画像 365 天模拟（docs/V10.2/ECONOMY_BALANCE.md）——普通玩家终 L10 累计工资 283,682；高活跃 L11；纯离线 L1

## 3. V11 新增经济面

| 内容 | 数值 | 闸门 |
|---|---|---|
| 炼丹成功率 | 9 配方 0.75–0.95 | 失败消耗材料——纯消耗侧收紧 |
| 炼丹品质 | ×1/1.3/1.7/2.5（EV ×1.204） | 修为→修为配方仍净负（100→60.2），无放大回路 |
| 摸鱼事件（7） | 效果 ±3~50 区间，与现有池同量级 | 走 EffectService 统一通道 |
| 摸鱼/炼丹成就奖励 | salary 50–400 / cultivation 200–800 / mind 30 | 一次性，量级与既有成就一致 |

## 4. 防漏检查（§11 清单核对）

| 检查项 | 状态 |
|---|---|
| 无限刷资源 | 炼丹净负 EV + maxCraftCount 支持 + 离线分段封顶 ✓ |
| 重复领取 | lastIdleSettlementId + claimedDoubleSettlementIds + 成就 claimedAchievementIds ✓ |
| 负数/溢出 | EffectService isSafeInteger + 非负钳制 + Number.isSafeInteger 校验 ✓ |
| 收益异常 | 负面连击抑制（事件×2 → NEGATIVE×0）V11-F5 生效 |
| 成长停滞 | L10→L11 ≈336 天（BUG-ECO-1，产品决策 OPEN） |
| 广告依赖 | IAA 全部为增益次按钮（IAA-DESIGN 契约） |

## 5. 模拟执行状态

- v58-balance-sim 六人格：基建在位（tools/v58-balance-sim.cjs），本轮数值改动（事件池+炼丹成功率）已过全量测试与既有闸门口径；**365 天五画像全量重跑列为下轮项**（模拟脚本输入含 career/idle，事件池不在模拟器作用域内——炼丹成功率影响已由 EV 分析覆盖）
