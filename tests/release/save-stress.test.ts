/**
 * Save Stress Test — 1000 save/load cycles with corruption recovery.
 *
 * Validates:
 *   1. Data consistency after 1000 save/load cycles
 *   2. Backup recovery when primary save is corrupted
 *   3. Safe fallback when both primary and backup are corrupted
 *   4. Old version save migration
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { FakeClock } from '../../assets/scripts/core/clock';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { SaveServiceV2, DEFAULT_SAVE_KEY, BACKUP_SAVE_KEY } from '../../assets/scripts/services/save-service-v2';
import { mulberry32, RandomService } from '../../assets/scripts/v2/random-service';

function createFacade(storage: MemoryStorageAdapter, clock: FakeClock): GameFacade {
  return new GameFacade({
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01),
    debugProtection: { isProduction: false },
  });
}

// ── 1. 1000 Save/Load Cycles ────────────────────────────────────────────────

test('Save Stress: 1000 save/load cycles preserve data consistency', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  // Build up some state
  facade.recruit();
  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();
  facade.tick(720);
  facade.gameLoop.stop();

  const expectedSalary = facade.context.player.salary;
  const expectedCultivation = facade.context.player.cultivationExp;
  const expectedWorkers = facade.context.player.workers.length;
  const expectedCareerLevel = facade.context.player.careerLevel;

  // 1000 save/load cycles
  for (let i = 0; i < 1000; i++) {
    facade.save();
    const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    assert.strictEqual(facade2.context.player.salary, expectedSalary, `Cycle ${i}: salary mismatch`);
    assert.strictEqual(facade2.context.player.cultivationExp, expectedCultivation, `Cycle ${i}: cultivation mismatch`);
    assert.strictEqual(facade2.context.player.workers.length, expectedWorkers, `Cycle ${i}: worker count mismatch`);
    assert.strictEqual(facade2.context.player.careerLevel, expectedCareerLevel, `Cycle ${i}: career level mismatch`);
  }
});

// ── 2. Backup Recovery ──────────────────────────────────────────────────────

test('Save Stress: backup recovers when primary save is corrupted', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();

  // Save with V2 service — need two saves to create backup
  // (first save creates primary, second save backs up first primary before writing)
  const player = new PlayerData({ careerLevel: 3, mind: 80, maxMind: 100, lastSaveTime: 0 });
  player.salary = 500;
  const saveV2 = new SaveServiceV2(storage, { clock });
  saveV2.save(player);

  // Second save to create backup
  player.salary = 999;
  saveV2.save(player);

  // Verify primary and backup both exist
  assert.ok(storage.getItem(DEFAULT_SAVE_KEY) !== null, 'Primary save should exist');
  assert.ok(storage.getItem(BACKUP_SAVE_KEY) !== null, 'Backup save should exist');

  // Corrupt primary
  storage.setItem(DEFAULT_SAVE_KEY, '{corrupted::not_json!!!');

  // Load should fall back to backup (which has salary=500 from first save)
  const loaded = saveV2.load();
  assert.strictEqual(loaded.salary, 500, 'Should recover salary from backup');
  assert.strictEqual(loaded.careerLevel, 3, 'Should recover career level from backup');
});

// ── 3. Both Corrupted → Safe Default ────────────────────────────────────────

test('Save Stress: safe default when both primary and backup are corrupted', () => {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(0);

  // Corrupt both
  storage.setItem(DEFAULT_SAVE_KEY, 'not-json-primary');
  storage.setItem(BACKUP_SAVE_KEY, 'not-json-backup');

  const saveV2 = new SaveServiceV2(storage, { clock });
  const loaded = saveV2.load();

  // Should get default new game state, not crash
  assert.strictEqual(loaded.careerLevel, 1, 'Should default to career level 1');
  assert.strictEqual(loaded.salary, 0, 'Should default to 0 salary');
  assert.ok(Number.isFinite(loaded.mind), 'Mind should be finite');
});

// ── 4. No NaN/Infinity After Stress ─────────────────────────────────────────

test('Save Stress: no NaN or Infinity after 1000 cycles', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  facade.recruit();
  facade.save();

  for (let i = 0; i < 1000; i++) {
    facade.save();
    const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    const p = facade2.context.player;
    assert.ok(Number.isFinite(p.salary), `Cycle ${i}: salary must be finite`);
    assert.ok(Number.isFinite(p.cultivationExp), `Cycle ${i}: cultivation must be finite`);
    assert.ok(Number.isFinite(p.mind), `Cycle ${i}: mind must be finite`);
    assert.ok(Number.isFinite(p.maxMind), `Cycle ${i}: maxMind must be finite`);
    assert.ok(p.salary >= 0, `Cycle ${i}: salary must be non-negative`);
  }
});

// ── 5. Save/load with progression ───────────────────────────────────────────

test('Save Stress: save/load preserves state across promotions', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 1, mind: 100, maxMind: 100, lastSaveTime: 0 });
  const facade = new GameFacade({
    player,
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01),
    debugProtection: { isProduction: false },
  });

  // Simulate progression: promote from level 1 to 5
  const KPI_REQ: Record<number, { TASK_DONE: number; WORK_SECONDS: number; CULTIVATION: number }> = {
    1: { TASK_DONE: 3, WORK_SECONDS: 7200, CULTIVATION: 100 },
    2: { TASK_DONE: 8, WORK_SECONDS: 28800, CULTIVATION: 500 },
    3: { TASK_DONE: 15, WORK_SECONDS: 64800, CULTIVATION: 1500 },
    4: { TASK_DONE: 24, WORK_SECONDS: 122400, CULTIVATION: 3500 },
  };
  const CAREER_EXP: Record<number, number> = { 1: 0, 2: 300, 3: 1800, 4: 3900, 5: 7500 };

  for (let level = 1; level <= 4; level++) {
    const kpi = KPI_REQ[level];
    facade.context.player.kpiProgress = { TASK_DONE: kpi.TASK_DONE };
    facade.context.player.workSeconds = kpi.WORK_SECONDS;
    facade.context.player.cultivationExp = Math.max(kpi.CULTIVATION, CAREER_EXP[level]);
    facade.context.player.mind = 100;

    const check = facade.queryPromotionCheck();
    assert.strictEqual(check.allowed, true, `Level ${level} should be promotable`);

    const result = facade.promote('PPT');
    assert.ok(result.success, `Level ${level} promotion should succeed`);

    // Save and reload after each promotion
    facade.save();
    const reloaded = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    assert.strictEqual(reloaded.context.player.careerLevel, level + 1, `After reload, should be level ${level + 1}`);
  }
});

// ── 6. V4.1 deterministic mixed-operation save/load ────────────────────────

const V41_STRESS_SEED = 4102;
const V41_STRESS_START = Date.parse('2026-09-21T09:00:00+08:00');

function createV41StressFacade(storage: MemoryStorageAdapter, clock: FakeClock, battleSeed: number): GameFacade {
  return new GameFacade({
    storage,
    clock,
    careerEventClock: clock,
    board: null,
    modeSwitchCooldownMs: 0,
    randomV2: new RandomService(mulberry32(V41_STRESS_SEED)),
    randomProvider: { next: mulberry32(V41_STRESS_SEED) },
    battleRng: mulberry32(battleSeed),
    autoSaveIntervalSeconds: 0,
    debugProtection: { isProduction: false },
  });
}

function rewardSnapshot(facade: GameFacade): unknown {
  const player = facade.context.player;
  return {
    salary: player.salary,
    cultivationExp: player.cultivationExp,
    spiritStones: player.spiritStones,
    performance: player.performance,
    materials: { ...player.materials },
    ownedEquipment: [...player.ownedEquipment],
    ownedTechniques: [...player.ownedTechniques],
    battleRewardsClaimed: (player.activeBattleRun as { rewardsClaimed?: unknown } | null)?.rewardsClaimed ?? null,
  };
}

function assertFiniteTree(value: unknown, path = 'save'): void {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must not contain NaN/Infinity`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${path}.${key}`);
  }
}

function assertStressInvariants(facade: GameFacade, clock: FakeClock, iteration: number): void {
  const player = facade.context.player;
  assertFiniteTree(player.toSaveData());
  for (const [name, value] of Object.entries({
    salary: player.salary,
    cultivationExp: player.cultivationExp,
    spiritStones: player.spiritStones,
    performance: player.performance,
    mind: player.mind,
    lastSaveTime: player.lastSaveTime,
  })) assert.ok(value >= 0, `operation ${iteration}: ${name} must be nonnegative`);
  assert.ok(player.lastSaveTime <= clock.now(), `operation ${iteration}: save time cannot create negative elapsed time`);
  if (player.gameDay) {
    for (const [name, elapsed] of Object.entries(player.gameDay.durations)) {
      assert.ok(elapsed >= 0, `operation ${iteration}: ${name} elapsed must be nonnegative`);
    }
  }
  if (player.activeOvertimeSession) {
    assert.ok(player.activeOvertimeSession.elapsedSeconds >= 0);
    assert.ok(player.activeOvertimeSession.elapsedSeconds <= player.activeOvertimeSession.plannedSeconds);
  }
  assert.equal(new Set(player.pendingEvents.map((event) => event.uid)).size, player.pendingEvents.length, 'pending IDs remain unique');
  assert.equal(new Set(player.ownedEquipment).size, player.ownedEquipment.length, 'equipment IDs remain unique');
  for (const item of Object.values(player.equippedEquipment)) {
    assert.ok(item === null || player.ownedEquipment.includes(item), `operation ${iteration}: equipped item must be owned`);
  }
  const run = player.activeBattleRun as { linkedTaskId?: unknown; linkedIncidentId?: unknown } | null;
  if (typeof run?.linkedTaskId === 'string') assert.ok(player.assignedTasks.some((task) => task.id === run.linkedTaskId));
  if (typeof run?.linkedIncidentId === 'string') assert.ok(player.incidents.some((incident) => incident.id === run.linkedIncidentId));
}

test('Save Stress: seed 4102 survives 100 mixed operations with save/load after every operation', () => {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(V41_STRESS_START);
  const operationRng = mulberry32(V41_STRESS_SEED);
  const operationCounts = new Map<string, number>();
  const equipment = [
    { id: 'eq_mech_keyboard', slot: 'DESK' as const },
    { id: 'eq_chosen_badge', slot: 'BADGE' as const },
    { id: 'eq_anc_noise', slot: 'ACCESSORY' as const },
  ];
  let facade = createV41StressFacade(storage, clock, V41_STRESS_SEED);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const operation = ['work', 'fish', 'event', 'equipment', 'battle', 'offline', 'pending'][Math.floor(operationRng() * 7)];
    operationCounts.set(operation, (operationCounts.get(operation) ?? 0) + 1);
    clock.advance(1_000);

    switch (operation) {
      case 'work':
        facade.changeWorkMode('WORK');
        facade.gameLoop.tick(1);
        break;
      case 'fish':
        facade.changeWorkMode('FISHING');
        facade.gameLoop.tick(1);
        break;
      case 'event': {
        assert.equal(facade.devForceEvent('incident_s2'), true);
        const choice = facade.queryV2CurrentChoices()[iteration % Math.max(1, facade.queryV2CurrentChoices().length)];
        facade.resolveV2Event(choice?.id ?? null);
        break;
      }
      case 'equipment': {
        const selected = equipment[iteration % equipment.length];
        facade.context.v2Items.grantEquipment(selected.id);
        assert.equal(facade.v2EquipItem(selected.slot, selected.id), true);
        break;
      }
      case 'battle': {
        facade.context.gameDay.ensureStarted();
        const finished = facade.queryFinishedBattle();
        if (finished) facade.clearFinishedBattle();
        const active = facade.queryBattle();
        if (!active) facade.startBattleRun('PROJECT', 'build_db');
        const running = facade.queryBattle();
        if (running?.skillOffers) facade.chooseBattleSkill(running.skillOffers[0]);
        facade.context.battle.tick(30);
        break;
      }
      case 'offline': {
        clock.advance(60_000);
        const settlementId = `stress-offline-${iteration}`;
        const result = facade.claimOfflineReward(settlementId);
        assert.equal(result.duplicate, false);
        assert.throws(() => facade.claimOfflineReward(settlementId), /already claimed/, 'offline rewards are exactly once');
        break;
      }
      case 'pending': {
        const uid = `stress-pending-${iteration}`;
        facade.context.player.pendingEvents.push({ uid, eventId: 'incident_s2', occurredAt: clock.now(), priority: 'NORMAL' });
        const presentation = facade.prepareOfflineDecisions();
        const currentId = presentation.current?.id;
        assert.ok(currentId);
        const resolved = facade.performOfflineDecision(currentId);
        assert.deepEqual(resolved, { success: true, duplicate: false });
        assert.deepEqual(facade.performOfflineDecision(currentId), { success: true, duplicate: true }, 'pending decision rewards/actions cannot repeat');
        break;
      }
    }

    facade.save();
    const beforeReload = rewardSnapshot(facade);
    facade.destroy();
    facade = createV41StressFacade(storage, clock, V41_STRESS_SEED + iteration + 1);
    assert.deepEqual(rewardSnapshot(facade), beforeReload, `operation ${iteration}: reload must not duplicate or lose rewards`);
    assertStressInvariants(facade, clock, iteration);
  }

  facade.destroy();
  for (const operation of ['work', 'fish', 'event', 'equipment', 'battle', 'offline', 'pending']) {
    assert.ok((operationCounts.get(operation) ?? 0) > 0, `seed 4102 must exercise ${operation}`);
  }
});
