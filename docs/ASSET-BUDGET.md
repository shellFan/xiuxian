# Asset Budget

Status: Phase 4.5 candidate design targets only. MiB values below are planning caps for review and bundle sizing, not measured device memory, compressed output, or platform limits.

Source of IDs and dimensions: [art-production-manifest.json](../assets/configs/art-production-manifest.json). The accounting rule for every RGBA8 image is 4 × width × height bytes, with alpha retained for transparent candidates and mipmaps off. One MiB here means 1,048,576 bytes.

## Raw image accounting and allocated-page budgets

The raw image column is a sanity check. The allocated-page column is the budget used for atlas memory: every page is charged at its full width × height × 4 bytes, including unused space and gutters.

| Group | Manifest content | Raw image pixels | Allocated pages / standalone allocation | Design cap / resident rule |
|---|---|---:|---|---|
| ui_common | 4 resource icons, 3 buttons, common_panel, common_modal, tutorial_pointer | 6.125 MiB | ui_common_controls_01 + ui_common_panel_01 + ui_common_modal_01 = 12 MiB allocated | Initial decoded cap 12 MiB for this group; controls and panels stay resident while referenced. |
| career_early | 3 career portraits + 4 realm badges | 4.000 MiB | career_early_01 = 16 MiB allocated | Initial/deferred decoded cap 16 MiB; portraits remain separate cells. |
| career_mid | 4 career portraits | 4.000 MiB | career_mid_01 = 16 MiB allocated | Deferred decoded cap 16 MiB; page swap must count double residency. |
| career_high | 3 career portraits | 3.000 MiB | career_high_01 = 16 MiB allocated | Deferred decoded cap 16 MiB; page swap must count double residency. |
| events | 5 event icons + event_vignette | 1.875 MiB | events_01 = 4 MiB allocated | Deferred decoded cap 4 MiB. |
| achievements | one achievement_icon_set + one daily_task_icon_set + one locked placeholder | 0.750 MiB | achievements_01 = 4 MiB allocated | Deferred decoded cap 4 MiB; the two generic icons are one file each, not collapsed sets. |
| office | 4 worker sprites + seven standalone 750×1667 backgrounds | 4.000 MiB worker pixels + about 33.4 MiB background inventory | office_workers_01 = 16 MiB allocated; each background about 4.77 MiB standalone | Active resident cap 21 MiB; peak scene-swap cap 28 MiB for worker page plus old and new backgrounds. All seven backgrounds are never co-resident by this plan. |
| effects | merge_effect_frame_01–04 + promotion_effect | 2.000 MiB | effects_01 = 4 MiB allocated | Deferred decoded cap 4 MiB; release after effect/reference drain. |

The office background inventory is intentionally shown as a total candidate inventory, not a load target. The four worker sprites are all P0 and are available from office_workers_01. A 750×1667 background is about 4.77 MiB at RGBA8 source allocation; during a swap, two backgrounds can be resident, so the 28 MiB peak ceiling includes 16 MiB for the allocated worker page plus about 9.54 MiB for both backgrounds. The four merge frames are four actual manifest files with the common sequence ID merge_effect_frames.

## Feasible page plan

The page plan is the one in [SPRITE-ATLAS-PLAN.md](SPRITE-ATLAS-PLAN.md). It uses allocated page bytes, not occupied pixel totals:

- ui_common: three 1024×1024 pages at 4 MiB each, total 12 MiB.
- career_early, career_mid, and career_high: one 2048×2048 page each, 16 MiB each. Three 512×512 portraits plus padding are not treated as a 1024×1024 page.
- events: one 1024×1024 page, 4 MiB.
- achievements: one 1024×1024 page, 4 MiB, with one file for each generic icon and one locked placeholder.
- office_workers: one 2048×2048 page, 16 MiB, containing worker_level_1–worker_level_4. The seven office backgrounds are standalone streaming textures under logical group office.
- effects: one 1024×1024 page, 4 MiB, containing the four merge frames and promotion_effect.

No one-image atlas is allowed. The three career groups and the separate office worker page ensure all character candidates are not falsely represented as one atlas. If actual gutters require another page, the allocated-page budget rises before integration.

## Bundle targets

| Bundle | Contents | Packaged design cap | Decoded allocated-page cap |
|---|---|---:|---:|
| Initial | ui_common + career_early + office_background_01 + office_workers_01; merge/promotion result hooks remain on demand | 40 MiB | 48.77 MiB steady allocation; 52 MiB initial cap. |
| Deferred career | career_mid or career_high, one group at a time | 16 MiB per group | 16 MiB per page; 32 MiB during a career-page swap. |
| Deferred event | events | 4 MiB | 4 MiB. |
| Deferred task/achievement | achievements | 4 MiB | 4 MiB. |
| Deferred effects | effects | 4 MiB | 4 MiB. |
| Office scene stream | one of office_background_01–office_background_07 plus office_workers_01 | 12 MiB | 21 MiB active; 28 MiB during old/new background swap. |

