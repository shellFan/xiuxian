# V5.9-A Character Creation Delivery Report

## Build identity

- `SOURCE_SHA`: `416b772e829f572545abe14e311669c93d6308f5`
- `FINAL_SHA`: `30cba6f248628b2ab758d4089aa06e0c238fd50a`
- `BUILD_SHA`: `30cba6f248628b2ab758d4089aa06e0c238fd50a` (Cocos build manifest `gitHead`)
- Build manifest inputs hash: `909ed39384d6faec4840c267ffa719e2b50780203914ec13b860c7c91b3d2800`
- Portable EXE: `dist/牛马修仙传-win32-x64/牛马修仙传.exe` (176,819,200 bytes)
- `EXE_SHA256`: `E10410E805C536B470D4D6938D14D7CF343AC7303DA01F97B261EAD82AA91CD1`
- ASAR: `dist/牛马修仙传-win32-x64/resources/app.asar` (15,620,073 bytes)
- `ASAR_SHA256`: `4D804B2C739637E840C56CE2EC61D26AE29DDADA4B1AF2CEB9B551C4C5C59F4D`

The generated artifacts are local build outputs and are not committed.

## Delivered functionality

- Added a resumable seven-step character setup flow, deterministic three-candidate destiny generation, nickname/avatar/background selection, potential allocation, and transactional finalization.
- Added save migration/backfill for existing roles without resetting established progress or issuing new-player rewards twice.
- Connected the five attributes and implemented gameplay hooks for cultivation, fatigue, task progress, mind cost, battle critical chance, profession growth, work output, responsibility resolution, NPC assistance, and relationship growth.
- Added Electron DOM creation flow and Cocos runtime creation/onboarding panels. The Cocos controller now restores onboarding after restart; failed onboarding saves remain visible to the player.
- Added profession-specific onboarding tasks and retained all four authoritative profession IDs and starter kits.

## Verification evidence

| Command | Result |
|---|---|
| `npm test` | PASS — 146 test files, 0 failures. Includes V5.9 creation, migration, effects, Cocos runtime, Electron DOM E2E, and V5.8 regressions. |
| `npm run build:all` | PASS — game and orchestrator TypeScript builds. |
| `npm run gameplay-v2:check` | PASS — content validation and legacy merge check. |
| `npm run pc:build` | PASS — fresh Cocos Web Desktop artifact verified. Cocos Creator returned internal code 36 after producing the verified artifact; the project build wrapper accepted it and exited successfully. |
| `npm run pc:copy` | PASS — desktop resources and build manifest refreshed. |
| `npm run pc:check` | PASS — 8 scene component registrations, iterator-spread scan, manifest freshness, and overlay hashes. |
| `npm run pc:pack:portable` | PASS — portable Windows x64 package generated. |
| `git diff --check` | PASS. |

### Character and save checks

- Four supported professions: PASS — each profession finalized through its existing starter kit.
- Destiny generation: PASS — deterministic seed, three distinct destinies, each candidate has total attributes 50 with each stat in 6–16, and rerolls persist with a three-use limit.
- Allocation: PASS — five-point budget, add/remove/reset, caps, and persisted unspent potential covered by tests.
- Legacy saves: PASS — existing profession and progress preserved, missing destiny backfilled once, no duplicate starter kit, and corrupt-save fail-closed behavior retained.
- Cocos onboarding: PASS in headless runtime tests for first completion, restart resume, advancing, skipping, and visible save errors.
- Electron creation flow: PASS in automated DOM E2E using isolated test data.

## Real Windows UI acceptance

- `UI_REAL_EXE`: `NOT_VERIFIED` — this session has no native desktop UI automation capability. No real-EXE interaction screenshots or visual walkthrough evidence were produced.
- `AUTOMATED_E2E`: `PASS` — Electron DOM creation flow ran using an isolated test profile.
- `SERVICE_SIM`: `PASS` — service tests cover creation, migration, gameplay hooks, and save/reload behavior.
- `NOT_VERIFIED`: visible Windows EXE interaction, visual layout, closing/relaunching the packaged EXE, and WeChat Mini Game visual runtime.

## Open items and review levels

- `HIGH`: Windows EXE UI walkthrough and required screenshots are outstanding. The package exists, but automated DOM tests do not establish visible-EXE acceptance.
- `HIGH`: `FISHING_IMMORTAL` does not yet increase the appearance weight of the specified fishing encounters.
- `HIGH`: `SCAPEGOAT` does not yet increase the trigger weight of blame-related workplace events.
- `BLOCKER`: none identified by automated checks.
- `MEDIUM`: Cocos UI has headless runtime coverage but no visual Cocos Creator or WeChat runtime review.
- `LOW`: none recorded.

