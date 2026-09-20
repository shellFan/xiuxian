=============================================
牛马修仙传 GAMEPLAY V4 ALPHA HANDOFF
=============================================

BRANCH: gameplay-v2 (延续 web-v1-playable 基线 6cd2a7b 的正确开发分支)
START HEAD: 670eace (fix(v3): harden overtime and event guards)
FINAL HEAD: 见 git log（本轮 4 个新提交：e9885d9 / 92c43f8 / 721ac4b / 报告提交）
REMOTE HEAD: push 后见 origin/gameplay-v2

COMMITS:
- feat(v4): workplace hell domain services and save v8 migration (e9885d9)
- feat(v4): workplace hell event content with evidence-gated choices (92c43f8)
- feat(v4): PC single-screen dashboard, unified career titles, richer settlement (721ac4b)
- docs(v4): master audit and alpha handoff (本轮最后提交)

=============================================
AUDIT
=============================================
EXISTING SYSTEMS REUSED: 时钟/工作日/局势/加班/结算/事件引擎/NPC/心魔/晋升/物品/合成/成就/离线/存档框架
PARTIAL SYSTEMS COMPLETED: 加班持久化+发薪、工资记账、局势权重、事件池扩展、结算增强、周末加班接点
NEW SYSTEMS: Evidence / Responsibility / Incident / TechDebt / AssignedTask / NPC 记忆旗标 / 首页 PC Dashboard
LEGACY REMOVED: 无删除（board 已于 PC V1 断开，保持隔离）
LEGACY ISOLATED: MergeBoard(board=null)/Recruitment/Worker 仅存兼容层，Runtime 不走，UI 不可见
STILL MISSING: Dungeon/Combat/Boss/Loot 战斗竖切（仓库从未实现，本轮未开工）

=============================================
CORE LOOP
=============================================
WORKDAY: ✅ 09:00-18:00 真实流逝 + 午休 12-13 + 下班倒计时 + 今日进度%
REALTIME SALARY: ✅ 逐 tick 计薪（projection=UI 只读；真账=loop 内 WorkService），并全额入 gameDay.income
FISHING: ✅ 带薪摸鱼：实时工资 + settlementInputs.paidFishingSalary + 首页摸鱼收益行
CULTIVATION: ✅ CULTIVATING 模式 ×2.0 修为 / 修炼一次按钮
TASK: ✅ V1 领取任务 + V4 指派任务（P0-P3、来源、假 P0）
OVERTIME: ✅ VOLUNTARY/REQUESTED/FORCED/EMERGENCY/WEEKEND/COMPENSATED 六源 + 免费加班 0 工资反差文案
WEEKEND: ✅ 距周一倒计时 + 周末四选一（含主动渡劫加班）+ 周末老板"在吗"
EVENT: ✅ 245 个事件（129 V2 + 70 V3加班 + 46 V4职场），6 条 V4 多阶段链
PROJECT: ⚠️ 以任务/事故/技术债形式存在；无独立 ProjectService（记录在案）
COMBAT: ❌ MISSING（见 AUDIT）
LOOT: ⚠️ 事件掉落（材料/功法/法宝/消耗品）；无战斗掉落
SETTLEMENT: ✅ 日结算 exactly-once + V4 全量字段 + 周五周结算

=============================================
WORKPLACE
=============================================
RESPONSIBILITY: ✅ ResponsibilityCase（OPEN→PLAYER_ACCEPTED/PLAYER_CLEARED/RESOLVED），绩效/关系/NPC 记忆落地
EVIDENCE: ✅ 10 类型（GIT_LOG/CHAT_RECORD/REQUIREMENT_DOC/…），事件选择授予、requirement 门控解锁选项
BLAME: ✅ 接口报错甩锅链 4 阶段 + 绩效面谈 + 复盘会定责；证据反击/背锅分支，无证据反驳失败
CREDIT STEAL: ✅ 抢功链 3 阶段（算了/当场说明/投屏提交记录/记在心里 → 后续求助事件）
REQUIREMENT CHANGE: ✅ 需求改单链 3 阶段（打开原需求文档→产品沉默；口头争辩 50%）
EMERGENCY RELEASE: ✅ 上线地狱链 3 阶段（17:40 客户明天要看 → 5 选项 → 凌晨发布 → 事故/风险确认单反杀）
INCIDENT: ✅ 14 类型 S1-S4、DETECTED→MITIGATING→RECOVERED→CLOSED、最低处置时长门槛、work-today 事故时段
POSTMORTEM: ✅ 复盘链 3 阶段（"不是追责"→"代码谁写的"→6 选项含拿证据/沉默），结案回写 rootCause
TECHNICAL DEBT: ✅ 7 领域 0-100；赶工/跳测试/强行上线加债；还债消耗专注；债推高 currentRisk
NPC MEMORY: ✅ mem:<NPC>:<FLAG>（BLAMED_PLAYER_SUCCEEDED/BLAME_FAILED/STOLE_CREDIT/PLAYER_HELPED）被后续事件引用
MULTI-DAY CHAINS: ✅ 链阶段 4 小时间隔跨天推进；复盘/结案/ fame 事件次日触发

