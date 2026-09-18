# Gameplay V2 Phase 6–9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a playable, verifiable Gameplay V2 vertical slice through its Web Desktop UI, with a local handoff commit.

**Architecture:** Keep Gameplay V2 domain services authoritative. Add side-effect-free facade projections and explicit command results for the DOM overlay; the overlay re-renders from a fresh projection after each command. Validation is deterministic and uses injected clocks/storage, while real Cocos-editor-only checks stay explicitly manual.

**Tech Stack:** TypeScript, Cocos Creator 3.8, Node.js test runner, Web Desktop DOM overlay.

## Global Constraints

- Work on `gameplay-v2`; do not push, merge, reset, stash, or remove user files.
- Preserve the five pre-existing untracked `tmp/*.py` / `.ps1` diagnostic scripts.
- All saved-state mutations must roll back on persistence failure.
- UI reads immutable projections and invokes mutations only through facade commands.
- Do not report a Cocos Editor verification as automated when it was not run.

---

### Task 1: Repair Phase 5 persistence transactions

**Files:**
- Modify: `assets/scripts/v2/v2-settlement-service.ts`
- Test: `tests/v2/phase5-settlement.test.ts`

- [ ] Add injected-save-failure tests for daily settlement, weekly settlement, and both defense outcomes.
- [ ] Verify each test fails because PlayerData or settlement retry state leaks on a failed save.
- [ ] Restore the exact PlayerData snapshot on every save failure.
- [ ] Run the focused test, full `npm test`, and `npm run build`.

### Task 2: Wire Gameplay V2 to Web Desktop UI

**Files:**
- Modify: `assets/scripts/facade/game-facade.ts`, `desktop/ui-overlay.js`, `desktop/ui-overlay.css`
- Test: `tests/facade/game-facade.test.ts`, `tests/ui/gameplay-v2-overlay.test.ts`

- [ ] Add failing facade tests for a frozen V2 dashboard/build/backpack/settlement projection and command-result behavior.
- [ ] Add facade query and command APIs without leaking mutable PlayerData.
- [ ] Render the V2 home, event modal, build, backpack, settlement, and development controls from the facade projection.
- [ ] Re-render after every command success or error and run focused/UI regression tests.

### Task 3: Add deterministic gameplay and balance gates

**Files:**
- Create: `scripts/gameplay-v2-check.cjs`
- Modify: `package.json`
- Test: `tests/v2/gameplay-v2-check.test.ts`

- [ ] Add failing assertions for content/config invariants and seeded 1/5/14/30/60-day runs.
- [ ] Implement the isolated checker and `npm run gameplay-v2:check`.
- [ ] Assert finite non-negative progress, intended unlocks, settlement uniqueness, and the stated early-level KPI pace.
- [ ] Run the checker and its tests.

### Task 4: Validate runtime and save/restart behavior

**Files:**
- Create: `scripts/gameplay-v2-runtime-check.cjs`
- Test: `tests/v2/gameplay-v2-runtime.test.ts`

- [ ] Create a failing deterministic Monday-to-Friday and save/restart test.
- [ ] Implement an executable runtime check using real game services and memory persistence.
- [ ] Run Web Desktop build/capture tooling when available; otherwise record the exact manual Cocos Editor verification needed.
- [ ] Run the runtime gate and relevant build command.

### Task 5: Close out safely

**Files:**
- Create: `docs/GAMEPLAY-V2-HANDOFF.md`
- Modify: `.gitignore` only if a tracked or generated disposable artifact requires it.

- [ ] Inspect tracked temporary artifacts individually; remove only confirmed disposable tracked files.
- [ ] Record feature inventory, commands/results, Cocos manual status, commit IDs, and deferred items.
- [ ] Run fresh `npm test`, `npm run build`, `npm run gameplay-v2:check`, and runtime check before local commit.
- [ ] Commit all phase work locally; do not push.
