# V5.9-A Character Creation Implementation Plan

## Goal

Ship the V5.9-A character creation and destiny system while preserving existing career progression and old saves. New players complete a seven-step draft, choose one deterministic destiny, allocate five potential points, and enter the existing tutorial and task loop. Existing saves receive an idempotent, resumable destiny backfill without being sent through new-player creation.

## Architecture

`assets/scripts/v59` owns deterministic generation, draft validation, attribute projection, and destiny effects. `GameContext`/`GameFacade` expose one authoritative creation and backfill service. `SaveService` migrates and routes saves without resetting existing state. Existing work, fatigue, mind, event, battle, NPC, responsibility, and task services consume projected values at their current settlement points. Cocos and Electron UI share the facade and persisted draft.

## Global Constraints

- Save version advances from 13; malformed/future saves remain fail-closed.
- The deterministic rules identifier is `v59a.1`; domain generation never calls `Math.random`.
- Creation state stays outside the formal character until final confirmation.
- Existing salary, profession progression, equipment, inventory, tasks, and battle state are preserved during backfill.
- No remote image, advertising reroll, second resource system, or automatic destiny selection.
- Existing QA artifacts in the original checkout remain untouched.
- Git push must be a normal fast-forward after merging the current remote tip; never force-push.

## Planned Files

- Create `assets/scripts/v59/character-rules.ts` and `assets/scripts/v59/character-rules.ts.meta` for seed normalization, xorshift32, candidate generation, nickname validation, and allocation validation.
- Create `assets/scripts/v59/character-attributes.ts` and its Cocos `.meta` for effective attributes and data-driven hook modifiers.
- Create `assets/scripts/v59/character-creation-service.ts` and its `.meta` for draft persistence, seven-step transitions, finalization, and old-save backfill.
- Modify `assets/scripts/model/save-data.ts`, `assets/scripts/model/player-data.ts`, `assets/scripts/core/game-context.ts`, `assets/scripts/facade/game-facade.ts`, and `assets/scripts/services/save-service.ts` for typed persistence and authority wiring.
- Modify existing effect owners only at their current business settlement point: `assets/scripts/services/mind-service.ts`, `assets/scripts/services/work-service.ts`, `assets/scripts/v57/fatigue-service.ts`, `assets/scripts/v3/battle-service.ts`, `assets/scripts/v5/story-director.ts`, `assets/scripts/v3/responsibility-service.ts`, `assets/scripts/v56/task-runtime-director.ts`, and the existing cultivation/NPC services found during implementation.
- Modify `assets/scripts/v5/profession-service.ts` to prevent a fresh character from bypassing finalization or receiving duplicate starter items.
- Create a Cocos creation component/controller and view model under `assets/scripts/ui`; modify the Cocos root/controller and `desktop/ui-overlay.js` to route new saves to the wizard while established saves reach the current home.
- Add focused tests under `tests/v59`, plus narrow regression tests for migration, save recovery, profession starter items, effects, tutorial, and UI.
- Create `ai/reports/V59A-CHARACTER-CREATION-DELIVERY.md` with verified hashes, test results, compatibility, evidence classification, and remaining issues.

## Execution Tasks

### 1. Deterministic domain rules

Write tests first for xorshift32 vectors, unsigned/zero seed normalization, canonical candidate hashing, three distinct candidates, 50-point totals, 6–16 bounds, profession-specific candidate B, destiny uniqueness, three rerolls, nickname Unicode/control validation, and allocation bounds/leftovers. Run the focused test expecting the feature-missing failures. Implement the pure rules, rerun it to green, then compile the game TypeScript.

Candidate order is fixed as `insight, constitution, perception, fortune, willpower`. Candidate A starts at `[10,10,10,10,10]` and moves one seeded point from one distinct stat to another. Candidate B is fixed by profession. Candidate C fixes fortune at 16 and distributes 34 points across the other four stats with one seeded bounded donor/receiver transfer. Canonical serialization uses that exact field order. New reroll seeds derive from the stored base seed and one-based reroll count; previously shown triplets are skipped deterministically.

### 2. Save model, routing, and recovery

Add typed V59 fields and a pure fresh-versus-established classifier. Only an empty save or a pristine role-less save may enter `CREATION_REQUIRED`; any real progression signal routes to ordinary play plus non-blocking `BACKFILL_REQUIRED`. Add tests for no save, pristine v13, established v13 with and without profession, pre-v10 role mapping, malformed/future saves, draft restart, and repeated backfill. Implement draft persistence separately from `game-save`, then verify migration preserves all old fields and corruption remains fail-closed.

### 3. Finalize once and backfill once

Add facade operations to read/update/back/advance/reroll/allocate/finalize a draft. Finalization validates all fields, constructs profession starter inventory/equipment/materials, sets character data and a durable receipt in one player snapshot, and performs one save. On a thrown storage write, restore the in-memory snapshot and keep the draft. On restart, the receipt is authoritative; never replay the starter kit. Backfill applies only the missing V59 record and its receipt. Test failed-write retry, committed-write/restart, and old-save invariants.

### 4. Project attributes and destiny effects

Add one immutable projection API: `effective = innate + earned + legal temporary/equipment deltas`. Add table-driven hook lookup with hook IDs and bounded multipliers. Wire each of five attributes and six destinies to an existing service settlement point; test both the resulting value and the no-change path for unrelated work. Test that changing/removing a supplied temporary modifier never changes innate or earned values.

### 5. Cocos and Electron creation flow

Create the exact seven states `INDUSTRY → DIRECTION → PROFESSION → IDENTITY → BACKGROUND → DESTINY → ALLOCATION`. Bind all controls to facade operations so back/forward/reload preserves the draft. Cocos is the Mini Game surface; `desktop/ui-overlay.js` supplies the 1280×720 PC flow. Include four local avatar variants, keyboard/mouse behavior, locked roles, three destiny cards, three free rerolls, point allocation, and a confirm screen. Test view-model transitions and desktop DOM actions before packaging.

### 6. Onboarding and regression

After finalization, persist four short intro panels and an existing executable profession-specific task/goal with a one-time receipt. Skip and restart resume the terminal state without duplicate task or reward. Backfill bypasses this onboarding. Run focused V59 tests, the relevant V5.8 suites, `npm test`, `npm run build:all`, `npm run gameplay-v2:check`, and PC build/package commands.

### 7. Windows package and delivery

Build the Electron EXE, compute hashes from actual output, and try real EXE interaction. Mark `UI_REAL_EXE` only after observing the launched EXE; otherwise mark `NOT_VERIFIED` and state why. Save only newly captured evidence. Fill the delivery report from command output and Git state. Fetch/merge the current origin tip without rewriting history, verify the merged result, commit the task changes, and push normally if the remote accepts it.

## Acceptance Review

The plan explicitly covers seven-step creation, old-save routing, deterministic candidates and rerolls, six destiny effects, five attribute hooks, transaction/idempotency, Cocos and Electron UI, new-player onboarding, regression, truthful EXE evidence, report hashes, and non-forced integration. Anything that lacks a safe existing rule hook must be reported as incomplete rather than described as active.
