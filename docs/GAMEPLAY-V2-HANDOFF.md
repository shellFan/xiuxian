# Gameplay V2 Handoff

## Delivery

- **Branch:** `gameplay-v2`
- **Base SHA:** `6cd2a7b97419b99cfca8b0dfc0aac93925f94f9a`
- **Phase 1–7 HEAD before closeout:** `38a019269146e153460b17e706f974ed74baecdc`
- **Remote:** intentionally not pushed by this handoff.

## Gameplay inventory

| Area | Delivered |
|---|---|
| Game day | Timestamp-driven 09:00–18:00 workday, lunch window, offline recovery, clock rollback guard, daily situation |
| Modes | WORK, FISHING, CULTIVATING, SOCIAL |
| Daily situation | 42 modifiers across company, boss, project, and personal state |
| Event engine | 129 events, 41 branching events, 10 chains, offline triage and negative-streak protection |
| Build | 27 materials, 30 techniques, 30 equipment items, 32 recipes, 10 consumables |
| NPC / demon | 6 NPC relationships and 8 inner-demon debuffs |
| Progression | Daily/weekly settlement, 30 daily titles, 30 defense questions, promotion V2 |
| Legacy merge | Not on the Gameplay V2 runtime path; retained only for old compatibility tests |
| Save migration | Version 6 migration provides defaults for Gameplay V2 fields without clearing old saves |

## Phase 8 runtime evidence

| Check | Result |
|---|---|
| Gameplay gate | `npm run gameplay-v2:check` passed: TypeScript, content integrity, and legacy-merge gate |
| Cocos build | Cocos Creator 3.8.4 built `web-desktop` successfully |
| Desktop integration | Built content copied into Electron desktop shell; `npm run pc:check` and `npm run web-v1:check` passed |
| Runtime launch | Electron loaded the actual generated build, initialized storage, facade, game loop, and emitted `GAME_READY` |
| Screenshot | Fresh desktop captures were produced under ignored `ai/reports/home-visual/` on 2026-09-19; the captured save displayed its weekend-choice modal |
| Work week | Friday daily/weekly settlement and exactly-once persistence coverage passed in `tests/v2/phase5-settlement.test.ts`; the 30/60-day simulator repeatedly crosses work-week boundaries |
| Save/restart | 30 E2E checks passed, including save/load and full lifecycle save/load/continue paths |

## Balance simulation

The deterministic full-service simulator completed all profiles without NaN, negative resources, or out-of-range mind/demon/relationship values.

| Profile | Duration | Final level | Key milestone |
|---|---:|---:|---|
| Casual fishing | 30 workdays | L5 | L2 D3, L5 D24 |
| Normal | 30 workdays | L4 | L2 D15 |
| Normal | 60 workdays | L7 | L2 D11, L7 D50 |
| Hardcore | 30 workdays | L4 | L2 D15 |
| No-ad cultivation | 30 workdays | L5 | L2 D5, L5 D25 |
| Social | 30 workdays | L5 | L2 D3, L5 D24 |

## Closeout notes

- Confirmed temporary generators, patch scripts, screenshot probes, and the obsolete backup are removed from Git tracking. The five pre-existing local diagnostic scripts requested for preservation remain untouched.
- `tmp/` remains ignored for future generated diagnostics.
- No Cocos Editor manual scene edit was required: the shipped scene and generated Web Desktop build were both checked. The Electron development runtime prints its standard development CSP warning; it did not block boot or gameplay verification.
- One pre-existing ignored file, `build/web-desktop/index.html`, denies the current Windows account read access. The active build path is therefore centralized in `scripts/web-desktop-build-path.cjs` as `build/web-desktop-current/web-desktop`; Cocos, desktop copy, and browser preview all use that recoverable generated directory while retaining Cocos's native `web-desktop` task name. The stale historical directory is no longer on the build or runtime path.
- Cocos Creator 3.8.4 can return status 36 after logging a successful build because of a non-fatal `libpng` profile warning. `scripts/build-web.cjs` first clears its isolated output directory, then only accepts that exact status after checking the complete non-empty runtime artifact and fresh dynamic entry files. Static template and engine resources keep their original Cocos timestamps, so their presence in the freshly cleared output—not their mtime—is the freshness evidence. Every other non-zero status, missing file, empty file, or stale dynamic entry remains a failure.
