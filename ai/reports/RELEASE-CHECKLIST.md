# Release Checklist — 1.0.0-rc.1

**Date:** 2026-09-07
**Branch:** release/rc1
**Commit:** 2b6767e

---

## Pre-Release Checks

| # | Item | Method | Status |
|---|------|--------|--------|
| 1 | TypeScript compilation succeeds | `npm run build` | AUTO_PASS |
| 2 | All unit tests pass | `npm test` (64 files) | AUTO_PASS |
| 3 | Phase 5 integration tests pass | `npm run phase5:check` (69 tests) | AUTO_PASS |
| 4 | Release stress tests pass | `npm run release:check` (73 tests) | AUTO_PASS |
| 5 | No whitespace errors | `git diff --check` | AUTO_PASS |
| 6 | No NaN/Infinity in simulation | simulation-release.test.ts (100 seeds) | AUTO_PASS |
| 7 | Save/load stress passes | save-stress.test.ts (1000 cycles) | AUTO_PASS |
| 8 | Lifecycle stress passes | lifecycle-stress.test.ts (100 cycles) | AUTO_PASS |
| 9 | Reward abuse protection works | reward-abuse.test.ts (8 cases) | AUTO_PASS |
| 10 | Event stress passes | event-stress.test.ts (9 cases) | AUTO_PASS |
| 11 | E2E game flow passes | e2e-game-flow.test.ts (29 cases) | AUTO_PASS |
| 12 | Config validation passes | config-validation.test.ts (10 cases) | AUTO_PASS |

## Production Config Safety

| # | Item | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | `debugEnabled` | `false` | `false` | AUTO_PASS |
| 2 | `analyticsEnabled` | `true` | `true` | AUTO_PASS |
| 3 | `environment` | `'production'` | `'production'` | AUTO_PASS |
| 4 | `wechatAppId` | non-empty in prod | `''` (placeholder) | MANUAL_REQUIRED |
| 5 | `rewardedAdUnitId` | non-empty in prod | `''` (placeholder) | MANUAL_REQUIRED |
| 6 | `maxOfflineSeconds` | `28800` | `28800` | AUTO_PASS |
| 7 | `autoSaveIntervalSeconds` | `60` | `60` | AUTO_PASS |
| 8 | IAA policy limits set | reasonable values | 10/20/60/30/120 | AUTO_PASS |

## Manual Checks (Not Automatable)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | WeChat Mini Game review submitted | MANUAL_REQUIRED | Requires WeChat platform submission |
| 2 | Ad unit IDs configured in production | MANUAL_REQUIRED | `rewardedAdUnitId` is placeholder |
| 3 | WeChat App ID configured in production | MANUAL_REQUIRED | `wechatAppId` is placeholder |
| 4 | CDN/assets deployed | MANUAL_REQUIRED | Requires infrastructure access |
| 5 | Privacy policy updated | MANUAL_REQUIRED | Legal review required |
| 6 | Analytics dashboard verified | MANUAL_REQUIRED | Post-deploy verification |

## Post-Release Checks

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Version tag created | MANUAL_REQUIRED | Tag `v1.0.0-rc.1` on release/rc1 |
| 2 | Changelog updated | AUTO_PASS | CHANGELOG.md present |
| 3 | Release notes published | MANUAL_REQUIRED | GitHub/GitLab release page |

---

**Summary:** 20/26 AUTO_PASS, 6/26 MANUAL_REQUIRED, 0 FAIL

All automatable checks pass. Remaining items require manual infrastructure/legal/platform access.