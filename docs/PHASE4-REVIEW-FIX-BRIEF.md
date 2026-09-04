# Phase 4 review corrections — root design decisions

Base to fix: 0a1dfcf1ba7a78f3e4adc6503a2fe44380d9249d. Work only D:/git/fan/xiuxian-ui branch phase4-ui-content. No descendants, commits, push, main checkout or service changes. Root handles final report/Git. One fix batch for six independent review findings; do not broaden scope.

## Accepted findings and implementation

### R1 MEDIUM — layout coordinate root

Owned: docs/UI-DESIGN-SYSTEM.md. Replace ambiguous coordinate semantics, not whole design. The table uses FULL DESIGN VIEWPORT coordinates, origin top-left, size750×1334 in zero hardware inset reference, not origin of already padded content. Define logical insets already converted by width scale. `L=max(insetLeft,24)`, `R=750-max(insetRight,24)`, `T=max(insetTop,16)`, `B=H-max(insetBottom,16)`, usable width=`R-L`. Do not add minimum side padding again. The baseline table's x24 is exactly baseline L.

Responsive formula for horizontal bands: x=L, width=R-L. Actions retain baseline inner ratio: left control width=300*(R-L)/702; recruit x=L+324*(R-L)/702,width=378*(R-L)/702 (gap=24 scaled; if too narrow fall back stacked). Bottom nav4 equal columns. Board side=min(624,R-L), centered x=(L+R-side)/2; square slots same scale. Shortcut row anchored right: x=R-288,R-192,R-96, y=288+(T-16), each88. Do not squeeze shortcut touch areas; if width<288 collapse to More, not overflow. Top rows shift y by(T-16). Navigation y=B-16-112; action y=navY-38-96; board y=actionY-32-side. More height expands office space, not characters. If top+board+actions collide, follow compact/scroll fallback already specified; minimum slot hit88. No negative width or coordinate if truly tiny viewport: stop preview with unsupported viewport error instead of rendering invalid geometry.

Include numeric samples: no hardware insets: L24/R726 usable702, full bands [24,726], board[63,687]; asymmetric insets left80/right0: L80/R726 usable646, full bands[80,726], board[91,715]. T/B examples baseline T16 B1318 -> navY1190, actionY1056, boardY400. Make wording match table and avoid applying formulas twice.

### R2 MEDIUM — ordinary offline command

Owned: docs/UI-BINDING-CONTRACT.md. Add UiCommand variant `{ type: 'CLAIM_OFFLINE_NORMAL'; settlementId: string }`. Map this to context.offline.claimNormal only if not settled; already settled means UI dismiss, no new grant. Ad path remains REQUEST_REWARD with placement OFFLINE_DOUBLE and entityId=settlementId, maps claimDouble; 1x/2x mutually exclusive. No service changes, no generic dynamic dispatch.

### R3 MEDIUM — achievement alias validator bypass

Owned: docs/validation/phase4-content-check.cjs and its .test.cjs. Root reproduced alias exploit: modify new FISH_30M sourceId FIRST_MERGE, integrationStatus PRESENTATION_ONLY, unsupported condition, salary1000000 -> accepted. New test must fail before fix. Classify candidate by its OWN id membership in source IDs. For source IDs require sourceId===id plus existing exact condition/reward/status validation. For every non-source id require sourceId===null, integrationStatus NEEDS_SERVICE_CAPABILITY, supported candidate FISH_SECONDS1800 and current small caps; reject aliases. Do not only patch id FISH_30M special case.

### R4 MEDIUM — reimbursement effect promise

Owned: assets/configs/phase4/office-events.json. EVENT_P4_049 keep title 报销到账, change effect from {mind:13,cultivation:6} to {salary:40,mind:13}; accepted root budget<=80 for egg, no other event or source changes. It now explicitly pays salary as promised.

### R5 LOW — real token references

Owned: docs/UI-DESIGN-SYSTEM.md and validator/test. Replace `height.normal` with `buttonHeight.normal`, `padding.normal` with `panelPadding.normal`. Make ALL token references in component table explicit inline code and exact JSON paths including colors.* and radius.* (no implied aliases). Add documented syntax `token:<path>` inside backticks for each reference, e.g. `token:buttonHeight.normal`, allowing deterministic validator scan. Export validateTokenReferences(markdown, theme) used by validateRepository; regex finds token:[A-Za-z0-9_.]+ and verifies each segment exists as own property of theme, reject invalid reference. Test valid path accepted and token:height.normal/token:colors.missing rejected before implementing. Avoid requiring blanket natural-language match of any dotted English string.

### R6 LOW — exact daily count for THIS pack

Owned: validator/test. Lock daily.length===12; negative test remove one variant -> fails `daily count`. Main source remains unchanged.

## Verify / report

- Add regression tests first for R3/R5/R6, observe failures before fixing. Run node --test docs/validation/phase4-content-check.test.cjs and node docs/validation/phase4-content-check.cjs after fixes.
- Numerically check R1 sample boxes and ensure table/full viewport/inset semantics agree. Source game remains untouched.
- Append actual red/green commands/results to docs/PHASE4-FIX-REPORT.md (new owned report). Include each R1–R6 disposition and counts. No commits or push. Root will rerun broader checks and dispatch same Sol reviewer for this diff.
- Do not edit root's ai/reports/PHASE4-UI-CONTENT-REPORT.md or docs/PHASE4-VERIFICATION.md. Preserve other changes.
