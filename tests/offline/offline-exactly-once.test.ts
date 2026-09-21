import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { RewardProvider, RewardResult } from '../../assets/scripts/services/reward-provider';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const START = Date.UTC(2026, 8, 21, 1); // Monday 09:00 Asia/Shanghai.

class DelayedRewardProvider implements RewardProvider {
  private callback?: (result: RewardResult) => void;

  public claimMindRecovery(): number { return 0; }

  public requestReward(_type: 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY', onComplete: (result: RewardResult) => void): void {
    this.callback = onComplete;
  }

  public resolve(result: RewardResult): void {
    const callback = this.callback;
    assert.ok(callback, 'a reward request must be pending');
    this.callback = undefined;
    callback(result);
  }
}

function createContext(
  storage = new MemoryStorageAdapter(),
  rewardProvider?: RewardProvider,
) {
  const clock = new FakeClock(START + 3600_000);
  const saveService = new SaveService(storage, DEFAULT_SAVE_KEY, clock);
  const player = new PlayerData({
    lastSaveTime: START,
    autoPolicy: 'SAFE',
    performance: 12,
    mind: 55,
    maxMind: 100,
    technicalDebt: { PAYMENT: 20 },
    pendingEvents: [{ uid: 'flavor-1', eventId: 'flavor', occurredAt: START, priority: 'FLAVOR' }],
  });
  return { context: new GameContext({ player, saveService, clock, rewardProvider, board: null }), clock, storage };
}

function testNormalClaimUsesPreviewedBaseResourcesExactlyOnce(): void {
  const { context } = createContext();
  const preview = context.offline.previewSimulation('normal-once');
  const before = context.player.toSaveData();
  assert.equal(preview.salary, 10);
  assert.equal(preview.cultivation, 8);
  assert.equal(preview.spiritStones, 6);
  assert.deepEqual(context.player.toSaveData(), before, 'preview is read-only');

  const claimed = context.offline.claimNormal('normal-once');
  assert.equal(claimed.salary, preview.salary);
  assert.equal(claimed.cultivation, preview.cultivation);
  assert.equal(context.player.salary, before.salary + preview.salary);
  assert.equal(context.player.cultivationExp, before.cultivationExp + preview.cultivation);
  assert.equal(context.player.spiritStones, (before.spiritStones ?? 0) + preview.spiritStones);
  assert.equal(context.player.performance, before.performance, 'projection-only aggregates are not granted');
  assert.equal(context.player.mind, before.mind, 'projection-only aggregates are not granted');
  assert.deepEqual(context.player.technicalDebt, before.technicalDebt, 'projection-only debt is not applied');
  assert.throws(() => context.offline.claimNormal('normal-once'), /already claimed/);
}

function testNormalAndDoubleAreMutuallyExclusive(): void {
  const normal = createContext().context;
  normal.offline.claimNormal('normal-first');
  let normalThenDouble = true;
  normal.offline.claimDouble('normal-first', (success) => { normalThenDouble = success; });
  assert.equal(normalThenDouble, false);
  assert.equal(normal.player.salary, 10);

  const doubled = createContext().context;
  let doubleGranted = false;
  const projection = doubled.offline.previewSimulation('double-first');
  doubled.offline.claimDouble('double-first', (success) => { doubleGranted = success; });
  assert.equal(doubleGranted, true);
  assert.equal(doubled.player.salary, projection.salary * 2);
  assert.equal(doubled.player.cultivationExp, projection.cultivation * 2);
  assert.equal(doubled.player.spiritStones, projection.spiritStones * 2);
  assert.equal(doubled.player.performance, 12, 'x2 does not double policy aggregates');
  assert.equal(doubled.player.mind, 55, 'x2 does not apply policy mind delta');
  assert.throws(() => doubled.offline.claimNormal('double-first'), /already claimed/);
}

function testRestartCannotReplayClaimedSettlement(): void {
  const storage = new MemoryStorageAdapter();
  const first = createContext(storage);
  first.context.offline.claimNormal('restart-guard');

  const restarted = new GameContext({ storage, clock: first.clock, board: null });
  assert.equal(restarted.offline.isSettled('restart-guard'), true);
  assert.throws(() => restarted.offline.claimNormal('restart-guard'), /already claimed/);
  let doubled = true;
  restarted.offline.claimDouble('restart-guard', (success) => { doubled = success; });
  assert.equal(doubled, false);
  assert.equal(restarted.player.salary, 10);
  const duplicatePreview = restarted.offline.previewSimulation('restart-guard');
  assert.equal(duplicatePreview.duplicate, true);
  assert.equal(duplicatePreview.salary, 0);
  assert.equal(duplicatePreview.tasksCompleted, 0);
  assert.equal(duplicatePreview.eventsAutoResolved, 0);
}

