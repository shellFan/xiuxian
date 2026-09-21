import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { CURRENT_SAVE_VERSION, type AutoPolicy } from '../../assets/scripts/model/save-data';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const POLICIES: readonly AutoPolicy[] = ['NORMAL', 'SAFE', 'GRINDER', 'SLACKER'];

function loadRaw(raw: Record<string, unknown>) {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(raw));
  return new SaveService(storage).load();
}

function testNewPlayersDefaultToNormal(): void {
  const player = PlayerData.createDefault();
  assert.equal(player.autoPolicy, 'NORMAL');
  assert.equal(player.toSaveData().autoPolicy, 'NORMAL');
}

function testAllFourPoliciesRoundTripThroughSaveAndRestart(): void {
  for (const autoPolicy of POLICIES) {
    const storage = new MemoryStorageAdapter();
    const service = new SaveService(storage, DEFAULT_SAVE_KEY, () => 100);
    service.save(new PlayerData({ autoPolicy }));

    const restarted = new PlayerData(new SaveService(storage).load());
    assert.equal(restarted.autoPolicy, autoPolicy);
    assert.equal(restarted.toSaveData().autoPolicy, autoPolicy);
  }
}

function testLegacyPoliciesMigrateToNewValues(): void {
  const mappings = [
    ['ALWAYS', 'GRINDER'],
    ['NEVER', 'SLACKER'],
    ['SELECTIVE', 'NORMAL'],
  ] as const;

  for (const [legacy, expected] of mappings) {
    const loaded = loadRaw({ saveVersion: 8, autoPolicy: legacy });
    assert.equal(loaded.saveVersion, CURRENT_SAVE_VERSION);
    assert.equal(loaded.autoPolicy, expected);
    assert.equal(new PlayerData(loaded).toSaveData().autoPolicy, expected);
  }
}

function testMissingAndInvalidPoliciesDefaultToNormal(): void {
  assert.equal(loadRaw({ saveVersion: 8 }).autoPolicy, 'NORMAL');
  assert.equal(loadRaw({ saveVersion: 8, autoPolicy: 'INVALID' }).autoPolicy, 'NORMAL');
  assert.equal(loadRaw({ saveVersion: 8, autoPolicy: null }).autoPolicy, 'NORMAL');
}

const MONDAY_17_SHANGHAI = Date.UTC(2026, 8, 21, 9);

function simulate(
  policy: AutoPolicy,
  options: { readonly free?: boolean; readonly exhausted?: boolean; readonly seconds?: number } = {},
) {
  const seconds = options.seconds ?? 4 * 3600;
  const clock = new FakeClock(MONDAY_17_SHANGHAI + seconds * 1000);
  const player = new PlayerData({
    autoPolicy: policy,
    lastSaveTime: MONDAY_17_SHANGHAI,
    overtimeFatigue: options.exhausted ? 'EXHAUSTED' : 'RESTED',
    activeOvertimeSession: {
      source: 'REQUESTED',
      free: options.free ?? true,
      plannedSeconds: seconds,
      elapsedSeconds: 0,
      mode: null,
      status: 'OFFERED',
      startedAt: null,
    },
  });
  const context = new GameContext({ player, storage: new MemoryStorageAdapter(), clock, board: null });
  return { context, result: context.offline.previewSimulation(`policy-${policy}`) };
}

function testPoliciesChooseDistinctOfflineActivities(): void {
  const normal = simulate('NORMAL').result;
  assert.equal(normal.workSeconds, 3600, 'NORMAL keeps standard work but rejects free overtime');
  assert.equal(normal.freeOvertimeSeconds, 0);

  const safe = simulate('SAFE').result;
  assert.equal(safe.freeOvertimeSeconds, 0, 'SAFE rejects free overtime');
  assert.ok(safe.evidenceGained > normal.evidenceGained, 'SAFE prioritizes evidence');
  assert.ok(safe.technicalDebtDelta < normal.technicalDebtDelta, 'SAFE reduces technical debt');

  const grinder = simulate('GRINDER').result;
  assert.equal(grinder.freeOvertimeSeconds, 2 * 3600, 'GRINDER caps accepted free overtime');
  assert.equal(grinder.overtimeSeconds, grinder.freeOvertimeSeconds);
  assert.equal(grinder.workSeconds, 3 * 3600);

  const slacker = simulate('SLACKER').result;
  assert.equal(slacker.workSeconds, 0, 'SLACKER rejects low-value work and free overtime');
  assert.ok(slacker.fishingSeconds > normal.fishingSeconds);
  assert.equal(slacker.freeOvertimeSeconds, 0);
}

function testGrinderAcceptsPaidOvertimeButStopsWhenExhausted(): void {
  const paid = simulate('GRINDER', { free: false }).result;
  assert.equal(paid.paidOvertimeSeconds, 3 * 3600);
  assert.equal(paid.freeOvertimeSeconds, 0);

  const exhausted = simulate('GRINDER', { exhausted: true }).result;
  assert.equal(exhausted.overtimeSeconds, 0);
  assert.equal(exhausted.freeOvertimeSeconds, 0);
  assert.equal(exhausted.workSeconds, 3600, 'only standard work remains');
}

function testUnifiedProjectionIsCompleteAndMutationFree(): void {
  const { context, result } = simulate('SAFE');
  const before = context.player.toSaveData();
  const again = context.offline.previewSimulation('policy-SAFE');
  const requiredKeys = [
    'elapsedSeconds', 'effectiveSeconds', 'capped', 'salary', 'cultivation', 'performance', 'mindDelta',
    'workSeconds', 'fishingSeconds', 'cultivatingSeconds', 'overtimeSeconds', 'freeOvertimeSeconds',
    'paidOvertimeSeconds', 'eventsAutoResolved', 'pendingDecisionCount', 'incidentsRaised', 'tasksCompleted',
    'technicalDebtDelta', 'evidenceGained', 'lootGained', 'careerProgress', 'policyUsed',
  ] as const;
  for (const key of requiredKeys) assert.ok(key in result, `missing aggregate ${key}`);
  assert.deepEqual(again, result, 'projection is deterministic');
  assert.deepEqual(context.player.toSaveData(), before, 'preview must not mutate player state');
}

const tests = [
  testNewPlayersDefaultToNormal,
  testAllFourPoliciesRoundTripThroughSaveAndRestart,
  testLegacyPoliciesMigrateToNewValues,
  testMissingAndInvalidPoliciesDefaultToNormal,
  testPoliciesChooseDistinctOfflineActivities,
  testGrinderAcceptsPaidOvertimeButStopsWhenExhausted,
  testUnifiedProjectionIsCompleteAndMutationFree,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline auto policy contract tests passed');
