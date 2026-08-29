import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
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

function testMockRetryGrants(): void {
  let granted = false;
  let calls = 0;
  const { promotion } = makeContext(readyLevelOne(), undefined, new MockRewardProvider());
  promotion.requestRetry((value) => { granted = value; calls += 1; });
  assert.equal(granted, true);
  assert.equal(calls, 1);
}

function testDuplicateRetryCallbackIgnored(): void {
  class DoubleCallbackProvider implements RewardProvider {
    public claimMindRecovery(): number { return 0; }
    public requestReward(_type: 'MIND_RECOVERY' | 'OFFLINE_DOUBLE' | 'PROMOTION_RETRY', onComplete: (granted: boolean) => void): void {
      onComplete(true);
      onComplete(true);
    }
  }
  let calls = 0;
  const { promotion } = makeContext(readyLevelOne(), undefined, new DoubleCallbackProvider());
  promotion.requestRetry(() => { calls += 1; });
  assert.equal(calls, 1);
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
testMockRetryGrants();
testDuplicateRetryCallbackIgnored();
console.log('promotion service tests passed');
