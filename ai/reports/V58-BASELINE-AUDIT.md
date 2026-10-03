# V5.8 Baseline Audit — 逐系统真实调用链（以代码为准）

基线：`1451447`（gameplay-v2 = origin）。审计法：grep 调用点 + 读 service 全文 + sim 探针。

## 状态表

| SYSTEM | STATE | RUNTIME ENTRY | UI ENTRY | SAVE | TEST | KNOWN ISSUE |
|---|---|---|---|---|---|---|
| Mind | IMPLEMENTED | MindService.applyDelta ← v2-economy 流式余数; settle +35 | 首页道心条 | mind/maxMind | loop tests | 无 Burnout 分层；恢复通道分散 |
| InnerDemon | PARTIAL | InnerDemonService.tick(被动+2/h) + 事件 effects + d2 跳涨 | 首页心魔/激活列表 | innerDemon/activeDemons | v2 tests | **mind<10 死亡螺旋无阀门**；demon≥90 仅恢复×0.75 |
| Fatigue | IMPLEMENTED | FatigueService ← loop 8.7/结算/Boss战 | 首页 chip + 职业页卡 | fatigue/fatigueForcedRest | v57 systems | forcedRest 只降效率无剧情事件 |
| Salary | IMPLEMENTED | work-service 单点（mode salaryMul）+ task/assign/project/overtime/shop | 首页工资 + 日结 | salary/salaryRemainder | v55 salary tests | assigned-task 直接 `salary+=` 绕过 economy；project 决策 ¥120 可重复 |
| PaidFishing | IMPLEMENTED(记账) | work-service.recordSettlementInput | 日结显示 | settlementInputs | v3 work-today | 仅展示；语义正确（不双算） |
| Overtime | IMPLEMENTED | OvertimeService offer/accept/finish | 加班弹窗+拒绝 | activeOvertimeSession | v4 tests | 免费加班 0 报酬 ✓ |
| FreeOvertime | IMPLEMENTED | overtimeFree flag | 日结 freeOvertimeSeconds | gameDay | v4 | — |
| TechnicalDebt | IMPLEMENTED | TechDebtService add/repay ← 事件/项目 | 事件文案 + 项目风险 | technicalDebt | v4 | **无主动治理玩法**（只能靠事件选择偶发 -3）；≥90 无危机事件 |
| ProfessionExp | IMPLEMENTED | ProfessionService.grantExp ← 任务/事件/Boss/项目 | 职业页 exp bar | professionExp | v57 | 曲线已校准（60d Lv6~8） |
| CareerExp/Promotion | IMPLEMENTED | PromotionService 答辩 | 晋升页 | careerLevel/kpi | promotion tests | 晋升后 **玩法无变化**（仅数值）——V5.8 核心 P0 |
| Company/Sect | PARTIAL | SectService（宗门切换=修炼流派） | 宗门页 | sectId | sect tests | **week-content companyProfiles 是 CONFIG_ONLY**（week-service.companyProfile() 只返回文案给 UI 查询，无任何 runtime 数值接入）；Offer MISSING |
| WeeklyLoop | IMPLEMENTED | WeekService goals/settlement/hooks | 职业页+周报弹窗 | weeklyGoals | v57 tests | 月度层 MISSING |
| NpcMemory | IMPLEMENTED | NpcMemoryService ← 事件/责任/任务 | NPC 页记忆卡 | npcMemories | v57 | Messenger 文案未按 memory 变化（记忆只影响 assistChance） |
| ProjectHistory | IMPLEMENTED | ProjectHistoryService.archive ← resolveDecision | 项目页档案 | projectHistory | v57 | 回归项目 pickReturning 无人调用（MISSING 接线） |
| BossPity | IMPLEMENTED | LootService.rollBossDrop ← battle | 图鉴/掉落 | bossPity | v57 | — |
| Equipment | IMPLEMENTED | LootService + v2Items | 法宝页+图鉴+Compare | ownedEquipment | v57 | LEGENDARY 无特殊视觉/声音接口 |
| Build | IMPLEMENTED | battle buildOptions 按职业过滤 | Build 弹窗 | activeBattleRun.buildId | v57 | **无 Build Preset**（一局一选，不持久偏好） |
| SkillEvolution | IMPLEMENTED | battle.prepareSkillOffers/chooseSkill | 三选一弹窗 | skillEvolutions | v57 | 候选显示已修（queryEvolutionOption） |
| Synergy | IMPLEMENTED | battle.evaluateSynergies | 战斗 chips+职业页 | synergyDiscovered | v57 | — |
| Achievements | IMPLEMENTED | AchievementService.checkAll 30s | 成就页 | unlocked/claimed | loop | 84 条；目标 100 |
| Codex | IMPLEMENTED | CodexService.discover* | 图鉴页 5 tab | codex | v57 | 未知 Boss 无模糊线索 |
| GoalDirector | IMPLEMENTED | GoalDirectorService ← 首页 | journey banner | — | v56 | 无"TOP1+2 副目标"收敛（并列渲染） |
| JourneyGuide | IMPLEMENTED | journeyGuideHtml | 首页 | — | v55 | — |
| WorkToday | IMPLEMENTED | WorkTodayService 投影 | 首页中栏 | — | v3 | — |
| Messenger | IMPLEMENTED | MessengerService + StoryDirector | 飞剑页 | messages | v5 | 文案不按 NpcMemory 变化；事件反重复仅 actor 冷却（缺 recentEventHistory 类别惩罚） |
| TaskRuntimeDirector | IMPLEMENTED | tick 8.6 + ensureRuntime | 任务三选一 via messenger | activeTasks | v56 | — |
| BattleContent 双源 | DUPLICATED | battle-merge 合并 v3+v57 | — | — | content:check | 允许（merge 层收敛）；**真正双源是 professions.json vs profession-content.json** |
| Boss Phase | MISSING | — | — | — | — | 19 Boss 全无 Phase 2 |
| Burnout | MISSING | — | — | — | — | 本轮 P0 |
| Team/Management | MISSING | — | — | — | — | 本轮 P0（L7+） |
| Mentorship | MISSING | — | — | — | — | 本轮 P0（L4+） |
| Offer | MISSING | — | — | — | — | 本轮 HIGH |
| Monthly/Milestone | MISSING | — | — | — | — | 本轮 HIGH |
| Sound Events | MISSING | — | — | — | — | 接口层本轮 |

