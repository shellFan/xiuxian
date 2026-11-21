# 修仙成长系统报告（CULTIVATION_SYSTEM）

> 以实际代码为准（2026-11-22 审计）。技能：`rpg`（境界 pacing）。

## 1. 现状架构

| 模块 | 实现 | 说明 |
|---|---|---|
| 修炼点击 | `cultivation-service.ts`（cultivate()，暴击 MAX_CRIT_CHANCE=0.6、连击、心境效率 getMindEfficiency） | 冷却 3s；事务化（失败回滚） |
| 离线修为 | `applyIdleExperience`（idle-service 联动） | 分段+封顶 |
| 境界名 | `career.json` 每级 `realm` 字段（炼气一层→筑基…展示字段） | **非独立境界树**（DECISION_LOG D-008） |
| 功法 | `v2/v2-item-service.ts`（TECHNIQUE_MAP、equipTechnique 槽 0/1/2）+ `configs/v2/items.json techniques`（五路线 WORK/FISH/CULTIVATE/SOCIAL/ADAPTIVE + 共鸣乘子） | 工资乘子聚合 `work-service techniqueAggregates` |
| 卡牌战斗 | `v59o/card-battle/`（card-engine/card-database/card-rng 种子/boss-mechanics-ultimate）+ v63 自动推关 + v64 主动技能 | tests/v59o/ |
| 合成 | `merge-service.ts` + `game/merge/` | mergeRewards [10,20,40,80,160] |

## 2. V11 状态

- 修炼结算链路健康（事务化 + income 账本 + eventChanged 驱动 UI）
- 功法五路线 V10.2 已实现（route 分类 + 共鸣乘子数值化 + 功法页徽章）
- 事件池新增 7 个摸鱼修仙事件（V11-F5）——修仙线与职场线的摸鱼侧耦合

## 3. 已知缺口（→BACKLOG）

| 缺口 | 说明 |
|---|---|
| **独立境界/突破系统** | 任务书§6.1/6.2 核心：炼气→渡劫十境、突破材料/成功率/失败代价、专属能力/事件/视觉。**BLOCKED-WIP**（需 CURRENT_SAVE_VERSION v16 迁移，save-service 在用户 WIP 中）。前置清单：SAVE_SYSTEM §4 + B1 |
| 天赋五路线 | 现状开局三选一单天赋（talent-service 45 行）。五路线/天赋点/等级/重置需存档字段（B2） |
| 功法升级/突破 | 功法现无等级成长（equip 即固定乘子）；升级消耗设计需 ADR |
| 暴击 RNG 注入 | gameplay-v2 分支 78115a0 的修复未合入（cultivation-service 属用户 WIP）——合入后修为断言测试可完全确定性 |
