# Gameplay V4.1 Alpha Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing V4 systems discoverable in a soft, skippable first-day experience, remove active merge-era onboarding, and produce evidence-backed Alpha polish documentation and desktop validation.

**Architecture:** Keep existing gameplay services as source of truth. Replace the active tutorial state machine and content with a versioned soft-guidance projection that persists one tutorial version and never blocks core actions. Add small facade/desktop entry bridges only for services that are real but unreachable; test deterministic first-day flow and save resilience before reporting factual runtime results.

**Tech Stack:** TypeScript/Cocos Creator 3.8, desktop HTML/CSS overlay, Node test harness, Electron/portable build scripts.

## Global Constraints

- Stay on `gameplay-v2`; preserve user/root uncommitted audit and plan files; no destructive git commands or force push.
- Do not add careers, sects, combat systems, network/cloud, ad SDKs, or a second popup/event/reward system.
- Home remains a single 1280×720 screen with no vertical page scroll; modals may scroll internally.
- Active runtime/doc references to `FIRST_RECRUIT`, `SECOND_RECRUIT`, `FIRST_MERGE`, `START_WORK`, `CHECK_KPI`, recruit/merge onboarding must be migrated; historical/compatibility tests may retain labelled references.
- Tutorial is soft, skippable, versioned, and never blocks an alternate core action. First three minutes permit only tutorial plus task-style guidance; first five minutes do not schedule S1 except explicit DEV test paths.
- Runtime PASS and screenshots require actual desktop/Electron evidence; otherwise state `MANUAL_REQUIRED`.
- Persist `tutorialVersion: 2` and `tutorialStartedAt` (finite game-clock epoch milliseconds). Migration is idempotent: `tutorialCompleted === true` always wins and remains completed; any unfinished legacy step (`FIRST_RECRUIT`, `SECOND_RECRUIT`, `FIRST_MERGE`, `START_WORK`, `CHECK_KPI`, `FIRST_PROMOTION`) maps to `WELCOME`; an absent/unknown/non-string step maps to `WELCOME`; an invalid timestamp is replaced once with the current game clock. New V2 steps are `WELCOME`, `FIRST_WORK`, `FIRST_FISH`, `FIRST_CULTIVATE`, `FIRST_TASK`, `NONE`.
- Skip persists the existing `tutorialCompleted === true` terminal state and `tutorialVersion: 2`; all hints are advisory, have no input capture, no command precondition, and expire after their triggering action or 30 game seconds, so no unavailable target can deadlock play.
- First-five-minute gating uses persisted `[tutorialStartedAt, tutorialStartedAt + 300_000)` in game-clock time. Non-DEV S1 candidates remain in the existing event/incident stores but are withheld from presentation until the window closes; priority chooses exactly one existing modal at a time and leaves lower-priority records untouched for later presentation.
- First-day deterministic tests use seed `4101`, game start Monday 09:00 Asia/Shanghai, ordered actions work → fish → cultivate → task → event choice A/B → project/combat → off-work decline → settlement. They assert nonnegative balances, one task/event/choice, tutorial state, no S1 in five minutes, and completed first-day summary for both choice branches.
- Save stress corpus covers 100 deterministic operations with seed `4102`; corruption cases cover omitted nested objects, wrong primitive types, unknown enums, non-finite/impossible numbers, duplicate IDs and invalid pending/battle/overtime structures. Recovery preserves valid independent state, eliminates invalid local structures, produces no NaN/negative elapsed time/reward duplication, and never wipes an otherwise repairable save.
- Task 1 allowed paths are tutorial/save/content/UI/tutorial tests only; Task 2 allowed paths are facade/desktop/first-day tests only; Task 3 allowed paths are scheduler/save stress tests and their current services only; Task 4 is docs/reports/screenshots only. Every runtime claim identifies the actual command/output and every artifact checksum, when generated, uses SHA-256 over the produced file.
- The user explicitly requires normal commit and push to `origin gameplay-v2`; after push fetch and compare exact local/remote SHA. Never force push or overwrite remote history.

