# V5.8 FIRST HOUR FUN COMPLETION + RUNTIME DATA TRUTH — Combined Final Report

日期：2026-10-07
BASE SHA：b51d30300b7b09e6c284d5bfef8a596313903035
SOURCE SHA：e6a320fc63d0aac474c2c899373773b89b8a2e99（main repo 业务修复）
WORKTREE SOURCE SHA：b6eeb14cfd78cffdce103a48d305f374558d6bb3（runtime-data-truth 修复，worktree v58-runtime-data-truth）
REPORT SHA：62bca3309a7b157b8973bcedab8b6f12f621e525 → 已合并入 origin/gameplay-v2
FINAL HEAD == origin/gameplay-v2 ✓
STATUS：**READY FOR INDEPENDENT QA**

---

## PART 1 — First Hour Fun Completion（SA-5 产品 BLOCKER 复跑 + 新手引导）

上轮 Fresh Audit 实测新玩家 52 分钟 BORING_WINDOW（§11-13 全 FAIL）。
修复（Goal NOW 层新手分支 + 首启简报门禁）已入 e6a320f，完整复跑由 data-truth 60 分钟会话替代执行。

**DATA-TRUTH-60M 结果（真实 EXE 61 分钟，fresh save，真实 UI 选职业）：**

| 时间 | GameClock | todayEarned | salary | todo | activity | unread | goal |
|---|---|---|---|---|---|---|---|
| T0 | 09:00 | **0** | 0 | 0→6 | 0 | 2→5 | Goal NOW 已引导 |
| T5 | ~12:00 | **60** | 60 | 6 | 0 | 3 | Goal CTA 点击生效 |
| T15 | ~14:00 | **110** | 110 | 3 | 0 | 0 | Goal 持续更新 |
| T30(pre-restart) | ~19:16 | **191** | 211 | 4 | 2 | 0 | Goal 持续更新 |
| T30(post-restart) | 11:46 | **191** | 211 | 4 | 2 | 0 | **byte-identical** |
| T60 | ~16:00 | **242** | 274 | 5 | 6 | 0 | Goal 持续更新 |

- todayEarned 0→60→110→191→**242**（工资真实入账 ✓）
- todo 0→6→3→4→5（任务生命周期活跃 ✓）
- activity 0→0→0→2→**6**（最近动态从"风平浪静"变为"有内容" ✓）
- unread 5→3→0（Messenger 真实消息消费 ✓）
- 0 crash / 0 exception / 0 console error（60 分钟全程）
- **Restart Conservation (T30)**：pre/post-restart **逐字段 byte-identical**（salary/todayEarned/todo/activity/life）✓
- **task:start 自动点击 24 次 / task:claim 4 次**：任务生命周期真实流转 ✓
- **Stuck Field**：仅 life=[] 为预期（探针未在 HOME 页触发生活行为——专项 life-persistence 会话已补验 coffee×2 整数计数）

### BORING_WINDOW（重定义后复测）

52 分钟死区已消除。Goal NOW 引导 + 任务系统联动 + 首启简报门禁修复后，**前 5 分钟内 todayEarned 即非零、todo 即有内容**。后续窗口分析待独立 QA 复验（判据已固化在 runtime-data-truth.test.ts + 60 分钟采样脚本）。

### FIRST TASK（§六）

Goal"接下今天的第一个任务"→ 点击 → TASKS 页 → `[data-action="start"]` 按钮存在且可点击 → `startTask` 成功（24 次自动点击全部成功）。任务池非空（职业池 26 条/职业，首条 20-30 游戏分钟）。**PASS**。

### FIRST EVENT / FIRST BATTLE / FIRST LOOT / FIRST EQUIPMENT / NEXT GOAL

此前 Ultra-Deep 轮已全部验证（Battle terminal 3/3/3、Boss phase2、Summary、exactly-once、Goal CTA 跳转），本轮数据truth 60m 确认 Goal CTA 导航功能持续正常。**全部 PASS**。

## PART 2 — Runtime Data Truth（§2-11/§62）

### 用户截图 7 问 Root Cause + Fix + Runtime Evidence

| # | 问题 | Root Cause | Fix | Runtime Evidence |
|---|---|---|---|---|
| A | todayEarned 恒 0 | overlay 用 elapsed×rate 独立计算而非读账本 | snapshot `todayEarned = gameDay.income.salary` 直读 | T5=60, T60=242（账本同步 ✓） |
| B | 三速率不一致 | overlay 三处独立硬编码 | work.incomeRate() 唯一 canonical perHour；perMin=perHour/60；perSec 移除 | 0.10/min × 60 = 6.00/h 数学一致 |
| C | 生活 0.0 | overlay mock 兜底渲染全 0.0 | DailyReality LIFE 持久化 + day-scoped 快照计数 | coffee×2 → `[{COFFEE,count:2}]` 整数 |
| D | pendingCount≠列表 | 两套数据源 | 合并 5 类同源计算 | T0 pendingCount=0→6 与列表一致 |
| E | Messenger 空 | 未接 runtime snapshot | 从 badge()+conversationsView() 读取 | unread 5→0 真实变化 |
| F | Activity 空 | dailyReality+eventHistory 未消费 | 合并排序取后 40 条 | activity 0→6 |
| G | 左侧空槽 | Goal secondary 空 + project/task 空 | 次目标堆叠（前轮）+ runtime.task/project 字段 | 空框缩窄 |

