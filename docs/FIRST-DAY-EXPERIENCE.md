# First-Day Experience — 首日体验契约（V4.1）

> 本文描述玩家第一天的完整节奏与保护规则。所有断言均可在
> `tests/v4/first-day-reachability.test.ts`、`tests/v4/first-day-protection.test.ts`
> 与 `tests/v4/home-layout.test.ts` 中复核。

## 一天的节奏（09:00 → 结算）

| 时段 | 内容 |
|---|---|
| 09:00 | 开工：gameDay 建立，四类「今日局势」chips 出现在首页场景左上；软引导 WELCOME 开始 |
| 09:00 – 12:00 | 工作 / 摸鱼 / 修炼自由切换；首个任务可完成领取；软引导随真实动作推进并在任务领取后完成 |
| 开工后数分钟 | 首个职场事件自然出现（确定性首日为双选择事件）；事件结果写入最近动态与当日统计 |
| 任意时刻 | 「项目」页进入五波战斗：升级技能三选一、Boss 掉落、胜利自动完成一条待办 |
| 17:55 | 场景切入黄昏氛围；倒计时显示 5 分钟；免费加班询问可能出现 |
| 18:00 | 未加班则出现「查看今日结算」；结算弹窗给出称号、评级、四活动时长与收入 |
| 结算后 | dayIndex +1，次日 09:00 再开工；离线期间收益由 AutoPolicy 托管 |

## 确定性首日回归

- 种子 `seed = 4101`（mulberry32），起始时间为**周一 2026-09-21 09:00:00 Asia/Shanghai**（`FakeClock` 注入）。
- 固定动作序列：工作 60s → 摸鱼 60s → 修炼（cultivate）→ 领取「写日报」→ 事件选择 → 项目战斗（build_redis，技能三选一自动选第一项）→ 17:55 → 拒绝免费加班 → 18:00 结算。
- 断言：全程不依赖招募 / 合成（`facade.context.board === null`）；所有资源保持有限且非负；两个选择分支（A/B）到达同日结算且评级一致；结算 `statusText` 含「准时下班」；`dailyHistory` 恰好 1 条。
- 战斗奖励 exactly-once：`finished.rewardsClaimed === true`，重复结算不会二次发放。

## 首日两个事件分支

seed 4101 首日自然调度到一个**双选择事件**（`reachNaturallyScheduledChoice`，最多重试 12 个 26 分钟窗口）。分支 A 与分支 B 分别对应接受 / 保守两种职场应对：

- 两分支产生不同的真实收益/代价（`choiceId` 不同）；
- 无论如何选择，当日都能到达结算且评级一致——首日不会因单次选择死局。

## 免费加班可以明确拒绝

- 17:55 时 `queryTimeUntilOffWork() === 5 分钟`，`offerOvertime('REQUESTED', true, 2h)` 进入 OFFERED。
- `declineOvertime()` 返回 success；随后 `queryOvertime()` 为 null、`queryOvertimeStatus()` 保留 COMPLETED 投影——**拒绝的决定不会在 18:00 前被重复询问**（桌面 UI 契约：`[data-action="requestFreeOvertime"]` 不得复现）。
- 拒绝不记任何加班时长与工资（`overtimeStats` 逐字段不变）。

## 前五分钟 S1 保护

- 保护窗口为 `[tutorialStartedAt, tutorialStartedAt + 300_000)`（游戏时钟毫秒，随存档持久化）。
- 窗口内**非 DEV 的 S1 事故**保留在 canonical 事件 / 事故存储中，但不出现在任何展示投影里；窗口关闭后按正常优先级展示。
- `devForceEvent`（DEV 面板 / 测试）可绕过保护，便于演练。
- 精确性：第 300000ms 起 S1 可展示（边界由 `first-day-protection.test.ts` 锁定）。

## 软引导不锁死

- 引导（tutorialVersion = 2）只做**观察式**推进：`isConditionMet` 读取玩家的真实行为计数（workSeconds / fishingSeconds / cultivationExp / activeTasks），从不校验或拦截命令。
- 每条提示存在两种自然消失方式：触发对应动作，或 30 游戏秒超时（`TUTORIAL_HINT_DURATION_MS`）。
- 玩家完全忽略引导时：提示逐条超时，最后一个任务步骤在领取任意任务后完成；跳过教程（`advanceTutorial` / complete）写入与正常完成相同的终态（`tutorialCompleted = true`, `tutorialVersion = 2`），不会弹出阻塞确认框。
- 旧存档迁移（幂等）：已完成的教程永远保持完成；旧的未完成步骤（FIRST_RECRUIT / SECOND_RECRUIT / FIRST_MERGE / START_WORK / CHECK_KPI / FIRST_PROMOTION）映射到 WELCOME；非法时间戳以当前游戏时钟重建一次。
- 桌面端桥接：首页场景顶部只读引导条（`[data-tutorial-hint]`，`pointer-events: none`），完成教程后不再出现（`home-layout.test.ts` 锁定）。