---

### Task 1: Versioned first-day onboarding migration

**Files:** `assets/scripts/services/tutorial-service.ts`, `assets/scripts/model/{save-data,player-data}.ts`, `assets/scripts/services/save-service.ts`, `assets/scripts/ui/tutorial-overlay-component.ts`, `assets/configs/phase4/tutorial-copy.json`, `assets/configs/i18n/zh-CN.json`, related tutorial tests.

- [ ] Write a failing test for a new save receiving `WELCOME`, then soft guides `FIRST_WORK`, `FIRST_FISH`, `FIRST_CULTIVATE`, `FIRST_TASK`, and can skip or use other actions without lockout.
- [ ] Run the tutorial test to confirm RED on missing new tutorial version/steps.
- [ ] Replace active merge identifiers/defaults/copy with compact workplace-cultivation steps and persist `tutorialVersion`; migrate old completed tutorials to complete and old unfinished tutorials to the safe current entry without replaying merge steps.
- [ ] Add first-five-minute S1 guard and popup priority ordering through the existing UI/event path, not a second modal queue.
- [ ] Run tutorial/save tests and build; commit.

### Task 2: Reachable first-day gameplay path

**Files:** `assets/scripts/facade/game-facade.ts`, `desktop/ui-overlay.{js,css}`, first-day/reachability tests, existing event/task/battle integration tests as necessary.

- [ ] Write a deterministic first-day test that proves available work, fishing, cultivation, one meaningful task, one event/choice, and a normal project/combat entry; ensure it does not require merge/recruit actions.
- [ ] Add minimal compact desktop calls/links for only APIs demonstrated unreachable by Task 1 audit, retaining home hierarchy: off-work countdown, today salary, task/event, character, four actions, project/navigation.
- [ ] Test 17:55 atmosphere/off-work choice and a first-day settlement projection; verify first-day player may decline free overtime.
- [ ] Run PC contract check/build and focused tests; commit.

### Task 3: First-day protection and save resilience

**Files:** existing event scheduler/service, save tests, new first-day/save-stress tests.

- [ ] Add RED tests for no S1 within first five minutes outside a DEV path, deterministic popup priority `S1 > Pending > Promotion > Tutorial critical > workplace > daily > info`, 100 save/load mixed actions, and corrupt nested offline/pending/battle/overtime data recovery without whole-save wipe.
- [ ] Implement only missing guards/normalizers in the current services; preserve existing combat/offline exactly-once behavior.
- [ ] Verify tests, content and build; commit.

### Task 4: Player documentation, reports, runtime and pack evidence

**Files:** `docs/FIRST-10-MINUTES.md`, `docs/FIRST-30-MINUTES.md`, new `docs/FIRST-DAY-EXPERIENCE.md`, `ai/reports/{GAMEPLAY-V4-FINAL,V4-BALANCE-FINAL,V4.1-ALPHA-POLISH}.md`, `ai/reports/V4.1-CURRENT-STATE.md`.

- [ ] Rewrite first-10/30 documents to actual work/fishing/cultivation/task/project/combat/event/evidence/debt/off-work loops and mark historical merge material only where it remains intentionally compatible.
- [ ] Generate balance report from actual matrix JSON and list every numeric threshold/status.
- [ ] Run `npm run build:game`, `npm run content:check`, `npm run gameplay-v2:check`, `npm test`, `npm run release:check`, `npm run pc:check`; attempt `npm run pc:build`, Electron and portable pack/run.
- [ ] Capture only real screenshots under `ai/reports/screenshots/v4.1/`; otherwise list required cases as `MANUAL_REQUIRED` in final report.
- [ ] Commit, push, fetch and require `HEAD == origin/gameplay-v2`.

## Plan Self-Review

- Covers active legacy migration, reachability, first-day pacing, save/corrupt resilience, docs, balance, PC/runtime/pack evidence, and push.
- Retains existing systems and explicitly excludes expansion.
- Defines soft tutorial versioning, popup priority and runtime truthfulness before implementation.