## Changed files

Branch changes since `SOURCE_SHA` (includes the three remote `gameplay-v2` commits integrated before delivery):

```text
ai/reports/V58-FIRST-HOUR-FUN-COMPLETION.md
ai/reports/V58-RUNTIME-DATA-TRUTH-LIVING-UI.md
assets/scripts/core/game-context.ts
assets/scripts/facade/game-facade.ts
assets/scripts/facade/runtime-data-snapshot.ts
assets/scripts/facade/runtime-data-snapshot.ts.meta
assets/scripts/model/player-data.ts
assets/scripts/model/save-data.ts
assets/scripts/services/cultivation-service.ts
assets/scripts/services/mind-service.ts
assets/scripts/services/save-service.ts
assets/scripts/services/task-service.ts
assets/scripts/services/work-service.ts
assets/scripts/ui/character-creation-runtime-view.ts
assets/scripts/ui/character-creation-runtime-view.ts.meta
assets/scripts/ui/character-creation-view-model.ts
assets/scripts/ui/character-creation-view-model.ts.meta
assets/scripts/ui/character-creation-wizard-component.ts
assets/scripts/ui/character-creation-wizard-component.ts.meta
assets/scripts/ui/game-ui-controller.ts
assets/scripts/v2/game-day-service.ts
assets/scripts/v2/npc-weekend-service.ts
assets/scripts/v2/v2-event-service.ts
assets/scripts/v2/v2-item-service.ts
assets/scripts/v3/assigned-task-service.ts
assets/scripts/v3/battle-service.ts
assets/scripts/v3/responsibility-service.ts
assets/scripts/v5/profession-service.ts
assets/scripts/v56/task-runtime-director.ts
assets/scripts/v57/fatigue-service.ts
assets/scripts/v57/npc-memory-service.ts
assets/scripts/v59.meta
assets/scripts/v59/character-attributes.ts
assets/scripts/v59/character-attributes.ts.meta
assets/scripts/v59/character-creation-service.ts
assets/scripts/v59/character-creation-service.ts.meta
assets/scripts/v59/character-rules.ts
assets/scripts/v59/character-rules.ts.meta
desktop/ui-overlay.css
desktop/ui-overlay.js
docs/superpowers/plans/2026-10-08-v59a-character-creation.md
tests/save/save-service.test.ts
tests/v3/work-today-time.test.ts
tests/v55/core-loop-rework.test.ts
tests/v56/workday-director.test.ts
tests/v57/systems.test.ts
tests/v58/corrupt-matrix.test.ts
tests/v58/release-safety-r3.test.ts
tests/v58/runtime-data-truth.test.ts
tests/v58/systems.test.ts
tests/v59/character-creation-service.test.ts
tests/v59/character-creation-ui.test.ts
tests/v59/character-effects.test.ts
tests/v59/character-rules.test.ts
tests/v59/cocos-character-creation-runtime.test.ts
tests/v59/desktop-creation-ui.test.ts
tests/v59/save-migration.test.ts
tests/work/work-service.test.ts
```

## Git delivery

- Feature commit: `ead69b3983298f5376b0f712b10094136348c3c2`
- Remote integration commit: `30cba6f248628b2ab758d4089aa06e0c238fd50a`
- Push: successful fast-forward to `origin/gameplay-v2`; no force push or history rewrite used.
- This report is committed separately after the source/build commit.

## Readiness

**NOT READY** — source, automated checks, and package are delivered. Independent QA is still needed for the two destiny event-weight effects and visible Windows EXE acceptance.

---

## V5.9-A.1 NOT READY closure — 2026-10-12

This addendum supersedes the earlier open-item status above for the two destiny event-weight issues and the build-exit investigation. It does not change the visible-EXE QA status.

### Source and behavior

- Baseline: `227c59e00c145122ae2c0cc17a54d01e89b44d6b`.
- Code commit: `78c1abb2b9c3f866c47c8b756a70809528c009aa` (`fix: apply destiny weights to event selection`).
- `FISHING_IMMORTAL` now applies a 1.5 target multiplier to events eligible in `FISHING` mode through the existing `EventScheduler`.
- `SCAPEGOAT` now applies a 1.5 target multiplier to events that have a choice branch opening a responsibility case with `blamedPlayer: true`.
- `V2EventService` projects the existing character effect hooks into the existing scheduler. No second scheduler was added. Base event definitions and unrelated event selection rules are unchanged; effective weights are normalized to finite, nonnegative probabilities.

### Tests and build evidence

