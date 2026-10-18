import assert from 'node:assert/strict';
import { SaveService } from '../../assets/scripts/services/save-service';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const NOW = 1_800_000_000_000;
const SAVE_KEY = 'game-save';

function load(raw: Record<string, unknown>): Record<string, unknown> {
  const storage = new MemoryStorageAdapter();
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return new SaveService(storage, SAVE_KEY, () => NOW).load() as unknown as Record<string, unknown>;
}

function legacySave(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    saveVersion: 14,
    salary: 12_345,
    cultivationExp: 678,
    careerLevel: 4,
    mind: 72,
    maxMind: 100,
    performance: 90,
    spiritStones: 321,
    ownedEquipment: ['old-badge'],
    equippedEquipment: { BADGE: 'old-badge' },
    profession: 'QA',
    ...overrides,
  };
}

const tests: Array<[string, () => void]> = [
  ['legacy migration persists the current schema instead of repeating migration on every load', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem(SAVE_KEY, JSON.stringify(legacySave()));
    const service = new SaveService(storage, SAVE_KEY, () => NOW);
    service.load();
    const migrated = JSON.parse(storage.getItem(SAVE_KEY) ?? '{}') as Record<string, unknown>;
    assert.equal(migrated.saveVersion, 17);
    assert.deepEqual(migrated.rebirthMeta, { karma: 0, talentRanks: {}, unlockedEndings: [], settledRunIds: [] });
    assert.equal(service.load().saveVersion, 17);
  }],
  ['new players serialize independent default fate metadata and save snapshots are deeply cloned', () => {
    const player = new PlayerData({ salary: 450, spiritStones: 9 });
    const saved = player.toSaveData();
    assert.equal(saved.fateRun, null);
    assert.deepEqual(saved.rebirthMeta, { karma: 0, talentRanks: {}, unlockedEndings: [], settledRunIds: [] });
    player.rebirthMeta = { karma: 4, talentRanks: { born_cow: 1 }, unlockedEndings: [], settledRunIds: [] };
    assert.equal(saved.rebirthMeta?.karma, 0);
    assert.deepEqual(saved.rebirthMeta?.talentRanks, {});
    assert.equal(saved.salary, 450);
    assert.equal(saved.spiritStones, 9);
  }],
  ['v14 migration initializes an empty fate run and account rebirth metadata without changing legacy progression', () => {
    const data = load(legacySave());
    assert.equal(data.saveVersion, 17);
    assert.equal(data.fateRun, null);
    assert.deepEqual(data.rebirthMeta, {
      karma: 0,
      talentRanks: {},
      unlockedEndings: [],
      settledRunIds: [],
    });
    assert.equal(data.salary, 12_345);
    assert.equal(data.cultivationExp, 678);
    assert.equal(data.mind, 72);
    assert.equal(data.spiritStones, 321);
    assert.deepEqual(data.ownedEquipment, ['old-badge']);
    assert.deepEqual(data.equippedEquipment, { BADGE: 'old-badge' });
    assert.equal(data.profession, 'QA');
  }],
  ['valid active fate run survives migration and normalizes bounded replay data', () => {
    const data = load(legacySave({
      fateRun: {
        runId: 'run-7', startedAt: NOW - 1_000, seed: 42, status: 'ACTIVE',
        health: 64, maxHealth: 100, stage: 3, eventQueue: ['evt-a', 'evt-a'],
        eventHistory: [{ eventId: 'evt-old', choiceId: 'help', resultId: 'ally', resolvedAt: NOW - 500 }],
        flags: { intern_helped: true }, activeChallengeId: null, terminalOutcomeId: null,
      },
      rebirthMeta: { karma: 8, talentRanks: { born_cow: 2 }, unlockedEndings: ['LAYOFF', 'LAYOFF'], settledRunIds: ['run-1'] },
    }));
    assert.equal((data.fateRun as Record<string, unknown>).runId, 'run-7');
    assert.deepEqual((data.fateRun as Record<string, unknown>).eventQueue, ['evt-a']);
    assert.deepEqual(data.rebirthMeta, {
      karma: 8,
      talentRanks: { born_cow: 2 },
      unlockedEndings: ['LAYOFF'],
      settledRunIds: ['run-1'],
    });
  }],
  ['malformed active run is discarded without damaging established resources', () => {
    const data = load(legacySave({
      fateRun: { runId: '', startedAt: -1, seed: Number.NaN, status: 'ACTIVE', health: -10 },
      rebirthMeta: { karma: -5, talentRanks: { born_cow: 99, unknown: 1 }, unlockedEndings: [null], settledRunIds: ['run-1', 'run-1'] },
    }));
    assert.equal(data.fateRun, null);
    assert.deepEqual(data.rebirthMeta, {
      karma: 0,
      talentRanks: { born_cow: 6 },
      unlockedEndings: [],
      settledRunIds: ['run-1'],
    });
    assert.equal(data.salary, 12_345);
    assert.equal(data.spiritStones, 321);
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok - ${name}`);
}

console.log('v59j fate state tests passed');
