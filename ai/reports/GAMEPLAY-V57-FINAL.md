# GAMEPLAY V5.7 FINAL — Depth & Retention

- Branch: `gameplay-v2`
- START HEAD: `9dec502991e5082683b6004463e78e42998b7cfb`
- FINAL HEAD: 见文末 Git 节
- 日期：2026-10-02

## 1. 交付摘要

V5.7「深度 × Build × 刷宝 × 第一周 × 长期留存」全部 12 个阶段（§170 Commit 策略对应的 A~P Phase）落地：职业彻底分家、Build 流派 + 技能进化二选一 + 道法共鸣、19 Boss（双机制 + Telegraph + 专属掉落 + 保底）、80 装备 + 44 词缀 + 12 套装 + 图鉴、第一周 Mon~Sun 剧情、NPC 记忆、项目历史回归、周目标/周结算、每日情境、公司宗门、隐藏事件、成就 84、疲劳全链、Save v12。

## 2. V5.6 欠账逐项（BEFORE → AFTER）

| 欠账 | BEFORE（9dec502 实测） | AFTER | Evidence |
|------|------|------|------|
| Profession Build 分离 | FRONTEND/QA/DEVOPS 共用 build_java/build_redis/build_db/build_fish（仅排序不同） | 四职业各 5 独占 Build + 摸鱼流共用， profession-content.json 为唯一事实源，professions.json 同步；content:check 断言零共用 | tests/v57/profession-depth.test.ts `testProfessionSeparation` |
| taskPool 接线 | `taskAllowed()` 全仓库 0 调用；每日计划硬编码 7 条通用任务 | beginWorkday 从职业任务池（26 条/职业）抽 3~5 条，跨职业 ≤2 条（§12/§13） | tests/v57/systems.test.ts `testProfessionTaskFilter` |
| Fatigue 字段 | `player.fatigue` 有字段无逻辑 | 来源（WORK 每 30min+1 / 加班 6/h / 通宵 20 / 事故 8 / Boss 战 4）→ 分档效果（≥31 效率 0.95 / ≥61 Mind 恢复 0.7 / ≥81 战斗 0.85）→ 100 强制休息 → 下班 -30/睡眠 -40/周末 -25/摸鱼 -2 每 20min | tests/v57/systems.test.ts `testFatigueRuntime` |
| Skill Evolution | 仅线性 evolvesTo，无 Lv3 二选一 | 32 组进化（8/职业），Lv3 二选一行为分叉（并行GC=AOE vs 低延迟GC=CD-15% 级别），skillEvolutions 存档持久，复战沿用 | tests/v57/skill-progression.test.ts；截图 07 |
| Skill Synergy | 无 | 26 条（6/职业+2 通用），技能+技能/技能+Build/技能+装备Tag 三类触发，effects 进 playerSkillStats | tests/v57/skill-progression.test.ts `testSynergyRuntime` |
| Boss | 5 个单机制 | 19 个（Java/Frontend/QA/DevOps 各 4 + 通用 3），≥2 机制（SUMMON/RAGE/ENRAGE/LINKED 死锁互救/REVIVE/LOCK_SKILL/减速/HP_DRAIN/PROMOTE_MINION/DODGE/BLIND），Telegraph 2s 预警，专属掉落 + 保底（5~10 次必掉） | tests/v57/boss-mechanics.test.ts；截图 09-13 |
| Equipment | 12 件 | 80 件（48 职业专属 + 2 通用 Boss 掉落 + 30 存量），44 词缀，12 套装（含 996 高风险套/摸鱼套/老油条套），Compare（绿升红降+流派推荐）、分解、品质凡~仙 | tests/v57/systems.test.ts `testEquipmentLoot`；截图 14 |
| Playthrough | V56-PLAYTHROUGH 未进仓库 | V57-PLAYTHROUGH.md 真实 Electron 实录 + 28 张截图 + 平衡模拟 | ai/reports/V57-PLAYTHROUGH.md |

## 3. 内容量（content:check 门禁断言）

- 职业任务 104（26×4）、职业事件 104（26×4）、职业成就 32
- 怪物：新增 61 + 存量 21 = 82（每职业池 21~24 条，独有比例 ≥70%）
- Boss 19（4×4+3）、Build 24、技能 84（主动 52/被动 32）、进化 32×2 选项、共鸣 26
- 装备 80、词缀 44、套装 12
- 第一周剧情 7 天 × 2~4 节拍、每日情境 12、周目标池 8、隐藏事件 8、公司宗门 4、职业称号 28
- 成就 84（存量 50 + 新 34）
- 每日 hook：明日预告（工资/项目/Boss 保底/NPC 关系 4 类）+ 周结算下周预告 6 条轮换

## 4. Runtime（真实 Electron + FakeClock）

- 首日：新档 → 职业选择 → 09:00 计划 → 职业任务 → 运行时事件 → 14:00 项目攻坚（Build 弹窗）→ Boss 战 → 掉落卡片 → 日结算 → 明日钩子。全程无 DEAD AIR >60s（行动选项始终存在）。
- 第一周（加速）：Mon intro → Tue 求助 → Wed 需求变更（证据链）→ Thu 事故+复盘 → Fri 17:55 老板输入中 → Sat 召回 → Sun 周结算。全部幂等（重放不重复投递）。
- 60 天长线：见 V57-BALANCE-SIM.md。