The initial steady arithmetic is 12 MiB ui_common pages + 16 MiB career_early_01 + about 4.77 MiB for office_background_01 + 16 MiB office_workers_01 = about 48.77 MiB. The 52 MiB initial cap leaves a small planning margin; effects remain deferred. A 2048×2048 page is charged as 16 MiB even when sparsely filled, and a swap charges old plus new pages until reference release. Packaged caps are planning ceilings after a future supported compression decision; they are not measured compression results.

## Audio bundle and buffer targets

Audio source assumptions follow AUDIO-GUIDE: 48 kHz, 16-bit, stereo PCM for the decode estimate. The PCM estimate is (durationTarget ms ÷ 1,000) × 48,000 × 2 channels × 2 bytes, converted with 1 MiB = 1,048,576 bytes. Encoded targets below are design ceilings for later authoring and compression selection, not measured files or platform limits.

| Audio bundle | Direct manifest cues | Encoded design target | Decode PCM estimate |
|---|---|---:|---:|
| Initial SFX | ui_click, ui_back, ui_open, ui_close, ui_success, ui_fail, game_recruit, game_merge, game_salary, game_cultivation, game_work, game_fishing | ≤0.75 MiB | 2,300 ms total, about 0.42 MiB if decoded together |
| Initial BGM | bgm_office_day | ≤1.75 MiB | 60,000 ms, about 10.99 MiB; stream only the current BGM |
| Deferred reward/event SFX | game_promotion, game_promotion_fail, game_achievement, game_daily_reward, events_boss, events_meeting, events_production_alert, events_salary_raise, events_layoff_rumor | ≤1.00 MiB | 3,700 ms total, about 0.68 MiB if decoded together |
| Deferred BGM | bgm_office_night, bgm_promotion, bgm_rare_event | ≤2.00 MiB per later bundle | 80,000 ms inventory, about 14.65 MiB if all decoded; steady state still streams only one BGM |

Across all 21 SFX cues, the duration targets total 6,000 ms and the stereo PCM estimate is about 1.10 MiB. Across all four BGM cues, the inventory total is 140,000 ms and about 25.63 MiB, but those tracks are not a resident decode target. V1 enforces 4 SFX voices and 1 audible BGM voice. During a 350 ms transition, old and new BGM buffers may coexist, but playback uses sequential fade-out/fade-in so the audible voice budget remains 1; a true overlapping crossfade requires explicit mainline approval for a 2-BGM-voice budget.

Peak buffer design is four simultaneous SFX buffers plus two BGM buffers during a sequential transition; two buffers does not mean two audible BGM voices. The longest SFX target is 900 ms, so four stereo PCM voice buffers are about 0.66 MiB before engine overhead; one 60-second BGM buffer is about 10.99 MiB, and a conservative two-buffer swap ceiling is about 21.97 MiB. These are planning estimates only; the Build/Platform Owner must measure actual Cocos Creator/WeChat streaming, decode, and compression behavior before release.

## Production guardrails

- P0 work starts with the resource/core feel set: salary_icon, cultivation_icon, mind_icon, kpi_icon, primary_button, reward_button, common_panel, common_modal, tutorial_pointer, career_01_portrait–career_03_portrait, realm badges, worker_level_1–worker_level_4, merge_effect_frame_01–merge_effect_frame_04, and promotion_effect.
- The ten career portraits are distributed across career_early (levels 1–3), career_mid (4–7), and career_high (8–10); they must not be treated as one atlas or as Worker.level assets.
- All seven office backgrounds remain standalone streamable members of logical group office. If import or decode pressure exceeds the design cap, defer the scene or reduce optional work elsewhere; do not silently change the 750×1667 source or pretend a platform limit was measured.
- Compression fallback remains RGBA8, alpha and mipmap settings are reviewed in Editor, and actual Cocos/WeChat behavior is a later Build/Platform Owner task.
- Release ownership follows the atlas plan. No file is promoted from PLANNED until visual review, import checks, and root integration approval are recorded.

## Mainline handoff

Failed promotion requires a rewarded retry token in the current service. Any production UX promising a no-ad second attempt is MAINLINE_CHANGE_REQUIRED; this candidate set only supplies the visual/audio hooks and copy for the later adapter/owner decision.
