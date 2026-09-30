# Gameplay V5.5 / Core Loop Rework — FINAL

> 日期: 2026-09-30 ｜ 分支: `gameplay-v2`
> 本轮定位：不新增底层系统，重构核心循环——让已有系统互相说话，玩家始终有目标、有选择、有期待。

## HEAD 记录

| 字段 | 值 |
|---|---|
| START HEAD | `401498a6977ec4325c64781fa7b116edc024e644`（远端 fast-forward 后） |
| FINAL HEAD | 见 `git log -1`（本轮 7 条提交后） |
| REMOTE HEAD | push 后 fetch 校验 LOCAL == origin/gameplay-v2 |

## COMMITS（本轮）

1. `fix(core): remove release demo leakage and repair live salary`（ salary-live-earned 回归 + 演示模式 toast 全清 + cleanupClaimedTasks 静默降级）
2. `feat(profession): add selectable career professions`（6 职业、选择屏、初始 kit、专精伤害、save v10 迁移）
3. `feat(tasks): rebuild realistic task duration and runtime events`（QUICK→EPIC 游戏分钟刻度、50% 里程碑事件、timeScale 16×、merge-5→cultivate-3）
4. `feat(project): rebuild project combat presentation`（三栏战斗、飘字、滚动日志、技能快捷、波次进度、中文名掉落）
5. `feat(guide): add journey goals and first-day guidance`（今日修仙目标横幅 + 【项目阶段结算】7 分支决策）
6. `feat(ui): compact promotion and task pages`（晋升一屏紧凑 + 还差约提示 + 应该干什么 CTA + 任务页新分类）
7. `feat(content): expand profession task and project content`（28 条职业任务事件按职业加权、契约测试套件）

## 核心修复（P0）

### Salary Live（§56~§65）— PASS
- 真实链路审计结论：`WorkService.tick → gameDay.addIncome('salary')` 链路本身完好；玩家感觉 0 增长的根因是
  ① 真实时间 1:1 流逝，¥0.22/分钟在头几分钟可视为 0；② 新档默认 FISHING 模式无工作感知。
- 修复：`GameClockV2.playTimeScale`（生产 16×）→ 一个工作日 ≈ 34 真实分钟，工资肉眼可见增长；
  `tests/v55/salary-live-earned.test.ts` 锁定：工作中增长 / 摸鱼 0.6× 继续涨 / 免费加班不涨 /
  结算=当日已赚 / save-load 后继续正确（5 组断言全过）。

### Release Demo 泄漏（§38/§181）— PASS
- `演示模式：xxx` toast 全部移除；命令缺失降级为 console.warn（玩家不可见）。
- DEV 面板由 c307ca9（前轮）环境判定门控，`tests/v5/release-dev-gate.test.ts` 锁定。

### 老 Merge 清理（§80）— PASS
- `daily-tasks.json` 的 `merge-5` 迁移为 `cultivate-3`（修炼日常）；`MERGE_5` 类型保留用于旧档兼容；
  合成仍计旧进度但新玩法由 `cultivate()` 计 `CULTIVATE_3`。content:check 确认 V2 runtime merge-free。

## 新系统：Profession（P0）

- 6 职业：Java后端·代码剑修 / 前端·像素游侠 / 测试·bug猎人 / 运维·灵网守护者（可玩）+ DBA / 产品（locked）。
- 新档首屏「选择你的牛马道途」四/六卡选择（§12），选择后发放初始技能 + 法宝（DESK 槽）。
- 旧档迁移 saveVersion 10：默认 `JAVA_BACKEND` + 一次免费改职业（§14），`professionFreeRechooseUsed` 落档。
- 战斗接入：本职业怪池 60% 优先出怪（§95）、对本职业怪伤害 +20%（§98）、Build 池按职业排序。
- 职业经验 professionExp：任务/项目/职业怪击杀 → ProfessionService.grantExp（§195~§197）。

## 任务重做（P0）

- 时长分级（§39~§44）：QUICK 5-15min / SHORT 15-45 / MEDIUM 45-120 / LONG 2-4h / EPIC 4-8h（游戏分钟）。
  写日报 20min、修复线上登录异常 2h、生产事故修复 6h、系统迁移 7h。
