import assert from 'node:assert/strict';

import { MockRewardProvider, isRewardGranted, type RewardResult } from '../../assets/scripts/services/reward-provider';

function testMockGrantUsesResultObject(): void {
  const provider = new MockRewardProvider();
  let result: RewardResult | undefined;
  provider.requestReward('PROMOTION_RETRY', (value) => { result = value; });
  assert.equal(result?.status, 'granted');
  assert.equal(isRewardGranted(result!), true);
}

function testCancelledAndFailedAreNotGranted(): void {
  assert.equal(isRewardGranted({ status: 'cancelled' }), false);
  assert.equal(isRewardGranted({ status: 'failed', reason: 'sdk' }), false);
}

function testMindRecoveryStillSynchronous(): void {
  assert.equal(new MockRewardProvider(40).claimMindRecovery(), 40);
}

testMockGrantUsesResultObject();
testCancelledAndFailedAreNotGranted();
testMindRecoveryStillSynchronous();
console.log('reward result tests passed');