function testNormalCannotSettleWhileDoubleIsInFlight(): void {
  const provider = new DelayedRewardProvider();
  const { context } = createContext(new MemoryStorageAdapter(), provider);
  let doubled = false;
  context.offline.claimDouble('cross-path-lock', (success) => { doubled = success; });

  assert.throws(() => context.offline.claimNormal('cross-path-lock'), /in progress/);
  assert.equal(context.player.salary, 0);

  provider.resolve({ status: 'granted' });
  assert.equal(doubled, true);
  assert.equal(context.player.salary, 20);
}

function testDoubleCallbackRevalidatesAfterExternalSettlement(): void {
  const provider = new DelayedRewardProvider();
  const { context } = createContext(new MemoryStorageAdapter(), provider);
  let doubled = true;
  context.offline.claimDouble('externally-settled', (success) => { doubled = success; });

  const external = context.idle.settle('externally-settled');
  assert.equal(external.salary, 10);
  provider.resolve({ status: 'granted' });

  assert.equal(doubled, false);
  assert.equal(context.player.salary, 10, 'callback cannot grant after another path settled the id');
  assert.equal(context.player.lastIdleSettlementId, 'externally-settled');
}

function testDisplayedProjectionIsTheExactNormalAndDoubleClaimSnapshot(): void {
  const normal = createContext();
  const normalDisplayed = normal.context.offline.previewSimulation('normal-snapshot');
  normal.clock.advance(3600_000);
  const normalClaim = normal.context.offline.claimNormal('normal-snapshot');
  assert.equal(normalClaim.salary, normalDisplayed.salary);
  assert.equal(normalClaim.cultivation, normalDisplayed.cultivation);
  assert.equal(normalClaim.effectiveSeconds, normalDisplayed.effectiveSeconds);
  assert.equal(normal.context.player.lastSaveTime, START + 3600_000, 'commit cursor uses captured projection time');

  const provider = new DelayedRewardProvider();
  const doubled = createContext(new MemoryStorageAdapter(), provider);
  const doubleDisplayed = doubled.context.offline.previewSimulation('double-snapshot');
  let doubleGranted = false;
  doubled.context.offline.claimDouble('double-snapshot', (success) => { doubleGranted = success; });
  doubled.clock.advance(3600_000);
  provider.resolve({ status: 'granted' });
  assert.equal(doubleGranted, true);
  assert.equal(doubled.context.player.salary, doubleDisplayed.salary * 2);
  assert.equal(doubled.context.player.cultivationExp, doubleDisplayed.cultivation * 2);
  assert.equal(doubled.context.player.lastSaveTime, START + 3600_000, 'delayed callback keeps captured cursor');
}

function testSuccessfulDelayedDoubleCannotReplayAfterRestart(): void {
  const storage = new MemoryStorageAdapter();
  const provider = new DelayedRewardProvider();
  const first = createContext(storage, provider);
  let granted = false;
  first.context.offline.claimDouble('double-restart', (success) => { granted = success; });
  provider.resolve({ status: 'granted' });
  assert.equal(granted, true);

  const restarted = new GameContext({ storage, clock: first.clock, board: null });
  assert.equal(restarted.offline.isSettled('double-restart'), true);
  assert.throws(() => restarted.offline.claimNormal('double-restart'), /already claimed/);
  let duplicateDouble = true;
  restarted.offline.claimDouble('double-restart', (success) => { duplicateDouble = success; });
  assert.equal(duplicateDouble, false);
  assert.equal(restarted.player.salary, 20);
}

const tests = [
  testNormalClaimUsesPreviewedBaseResourcesExactlyOnce,
  testNormalAndDoubleAreMutuallyExclusive,
  testRestartCannotReplayClaimedSettlement,
  testNormalCannotSettleWhileDoubleIsInFlight,
  testDoubleCallbackRevalidatesAfterExternalSettlement,
  testDisplayedProjectionIsTheExactNormalAndDoubleClaimSnapshot,
  testSuccessfulDelayedDoubleCannotReplayAfterRestart,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline exactly-once tests passed');
