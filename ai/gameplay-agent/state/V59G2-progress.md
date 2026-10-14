# V5.9-G.2 resumable progress

Updated: 2026-10-15

## Baseline and protection

- Source HEAD at the start of this continuation: `c7c834e8e5dca51a49200d6bab7da87e3f7706fd`.
- Branch: `feature/v59f-z-playability`.
- Existing V5.9-F working-tree changes and historical QA/GamePlay Agent artifacts remain present and untouched.
- Scenarios use fresh isolated Electron user-data directories. They do not open, clear, migrate, or delete a normal player save.
- Remote `origin/gameplay-v2` remained at `a8670d12d57173964a82a34f77a9d04279c2c50c`; `origin/feature/v59f-z-playability` is published at the current delivery HEAD.

## G.2 work completed

- [x] Resume the existing V5.9-G.2 work and reread its full specification.
- [x] Keep Node as the owner of scenario/run variables; aliases have explicit scopes and types, survive renderer/restart transitions, and throw for missing paths.
- [x] Record replay operations, viewport, interaction target, before/after state, result and evidence paths.
- [x] Close actual interrupt controls through CDP pointer input and wait for visible popup closure. Stop if closure fails; do not click through a modal.
- [x] Recover a home scroll after a critical-message choice changes pages: after confirming closure, verify and click the real Home navigation control, wait for the original scroll container, then retry. Regression coverage was first run red, then green.
- [x] Preserve the authoritative clock distinction and 07:59/08:00/08:01 checks. The scenario only asserts a dayNumber change after 24 authoritative game-clock hours.
- [x] Run the packaged EXE flows: character creation, task/wage/coffee economy, new-player journey, profession loop, smoke, three workdays/save recovery, and content viewport matrix.
- [x] Run the full gate. Latest report: `reports/20261014-172511-7fd0f9/`, 7/7 scenarios passed.
- [x] Produce the V5.9-G.2 delivery report at `ai/reports/V59G2-OVERNIGHT-GAMEPLAY-QUALITY.md`.

## Latest verification

- `npm run gameplay-agent:gate`: PASS. It ran `release:check` (148 test files plus GamePlay Agent tests), fresh Cocos Web Desktop build, Windows x64 ASAR package, package/resource check, and all 7 CDP/Electron scenarios.
- `npm run gameplay-agent:report`: PASS; it reported the same 7/7 gate run.
- Runner unit tests: 26/26 pass.
- Latest gate build SHA: `b5a502977afa2aac7ad52c62867be748c3b7b8d12ec3c20472705f48baa1fd19`.
- Latest EXE SHA-256: `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`.
- Latest ASAR SHA-256: `5caa26f018371aeb7aa2eaa08170313357e782c6194044c9b2d615832e55e6ed`.
- `UI_REAL_EXE` remains `NOT_VERIFIED`: input was CDP synthetic input and screenshots were renderer captures, not physical mouse/keyboard actions.

## Known follow-up

- One earlier isolated economy run recorded unchanged salary after the requested work tick; two subsequent runs accrued wages and the final gate passed. No game-rule change was made. Track this as an intermittent, not-yet-reproduced wage observation rather than a confirmed game defect.
- The outer Windows window-size/scaling matrix was not exercised; only content viewport emulation was tested.
- G.2 commits: `8cbad61` implementation and evidence, `a7198e9` delivery report, `7b87463` publication status. Existing V5.9-F changes remain unstaged and untouched.
- Pushed `feature/v59f-z-playability` with a normal fast-forward. Remote tracking now matches local HEAD; no force-push was used.

## Next action

Continue from the published feature branch. Remaining V5.9-F edits and historical QA artifacts are intentionally left in the working tree.
