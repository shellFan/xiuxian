# Work Today 与加班系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Gameplay V2 扩展为完整的 Work Today、加班、临时任务与夜间项目玩法，并让这些系统在统一时钟、存档、结算和 PC 首页中真实联动。

**Architecture:** 以 `GameClockV2` 作为唯一时间源。新增持久化的 `WorkTodayState` 与独立 `OvertimeService`，由 `GameDayService` 统一归集所有模式和事件时长；实时工资、购买力、首页卡片和分享卡均只读取投影视图，绝不直接修改工资。配置承载事件、文案、任务、成就和购买力，服务层只解释配置和保证资源/时间守恒。

**Tech Stack:** Cocos Creator 3.8 LTS、TypeScript、现有 `GameContext`/`GameFacade`、JSON content configs、Node test runner。

## Global Constraints

- 在当前 `gameplay-v2` 分支开发并做阶段提交，绝不 force push、reset 或清理用户文件。
- 使用 `GameClockV2`；首页、项目、加班和结算不得各自读取 `Date.now()`。
- `WorkService.tick()` 与 `V2EconomyService.tick()` 必须通过同一个时段门控和速率函数，跨越午休/18:00 的 tick 必须切分区间，绝不双发工资。
- 普通工资仅累计 09:00–18:00 内的有效模式时间；免费加班必须明确 `salary = 0`。
- 所有新持久化字段提供旧存档默认值和 clone/save round-trip 覆盖。
- 任意一天的模式时长、会议、午休、事故与加班时长必须守恒；每日/每周结算 exactly once。
- 事件、NPC、任务、成就、购买力、黄历与文案必须配置驱动，不在 UI 内硬编码内容数组。
- 完成交付前执行完整测试、V2 检查、PC 构建/运行时截图和报告 `ai/reports/WORK-TODAY-SYSTEM.md`。
- 用户已明确授权本需求的阶段 commit 与最终 non-force push；其余 Git 安全约束保持不变。

---

### Task 1: 统一 Work Today 存档与时间投影

**Files:**
- Modify: `assets/scripts/model/save-data.ts`, `assets/scripts/model/player-data.ts`, `assets/scripts/services/save-service.ts`, `assets/scripts/v2/v2-clock.ts`, `assets/scripts/v2/game-day-service.ts`, `tests/v2/phase1-core.test.ts`, `tests/facade/game-facade.test.ts`
- Create: `assets/scripts/v3/work-today-service.ts`
- Test: `tests/v3/work-today-time.test.ts`

**Interfaces:**
- Produces `WorkTodayService.snapshot(nowMs?)`, `{ countdownMs, standardWorkSeconds, overtimeSeconds, freeOvertimeSeconds, paidFishingSalary, allocatedSeconds, timeline }`.
- Extends `GameDayState` with all daily durations, overtime source/status and event history; extends `GameSaveData` with permanent overtime statistics and `compTime`.

- [ ] Write failing tests at 09:00, 12:00, 13:00, 17:30, 17:55, 17:59, 18:00, 20:00, 23:59 and 00:00, asserting one clock-driven countdown and conserved allocation.
- [ ] Add save version 7 defaults, immutable clone/serialize handling, nested-state validation and a migration from save version 6 without direct casts; update all v6 fixtures/assertions.
- [ ] Define cross-midnight ownership: a session remains attached to its originating GameDay until it completes/settles; only after that may `ensureStarted()` roll the next natural date. Test restart/retry boundaries.
- [ ] Implement `GameClockV2` phase helpers (`isPreOffWorkRiskWindow`, `isOvertimeWindow`, `isNightShift`, `isMidnight`) and Work Today projection without any resource mutation.
- [ ] Implement mode/event interval recording in `GameDayService`; record only transitions and settlement inputs, never per-frame save writes.
- [ ] Run `npm test -- tests/v3/work-today-time.test.ts` and commit `feat(v3): add unified work today time accounting`.

### Task 2: Overtime decisions, fatigue, weekend and emergency tasks

**Files:**
- Create: `assets/scripts/v3/overtime-service.ts`, `assets/configs/v3/overtime-events.json`, `assets/configs/v3/overtime-tasks.json`
- Modify: `assets/scripts/core/game-context.ts`, `assets/scripts/services/game-loop-service.ts`, `assets/scripts/services/work-service.ts`, `assets/scripts/v2/v2-economy-service.ts`, `assets/scripts/v2/v2-event-service.ts`, `assets/scripts/v2/event-engine.ts`, `assets/scripts/v2/npc-weekend-service.ts`, `assets/scripts/services/task-service.ts`, `assets/scripts/model/save-data.ts`
- Test: `tests/v3/overtime-service.test.ts`

