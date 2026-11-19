# V10.1 经济系统（GAME_ECONOMY）

> 数据源：economy.json / idle.json / v64 配置 / 本轮实测（ad-wiring-probe 数值断言）

## 1. 货币体系

| 货币 | 获取 | 消耗 | 存档字段 |
|---|---|---|---|
| 工资 ¥ | 工作 tick / 离线托管 / 日报结算 | 消耗品购买 | salary |
| 灵石 💎 | 小 Boss +2/关、宝箱、章节 Boss +40~66、离线灵石 | 招募 50×slot²、点击升级 20×lv²、卡牌净化/奖励替换 | spiritStones |
| 修为 | 修炼点击（+5/3s）、FISHING ×1.1、离线 | 境界成长（当前=晋升需求） | cultivationExp |
| 装备碎片 🔩 | 拆解/活动 | 强化 enhanceCost(level)、升星 | v64Equipment.fragments |

## 2. 关键公式（实测校验）

- 招募：`50 × slot²`（本轮浏览器实测：小队 1→2 精确 -50）
- 点击升级：`20 × lv²`（实测：10→23 两级精确 -20）
- 敌人 HP：`50 × 1.13^(n-1)`；普通关 2.8-8.8s、小 Boss 10-23s、章节 Boss 卡牌 82-238s
- 离线：`maxOfflineSeconds=28800`（8h 封顶）；salaryPerHour [10,20,40,80,160,320]（按职级档）；时段切分夜间工资=0（设计行为）
- 装备评分（V10.1 新增推荐口径）：`atk×(1+critRate×critMult)×2 + hp`

## 3. 广告经济（IAA）

| Placement | 触发 | 奖励 | 防重 |
|---|---|---|---|
| OFFLINE_DOUBLE | 离线简报「📺 看广告×2」（本轮接通） | 基础收益 ×2（工资/修为/灵石各 ×2） | isSettled + double 集合 + in-flight 锁 |
| MIND_RECOVERY | 心神恢复 | +50 心神 | RewardService callbackFired |
| PROMOTION_RETRY | 晋升失败重试 | 答辩重试机会 | promotionGuaranteed |
| EVENT_REROLL / WORK_BOOST / AUTO_MERGE / INSTANT_RECRUIT | 各场景 | 按场景 | policy 频控 |

- 频控（reward-ad-policy）：10 次/日、20 次/时、60s 间隔、取消冷却 30s、失败冷却 120s
- **红线**：未成功播放并完成激励条件 → 不发放（本轮探针实测：取消 → 三资源纹丝不动）

## 4. 通胀防护（已有机制）
- 深夜时段离线工资/修为=0（时段切分器，防挂机白嫖 8h 全额）
- 离线窗口快照过期丢弃（projectedAtMs > lastSaveTime 校验，防同一窗口跨 settlementId 重复领取）
- 数值溢出守卫：claimDouble 后 Number.isSafeInteger 校验 + 事务回滚 restore()
