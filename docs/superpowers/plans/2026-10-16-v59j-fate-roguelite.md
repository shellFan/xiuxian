# V5.9-J Fate Roguelite Implementation Plan

> **Execution:** Inline in the isolated J worktree. Keep all V5.9-I.1 source and evidence copied from the existing dirty worktree; do not discard it.

**Goal:** Turn the existing five-stage homepage campaign into a replayable workplace-fate roguelite with meaningful events, persistent story choices, battle-linked outcomes, death, rebirth, and permanent talents.

**Architecture:** Extend the existing V2 event model, `RandomService`, `GameClockV2`, `GameSaveData`, V3 `BattleService`, and facade/UI bridge. Add a versioned run state and account-level rebirth state without resetting salary, cultivation, profession, inventory, or equipment. Event and run mutations are authoritative and idempotent; desktop presentation remains a projection of facade state.

**Tech Stack:** TypeScript, Cocos Creator 3.8-compatible services, JSON event definitions, Node test runner, Electron desktop overlay, existing GamePlay Agent/CDP replay.

## Global Constraints

- Do not add a second wallet, salary, or game clock.
- Use the existing seeded random service and game clock for reproducible gameplay.
- Do not clear or overwrite existing player currency, career, equipment, inventory, or save data on rebirth.
- Keep test-only seed/state bridges disabled in production builds.
- Use the existing V3 battle service for special battle challenges.
- New event, choice, settlement, and rebirth operations must be idempotent and survive restart.
- Preserve all I.1 changes and reports; never force-push or merge to `gameplay-v2` automatically.
- Every gameplay defect fix starts with a failing regression test; real EXE UI status remains `NOT_VERIFIED` without physical input evidence.

## Worktree Baseline

The J worktree starts from local I.1 base commit `6899c7bdfdbcf716032f1db0d355ab9f86834058` on `feature/v59j-fate-roguelite`. The uncommitted I.1 tracked diff and all 534 untracked files were copied from `feature/v59i1-satisfying-gameplay`; SHA-256 of the copied 20-minute `report.json` matches the source copy. I.1 has a passing 20-minute Electron/CDP soak and standalone scene reports; its full release gate and physical Windows input were not run.

## Task 1: Save Model and Fate Runtime Contract

**Files:**
- Modify: `assets/scripts/model/save-data.ts`
- Modify: `assets/scripts/model/player-data.ts`
- Modify: `assets/scripts/services/save-service.ts`
- Create: `assets/scripts/v59j/fate-state.ts`
- Test: `tests/v59j/fate-state.test.ts`

Add schema-v15 optional-safe migration for `fateRun` and `rebirthMeta`. `fateRun` owns only this-life health, run flags, event queue/history, active challenge, and terminal outcome; `rebirthMeta` owns account-level karma, talent ranks, unlocked endings, and settled run IDs. Normalize bounded arrays/maps, reject malformed active runs without mutating legacy fields, and make a new game initialize metadata without changing established resources.

Verification: `node tests/.compiled/tests/v59j/fate-state.test.js`; legacy save migration tests remain green.

## Task 2: Event Content, Schema Validation, and Deterministic Resolution

**Files:**
- Create: `assets/configs/v2/fate-events.json`
- Create: `assets/scripts/v59j/fate-event-schema.ts`
- Create: `assets/scripts/v59j/fate-event-service.ts`
- Modify: `assets/scripts/core/game-context.ts`
- Modify: `assets/scripts/facade/game-facade.ts`
- Create: `scripts/check-fate-content.cjs`
- Test: `tests/v59j/fate-event-service.test.ts`
- Modify: `package.json`

Reuse `EventDefinition`, requirement evaluators, existing `RandomService`, and `clockV2`. The J definitions add explicit trigger metadata and typed fate effects. Validate unique IDs, finite positive eligible weights, option/result coverage, referenced NPC/items, chain reachability, and terminal outcomes. Ship at least 30 genuinely distinct events with at least 20 three-choice events, 10 probability branches, 5 multi-step chains, and 3 gated hidden events. Persist cooldown, fired keys, queue, decision IDs, and replay seed in `fateRun`. Resolve a choice from one immutable pre-state snapshot; persist outcome/history/effects as one idempotent transaction and restore the snapshot on save failure.

Verification: service tests cover fixed-seed success/failure/rare branches, profession/equipment/relationship gates, queue cap/dedupe/cooldown, restart recovery, duplicate choice, and persistence rollback. `npm run content:fate:check` validates all authored data.

