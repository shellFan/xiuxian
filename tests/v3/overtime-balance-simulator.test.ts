import assert from 'node:assert/strict';
import { simulateOvertimePolicies } from '../../scripts/overtime-balance-simulator';

function assertFiniteNonNegativeMetrics(value: ReturnType<typeof simulateOvertimePolicies>): void {
  for (const [policy, result] of Object.entries(value)) {
    for (const key of [
      'salary',
      'performance',
      'cultivation',
      'totalRewards',
      'mindCost',
      'fatigueCost',
      'incidentExposure',
      'overtimeDays',
      'endingMind',
      'endingInnerDemon',
    ] as const) {
      assert.ok(Number.isFinite(result[key]), `${policy}.${key} must be finite`);
      assert.ok(result[key] >= 0, `${policy}.${key} must be non-negative`);
    }
    assert.ok(Number.isFinite(result.sustainableScore), `${policy}.sustainableScore must be finite`);
  }
}

function testSeededSimulationIsDeterministicAndNeverUsesAmbientRandomness(): void {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  Math.random = () => { throw new Error('ambient Math.random is forbidden'); };
  Date.now = () => { throw new Error('ambient Date.now is forbidden'); };
  try {
    const options = { seed: 417, workdays: 30, initialMind: 80, initialInnerDemon: 10, careerLevel: 3 } as const;
    const first = simulateOvertimePolicies(options);
    const second = simulateOvertimePolicies(options);
    assert.deepEqual(first, second);
    assertFiniteNonNegativeMetrics(first);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}

function testSelectiveUsesItsOwnBoundedDecisionRule(): void {
  const result = simulateOvertimePolicies({
    seed: 9173,
    workdays: 40,
    initialMind: 72,
    initialInnerDemon: 18,
    careerLevel: 3,
  });
  assert.equal(result.ALWAYS.overtimeDays, 40);
  assert.equal(result.NEVER.overtimeDays, 0);
  assert.ok(result.SELECTIVE.overtimeDays > 0, 'SELECTIVE should accept worthwhile sustainable opportunities');
  assert.ok(result.SELECTIVE.overtimeDays < result.ALWAYS.overtimeDays, 'SELECTIVE must reject some opportunities');
  assert.ok(
    result.ALWAYS.sustainableScore < Math.max(result.NEVER.sustainableScore, result.SELECTIVE.sustainableScore),
    'ALWAYS must not be unconditionally dominant after sustainability costs',
  );
}

function testNeverWinsWhenMindIsLowAndInnerDemonIsHigh(): void {
  const result = simulateOvertimePolicies({
    seed: 20260921,
    workdays: 30,
    initialMind: 12,
    initialInnerDemon: 88,
    careerLevel: 3,
  });
  assert.ok(result.NEVER.sustainableScore > result.ALWAYS.sustainableScore);
  assert.ok(result.NEVER.sustainableScore > result.SELECTIVE.sustainableScore);
}

testSeededSimulationIsDeterministicAndNeverUsesAmbientRandomness();
testSelectiveUsesItsOwnBoundedDecisionRule();
testNeverWinsWhenMindIsLowAndInnerDemonIsHigh();
console.log('overtime balance simulator tests passed');
