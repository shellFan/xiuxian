# V5.7 Baseline Audit — V5.6 真实状态（代码为准）

- Git 基线：`9dec502991e5082683b6004463e78e42998b7cfb`（gameplay-v2 = origin/gameplay-v2，工作区干净）
- 审计时间：2026-10-01
- 方法：逐文件读代码 + 运行时 grep 调用点，不采信 V5.6 报告结论。

## 一、V5.6 功能六态表

| # | 功能 | 状态 | 证据 |
|---|------|------|------|
| 1 | TaskRuntimeDirector（任务多阶段事件） | IMPLEMENTED | `assets/scripts/v56/task-runtime-director.ts:362行`，GameLoop 8.6 步 tick 接线，runtimeSeed 确定性调度，40 条事件 |
| 2 | DailyPlanner / Today Capacity | IMPLEMENTED | `daily-planner-service.ts` beginWorkday/capacity/planVsReality；但 PLANNED_POOL 硬编码 7 条通用任务，未接职业池 |
| 3 | Project 状态机 + 7 决策 | IMPLEMENTED | `project-service.ts:231行`，resolveDecision 7 分支，incidentRiskMultiplier |
| 4 | GoalDirector | IMPLEMENTED | `goal-director-service.ts` NOW/TODAY/PROJECT/CAREER/PROFESSION/LONG_TERM |
| 5 | 17:55 危机 / 证据 / 归咎 | IMPLEMENTED | story-director + messenger-content + ui-overlay-v2 结算模态 |
| 6 | 职业 4 选 1 / 职业等级 / 专精加成 | IMPLEMENTED | `profession-service.ts`；specialtyMultiplier 在 battle stepOnce 生效 |
| 7 | 存档 v11 + 迁移 | IMPLEMENTED | save-service normalize* 全链；tests/v56 |
| 8 | **职业 Build 分离** | **MISSING（欠账 4.1）** | `professions.json`：FRONTEND builds=`[build_java,build_redis,build_fish,build_db]` 与 Java 完全相同（仅排序不同）；QA/DEVOPS 同样共用 4 个 build。battle-content.json 仅 4 个 build，全部 Java/通用题材 |
| 9 | **Profession taskPool 接线** | **CONFIG_ONLY（欠账 4.2）** | `profession-service.taskAllowed()` 存在但**全仓库零调用**；daily-planner PLANNED_POOL 硬编码，任务生成完全不看职业。taskPool 每职业仅 3~4 条 |
| 10 | **Fatigue（0-100）** | **UI_ONLY（欠账 4.3）** | `player.fatigue` 字段+`queryFatigue()` 存在；grep 全仓库**无任何来源累加/恢复/效率/战斗/次日结算消费点**。battle 只消费旧的 `overtimeFatigue`(EXHAUSTED/TIRED 枚举) |
| 11 | **Skill Evolution（Lv3 二选一）** | **CONFIG_ONLY（欠账 4.4）** | 战斗技能只有线性 `evolvesTo`（Lv2 直升）；无 Lv3、无二选一、无行为分叉、无 UI、无 Save 字段 |
| 12 | **Skill Synergy** | **MISSING（欠账 4.5）** | 全仓库无 synergy 任何代码/配置 |
| 13 | **Boss 数量/机制** | **PARTIAL（欠账 4.6）** | 仅 5 个 Boss（需求天魔/慢SQL老祖/OOM魔尊/缓存雪崩兽王/线上事故），全通用题材，单机制（SUMMON 类）；无预警 Telegraph、无专属掉落 |
| 14 | **装备量级** | **PARTIAL（欠账 4.7）** | lootEquipment 12 件；无 Affix、无套装、无 Compare、无掉落卡片 |
| 15 | **Playthrough 报告** | **MISSING（欠账 4.8）** | `V56-PLAYTHROUGH.md` 未进仓库 |
| 16 | Messenger 飞剑传书 183+ 事件 | IMPLEMENTED | v5/messenger-content 合并加载 + validate |
| 17 | 三栏战斗表现 + 浮动伤害 | IMPLEMENTED | ui-overlay ux-battle2 + spawnBattleFloats |
| 18 | 职业怪物池优先（60%） | IMPLEMENTED | battle-service spawnWave `professionPool.includes` 60% 概率 |
| 19 | 周末 / NPC 关系 | PARTIAL | NpcService 8 NPC 关系数值 + WeekendService 4 选项；无记忆、无主动行为 |
| 20 | 成就 | PARTIAL | achievements.json 50 条（含 20 条 msg_ach）；目标 ≥80 |

## 二、V5.7 必须 P0/HIGH 修复清单

1. **P0** 职业分家：4 职业 × (Build≥5 独占 / 怪≥20 独有≥70% / 主动技≥10 / 被动≥8 / 任务≥25 / 事件≥25 / 进化≥8 / 装备≥12 / Boss≥4 / 成就≥8 / 称号≥6)
2. **P0** taskPool/taskAllowed 真正进入任务生成（每日计划+指派任务），跨职业 10~20%
3. **P0** Fatigue 接线：来源（连续工作/加班/通宵/事故）→ 效果（任务效率/Mind 恢复/战斗）→ 恢复（下班/周末/摸鱼）→ 100 强制休息 → UI
4. **P0** Skill Evolution：Lv3 二选一、行为分叉、Save 持久、UI
5. **P0** Skill Synergy：≥24 条 runtime（技能+技能/装备/Build），UI 激活显示
6. **HIGH** Boss ≥18（4职业各≥4+通用≥2）、≥2 机制、Telegraph 预警、专属掉落+轻保底
7. **HIGH** 装备 ≥60 + Affix ≥40 + 套装 ≥12 + Compare + 掉落卡片
8. **HIGH** V56-PLAYTHROUGH 补做

## 三、V5.7 新增范围（按规范 §42~§124）

第一周剧情 Mon-Sun / NpcMemory 13 类型 / Project History+回归 / DailySituation ≥12 / CompanyProfile / WeeklyGoal / SecretEvent / 成就≥80 / 周结算 / Codex 图鉴 / 保存 v12。

## 四、集成点（已核实）

- 任务生成：`daily-planner-service.beginWorkday`（PLANNED_POOL 替换为职业池）
- 战斗：`battle-service.ts` MONSTER_MAP/SKILL_MAP/BATTLE_BUILDS 模块级 map → 需合并 v57 扩展内容
- 事件：task-runtime-director 已按 `professions` 字段过滤 → 职业事件直接扩 JSON
- 存档：CURRENT_SAVE_VERSION 11 → 12，新增 skillLevels/skillEvolutions/synergyDiscovered/npcMemories/weekStory/projectHistory/codex/weeklyGoals/bossPity/dailySituation/companyProfile
- Facade：1019 行，新增 V57 命令/查询区
- UI：ui-overlay.js 3152 行 + v2 606 行，新增职业页/图鉴/周结算/掉落卡片/Compare