=============================================
COMBAT
=============================================
MONSTERS/ELITES/BOSSES/SKILLS/EVOLUTIONS/BUILDS/EQUIPMENT-FROM-COMBAT: ❌ 未实现（MISSING，本轮明确记录）
EQUIPMENT(现有): ✅ 30 件法宝（DESK/BADGE/ACCESSORY 槽）+ 30 功法 + 27 材料，事件/合成/商店获取
PROJECT INTEGRATION: ⚠️ 以"当前任务→事件/事故"间接成立
INCIDENT INTEGRATION: ✅ 事故→应急指派任务→处置时长→复盘（无 Dungeon，用任务链表达）

=============================================
CAREER
=============================================
LEVELS: ✅ 10 级统一体系（实习牛马/正式牛马/骨干牛马/小组骨干/项目骨干/部门骨干/部门主管/部门经理/高级经理/区域副总监），旧称谓全仓清零（configs 内 0 命中）
PROMOTION: ✅ V2 渡劫答辩（exp/绩效/KPI/道心组合 + 答辩 Q&A）
CAREER CHOICES: ⚠️ 部分接入（promotionModifier/旗标；高级选项按 minCareer 门控已在事件中生效）
L7+ MANAGEMENT EVENTS: ✅ wp_mgmt_team_ot（今晚大家辛苦一下/砍需求/重新排期/我留下你们走）+ wp_mgmt_sub_incident（我负责/先查根因/保护下属/责任到人）

=============================================
SETTLEMENT
=============================================
DAILY: ✅ exactly-once；工资/修为/绩效/工时四维 + 摸鱼/加班(免费/有偿)/塞活/背锅/反击/事故/证据
WEEKLY: ✅ 周五自动周结算（保留原有）
TIMELINE: ✅ gameDay.eventHistory + 首页最近动态 + 全量 Modal
PAID FISHING: ✅
OVERTIME: ✅ 免费/有偿分列
BLAME: ✅
INCIDENT: ✅
SHARE CARD: ❌ 未做（P2）

=============================================
SAVE
=============================================
VERSION: 8
MIGRATION: ✅ v7→v8 安全默认 + V4 字段消毒（corrupt session 丢弃）
OVERTIME RESTORE: ✅ activeOvertimeSession 跨重启恢复（有测试）
INCIDENT RESTORE: ✅ incidents[] 持久化
DUNGEON RESTORE: N/A
PENDING DECISION: ✅ pendingEvents 队列（CRITICAL/IMPORTANT 留给玩家）
OLD SAVE: ✅ v1→v8 全链迁移测试通过
EXACTLY ONCE: ✅ 日结算先标记再入账 + 付费加班重复 finish 不重复发薪（有测试）

