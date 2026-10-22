# V5.9-L P0: Replace the normal click-combat experience

Date: 2026-10-20

Branch: `feature/v59n-career-life-growth`
Source HEAD used for the package: `0c01a4488bd44bad5638a60a73e39d32b2319457`

## Root cause and fix

The card battle engine and project-page entry already existed, but the primary home battle control still started the legacy `HomeArena` click-to-hit loop. As a result, a player could encounter the card implementation without the default combat experience actually being card-based.

The home combat action now starts or resumes the authoritative card battle and transitions to its player-facing battle screen. The home screen no longer presents the old direct enemy-hit target as its combat action. A regression check confirms that a direct enemy click during ordinary card combat does not change enemy HP or the battle hit log. Existing work, salary, sect, NPC and Fate services remain in place.

The card-event acceptance scenario also encountered a real Fate result modal above the battle screen. The test now acknowledges that visible result with its actual `#V2EventOk` button before checking the card-event choice; no modal is hidden and no battle state is injected.

## Focused packaged-EXE acceptance

Latest focused run: [GamePlay Agent 20261020-091912-c66654](../gameplay-agent/reports/20261020-091912-c66654/summary.md). It ran all five L-focused scenarios against the newly rebuilt and packaged Electron app: **5 passed, 0 failed, 0 blocked**. The deterministic card-event scenario's modal recovery was also separately verified in [20261020-091833-370102](../gameplay-agent/reports/20261020-091833-370102/summary.md).

| Player action | Evidence |
|---|---|
| Open ordinary combat from home and see five cards / three energy | [opening hand](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-first-win/evidence/screenshots/013-card-battle-opening-hand.png) |
| Enemy click does not attack | [home-entry evidence](../gameplay-agent/reports/20261020-080650-0662c4/scenarios/home-card-battle-entry/evidence/screenshots/015-enemy-click-did-not-hit.png) |
| Play attacks and win from the visible hand | [victory](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-first-win/evidence/screenshots/014-card-battle-victory.png) |
| Claim reward and restore after restart | [restored result](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-first-win/evidence/screenshots/015-card-battle-reward-restored.png), [save/reload screen](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-save-reload/evidence/screenshots/014-card-battle-after-restart.png) |
| Play defense and resolve announced enemy action | [intent](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-defense/evidence/screenshots/013-card-battle-defense-intent.png), [enemy action](../gameplay-agent/reports/20261020-091912-c66654/scenarios/card-battle-defense/evidence/screenshots/014-card-battle-after-enemy-action.png) |
| Resolve the card battle event through its choice | [event result](../gameplay-agent/reports/20261020-091833-370102/scenarios/card-battle-random-event/evidence/screenshots/014-card-battle-event-result.png) |

Each linked scenario folder contains the replay with actual CDP input events and authoritative before/after snapshots. These are packaged-Electron end-to-end results, not service-only simulation.

## Build identity

`pc:build`, `pc:pack`, and `pc:check` all returned exit code 0 in Gate run `20261020-084609-daccaf`; the build manifest was fresh and recorded source/build input SHA `caa78c330dd56108f42d81ab385a336fd7c43fad32ee001fade4a37e91ac1081`.

| Artifact | Current package | Previous October 20 package | Older October 17 L baseline |
|---|---|---|---|
| EXE SHA-256 | `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1` | same stable Electron binary hash | same stable Electron binary hash |
| ASAR SHA-256 | `db7df87a993ae72812e39ef50d97dd514150e8765b4f5708433c230062ca2b33` | `5129cc20979206aa70323b36501fc71fcc7f11a7b6979a953945e46f5be7e6b3` | `d3b550ba30580d75f3bfe47e1b23c85997999c8939d90f62b11c0655cc8cf9bd` |
| Package/build time | EXE last-write `2026-10-20 16:46:06` local; Gate started `16:46:09` local | GamePlay run `16:16:52` local | GamePlay run `2026-10-17 17:28:10` local |
| Build input SHA | `caa78c330dd56108f42d81ab385a336fd7c43fad32ee001fade4a37e91ac1081` | same | `73078246b46812ba59d438f7c451b93d63cd15e70d4aad08c8419f77197d6b3e` |

The EXE hash alone cannot distinguish builds because Electron Packager reuses the same runtime binary. The ASAR hash and fresh build manifest distinguish the current application payload from the prior packages.

## Full Gate result and remaining blockers

Full Gate run: [20261020-084609-daccaf](../gameplay-agent/reports/20261020-084609-daccaf/summary.md), October 20, 16:46:09–17:03:50 local. It ran all 25 registered scenarios: **16 passed, 6 failed, 3 blocked**. `release:check`, `pc:build`, `pc:pack`, and `pc:check` all returned 0. Overall `ELECTRON_E2E=FAILED`; the Gate is not accepted as passing.

- `card-battle-defense` and `home-arena-soak` hit CDP screenshot timeouts. The L-focused run after the Gate passed defense. The soak failed at its five-minute checkpoint after 5m48s, so the required 20-minute soak is **NOT COMPLETE**.
- Fate scenarios include an unverified missing legacy `#ArenaAttack` target and two `GameFacade.ready` timeouts. They did not establish a card battle regression.
- Shared character-creation setup intermittently failed to record a visible candidate/direction selection; the same setup scenarios passed on adjacent runs. These remain `SETUP_BLOCKED`, not game passes.
- The `time-save` scenario stopped on a settlement-history day-index assertion mismatch (`ASSERTION_DEFECT`).
- `UI_REAL_EXE=NOT_VERIFIED`: the packaged Windows EXE ran and displayed the UI, but pointer/keyboard input was generated over CDP; physical Windows mouse and keyboard input was not exercised. `SERVICE_SIM=NOT_RUN` in the focused L run.

Final focused status: `V59L_CARD_BATTLE_UI=PASS (ELECTRON_E2E)` because the home player entry, card actions, enemy turn, victory reward and restart restore were exercised through visible UI in the packaged Electron application. The broader L/M/N GamePlay Gate remains `FAILED`, and the soak and physical-input checks remain unverified.

## N.4 新鲜版本复核（2026-10-21）

在 fresh ASAR `7c7d8eae7a7ac464cef4d948e5bd7c5a92c936887baa0e6baf4deb11e4643949` 上，L 五个 GamePlay 专项场景在 Gate 中均 PASS；主页卡牌入口场景也 PASS，证明正常入口仍是卡牌回合战斗且敌人点击不直接造成伤害。新版本 20:26 soak PASS。后续第二次完整 Gate 为 23/25；两个失败项已定向复测通过，但最近完整 Gate 仍 FAILED。`V59L_CARD_BATTLE_UI=PASS (ELECTRON_E2E)` 的卡牌专属证据保持有效。物理 Windows 输入仍 `UI_REAL_EXE=NOT_VERIFIED`；详见 [V59N4 验收报告](V59N4-GAMEPLAY-STABILITY-FINAL.md)。
