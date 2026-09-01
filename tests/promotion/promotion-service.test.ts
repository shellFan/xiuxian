import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
import type { GameSaveData } from '../../assets/scripts/model/save-data';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { MockRewardProvider, type RewardProvider } from '../../assets/scripts/services/reward-provider';
import { PromotionService, clampProbability } from '../../assets/scripts/services/promotion-service';

function makeContext(options: PlayerDataOptions, random?: FixedRandomProvider, reward?: RewardProvider): { context: GameContext; player: PlayerData; promotion: PromotionService } {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData(options);
  const context = new GameContext({ player, storage, randomProvider: random, rewardProvider: reward });
  return { context, player, promotion: context.promotion };
}

function readyLevelOne(): PlayerDataOptions {
  return {
    careerLevel: 1,
    cultivationExp: 50,
    mind: 100,
    maxMind: 100,
    performance: 0,
    promotionFailCount: 0,
    workSeconds: 300,
    kpiProgress: { MERGE_COUNT: 3, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
  };
}

function testKpiIncompleteBlocksPromotion(): void {
  const { promotion, player } = makeContext({ ...readyLevelOne(), kpiProgress: { MERGE_COUNT: 1, SALARY_EARNED: 0, EVENT_RESOLVED: 0 } });
  assert.equal(promotion.canPromote().allowed, false);
  assert.equal(promotion.canPromote().reason, 'KPI_INCOMPLETE');
  assert.throws(() => promotion.promote('PPT'), /KPI_INCOMPLETE/);
  assert.equal(player.careerLevel, 1);
}

function testCultivationInsufficientBlocksPromotion(): void {
  // Lv3 career requirement (300) exceeds the Lv3 KPI cultivation target (250), so a
  // player with cultivation between the two is KPI-complete yet not promotable.
  const { promotion } = makeContext({
    careerLevel: 3,
    cultivationExp: 280,
    mind: 100,
    workSeconds: 900,
    kpiProgress: { MERGE_COUNT: 8, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
  });
  assert.equal(promotion.canPromote().allowed, false);
  assert.equal(promotion.canPromote().reason, 'CULTIVATION_INSUFFICIENT');
}

function testMaxLevelBlocksPromotion(): void {
  const { promotion } = makeContext({ ...readyLevelOne(), careerLevel: 10 });
  assert.equal(promotion.canPromote().allowed, false);
  assert.equal(promotion.canPromote().reason, 'MAX_LEVEL');
}

function testBaseProbabilitySeventy(): void {
  const { promotion } = makeContext({ ...readyLevelOne(), mind: 50 });
  assert.equal(promotion.getProbability(), 70);
}

function testMindHighProbabilityEighty(): void {
  const { promotion } = makeContext({ ...readyLevelOne(), mind: 80 });
  assert.equal(promotion.getProbability(), 80);
}

function testMindLowProbabilityFifty(): void {
  const { promotion } = makeContext({ ...readyLevelOne(), mind: 20 });
  assert.equal(promotion.getProbability(), 50);
}

function testConnectionTalentBonus(): void {
  const { promotion } = makeContext({ ...readyLevelOne(), mind: 50, talentId: 'GUANXI' });
  assert.equal(promotion.getProbability(), 78);
}

function testClampLowerBound(): void {
  assert.equal(clampProbability(3), 5);
  assert.equal(clampProbability(-10), 5);
}

function testClampUpperBound(): void {
  assert.equal(clampProbability(99), 95);
  assert.equal(clampProbability(200), 95);
}

function testFixedRandomSuccess(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FixedRandomProvider(0.5));
  const result = promotion.promote('PPT');
  assert.equal(result.success, true);
  assert.equal(result.oldCareerLevel, 1);
  assert.equal(result.newCareerLevel, 2);
  assert.equal(player.careerLevel, 2);
  assert.equal(result.performanceReward, 10);
  assert.equal(result.mindDelta, 0);
  assert.equal(result.failCount, 0);
}

function testFixedRandomFailure(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  const result = promotion.promote('PPT');
  assert.equal(result.success, false);
  assert.equal(player.careerLevel, 1);
  assert.equal(result.newCareerLevel, 1);
  assert.equal(result.performanceReward, 0);
  assert.equal(result.mindDelta, -10);
  assert.equal(player.mind, 90);
  assert.equal(result.failCount, 1);
  assert.equal(player.promotionFailCount, 1);
}

function testSuccessConsumesRequiredKeepsOverflow(): void {
  const { promotion, player } = makeContext(
    {
      careerLevel: 2,
      cultivationExp: 150,
      mind: 100,
      workSeconds: 600,
      kpiProgress: { MERGE_COUNT: 5, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
    },
    new FixedRandomProvider(0.5),
  );
  assert.equal(promotion.canPromote().allowed, true);
  const result = promotion.promote('DATA');
  assert.equal(result.success, true);
  assert.equal(player.careerLevel, 3);
  // Lv2 requiredExp = 100, overflow 150 - 100 = 50 preserved.
  assert.equal(player.cultivationExp, 50);
}

function testSuccessResetsKpi(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FixedRandomProvider(0.5));
  promotion.promote('PPT');
  assert.deepEqual(player.kpiProgress, {});
  assert.equal(promotion.canPromote().allowed, false);
}

function testSuccessPerformanceReward(): void {
  const { promotion, player } = makeContext({ ...readyLevelOne(), performance: 5 }, new FixedRandomProvider(0.5));
  const result = promotion.promote('BLAME');
  assert.equal(result.success, true);
  assert.equal(player.performance, 15);
}

function testSuccessResetsFailCount(): void {
  const { promotion, player } = makeContext({ ...readyLevelOne(), promotionFailCount: 3 }, new FixedRandomProvider(0.5));
  const result = promotion.promote('PPT');
  assert.equal(result.success, true);
  assert.equal(player.promotionFailCount, 0);
  assert.equal(result.failCount, 0);
}

function testFailureKeepsCareerLevel(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  promotion.promote('PPT');
  assert.equal(player.careerLevel, 1);
}

function testFailureReducesMind(): void {
  const { promotion, player } = makeContext({ ...readyLevelOne(), mind: 100 }, new FixedRandomProvider(0.9));
  promotion.promote('PPT');
  assert.equal(player.mind, 90);
}

function testFailureIncrementsFailCount(): void {
  const { promotion, player } = makeContext({ ...readyLevelOne(), promotionFailCount: 0 }, new FixedRandomProvider(0.9));
  promotion.promote('PPT');
  assert.equal(player.promotionFailCount, 1);
}

function testSaveFailureRollsBackTransaction(): void {
  const throwingStorage: StorageAdapter = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const player = new PlayerData(readyLevelOne());
  const context = new GameContext({ player, storage: throwingStorage, randomProvider: new FixedRandomProvider(0.5) });
  assert.throws(() => context.promotion.promote('PPT'), /quota exceeded/);
  assert.equal(player.careerLevel, 1);
  assert.equal(player.cultivationExp, 50);
  assert.equal(player.performance, 0);
  assert.equal(player.mind, 100);
  assert.equal(player.kpiProgress.MERGE_COUNT, 3);
  assert.equal(player.promotionFailCount, 0);
}

function testRepeatedPromotionDoesNotDoubleReward(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FixedRandomProvider(0.5));
  promotion.promote('PPT');
  assert.equal(player.careerLevel, 2);
  // After success KPI is reset, so a second promotion is not allowed.
  assert.throws(() => promotion.promote('PPT'));
  assert.equal(player.careerLevel, 2);
}

