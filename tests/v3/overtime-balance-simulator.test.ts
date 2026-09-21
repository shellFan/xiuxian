import assert from 'node:assert/strict';
import {
  BALANCE_HORIZONS,
  BALANCE_STATUS_PRECEDENCE,
  DEFAULT_BALANCE_PROFILE,
  evaluateBalanceStatus,
  generateBalanceMatrix,
  simulateOvertimePolicies,
} from '../../scripts/overtime-balance-simulator';

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

function testLongRunMatrixIsSeededCompleteAndNumeric(): void {
  const first = generateBalanceMatrix();
  const second = generateBalanceMatrix();
  assert.deepEqual(first, second, 'the complete matrix must be reproducible from the documented seed');
  assert.deepEqual(BALANCE_HORIZONS, [7, 30, 60]);
  assert.deepEqual(BALANCE_STATUS_PRECEDENCE, ['FAIL', 'WARN', 'PASS']);
  assert.deepEqual(first.profile, DEFAULT_BALANCE_PROFILE);

  let cellCount = 0;
  for (const days of BALANCE_HORIZONS) {
    const overtime = first.overtime[days];
    assert.deepEqual(Object.keys(overtime), ['ALWAYS', 'NEVER', 'SELECTIVE']);
    assert.equal(overtime.ALWAYS.calendarDays, days);
    assert.equal(overtime.ALWAYS.workdays, days === 7 ? 5 : days === 30 ? 22 : 44);
    assert.equal(overtime.ALWAYS.overtimeDays, overtime.ALWAYS.workdays);
    assert.equal(overtime.NEVER.overtimeDays, 0);
    for (const metrics of Object.values(overtime)) {
      cellCount += 1;
      assert.ok(Number.isFinite(metrics.totalRewards));
      assert.ok(Number.isFinite(metrics.sustainableScore));
      assert.ok(Number.isFinite(metrics.freeOvertimeHours));
    }

    const debt = first.techDebt[days];
    assert.deepEqual(Object.keys(debt), ['RUSH', 'QUALITY', 'BALANCED']);
    for (const metrics of Object.values(debt)) {
      cellCount += 1;
      assert.equal(metrics.calendarDays, days);
      assert.ok(Number.isFinite(metrics.endingAverageDebt));
      assert.ok(Number.isFinite(metrics.incidentCount));
      assert.ok(Number.isFinite(metrics.sustainableScore));
    }

    const personality = first.personality[days];
    assert.deepEqual(Object.keys(personality), ['GRINDER', 'NORMAL', 'SLACKER']);
    for (const metrics of Object.values(personality)) {
      cellCount += 1;
      assert.equal(metrics.calendarDays, days);
      assert.ok(Number.isFinite(metrics.endingMind));
      assert.ok(Number.isFinite(metrics.adRewardSharePercent));
      assert.ok(Number.isFinite(metrics.endingCareerLevel));
    }
  }
  assert.equal(cellCount, 27, '3 horizons x 3 strategies x 3 simulation families');

  // Exact numeric locks prove the CLI/report contains measured values, not bare PASS labels.
  assert.equal(first.overtime[7].ALWAYS.overtimeDays, 5);
  assert.equal(first.overtime[7].ALWAYS.salary, 210);
  assert.equal(first.overtime[7].ALWAYS.freeOvertimeHours, 4);
  assert.equal(first.overtime[7].ALWAYS.sustainableScore, 677.82965);
  assert.equal(first.overtime[30].NEVER.overtimeDays, 0);
  assert.equal(first.overtime[60].SELECTIVE.workdays, 44);
  assert.equal(first.criteria.FREE_OVERTIME.value, 35);
  assert.equal(first.criteria.FREE_OVERTIME.status, 'WARN');

  assert.equal(evaluateBalanceStatus('FREE_OVERTIME', 23), 'PASS');
  assert.equal(evaluateBalanceStatus('FREE_OVERTIME', 24), 'WARN');
  assert.equal(evaluateBalanceStatus('FREE_OVERTIME', 48), 'FAIL');
  assert.equal(evaluateBalanceStatus('MIND_LOCK', 0), 'PASS');
  assert.equal(evaluateBalanceStatus('MIND_LOCK', 1), 'FAIL', 'FAIL wins when warn and fail thresholds overlap');
  assert.equal(evaluateBalanceStatus('CAREER_PACING', 2), 'FAIL');
  assert.equal(evaluateBalanceStatus('CAREER_PACING', 3), 'WARN');
  assert.equal(evaluateBalanceStatus('CAREER_PACING', 5), 'PASS');
  assert.equal(evaluateBalanceStatus('CAREER_PACING', 15), 'WARN');
  assert.equal(evaluateBalanceStatus('CAREER_PACING', 22), 'FAIL');
}

testSeededSimulationIsDeterministicAndNeverUsesAmbientRandomness();
testSelectiveUsesItsOwnBoundedDecisionRule();
testNeverWinsWhenMindIsLowAndInnerDemonIsHigh();
testLongRunMatrixIsSeededCompleteAndNumeric();
console.log('overtime balance simulator tests passed');