## Task 3: Combat Consequences and Reusable Challenges

**Files:**
- Modify: `assets/scripts/v3/battle-service.ts`
- Modify: `assets/scripts/v59i1/home-arena-service.ts`
- Modify: `assets/scripts/core/game-context.ts`
- Modify: `assets/scripts/facade/game-facade.ts`
- Test: `tests/v59j/fate-combat.test.ts`
- Test: `tests/v59j/fate-challenges.test.ts`

Apply temporary attack, crit, auto-rate, cooldown, health, and mind modifiers to actual authoritative formulas with expiry on the existing game clock. Trigger configured events from campaign milestones and bounded time gates. Implement the online-incident and blame-boss challenges by starting/resolving actual V3 battles with clear success/failure criteria; never decide a battle result from a random roll. Challenge settlement IDs prevent repeat rewards.

Verification: assert the same battle inputs yield changed authoritative damage while a modifier is active, revert after expiry, and challenge win/loss branches update run state once across restart.

## Task 4: Event, Journal, and Run-End UI

**Files:**
- Modify: `desktop/ui-home-arena.js`
- Modify: `desktop/ui-home-arena.css`
- Modify: `desktop/ui-overlay.js`
- Modify: `desktop/preload.cjs`
- Test: `tests/v59j/fate-ui-contract.test.ts`

Keep the battle surface primary. Add a compact non-blocking event card and pending count, an on-demand event choice view with risk/requirements/outcome, a fate journal projection, and a run-end/rebirth projection. All actions call facade commands; escaping/markup uses existing safe helpers; focused/visible real controls are required before automated click assertions.

Verification: DOM contract tests cover visible content, distinct choices, result feedback, keyboard/close controls, no attack-button obstruction, and 1280×720 bounds.

## Task 5: Chains, NPC Relationships, Death, and Rebirth Talents

**Files:**
- Modify: `assets/scripts/v59j/fate-event-service.ts`
- Create: `assets/scripts/v59j/fate-run-service.ts`
- Create: `assets/scripts/v59j/rebirth-service.ts`
- Modify: `assets/scripts/facade/game-facade.ts`
- Modify: `desktop/ui-overlay.js`
- Test: `tests/v59j/fate-run.test.ts`
- Test: `tests/v59j/rebirth.test.ts`

Implement five independent five-stage chains with historical-choice conditions and distinct endings; NPC relationship effects gate options and battle support. Health/mind/Battle loss can end only the current run and show a warning/result summary. Award karma once by settled run ID. Rebirth starts a new run while retaining account metadata and all existing non-run resources. Implement six capped, priced, persisted talents and test each against the authoritative combat/event calculation.

Verification: fixed-seed tests cover every chain branch, death causes, first-minute safety, no forced death chain, duplicate death/claim/rebirth requests, old save migration, and preserved wallet/equipment/profession.

## Task 6: GamePlay Agent Coverage and Release Evidence

**Files:**
- Modify: `ai/gameplay-agent/index.cjs`
- Create: `ai/gameplay-agent/scenarios/fate-first-run.json`
- Create: `ai/gameplay-agent/scenarios/fate-death-rebirth.json`
- Create: `ai/gameplay-agent/scenarios/fate-save-resume.json`
- Modify: `ai/gameplay-agent/README.md`
- Modify: `ai/gameplay-agent/reports/README.md`

Run deterministic scenario seeds for successful, failed, rare, hidden, challenge win/loss, death, and restart-resume branches. Store screenshots, operation replay, authoritative state, build/EXE hashes, and classification per scenario. Keep physical Windows input distinct from Electron/CDP automation. Do not claim all 25 requested scenarios pass unless each has executed evidence.

Verification: run unit/build/content checks first, then one scenario at a time, then a single release gate only after defects are fixed. Run a real 20-minute mixed-play soak and report results. Package the Windows EXE and record hashes. Commit only the reviewed J deliverable; push only the named feature branch without force or merge.

## Acceptance Gaps to Report

The full J request is larger than a single pass. Report any incomplete acceptance item explicitly rather than filling counts with placeholders. In particular, physical Windows input, 25-scene coverage, full gate, and 20-minute mixed J gameplay require real evidence. I.1's fifth-stage target remains approximately 73 seconds versus its recorded 60-second target.
