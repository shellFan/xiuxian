import assert from 'node:assert/strict';
import { generateBalanceMatrix } from '../../scripts/overtime-balance-simulator';

function testPersonalityRunsExposeMindAdsAndCareerNumbers(): void {
  const result = generateBalanceMatrix();
  const seven = result.personality[7];
  const sixty = result.personality[60];

  assert.equal(seven.GRINDER.calendarDays, 7);
  assert.equal(sixty.NORMAL.workdays, 44);
  assert.equal(sixty.SLACKER.workdays, 44);
  assert.ok(sixty.GRINDER.adViews > sixty.NORMAL.adViews);
  assert.ok(sixty.NORMAL.adViews >= sixty.SLACKER.adViews);
  assert.ok(sixty.GRINDER.maxAdsPerDay <= 10, 'real ad frequency policy must cap each session/day');
  assert.ok(sixty.NORMAL.firstPromotionDay !== null);
  assert.ok(sixty.SLACKER.endingCareerLevel > 1, 'every personality needs a viable advancement path');
  assert.ok(sixty.GRINDER.zeroMindDays < 5, 'grinder must recover instead of remaining mind-locked');
  assert.equal(seven.GRINDER.adViews, 49);
  assert.equal(seven.NORMAL.firstPromotionDay, null);
  assert.equal(sixty.GRINDER.freeOvertimeHours, 28);
  assert.equal(sixty.GRINDER.endingMind, 64);
  assert.equal(sixty.NORMAL.firstPromotionDay, 8);
  assert.equal(sixty.NORMAL.endingCareerLevel, 3);
  assert.equal(sixty.NORMAL.adRewardSharePercent, 18.867925);
  assert.equal(sixty.SLACKER.firstPromotionDay, 11);
  assert.equal(sixty.SLACKER.endingCareerLevel, 2);
}

function testDeadEndAndMonetizationThresholdsHaveStatusesAndActualValues(): void {
  const result = generateBalanceMatrix();
  assert.equal(result.criteria.MIND_LOCK.status, 'PASS');
  assert.equal(result.criteria.DEAD_END.status, 'PASS');
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(result.criteria.AD_FREQ.status));
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(result.criteria.AD_ECONOMY.status));
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(result.criteria.CAREER_PACING.status));

  assert.equal(result.criteria.DEAD_END.value, 0);
  assert.equal(result.criteria.MIND_LOCK.value, 0);
  assert.equal(result.criteria.AD_FREQ.value, 7);
  assert.equal(result.criteria.AD_ECONOMY.value, 30.837004);
  assert.equal(result.criteria.CAREER_PACING.value, 8);
}

testPersonalityRunsExposeMindAdsAndCareerNumbers();
testDeadEndAndMonetizationThresholdsHaveStatusesAndActualValues();
console.log('mind dead-end tests passed');
