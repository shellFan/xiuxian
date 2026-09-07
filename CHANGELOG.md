# Changelog

All notable changes to the 牛马修仙传 (Niuma Xiuxian) project will be documented in this file.

## [1.0.0-rc.1] — 2026-09-06

### Release Candidate

First Release Candidate for WeChat Mini Game submission.

### Core Systems
- **Game Loop**: Frame-rate independent fixed-step game loop (`GameLoopService`)
- **Work System**: Salary accumulation with 7200-denominator remainder tracking
- **Cultivation System**: EXP-based progression with career level promotion
- **Mind System**: Mind/maxMind with recovery mechanics
- **Merge Board**: 4×4 grid with worker placement, merge, and recruitment

### Services
- **SaveServiceV2**: Dual-slot atomic save (validate → backupCurrent → write → verify)
  - Recovery chain: primary → backup → safe default
  - NaN/Infinity protection on load
- **RewardService**: State machine (IDLE → REQUESTING → GRANTED/CANCELLED/FAILED)
  - callbackFired + generation double-callback guard
  - queueMicrotask auto-reset to IDLE
- **RewardAdPolicy**: IAA frequency strategy
  - Session limit, daily limit, min interval, cancel cooldown, failure cooldown
- **OfflineRewardService**: Idempotent settlement with settlementId dedup
- **PlatformLifecycle**: onHide/onShow/onPause/onResume callback coordination
- **CareerEventService**: Event polling with CareerEventScheduler
- **EventRuntimeAdapter**: EVENT-POOL-V1 strategy
  - Category lottery (EASTER_EGG 0.1%, RARE 1%, NORMAL 98.9%)
  - Career stage weight table
  - Eligibility filtering (careerLevel, workMode, mind ratio, KPI progress)
  - Cooldown (30min), recent history exclusion (5 IDs), negative streak protection
  - Easter egg once-per-save + once-per-day
- **ReleaseConfig**: Production configuration center
  - PRODUCTION_CONFIG: debugEnabled=false, analyticsEnabled=true
  - IAA policy: maxSessionAds=10, maxDailyAds=20

### UI
- **MainView**: GameBootstrapComponent business context
- **ViewModels**: Frozen immutable view models
- **ModalManager**: Priority queue with max size 3
- **ToastManager**: Cooldown-based message merging

### Testing
- 58 test files, 400+ test cases
- **Release stress tests**:
  - save-stress: 1000 save/load cycles, backup recovery, NaN/Infinity checks
  - lifecycle-stress: 100 rapid hide/show, save-on-hide integrity
  - reward-abuse: Concurrent request prevention, session/daily limits, cooldowns
  - config-validation: JSON config parsing, PRODUCTION_CONFIG safety, IAA range checks
  - simulation-release: 100-seed full game simulation
  - event-stress: 100 rapid resolutions, cooldown, negative streak, easter egg limits

### Platform
- WeChat Mini Game target (Cocos Creator 3.8.4 LTS)
- WechatRewardProviderV2 with MockRewardProvider fallback
- DebugProtection: __DEBUG__ global flag (tree-shakeable)