# 修仙 RPG 设计规范

> 路由：数值/成长/装备/功法/卡牌任务 → `rpg` / `card-game` 技能 + 本文件。
> 原则（rpg 技能）：**pacing 目标先于公式**——先定"玩家在第 N 天应该到什么强度"，再反推曲线；先测量，再调整。

## 1. 现状锚点（以代码为准）

| 系统 | 实现 | 数值源 | 测试 |
|---|---|---|---|
| 职场等级（V10.2 已扩到 20 级） | services/career-service.ts `CareerService`（`performance >= next.requiredExp`） | configs/career.json（`requiredExp`/`salaryMultiplier`/`cultivationMultiplier`/`realm`） | tests/career/ |
| 修为曲线节奏 | — | configs/progression.json（`kpiWorkSeconds`/`salaryPerHour`/`mindDrainPerHour`/`expectedMinutes`） | tests/cultivation/ |
| 修仙境界 | services/cultivation-service.ts | **现状**：境界名内嵌 career.json 每级 `realm` 字段（炼气一层→筑基…），是展示字段，**不是独立境界树**；若要独立境界系统需先立 ADR | tests/cultivation/（5 文件） |
| 晋升答辩 | services/promotion-service.ts（概率制）+ v2/v2-settlement-service.ts `PromotionV2Service`（三题全答，submitDefense） | configs/promotion.json（PPT符箓/数据大法/甩锅诀） | tests/promotion/、tests/v2/ |
| 功法 | v2/v2-item-service.ts `V2ItemService`（`TECHNIQUE_MAP`、`equipTechnique(slot 0|1|2)`）；工资乘子聚合在 services/work-service.ts `techniqueAggregates(mode)` | configs/v2/items（techniques） | tests/v2/ |
| 装备 | v64/equipment.ts（`EQUIP_DEFS`、`MAX_EQUIP_LEVEL=10`、`enhanceCost`、`dropEquipForStage`） | configs/v57/equipment-content.json | tests/v64/ |
| 卡牌战斗 | v59o/card-battle/（card-battle-service、card-engine、card-database、card-rng 种子洗牌、boss-mechanics-ultimate、boss-traits）；扩展 v63/auto-battle、v64/active-skills | configs/v59o/card-battle.json（卡组模板/能量规则） | tests/v59o/（5 文件） |
| 合成 | services/merge-service.ts + game/merge/merge-board.ts | configs/economy.json `mergeRewards:[10,20,40,80,160]` | tests/merge/ |
| 任务/成就 | services/task-service、daily-task-service、v3/assigned-task-service、achievement-service | configs/daily-tasks.json、achievements.json | tests/achievements/ 等 |

## 2. 数值修改标准流程（硬性）

1. **单一数值源**：数值只写在 `assets/configs/*.json`；`config-service.ts` 内的 fallback 数值（V10.2 职级扩展遗留，config-service.ts:341 起）必须与 JSON 同步改，改完在 PR 里注明两处已同步。
2. 改前用 `rpg` 技能写清楚 pacing 目标（多少天到多少级/多少战力）。
3. 改后必跑：`tsc -p tsconfig.game.json --noEmit` + 相关系统测试 + **平衡 Gate** `node tools/v58-balance-sim.cjs`（6 人格 × 5 周期 × 2 模式，SELF_PRESERVING 30/30 双闸门，见 docs/V10.2/ECONOMY_BALANCE.md）。
4. 数值变更落 `docs/V10.2/ECONOMY_BALANCE.md` 或 `ai/reports/V58-BALANCE-SIM.md` 相应记录，写入 SKILL_USAGE_LOG。
5. **禁止**：改 `CURRENT_SAVE_VERSION` 语义而不写迁移（见 SAVE_SYSTEM_GUIDELINES）；为数值 hotfix 绕过测试直接改生产代码内数字。

## 3. 属性与修正栈约定

- 乘子聚合统一走 service 聚合函数（如 work-service `techniqueAggregates`），新乘子源（宗门 sect.json、功法、装备、天赋 talent-service）加进聚合函数时保持**可枚举、可测试**，禁止在 View 层散乘。
- 装备词缀/评分公式改动参照 V10.1 一键推荐装备先例（评分函数 + 边界检查测试）。
- 卡牌效果遵循 card-game 技能「效果解释器」模式：新卡=数据条目（card-database）+ 解释器分支，禁止为单卡在战斗 service 里写特权 if。

## 4. 长期成长曲线

- `requiredExp` 曲线趋势（career.json）：0/300/1800/3900…（前快后慢，指数式）；20 级扩展时以 ×1.4/乘子 ×1.3 节奏设计（V10.2 先例，commit fb8a132）。
- 修为/工资/心魔三资源互相牵制（摸鱼 salaryMul 0.6 / cultivationMul 1.1 / mindPerHour 40，work-service.ts:43），新玩法改动不得打破「工作收益高但道心降、摸鱼修为快但工资低」的二元张力。
- 境界突破（晋升）是 P0 事务动画（ANIMATION-GUIDE），数值设计需与晋升答辩失败重试（IAA PROMOTION_RETRY，3 次/日）的节奏匹配。

## 5. 新系统设计模板

新 RPG 系统（如新天赋树）交付必须包含：

1. pacing 目标 + 与现有 20 级曲线的交点分析；
2. 配置 JSON（configs/ 新文件或扩展现有文件）+ config-validator 校验；
3. 服务实现 + game-events.ts 新事件 + facade 投影；
4. tests/ 新目录（至少：正常路径、边界、与存档兼容）；
5. 平衡模拟 Gate 通过记录；
6. 存档字段变更 → CURRENT_SAVE_VERSION +1 并过迁移白名单。
