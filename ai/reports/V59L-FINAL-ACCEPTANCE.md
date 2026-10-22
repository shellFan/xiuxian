# V5.9-L Final Acceptance

**L milestone:** `feature/v59l-card-battle` (`c2f3b03` documentation checkpoint; implementation commit `9341935`).
**Current containing branch:** `feature/v59n-career-life-growth`, HEAD `9932a7af71d2c4e5b9de3af22567bf7bdf790059`.
**Current worktree:** contains uncommitted N.4 and historical gameplay evidence; this report does not claim a clean worktree.

## Acceptance result

`V59L_CARD_BATTLE_UI=PASS (ELECTRON_E2E)`. The regular home combat entry starts or resumes the authoritative card battle. In the packaged Electron experience the hand, energy, enemy intent, attack, defense, end-turn action, enemy response, victory, reward claim, and save restoration were exercised through visible UI controls. Directly clicking an enemy does not substitute for playing a card or reduce its HP.

The L focused acceptance run `20261017-172810-b25997` passed all five scenarios: `card-battle-defense`, `card-battle-first-win`, `card-battle-random-event`, `card-battle-save-reload`, and `character-creation-attributes`. A later L UI replacement run `20261020-091912-c66654` also passed 5/5, and the N.4 full Gate's card-battle scenarios passed. Screenshots, replay files, and authoritative snapshots are retained under `ai/gameplay-agent/reports/`.

## Implemented scope

- Turn-based battle with 3 energy, a five-card opening hand, draw/discard piles, shuffle, attack/defense/skill/fate cards, enemy intent and actions, win/loss settlement, rewards, and save/restart restoration.
- 36 catalogued cards, 12 battle events, two phase-capable bosses, and 36 original card-art images.
- Character creation random attributes constrained to integer 50–88; tests cover reachable boundaries and seeded generation. Random base attributes remain separate from manual allocation; visible `+5` and five `-1` actions restore the original allocation.
- Startup event gating prevents ordinary gameplay events from interrupting incomplete character creation.
- GamePlay Agent scenarios exercise normal UI entry and authoritative state assertions; the runner waits for real state transitions and handles visible event modals without hiding them.

## Verification evidence

- `npm test`: completed successfully on the containing N branch; V5.9-L and V5.9-M tests ran with the suite. The final GamePlay Runner TAP group was 72/72 PASS.
- `npm run release:check`: the package script is exactly the same TypeScript compile plus `tests/run-all.cjs` command as `npm test`; it was not run a second time.
- L focused GamePlay Agent run `20261017-172810-b25997`: 5/5 PASS against packaged Electron EXE. `ELECTRON_E2E=PASS`, `BUILD_PROVENANCE=FRESH`, `SERVICE_SIM=NOT_RUN` for that focused run.
- Current L/M/N overall Gate is not an L-only result: the latest complete N.4 Gate `20261020-195254-d7de45` ended 23/25. Its two remaining scenarios subsequently passed individually (`20261020-203453-a961c6` and `20261020-203529-f42b64`). The Gate itself remains failed and is not represented as passed here.
- Latest packaged Electron EXE SHA-256: `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`. Latest targeted-run ASAR SHA-256: `215afc96b1700773abb2afe780efe44350b9baad4d8bceccb2330c72d01c8073`. The L-focused package hash is recorded separately in the original run report; Electron's executable hash is stable across packaging, so the ASAR/build manifest identifies app contents.

## Limits and Git status

- `UI_REAL_EXE=NOT_VERIFIED`: all recorded inputs were CDP synthetic events; no physical Windows mouse/keyboard verification is claimed.
- The N.4 Gate, 30/100-day M/N balance matrix, selected UI coverage, and Cocos Creator child exit code 36 investigation remain open in [V59N4-GAMEPLAY-STABILITY-FINAL.md](V59N4-GAMEPLAY-STABILITY-FINAL.md).
- The L and M milestone commits are ancestors of the current N branch; `feature/v59m-sect-worklife-economy` already exists. No branch switch, commit, push, or merge was performed. Repository `AGENTS.md` prohibits automatic commit/push, and current worktree modifications were preserved.

## V5.9-N.5 续验状态更新（2026-10-21）

L 卡牌专项在最近完整 Gate `20261021-051131-90aab0` 中 4 个场景均 PASS；这是既有 ELECTRON_E2E 证据，本轮未修改战斗业务代码或重打包。最新完整 Gate 整体为 17/25，不能将完整验收记为通过。当前 EXE SHA 为 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`，ASAR SHA 为 `3a5d2b29600e705e13d54c5660937b6ea8bda160111e228b0cf019e3ec6b441b`。物理 UI 仍 `NOT_VERIFIED`；总体验收状态见 [V59N5-FINAL-PLAYABLE-ACCEPTANCE.md](V59N5-FINAL-PLAYABLE-ACCEPTANCE.md)。