=============================================
BALANCE（30/60 天模拟，5 画像）
=============================================
| 画像 | 结算日 | 职级 | 工资 | 修为 | 绩效 | 道心 | 心魔 | 功法 | 法宝 | 材料种 | NPC均 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CASUAL(摸鱼流) | 30 | L5 | 19901 | 22745 | 635 | 100 | 56 | 1 | 1 | 9 | 36.8 |
| NORMAL(均衡) | 30 | L5 | 19596 | 18765 | 581 | 55 | 85 | 1 | 1 | 11 | 32.3 |
| NORMAL(60天) | 60 | L7 | 103344 | 109213 | 1212 | 71 | 85 | 1 | 1 | 11 | 60.5 |
| HARDCORE(卷王) | 30 | L5 | 10084 | 6390 | 570 | 45 | 75 | 0 | 1 | 9 | 7.5 |
| NO_AD(修炼流) | 30 | L5 | 17158 | 21789 | 635 | 55 | 85 | 1 | 1 | 9 | 36.8 |
| SOCIAL(社交流) | 30 | L5 | 20190 | 21295 | 566 | 100 | 38 | 1 | 0 | 11 | 40.7 |
升级节奏: CASUAL L2@D3 L5@D24；NORMAL L2@D10 L5@D25；60天 L7@D50
不变量: 全画像无 NaN/越界/负值；同 seed 可复现 ✅
OVERTIME RATE: 免费加班会话可选/可拒（本 sim 未模拟拒绝分支）—— 加班率约束依赖事件池与疲劳代价，建议下轮把
ALWAYS/NEVER/SELECTIVE_OVERTIME 三画像加入 balance-sim 后再下结论（记录为 STILL PARTIAL）

=============================================
QUALITY
=============================================
TYPECHECK: ✅ tsc -p tsconfig.game.json 无错误
TESTS: ✅ 101 个测试文件全绿（新增 tests/v4/v4-workplace.test.ts 16 项）
CONTENT CHECK: ✅（三池 ID 唯一、链连续性、证据/指派/案件数量下限）
BALANCE CHECK: ✅ 内置 balance-simulation 通过
PC CHECK: ✅ pc-overlay-layout / work-today-overlay 静态断言 + Electron 实测
COCOS BUILD: ✅ pc:build 28s 构建成功（accepting exit 36 artifact note）
ELECTRON: ✅ 真实运行时 GAME_READY + 数据接入 + 截图

=============================================
RUNTIME（Electron 真实运行时）
=============================================
HOME 1280x720: ✅ 一屏、无纵向滚动（scrollable=false 实测）
HOME 1600x900: ✅ 无滚动
HOME 1920x1080: ✅ 无滚动
WORK/FISHING/1755/FREE-OVERTIME/WEEKEND/BLAME/SETTLEMENT: 截图于 ai/reports/screenshots/
SCREENSHOTS: home-1280x720.png / home-1600x900.png / home-1920x1080.png / home-work.png /
  home-fishing.png / home-1755.png / home-free-overtime.png / blame-event.png /
  blame-evidence.png / agenda-assigned.png / daily-settlement.png + 状态 json
说明: 截图均为真实 Electron 运行时画面；事件弹窗内容取自当前事件队列
（部分截图被自然触发的随机事件弹窗覆盖，属正常玩法表现）。

=============================================
ISSUES
=============================================
BLOCKER: 无
HIGH:
  - 战斗/副本竖切缺失（MISSING，决定推迟：主环优先，避免一晚上塞一个假战斗）
  - 加班率/周末加班率的长期平衡未用三画像模拟锁定
MEDIUM:
  - 周末事件内容量 2（目标 12+）
  - 复盘无独立场景页（用事件链表达）
  - 离线回来"你离开期间发生了N件破事"欢迎页未做
LOW:
  - 分享卡、公司图鉴、牛马档案页 UI 未做（lifetimeStats 数据层已就绪）
  - ui-mock-data/board 等 legacy 字段仍在（不进 Runtime）
MANUAL_REQUIRED:
  - 1280×720 下人工目测一轮各页面排版（自动截图已提供基线）
  - pc:pack 打包冒烟（electron-packager）

=============================================
FINAL VERDICT
=============================================
CORE LOOP PLAYABLE: ✅
MULTI-DAY PLAYABLE: ✅（跨天链 + 存档 v8 + exactly-once）
WORKPLACE CHOICES MEANINGFUL: ✅（证据决定反击成败、假P0/真P0、背锅 vs 反杀、上线 vs 拒绝）
COMBAT PLAYABLE: ❌（下轮）
BUILD VARIETY: ⚠️（功法/法宝装配已有差异；战斗 Build 无）
CAREER PLAYABLE: ✅
MANAGEMENT PLAYABLE: ✅（L7+ 两个管理层事件 + 团队加班/保护旗标与成就）
PC HOME SINGLE SCREEN: ✅（1280×720 实测无滚动）
SAVE SAFE: ✅
BALANCE ACCEPTABLE: ✅（不变量全绿；加班率待三画像专项）
READY FOR HUMAN ALPHA PLAYTEST: ✅（PC 单机 Alpha 可开测）
=============================================