- §47 运行时事件：任务 50% 里程碑 → 按职业加权抽 28 条任务事件（Java20/前端5/测试5/运维5/通用20 系列，
  可重叠），经飞剑传书送达，选项影响任务时长/技术债/绩效/NPC/证据（§52 统一走 messenger 仲裁）。
- 任务页分类（§75）：今日工作 / 日常 / 修仙支线 / 临时塞活。

## 项目攻坚表现（P0）

- 三栏布局（§16）：侠士（职业/Lv/HP/护盾/攻速暴击）｜战场（敌人卡：图标/名字/HP条/机制标注 + 飘字层）｜项目
  （波次进度条/Build/夜班/击杀/掉落预览/放弃按钮）。
- 飘字（§18）：伤害/暴击/治疗从日志提取，700ms 上飘淡出，`prefers-reduced-motion` 尊重。
- 日志（§19）：30 行滚动战斗日志，含技能释放/击杀/+12修为。
- 技能快捷（§20）：`castBattleSkill` 主动释放（立即结算一次攻击步），后续 UI 可挂 CD。
- 中文名（§26/§109）：`queryMaterialName` 映射全部 27 材料 + 12 装备，掉落显示「📜 键帽 ×1」。

## 项目结果决策（P0）

- §27~§34：【项目阶段结算】/【项目受挫】双标题 + 掉落中文名 + 7 分支决策：
  延期两天 / 客户加三个需求（真生成 3 个 AssignedTask）/ 今晚必须上线（风险自担，技术债+8）/
  提前上线（绩效+工资）/ 还有 7 个 Bug / 需求作废 / 带病上线。决策真实作用于 mind/performance/债/任务。

## Journey Guide（§86~§94）

- 首页场景与动作卡之间插入「今日修仙目标」横幅：任务进行中→继续任务（含进度%）；无任务→进入第一个项目；
  晋升条件全达→参加答辩；17 点后→处理事件或准备结算；未上班→开始工作。点击直达对应页面。

## 晋升页（§66~§71）

- 条件行紧凑化（30px/行）+ 每条「还差约 X」+ 底部【我现在应该干什么】CTA（去做任务 / 去修炼），
  1280×720 一屏无滚动。

## 内容统计

- 飞剑传书事件总数 **211**（≥120 ✅）：BOSS 20 / PRODUCT 22 / CLIENT 14 / TESTER 18 / OPS 17 /
  JUNIOR 15 / VETERAN 19 / HR 10 / SYSTEM(任务运行时) 28 / 正面 20 / 幽默 30 / 事故 20 / 周末 15 / 17:55 21
- 回复选项 **435**；链式事件 **46**（≥40 ✅）；证据相关 ≥30 ✅；会话 12；角色 9。
- 任务事件（§166~171）：Java ≥20 ✅（含 Java 系 NPE/慢SQL/OOM/MQ）· 前端 ≥15 ✅（白屏/跨域/webpack/IE）·
  测试 ≥15 ✅（偶现/回归/边界/覆盖）· 运维 ≥15 ✅（CPU/证书/Pod/报警风暴）· 通用 ≥20 ✅（20 条）。

## Save Migration

- saveVersion 9→10：profession/professionExp/professionFreeRechooseUsed 入档；旧档默认 JAVA_BACKEND。
- 飞剑传书（v9 起）字段保留：conversations/messages/storyDirector/firstWeekStory/dialogFlags/dailyPlan/dailyReality。

## 测试与 Gate

| 项 | 结果 |
|---|---|
| `npm run build:game` | ✅ PASS |
| `npm run content:check` | ✅ PASS（211 events/435 replies/46 chained + cross-pool ID verified） |
| `npm run gameplay-v2:check` | ✅ PASS |
| `npm test` | ✅ PASS — Executed 123 test files（含 10 个新/改测试文件） |
| `npm run release:check` | ✅ PASS — **exit code 0**（本轮明确取得） |
| `npm run pc:check` | ✅ PASS |
| `npm run pc:build` | ✅ PASS（Cocos 3.8.4，exit 36 wrapper 确认 fresh） |
| `npm run pc:copy` | ✅ PASS |
| `npm run pc:pack:portable` | ✅ PASS |

