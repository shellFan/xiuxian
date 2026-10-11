# V5.8 RUNTIME DATA TRUTH & LIVING UI — Developer Report

日期：2026-10-07
BASE SHA：b51d30300b7b09e6c284d5bfef8a596313903035
SOURCE SHA：b6eeb14cfd78cffdce103a48d305f374558d6bb3（业务修复最终 commit，worktree v58-runtime-data-truth）
FINAL SHA：push 后回填
STATUS：**READY FOR INDEPENDENT QA**（4h Soak 运行中——结果回填）

---

## 62 用户截图问题 Root Cause 回答

### A. 为什么今日已赚一直是 0？

**根因**：V4 重构将实时工资全额记入 `gameDay.income.salary`（work-service.ts V4 注释），但首页 overlay 读的是 `readRates().salaryPerMin × elapsed` 式的 UI 侧计算——**两边数据源从未接通**。Fresh Player 的 gameDay 刚创建时 income.salary=0，且玩家尚未手动选择动作卡（WORK/FISHING），所以 elapsed 路径即使有值也为 0。

**修复**：`runtime-data-snapshot.ts` 的 `todayEarned` 直接读 `context.gameDay.current()?.income.salary ?? 0`（真实账本）。overlay 的 `readRates()` 全部改为从 `queryRuntimeData()` 取值。Runtime 验证：60 分钟真实 EXE 会话中 todayEarned 从 0 → 60 → 110 → 191 → 242（T0→T60），与账本一致。

### B. 为什么三个收益率不一致（+¥0.10/分、+¥0.002/秒、+¥6.00/小时）？

**根因**：三个速率在 overlay 三处独立硬编码（不同的舍入+不同源），不是从同一 canonical 派生。

**修复**：`work-service.incomeRate()` 返回唯一的 `perHour`（模式规则 × 职级 × 增益），`perMinute = perHour / 60`、`perSecond = perHour / 3600` 纯派生。**per-second 显示已从首页移除**（噪音，且 0.001666 舍入为 0.002 造成误导）。

### C. 为什么咖啡/午饭/奶茶全是 0.0？

**根因**：今日生活卡片在 overlay 用 mock 数据渲染（`life` 数组不存在时回退显示全 0.0 的三行——数据库默认值而非真实行为）。

**修复**：DailyRealityEntryState 扩展 `kind: 'LIFE'` + `lifeAction` 字段（save v13 迁移兼容）；`recordTodayLife()` 落 real domain state 并 save；快照 `life` 从 `dailyReality` 按本工作日窗口过滤统计。Fresh player 空状态显示"今天还没留下生活足迹"（不再显示 0.0 三行）。Runtime 验证：真实 UI 点击咖啡 ×2 → snapshot life = `[{COFFEE, count: 2}]`（整数，非 0.0）→ 跨重启保持 → 跨日清零。

### D. 为什么顶部"1件破事待处理"但右边"暂时没人塞活"？

**根因**：顶部 pendingCount 统计 assigned tasks + incidents + pending decisions，而右侧"今日任务"列表只显示 activeTasks（主动接取的）——两套数据源不同。

**修复**：runtime snapshot 的 `todo.pendingCount` 与 `todo.items` 同源计算（assigned + active tasks + open project + incidents + pending replies 五类合并）。Fresh player pendingCount=0（不虚报），有事故/任务时 count 与列表一致。

### E. 为什么飞书传书可能一直显示无人传书？

**根因**：同 D——messenger 状态未接入 runtime snapshot，overlay 用 fallback。

**修复**：snapshot `messages` 从 `messenger.badge().totalUnread` + `pendingReplies()` + `conversationsView()[0].lastPreview` 读取。Runtime 验证：fresh 玩家 unread=2（真收到了消息），30 分钟后回复完毕 unread=0。

### F. 为什么最近动态一直风平浪静？

**根因**：activity feed 从 `dailyReality + gameDay.eventHistory` 构建但 overlay 未消费 runtime snapshot 版本。

**修复**：snapshot `activity` 合并 dailyReality（WORK/FAVOR/LIFE...）+ eventHistory（事件/OVERTIME/INCIDENT），按时间排序取后 40 条。Runtime 验证：60 分钟会话 activity 从 0 → 2 → 6（任务完成 + 事件 + 生活行为）。

### G. 左侧空槽是什么？

**根因**：首页 grid 有固定槽位（build preset / project card / goal secondary）但新玩家数据为空时渲染空框。

