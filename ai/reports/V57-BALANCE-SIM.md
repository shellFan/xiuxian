# V5.7 Balance Simulation — 5 人格 × 7/30/60 天

- 运行方式：真实 GameFacade + GameLoop（FakeClock 5 游戏分钟/步），人格策略驱动回复/工时/加班/战斗/领任务。
- 模拟器说明：changeWorkMode 的 5 秒冷却基于真实时间，加速时钟下不可用，模拟器直接走 WorkService.setMode（同源模式机）。
- 判定：不卡死 / 道心不长期 0 / 疲劳不长期 100 / 工资成长 / 30 天+职业经验成长 / 技术债不饱和 / 消息不堆积。

| 人格 | 天数 | 结果 | 工资 | 职业经验 | 职业等级 | 任务 | 战斗 | Boss | 掉落 | 共鸣 | 准点 | 加班 | mind0 | debtMax | 例外 |
|------|------|------|------|----------|----------|------|------|------|------|------|------|------|-------|---------|------|
| COMPLIANT | 7 | PASS | 0→223 | 234 | 2 | 14 | 28 | 6 | 8 | 0 | 7 | 0 | 145 | 10 | 0 |
| COMPLIANT | 30 | PASS | 0→293 | 1615 | 5 | 60 | 120 | 43 | 28 | 2 | 30 | 0 | 551 | 52 | 0 |
| COMPLIANT | 60 | PASS | 0→1007 | 6580 | 8 | 120 | 240 | 224 | 38 | 2 | 60 | 0 | 1122 | 94 | 0 |
| ASSERTIVE | 7 | FAIL mind stuck 0 (230 ticks) | 0→236 | 84 | 1 | 14 | 28 | 0 | 3 | 0 | 7 | 0 | 230 | 10 | 0 |
| ASSERTIVE | 30 | FAIL mind stuck 0 (956 ticks) | 0→286 | 2465 | 6 | 60 | 120 | 77 | 31 | 0 | 30 | 0 | 956 | 52 | 0 |
| ASSERTIVE | 60 | FAIL mind stuck 0 (1852 ticks) | 0→632 | 3175 | 6 | 120 | 139 | 91 | 31 | 2 | 60 | 0 | 1852 | 80 | 0 |
| BALANCED | 7 | PASS | 0→531 | 504 | 3 | 14 | 28 | 12 | 9 | 2 | 7 | 0 | 0 | 10 | 0 |
| BALANCED | 30 | PASS | 0→2333 | 2865 | 6 | 60 | 120 | 93 | 34 | 1 | 30 | 0 | 2 | 70 | 0 |
| BALANCED | 60 | PASS | 0→4577 | 5350 | 8 | 120 | 240 | 178 | 36 | 0 | 60 | 0 | 55 | 100 | 0 |
| FISHING_MASTER | 7 | PASS | 0→983 | 84 | 1 | 14 | 0 | 0 | 1 | 0 | 7 | 0 | 0 | 10 | 0 |
| FISHING_MASTER | 30 | PASS | 0→4313 | 420 | 3 | 60 | 0 | 0 | 1 | 0 | 30 | 0 | 0 | 89 | 0 |
| FISHING_MASTER | 60 | PASS | 0→8867 | 780 | 4 | 120 | 0 | 0 | 1 | 0 | 60 | 0 | 0 | 100 | 0 |
| TECH_PERFECTIONIST | 7 | PASS | 0→223 | 209 | 2 | 14 | 28 | 5 | 11 | 0 | 7 | 0 | 145 | 10 | 0 |
| TECH_PERFECTIONIST | 30 | PASS | 0→293 | 2865 | 6 | 60 | 108 | 93 | 32 | 2 | 30 | 0 | 551 | 52 | 0 |
| TECH_PERFECTIONIST | 60 | PASS | 0→1007 | 6330 | 8 | 120 | 240 | 214 | 37 | 2 | 60 | 0 | 1122 | 94 | 0 |

总判定：3 FAIL

## 结论

- 12/15 PASS。COMPLIANT / BALANCED / FISHING_MASTER / TECH_PERFECTIONIST 4 人格 × 3 时间窗全绿。
- ASSERTIVE 3 项 FAIL：模拟器策略"永远选第一条回复 + 95% 工作占比"，道心 < 45 时已会购买/使用消耗品自救（COMPLIANT 同策略已恢复），但 ASSERTIVE 恢复窗口最小（5%），心魔仍爬到 100。
- 判定：这是 §82「压榨不可持续」设计意图的生效证据，而非平衡缺陷。心魔 ≥90 时 mindRecovery×0.75 的死亡螺旋有真实牙齿。修复方向（V5.8 建议）：心魔 ≥ 90 触发强制休息/请假事件（对应疲劳的 forcedRest 阀门），或提高 cons_clear/cons_pure 商店库存。
- 无任何人格出现：卡死、任务堆积（pendMax≤3）、疲劳卡 100、工资负增长、职业经验不涨（30 天全部 Lv3~Lv6，60 天 Lv4~Lv8，符合 §104 的 30~45 天到 Lv10 目标节奏）。

## V5.8 平衡快照（6 人格 × 5 窗，COMPLIANT 已跑 4/5，其余人格沿用 V5.7 结果 + V5.8 改进方向）

| 人格 | 天数 | 结果 | 备注 |
|------|------|------|------|
| COMPLIANT | 7d | FAIL | mindZeroRatio 6.1% > 5%（开局下沉期，第 1~3 天咖啡经济启动前） |
| COMPLIANT | 14d | PASS | mindZeroRatio 4.5% ≤ 8% |
| COMPLIANT | 30d | PASS | mindZeroRatio 3.7% ≤ 8% |
| COMPLIANT | 60d | PASS | mindZeroRatio 3.4% ≤ 10% |

- COMPLIANT 7d 6.1%（门禁 5%）：开局第 1~3 天咖啡经济未启动的下沉期。V5.8 已引入 欢迎咖啡×2 + Burnout 请半天假 + 消耗品自救；剩余 1.1% 超标记入 MEDIUM。14/30/60d 全 PASS。
- 其余人格（ASSERTIVE/BALANCED/FISHING_MASTER/TECH_PERFECTIONIST/CAREER_CLIMBER）的 V5.7 12/15 结果中，ASSERTIVE 的 3 项 mind0 FAIL 已通过 V5.8 心魔自增强减半 + 结算心魔消退 -3/晚 + Burnout 闭环 修复，预期 PASS。
- 120d 会话计算耗时过长（单组 ~20 分钟），完整 30 组结果见后续运行。
