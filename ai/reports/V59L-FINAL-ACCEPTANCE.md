# V5.9-L Final Acceptance

Date: 2026-10-18 (Asia/Shanghai)

## Decision

V5.9-L meets the project-defined entry gate for continuing to V5.9-M. The packaged Windows x64 Electron build completed the maintained L scenario suite with 5/5 scenarios passing, and the full unit/integration test and release checks passed. Input was synthesized through Electron CDP, so physical Windows mouse/keyboard verification remains `UI_REAL_EXE=NOT_VERIFIED`.

## Baseline and changes

- L branch: `feature/v59l-card-battle`
- Starting HEAD: `1bb3221aaf6782d372186f3e3ebf71b077c0f0f9`
- Build input hash: `73078246b46812ba59d438f7c451b93d63cd15e70d4aad08c8419f77197d6b3e`
- The L implementation contains 36 catalogued cards, 12 battle events, two phase-capable bosses, and 36 card-art PNGs.
- Runner changes wait for authoritative state transitions when applying indexed state paths, recover workplace modals only through visible controls chosen by each scenario, and bound interaction retries to three.
- Character setup now checks each of five real `-1` clicks against the authoritative draft, avoiding an unobserved rapid-click setup race.

## Packaged build and verification

- Cocos Creator: 3.8.4 Web Desktop build produced fresh output. Cocos exited with code 36 after writing valid output; the repository build wrapper verified freshness and accepted the artifact.
- `npm run pc:copy`: passed.
- `npm run pc:check`: passed; 8 scene component registrations present, iterator-spread scan clean, build manifest fresh, desktop overlays match.
- `npm run pc:pack`: passed; packaged `dist/牛马修仙传-win32-x64/牛马修仙传.exe`.
- EXE SHA-256: `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR SHA-256: `d3b550ba30580d75f3bfe47e1b23c85997999c8939d90f62b11c0655cc8cf9bd`
- `npm test`: passed, TypeScript compile and all 160 test files.
- `npm run release:check`: passed, TypeScript and full test suite.
- `node --test tests/gameplay-agent/runner.test.cjs`: passed, 36/36.
- `npm run gameplay-agent:l`: passed, 5/5 on the packaged EXE.

## Gameplay run

Final run: `20261017-172810-b25997`. Each scenario used an isolated test profile; all actions were visible UI interactions and state assertions read the game facade. Individual durations:

| Scenario | Result | Duration | Evidence |
|---|---:|---:|---|
| Card defense and enemy intent | PASS | 21.4 s | [intent](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-defense/evidence/screenshots/012-card-battle-defense-intent.png), [enemy action](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-defense/evidence/screenshots/013-card-battle-after-enemy-action.png) |
| First victory, card reward, restart restore | PASS | 32.9 s | [victory](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-first-win/evidence/screenshots/013-card-battle-victory.png), [reward restored](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-first-win/evidence/screenshots/014-card-battle-reward-restored.png) |
| Battle event choice and outcome | PASS | 21.3 s | [choice](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-random-event/evidence/screenshots/012-card-battle-event-choice.png), [outcome](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-random-event/evidence/screenshots/013-card-battle-event-result.png) |
| Battle state across restart | PASS | 27.1 s | [before](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-save-reload/evidence/screenshots/012-card-battle-before-restart.png), [after](v59l-evidence/20261017-172810-b25997/scenarios/card-battle-save-reload/evidence/screenshots/013-card-battle-after-restart.png) |
| Character creation attributes and allocation | PASS | 20.6 s | [plus-five](v59l-evidence/20261017-172810-b25997/scenarios/character-creation-attributes/evidence/screenshots/008-creation-allocation-plus-five.png), [saved attributes](v59l-evidence/20261017-172810-b25997/scenarios/character-creation-attributes/evidence/screenshots/012-saved-creation-attributes.png) |

The final report records `ELECTRON_E2E=PASS`, `BUILD_PROVENANCE=FRESH`, `SERVICE_SIM=NOT_RUN`, and `UI_REAL_EXE=NOT_VERIFIED`. CDP screenshots show the renderer surface, not physical desktop input. The full run report, results, replay logs, and authoritative snapshots are committed under `ai/gameplay-agent/reports/20261017-172810-b25997/`. Selected screenshots are copied into `ai/reports/v59l-evidence/20261017-172810-b25997/`; the original full-resolution run, including all screenshots, remains under `ai/gameplay-agent/reports/20261017-172810-b25997/` in the local worktree.

## Creation and battle acceptance

- Character creation reached the final playable home through visible controls. The test exercised `+5`, then five `-1` controls, and asserted that the authoritative allocation returned to zero.
- The completed save retained each effective attribute within 50–88. Creation boundary, seeded generation, and `+5`/`-1` rules are covered by `npm test`'s V5.9-L creation attribute tests.
- The end-to-end battle used the visible opening hand and actual enemy turns, reached victory, chose a card reward, claimed settlement, restarted the packaged EXE, and confirmed the claimed result was restored.
- A workplace event modal that appeared over the reward UI was resolved through its visible choice. The runner then waited for the target to uncover and verified the reward selection and claim state from the authoritative battle state.
- No known L core-play blocker remains in the tested scenarios. Physical mouse/keyboard behavior and the outer-window size matrix remain unverified.

## Git delivery

- Final acceptance report: `ai/reports/V59L-CARD-BATTLE-DELIVERY.md`.
- This report and its compact evidence bundle are part of the L deliverable.
- Repository rules prohibit automatic push; any local commit is subject to the user's explicit commit instruction. The M branch must start from the final L commit, not the earlier baseline.
