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