class FailThenSucceed extends FixedRandomProvider {
  public constructor() { super(0); }
  private count = 0;
  public next(): number { return this.count++ === 0 ? 0.9 : 0.5; }
}

function testFirstAttemptIsFree(): void {
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.5));
  assert.equal(promotion.needsRetry(), false);
  const result = promotion.promote('PPT');
  assert.equal(result.success, true);
  assert.equal(promotion.needsRetry(), false, 'success clears any retry requirement');
}

function testFailThenPromoteWithoutRetryRejected(): void {
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  promotion.promote('PPT'); // fails
  assert.equal(promotion.needsRetry(), true);
  assert.throws(() => promotion.promote('PPT'), /Promotion retry required/);
}

function testRetryAfterFailureGrants(): void {
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  promotion.promote('PPT'); // fail
  let granted = false;
  let calls = 0;
  promotion.requestRetry((value) => { granted = value; calls += 1; });
  assert.equal(granted, true);
  assert.equal(calls, 1);
  assert.equal(promotion.needsRetry(), false, 'held retry token removes the block');
}

function testRetryEnablesOneSuccessfulAttempt(): void {
  const { promotion, player } = makeContext(readyLevelOne(), new FailThenSucceed());
  promotion.promote('PPT'); // fails (0.9)
  assert.equal(promotion.needsRetry(), true);
  promotion.requestRetry(() => undefined); // grants
  const result = promotion.promote('PPT'); // consumes token, succeeds (0.5)
  assert.equal(result.success, true);
  assert.equal(player.careerLevel, 2);
  assert.equal(promotion.needsRetry(), false);
}

