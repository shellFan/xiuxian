/**
 * Promotion Flow Test — Core Gameplay Fix
 *
 * Tests the promotion/tribulation system with mind efficiency:
 *   - canPromote() checks: max level, KPI, cultivation requirement
 *   - getProbability() factors: base 70%, mind>=80 +10%, mind<30 -20%, 关系户 +8%
 *   - Successful promotion: careerLevel++, reset KPI, +performance
 *   - Failed promotion: mind penalty, retry required
 *   - Cultivation exp overflow on successful promotion
 *   - Mind affects probability
 */
import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { PromotionService, clampProbability } from '../../assets/scripts/services/promotion-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(options: {
  clock?: FakeClock;
  random?: SequenceRandomProvider;
  mind?: number;
  maxMind?: number;
  careerLevel?: number;
  cultivationExp?: number;
  talentId?: string;
}) {
  const clock = options.clock ?? new FakeClock(10_000);
  const random = options.random ?? new SequenceRandomProvider([0.5]);
  const player = new PlayerData({
    mind: options.mind ?? 100,
    maxMind: options.maxMind ?? 100,
    careerLevel: options.careerLevel ?? 1,
    cultivationExp: options.cultivationExp ?? 1000,
    talentId: options.talentId,
  });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock, randomProvider: random });
  // Complete KPI so promotion is allowed (level 1 requires: MERGE_COUNT=3, WORK_SECONDS=300, CULTIVATION=50)
  player.workSeconds = 300;
  context.kpi.recordMerge();
  context.kpi.recordMerge();
  context.kpi.recordMerge();
  const promotion = new PromotionService(context, { randomProvider: random });
  return { context, clock, player, promotion };
}

// ── Test 1: canPromote returns READY when requirements met ───────────────────

function testCanPromoteReady(): void {
  const { promotion } = makeContext({ careerLevel: 1, cultivationExp: 1000 });
  const check = promotion.canPromote();
  assert.equal(check.allowed, true, 'should be allowed');
  assert.equal(check.reason, 'READY', 'reason should be READY');

  console.log('  ✓ canPromote returns READY when requirements met');
}

// ── Test 2: canPromote blocks at max level ───────────────────────────────────

function testCanPromoteMaxLevel(): void {
  const { promotion } = makeContext({ careerLevel: 10, cultivationExp: 999999 });
  const check = promotion.canPromote();
  assert.equal(check.allowed, false, 'should be blocked at max level');
  assert.equal(check.reason, 'MAX_LEVEL', 'reason should be MAX_LEVEL');

  console.log('  ✓ canPromote blocks at max level');
}

// ── Test 3: canPromote blocks when KPI incomplete ────────────────────────────

function testCanPromoteKpiIncomplete(): void {
  const clock = new FakeClock(10_000);
  const random = new SequenceRandomProvider([0.5]);
  const player = new PlayerData({ mind: 100, maxMind: 100, careerLevel: 1, cultivationExp: 1000 });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock, randomProvider: random });
  // Don't complete KPI — promotion should be blocked
  const promotion = new PromotionService(context);
  const check = promotion.canPromote();
  assert.equal(check.allowed, false, 'should be blocked when KPI incomplete');
  assert.equal(check.reason, 'KPI_INCOMPLETE', 'reason should be KPI_INCOMPLETE');

  console.log('  ✓ canPromote blocks when KPI incomplete');
}

// ── Test 4: canPromote blocks when cultivation insufficient ───────────────────

function testCanPromoteCultivationInsufficient(): void {
  // With cultivationExp=0, KPI CULTIVATION target (50 for level 1) is not met,
  // so the result is KPI_INCOMPLETE (CULTIVATION_INSUFFICIENT is unreachable
  // in practice because KPI CULTIVATION target > career requiredExp).
  const clock = new FakeClock(10_000);
  const random = new SequenceRandomProvider([0.5]);
  const player = new PlayerData({ mind: 100, maxMind: 100, careerLevel: 1, cultivationExp: 0 });
  player.workSeconds = 300;
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock, randomProvider: random });
  context.kpi.recordMerge(); context.kpi.recordMerge(); context.kpi.recordMerge();
  const promotion = new PromotionService(context);
  const check = promotion.canPromote();
  assert.equal(check.allowed, false, 'should be blocked when cultivation is zero');
  assert.equal(check.reason, 'KPI_INCOMPLETE', 'KPI CULTIVATION target not met → KPI_INCOMPLETE');

  console.log('  ✓ canPromote blocks when cultivation is zero (KPI CULTIVATION not met)');
}

// ── Test 5: getProbability base is 70% with normal mind ──────────────────────

function testGetProbabilityBase70(): void {
  const { promotion } = makeContext({ mind: 50, maxMind: 100 });
  // mind=50 is between 30 and 80, so no bonus/penalty
  assert.equal(promotion.getProbability(), 70, 'base probability should be 70%');

  console.log('  ✓ getProbability base is 70% with normal mind');
}

