import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { RealmService, type RealmConfig, type RealmLayerConfig } from '../../assets/scripts/services/realm-service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function createContext(playerOverrides: Record<string, unknown> = {}): GameContext {
  return new GameContext({
    player: new PlayerData(playerOverrides),
    saveService: new SaveService(new MemoryStorageAdapter()),
  });
}

/** 迷你境界表：凡人(0) → 炼气初期 gate(1) → 炼气中期(2) → 筑基 gate(3) */
const TEST_LAYERS: readonly RealmLayerConfig[] = [
  { index: 0, realmId: 'MORTAL', realmName: '凡人', tier: '初期', name: '凡人', threshold: 0, gate: false, stonesCost: 0, successRate: 0, rewardSalary: 0, cultivationBonus: 0 },
  { index: 1, realmId: 'LIANQI', realmName: '炼气', tier: '初期', name: '炼气初期', threshold: 1000, gate: true, stonesCost: 50, successRate: 0.8, rewardSalary: 100, cultivationBonus: 0.04 },
  { index: 2, realmId: 'LIANQI', realmName: '炼气', tier: '中期', name: '炼气中期', threshold: 2000, gate: false, stonesCost: 0, successRate: 0, rewardSalary: 0, cultivationBonus: 0 },
  { index: 3, realmId: 'ZHUJI', realmName: '筑基', tier: '初期', name: '筑基初期', threshold: 3000, gate: true, stonesCost: 150, successRate: 0.7, rewardSalary: 300, cultivationBonus: 0.04 },
];

const TEST_CONFIG: RealmConfig = { schemaVersion: 1, status: 'TEST', realms: TEST_LAYERS };

// ── Tests ────────────────────────────────────────────────────────────────────

function testDerivesLayerFromCultivationExp(): void {
  const ctx = createContext({ cultivationExp: 0 });
  const realm = new RealmService(ctx, TEST_CONFIG);
  assert.equal(realm.getState().layerIndex, 0);
  assert.equal(realm.getState().name, '凡人');
  const mid = createContext({ cultivationExp: 2100 });
  const s = new RealmService(mid, TEST_CONFIG).getState();
  // 2100 已过炼气初期 gate(1000) 但未通过 → TRIBULATION_PENDING，停在凡人
  assert.equal(s.layerIndex, 0);
  assert.equal(s.status, 'TRIBULATION_PENDING');
  assert.equal(s.pendingGateIndex, 1);
  console.log('✔ Realm: layer derives from exp; unpassed gate -> TRIBULATION_PENDING');
}

function testAutoAdvanceThroughNonGateLayers(): void {
  // 通过炼气 gate 后，2000 修为自动到炼气中期（非 gate 层无渡劫）
  const ctx = createContext({ cultivationExp: 2100, lifetimeStats: { 'realmGatePassed:1': 1 } });
  const realm = new RealmService(ctx, TEST_CONFIG);
  const s = realm.getState();
  assert.equal(s.layerIndex, 2);
  assert.equal(s.name, '炼气中期');
  assert.equal(s.status, 'STABLE');
  console.log('✔ Realm: non-gate layers auto-advance once gate passed');
}

function testBreakthroughSuccessConsumesStonesAndPersists(): void {
  const ctx = createContext({ cultivationExp: 2100, spiritStones: 100 });
  const realm = new RealmService(ctx, TEST_CONFIG, { randomProvider: new SequenceRandomProvider([0.1]) }); // 0.1 < 0.8 成功
  const result = realm.breakthrough();
  assert.equal(result.success, true);
  assert.equal(result.gateIndex, 1);
  assert.equal(result.rewardSalary, 100);
  assert.equal(ctx.player.spiritStones, 50); // 100-50
  assert.equal(ctx.player.lifetimeStats['realmGatePassed:1'], 1);
  assert.equal(ctx.player.lifetimeStats.realmHighestReached, 1);
  assert.equal(ctx.player.salary, 100); // 奖励入账
  // 突破后 gate 通过 → 2100 修为自动越过非 gate 层至炼气中期
  assert.equal(realm.getState().layerIndex, 2);
  assert.equal(realm.getState().name, '炼气中期');
  console.log('✔ Realm: breakthrough success consumes stones, persists gate, pays reward');
}

