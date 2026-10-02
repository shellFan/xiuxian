# V5.8 Execution State

## CURRENT_HEAD: 1451447 (基线)
## DATE: 2026-10-03

## DONE
- Git 基线确认（1451447 = origin/gameplay-v2，工作区干净）
- 工资模型审计：**无双算**。work-service 单点计薪（WORK 1.3× / FISHING 0.6× / CULTIVATING 0.3× / SOCIAL 0.5× 基础率）；paidFishingSalary 仅记账显示。FISHING_MASTER 高工资 = 任务奖励(110/天) + 不消费；COMPLIANT 低工资 = 消耗品自救 ~8500/60d。真根因 = 心魔死亡螺旋（mind<10→demon+2/h→demon≥90→恢复×0.75）
- 内容量基线：80 装备/19 Boss/84 技能/32 进化/26 共鸣/104 职业任务/104 职业事件/成就 84

## KEY FINDINGS (audit)
- demon spiral: inner-demon-service.tick: mind<10→+2/h; mindRecoveryDown(demon≥90)→×0.75; 无 ≥90 强制恢复阀门
- project-service.ts:79 决策发 ¥120 salary（多次决策可重复触发 → 需检查幂等）
- assigned-task-service.ts:102 直接 salary +=（绕过 economy）
- professions.json / profession-content.json 双源（professions.json monsters/builds/taskPool 已与 v57 对齐但仍是两份）
- MindService / v2-economy mindRemainder 流式；settle +35 道心
- BattleRun 无 Phase 概念；19 Boss 全部无 Phase 2
- battle log 上限 12 条（persist MAX_LOG）；浮字无上限池
- GoalDirector 优先级已有 NOW/TODAY/…；无"唯一主目标+2 副目标"收敛

## IN_PROGRESS
- V58-BASELINE-AUDIT.md

## TODO
- P0 Balance Gate 2.0（BalanceHealthReport + 6人格×5窗 30 组 + tools/v58-balance-sim.cjs）
- P0 Burnout 闭环（5 状态 + "牛马也得喘口气"事件 + demon≥90 阀门）
- P0 晋升玩法进化（L4 Mentorship / L7 Team / managerExploitationScore）
- P0 Company 差异化（CompanyProfile runtime）+ Offer 轻系统
- P0 Meta（CareerJourney / Build Preset ×3 / Boss Hunting hints）
- P0 ContentRegistry（professions.json 双源合一 → adapter）
- HIGH 战斗爽感（Boss Phase≥10 / 分类浮字 / Boss Death / Battle Summary / 浮字池上限）
- HIGH 技术债治理循环（重构任务/技术债 Boss）+ Milestone Director + 月报
- HIGH 正向事件比例 + 事件反重复 cooldown
- Save v13（burnoutState/careerJourney/buildPresets/companyHistory/offerHistory/teamState/monthlyStats/milestones/managerFlags/careerChoices）
- tests/v58 全套 + Release Gate + EXE + 截图 30 张 + 首日/CareerStage Playthrough

## ISSUES
- sim ASSERTIVE mind0：对抗策略 + 心魔螺旋（游戏侧修复 Burnout 后重测）

## TEST_RESULTS
- 基线：129 test files PASS / content:check PASS / tsc clean
