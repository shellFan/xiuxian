# Art Production Priority

Status: Phase 4.5 candidate only. This document schedules review and production work; it does not claim that any bitmap has been generated, approved, imported, or loaded at runtime.

The source of truth for IDs, dimensions, prompt references, atlas groups, and review flags is [art-production-manifest.json](../assets/configs/art-production-manifest.json). Every row below names manifest IDs directly.

## Priority order

| Priority | Manifest IDs / group | Production intent | Review gate |
|---|---|---|---|
| P0 | salary_icon, cultivation_icon, mind_icon, kpi_icon; primary_button, reward_button; common_panel, common_modal; tutorial_pointer in ui_common; achievement_locked_placeholder in achievements | Establish the paper/ink/jade language, resource readability, modal hierarchy, reward affordance, tutorial target affordance, and safe locked-state presentation. | Check alpha edges, 32/48px readability, nine-slice corners, contrast, reduced-motion fallback, no baked text, and no hidden-achievement disclosure. |
| P0 | career_01_portrait–career_03_portrait in career_early; realm_qi_badge–realm_nascent_spirit_badge | Validate the canonical 3/4 ox silhouette, shared 512 canvas and foot anchor, and the first four realm badge weights before scaling the career set. | Review P01 reference, then P02/P03/P04 career samples plus P16 badge samples at 64px and 48px. |
| P0 | worker_level_1–worker_level_4; merge_effect_frame_01–merge_effect_frame_04; promotion_effect | Prove the playable board read, a separate Worker.level visual, and transaction-result effects. | Confirm all four worker assets are distinct from career portraits, the four merge frames share sequenceId=merge_effect_frames and the authoritative second position, and promotion visuals do not execute business logic. |
| P1 | secondary_button in ui_common; career_04_portrait–career_07_portrait in career_mid; event_positive_icon, event_negative_icon, event_choice_icon, event_rare_icon, event_easter_egg_icon, event_vignette in events | Expand secondary UI polish, career progression, and event vocabulary after the shared style is approved. | Review no more than five assets per batch; check categories remain recognizable without color alone. |
| P1 | career_08_portrait–career_10_portrait in career_high | Complete the visual career tier after the independent worker-level set is available. | Compare silhouettes at 64px; explicitly reject any mapping that equates Worker.level with career level or realm. |
| P1 | achievement_icon_set, daily_task_icon_set in achievements | Add one generic long-term icon and one generic daily icon without leaking hidden achievement subjects. | Verify each generic icon is one 256×256 file, not a collapsed multi-image set, and that no title, condition, reward, or subject is baked into pixels. |
| P0 | office_background_01–office_background_02 in office | Produce the first two scene candidates with the P12 composition and stable 750×1667 canvas. | Protect the 750×1334 crop; verify the center remains low contrast for the board and backgrounds remain standalone streamable. |
| P1 | office_background_03–office_background_07 in office | Complete the remaining scene candidates after the shared background treatment is approved. | Protect the 750×1334 crop; verify the center remains low contrast for the board and backgrounds remain standalone streamable. |
| P2 | No current manifest inventory | Reserve late polish for approved candidate rework, optional decorative variants, and integration-tuned cleanup; adding P2 files requires a later manifest change. | Do not create P2 work merely to fill a count; review only after P0/P1 acceptance and root integration need. |

## Review sequence

1. Approve the P01 canonical reference and the P02/P03/P04 career samples; no batch generation is implied by a complete manifest.
2. Approve P0 UI resources and panels, then verify the first-screen composition with ui_common, career_early, office, and effects. All four worker_level assets are available as P0 candidates, even though their review remains separate from career art.
3. Review event/icon batches in groups of at most five. Rework any mismatch in silhouette, light, outline, readability, or theme.
4. Review the remaining career and worker assets as separate tracks. Career portraits use source career names; worker portraits use Worker.level and never replace the career title.
5. Only after manual review may the Art Owner mark a candidate APPROVED in a later integration change. This pack remains PLANNED and candidate-only.

## Ownership and integration gates

The Art Owner owns source generation and manual review. The UI Owner owns external text, nine-slice setup, and hidden-state presentation. The Gameplay Owner confirms worker/effect semantics. The Build/Platform Owner validates import, compression, streaming, and memory behavior. The Release Owner controls later candidate promotion to an integration branch. No owner action is performed by this pack.

## Mainline handoff

Promotion retry is service-enforced after a failed attempt: a naked second promotion call is rejected until a rewarded retry token is granted. The presentation and reward path therefore remain MAINLINE_CHANGE_REQUIRED for a production no-ad growth experience; this document does not imply that no-ad growth is solved.
