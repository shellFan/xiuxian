# Phase 5 — Component Registry

## Overview

Phase 5 introduces the Cocos Runtime integration layer with 9 new Cocos Components and 4 supporting services. This document provides the authoritative registry of all Phase 5 components, their UUIDs, and mounting points.

## Core Bootstrap Components

| Component | `@cclass` | File | Meta UUID | Scene Mount |
|---|---|---|---|---|
| `CocosBootstrapComponent` | `CocosBootstrapComponent` | `core/cocos-bootstrap-component.ts` | `b31501e8-6d7f-4119-964f-03c0cbae45cb` | Bootstrap node |
| `GameBootstrapComponent` | `GameBootstrapComponent` | `core/game-bootstrap-component.ts` | `ca7eea41-44b3-492a-97bc-076e499a275f` | (legacy, not mounted) |

## UI Binding Components (Phase 5)

| Component | `@cclass` | File | Meta UUID | Scene Mount |
|---|---|---|---|---|
| `SceneBindingComponent` | `SceneBinding` | `ui/scene-binding-component.ts` | `1ce57be3-d268-40e9-8dcc-df02511ebfa8` | SafeAreaRoot |
| `CommonModalComponent` | `CommonModal` | `ui/common-modal-component.ts` | `2c448cc0-39cf-4252-bb2d-0739cf31a700` | ModalHost |
| `TutorialOverlayComponent` | `TutorialOverlay` | `ui/tutorial-overlay-component.ts` | `10d782d0-3728-49aa-aded-23dd7d99d000` | TutorialHost |
| `MainHudComponent` | `MainHUD` | `ui/main-hud-component.ts` | `9fe67ccc-be2a-49dd-bb24-ef5b3f2670bc` | HUD |
| `CareerPanelComponent` | `CareerPanel` | `ui/career-panel-component.ts` | `da1d5957-993b-42af-89f7-afa1983c9044` | CareerPanel |
| `KpiPanelComponent` | `KpiPanel` | `ui/kpi-panel-component.ts` | `42ae6b37-c295-4f59-b87f-e43a20a77c03` | KpiPanel |
| `MergeBoardComponent` | `MergeBoard` | `ui/merge-board-component.ts` | `42e2d273-299f-4e8a-9589-1649753e6f75` | Board |
| `WorkModeToggleComponent` | `WorkModeToggle` | `ui/work-mode-toggle-component.ts` | `fa24aab2-2f6d-4239-8d91-2e48d288146d` | Actions |

## Supporting Services (Phase 5)

| Service | File | Meta UUID | Notes |
|---|---|---|---|
| `SafeAreaService` | `services/safe-area-service.ts` | `ecdc80a3-a623-4a2d-963c-66cc776d3378` | Reads platform safe area insets |
| `EventRuntimeAdapter` | `services/event-runtime-adapter.ts` | (no .meta — not a Component) | EVENT-POOL-V1 strategy |
| `RewardAdPolicy` | `services/reward-ad-policy.ts` | (no .meta — not a Component) | IAA ad frequency policy |
| `PlatformService` | `services/platform/platform-service.ts` | `d4c3f21b-d86d-4ea7-b760-cb37e84906ca` | SafeArea + onShow/onHide unsubscribe |

## Scene Hierarchy

```
Scene (Main)
└── Canvas
    ├── Bootstrap
    │   └── CocosBootstrapComponent ← initializes GameFacade
    │       └── MainView (Phase2RootComponent, MainView)
    ├── SafeAreaRoot
    │   └── SceneBindingComponent ← wires facade → UI
    │       ├── HUD          → MainHudComponent
    │       ├── OfficeStage  → (empty, future use)
    │       ├── Board        → MergeBoardComponent
    │       ├── Actions      → WorkModeToggleComponent
    │       ├── Navigation   → (empty, future use)
    │       ├── CareerPanel  → CareerPanelComponent
    │       ├── KpiPanel     → KpiPanelComponent
    │       ├── ModalHost    → CommonModalComponent
    │       ├── TutorialHost → TutorialOverlayComponent
    │       └── ToastHost    → (empty, uses ToastManager)
    └── UICamera_Canvas
```

## Singleton Access Pattern

Phase 5 components use singleton access for cross-component communication:

```typescript
// From any UI component:
const binding = SceneBindingComponent.instance;
const facade = CocosBootstrapComponent.instance?.facade;
const modal = binding.modalManager;
const toast = binding.toastManager;
const anim = binding.animationDispatcher;
```

## Test Coverage

| Test Suite | Tests | Status |
|---|---|---|
| `phase5-integration.test.ts` | 37 | PASS |
| `reward-ad-policy.test.ts` | 15 | PASS |
| `event-runtime-adapter.test.ts` | 17 | PASS |
| **Total** | **69** | **ALL PASS** |