## 关键调用链风险（审计实锤）

1. **心魔螺旋**：`inner-demon-service.tick`: `mind<10 → add(2*hours)`；`mindRecoveryDown`(≥90) → ×0.75；无上限解除阀门 → sim ASSERTIVE mind 永锁 0。
2. **assigned-task-service.ts:102** `player.salary += salary` 绕过 economy（无 validate）。
3. **project-service.ts:79** `applyIdleSalary(120)` 按决策触发，decisionHistory 允许多次同类决策 → 需要幂等/一次性。
4. **companyProfiles（v57/week-content.json）CONFIG_ONLY**：仅 queryCompanyProfile() 文案查询，overtimeChanceMul/salaryMul 等字段无任何 runtime 消费。
5. **pickReturning**（project-history）0 调用者 —— 回归项目 MISSING 接线。
6. **测试/模拟器路径**：v57 sim 直接调 `facade.context.work.setMode`（绕过 changeWorkMode 冷却）——属于模拟器 hack，V5.8 Balance Gate 2.0 需改走 facade 正式命令或显式声明。

## 结论 → V5.8 P0 顺序

1. Burnout 闭环（修心魔螺旋的 gameplay 化方案）+ Balance Gate 2.0
2. 工资/奖励路径收敛（assigned/project 走 economy）+ 治理循环（技术债玩法化）
3. 晋升玩法进化（L4 Mentorship / L7 Team / 道德镜像）+ Company runtime 化 + Offer
4. Meta（CareerJourney/BuildPreset/BossHint）+ 战斗爽感（Phase/浮字池/Summary）
5. ContentRegistry 收敛（professions 双源合一）+ Save v13 + 100 成就
6. Milestone Director + 月报 + 正向事件比例 + 事件反重复
