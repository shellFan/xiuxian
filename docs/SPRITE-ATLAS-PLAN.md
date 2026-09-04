# Sprite Atlas Plan

Status: Phase 4.5 candidate only. The groups below are packaging and review candidates, not imported Cocos atlases.

Manifest source: [art-production-manifest.json](../assets/configs/art-production-manifest.json). All atlas references use the manifest's exact atlasGroup values: ui_common, career_early, career_mid, career_high, events, achievements, office, and effects.

## Group layout

| Logical group | Direct manifest members | Packing rule | Initial/deferred use |
|---|---|---|---|
| ui_common | salary_icon, cultivation_icon, mind_icon, kpi_icon, primary_button, reward_button, secondary_button, common_panel, common_modal, tutorial_pointer | Keep controls/icons separated from nine-slice panel corners; reserve padding for alpha bleed. | Initial. Keep the common panel/modal resident while any page or modal can reference it. |
| career_early | career_01_portrait–career_03_portrait, realm_qi_badge–realm_nascent_spirit_badge | Career portraits occupy separate 512×512 cells; badges stay independently addressable. | Initial for the first career sample; defer later visual expansion only if the first screen does not reference it. |
| career_mid | career_04_portrait–career_07_portrait | Four separate 512×512 career cells; do not flatten into a single career sprite or rewrite source career names. | Deferred until the relevant career page/level is reached. |
| career_high | career_08_portrait–career_10_portrait | Three separate 512×512 career cells; retain consistent foot anchor and silhouette scale. | Deferred until the relevant career page/level is reached. |
| events | event_positive_icon, event_negative_icon, event_choice_icon, event_rare_icon, event_easter_egg_icon, event_vignette | Category icons and vignette use independent rectangles; do not bake event titles or effects into the texture. | Deferred until event UI opens; unload only when no view/queue retains a reference. |
| achievements | achievement_icon_set, daily_task_icon_set, achievement_locked_placeholder | achievement_icon_set and daily_task_icon_set each mean one generic 256×256 asset, not a collapsed multi-image set; keep the locked placeholder independently swappable and do not expose rewards in pixels. | Deferred until tasks or achievements page opens; the placeholder may be shared by all locked rows. |
| office | office_background_01–office_background_07, worker_level_1–worker_level_4 | Backgrounds are standalone textures, not atlas members. Worker levels are separate 512×512 sprites in the office logical group and are not career tiers. | One background streams for the current office; worker sprites load with board usage. |
| effects | merge_effect_frame_01, merge_effect_frame_02, merge_effect_frame_03, merge_effect_frame_04, promotion_effect | Keep effect anchors stable and effects separate from board slots; the four merge assets share sequenceId=merge_effect_frames and are aligned candidate frames. | Deferred until the relevant successful result; release after playback and reference-count drain. |

Every atlas uses a maximum edge length of 2048. No one-image atlas is permitted: a group is split into purposeful atlas pages when packing or memory warrants it, while retaining the same logical group name. A 512×512 career or worker image is never stretched to fill a page, and the seven office backgrounds are not packed merely to make a count look complete.

## Feasible page plan

The page plan below budgets allocated texture-page bytes, including unused space inside a page, rather than adding only the occupied image pixels. Every atlas page is a multi-asset page; the office backgrounds are standalone streaming textures and therefore are not one-image atlas pages.

| Page plan | Members | Allocated page | RGBA8 allocation |
|---|---|---:|---:|
| ui_common_controls_01 | salary_icon, cultivation_icon, mind_icon, kpi_icon, secondary_button, tutorial_pointer | 1024×1024 | 4 MiB |
| ui_common_panel_01 | common_panel, primary_button | 1024×1024 | 4 MiB |
| ui_common_modal_01 | common_modal, reward_button | 1024×1024 | 4 MiB |
| career_early_01 | career_01_portrait–career_03_portrait, realm_qi_badge–realm_nascent_spirit_badge | 2048×2048 | 16 MiB |
| career_mid_01 | career_04_portrait–career_07_portrait | 2048×2048 | 16 MiB |
| career_high_01 | career_08_portrait–career_10_portrait | 2048×2048 | 16 MiB |
| events_01 | five event category icons, event_vignette | 1024×1024 | 4 MiB |
| achievements_01 | achievement_icon_set, daily_task_icon_set, achievement_locked_placeholder | 1024×1024 | 4 MiB |
| office_workers_01 | worker_level_1–worker_level_4 | 2048×2048 | 16 MiB |
| effects_01 | merge_effect_frame_01–merge_effect_frame_04, promotion_effect | 1024×1024 | 4 MiB |

The career pages intentionally use 2048×2048: three 512×512 portraits plus gutters are not accepted as a 1024×1024 plan. Career pages are split into early, mid, and high groups; worker sprites have their own office page, so all character candidates do not pretend to fit one atlas. If a packer cannot place a listed multi-asset page with its gutters, it creates another page under the same logical group and the allocated-page budget increases before integration.

Office backgrounds office_background_01–office_background_07 remain standalone at 750×1667 under logical group office. One active background is about 4.77 MiB at RGBA8 source allocation; during a scene swap, the old and new backgrounds are retained until the new reference is ready, so the worker page plus two backgrounds has a 28 MiB peak-swap ceiling in the budget document.

## Import defaults and memory accounting

- Candidate transparent sprites preserve alpha; office_background_01–office_background_07 are opaque scene textures. Alpha is part of the contract, not a reason to flatten an image onto paper.
- RGBA8 uncompressed working memory is exactly 4 × width × height bytes. Atlas working memory is counted from the allocated page dimensions: a 2048×2048 RGBA8 page is 16 MiB even when sparsely filled. These are design accounting figures, not platform limits.
- Compression is preferred only after Cocos Creator/WeChat build support is verified for the target texture. The fallback is RGBA8; a failed or unsupported compressed import must not be described as tested.
- Mipmaps are off for this 2D UI/game candidate. Filter, wrap, and bleed settings are verified in Editor with the actual atlas page.
- The office backgrounds remain standalone streaming assets under logical group office because each 750×1667 texture is a stage-sized opaque image, only one current office scene should be resident, and atlas packing would create avoidable decode pressure and scene lifetime coupling.

## Reference lifetime and release ownership

The Build/Platform Owner owns actual importer settings and bundle manifests. The UI Owner owns references from HUD, pages, modals, and tutorial. The Gameplay Owner owns board/effect references. The Asset/Art Owner owns source files and visual approval. Release may release a group only after no active view, modal, tutorial step, board effect, or queued transition holds a reference; closing a modal alone is not sufficient.

When swapping an atlas page or office background, the old allocation and new allocation may coexist until references settle. The release owner must budget this double-resident peak and must not release the old page early just to meet a steady-state number.

If a target node or asset is missing, the UI contract must hide the affected control and expose a recoverable message. It must not create a fake placeholder that implies a runtime asset is available. All entries remain candidate-only with status PLANNED.

## Mainline handoff

The promotion page must surface that a failed promotion requires a rewarded retry token before another attempt. The current production no-ad growth path is MAINLINE_CHANGE_REQUIRED; this asset plan carries the result animation/audio candidates but does not claim the service gap is closed.
