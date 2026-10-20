# V5.9-L Card Battle Delivery

This delivery covers the verified V5.9-L packaged Electron experience and the follow-up GamePlay Agent reliability fixes. See [V59L-FINAL-ACCEPTANCE.md](V59L-FINAL-ACCEPTANCE.md) for the complete acceptance evidence, hashes, test results, and validation limitations.

## Included capabilities

- Playable card combat with a 3-energy turn, a 5-card opening hand, attack/defense/skill/fate cards, enemy intents and actions, victory/defeat settlement, rewards, and save restoration.
- 36 catalogued card effects, 12 battle events with three choices each, two phase-capable bosses, and 36 original card-art images.
- Character creation random attributes constrained to integer values from 50 through 88, with the 88 upper boundary reachable through deterministic rules tests.
- Separate random base attributes and allocated points. The real creation UI test spends five points and returns five points without changing the allocation balance.
- GamePlay Agent scenarios for creation attributes, first victory and reward, defense, battle events, and save/restart restoration.
- Bounded modal recovery via actual visible modal controls; stateful clicks wait for authoritative transitions, including indexed array fields.

## Acceptance

- `npm test`: PASS (160 test files).
- `npm run release:check`: PASS.
- `npm run pc:build`, `npm run pc:copy`, `npm run pc:check`, `npm run pc:pack`: PASS; the build wrapper verified fresh Cocos output.
- `node --test tests/gameplay-agent/runner.test.cjs`: PASS (36/36).
- `npm run gameplay-agent:l`: PASS (5/5) against the newly packaged EXE.
- Final GamePlay Agent run: `20261017-172810-b25997`.
- EXE SHA-256: `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`.
- ASAR SHA-256: `d3b550ba30580d75f3bfe47e1b23c85997999c8939d90f62b11c0655cc8cf9bd`.
- Modes: `ELECTRON_E2E=PASS`, `BUILD_PROVENANCE=FRESH`, `UI_REAL_EXE=NOT_VERIFIED`, `SERVICE_SIM=NOT_RUN`.

## Remaining verification

The L acceptance run uses CDP synthetic pointer/keyboard input in a packaged Windows Electron EXE. Physical Windows input and outer-window sizing were not verified. These limits are recorded as `NOT_VERIFIED`, not PASS.

## P0 follow-up: replace the normal click-combat entry

The October 20, 2026 player report exposed that the home page still routed its primary combat action into the legacy click arena while card combat could be started from the project page. The normal home entry now starts or resumes the authoritative card battle, and the home UI no longer exposes the legacy enemy-click target during normal combat. Direct enemy clicks are asserted to leave enemy HP and the hit log unchanged.

- `V59L_CARD_BATTLE_UI=PASS (ELECTRON_E2E)`: the newly packaged Windows Electron app was entered through the home combat button; the five-card hand and three energy were visible, attacks changed battle state, defense granted block, ending a turn resolved the announced enemy action, victory and reward claim completed, and the claimed state survived app restart.
- The latest L-focused run is [20261020-091912-c66654](../gameplay-agent/reports/20261020-091912-c66654/summary.md): 5/5 passed against the post-Gate package. The random-event popup case was subsequently made robust by acknowledging an actual visible Fate result modal before waiting for the card-event choice; the targeted rerun [20261020-091833-370102](../gameplay-agent/reports/20261020-091833-370102/summary.md) passed.
- The full Gate [20261020-084609-daccaf](../gameplay-agent/reports/20261020-084609-daccaf/summary.md) ran all 25 registered scenarios: 16 passed, 6 failed, 3 were blocked. Build, pack, release check and package check commands returned 0. Overall Gate remains `FAILED`; this does not negate the focused card-battle UI result.
- The 20-minute soak did **not** complete: its five-minute screenshot checkpoint timed out after 5m48s (`Page.captureScreenshot`). The run also contains two boot-timeout NOT_VERIFIED results, a missing legacy `#ArenaAttack` target in an old Fate scenario, an intermittent new-player setup selection block, and a time-save assertion mismatch. See the Gate report for each scenario's evidence and classification.
- Current package: EXE SHA-256 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`; EXE modification/build time `2026-10-20 16:46:06` local. Electron's stable executable hash is unchanged from the previous package; the embedded app is distinguished by its ASAR and fresh build manifest.
- Current ASAR SHA-256 `db7df87a993ae72812e39ef50d97dd514150e8765b4f5708433c230062ca2b33`; build input SHA `caa78c330dd56108f42d81ab385a336fd7c43fad32ee001fade4a37e91ac1081`, recorded as fresh in the Gate report. The preceding October 20 package had the same EXE SHA but ASAR `5129cc20979206aa70323b36501fc71fcc7f11a7b6979a953945e46f5be7e6b3`; the older October 17 baseline had ASAR `d3b550ba30580d75f3bfe47e1b23c85997999c8939d90f62b11c0655cc8cf9bd`.
- `UI_REAL_EXE=NOT_VERIFIED`: screenshots and inputs are from the real packaged Electron EXE, but the runner uses CDP synthetic input; physical Windows mouse/keyboard input was not tested. `SERVICE_SIM=NOT_RUN` for the focused run.

Evidence: home entry screenshot [014](../gameplay-agent/reports/20261020-080650-0662c4/scenarios/home-card-battle-entry/evidence/screenshots/014-home-entry-card-battle-hand.png) and enemy-click check [015](../gameplay-agent/reports/20261020-080650-0662c4/scenarios/home-card-battle-entry/evidence/screenshots/015-enemy-click-did-not-hit.png); latest victory [014](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-first-win/evidence/screenshots/014-card-battle-victory.png), restart recovery [015](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-first-win/evidence/screenshots/015-card-battle-reward-restored.png), defense [013–014](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-defense/evidence/screenshots/013-card-battle-defense-intent.png), and save/reload [013–014](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-save-reload/evidence/screenshots/013-card-battle-before-restart.png). Each scenario directory contains `replay.json` and authoritative state evidence.