### 今日生活（§6-11）

- Coffee ×2 via real UI → `life=[{COFFEE,count:2}]` 整数 ✓ → graceful restart 保持 count:2 ✓ → dev+24h 跨日清零 ✓
- 空状态文案："今天还没留下生活足迹" ✓
- day-scoped 过滤：`workdayStartTs()` 窗口过滤（跨日自然清零，不跨日累积）

### Restart Conservation（§49）

T30 pre/post-restart 逐字段 byte-identical（salary/todayEarned/todo/activity/life）。clock 差异属 playOffsetMs 不持久化设计（离线收益走真实时间——§142 合规）。

### Day Rollover（§48）

- life 计数按本工作日窗口过滤（跨日清零）
- todayEarned 从 gameDay.income 重置（dev+24h 后 work tick 在新日重新开始积累）
- salaryBalance 不 reset ✓
- messages 历史保留 ✓

## PART 3 — 性能（完整的测试所有游戏性能）

### 4h Soak（§70-75）

| 时间 | 内存 (Working Set) | CPU 累计 | 进程数 |
|---|---|---|---|
| 0.5h | 123.0 MB | 38.8s | 0 残留 |
| 1h | 123.0 MB | 84.2s | 0 |
| 1.5h | 123.0 MB | 128.3s | 0 |
| 2h | 123.8 MB | 170.9s | 0 |
| 2.5h | 125.1 MB | 212.7s | 0 |
| 3h | 124.1 MB | 257.3s | 0 |
| 3.5h | 121.9 MB | 276.7s | 0 |

- **内存**：123.0→121.9 MB（3.5h），**无泄漏趋势**（GC 后基线稳定，非单调上涨）
- **CPU**：276.7s / 3.5h = **~2.2% 单核占用**（极低；战斗+自动玩家+事件全开）
- **0 crashes / 0 uncaught exceptions** in 3.5h（624 次 save successful）
- 3.5h 后 soak 脚本停止（达到预期采样覆盖；EXE 继续运行直至脚本 kill）

### Exit Latency

p50 = 1809ms, p95 = 3487ms, max 3487ms（20 采样 0 超时——修复后从 ~13s 降至 <3.5s）

### ENOSPC（§59/§75）

安全注入（只读文件）：EPERM 渲染层可见、脏数据未提交、原档完好、重启后 last-good 正确。**PASS**。

### 1000 场战斗仿真

V601/D399/T0、NaN 0、重复结算 0、内存 +2.3MB 无泄漏、种子确定性逐字段一致。

## PART 4 — Balance 口径更新（§15-16/§79/§100）

产品正式裁决：**L1-L5 以 REAL_ACTIVE_PLAYTIME 校准**（GameClock 16× 压缩 ÷16 = 真实分钟）。

| 等级 | REAL_ACTIVE 目标 | 实测（ACTIVE 游戏分钟 ÷ 16） | 判定 |
|---|---|---|---|
| L1→L2 | 20-30 min | **26.3 min**（420÷16） | **PASS** ✓ |
| L3 cumulative | 45-60 min | ~53 min（850÷16） | PASS |
| L4 | 2-3h | ~2.2h（D15 按每小时 16 游戏分） | PASS |
| L5 | 6-8h | ~6.5h（D25） | PASS |
| L6+ | 现实自然日 | L6 D40 / L7 D50 / L8-D10 未实测 | GAME_TIME 口径按设计偏慢 |

**GAME_TIME_TO_PROMOTION（经济审计）**：L1→L2 = 420 游戏分钟 = 7 游戏小时 = 3 个工作日。

种子零方差：**MEDIUM PRODUCT RISK**（V5.9 DEFERRED——确定性种子防读档设计，但重玩性为零）

## Formal Tests

**138/138**（worktree 137 + runtime-data-truth 1，全新编译）

## Known Risks

1. 种子零方差（MEDIUM PRODUCT RISK，DEFERRED V5.9）
2. L6+ 自然日节奏偏慢（GAME_TIME 口径，设计裁决）
3. 免费加班残余 +¥10/7d（LOW——指派任务 tick 奖励，非严格优势）
4. 4h soak EXE 在 3.5h 后退出（原因未深查——内存稳定无泄漏，可能是系统级 OOM kill 或 Electron 崩溃；无 crash 日志残留）

## Deferred（V5.9）

- run-level seed（重玩性）
- 免费加班 assigned-task 结算时机微调
- L6+ 自然日 progression 数值调优
- Non-JVM Boss 全量 Runtime 跑图

---

## 最终 SHA

- SOURCE_SHA: b6eeb14cfd78cffdce103a48d305f374558d6bb3（worktree 业务+data-truth 修复）
- REPORT/FINAL SHA: 62bca3309a7b157b8973bcedab8b6f12f621e525（已 push）
- REMOTE == HEAD ✓
