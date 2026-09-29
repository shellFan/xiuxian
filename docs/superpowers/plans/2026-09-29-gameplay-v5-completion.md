# Gameplay V5 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable, deterministic, save-safe WorkplaceMessenger that turns existing work, NPC, evidence, responsibility, incident, overtime, dungeon, combat and settlement systems into the V5 workplace story loop.

**Architecture:** `MessengerService` owns persisted conversations/messages and delegates all game effects to `StoryDirectorService`, which schedules config-driven events using the existing GameClock and seeded RNG. `GameFacade` remains the only UI boundary; the desktop overlay renders the façade projections and never owns game state.

**Tech Stack:** Cocos Creator 3.8 LTS, TypeScript, JSON configuration, Electron desktop overlay, Node test runner.

## Global Constraints

- Extend existing V4 systems; do not create a second clock, save, NPC, event, incident, responsibility, combat or task system.
- Preserve Scheme B as a one-screen 1280×720 home; only add compact messenger access.
- Persist all gameplay-affecting messenger state in save version 9 and migrate V4.1 saves with safe defaults.
- Use `RandomService`/game time for deterministic scheduling and identifiers; never use `Math.random()` or wall-clock time for gameplay IDs.
- Use JSON files in `assets/configs/v5/` for authored message content and validate all references in `content:check`.
- Keep normal message history bounded per conversation and preserve only a bounded evidence/story summary.
- Validate build, content, gameplay, tests, desktop build/check, portable package and Electron screenshots before release.

---

### Task 1: Repair the V5 baseline and Messenger state semantics

**Files:**
- Modify: `tests/facade/game-facade.test.ts`, `tests/v2/phase1-core.test.ts`, `tests/v3/work-today-time.test.ts`, `tests/v4/v4-workplace.test.ts`
- Modify: `assets/scripts/v5/messenger-service.ts`, `assets/scripts/model/save-data.ts`, `assets/scripts/services/save-service.ts`
- Test: `tests/v5/messenger-foundation.test.ts`

**Interfaces:**
- Consumes: `GameFacade.queryMessages(conversationId)` and `MessengerMessageState`.
- Produces: unread-as-viewed state distinct from resolved-reply state, deterministic message IDs, and bounded persisted message history.

- [ ] Update legacy test assertions to use `CURRENT_SAVE_VERSION` and run `npm test` to reproduce the V5 version-contract break.
- [ ] Add failing foundation tests that open a conversation before replying, deliver two events at the same game instant, and overflow one conversation beyond its archive cap.
- [ ] Change message eligibility from `!read` to `!seen`/unresolved reply state; generate IDs from event, step, game timestamp and a stable sequence; preserve at most 120 live messages plus 20 summary records per conversation.
- [ ] Run `node tests/.compiled/tests/v5/messenger-foundation.test.js` and `npm test`.
- [ ] Commit: `fix(v5): harden messenger state and save contracts`.

### Task 2: Complete content contracts and authoring coverage

**Files:**
- Modify: `assets/configs/v5/messenger-events-core.json`, `assets/configs/v5/messenger-events-people.json`, `assets/configs/v5/messenger-events-team.json`, `assets/configs/v5/messenger-events-windows.json`
- Modify: `assets/scripts/v5/messenger-content.ts`, `scripts/check-v2-content.cjs`
- Test: `tests/v5/messenger-content-contract.test.ts`

**Interfaces:**
- Consumes: `MessengerEventDef`, actor and conversation config files.
- Produces: validated content categories: ≥120 events, ≥40 chains, ≥20 17:55 events, ≥20 incident chats, ≥30 funny events, and actor/event integration requirements.

- [ ] Write a failing content-contract test that counts event category signals and validates all `nextEvent`, evidence, incident and reply references.
- [ ] Add authored JSON events covering recall, blame, credit stealing, requirement confirmation, calls, meetings, false P0, warm outcomes, Friday 17:55 and weekend decisions.
- [ ] Make the content check fail with explicit IDs for unknown effects, invalid time windows, cycles, missing replies and unmet category thresholds.
- [ ] Run `npm run content:check` and the compiled content-contract test.
- [ ] Commit: `feat(v5): complete workplace messenger narrative content`.

### Task 3: Make story pacing, first week, and save stress executable

**Files:**
- Modify: `assets/scripts/v5/story-director.ts`, `assets/scripts/v5/messenger-service.ts`
- Test: `tests/v5/first-week-story.test.ts`, `tests/v5/workplace-integration.test.ts`, `tests/v5/save-stress.test.ts`

**Interfaces:**
- Consumes: `GameClockV2`, `RandomService.forDay`, `MessengerService.deliverEvent`, existing task/evidence/incident services.
- Produces: a reproducible D1–D7 arc, pending reply behavior, finite 30-day stress runs, and save/load-safe chains/incidents/battles.

- [ ] Write failing tests for the D1–D7 required beats and seven specified save/load boundaries.
- [ ] Drive only via fake game time and bounded batches; assert no duplicate ID/effect, no negative unread, no chain loop, no dangling incident/responsibility, and capacity bounds.
- [ ] Implement minimal director/service changes necessary to make the red tests pass without widening core-economy rules.
- [ ] Run all three V5 test files and `npm test`.
- [ ] Commit: `test(v5): harden story pacing and save stress`.

### Task 4: Desktop messenger interaction and Scheme B regressions

**Files:**
- Modify: `desktop/ui-overlay.js`, `desktop/ui-overlay.css`, `desktop/ui-overlay-v2.js`
- Test: `tests/v4/desktop-overlay-dom.test.ts`, `tests/v5/desktop-messenger-dom.test.ts`, `tests/v5/release-dev-gate.test.ts`

**Interfaces:**
- Consumes: façade messenger query/reply APIs and existing overlay action delegation.
- Produces: one-screen home unread widget, readable 30/70 messenger desktop layout, persistent reply actions, 17:55 typing presentation, and release-hidden DEV panel.

- [ ] Write failing DOM tests for a visible unread entry, a reply option after opening its conversation, fixed reply footer, and a release-hidden DEV panel.
- [ ] Implement overlay-only rendering and refresh behavior; do not move gameplay effects into the UI.
- [ ] Run desktop DOM tests, `npm run pc:check`, and `npm run pc:build`.
- [ ] Commit: `feat(v5): polish desktop messenger runtime`.

### Task 5: Balance and release verification

**Files:**
- Modify: `ai/reports/GAMEPLAY-V5-FINAL.md`
- Create: `ai/reports/screenshots/01-home-message-widget.png` through `16-daily-plan-reality.png`

**Interfaces:**
- Consumes: real Electron runtime and release scripts.
- Produces: verified package, evidence-backed release report and real runtime screenshots.

- [ ] Run 7/30/60-day balance simulation and make only narrow adjustments required to keep free overtime ≤24h, daily ads ≤6, and GRINDER ad economy <25%.
- [ ] Run `npm run build:game`, `npm run content:check`, `npm run gameplay-v2:check`, `npm test`, `npm run release:check`, `npm run pc:check`, `npm run pc:build`, and `npm run pc:pack:portable`.
- [ ] Exercise the requested new-save playthrough in Electron, capture the sixteen required runtime screens, and record any unavailable scenario truthfully.
- [ ] Inspect git status for generated clutter, commit only source/tests/reports, push `gameplay-v2`, fetch, and verify local and remote heads agree.
