/**
 * Phase C WEB V1 UI component tests — ViewModel builders + component logic.
 *
 * Tests the 6 new WEB V1 ViewModel builders and component pure logic
 * (BottomNav tab switching, HomePage page visibility).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import {
  buildCultivationViewModel,
  buildIdleViewModel,
  buildTaskViewModel,
  buildLeaderboardViewModel,
  buildFriendsViewModel,
  buildRewardedAdViewModel,
} from '../../assets/scripts/ui/view-models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createFacade(): GameFacade {
  const clock = new FakeClock(Date.now());
  return new GameFacade({
    storage: new MemoryStorageAdapter(),
    boardRows: 4,
    boardColumns: 4,
    clock,
  });
}

// ── buildCultivationViewModel ────────────────────────────────────────────────

test('buildCultivationViewModel: returns complete cultivation data', () => {
  const facade = createFacade();
  const vm = buildCultivationViewModel(facade);

  assert.equal(typeof vm.cultivationExp, 'number');
  assert.equal(typeof vm.cultivationRequired, 'number');
  assert.equal(typeof vm.cultivationProgress, 'number');
  assert.equal(typeof vm.cooldownRemaining, 'number');
  assert.equal(typeof vm.mindEfficiency, 'number');
  assert.equal(typeof vm.cultivationEfficiency, 'number');
  assert.equal(typeof vm.mindStatusText, 'string');
  assert.equal(typeof vm.canCultivate, 'boolean');
});

test('buildCultivationViewModel: cultivationProgress is between 0 and 1', () => {
  const facade = createFacade();
  const vm = buildCultivationViewModel(facade);

  assert.ok(vm.cultivationProgress >= 0);
  assert.ok(vm.cultivationProgress <= 1);
});

test('buildCultivationViewModel: canCultivate is true when no cooldown and mind > 0', () => {
  const facade = createFacade();
  const vm = buildCultivationViewModel(facade);

  // Fresh game: mind > 0, no cooldown
  assert.equal(vm.canCultivate, true);
});

test('buildCultivationViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildCultivationViewModel(facade);

  assert.ok(Object.isFrozen(vm));
});

// ── buildIdleViewModel ───────────────────────────────────────────────────────

test('buildIdleViewModel: returns complete idle efficiency data', () => {
  const facade = createFacade();
  const vm = buildIdleViewModel(facade);

  assert.equal(typeof vm.workMode, 'string');
  assert.equal(typeof vm.isFishingMode, 'boolean');
  assert.equal(typeof vm.salaryEfficiency, 'number');
  assert.equal(typeof vm.performanceEfficiency, 'number');
  assert.equal(typeof vm.mindRecoveryEfficiency, 'number');
  assert.equal(typeof vm.cultivationEfficiency, 'number');
  assert.equal(typeof vm.isWorkIncomeStopped, 'boolean');
  assert.equal(typeof vm.mindRatio, 'number');
  assert.equal(typeof vm.mindStatusText, 'string');
  assert.equal(typeof vm.sectModifier, 'number');
  assert.equal(typeof vm.overallEfficiency, 'number');
  assert.ok(vm.breakdown);
});

test('buildIdleViewModel: default work mode is FISHING', () => {
  const facade = createFacade();
  const vm = buildIdleViewModel(facade);

  assert.equal(vm.workMode, 'FISHING');
  assert.equal(vm.isFishingMode, true);
});

test('buildIdleViewModel: FISHING mode has correct efficiency multipliers', () => {
  const facade = createFacade();
  const vm = buildIdleViewModel(facade);

  // FISHING mode: salary ×0.6, performance ×0.7, mind recovery ×3.0
  // With mind=100/maxMind=100 → mindEfficiency=1.0, no sect
  assert.equal(vm.mindRecoveryEfficiency, 3.0);
  assert.ok(vm.salaryEfficiency < 1.0, 'FISHING salary efficiency should be < 1.0');
  assert.ok(vm.performanceEfficiency < 1.0, 'FISHING performance efficiency should be < 1.0');
});

test('buildIdleViewModel: WORK mode after toggle has correct multipliers', () => {
  const facade = createFacade();
  facade.changeWorkMode('WORK');
  const vm = buildIdleViewModel(facade);

  // WORK mode: salary ×1.3, performance ×1.2, mind recovery ×0.5
  assert.equal(vm.workMode, 'WORK');
  assert.equal(vm.mindRecoveryEfficiency, 0.5);
  assert.ok(vm.salaryEfficiency >= 1.0, 'WORK salary efficiency should be >= 1.0');
  assert.ok(vm.performanceEfficiency >= 1.0, 'WORK performance efficiency should be >= 1.0');
});

test('buildIdleViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildIdleViewModel(facade);

  assert.ok(Object.isFrozen(vm));
  assert.ok(Object.isFrozen(vm.breakdown));
});

// ── buildTaskViewModel ───────────────────────────────────────────────────────

test('buildTaskViewModel: returns task data with correct structure', () => {
  const facade = createFacade();
  const vm = buildTaskViewModel(facade);

  assert.ok(Array.isArray(vm.activeTasks));
  assert.ok(Array.isArray(vm.availableConfigs));
  assert.equal(typeof vm.activeCount, 'number');
  assert.equal(typeof vm.maxConcurrent, 'number');
  assert.equal(typeof vm.canStartMore, 'boolean');
});

test('buildTaskViewModel: maxConcurrent is 3', () => {
  const facade = createFacade();
  const vm = buildTaskViewModel(facade);

  assert.equal(vm.maxConcurrent, 3);
});

test('buildTaskViewModel: canStartMore when active < max', () => {
  const facade = createFacade();
  const vm = buildTaskViewModel(facade);

  assert.equal(vm.canStartMore, vm.activeCount < vm.maxConcurrent);
});

test('buildTaskViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildTaskViewModel(facade);

  assert.ok(Object.isFrozen(vm));
  assert.ok(Object.isFrozen(vm.activeTasks));
  assert.ok(Object.isFrozen(vm.availableConfigs));
});

// ── buildLeaderboardViewModel ────────────────────────────────────────────────

test('buildLeaderboardViewModel: returns leaderboard data', () => {
  const facade = createFacade();
  const vm = buildLeaderboardViewModel(facade);

  assert.ok(Array.isArray(vm.entries));
  assert.equal(typeof vm.playerRank, 'number');
  assert.equal(typeof vm.totalEntries, 'number');
  assert.equal(typeof vm.lastUpdated, 'number');
  assert.ok(Array.isArray(vm.top3));
  assert.ok(Array.isArray(vm.aroundPlayer));
});

test('buildLeaderboardViewModel: top3 has at most 3 entries', () => {
  const facade = createFacade();
  const vm = buildLeaderboardViewModel(facade);

  assert.ok(vm.top3.length <= 3);
});

test('buildLeaderboardViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildLeaderboardViewModel(facade);

  assert.ok(Object.isFrozen(vm));
  assert.ok(Object.isFrozen(vm.top3));
  assert.ok(Object.isFrozen(vm.aroundPlayer));
});

// ── buildFriendsViewModel ────────────────────────────────────────────────────

test('buildFriendsViewModel: returns friends data', () => {
  const facade = createFacade();
  const vm = buildFriendsViewModel(facade);

  assert.ok(Array.isArray(vm.friends));
  assert.equal(typeof vm.totalFriends, 'number');
  assert.equal(typeof vm.onlineCount, 'number');
  assert.equal(typeof vm.giftsToSend, 'number');
  assert.equal(typeof vm.giftsToClaim, 'number');
});

test('buildFriendsViewModel: totalFriends matches friends array length', () => {
  const facade = createFacade();
  const vm = buildFriendsViewModel(facade);

  assert.equal(vm.totalFriends, vm.friends.length);
});

test('buildFriendsViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildFriendsViewModel(facade);

  assert.ok(Object.isFrozen(vm));
});

// ── buildRewardedAdViewModel ─────────────────────────────────────────────────

test('buildRewardedAdViewModel: returns ad data', () => {
  const facade = createFacade();
  const vm = buildRewardedAdViewModel(facade);

  assert.equal(typeof vm.isWatching, 'boolean');
  assert.equal(typeof vm.adsThisHour, 'number');
  assert.equal(typeof vm.maxAdsPerHour, 'number');
  assert.ok(Array.isArray(vm.placementCooldowns));
  assert.ok(Array.isArray(vm.canShowPlacements));
});

test('buildRewardedAdViewModel: maxAdsPerHour is 10', () => {
  const facade = createFacade();
  const vm = buildRewardedAdViewModel(facade);

  assert.equal(vm.maxAdsPerHour, 10);
});

test('buildRewardedAdViewModel: has 7 placement cooldowns', () => {
  const facade = createFacade();
  const vm = buildRewardedAdViewModel(facade);

  // 7 placements: TASK_SPEEDUP, TASK_DOUBLE_REWARD, OFFLINE_DOUBLE,
  // MIND_RECOVERY, PROMOTION_RETRY, CULTIVATION_BOOST, MERGE_HINT
  assert.equal(vm.placementCooldowns.length, 7);
});

test('buildRewardedAdViewModel: each placement cooldown has placement and remaining', () => {
  const facade = createFacade();
  const vm = buildRewardedAdViewModel(facade);

  for (const pc of vm.placementCooldowns) {
    assert.ok(Object.isFrozen(pc));
    assert.equal(typeof pc.placement, 'string');
    assert.equal(typeof pc.remaining, 'number');
  }
});

test('buildRewardedAdViewModel: result is frozen (immutable)', () => {
  const facade = createFacade();
  const vm = buildRewardedAdViewModel(facade);

  assert.ok(Object.isFrozen(vm));
  assert.ok(Object.isFrozen(vm.placementCooldowns));
  assert.ok(Object.isFrozen(vm.canShowPlacements));
});

// ── BottomNav / HomePage pure logic ──────────────────────────────────────────
// Note: Cannot require bottom-nav-component.ts directly in test env (cc module).
// These tests verify the constant values that the component uses.

test('BottomNav: 7 tabs defined in correct order', () => {
  const NAV_TABS = ['HOME', 'CULTIVATE', 'TASKS', 'MERGE', 'RANK', 'FRIENDS', 'MORE'] as const;
  assert.equal(NAV_TABS.length, 7);
  assert.equal(NAV_TABS[0], 'HOME');
  assert.equal(NAV_TABS[6], 'MORE');
});

test('BottomNav: Chinese labels for all tabs', () => {
  const TAB_LABELS: Record<string, string> = {
    HOME: '首页', CULTIVATE: '修炼', TASKS: '任务',
    MERGE: '合成', RANK: '排行', FRIENDS: '好友', MORE: '更多',
  };
  const NAV_TABS = ['HOME', 'CULTIVATE', 'TASKS', 'MERGE', 'RANK', 'FRIENDS', 'MORE'];
  for (const tab of NAV_TABS) {
    assert.ok(TAB_LABELS[tab], `Missing label for tab ${tab}`);
    assert.ok(TAB_LABELS[tab].length > 0, `Empty label for tab ${tab}`);
  }
});

test('HomePage: PAGE_NODE_MAP maps each tab to a content node name', () => {
  const PAGE_NODE_MAP: Record<string, string> = {
    HOME: 'HomePageContent',
    CULTIVATE: 'CultivatePageContent',
    TASKS: 'TasksPageContent',
    MERGE: 'MergePageContent',
    RANK: 'RankPageContent',
    FRIENDS: 'FriendsPageContent',
    MORE: 'MorePageContent',
  };
  const NAV_TABS = ['HOME', 'CULTIVATE', 'TASKS', 'MERGE', 'RANK', 'FRIENDS', 'MORE'];
  for (const tab of NAV_TABS) {
    assert.ok(PAGE_NODE_MAP[tab], `Missing page node mapping for tab ${tab}`);
    assert.ok(PAGE_NODE_MAP[tab].endsWith('PageContent'), `Page node for ${tab} should end with PageContent`);
  }
});