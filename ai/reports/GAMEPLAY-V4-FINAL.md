=============================================
牛马修仙传 GAMEPLAY V4 — FINAL ALPHA HANDOFF
=============================================
生成日期: 2026-09-29（基于真实运行与全量门禁，非旧报告转写）

BRANCH: gameplay-v2
START HEAD: 32e5d6e5b7ff30e1205b6db033bc340d8251e0cc（本轮收尾起点，含方案 B 首页）
FINAL HEAD: 见 git log 顶部（本轮新增提交列表见 COMMITS；报告随最后一批提交入库）
REMOTE HEAD: push 后经 fetch 校验 LOCAL == origin/gameplay-v2

COMMITS（本轮 Alpha Polish 收尾，按实际改动拆分）:
- fix(v4): 数组/迭代器展开改 Array.from，修复 Web 构建战斗零敌人（BLOCKER）
- fix(v4.1): 教程软引导桌面桥接 + 欢迎/引导文案与样式（含 <60s 离线不弹简报、claim 失败必关弹窗）
- docs(v4.1): FIRST-10/FIRST-30 重写 + 新增 FIRST-DAY-EXPERIENCE（移除 Merge 首玩路径）
- docs(v4.1): V4.1-CURRENT-STATE / GAMEPLAY-V4-FINAL / V4-BALANCE-FINAL / V4.1-ALPHA-POLISH + 计划文件
- test(v4.1): 桌面软引导桥接回归（home-layout.test.ts 断言）

=============================================
AUDIT
=============================================
EXISTING SYSTEMS REUSED: 时钟/工作日/局势/加班/结算/事件引擎/NPC/心魔/晋升/物品/合成/成就/离线/存档框架
COMPLETED IN V4: 战斗（Dungeon/Boss/Build/Loot/技能三选一/事故与任务副本）、职场地狱域
  （证据/责任/甩锅/抢功/改需/上线地狱/事故/复盘/技术债/指派任务）、离线 AutoPolicy、
  Welcome Back 可恢复会话、存档 V8 迁移与压力修复
NEW IN V4.1: 教程 V2 软引导（版本化/可跳过/不拦截）、首日五分钟 S1 保护、桌面弹窗生命周期仲裁、
  PC 方案 B 首页（1280×720 单屏）、教程桌面只读引导条
LEGACY ISOLATED: MergeBoard(board=null)/Recruitment/Worker 仅存兼容层；首玩路径不经 Merge
  （first-day-reachability.test.ts: facade.context.board === null）
LEGACY REMOVED: 无删除

=============================================
CORE LOOP
=============================================
WORKDAY: ✅ 09:00-18:00 真实流逝 + 午休 12-13 + 下班倒计时 + 今日进度%
REALTIME SALARY: ✅ 逐 tick 计薪，全额入 gameDay.income；UI 只读投影
FISHING: ✅ 带薪摸鱼 0.6× 工资 + 道心 +36/h + paidFishingSalary 结算输入
CULTIVATION: ✅ 修炼一次（+2~6 修为，冷却）+ CULTIVATING 挂机 ×2.0
TASK: ✅ V1 任务页（日常/工作/修炼）+ V4 指派任务（P0-P3、假 P0、来源）
EVENT: ✅ 129 V2 + V3 加班 + 47 V4 职场事件，10 条链（content:check 输出）
OVERTIME: ✅ 六源加班 + 免费加班 0 工资 + 可明确拒绝（拒绝后不复现、零记账）
WEEKEND: ✅ 距周一倒计时 + 四选一安排
PROJECT: ✅ 项目页（Build 四选）+ 战斗与任务/事故联动（Boss 胜利自动完成待办）
COMBAT: ✅ 五波推进（普通→精英→Boss）、21 种怪物、技能三选一、掉落；真实截图 first-combat.png
LOOT: ✅ 战斗掉落（材料/法宝/灵石）exactly-once 结算持久化（v4-battle.test.ts + first-day-reachability）
SETTLEMENT: ✅ 日结算 exactly-once + 称号/评级 + 周五周结算

