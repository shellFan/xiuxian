# Gameplay V4 Alpha Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the V4 Alpha offline policy, resumable welcome-back decisions, deterministic long-run balance evidence, and accurate player-facing final documentation.

**Architecture:** Extend the existing `IdleService` and `OfflineRewardService` with one pure, globally capped time-segmentation projection and preserve their current single settlement/idempotency path. Persist a four-value AutoPolicy plus an `OfflineDecisionSession` that references canonical `pendingEvents` by stable IDs; the desktop welcome flow renders that session, never a copied event queue. The balance simulator remains analysis-only, deterministic, and produces reports from measured results.

**Tech Stack:** Cocos Creator 3.8 / TypeScript, Node test harness, desktop HTML/CSS/JavaScript overlay, JSON/TypeScript content configuration.

## Global Constraints

- Work only on branch `gameplay-v2`; preserve the user workspace; no reset, clean, force push, or second reward/event system.
- Legacy AutoPolicy values map deterministically: `ALWAYS -> GRINDER`, `NEVER -> SLACKER`, `SELECTIVE -> NORMAL`; absent or unknown values become `NORMAL`.
- Claim timestamps are finite Unix epoch milliseconds. The offline segmenter uses the explicit IANA logical game zone `Asia/Shanghai` (not the operating-system zone), whose calendar is UTC+08:00 without DST. Claim interval is half-open `[lastSaveTime, min(now, lastSaveTime + 8h))`: an instant at 09:00 belongs to work, 12:00 belongs to lunch, 13:00 belongs to work, 18:00 belongs to after-hours, and Saturday 00:00 belongs to weekend. It is capped once before segmentation; no DST-specific extra reward is granted.
- `pendingEvents` remains canonical. Presentation may show at most 12 entries, but storage must retain every unresolved S1 event and deterministically summarize only overflow lower-priority events.
- Offline simulation never runs AFK combat and never silently resolves S1/S2 incidents or permanent responsibility choices.
- Reward settlement stays exactly-once through `lastIdleSettlementId`; preview is mutation-free, normal/double claim is mutually exclusive, and x2 applies only base salary/cultivation/spirit stones.
- Runtime results are PASS only with captured real Electron evidence; unavailable cases are `MANUAL_REQUIRED`.

---

## File Map

- `assets/scripts/model/save-data.ts`, `assets/scripts/model/player-data.ts`, `assets/scripts/services/save-service.ts`: versioned durable policy/session migration.
- `assets/scripts/services/idle-service.ts`, `assets/scripts/services/offline-reward-service.ts`: pure segmented projection and exactly-once application through the existing settlement path.
- `assets/scripts/v3/auto-policy-service.ts`, `assets/scripts/core/game-context.ts`, `assets/scripts/v3/offline-welcome-content.ts`: policy choices, pending-event session lifecycle, and configured copy.
- `assets/scripts/facade/game-facade.ts`, `desktop/ui-overlay.js`, `desktop/ui-overlay.css`: concise PC setting and resumable summary/decision UI.
- `scripts/overtime-balance-simulator.ts`: seeded 7/30/60-day strategy matrix and threshold output.
- `tests/offline/*.test.ts`, `tests/v3/*`: behavior locks; `docs/*` and `ai/reports/*`: audited player and release documents.

### Task 1: Persisted contracts and safe migration

**Files:**
- Modify: `assets/scripts/model/save-data.ts`, `assets/scripts/model/player-data.ts`, `assets/scripts/services/save-service.ts`
- Test: `tests/offline/offline-auto-policy.test.ts`, `tests/offline/offline-resume.test.ts`

**Produces:** `AutoPolicy = 'NORMAL' | 'SAFE' | 'GRINDER' | 'SLACKER'`; `OfflineDecisionSession { settlementId, pendingEventIds, cursor, resolvedEventIds, status }`; migration to versioned, valid defaults.

