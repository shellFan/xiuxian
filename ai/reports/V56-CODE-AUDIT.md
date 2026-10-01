# Gameplay V5.6 代码审计（开工前真实代码核查）

> 审计基线：`23287681f544a91f8e80724e8501136386cf7654`（V5.5 收尾），工作区干净。
> 逐条对照 Prompt §3 的 A~F 已知问题，全部在真实代码中确认。

## A. TaskService 仍只有 50% milestone — 确认

`task-service.ts` tick 中唯一的过程事件是 50% 进度时发一次 `taskMilestone`（flag `v5_task_milestone:<id>` 保证一次）。
没有 runtimeSeed、没有多阶段触发表、没有暂停/阻塞状态、没有上下文切换。
ActiveTaskState 仅含 taskId/taskType/name/description/durationSeconds/startedAt/奖励字段。

## B. Profession.taskPool 未接入任务生成 — 确认

`ProfessionService.taskAllowed()` 存在但 **零调用点**。任务页 `renderTasks()` 直接遍历
`queryTaskConfigs()`，与职业无关。taskPool 配置仅 3~4 个 ID，远低于每职业 20 的目标。

## C. 四职业共用 Java Build — 确认

六职业 `builds` 全是 `build_java/build_db/build_redis/build_fish` 的排列。没有前端/QA/DevOps 专属 Build。

## D. 项目结局在 UI 直接改状态 — 确认

`desktop/ui-overlay.js` `renderProjectOutcome` 决策回调内直接：
`f.context.player.mind = ...` / `performance` / `economy.applyIdleSalary` / `techDebt.add` /
`assignedTasks.assign`。无 Project Domain State、无 deadline、无跨天后果。

## E. Journey Guide 浅层规则 — 确认

仅 4 条：inBattle / runningTask / promotion.allowed / hour>=17 / workMode。无 NOW/TODAY/PROJECT/CAREER 分层。

## F. UI fallback 演示数据 — 确认

`desktop/ui-overlay.js` DEMO 对象含 `MERGE_COUNT 合成牛马 3 次`（line 199）、
`workMode: 'FISHING'`、10 秒级任务示例（`durationSeconds: 10/15/20` 在旧版 task-service 已清，
但 DEMO.tasks.configs 仍带 10~20 秒任务）。facade 缺席时整套演示 UI 可见。

## 其余发现

- 无第二套 Task/Clock/Save 系统 ✅
- Messenger/StoryDirector/Profession 服务化 ✅ 有测试 ✅
- save v10：profession 字段有迁移 ✅；v5 messenger 字段有迁移 ✅
- 无 fatigue、无 project 持久状态、无 daily planner 计算（dailyPlan 仅字符串列表）
- battle `stepOnce` 无 status effect / synergy；SKILL_MAP 已有 `evolvesTo` 字段但未使用

## V5.6 实施顺序（按 §37）

1. TaskRuntimeDirector（runtimeSeed 调度 / 暂停 / 前台切换 / 效果落地）
2. DailyPlanner + Today Capacity（真实计算）
3. Profession 深化（每职业 Build、taskPool 接入、职业经验）
4. Project State Machine（域服务 + facade.resolveProjectDecision）
5. GoalDirector（NOW/TODAY/PROJECT/CAREER/PROFESSION/LONG_TERM）
6. 内容扩充（任务运行时事件 ≥100）
7. Save v11 迁移 + 测试 + Gate
