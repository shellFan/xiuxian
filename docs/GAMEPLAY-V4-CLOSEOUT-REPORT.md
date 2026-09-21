# Gameplay V4 收尾验收报告

日期：2026-09-21
分支：`gameplay-v2`

## 本轮交付

- 项目战斗：配置驱动的普通怪、精英、Boss、Build、技能与进化；自动攻击、升级三选一、夜班/疲劳修正、任务/事故副本联动。
- 战斗可靠性：无效或损坏的存档战斗不会阻塞新战斗；存档快照不共享运行时引用；战斗结算与奖励领取标记在 UI 确认前即时持久化，重启不重复发奖。
- 离线 AutoPolicy：`ALWAYS`、`NEVER`、`SELECTIVE` 持久化在玩家存档；SELECTIVE 只处理低优先级、非事故事项；ALWAYS 也绝不自动恢复活动事故。
- 回归欢迎流：返回游戏时生成稳定的离线结算标识，并从未完成指派任务/活动事故投影最多三项、去重的“破事队列”；过期或伪造的操作 ID 被服务层拒绝。
- 宗门差异：民企/外企/国企/大厂分别通过配置影响带薪加班报酬与 BUG 类事件事故风险；免费加班仍严格为零工资。
- 三阈值平衡：新增确定性模拟器比较 `ALWAYS`、`NEVER`、`SELECTIVE`，其规则、种子和天数可复现。

## 平衡证据

命令：`npx tsx scripts/overtime-balance-simulator.ts --seed=417 --days=30 --mind=80 --demon=10 --career=3`

| 策略 | 加班天数 | 总奖励 | 疲劳成本 | 事故暴露 | 期末道心 | 可持续评分 |
|---|---:|---:|---:|---:|---:|---:|
| ALWAYS | 30 | 3275.34 | 409.75 | 5.45 | 0 | 0.00 |
| NEVER | 0 | 0.00 | 0.00 | 0.00 | 100 | 1200.00 |
| SELECTIVE | 11 | 1110.48 | 31.50 | 1.04 | 88 | 703.40 |

低道心/高心魔复核（`--mind=25 --demon=80`）中，NEVER 的可持续评分为 1120.00，高于 SELECTIVE 的 762.90 与 ALWAYS 的 0.00。模拟因此满足两项设计约束：无脑加班不支配长期结果；低道心高心魔时准点下班应优于继续加班。

## 验证

- `npm test`：106 个测试文件，退出码 0。
- `npm run build:game`：通过。
- `npm run gameplay-v2:check`：类型检查、内容完整性、旧合成路径隔离均通过。
- `npm run pc:check`：通过。
- `node --check desktop/ui-overlay.js`：通过。
- `git diff --check`：通过。
- 战斗、AutoPolicy、宗门修正与三阈值模拟均有确定性回归测试，覆盖重启、重复领取、损坏存档、队列上限/去重、失效动作和种子重复性。

## 运行方式

```powershell
npx tsx scripts/overtime-balance-simulator.ts --seed=417 --days=30 --mind=80 --demon=10 --career=3
```

模拟只读配置并在内存中运行，不改写玩家存档或生产数值。
