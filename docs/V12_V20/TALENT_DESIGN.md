# 天赋五路线系统设计（TALENT_DESIGN）

> 技能：`rpg`（天赋树/点数经济）、`save-systems`（派生式状态）。与 REALM_DESIGN 同架构（派生式）。

## 1. 架构（ADR）

- 节点等级持久化：`lifetimeStats['talentNode:<id>']` = 等级（0..maxRank）
- 点数账本：`lifetimeStats.talentSpent`；总量派生 = **careerLevel ×1 + 已通过渡劫门 ×2**（与境界系统联动——渡劫越多天赋点越多）
- 效果载体：BuffService（不持久化）→ **boot 时 applyAllActiveBuffs() 按节点等级重施**（派生式永久生效，与境界同模式）
- 新增 BuffType：NPC_FAVOR_BOOST（社交）/ CRAFT_SUCCESS_BOOST（修仙奇才）/ CRAFT_COST_REDUCTION（资源管理）——消费点：npc-weekend-service.change()、craft-service 成功率/成本

## 2. 五路线（configs/talent-tree.json，50 节点）

| 路线 | 载体 | 差异点 |
|---|---|---|
| 职场精英 | WORK_SALARY_BOOST / KPI_PROGRESS_BOOST | 工资与 KPI 进度双通道，+3~8%/级 |
| 摸鱼大师 | FISHING_MIND_BOOST / WORK_CULTIVATION_BOOST | 摸鱼道心恢复与摸鱼修为双修 |
| 修仙奇才 | WORK_CULTIVATION_BOOST / CRAFT_SUCCESS_BOOST | 修为效率与炼丹成功率 |
| 社交达人 | NPC_FAVOR_BOOST | 全 NPC 好感收益 +5~8%/级 |
| 资源管理大师 | MERGE_REWARD_BOOST / CRAFT_COST_REDUCTION | 合成收益与炼丹成本折扣（×0.96~0.97/级） |

节点模型：tier 1–5 链式前置（requires 上一节点 rank≥1）、maxRank 3、costPerRank 1–5（整路线满级 165 点 > 全期可得 ~56 点 → 必须取舍组合，任务书「不允许相同百分比换名称」：载体×数值×路线三重差异）。

## 3. 点数经济

- 可用 = 总量 − spent；总量 = careerLevel + 2×渡劫门数
- 上限参考：L20 + 9 门 = 38+18 = 56 点 → 最多满 1 条路线 + 部分第二路线 → **单精通 vs 均衡**的真实取舍
- 重置：整路线返还 50% 已花点数，移除该路线全部 buff

## 4. 交付面

Service（upgradeNode/resetRoute/applyAllActiveBuffs + 构造期校验）｜context 注册+boot 重施｜facade queryTalentTree/upgradeTalentNode/resetTalentRoute｜overlay MORE「天赋」页（五路线 tab/节点 rank 展示/升级按钮/重置）｜测试 7/7。

## 5. 待扩展

- 天赋专属事件（摸鱼大师降低被抓概率 → 事件资格权重联动，需 EventRuntimeAdapter 扩展）
- 晋升答辩评分加成（职场精英高阶节点 → submitDefense bonuses）