**Interfaces:**
- Consumes `WorkTodayService`, `GameClockV2`, `NpcService`, `InnerDemonService` and `TaskService`.
- Produces `OffWorkDecision`, `OvertimeSession`, `chooseOvertimeOption(id)`, `startVoluntaryOvertime(hours)` and extended `TaskType` values `OVERTIME`/`EMERGENCY`.

- [ ] Write failing tests for normal leave, requested/free/compensated/forced/emergency/weekend overtime, refusal strategies, cross-midnight sessions and all 1/2/4/overnight durations.
- [ ] Add source-specific session effects: free overtime has salary zero; paid overtime is explicitly compensated; all choices retain at least one response strategy.
- [ ] Add temporary fatigue states (TIRED/EXHAUSTED), consecutive-overtime thresholds 2/3/5/7, weekend sleep recovery and CompTime redemption.
- [ ] Add config-driven task pools with differentiated salary, performance, material, cultivation and NPC rewards.
- [ ] Change game-loop ordering so 18:00 creates an offer/decision before settlement, blocks normal salary after 18:00 and prevents V1/V2 double accrual.
- [ ] Make WorkService transaction snapshots restore every new player/GameDay/Overtime field after save failure.
- [ ] Add 20 overtime-specific pre-off-work events, 30 overtime-specific night events, 5 night bosses and 10 overtime chains including the four required chains; enforce eligibility/cooldown/branch requirements in the event engine.
- [ ] Run focused tests and commit `feat(v3): add overtime decisions and emergency work`.

### Task 3: Economy, NPC, dungeon, achievements and balance

**Files:**
- Modify: `assets/scripts/core/game-context.ts`, `assets/scripts/services/config-service.ts`, `assets/scripts/v2/v2-economy-service.ts`, `assets/scripts/v2/inner-demon-service.ts`, `assets/scripts/v2/npc-weekend-service.ts`, `assets/scripts/services/achievement-service.ts`, `assets/scripts/model/config-types.ts`
- Create: `assets/configs/v3/overtime-achievements.json`, `assets/configs/v3/night-shift-content.json`, `assets/scripts/v3/overtime-balance-simulator.ts`
- Test: `tests/v3/overtime-economy-balance.test.ts`

**Interfaces:**
- Consumes active overtime session and fatigue state.
- Produces mode multipliers, night-shift dungeon modifier, permanent statistics and achievement condition values.

- [ ] Write failing tests for paid fishing salary, free overtime zero salary, each overtime mode multiplier, fatigue penalties, NPC intervention and night modifier rewards.
- [ ] Implement WORK/FISHING/CULTIVATING/SOCIAL overtime modifiers, boss/night-shift eligibility, night monster/boss config and NPC relationship choices.
- [ ] Register overtime content, task, achievement, NPC, purchasing-power, almanac and copy bundles through ConfigService/GameContext; no service or UI owns literal content pools.
- [ ] Add at least 15 overtime achievements, including all named requirements and hidden achievement conditions, through generic stat conditions rather than UI-only flags.
- [ ] Implement deterministic balance simulations proving daily overtime is not the highest long-run strategy and that low Mind/high InnerDemon makes on-time leave preferable.
- [ ] Run focused tests plus simulator and commit `feat(v3): balance overtime rewards and long-term costs`.

### Task 4: Daily and weekly settlement, timeline and sharing projection

**Files:**
- Modify: `assets/scripts/v2/v2-settlement-service.ts`, `assets/scripts/facade/game-facade.ts`, `assets/scripts/facade/game-snapshot.ts`
- Create: `assets/scripts/v3/work-today-presentation.ts`, `assets/configs/v3/work-today-copy.json`
- Test: `tests/v3/work-today-settlement.test.ts`

**Interfaces:**
- Produces `WorkTodaySettlementView`, `WeeklyWorkTodayView`, `DailyShareCardData` and one canonical event timeline.

