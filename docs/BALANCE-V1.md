# Balance V1

Source of truth: `assets/configs/*.json` (minutes are design targets, not hardcoded in UI).

## Targets

- New player: first noticeable upgrade in **5–10 minutes** (career level 1 KPI).
- First promotion: **20–30 minutes** (level 1 → 2).
- Early game: first 4–5 stages in **2–4 hours**.
- Offline rewards: noticeable, but do not replace active play (8h cap in `idle.json`).

## Career / expected minutes

| Level | Name | requiredExp | KPI work seconds | salary/hour (L1 worker) | mind drain/hour | expected minutes |
|------:|------|------------:|-----------------:|------------------------:|----------------:|-----------------:|
| 1 | 练气职员 | 0 | 300 | 10 | 60 | 8 |
| 2 | 筑基职员 | 100 | 600 | 20 | 60 | 25 |
| 3 | 金丹主管 | 300 | 900 | 40 | 60 | 50 |
| 4 | 元婴主管 | 700 | 1200 | 80 | 60 | 90 |
| 5 | 化神经理 | 1500 | 1500 | 160 | 60 | 150 |
| 6 | 炼虚经理 | 3000 | 1800 | 320 | 60 | 210 |
| 7 | 合体总监 | 6000 | 2100 | 320 | 60 | 280 |
| 8 | 大乘总监 | 12000 | 2400 | 320 | 60 | 360 |
| 9 | 渡劫副总 | 24000 | 2700 | 320 | 60 | 480 |
| 10 | 飞升董事 | 50000 | — | 320 | 60 | 600 |

Rates come from `career.json`, `kpi.json`, `idle.json`, and `worker.json`. Offline salary uses the same per-hour table and is capped at 8 hours.

## Career Multipliers

| Level | salaryMultiplier | cultivationMultiplier |
|------:|-----------------:|---------------------:|
| 1 | 1.0 | 1.0 |
| 2 | 1.2 | 1.15 |
| 3 | 1.5 | 1.35 |
| 4 | 1.8 | 1.6 |
| 5 | 2.2 | 1.9 |
| 6 | 2.7 | 2.3 |
| 7 | 3.3 | 2.8 |
| 8 | 4.0 | 3.4 |
| 9 | 5.0 | 4.2 |
| 10 | 6.5 | 5.0 |

## Worker Levels

| Level | Name | salary/hour |
|------:|------|------------:|
| 1 | 实习牛马 | 10 |
| 2 | 普通牛马 | 20 |
| 3 | 高级牛马 | 40 |
| 4 | 资深牛马 | 80 |
| 5 | 牛马主管 | 160 |
| 6 | 牛马总监 | 320 |

## KPI Requirements

| Career Level | MERGE_COUNT | WORK_SECONDS | CULTIVATION |
|-------------:|------------:|-------------:|------------:|
| 1 | 3 | 300 | 50 |
| 2 | 5 | 600 | 120 |
| 3 | 8 | 900 | 250 |
| 4 | 12 | 1200 | 400 |
| 5 | 16 | 1500 | 600 |

## Offline Rewards

- Max offline time: **8 hours** (28800 seconds)
- Salary per hour: same as worker level table [10, 20, 40, 80, 160, 320]
- Cultivation per hour: [5, 10, 20, 40, 80, 160]
- Offline rewards are noticeable but do not replace active play

## Promotion

- Success rate: **70%** base (from `promotion.json`)
- Failure: mind drain, `promotionFailCount` incremented
- Requires: KPI completed + cultivation >= requiredExp + career level check

## Buff System

| Buff Type | Effect | Typical Duration |
|-----------|--------|-----------------|
| WORK_SALARY_BOOST | Multiplies work salary | 60-300s |
| WORK_CULTIVATION_BOOST | Multiplies work cultivation | 60-300s |
| FISHING_MIND_BOOST | Multiplies fishing mind recovery | 60-300s |
| MERGE_REWARD_BOOST | Multiplies merge rewards | 60-300s |

## Daily Systems

### Daily Sign-in (7-day cycle)
- 7-day cycle with escalating rewards
- Grace period: configurable hours after midnight
- Streak resets on missed day (outside grace)

### Daily Tasks
- Generated once per game day (midnight boundary)
- Types: MERGE_5, WORK_10_MIN, FISH_3_MIN, SALARY_100, CULTIVATION_50, EVENT_3, PROMOTION_1
- Progress tracked via `dailyTasks.addProgress()` / `dailyTasks.setProgress()`
- Rewards claimed through Effect Engine

## Achievement Categories

| Category | Condition Types | Example |
|----------|----------------|---------|
| MERGE | KPI (MERGE_COUNT) | FIRST_MERGE, MERGE_10, MERGE_50, MERGE_100 |
| SALARY | SALARY (target) | SALARY_1000, SALARY_5000, SALARY_10000 |
| CAREER | CAREER_LEVEL (target) | REACH_LIANQI through REACH_FEISHENG |
| EVENT | EVENT_TYPE (eventType) | RARE_EVENT, EASTER_EGG |
| PROMOTION | PROMOTION (target) | PROMOTION_SUCCESS, PROMOTION_5 |
| OFFICE | OFFICE_LEVEL (target) | OFFICE_3, OFFICE_5 |
| MIND | MIND_FULL | MIND_FULL |
| IDLE | IDLE_CLAIM | IDLE_CLAIM |
| SECT | SECT_JOIN | SECT_JOIN |
| TALENT | TALENT_PICK | TALENT_PICK |
| WORK | WORK_SECONDS (target) | WORK_1H, WORK_10H |

## Game Loop Step Order

1. `buffs.tick(seconds)` — expire finished buffs
2. `work.tick(seconds)` — salary/cultivation/mind + buff multipliers + daily task progress
3. `kpi.recordSalaryEarned(workResult.salary)` — KPI salary tracking
4. `events.emit('playerChanged'/'mindChanged')` — event emission
5. `careerEvents.poll()` — CareerEventScheduler auto-dispatch
6. `achievements.checkAll()` — periodic achievement check
7. `dailyTasks.refresh()` — detect day rollover, regenerate tasks
8. `tutorial.checkAutoAdvance()` — tutorial auto-advance
9. `autoSave` — periodic auto-save