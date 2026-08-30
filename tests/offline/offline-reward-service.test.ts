import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { MockRewardProvider, type RewardProvider } from '../../assets/scripts/services/reward-provider';
import { OfflineRewardService } from '../../assets/scripts/services/offline-reward-service';

function makeContext(clock: FakeClock, reward?: RewardProvider): { context: GameContext; offline: OfflineRewardService } {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ lastSaveTime: clock.now() });
  const context = new GameContext({ player, storage, clock, rewardProvider: reward });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  return { context, offline: context.offline };
}

function testZeroSeconds(): void {
  const clock = new FakeClock(1_000);
  const { offline } = makeContext(clock);
  assert.equal(offline.preview('zero').salary, 0);
  assert.equal(offline.preview('zero').elapsedSeconds, 0);
}

function testOneHour(): void {
  const clock = new FakeClock(1_000);
  const { offline } = makeContext(clock);
  clock.advance(3_600 * 1000);
  assert.deepEqual(offline.preview('one'), { salary: 10, cultivationExp: 5, elapsedSeconds: 3600, capped: false, duplicate: false });
}

function testEightHourCap(): void {
  const clock = new FakeClock(1_000);
  const { offline } = makeContext(clock);
  clock.advance(8 * 3_600 * 1000);
  const preview = offline.preview('eight');
  assert.equal(preview.elapsedSeconds, 28_800);
  assert.equal(preview.capped, false);
  assert.equal(preview.salary, 80);
}

function testTwelveHourCapped(): void {
  const clock = new FakeClock(1_000);
  const { offline } = makeContext(clock);
  clock.advance(12 * 3_600 * 1000);
  const preview = offline.preview('twelve');
  assert.equal(preview.elapsedSeconds, 28_800);
  assert.equal(preview.capped, true);
  assert.equal(preview.salary, 80);
}

function testNegativeClock(): void {
  const clock = new FakeClock(1_000);
  const { offline } = makeContext(clock);
  clock.set(999);
  assert.equal(offline.preview('neg').salary, 0);
  assert.equal(offline.preview('neg').elapsedSeconds, 0);
}

function testNormalClaim(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  const result = offline.claimNormal('s');
  assert.equal(result.salary, 10);
  assert.equal(result.cultivationExp, 5);
  assert.equal(context.player.salary, 10);
  assert.equal(offline.isSettled('s'), true);
}

function testDoubleClaim(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  let granted = false;
  offline.claimDouble('s', (success) => { granted = success; });
  assert.equal(granted, true);
  // 2x total: base 10 salary -> 20.
  assert.equal(context.player.salary, 20);
  assert.equal(offline.isSettled('s'), true);
}

function testNormalThenDoubleRejected(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  offline.claimNormal('s');
  assert.equal(context.player.salary, 10);
  let granted = true;
  offline.claimDouble('s', (success) => { granted = success; });
  assert.equal(granted, false);
  assert.equal(context.player.salary, 10);
}

function testDoubleThenNormalRejected(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  offline.claimDouble('s', () => undefined);
  assert.equal(context.player.salary, 20);
  assert.throws(() => offline.claimNormal('s'));
  assert.equal(context.player.salary, 20);
}

function testDoubleClickOnlyGrantsOnce(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  let first = false;
  let second = true;
  offline.claimDouble('s', (success) => { first = success; });
  offline.claimDouble('s', (success) => { second = success; });
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(context.player.salary, 20);
}

function testDuplicateRewardCallbackIgnored(): void {
  class DoubleCallbackProvider implements RewardProvider {
    public claimMindRecovery(): number { return 0; }
    public requestReward(_type: 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY', onComplete: (granted: boolean) => void): void {
      onComplete(true);
      onComplete(true);
    }
  }
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock, new DoubleCallbackProvider());
  clock.advance(3_600 * 1000);
  offline.claimDouble('s', () => undefined);
  // Only one extra base grant, not two.
  assert.equal(context.player.salary, 20);
}