function testRetryTokenConsumedOnce(): void {
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  promotion.promote('PPT'); // fail
  promotion.requestRetry(() => undefined); // granted
  promotion.promote('PPT'); // consumes token, fails again (0.9)
  assert.equal(promotion.retryGranted, false, 'token consumed');
  assert.throws(() => promotion.promote('PPT'), /Promotion retry required/);
}

function testRetryFailNeedsRewardAgain(): void {
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9));
  promotion.promote('PPT'); // fail
  promotion.requestRetry(() => undefined); // granted
  promotion.promote('PPT'); // consumes, fails
  assert.equal(promotion.needsRetry(), true, 'still needs a reward after another failure');
  assert.throws(() => promotion.promote('PPT'), /Promotion retry required/);
}

function testRequestRetryBeforeFailureRejected(): void {
  let granted = false;
  let calls = 0;
  const { promotion } = makeContext(readyLevelOne(), undefined, new MockRewardProvider());
  promotion.requestRetry((value) => { granted = value; calls += 1; });
  assert.equal(granted, false, 'retry before any failure is rejected');
  assert.equal(calls, 0, 'provider must not be contacted before a failure');
  assert.equal(promotion.retryGranted, false);
}

function testDuplicateRetryCallbackOnlyOneToken(): void {
  class DoubleCallbackProvider implements RewardProvider {
    public claimMindRecovery(): number { return 0; }
    public requestReward(_type: 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY', onComplete: (result: { status: 'granted' | 'cancelled' | 'failed' }) => void): void {
      onComplete({ status: 'granted' });
      onComplete({ status: 'granted' });
    }
  }
  const { promotion } = makeContext(readyLevelOne(), new FixedRandomProvider(0.9), new DoubleCallbackProvider());
  promotion.promote('PPT'); // fail first
  let calls = 0;
  promotion.requestRetry(() => { calls += 1; });
  assert.equal(calls, 1, 'duplicate provider callback grants at most one token');
  assert.equal(promotion.retryGranted, true);
}

// ---------------------------------------------------------------------------
// Phase 2.2 — Promotion transaction atomicity
// ---------------------------------------------------------------------------
class CountingStorageAdapter implements StorageAdapter {
  public writeCount = 0;
  public getItem(): string | null { return null; }
  public setItem(_key: string, _value: string): void { this.writeCount += 1; }
  public removeItem(): void { /* noop */ }
}

class FailOnSecondWriteStorageAdapter implements StorageAdapter {
  public writeCount = 0;
  public getItem(): string | null { return null; }
  public setItem(_key: string, _value: string): void {
    this.writeCount += 1;
    if (this.writeCount >= 2) throw new Error('second write rejected');
  }
  public removeItem(): void { /* noop */ }
}

class CapturingStorageAdapter implements StorageAdapter {
  public lastValue: string | null = null;
  public writeCount = 0;
  public getItem(): string | null { return null; }
  public setItem(_key: string, value: string): void { this.lastValue = value; this.writeCount += 1; }
  public removeItem(): void { /* noop */ }
}

/** TEST-01: a successful promotion must perform exactly one storage write (no nested Office save). */
function testPromotionProducesExactlyOneSave(): void {
  const storage = new CountingStorageAdapter();
  const player = new PlayerData(readyLevelOne());
  const context = new GameContext({ player, storage, randomProvider: new FixedRandomProvider(0.5) });
  assert.equal(storage.writeCount, 0, 'context initialization must not write to storage');
  context.promotion.promote('PPT'); // success
  assert.equal(storage.writeCount, 1, 'a successful promotion must perform exactly one storage write');
}

/** TEST-02: regression guard — if a second save ever exists, the second write must throw and fail the promote. */
function testNoSecondSaveRegression(): void {
  const storage = new FailOnSecondWriteStorageAdapter();
  const player = new PlayerData(readyLevelOne());
  const context = new GameContext({ player, storage, randomProvider: new FixedRandomProvider(0.5) });
  const result = context.promotion.promote('PPT'); // success path
  assert.equal(result.success, true);
  assert.equal(storage.writeCount, 1, 'only one write occurs; a second would have thrown and failed the promote');
}