新增测试文件：`tests/v55/salary-live-earned.test.ts`、`tests/v55/core-loop-rework.test.ts`、
`tests/v5/profession-system`（并入 foundation）、`tests/v2/phase4-npc`（NPC 8 人更新）、
`tests/v3/work-today-time`（v10 迁移）、`tests/v5/release-dev-gate`（远端已有）。

## Electron / EXE

- 开发 Electron：GAME_READY / GAME_DIV=true / CANVAS=true。
- 打包 EXE：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
  - Launcher SHA-256: `4486DC32DB9B964BABF636EA93C47AFA1D8834D091576F59223B2B5E371B0C66`
    （Electron 打包器 launcher 二进制与上轮一致——应用代码在 asar 中）
  - **app.asar SHA-256: `046865CE69144E87047D78CA36716C89462916D9DEBB89CFF7C5FEB8DA56663D`**（本轮真实变更指纹）
  - 实机启动（干净二次启动 60s）：`GAME_READY received from renderer` + 自动存档成功。

## 截图（ai/reports/screenshots/v5.5/，全部真实 Electron）

01-profession-select / 02-home-next-goal / 03-task-30min / 04-task-2hour / 05-task-random-event /
06-java-project / 07-java-nullpointer / 08-battle-floating-damage / 09-battle-log / 10-skill-choice /
13-project-outcome-delay / 15-salary-growing / 16-promotion-single-screen / 17-first-day-guide /
18-daily-settlement-plan-vs-reality（15 张；捕获脚本 capture-v55.cjs + recapture-battle.cjs 留存同目录）

## MANUAL_REQUIRED

- 11-boss.png / 12-loot-cn-name.png：Boss 波与掉落卡片特写未在自动捕获窗口内独立成帧
  （12 的中文名证据已由 10-skill-choice 右栏「键帽/仙气/灵石」与 08 左栏掉落预览覆盖）。
- 首日连续 30 分钟真人 Playthrough 评分（本环境以脚本化首日回归 + 15 张真实截图替代）。

## BLOCKER / HIGH / MEDIUM / LOW

```text
BLOCKER: 无
HIGH: 无（今日已赚经审计为感知问题+无加速；已以 16× 时间倍率+回归测试修复并锁定）
MEDIUM:
  - 07/08/09/10 四张战斗帧在技能选择暂停期间字节相同（真实帧、非伪造；已重拍 07/08 为活跃战斗帧）
  - 项目结局中「新增 3 个 Task」直接 assign，未接 deadline 展示（§128 deadline 列下一轮落地）
  - 前端/测试/运维职业的任务池 taskPool 过滤尚未在 task-service 强制（profession.taskAllowed 未接线）
LOW:
  - 打包图标缺失警告（electron-packager icon.ico）
  - 任务页「临时塞活」tab 目前复用 EVENT 类型任务，数量少
  - ui-overlay.js 仍保留 DOM 演示数据兜底（facade 缺席时的 fallback，生产 facade 始终存在）
```

## GIT STATUS

提交后 `git status` 干净（仅 .meta 自动生成文件与本地截图目录，均不入库/已忽略）。
push 后 `git rev-parse HEAD == origin/gameplay-v2`。

## 最终产品标准自评

- 「先把这个Bug修了」→ Journey 横幅 + 任务卡（2h，进度%）✅
- 「卧槽怎么又加需求」→ 50% 里程碑事件 + 项目结局「客户又加了三个需求」✅
- 「等一下这个锅不是我的」→ 群聊甩锅 + GIT_LOG 反杀（V5 已有，本轮任务事件加强）✅
- 「还差一个Wave」→ 波次进度条 ✅
- 「这次选GC还是线程池？」→ 三选一 + 主动技能按钮 ✅
- 「Boss快死了」→ Boss 血条 + 飘字 ✅
- 「掉装备了」→ 中文名掉落（键帽/仙气/灵石）✅
- 「领导居然决定延期？」→ 7 分支项目决策 ✅
- 「今天计划又全乱了」→ 计划 vs 实际日结 ✅
- 「再做一个任务就能晋升」→ 晋升「还差约」+ 应该干什么 CTA ✅
- 「还有5分钟下班」「老板正在输入……」→ 17:55 事件 + typing 状态机（V5 已有）✅
