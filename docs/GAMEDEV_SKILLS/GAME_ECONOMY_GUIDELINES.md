# 经济与成长数值规范

> 路由：经济/产出/消耗/广告变现数值 → `rpg` 技能（pacing 原则）+ 本文件。
> 上游无 "Game Economy" 独立技能（实测），本文件承担该职责，禁止编造技能名。

## 1. 数值唯一源

| 内容 | 文件 |
|---|---|
| 等级经验/工资乘子/境界名 | assets/configs/career.json |
| 每级节奏（KPI 时长/时薪/心魔/期望分钟） | assets/configs/progression.json |
| 合成产出 mergeRewards / cultivationRewards | assets/configs/economy.json |
| 晋升道具 | assets/configs/promotion.json |
| 宗门修正（salaryMultiplier/mindMultiplier/incidentRiskMultiplier…） | assets/configs/sect.json |
| KPI 配置 | assets/configs/kpi.json |
| 功法 | configs/v2/items（techniques） |
| 装备内容 | configs/v57/equipment-content.json |

代码内 fallback（config-service.ts:341 起的 V10.2 扩展）与 JSON 同步维护；两处不一致视为 BLOCKER。

## 2. 产出与消耗现状（改动前必读）

- 摸鱼模式：`salaryMul 0.6 / cultivationMul 1.1 / mindPerHour 40`（work-service.ts:43）；摸鱼消心魔（work-service.ts:208）。
- 工资结算 = 基础时薪（progression `salaryPerHour`）× 聚合乘子（work-service `techniqueAggregates`：功法+宗门+…）。
- 离线收益：idle-service `computeEligible`（时长分段+封顶，offline-time-segmenter 按日边界切段）+ offline-reward-service exactly-once（含广告双倍）。
- 合成产出：mergeRewards [10,20,40,80,160] / cultivationRewards [5,10,20,40,80]（economy.json）。

## 3. 平衡验证双闸门（硬性 Gate）

1. **模拟 Gate**：`node tools/v58-balance-sim.cjs` —— 6 人格 × 5 周期 × 2 模式，`SELF_PRESERVING 30/30` 双闸门（收入闸门+存续闸门）；报告落 `ai/reports/V58-BALANCE-SIM.md`。
2. **设计闸门**：五玩家画像（零氪/轻度/中度/重度/摸鱼流）365 天模拟无通胀、无死局（docs/V10.2/ECONOMY_BALANCE.md，commit 1c8351b）。

任何影响产出的 PR 必须附模拟结果；闸门不过不得合入。

## 4. IAA 经济位约束

- 广告位定义、频率上限、fallback 全部以 docs/IAA-DESIGN.md 为准（OFFLINE_DOUBLE / MIND_RECOVERY / PROMOTION_RETRY / EVENT_REROLL / WORK_BOOST / INSTANT_RECRUIT / AUTO_MERGE）。
- **上限是产品建议值，只有写入服务并持久化后才算生效**；界面 remaining 只读服务值，不得用隐藏按钮冒充限额。
- 主按钮永远是正常玩法（"收下/继续修炼/返回工位"）；广告永远是次按钮。
- 新增广告位前必须验证：幂等（重复回调不重复发奖，offline-reward-service.ts:98-109 先例）、失败 fallback、跨日重置。

## 5. 防通胀与防死局规则

1. 任何新增产出源必须同时回答：它替代/压缩了哪个旧产出？（复用平衡模拟人格验证）
2. 产出数值一律走"分段+封顶"模式（参照离线收益），禁止无上限累计。
3. 货币/资源只增不减的字段进入存档前必须做防重复领取锚点（`lastIdleSettlementId` 模式）。
4. 数值相关 bug 的修复必须补一个回归测试锁定（tests/ 对应目录）。
