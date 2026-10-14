# GamePlay Agent

GamePlay Agent is the repository-owned Windows desktop playtest runner for 《牛马修仙传》. It launches the packaged game, connects only to its own localhost Chromium DevTools Protocol endpoint, drives the real window with mouse and keyboard events, reads snapshots from the existing `GameFacade`, and saves reproducible scenario results.

## Commands

| Command | Purpose |
|---|---|
| `npm run gameplay-agent:smoke` | Launch the EXE and check the first creation screen, next-step control, and creation flow. |
| `npm run gameplay-agent:test` | Run every JSON playtest scenario against the packaged EXE. |
| `npm run gameplay-agent:creation` | Run the seven-step character creation and main-page stage by itself. |
| `npm run gameplay-agent:economy` | Run the task, wage accrual and ¥18 coffee stage by itself. |
| `npm run gameplay-agent:time-save` | Run 07:59/08:00/08:01 clock checks, settlement, three workdays and save recovery. |
| `npm run gameplay-agent:full-journey` | Run the seven-step new-player journey and first playable home checks. |
| `npm run gameplay-agent:viewport` | Check content viewport layout at 1280×720, 1366×768, 1600×900 and 1024×768. |
| `npm run gameplay-agent:report` | Print the newest run and defect summary. |
| `npm run gameplay-agent:rerun-failed` | Rerun only scenarios that failed in the newest run. Each persistent defect is capped at three repair cycles, then marked `ESCALATED`. |
| `npm run gameplay-agent:gate` | Run the full unit/release tests, build and package the desktop EXE, check the package, then run every playtest scenario. Any failed or unverified stage blocks the gate. |

The root `npm test` includes GamePlay Agent's runner tests. `npm run release:check` remains the full game-unit-test entry point. Feature development follows `npm test` → `npm run pc:build` → `npm run pc:pack` → `npm run pc:check` → `npm run gameplay-agent:smoke` → `npm run gameplay-agent:test` → fix and `npm run gameplay-agent:rerun-failed` → inspect `npm run gameplay-agent:report`. Release acceptance uses `npm run gameplay-agent:gate`.

## Scenarios

JSON scenarios live in [`scenarios/`](./scenarios/). `smoke.json` checks the default game window and a clickable, unobstructed, in-bounds next-step button. `_new-player.json` is an isolated per-scenario setup that walks the seven creation steps with real mouse and keyboard input, completes onboarding, and verifies the first assigned task. `character-creation.json`, `economy.json`, and `time-save.json` provide separate rerunnable stages; setup failures stop dependent steps and report `SETUP_BLOCKED`. `time-save.json` captures local display date, UTC date, and the clock service's authoritative `dayNumber` independently at 07:59, 08:00, and 08:01; it only asserts the authoritative day number after advancing a full 24 game-clock hours. `profession-loop.json` reads unlocked profession IDs from maintained game content and checks the existing creation service; newly unlocked professions join automatically.

Scenario actions include `click`, `clickIfPresent`, `doubleClick`, `type`, `pressKey`, `scroll`, `waitFor`, `screenshot`, `getGameState`, `assertVisible`, `assertClickable`, `assertState`, and `restartGame`, plus legacy aliases retained for compatibility. `clickIfPresent` handles transient modal controls through actual CDP input; when present it waits for the control to disappear, and when absent it records a safe no-op. The runner also supports bounded CDP content viewport emulation and allowlisted calls to the existing facade. There is no shell, code-evaluation, or arbitrary filesystem action in a scenario. Node owns the variable values and typed metadata. `@vars.name` is scenario-scoped and isolated per scenario; `@run.name` is shared only when a step explicitly sets `asScope: "run"`. Aliases support `asType` values `object`, `array`, `string`, `number`, `boolean`, and `null`; missing aliases and type mismatches fail with explicit errors. Values survive renderer navigation and EXE restarts because they live in the runner process.

The EXE receives a unique CDP port and a freshly created temporary Electron user-data profile for each scenario. Only that process is closed by the runner; the runner never reads, changes, backs up, or deletes the player's normal save directory. Reports distinguish whether Electron logged a visible window from the automation method: inputs are localhost CDP synthetic mouse/keyboard events, and screenshots are renderer-surface captures. A CDP run is not described as physical desktop input. The Agent reads the existing `GameFacade`; it does not create another economy, clock, or save system.

## Configure the EXE

By default the runner uses `dist/牛马修仙传-win32-x64/牛马修仙传.exe`. To test a different packaged build, set `GAMEPLAY_AGENT_EXE` to its absolute or workspace-relative path. The EXE must be a Windows Electron build that can show a GUI. On machines without a usable EXE, smoke and gate are marked `NOT_VERIFIED` and return a non-zero exit code.

## Reports and defects

Each invocation creates an immutable `reports/<run-id>/` record:

```text
reports/<run-id>/
  report.json                 machine-readable run, command, scenario and defect summary
  defects.json                reproducible defects with category, severity, evidence and repair count
  summary.md                  human-readable result and scenario table
  scenarios/<id>/result.json  per-step actions, outcomes, timings and errors
  scenarios/<id>/evidence/
    exe.log                   the launched EXE's own log and visible-window record
    authoritative-state.json  state snapshot from the existing GameFacade
    interaction-step-*.json   before/after popup DOM, clipped hit-test, Canvas and action evidence after blocked input
    screenshots/*.png         real screenshots from the game window
```

Reports are retained locally for history; the Agent does not prune earlier runs. Defect categories are `SETUP_BLOCKED`, `AUTOMATION_DEFECT`, `GAME_DEFECT`, `ASSERTION_DEFECT`, `ENVIRONMENT_BLOCKED`, and `NOT_VERIFIED`. Dependent steps stop after a setup failure instead of producing cascading game-failure claims. Defect entries include a stable ID, category, severity, failing scenario and step, command to reproduce, evidence, and repair-attempt limit. Codex is responsible for changing game code. After each fix, `gameplay-agent:rerun-failed` replays only failed or blocked scenarios. After the third unsuccessful repair cycle, it writes an `ESCALATED-<run-id>.json` record and stops retrying.

Each scenario also gets a `replay.json` file with its source steps, deterministic action inputs, target selectors and coordinates when available, content viewport, authoritative state before/after each operation, result, duration and evidence reference. The report records source/build provenance plus EXE and ASAR SHA-256 when present. `UI_REAL_EXE` is always `NOT_VERIFIED` for CDP synthetic input; `ELECTRON_E2E` records packaged Electron/CDP checks; `SERVICE_SIM` records the release/unit-test stage. The viewport matrix emulates renderer content dimensions and does not claim physical outer-window sizing or Windows display scaling.

The supported life-economy table is covered by game unit tests and scenario assertions. Current product rules are coffee ¥18 / fatigue -12 / 3 per day; milk tea ¥16 / mind +8 / 2 per day; lunch ¥25 / fatigue -8 and mind +5 / 1 per day; snack ¥8 / mind +3 / 3 per day; and dinner ¥68 / mind +15 / 1 per day after work.