=============================================
OFFLINE
=============================================
AUTOPOLICY: ✅ NORMAL/SAFE/GRINDER/SLACKER 四策略，欢迎弹窗内可切换（auto-policy.png）
BOUNDARY SPLIT: ✅ Asia/Shanghai 09:00/12:00/13:00/18:00/午夜/周末边界切分离线时段
8H CAP: ✅ 离线收益全局 8 小时封顶
PREVIEW/CLAIM: ✅ 同快照；正常/双倍领取互斥；异步广告回调防重
WELCOME BACK: ✅ 可恢复简报 + 文案 20 条稳定 ID；<60s 离线且无待决不再弹简报（本轮修复）
PENDING RESUME: ✅ canonical pendingEvents 唯一存储；持久游标逐条处理（desktop-overlay-dom.test.ts）

=============================================
WORKPLACE
=============================================
INCIDENT: ✅ 14 类型 S1-S4 全生命周期；首五分钟非 DEV S1 展示保护（300000ms 半开区间）
EVIDENCE: ✅ 证据袋（角色卡入口）23 个证据门控选项
RESPONSIBILITY/BLAME/POSTMORTEM: ✅ 背锅/反击/复盘全链
TECH DEBT: ✅ 7 领域；60 天矩阵三策略 viable（BALANCED 最优 5496 分）
NPC MEMORY: ✅ mem:<NPC>:<FLAG> 跨事件引用

=============================================
COMBAT
=============================================
MONSTERS/ELITES/BOSSES: ✅ 21 怪物（12 普通/4 精英/5 Boss），五波确定性推进
SKILL CHOICE: ✅ 升级暂停 + 三选一（skillOffers 挂起，tick break）
BUILD: ✅ 4 个 Build（Java并发流/数据库事务宗/缓存击穿掌/摸鱼养生流）
LOOT: ✅ 材料表 + Boss 掉落 + rewardsClaimed exactly-once
NIGHT FATIGUE: ✅ 夜班攻击倍率与掉落加成
RUNTIME PROOF: ✅ 修复后真实 Electron：第 1 波 3 敌人、击杀累计、Lv2 升级、offers 挂起
  （probe 日志 + first-combat.png）；修复前为「第 N/5 波：（空敌人列表）」零敌人空转
任务/事故副本: ✅ startBattleRun('PROJECT'|'INCIDENT', linkedTaskId/linkedIncidentId)

=============================================
CAREER
=============================================
PROMOTION: ✅ 条件门控 + 渡劫答辩三题（V2）；平衡 D8 首次晋升（PASS）
SECT: ✅ 四宗门加成；TECHNIQUES/EQUIPMENT: ✅ 功法三槽 + 法宝三槽
KPI: ✅ 首日任务链完成即计入

=============================================
BALANCE
=============================================
见 ai/reports/V4-BALANCE-FINAL.md（真实模拟输出）。
7/30/60 天矩阵 + 8 项判据：六项 PASS；FREE_OVERTIME 35h / AD_FREQ 7天 / AD_ECONOMY 30.84% 三项 WARN，
OVERALL WARN——如实保留。ALWAYS_DOMINANCE 0%、NEVER_VIABLE 0%、MIND_LOCK 0d、DEAD_END 0。

=============================================
ONBOARDING
=============================================
TUTORIAL V2: ✅ tutorialVersion=2；WELCOME→FIRST_WORK→FIRST_FISH→FIRST_CULTIVATE→FIRST_TASK；
  观察式推进（读真实行为计数）、30 游戏秒超时、可跳过且跳过=正常完成终态；
  旧档迁移幂等（completed 永保持；旧未完成步骤→WELCOME）
DESKTOP BRIDGE: ✅ 首页场景只读引导条 [data-tutorial-hint]（pointer-events:none，完成后不再现）
DOCS: ✅ FIRST-10-MINUTES / FIRST-30-MINUTES / FIRST-DAY-EXPERIENCE 全部为当前玩法
S1 PROTECTION: ✅ tutorialStartedAt 后 300000ms 半开窗口；canonical 保留、展示 withheld；DEV forceTrigger 绕过

