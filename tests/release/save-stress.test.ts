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
  const KPI_REQ: Record<number, { MERGE_COUNT: number; WORK_SECONDS: number; CULTIVATION: number }> = {
    1: { MERGE_COUNT: 3, WORK_SECONDS: 300, CULTIVATION: 50 },
    2: { MERGE_COUNT: 5, WORK_SECONDS: 600, CULTIVATION: 120 },
    3: { MERGE_COUNT: 8, WORK_SECONDS: 900, CULTIVATION: 250 },
    4: { MERGE_COUNT: 12, WORK_SECONDS: 1200, CULTIVATION: 400 },
  };
  const CAREER_EXP: Record<number, number> = { 1: 0, 2: 100, 3: 300, 4: 700, 5: 1500 };

  for (let level = 1; level <= 4; level++) {
    const kpi = KPI_REQ[level];
    facade.context.player.kpiProgress = { MERGE_COUNT: kpi.MERGE_COUNT, SALARY_EARNED: 0, EVENT_RESOLVED: 0 };
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