| Command/check | Result |
|---|---|
| `npm test` | PASS — 147 test files, including fixed-seed distribution tests and real blame-case settlement. |
| `npm run build` | PASS — game and orchestrator TypeScript builds. |
| `npm run gameplay-v2` | Not defined in this repository (`Missing script`). Equivalent `npm run gameplay-v2:check` PASS. |
| `npm run pc` | Not defined in this repository (`Missing script`). `npm run pc:build` PASS on the final source commit. |
| `npm run pc:copy` | PASS — copied latest Cocos build and regenerated manifest. |
| `npm run pc:check` | PASS — 8 component registrations, iterator scan, manifest freshness, overlay hashes. |
| `npm run pc:pack` | PASS — generated Windows x64 Electron package. |
| `git diff --check` | PASS before source commit. |

Fixed-seed scheduler evidence (20,000 draws each):

- Fishing target encounters: `10,080/20,000` baseline → `12,062/20,000` with `FISHING_IMMORTAL`.
- Blame target encounters: `10,079/20,000` baseline → `12,094/20,000` with `SCAPEGOAT`.
- Tests also verify unchanged non-target selection, multiplier projection from persisted destinies, finite/nonnegative normalized weights, and a real `wp_blame_api_s0` choice settling into a responsibility case.

Focused V5.8 regression log: `ai/reports/v59a1-evidence/logs/v58-focused-regressions.log`. It covers salary, battle, workplace/task settlement, equipment, save/load, runtime-data truth, affix settlement, and V2 items. The complete test output is in `ai/reports/v59a1-evidence/logs/npm-test.log`.

### Cocos Creator exit code 36

Confirmed from the installed Cocos Creator 3.8.4 `app.asar`: `BUILD_SUCCESS` is enum value `36`; its launch code propagates the build result through `app.exit(code)` and `process.exit(code)`. The final run logged `build success in 42309` and finished the Web Desktop task. The fresh output contains 107 files (14,596,060 bytes); the build verifier checks required files for missing, empty, or stale output. `pc:check` also confirms scene component registrations and packaged overlay hashes.

The current Creator logs contain nonfatal configuration fallback notices (`debug` string `"false"` falls back to boolean `false`; undefined compression setting defaults to `merge_dep`), a deprecated `BaseNode` warning, and a libpng color-profile warning. The builder and asset database logs contain no build error, exception, fatal, or failure. Logs: `creator-builder-final.log`, `creator-asset-db-final.log`, and `pc-build-final.log` under `ai/reports/v59a1-evidence/logs/`.

### Packaged artifacts

- Build manifest `gitHead`: `78c1abb2b9c3f866c47c8b756a70809528c009aa`.
- Portable EXE: `dist/牛马修仙传-win32-x64/牛马修仙传.exe` (176,819,200 bytes).
- `EXE_SHA256`: `E10410E805C536B470D4D6938D14D7CF343AC7303DA01F97B261EAD82AA91CD1`.
- ASAR: `dist/牛马修仙传-win32-x64/resources/app.asar` (15,621,337 bytes).
- `ASAR_SHA256`: `9B3DBB0C3E4493E729074FA484345B991D8138AD1671ABD85F97042400003ED2`.

### Real Windows EXE acceptance

- `UI_REAL_EXE`: **NOT_VERIFIED**. This session has no native desktop window/input automation, so no EXE screenshots or real-window interaction evidence were produced. The package hash and automated DOM/service tests do not establish visual acceptance.
- Remaining HIGH: perform the manual Windows EXE walkthrough below and attach genuine screenshots/logs. No other HIGH or BLOCKER is known from this round. Independent QA is not declared passed.
- `AUTOMATED_E2E`: PASS as part of `npm test`; it does not replace the EXE walkthrough.

Manual acceptance checklist (use an isolated Windows test profile; preserve a copy of any legacy save):

1. Launch the packaged EXE at 1280×720; capture the initial screen and check for clipped, overlapping, or off-screen controls.
2. Complete all seven setup steps by clicking each control; navigate backward and forward and confirm entered values persist.
3. Create four isolated profiles, one per profession, and verify each profession can finish setup and enter the game.
4. Reroll destiny, verify the candidate and reroll count persist after closing/relaunching, and confirm the reroll limit is enforced.
5. Allocate attributes, finish character creation, then confirm destiny, profession, attributes, and unspent potential after relaunch.
6. Complete the hire/onboarding story and first profession task; save, close the EXE, relaunch, and verify progress resumes.
7. Open a preserved legacy save and verify profession, inventory, and progress remain intact with no duplicate starter kit or new-player reward.
8. Repeat startup/relaunch and confirm the new-player reward is never granted twice; capture screenshots and the corresponding logs for each profile.

### Delivery status

The event-weight issues and Creator exit-code question are closed with test/build evidence. Overall status remains **NOT READY for independent QA sign-off** until `UI_REAL_EXE` is verified on Windows. No V5.9-B work was started.
