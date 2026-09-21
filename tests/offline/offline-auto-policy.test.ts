import assert from 'node:assert/strict';

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

const tests = [
  testNewPlayersDefaultToNormal,
  testAllFourPoliciesRoundTripThroughSaveAndRestart,
  testLegacyPoliciesMigrateToNewValues,
  testMissingAndInvalidPoliciesDefaultToNormal,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('offline auto policy contract tests passed');