=============================================
PC UI
=============================================
SCHEME B HOME: ✅ 1280×720 单屏无纵向滚动（home-layout.test.ts 三分辨率断言）
ACTION SELECTOR: ✅ 四动作卡选择器 + 详情面板联动；默认选中跟随当前状态
NAV: ✅ 首页/任务/项目/修仙/晋升/更多 六项；合成收纳于更多
MODAL ARBITRATION: ✅ 单一队列走 facade.queryNextPresentation；
  S1>Pending>Promotion>TutorialCritical>Workplace>Daily>Info；
  Pending 仲裁阶段只读投影，选中后才 prepare（ed4e934/2978d2e/dd3fae3/28dda9f/1b79e76）

=============================================
SAVE
=============================================
STRESS: ✅ seed 4102 × 100 次混合 save/load
CORRUPT REPAIR: ✅ 损坏 pending/battle/overtime/未知枚举/错型/重复ID/不可能数值 → 局部修复保留其余状态
FIRST-DAY HARDENING: ✅ 54d0bad（首日存档加固 + 展示策略）
ISOLATED BATTLE SAVE: ✅ 战斗存档隔离与损坏拦截（54d0bad 之前批次）

=============================================
TEST
=============================================
npm run build:game: ✅ PASS
npm run content:check: ✅ PASS（129 V2 events；V3 20/50/boss 6/chains 10；V4 47/6/weekend 2/mgmt 2）
npm run gameplay-v2:check: ✅ PASS（legacy merge check merge-free）
npm test: ✅ PASS — Executed 118 test files
npm run release:check: ✅ PASS — Executed 118 test files
npm run pc:check: ✅ PASS（场景组件注册齐全 + bundle 新于源码）
npm run pc:build: ✅ PASS（Cocos Creator 3.8.4；exit 36 wrapper 已确认 fresh artifact）
npm run pc:pack:portable: ✅ PASS（见 RUNTIME）

=============================================
RUNTIME
=============================================
真实 Electron（开发构建）: GAME_READY / GAME_DIV=true / CANVAS=true / 720x1280
真实 Electron（打包 EXE）: 生成 dist/牛马修仙传-win32-x64/牛马修仙传.exe，
  SHA-256 = 4486DC32DB9B964BABF636EA93C47AFA1D8834D091576F59223B2B5E371B0C66，
  实机启动日志：[Electron] ✅ GAME_READY received from renderer + Storage initialized +
  GameFacade initialized + All systems wired + 自动存档 Save successful
截图: ai/reports/screenshots/v4.1/ 11 张真实运行截图（全部 SHA-256 唯一）：
  first-launch / first-work / first-fishing / first-task / first-project / first-combat /
  first-event / first-1755 / first-offwork / welcome-back / auto-policy
  捕获脚本: capture-v41-final.cjs 与 recapture-combat.cjs（screenshots 目录被 .gitignore
  忽略，脚本与 PNG 同目录留存于本地工作区，不入库）

=============================================
ISSUES（本轮发现并处置）
=============================================
BLOCKER-1（已修复）: Cocos Web 构建把 `[...map.values()]` 转译为 `[].concat(map.values())`，
  concat 不展开迭代器 → 战斗 spawnWave 候选恒空 → 敌人零生成、战斗秒胜空转。
  修复：battle-service.ts / merge-board.ts / cocos-audio-backend.ts 四处改 Array.from。
  （单测用 tsc/ES2020 不转译所以此前全绿——运行时验证的价值正在于此）
BLOCKER-2（已修复）: 全新存档启动即弹「欢迎回来」简报（离线 1 秒），点击「继续上班」时
  claimOfflineReward 对过短离线抛异常且不关闭弹窗 → 玩家永久卡在启动弹窗。
  修复：<60s 且无待决不弹简报 + claim 失败也强制关闭弹窗。
HIGH-1（已修复，前一轮）: V2 事件「知道了」按钮绑定选择器错配 → 事件弹窗无法关闭（1b79e76）。
HIGH-2（已修复，前一轮）: queryWorkToday 在 gameDay=null 时抛 TypeError（f5890ca）。

=============================================
FINAL VERDICT
=============================================
ALPHA READY FOR HUMAN PLAYTEST。
核心循环（工作/摸鱼/修炼/任务/事件/项目战斗/结算）、离线托管、首日保护、存档韧性、
PC 单屏 UI 均有真实运行证据；遗留为 4 个场景截图 MANUAL_REQUIRED 与 3 项平衡 WARN（不阻塞）。
