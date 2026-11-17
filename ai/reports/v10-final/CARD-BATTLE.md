# V10.0 FINAL — 卡牌战斗报告（CARD-BATTLE / BOSS 合卷）

## 系统组成（真实运行时验证）

- 初始牌组 10 张（攻击/防御/职业牌）、每回合 3 能量、抽/弃/洗/保留/消耗、敌人意图、
  卡牌奖励、灵石升级、Build 流派选择（JVM调优流/Spring生态流/Java并发流 — 截图 08）。
- 体验层：悬停详情、选中放大、出牌飞行动画、费用反馈、连击演出、回合结束演出
  （ui-battle-card.js + ui-game-feel.js，V9.x 已建，本轮回归验证）。
- V10.1 增量（并行开发者，已进最终 bundle + 174 全量回归绿）：卡牌移除（净化，cardRemovals
  存档字段）、card-engine/database/service 扩展（+331 行）。

## 真实驱动验收

- EXE card-session：真实 CDP 点击完成「选 Build → 出牌 → 选敌 → 结束回合 → … → 奖励」
  80+ 步完整会话（harness manifest：card-battle-session steps=80）。
- 上轮 QA 独立复验：3/3 完整 Boss 战胜利、435 牌、100 回合（ai/reports/v10-qa/CARD-BATTLE.md）。
- 截图：09-card-hand（手牌+费用+敌人意图）、10-card-selection（目标选择）、
  08-boss-battle（5 波项目攻坚全景）。
- 11-card-result：奖励结算界面在 harness 会话中真实点击过（battleRewardPick），
  但 18 张静态截图集中未捕获到该瞬间（Lv1 新档 5 波战线较长）——如实标注 PARTIAL，
  其余 17 张全捕获。

## Boss 系统

- 五类机制（KPI 暴君周期增强/加班魔王疲劳压力/Bug 巨兽召唤/需求幻魔费用封锁/版本灾厄阶段循环）
  与 P2 阶段转换：服务层随 bundle 迁移验证（ASAR 标记 phase2Active ×14）。
- Boss 独立 sprite/登场动画：V6.6 资产链沿用（v10-qa ART-AUDIT PASS）。
