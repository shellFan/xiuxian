import assert from 'node:assert/strict';
import { SaveLoadError, SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const NOW = 1_800_000_000_000;

function loadRaw(raw: unknown): { data: ReturnType<SaveService['load']>; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  storage.setItem('game-save', JSON.stringify(raw));
  const data = new SaveService(storage, 'game-save', () => NOW).load();
  return { data, storage };
}

function baseline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    saveVersion: 13,
    salary: 0,
    cultivationExp: 0,
    careerLevel: 1,
    mind: 100,
    maxMind: 100,
    performance: 0,
    workSeconds: 0,
    fishingSeconds: 0,
    cultivatingSeconds: 0,
    socialSeconds: 0,
    professionExp: 0,
    ownedTechniques: [],
    ownedEquipment: [],
    activeTasks: [],
    incidents: [],
    relationships: {},
    unlockedAchievementIds: [],
    dailyHistory: [],
    ...overrides,
  };
}

const tests: Array<[string, () => void]> = [
  ['empty save routes a new player to character creation', () => {
    const storage = new MemoryStorageAdapter();
    const data = new SaveService(storage, 'game-save', () => NOW).load();
    assert.equal(data.characterSetupStatus, 'CREATION_REQUIRED');
  }],
  ['pristine v13 save without a profession still routes to creation', () => {
    const { data } = loadRaw(baseline());
    assert.equal(data.saveVersion, 15);
    assert.equal(data.profession, undefined);
    assert.equal(data.characterSetupStatus, 'CREATION_REQUIRED');
  }],
  ['established v13 save without a profession routes to non-blocking backfill and keeps progress', () => {
    const original = baseline({ salary: 24_680, careerLevel: 7, workSeconds: 30_000, spiritStones: 91 });
    const { data } = loadRaw(original);
    assert.equal(data.profession, undefined);
    assert.equal(data.salary, 24_680);
    assert.equal(data.careerLevel, 7);
    assert.equal(data.workSeconds, 30_000);
    assert.equal(data.spiritStones, 91);
    assert.equal(data.characterSetupStatus, 'BACKFILL_REQUIRED');
  }],
  ['established v13 profession keeps profession and items without starter-kit migration', () => {
    const original = baseline({ profession: 'QA', careerLevel: 4, ownedTechniques: ['legacy-tech'], ownedEquipment: ['legacy-eq'], materials: { cons_coffee: 9 } });
    const { data } = loadRaw(original);
    assert.equal(data.profession, 'QA');
    assert.deepEqual(data.ownedTechniques, ['legacy-tech']);
    assert.deepEqual(data.ownedEquipment, ['legacy-eq']);
    assert.deepEqual(data.materials, { cons_coffee: 9 });
    assert.equal(data.characterSetupStatus, 'BACKFILL_REQUIRED');
  }],
  ['legacy profession migration remains authoritative while marking V59 backfill', () => {
    const { data } = loadRaw({ ...baseline({ careerLevel: 2 }), saveVersion: 9, salary: 120 });
    assert.equal(data.profession, 'JAVA_BACKEND');
    assert.equal(data.characterSetupStatus, 'BACKFILL_REQUIRED');
  }],
  ['reloading an established save does not repeat or erase the backfill status', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify(baseline({ salary: 500, characterSetupStatus: 'BACKFILL_REQUIRED' })));
    const service = new SaveService(storage, 'game-save', () => NOW);
    assert.equal(service.load().characterSetupStatus, 'BACKFILL_REQUIRED');
    assert.equal(service.load().characterSetupStatus, 'BACKFILL_REQUIRED');
    assert.equal(JSON.parse(storage.getItem('game-save') ?? '{}').salary, 500);
  }],
  ['V5.9-L creation attributes survive migration while legacy attributes remain compatible', () => {
    const creation = { insight: 88, constitution: 50, perception: 69, fortune: 77, willpower: 60 };
    const created = loadRaw(baseline({
      destinyId: 'LABOR_SAINT', innateAttributes: creation, earnedAttributeDelta: {},
      characterSetupStatus: 'COMPLETE', characterCreationReceipt: 'V59A_CREATE_V1:42:A',
    })).data;
    assert.deepEqual(created.innateAttributes, creation);
    assert.equal(created.characterSetupStatus, 'COMPLETE');

    const legacy = { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 };
    const old = loadRaw(baseline({
      destinyId: 'LABOR_SAINT', innateAttributes: legacy, earnedAttributeDelta: {},
      characterSetupStatus: 'COMPLETE', characterCreationReceipt: 'V59A_CREATE_V1:legacy:A',
    })).data;
    assert.deepEqual(old.innateAttributes, legacy);
    assert.equal(old.characterSetupStatus, 'COMPLETE');
  }],
  ['corrupt persisted save fails closed and leaves raw save untouched', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', '{broken');
    assert.throws(() => new SaveService(storage, 'game-save', () => NOW).load(), SaveLoadError);
    assert.equal(storage.getItem('game-save'), '{broken');
  }],
];

for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

console.log('v59 save migration tests passed');
