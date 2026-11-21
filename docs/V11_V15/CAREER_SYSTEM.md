# 职场系统报告（CAREER_SYSTEM）

> 以实际代码为准（2026-11-22 审计）。技能：`rpg`（pacing 先于公式）。

## 1. 现状架构

| 模块 | 实现 | 数值源 | 测试 |
|---|---|---|---|
| 职级 20 级 | `services/career-service.ts`（`performance >= next.requiredExp` 晋升闸） | `configs/career.json`（requiredExp/salaryMultiplier/cultivationMultiplier/realm） | tests/career/ |
| 修为曲线节奏 | — | `configs/progression.json`（kpiWorkSeconds/salaryPerHour/mindDrainPerHour/expectedMinutes） | tests/cultivation/ |
| KPI | `services/kpi-service.ts` | `configs/kpi.json` | tests/kpi/ |
| 晋升答辩 | `promotion-service.ts`（概率制）+ `v2/v2-settlement-service.ts PromotionV2Service`（三题 submitDefense） | `configs/promotion.json`（PPT符箓/数据大法/甩锅诀） | tests/promotion/、tests/v2/ |
| 办公室 | `office-service.ts` | `configs/office.json` | tests/office/ |
| 职场事件 | `career-event-service.ts` + `event-runtime-adapter.ts`（V11-F5 已接线） | `configs/career-events.json`（37 事件）+ FISH 资格 sidecar | tests/events/ |
| 工作模式 | `work-service.ts`（WORK/FISHING/CULTIVATING/SOCIAL 四模式） | 模式乘子表 work-service.ts:43 | tests/work/ |
| 疲劳 | `v57/fatigue-service.ts` + `burnout-service.ts` | — | tests/office/ |
| 每日/每周 | `daily-task-service.ts`（UTC 日池）+ `task-service.ts` | `configs/daily-tasks.json`、`daily.json` | tests/daily/ |

## 2. V11 状态与修复

- **KPI 边界已验证正确**：空配置（Max Level 无晋升目标）明确不算完成（kpi-service.ts:69-74 注释+实现），`getView().allCompleted` 要求 `requirements.length > 0`——任务书 5.1「空要求不能误判完成」已满足
- **摸鱼模式已场景化**（V11-F5）：7 个 FISHING 门控事件 + 摸鱼时长成就（带薪如厕→摸鱼仙尊）；新档默认摸鱼模式，POSITIVE×1.2/NEGATIVE×0.8 权重修正
- **事件选择接入 EVENT-POOL-V1**（V11-F5）：冷却 30min/近史 5 排除/彩蛋 once/负面连击抑制——修复了此前同事件可连发的问题

## 3. 已知缺口（→BACKLOG）

| 缺口 | 说明 |
|---|---|
| L10→L11 停滞 ≈336 天 | BUG-ECO-1（P3 产品决策：是否下调 10–19 级出勤目标） |
| 加班/高效/休息独立模式 | WorkMode 枚举扩展需动 save 白名单（BLOCKED-WIP）；现由 OVERTIME 事件+fatigue 体系部分承担 |
| 每周任务 | 需周 key 存档字段（BLOCKED-WIP） |
| 工位视觉变化 | office.json 有等级，视觉资产缺（E 系列） |
