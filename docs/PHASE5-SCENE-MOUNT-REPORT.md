# Phase 5 — Main.scene Mount Report

## Summary

Main.scene has been updated to mount the Phase 5 Runtime with CocosBootstrapComponent and SafeAreaRoot structure.

## Changes Applied

### 1. Bootstrap Node — CocosBootstrapComponent Mount

| Field | Before | After |
|---|---|---|
| Node name | `GameBootstrap` | `Bootstrap` |
| Component [233] `__type__` | `00000AAAAAAAAAAAAAAAAAD` (broken/placeholder) | `b3150HobX9BGZZPA8DLrkXL` (CocosBootstrapComponent) |

The broken placeholder UUID `00000AAAAAAAAAAAAAAAAAD` caused a "Missing Script" warning in Cocos Editor. It has been replaced with the compressed UUID of `CocosBootstrapComponent` (meta UUID: `b31501e8-6d7f-4119-964f-03c0cbae45cb`).

### 2. SafeAreaRoot Node Tree — Added

A new `SafeAreaRoot` node has been added as a child of `Canvas` with the following structure:

```
Canvas
├── Bootstrap (CocosBootstrapComponent)
│   └── MainView (Phase2RootComponent, MainView)
├── SafeAreaRoot (SceneBindingComponent, UITransform, Widget)
│   ├── HUD (MainHudComponent, UITransform)
│   ├── OfficeStage (UITransform)
│   ├── Board (MergeBoardComponent, UITransform)
│   ├── Actions (WorkModeToggleComponent, UITransform)
│   ├── Navigation (UITransform)
│   ├── CareerPanel (CareerPanelComponent, UITransform)
│   ├── KpiPanel (KpiPanelComponent, UITransform)
│   ├── ModalHost (CommonModalComponent, UITransform)
│   ├── TutorialHost (TutorialOverlayComponent, UITransform)
│   └── ToastHost (UITransform)
└── UICamera_Canvas (cc.Camera)
```

### 3. Canvas Children Order

| Index | Before | After |
|---|---|---|
| 0 | Bootstrap (3) | Bootstrap (3) |
| 1 | UICamera_Canvas (234) | SafeAreaRoot (240) |
| 2 | — | UICamera_Canvas (234) |

## Compressed UUID Mapping

| Component | Meta UUID | Compressed (scene `__type__`) |
|---|---|---|
| CocosBootstrapComponent | `b31501e8-6d7f-4119-964f-03c0cbae45cb` | `b3150HobX9BGZZPA8DLrkXL` |
| SceneBindingComponent | `1ce57be3-d268-40e9-8dcc-df02511ebfa8` | `1ce57vj0mhA6Y3M3wJRHr+o` |
| MainHudComponent | `9fe67ccc-be2a-49dd-bb24-ef5b3f2670bc` | `9fe67zMvipJ3bsk71s/JnC8` |
| MergeBoardComponent | `42e2d273-299f-4e8a-9589-1649753e6f75` | `42e2dJzKZ9OipWJFkl1Pm91` |
| WorkModeToggleComponent | `fa24aab2-2f6d-4239-8d91-2e48d288146d` | `fa24aqyL21COY2RLkjSiBRt` |
| CareerPanelComponent | `da1d5957-993b-42af-89f7-afa1983c9044` | `da1d5lXmTtCr4n3r6GYPJBE` |
| KpiPanelComponent | `42ae6b37-c295-4f59-b87f-e43a20a77c03` | `42ae6s3wpVPWbh/5Dogp3wD` |
| CommonModalComponent | `2c448cc0-39cf-4252-bb2d-0739cf31a700` | `2c448zAOc9CUrstBznPMacA` |
| TutorialOverlayComponent | `10d782d0-3728-49aa-aded-23dd7d99d000` | `10d78LQNyhJqq3tI919mdAA` |

## Verification

- **No placeholder UUIDs** in Main.scene `__type__` values
- **No `00000AAAAAAAAAAAAAAAAAD`** broken references
- **All Phase5 components** have valid `.ts.meta` files with unique UUIDs
- **tsc --noEmit** passes
- **phase5:check** 69/69 tests pass