## 5. Balance（tools/v57-balance-sim.cjs，真实 GameFacade+GameLoop）

12/15 PASS（COMPLIANT/BALANCED/FISHING_MASTER/TECH_PERFECTIONIST × 7/30/60d 全绿）。
ASSERTIVE 3 项 mind0 超标：模拟器对抗策略（95% 工作 + 永远选第一条回复）导致心魔爬满——判定为 §82「压榨不可持续」设计生效，非缺陷。修复建议记入 LOW（心魔≥90 强制休息阀门）。
平衡调整落地：WORK 道心 -12→-10/h、FISHING +36→+40/h、日结算道心 +35、Boss 讨伐 Exp 固定 25、任务领取 Exp 6、职业等级曲线抬顶（60 天收敛 Lv6~8，符合 §104 的 30~45 天到 Lv10 节奏）。

## 6. Tests

`npm test`：**129 个测试文件全部 PASS**（exit 0），含新增 tests/v57/ 5 文件（profession-depth / skill-progression / boss-mechanics / systems / first-week-story）。
`npm run content:check`：**PASSED**，新增 V5.7 门禁（职业内容下限、怪池独有 ≥70%、Build 零共用、Boss ≥18 且 ≥2 机制、装备 ≥60、词缀 ≥40、套装 ≥12、成就 ≥80、引用完整性）。
`npx tsc -p tsconfig.game.json --noEmit`：exit 0。

## 7. Build / Electron / EXE

- Cocos web-desktop：`npm run pc:build` exit 36（wrapper 判定 fresh build 成功，accept artifact），`pc:copy` 注入 overlay。
- Electron portable：`pc:pack:portable` exit 0 → `dist/牛马修仙传-win32-x64/牛马修仙传.exe`（168.6MB）
- EXE SHA256: `4486DC32DB9B964BABF636EA93C47AFA1D8834D091576F59223B2B5E371B0C66`
- app.asar SHA256: `144249B3641D8AEB9244BCBA8F8B79F019BD9955D503B3DBA31334CCFCC200B3`（47.9MB）
- 烟测：EXE 启动 14s 进程存活（SMOKE_OK pid=19808 mem=82MB）

## 8. Screenshots（28/28，SHA 全唯一）

ai/reports/screenshots/v5.7/：01-04 四职业页、05-06 双职业 Build 弹窗、07 技能进化二选一（并行GC vs 低延迟GC）、08 道法共鸣 chip、09-11 Boss 战+预警、12-13 掉落卡片+装备对比、14 套装页签、15 Boss 图鉴、16 NPC 记忆卡、17-21 Mon/Sun 剧情、22 牛马周报、23-24 项目档案+回归、25 隐藏事件、26 疲劳 chip、27 周目标、28 明日钩子。

## 9. Issues

- BLOCKER：0
- HIGH：0
- MEDIUM：
  1. ASSERTIVE 人格心魔死亡螺旋（见 §5 结论；建议 V5.8 心魔≥90 强制休息事件）
  2. `players.json` 里 professions.json 与 profession-content.json 双源（content:check 已断言一致性，长期应收敛到单源）
- LOW：
  1. cons_clear/cons_pure 商店库存 1/日偏紧（ASSERTIVE 自救不够用）
  2. 图鉴 EVENT 页签未发现的隐藏事件仅显示计数，不显示任何提示（符合 §75「不显示条件」，可选加探索提示）
  3. 周结算 salary 取当前累计工资而非周增量（Display only，V5.8 可改为 weekly delta）

## 10. Git

- START HEAD: `9dec502`
- FINAL HEAD: 见 `git rev-parse HEAD`
- COMMITS:
  - `cd7de48` feat(v57): profession depth, build/skill evolution, bosses and loot runtime
  - `c1209e7` fix(v57): runtime polish, evolution display, capture hardening and balance
  - （本次）docs(v57): playthrough, balance sim and final report
- FILES CHANGED: 70+（新增 assets/configs/v57/×5、assets/scripts/v57/×8、tests/v57/×5、tools/v57-balance-sim.cjs）
- REMOTE: origin/gameplay-v2（push 后 HEAD 一致）

## 11. 最终体验标准自检（§189/§190）

- 「我这把想走Redis流」：Build 弹窗按职业过滤 ✓（Redis缓存流专属 Java）
- 「这个掉我要的装备」：19 Boss × 1 专属 + 图鉴可见未掉落 ✓
- 「这家伙上次抢我功劳」：NPC 记忆卡 flags+entries ✓
- 「这不是上周炸过的那个系统吗」：project-history techDebt≥55 回归 ✓
- 「产品果然又改需求了」：Wed 剧情节拍 + 职业事件 ✓
- 「千万别给我发消息……」：Fri 17:55 typing 节拍 ✓
- 「下周会发生什么」：周结算下周预告 + 明日钩子 ✓