function testBreakthroughFailureCostsStonesAddsCompensation(): void {
  const ctx = createContext({ cultivationExp: 2100, spiritStones: 100 });
  const realm = new RealmService(ctx, TEST_CONFIG, { randomProvider: new SequenceRandomProvider([0.9]) }); // 0.9 >= 0.8 失败
  const result = realm.breakthrough();
  assert.equal(result.success, false);
  assert.equal(result.reason, '渡劫失败，道心不减');
  assert.equal(ctx.player.spiritStones, 50); // 材料消耗
  assert.equal(ctx.player.lifetimeStats['realmGateFails:1'], 1);
  assert.equal(ctx.player.lifetimeStats['realmGatePassed:1'], undefined);
  assert.equal(ctx.player.cultivationExp, 2100); // 不损失修为
  // 补偿：0.8+0.05=0.85；第二次掷 0.84 < 0.85 成功（越挫越勇生效）
  const realm2 = new RealmService(ctx, TEST_CONFIG, { randomProvider: new SequenceRandomProvider([0.84]) });
  const result2 = realm2.breakthrough();
  assert.equal(result2.success, true, '第二次突破 0.84 < 0.85 应成功（失败补偿）');
  console.log('✔ Realm: failure costs stones, keeps exp, +5%/fail compensation works');
}

function testBreakthroughRequiresStones(): void {
  const ctx = createContext({ cultivationExp: 2100, spiritStones: 10 });
  const realm = new RealmService(ctx, TEST_CONFIG);
  const result = realm.breakthrough();
  assert.equal(result.success, false);
  assert.equal(result.reason, '灵石不足');
  assert.equal(ctx.player.spiritStones, 10);
  console.log('✔ Realm: insufficient stones rejected without consumption');
}

function testSecondGateBlocksUntilPassed(): void {
  const ctx = createContext({ cultivationExp: 3200, lifetimeStats: { 'realmGatePassed:1': 1 } });
  const realm = new RealmService(ctx, TEST_CONFIG);
  const s = realm.getState();
  // 3200 > 筑基 gate(3000)，但炼气 gate 已过 → 炼气中期(2) 修为满，停在于筑基 gate(3)
  assert.equal(s.layerIndex, 2);
  assert.equal(s.pendingGateIndex, 3);
  console.log('✔ Realm: second gate blocks at its own threshold');
}

function testInvalidConfigThrows(): void {
  assert.throws(() => new RealmService(createContext(), { schemaVersion: 1, status: 'x', realms: [] }), /at least one layer/);
  const bad: RealmLayerConfig[] = [
    { index: 0, realmId: 'a', realmName: 'a', tier: '', name: 'a', threshold: 100, gate: false, stonesCost: 0, successRate: 0, rewardSalary: 0, cultivationBonus: 0 },
    { index: 1, realmId: 'b', realmName: 'b', tier: '', name: 'b', threshold: 50, gate: false, stonesCost: 0, successRate: 0, rewardSalary: 0, cultivationBonus: 0 },
  ];
  assert.throws(() => new RealmService(createContext(), { schemaVersion: 1, status: 'x', realms: bad }), /strictly increasing/);
  const badGate: RealmLayerConfig[] = [
    { index: 0, realmId: 'a', realmName: 'a', tier: '', name: 'a', threshold: 0, gate: true, stonesCost: 10, successRate: 1.5, rewardSalary: 0, cultivationBonus: 0 },
  ];
  assert.throws(() => new RealmService(createContext(), { schemaVersion: 1, status: 'x', realms: badGate }), /successRate/);
  console.log('✔ Realm: invalid config rejected at construction');
}

function testRealConfigLoads30Layers(): void {
  const realmConfig = require('../../assets/configs/realm.json') as RealmConfig;
  const ctx = createContext();
  const realm = new RealmService(ctx, realmConfig);
  assert.equal(realm.allLayers.length, 30);
  const gates = realm.allLayers.filter((l) => l.gate);
  assert.equal(gates.length, 9);
  assert.equal(realm.getState().layerIndex, 0);
  console.log('✔ Realm: production config loads 30 layers / 9 gates');
}

// ── Run ──────────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testDerivesLayerFromCultivationExp,
  testAutoAdvanceThroughNonGateLayers,
  testBreakthroughSuccessConsumesStonesAndPersists,
  testBreakthroughFailureCostsStonesAddsCompensation,
  testBreakthroughRequiresStones,
  testSecondGateBlocksUntilPassed,
  testInvalidConfigThrows,
  testRealConfigLoads30Layers,
];

for (const test of tests) test();
console.log(`\nRealmService: ${tests.length}/${tests.length} tests passed`);
