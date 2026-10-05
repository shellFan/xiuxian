# Desktop UI repair implementation plan

Canonical version: V2, PLAN_APPROVED. Advisor findings ledger: UI-001, UI-002, UI-003, UI-004 and TEST-001 INCORPORATED in the explicit contracts below. Root planning, no separate Planner. Baseline normal-permission `npm test` completed with exit 0, 130 test files; the prior sandbox-only child-spawn EPERM is resolved by approved process execution.

**Goal:** Resolve the supplied screenshots' clipped homepage and contradictory pending-action feedback, and polish shared desktop interface readability and usable controls.

**Architecture:** Keep the existing blue scene and cream panel design. Consolidate company/day/fatigue/burnout chips into a wrapping status row. Preserve useful minimum sizes for the countdown, action detail and buttons; allow contained scrolling when content exceeds the available viewport. Resolve pending entries from canonical service projections and route every displayed incident into its supported handling flow, preserving automatic S1 priority.

**Tech stack:** Cocos Creator 3.8.4, TypeScript GameFacade, Electron 28 DOM overlay, existing TypeScript and Electron tests.

## Baseline and constraints

- HEAD `81acb0874bd83f00408edc57869f99cee3080fa8`, branch `gameplay-v2`.
- Initial status, tracked diff, and untracked file list all empty.
- User authorizes interface optimization and broken click repairs using the existing visual style.
- Developer route: GPT-5.6 Luna; code Reviewer route: GPT-5.6 Sol. Root owns plan and acceptance. No commits, pushes, merges, save resets, dependency additions, destructive commands, or generated build cleanup.
- Developer allowedPaths: `desktop/ui-overlay.js`, `desktop/ui-overlay.css`, `desktop/ui-overlay-v2.js`, `tests/v4/desktop-overlay-dom.test.ts`, new `tests/v4/desktop-ui-repair.test.ts`, new `desktop/ui-repair-capture.cjs`, `assets/scripts/v56/goal-director-service.ts` only if a semantic goal action needs correction, and `tests/v56/workday-director.test.ts` only for that correction.
- Everything else is forbidden for Developer writes. Compilation output in ignored `tests/.compiled` and captures in `ai/reports/screenshots/ui-repair/` are permitted verification artifacts. Root owns this plan and the final report.
- Preserve storage, economy, ads, platform behavior and unrelated task state. Out-of-scope findings must be reported.

## Acceptance criteria

1. At 1280×720, 1150×680, 1600×900, 1600×480 and 720×1280, populated home states show a readable countdown, intact action selectors and complete primary/secondary detail buttons. Populated and long strings, all four action details, capacity overload and extra status chips must be exercised. Desktop center/left/right columns own their overflow when needed; the narrow layout uses the body scroll host. Every essential button rectangle fits its host, or becomes fully visible after `scrollIntoView({block:'nearest'})` in that host. No horizontal overflow is allowed. Scene countdown has an explicit useful minimum height, not merely nonzero bounds.
2. Company/day/fatigue/burnout metadata use one wrapping region. Side panels remain readable; shared headers, tabs, cards, dialogs and navigation have consistent spacing, visible focus and clear disabled explanations.
3. Count and explicit click routing share actionable canonical projections. Deduplicate the same active incident represented in offline events by stable canonical incident ID; count remaining distinct actionable offline decisions and current workplace events. Presentation-hidden S1 is not re-exposed. Test active S1/S2, offline duplicate incident, unavailable projections, zero pending and current workplace. Automatic S1 priority remains intact; explicit clicks must support non-S1 incidents too.
4. Formal incidents from `queryIncidentState().active` use supported `startBattleRun('INCIDENT', buildId, null, active.id)` linkage or canonical mitigate/recover APIs. Resume a matching `linkedIncidentId` run; an unrelated active battle requires clear guidance without starting another. Message-generated `queryPendingIncidentDungeon()` alone uses `startIncidentDungeon(incidentType)`. “立即处理” must enter the corresponding real handling surface. Preserve S1 > pending > workplace automatic arbitration and authoritative incident state.
5. Audit visible navigation, card selectors, modal close/confirm buttons and journey actions with real DOM clicks; fix direct interface defects within allowed paths and record independent service issues.
6. Run fresh `npm run build`, full `npm test`, targeted DOM interaction/layout tests and captured screenshots. Baseline build passes; sandboxed tests fail at child-process spawn `EPERM`, so use approved normal process execution to rerun. Compare baseline and changed code; unresolved environment or out-of-scope failures must be explicitly recorded, never reported as passing. Runtime checks use temporary/isolated state, never the user's desktop save. Reviewer finds no outstanding BLOCKER or HIGH findings, with at most three code review rounds.

## Explicit click outcome contract

- Re-read current canonical projections immediately before opening or handling a stable ID. Rendering alone must not consume any state.
- `opened`: actual modal exists or target handling page is shown; `resume`: existing matching incident/battle surface is shown. Neither may produce an empty-pending toast.
- `already-open`: preserve the open popup and show no “暂无待处理”. A null selected projection does not imply empty when the modal opened.
- `stale/empty`: refresh the badge; only show a truthful no-longer-pending message after current projections confirm no actionable item remains. A stale journey item cannot start a new unrelated incident.
- `unavailable`: explain the missing handling capability or failed query/action; retain badge/state when a known item remains. No success toast and no silent reset.

## Task 1: Regression evidence

- [ ] Extend the Electron test fixture with the status projections omitted by existing layout tests.
- [ ] Measure descendant/button bounds against their scroll container and viewport; checking only body scrollHeight is insufficient.
- [ ] Capture failures for collapsed scene/detail and S2 badge opening; assert actual modal or navigated page and absence of the misleading toast.
- [ ] Compile using `npx tsc -p tsconfig.game.json --outDir tests/.compiled --noEmit false`, then run the targeted compiled test. Record expected failure evidence before production edits.

## Task 2: Layout and visual polish

- [ ] Update `homeCenterHtml` with a wrapping status group; size the scene and details without shrinking below usable contents.
- [ ] Adjust shared styles and responsive grids within the established visual system. Use contained scrolling for short windows rather than overflow hidden that clips essential controls.
- [ ] Verify all action details, long/full side panels, portrait fallback and common pages in Electron. Avoid global CSS changes that enlarge every card unexpectedly.

## Task 3: Pending and incident interactions

- [ ] Build click routing from the same supported canonical categories used for counting; distinguish already-open, opened, empty and unavailable outcomes.
- [ ] Keep automatic S1 priority while exposing S2 incidents via explicit actions. Reuse supported incident dungeon and workplace decision APIs without consuming/resetting authoritative state in the UI.
- [ ] Route journey incident actions and confirmation buttons to the correct handling surface; handle existing battle, failures and stale pending state truthfully.
- [ ] Run new regressions and existing overlay/workday tests.

## Task 4: Integration and review

- [ ] Root runs fresh build and all tests, captures a representative repaired homepage and checks the image visually.
- [ ] GPT-5.6 Sol Reviewer examines the actual diff, canonical incident contracts, responsive behavior and tests. Luna fixes required findings, at most three rounds.
- [ ] Record Developer Result, verification evidence, remaining platform limits and outOfScopeFindings. Leave changes uncommitted for user review.