- [ ] Write failing tests for all four defaults, all three legacy mappings, invalid/missing fallback, and session persistence/restart.
- [ ] Run `npm test -- offline-auto-policy` and confirm failures mention missing values/session.
- [ ] Add the smallest save-model fields, defaults, clone/to-save-data support, and migration normalization; never retain legacy policy strings in new saves.
- [ ] Run focused tests and confirm PASS.
- [ ] Commit the contract/tests once green.

### Task 2: Pure capped boundary segmentation

**Files:**
- Create: `assets/scripts/services/offline-time-segmenter.ts`
- Modify: `assets/scripts/services/idle-service.ts`
- Test: `tests/offline/offline-boundary.test.ts`

**Produces:** `segmentOfflineInterval(startMs, endMs, maxSeconds)` returning deterministic work/lunch/after-hours/weekend segments and one globally capped effective interval.

- [ ] Write failing tests for 09:00, 12:00, 13:00, 18:00, midnight, weekend, 17:30→20:30, and an interval longer than 8h.
- [ ] Run the focused test and confirm it fails because the segmenter is absent.
- [ ] Implement half-open local-time segmentation, applying the cap to the total interval before splitting; model weekdays 09-12/13-18 as work, 12-13 as lunch, weekdays after 18 as after-hours, remaining periods as recovery/weekend.
- [ ] Have `IdleService.preview/settle` consume the aggregate of the new projection without adding a reward service or changing the cap.
- [ ] Run focused tests and commit once green.

### Task 3: Single offline simulation and policy behavior

**Files:**
- Modify: `assets/scripts/services/idle-service.ts`, `assets/scripts/services/offline-reward-service.ts`, `assets/scripts/v3/auto-policy-service.ts`, `assets/scripts/core/game-context.ts`
- Test: `tests/offline/offline-auto-policy.test.ts`, `tests/offline/offline-exactly-once.test.ts`

**Produces:** `OfflineSimulationResult` with required aggregate fields and `policyUsed`; preview is pure and claim applies base resources once by current settlement id.

- [ ] Write failing tests for NORMAL/SAFE/GRINDER/SLACKER work and overtime decisions, exhausted GRINDER stop, base-only x2, preview immutability, duplicate claim, and restart duplicate prevention.
- [ ] Confirm RED with the focused test files.
- [ ] Implement one simulation projection shared by preview and claim. NORMAL favors neutral actions; SAFE protects evidence/testing/debt and rejects risky/free overtime; GRINDER accepts paid and bounded free overtime but stops exhausted; SLACKER favors recovery and declines low-value work/free overtime.
- [ ] Integrate only the aggregate salary/cultivation/stones into the existing `IdleService` transaction; commit cursor/save once only after successful settlement.
- [ ] Confirm focused PASS and commit.

### Task 4: Canonical pending-event decision session

**Files:**
- Modify: `assets/scripts/v3/auto-policy-service.ts`, `assets/scripts/model/player-data.ts`, `assets/scripts/services/save-service.ts`
- Test: `tests/offline/offline-pending.test.ts`, `tests/offline/offline-resume.test.ts`

**Produces:** deterministic session projection over `pendingEvents`, resume-by-ID, idempotent sequential resolution, and an S1 minimum mitigation marker without a fake full resolution.

- [ ] Write failing tests covering high-risk routing to `pendingEvents`, S1 preservation/minimum mitigation, capped presentation without S1 loss, partial close/restart cursor restoration, stale IDs, and finishing the final decision.
- [ ] Confirm RED.
- [ ] Implement sorted pending ID projection (severity then creation time then ID), a maximum-12 display summary, deterministic lower-risk overflow summary, and session status transitions `PENDING -> COMPLETED`.
- [ ] Make action results idempotent and save each accepted action; never copy canonical event data into the session.
- [ ] Confirm focused PASS and commit.

### Task 5: Welcome copy and PC flow

**Files:**
- Create: `assets/scripts/v3/offline-welcome-content.ts`
- Modify: `assets/scripts/facade/game-facade.ts`, `desktop/ui-overlay.js`, `desktop/ui-overlay.css`
- Test: `tests/v3/auto-policy-service.test.ts`, `tests/v3/auto-policy-overlay.test.ts`

