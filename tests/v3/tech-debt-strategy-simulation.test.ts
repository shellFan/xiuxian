import assert from 'node:assert/strict';
import {
  BALANCE_HORIZONS,
  BALANCE_THRESHOLDS,
  generateBalanceMatrix,
  type BalanceCriterion,
} from '../../scripts/overtime-balance-simulator';

function testDebtStrategiesProduceMeasuredDeterministicCells(): void {
  const result = generateBalanceMatrix({ seed: 20260921 });
  assert.deepEqual(result, generateBalanceMatrix({ seed: 20260921 }));

  for (const days of BALANCE_HORIZONS) {
    const cells = result.techDebt[days];
    assert.equal(cells.RUSH.workdays, days === 7 ? 5 : days === 30 ? 22 : 44);
    assert.ok(cells.RUSH.endingAverageDebt > cells.BALANCED.endingAverageDebt);
    assert.ok(cells.BALANCED.endingAverageDebt >= cells.QUALITY.endingAverageDebt);
    assert.ok(cells.RUSH.throughput > cells.QUALITY.throughput);
  }

  assert.equal(result.techDebt[7].RUSH.workdays, 5);
  assert.equal(result.techDebt[7].RUSH.endingAverageDebt, 14);
  assert.equal(result.techDebt[7].QUALITY.debtRepaid, 44);
  assert.equal(result.techDebt[7].BALANCED.throughput, 642);
  assert.equal(result.techDebt[30].BALANCED.workdays, 22);
  assert.equal(result.techDebt[60].QUALITY.workdays, 44);
  assert.equal(result.techDebt[60].RUSH.incidentCount, 7);
  assert.equal(result.techDebt[60].QUALITY.endingAverageDebt, 0);
  assert.equal(result.techDebt[60].BALANCED.sustainableScore, 5496.428573);
}

function testEveryRequestedCriterionHasNumericThresholdEvidence(): void {
  const result = generateBalanceMatrix();
  const expected: readonly BalanceCriterion[] = [
    'FREE_OVERTIME',
    'ALWAYS_DOMINANCE',
    'NEVER_VIABLE',
    'MIND_LOCK',
    'DEAD_END',
    'AD_FREQ',
    'AD_ECONOMY',
    'CAREER_PACING',
  ];
  assert.deepEqual(Object.keys(result.criteria), expected);
  assert.deepEqual(Object.keys(BALANCE_THRESHOLDS), expected);

  for (const criterion of expected) {
    const evidence = result.criteria[criterion];
    assert.ok(['PASS', 'WARN', 'FAIL'].includes(evidence.status));
    assert.ok(Number.isFinite(evidence.value), `${criterion} needs a measured numeric value`);
    assert.ok(evidence.thresholds.length >= 2, `${criterion} needs numeric status thresholds`);
    assert.ok(evidence.thresholds.every(Number.isFinite));
  }

  assert.equal(result.criteria.ALWAYS_DOMINANCE.status, 'PASS');
  assert.equal(result.criteria.NEVER_VIABLE.status, 'PASS');
  assert.equal(result.criteria.ALWAYS_DOMINANCE.value, 0);
  assert.equal(result.criteria.NEVER_VIABLE.value, 0);
  assert.equal(result.criteria.AD_FREQ.status, 'WARN');
  assert.equal(result.criteria.AD_ECONOMY.status, 'WARN');
  assert.equal(result.overallStatus, 'WARN');
}

testDebtStrategiesProduceMeasuredDeterministicCells();
testEveryRequestedCriterionHasNumericThresholdEvidence();
console.log('tech debt strategy simulation tests passed');