// ── Test 6: getProbability +10% when mind>=80 ────────────────────────────────

function testGetProbabilityMindHigh(): void {
  const { promotion } = makeContext({ mind: 80, maxMind: 100 });
  assert.equal(promotion.getProbability(), 80, 'mind>=80 should add 10%');

  console.log('  ✓ getProbability +10% when mind>=80');
}

// ── Test 7: getProbability -20% when mind<30 ─────────────────────────────────

function testGetProbabilityMindLow(): void {
  const { promotion } = makeContext({ mind: 20, maxMind: 100 });
  assert.equal(promotion.getProbability(), 50, 'mind<30 should subtract 20%');

  console.log('  ✓ getProbability -20% when mind<30');
}

// ── Test 8: getProbability +8% for 关系户 talent ─────────────────────────────

function testGetProbabilityConnectionTalent(): void {
  const { promotion } = makeContext({ mind: 50, maxMind: 100, talentId: 'GUANXI' });
  assert.equal(promotion.getProbability(), 78, '关系户 talent should add 8%');

  console.log('  ✓ getProbability +8% for 关系户 talent');
}

// ── Test 9: Successful promotion advances career level ───────────────────────

function testSuccessfulPromotion(): void {
  // random=0.5 → roll=0.5 → 0.5 < 0.70 → success
  const random = new SequenceRandomProvider([0.5]);
  const { promotion, player } = makeContext({ random, careerLevel: 1, cultivationExp: 1000 });

  const options = promotion.getOptions();
  const result = promotion.promote(options[0].id);
  assert.equal(result.success, true, 'promotion should succeed');
  assert.equal(result.oldCareerLevel, 1, 'old level should be 1');
  assert.equal(result.newCareerLevel, 2, 'new level should be 2');
  assert.equal(player.careerLevel, 2, 'player career level should be 2');

  console.log('  ✓ successful promotion advances career level');
}

// ── Test 10: Failed promotion penalizes mind ─────────────────────────────────

function testFailedPromotionPenalizesMind(): void {
  // random=0.99 → roll=0.99 → 0.99 >= 0.70 → fail
  const random = new SequenceRandomProvider([0.99]);
  const { promotion, player } = makeContext({ random, careerLevel: 1, cultivationExp: 1000, mind: 50 });

  const options = promotion.getOptions();
  const result = promotion.promote(options[0].id);
  assert.equal(result.success, false, 'promotion should fail');
  assert.equal(result.mindDelta, -10, 'mind should be penalized by 10');
  assert.equal(player.careerLevel, 1, 'career level should not change');

  console.log('  ✓ failed promotion penalizes mind');
}

// ── Test 11: clampProbability clamps between 5 and 95 ────────────────────────

function testClampProbability(): void {
  assert.equal(clampProbability(0), 5, 'should clamp to min 5');
  assert.equal(clampProbability(100), 95, 'should clamp to max 95');
  assert.equal(clampProbability(70), 70, 'should not change valid value');

  console.log('  ✓ clampProbability clamps between 5 and 95');
}

// ── Test 12: Cultivation overflow on successful promotion ─────────────────────

function testCultivationOverflowOnPromotion(): void {
  const random = new SequenceRandomProvider([0.5]);
  // Level 1 requiredExp = 0 (index * 100), so overflow = 800 - 0 = 800
  const { promotion, player } = makeContext({ random, careerLevel: 1, cultivationExp: 800 });

  const options = promotion.getOptions();
  const result = promotion.promote(options[0].id);
  assert.equal(result.success, true, 'promotion should succeed');
  // Level 1 requiredExp = 0, so all cultivation carries over
  assert.equal(player.cultivationExp, 800, 'cultivation overflow should be 800 (level 1 requiredExp=0)');

  console.log('  ✓ cultivation overflow on successful promotion');
}

// ── Test 13: Promotion resets KPI ────────────────────────────────────────────

function testPromotionResetsKpi(): void {
  const random = new SequenceRandomProvider([0.5]);
  const { promotion, context } = makeContext({ random, careerLevel: 1, cultivationExp: 1000 });

  const options = promotion.getOptions();
  promotion.promote(options[0].id);
  assert.equal(context.kpi.isCurrentKpiCompleted(), false, 'KPI should be reset after promotion');

  console.log('  ✓ promotion resets KPI');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testCanPromoteReady();
testCanPromoteMaxLevel();
testCanPromoteKpiIncomplete();
testCanPromoteCultivationInsufficient();
testGetProbabilityBase70();
testGetProbabilityMindHigh();
testGetProbabilityMindLow();
testGetProbabilityConnectionTalent();
testSuccessfulPromotion();
testFailedPromotionPenalizesMind();
testClampProbability();
testCultivationOverflowOnPromotion();
testPromotionResetsKpi();
console.log('promotion flow tests passed');