- [ ] Write failing tests for daily summary fields, weekly totals/titles, “工资已经下班了，你还没有。” state, cross-midnight overtime and exactly-once settlement.
- [ ] Extend daily and weekly summaries with standard/actual/overtime/free/weekend/incident/on-time-leave time, income split, Mind/InnerDemon deltas and black-humor rating.
- [ ] Generate timeline, character status, daily fortune and share-card data from recorded events/config; do not duplicate history manually in UI.
- [ ] Expose read-only facade queries and preserve snapshot equality/serialization behaviour.
- [ ] Run focused tests and commit `feat(v3): enrich work today settlements and history`.

### Task 5: PC Home UI, decisions and settlement presentation

**Files:**
- Modify: `assets/scripts/facade/game-facade.ts`, `assets/scripts/core/game-events.ts`, `assets/scripts/facade/ui-event-types.ts`, `assets/scripts/ui/game-ui-controller.ts`, `desktop/ui-overlay.js`, `desktop/ui-overlay.css`, `desktop/patch-html.cjs`
- Create: `assets/scripts/ui/work-today-component.ts`, `desktop/ui-overlay-v3.js`
- Modify: existing Cocos `TopHeader`/`IdleIncomePanel`/`CharacterArea`/`PrimaryActions`/`ModalLayer` bindings only via the scene rebuild/registration pattern; preserve 720×1280 portrait Creator scene.
- Test: `tests/v3/work-today-ui.test.ts`, `tests/ui/work-today-overlay.test.ts`, scene integrity checks

**Interfaces:**
- Consumes only `GameFacade` Work Today views and commands.
- Produces responsive 1280×720/1600×900/1920×1080 PC views and actionable overtime/weekend choices.

- [ ] Write failing component tests for normal, 17:55, free overtime, weekend, paid-fishing result and daily settlement render states.
- [ ] Add a non-destructive desktop overlay layout: character/status left, countdown/salary/progress center, agenda/purchasing-power/NPC/fortune right, action/navigation bottom; desktop wide layouts use CSS media queries while the Cocos scene remains portrait.
- [ ] Add visible countdown tension, real-time salary projection, purchasing-power tooltip, agenda overflow, companion response, timeline expansion, voluntary overtime and forced-choice modal. Refresh only live nodes once per second; do not replace DOM body or interrupt event modals.
- [ ] Upgrade daily/weekly settlement and share-card regions using existing visual language and expression/icon/color variants rather than blocking on art.
- [ ] Run focused UI tests and commit `feat(v3): surface work today and overtime on pc home`.

### Task 6: Integration, regression, runtime evidence and report

**Files:**
- Create: `tests/v3/work-today-integration.test.ts`, `ai/reports/WORK-TODAY-SYSTEM.md`
- Modify: `scripts/check-v2-content.cjs`, runtime capture helpers only if required by existing Electron verification flow.

- [ ] Write end-to-end failing scenarios covering leave, free/paid/weekend/forced overtime, paid fishing, pause/restore, offline deduplication, midnight crossing and combat-time attribution.
- [ ] Connect project/dungeon entry hooks to the same work-session recorder; ensure combat does not own a second clock or salary path.
- [ ] Verify every content minimum (20 pre-off-work, 30 night, 5 bosses, 10 chains, 15 achievements) in the content checker.
- [ ] Run full `npm test`, `npm run build`, `npm run gameplay-v2:check`, `npm run pc:build`, `npm run pc:copy`, `npm run pc:check` and Electron captures for all six required UI states.
- [ ] Write the required report with clock, countdown, wage, fishing, purchasing-power, agenda, allocation, timeline, weekend, overtime, settlement and V3-combat evidence; commit and push.

## Requirement Traceability

| Requirement group | Delivery task | Proof |
| --- | --- | --- |
| 76-item overtime sources, choices, free/paid/weekend/emergency, fatigue, NPC and CompTime | 2–3 | state-machine, event, NPC and balance tests |
| 20 pre-off-work events, 30 night events, 5 bosses, 10 chains, 15 achievements | 2–3, 6 | config-count checker and eligibility tests |
| time, salary, paid fishing, allocation, todos, purchasing power, fortune, companion and timeline | 1, 4–5 | clock/projection/UI tests |
| daily/weekly settlement, title, share card and real UI states | 4–6 | exactly-once/integration tests and Electron captures |
| unified battle/dungeon time, pause/offline/midnight and no duplicate income | 1–2, 6 | integration and regression matrix |