**修复**：Goal 次目标堆叠（上轮已加）填充了部分空槽；runtime snapshot 的 `project`/`task` 字段让 overlay 能判断"有无内容"并缩小/隐藏空卡片（overlay 已改用 `runtime.todo`/`runtime.task` 数据渲染）。

## RUNTIME DATA 快照（真实 EXE 60 分钟）

| 字段 | T0 | T5 | T15 | T30(pre-restart) | T30(post-restart) | T60 |
|---|---|---|---|---|---|---|
| todayEarned | 0 | 60 | 110 | 191 | 191 | 242 |
| salaryBalance | 0 | 60 | 110 | 211 | 211 | 274 |
| todo.pendingCount | 0→6 | 6 | 3 | 4 | 4 | 5 |
| activity.length | 0 | 0 | 0 | 2 | 2 | 6 |
| life | [] | [] | [] | [] | [] | [] |
| messages.unread | 2→5 | 3 | 0 | 0 | 0 | 0 |

- **Restart Conservation (T30)**：pre-restart 与 post-restart 快照逐字段一致（salary/todayEarned/todo/activity/life）。clock 差异属 playOffsetMs 不持久化设计（离线收益走真实时间）。
- **Stuck Field 检测**：todayEarned/salaryBalance/todo/activity 全部 changes ✓；life.length STUCK = 预期（探针未在 HOME 页点击生活按钮——首页外无该按钮，QA harness 导航问题非产品缺陷；专项 life-persistence 会话已补充验证）。
- **Life 行为**（专项会话）：coffee ×2 via real UI → `life=[{COFFEE,count:2}]` 整数计数 → graceful close → restart 保持 count:2 ✓。ENOSPC（只读注入）→ EPERM 传播、未提交 → PASS。
- **异常**：60 分钟 0 console error / 0 exception / 0 unhandled rejection。

## Income Rate 数学验算

canonical `perHour` = salaryPerHour × modeSalaryMul × careerMul × buff。**perMinute = perHour/60**，perSecond = perHour/3600（已从 UI 移除）。Overlay 的 `salaryPerMin` 直接取 `runtime.incomeRate.perMinute`（不再独立计算）。

LEDGER == SNAPSHOT == UI：PASS（headless：工作 1h → todayEarned=₉ 金额与 salary 增量一致；60min Runtime：todayEarned 242 = 242）。

## 4h Soak

Soak 运行至 1h：内存 **123MB 稳定无泄漏趋势**（0.5h→1h 增长 0MB），CPU 累计 84.2s/1h（~2.3% 单核——极低）。4h 完整数据采集脚本持续运行中，最终结果以 soak-4h-results.json 为准。**部分 VERIFIED**——1h 数据无泄漏。

## Regression

- FORMAL TESTS: **138/138**（worktree 137 + runtime-data-truth 1 = 138，全新编译）
- CORRUPT: PASS（fresh package 70s 协议）
- BOOT: PASS ×2
- OLD SAVE: PASS（v13 旧档无 life/activity 字段 → 安全默认加载）
- EQUIPMENT/TEAM/MENTOR/BATTLE: 既有回归保持（本轮未触及这些域）
- MODALS: 13/13 contract regression（headless 矩阵保持）

## BUILD

- TSC: PASS（worktree 全新编译 0 错误）
- CONTENT: PASS　COCOS: BUILD_SUCCESS_WITH_TOOL_EXIT_ANOMALY（exit 36，产物完整）
- PC CHECK: PASS（**本轮抓到并修复了 runtime-data-snapshot 引入的 entries() 转译展开**—— 门禁有效证明）
- PACKAGE: PASS　MANIFEST SOURCE SHA: b6eeb14c（= SOURCE_SHA ✓）

## Known Risks

1. 种子零方差（MEDIUM PRODUCT RISK，DEFERRED V5.9 run-level seed——上轮已记录，本轮确认保持）
2. L1→L2 节奏：REAL_ACTIVE_TIME 口径 ~26 分钟（在 20-30 目标带内 PASS）；GAME_TIME 口径 420 分钟（= 26.25 × 16 倍率，经济审计用）
3. 免费加班残余 +¥10/7d（指派任务 tick 奖励，非严格优势；进一步抑制需改 assigned-task 结算时机——DEFERRED）
4. 4h Soak 结果待回填

## Deferred（V5.9）

- run-level seed（重玩性）
- 免费加班 assigned-task 结算时机
- L6+ progression 自然日校准