**Produces:** exactly 20 stable welcome copy entries, policy setting labels 均衡/稳健/卷王/摸鱼, one summary modal, and a one-by-one resumable pending modal.

- [ ] Write a failing content test asserting exactly 20 distinct stable IDs and a failing overlay contract test for policy selection, summary, `1 / N`, and resume hooks.
- [ ] Confirm RED.
- [ ] Put all copy in the content provider (not inline UI), expose facade summary/actions, and render a non-scrolling PC home with modal-internal scroll for many events.
- [ ] Ensure summary shows effective time, policy, base resources, work/fishing/cultivation/overtime, auto actions, pending count, and incident count; action button text changes when there are no pending decisions.
- [ ] Confirm tests, `node --check desktop/ui-overlay.js`, and PC contract check pass; commit.

### Task 6: Deterministic long-run balance matrix

**Files:**
- Modify: `scripts/overtime-balance-simulator.ts`
- Create: `tests/v3/tech-debt-strategy-simulation.test.ts`, `tests/v3/mind-dead-end.test.ts`
- Modify: `tests/v3/overtime-balance-simulator.test.ts`

**Produces:** seeded 7/30/60-day Overtime (ALWAYS/NEVER/SELECTIVE), debt (RUSH/QUALITY/BALANCED), and policy (GRINDER/NORMAL/SLACKER) tables; numeric PASS/WARN/FAIL thresholds for every requested criterion.

- [ ] Write failing tests for deterministic same-seed output, all 27 day×strategy outputs, and explicit threshold statuses including FREE_OVERTIME, ALWAYS_DOMINANCE, NEVER_VIABLE, MIND_LOCK, DEAD_END, AD_FREQ, AD_ECONOMY, CAREER_PACING.
- [ ] Confirm RED.
- [ ] Define constants for seed, initial state, weekday cadence, and threshold/status precedence; retain use of real overtime/tech-debt/mind services and seeded RNG.
- [ ] Output metrics and threshold numbers, not a bare pass string; run each period and save generated machine-readable result for the final report.
- [ ] Confirm all simulator tests PASS and commit.

### Task 7: Documentation, report, and verification

**Files:**
- Modify: `docs/FIRST-10-MINUTES.md`, `docs/FIRST-30-MINUTES.md`, `ai/reports/GAMEPLAY-V4-FINAL.md`
- Modify: `ai/reports/V4-FINALIZATION-AUDIT.md`
- Create when real capture succeeds: `ai/reports/screenshots/v4-final/*.png`

- [ ] Rewrite onboarding around first launch, work/fish/cultivate, tasks, daily situations, NPCs, events, overtime, and recovery; remove current-design merge/recruit references.
- [ ] Search current player-facing docs/reports for `招募牛马|同级合成|MergeBoard|FIRST_RECRUIT|FIRST_MERGE`, retaining only clearly labelled historical material.
- [ ] Execute the balance matrix and generate the final report using its real values, current source audit, exact test assertions, and final commit/remote SHA placeholders filled only after push.
- [ ] Run `npm run build:game`, `npm run content:check`, `npm run gameplay-v2:check`, `npm test`, and `npm run pc:check`; attempt `npm run pc:build` and real Electron capture. Mark unavailable captures `MANUAL_REQUIRED`.
- [ ] Run `git diff --check`, commit docs/report, push `origin gameplay-v2`, fetch, and verify `HEAD == origin/gameplay-v2`.

## Plan Self-Review

- Coverage: all required policies, segmented timing, one settlement, canonical pending events, 20 content lines, resume, balance matrix, docs/report/runtime evidence and push each map to a numbered task.
- No placeholders: implementation choices and test behavior are explicit; runtime captures are truthfully conditional as required by the brief.
- Type consistency: all later UI and session work consumes `AutoPolicy`, `OfflineSimulationResult`, and `OfflineDecisionSession` declared in Tasks 1–4.