function testReopenDuplicateRejected(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  offline.claimNormal('s');
  assert.throws(() => offline.claimNormal('s'));
  assert.equal(context.player.salary, 10);
}

function testSameSettlementIdDuplicate(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  assert.equal(offline.claimNormal('s').salary, 10);
  assert.throws(() => offline.claimNormal('s'));
  assert.equal(context.player.salary, 10);
}

function testSaveFailureRollsBackDouble(): void {
  const throwingStorage: StorageAdapter = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const clock = new FakeClock(1_000);
  const player = new PlayerData({ lastSaveTime: clock.now() });
  const context = new GameContext({ player, storage: throwingStorage, clock });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  clock.advance(3_600 * 1000);
  assert.throws(() => context.offline.claimDouble('s', () => undefined), /quota exceeded/);
  assert.equal(player.salary, 0);
  assert.equal(player.cultivationExp, 0);
  assert.equal(player.lastIdleSettlementId, null);
}

function testNewSettlementWorks(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  offline.claimNormal('s1');
  assert.equal(context.player.salary, 10);
  clock.advance(3_600 * 1000);
  const result = offline.claimNormal('s2');
  assert.equal(result.salary, 10);
  assert.equal(context.player.salary, 20);
}

function testDoubleThenNormalNewSettlement(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  let granted = false;
  offline.claimDouble('s1', (success) => { granted = success; });
  assert.equal(granted, true);
  assert.equal(context.player.salary, 20);
  clock.advance(3_600 * 1000);
  const result = offline.claimNormal('s2');
  assert.equal(result.salary, 10, 'normal of a different settlement still works after a double');
  assert.equal(context.player.salary, 30);
}

function testDoubleThenDoubleNewSettlement(): void {
  const clock = new FakeClock(1_000);
  const { offline, context } = makeContext(clock);
  clock.advance(3_600 * 1000);
  let first = false;
  offline.claimDouble('s1', (success) => { first = success; });
  assert.equal(first, true);
  clock.advance(3_600 * 1000);
  let second = false;
  offline.claimDouble('s2', (success) => { second = success; });
  assert.equal(second, true, 'double of a different settlement is independent');
  assert.equal(context.player.salary, 40, '2x of s1 + 2x of s2');
}

function testSaveFailureAllowsRetrySameSettlement(): void {
  let saveCount = 0;
  const flakyStorage: StorageAdapter = {
    getItem: () => null,
    setItem: () => { saveCount += 1; if (saveCount === 1) throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const clock = new FakeClock(1_000);
  const player = new PlayerData({ lastSaveTime: clock.now() });
  const context = new GameContext({ player, storage: flakyStorage, clock });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  clock.advance(3_600 * 1000);
  assert.throws(() => context.offline.claimDouble('s1', () => undefined), /quota exceeded/);
  assert.equal(player.salary, 0, 'rolled back after save failure');
  // Retry the SAME settlement: now the save succeeds.
  let granted = false;
  context.offline.claimDouble('s1', (success) => { granted = success; });
  assert.equal(granted, true, 'same settlement can be retried after a save failure');
  assert.equal(player.salary, 20);
}

testZeroSeconds();
testOneHour();
testEightHourCap();
testTwelveHourCapped();
testNegativeClock();
testNormalClaim();
testDoubleClaim();
testNormalThenDoubleRejected();
testDoubleThenNormalRejected();
testDoubleClickOnlyGrantsOnce();
testDuplicateRewardCallbackIgnored();
testReopenDuplicateRejected();
testSameSettlementIdDuplicate();
testSaveFailureRollsBackDouble();
testNewSettlementWorks();
testDoubleThenNormalNewSettlement();
testDoubleThenDoubleNewSettlement();
testSaveFailureAllowsRetrySameSettlement();
console.log('offline reward service tests passed');