/** TEST-03: the single persisted snapshot is fully consistent — no half-applied promotion state. */
function testStorageAtomicSnapshot(): void {
  const storage = new CapturingStorageAdapter();
  const player = new PlayerData({ ...readyLevelOne(), performance: 5 });
  const context = new GameContext({ player, storage, randomProvider: new FixedRandomProvider(0.5) });
  const required = context.career.current().requiredExp;
  const expectedOverflow = player.cultivationExp - required;
  context.promotion.promote('PPT');
  assert.equal(storage.writeCount, 1, 'single atomic write');
  const saved = JSON.parse(storage.lastValue as string) as GameSaveData;
  assert.equal(saved.careerLevel, 2, 'new career level persisted');
  assert.equal(saved.cultivationExp, expectedOverflow, 'cultivation overflow persisted (consistency)');
  assert.equal(saved.performance, 15, 'performance +10 persisted');
  assert.equal(saved.promotionFailCount, 0, 'fail count reset persisted');
  assert.equal(saved.officeLevel, context.office.getOfficeLevel(), 'office mirror synced to new career level');
  assert.deepEqual(saved.kpiProgress, {}, 'per-level KPI counters reset in the persisted snapshot');
}

/**
 * TEST-04: retry token rollback. A failed free attempt (save #1 succeeds) -> granted retry token
 * -> next successful attempt's save (#2) throws. Player data must roll back AND the already-watched
 * retry token must survive so the player can retry again (Phase 3 real-ad readiness).
 */
function testRetryTokenSurvivesSaveFailure(): void {
  const storage = new FailOnSecondWriteStorageAdapter();
  const player = new PlayerData(readyLevelOne());
  const context = new GameContext({ player, storage, randomProvider: new FixedRandomProvider(0.9) });
  context.promotion.promote('PPT'); // free attempt fails -> first save succeeds, re-arms retry
  assert.equal(storage.writeCount, 1);
  let granted = false;
  context.promotion.requestRetry((value) => { granted = value; });
  assert.equal(granted, true, 'retry request granted (mock ad watched)');
  assert.equal(context.promotion.retryGranted, true, 'token held before the next attempt');
  // Next attempt succeeds on RNG but its save (the 2nd write) throws.
  assert.throws(() => context.promotion.promote('PPT'), /second write rejected/);
  // Player fully rolled back to the pre-attempt state.
  assert.equal(player.careerLevel, 1);
  assert.equal(player.performance, 0);
  assert.equal(player.cultivationExp, 50);
  // The retry token must NOT be lost: the player watched the ad but the save failed.
  assert.equal(context.promotion.retryGranted, true, 'retry token survives a save failure');
  assert.equal(context.promotion.needsRetry(), false, 'token available, no retry-required block');
  // Once storage recovers, the player may attempt again (token still usable).
  const recovered = new GameContext({ player, storage: new MemoryStorageAdapter(), randomProvider: new FixedRandomProvider(0.5) });
  const result = recovered.promotion.promote('PPT');
  assert.equal(result.success, true, 'can promote again after storage recovers');
  assert.equal(player.careerLevel, 2);
}

testKpiIncompleteBlocksPromotion();
testCultivationInsufficientBlocksPromotion();
testMaxLevelBlocksPromotion();
testBaseProbabilitySeventy();
testMindHighProbabilityEighty();
testMindLowProbabilityFifty();
testConnectionTalentBonus();
testClampLowerBound();
testClampUpperBound();
testFixedRandomSuccess();
testFixedRandomFailure();
testSuccessConsumesRequiredKeepsOverflow();
testSuccessResetsKpi();
testSuccessPerformanceReward();
testSuccessResetsFailCount();
testFailureKeepsCareerLevel();
testFailureReducesMind();
testFailureIncrementsFailCount();
testSaveFailureRollsBackTransaction();
testRepeatedPromotionDoesNotDoubleReward();
testFirstAttemptIsFree();
testFailThenPromoteWithoutRetryRejected();
testRetryAfterFailureGrants();
testRetryEnablesOneSuccessfulAttempt();
testRetryTokenConsumedOnce();
testRetryFailNeedsRewardAgain();
testRequestRetryBeforeFailureRejected();
testDuplicateRetryCallbackOnlyOneToken();
testPromotionProducesExactlyOneSave();
testNoSecondSaveRegression();
testStorageAtomicSnapshot();
testRetryTokenSurvivesSaveFailure();
console.log('promotion service tests passed');
