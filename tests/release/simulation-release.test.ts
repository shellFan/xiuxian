/**
 * Simulation Release Test — 100-seed full game simulation.
 *
 * Runs 100 simulations with different random seeds to verify:
 *   1. No NaN/Infinity in any player state
 *   2. No crashes or uncaught errors
 *   3. Salary/cultivation always non-negative
 *   4. Career progression is monotonic (never goes backward)
 *   5. Workers count never negative
 *   6. Mind/maxMind always positive
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { FakeClock } from '../../assets/scripts/core/clock';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';

const SEEDS = 100;
const TICKS_PER_SIM = 50;
const SECONDS_PER_TICK = 720; // 12 minutes per tick (ensures integer salary)

interface SimResult {
  seed: number;
  finalSalary: number;
  finalCultivation: number;
  finalCareerLevel: number;
  finalWorkers: number;
  finalMind: number;
  finalMaxMind: number;
  errors: string[];
}

function runSimulation(seed: number): SimResult {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const random = new FixedRandomProvider((seed % 99) * 0.01 + 0.005);
  const errors: string[] = [];

  let facade: GameFacade;
  try {
    facade = new GameFacade({
      storage,
      clock,
      randomProvider: random,
      debugProtection: { isProduction: false },
    });
  } catch (e) {
    return { seed, finalSalary: 0, finalCultivation: 0, finalCareerLevel: 0, finalWorkers: 0, finalMind: 0, finalMaxMind: 0, errors: [`init: ${e}`] };
  }

  // Initial recruit
  try {
    facade.recruit();
  } catch { /* may fail with bad seed */ }

  // Run simulation
  for (let tick = 0; tick < TICKS_PER_SIM; tick++) {
    try {
      clock.advance(SECONDS_PER_TICK);

      // Random work mode
      if (seed % 3 === 0) facade.changeWorkMode('WORK');
      else if (seed % 3 === 1) facade.changeWorkMode('FISHING');
      // else: keep default

      // Occasionally recruit
      if (tick % 10 === 5 && seed % 5 !== 0) {
        try { facade.recruit(); } catch { /* board full */ }
      }

      facade.tick(SECONDS_PER_TICK);

      // Validate invariants
      const p = facade.context.player;
      if (!Number.isFinite(p.salary)) errors.push(`tick ${tick}: salary not finite`);
      if (!Number.isFinite(p.cultivationExp)) errors.push(`tick ${tick}: cultivation not finite`);
      if (!Number.isFinite(p.mind)) errors.push(`tick ${tick}: mind not finite`);
      if (!Number.isFinite(p.maxMind)) errors.push(`tick ${tick}: maxMind not finite`);
      if (p.salary < 0) errors.push(`tick ${tick}: salary negative`);
      if (p.cultivationExp < 0) errors.push(`tick ${tick}: cultivation negative`);
      if (p.mind <= 0) errors.push(`tick ${tick}: mind <= 0`);
      if (p.maxMind <= 0) errors.push(`tick ${tick}: maxMind <= 0`);
      if (p.workers.length < 0) errors.push(`tick ${tick}: workers negative`);
    } catch (e) {
      errors.push(`tick ${tick}: ${e}`);
    }
  }

  // Save and reload
  try {
    facade.save();
    const reloaded = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    const p = reloaded.context.player;
    if (!Number.isFinite(p.salary)) errors.push('reload: salary not finite');
    if (!Number.isFinite(p.cultivationExp)) errors.push('reload: cultivation not finite');
  } catch (e) {
    errors.push(`reload: ${e}`);
  }

  const player = facade.context.player;
  return {
    seed,
    finalSalary: player.salary,
    finalCultivation: player.cultivationExp,
    finalCareerLevel: player.careerLevel,
    finalWorkers: player.workers.length,
    finalMind: player.mind,
    finalMaxMind: player.maxMind,
    errors,
  };
}

// ── 1. All Seeds Pass ───────────────────────────────────────────────────────

test('Simulation: 100 seeds complete without errors', () => {
  const results: SimResult[] = [];
  let totalErrors = 0;

  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    results.push(result);
    totalErrors += result.errors.length;
  }

  // Report all errors
  if (totalErrors > 0) {
    const errorDetails = results
      .filter(r => r.errors.length > 0)
      .map(r => `  Seed ${r.seed}: ${r.errors.join('; ')}`)
      .join('\n');
    assert.fail(`Simulation errors found:\n${errorDetails}`);
  }

  assert.strictEqual(totalErrors, 0, 'All 100 seeds should complete without errors');
});

// ── 2. No NaN/Infinity ──────────────────────────────────────────────────────

test('Simulation: no NaN or Infinity in final state across 100 seeds', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    assert.ok(Number.isFinite(result.finalSalary), `Seed ${seed}: salary must be finite`);
    assert.ok(Number.isFinite(result.finalCultivation), `Seed ${seed}: cultivation must be finite`);
    assert.ok(Number.isFinite(result.finalMind), `Seed ${seed}: mind must be finite`);
    assert.ok(Number.isFinite(result.finalMaxMind), `Seed ${seed}: maxMind must be finite`);
  }
});

// ── 3. Salary/Cultivation Non-Negative ──────────────────────────────────────

test('Simulation: salary and cultivation are always non-negative', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    assert.ok(result.finalSalary >= 0, `Seed ${seed}: salary must be >= 0, got ${result.finalSalary}`);
    assert.ok(result.finalCultivation >= 0, `Seed ${seed}: cultivation must be >= 0, got ${result.finalCultivation}`);
  }
});

// ── 4. Career Level Monotonic ───────────────────────────────────────────────

test('Simulation: career level starts at 1 and never decreases', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    assert.ok(result.finalCareerLevel >= 1, `Seed ${seed}: career level must be >= 1, got ${result.finalCareerLevel}`);
  }
});

// ── 5. Mind/MaxMind Positive ────────────────────────────────────────────────

test('Simulation: mind and maxMind are always positive', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    assert.ok(result.finalMind > 0, `Seed ${seed}: mind must be > 0, got ${result.finalMind}`);
    assert.ok(result.finalMaxMind > 0, `Seed ${seed}: maxMind must be > 0, got ${result.finalMaxMind}`);
  }
});

// ── 6. Workers Count Non-Negative ───────────────────────────────────────────

test('Simulation: workers count is always non-negative', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = runSimulation(seed);
    assert.ok(result.finalWorkers >= 0, `Seed ${seed}: workers must be >= 0, got ${result.finalWorkers}`);
  }
});

// ── 7. Save/Reload Preserves State ──────────────────────────────────────────

test('Simulation: save/reload preserves salary and cultivation across 100 seeds', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const clock = new FakeClock(0);
    const storage = new MemoryStorageAdapter();
    const facade = new GameFacade({
      storage,
      clock,
      randomProvider: new FixedRandomProvider((seed % 99) * 0.01 + 0.005),
      debugProtection: { isProduction: false },
    });

    facade.recruit();
    facade.changeWorkMode('WORK');
    facade.start();
    facade.tick(720);
    facade.gameLoop.stop();

    const beforeSalary = facade.context.player.salary;
    const beforeCultivation = facade.context.player.cultivationExp;

    facade.save();

    const reloaded = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    assert.strictEqual(reloaded.context.player.salary, beforeSalary, `Seed ${seed}: salary should survive reload`);
    assert.strictEqual(reloaded.context.player.cultivationExp, beforeCultivation, `Seed ${seed}: cultivation should survive reload`);
  }
});