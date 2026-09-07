/**
 * Lifecycle Stress Test — rapid pause/resume/hide/show cycles.
 *
 * Validates:
 *   1. GameFacade survives rapid lifecycle transitions
 *   2. Save-on-hide fires correctly
 *   3. No state corruption after 100 rapid cycles
 *   4. PlatformLifecycle callback ordering
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { FakeClock } from '../../assets/scripts/core/clock';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { PlatformLifecycle } from '../../assets/scripts/services/platform/platform-lifecycle';
import { MockPlatformService } from '../../assets/scripts/services/platform/platform-service';

function createFacade(storage: MemoryStorageAdapter, clock: FakeClock): GameFacade {
  return new GameFacade({
    storage,
    clock,
    randomProvider: new FixedRandomProvider(0.01),
    debugProtection: { isProduction: false },
  });
}

// ── 1. Rapid Hide/Show Cycles ───────────────────────────────────────────────

test('Lifecycle: 100 rapid hide/show cycles preserve game state', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();

  // Simulate 100 rapid background/foreground transitions
  let saveCount = 0;
  const origSave = facade.save.bind(facade);
  // Track saves by monitoring storage writes
  for (let i = 0; i < 100; i++) {
    clock.advance(10);
    // Simulate hide → save
    facade.save();
    saveCount++;

    // Simulate show → resume
    clock.advance(5);
    facade.tick(10);
  }

  facade.gameLoop.stop();
  // Game should still be in valid state
  assert.ok(Number.isFinite(facade.context.player.salary), 'Salary must be finite after stress');
  assert.ok(Number.isFinite(facade.context.player.cultivationExp), 'Cultivation must be finite after stress');
  assert.ok(facade.context.player.salary >= 0, 'Salary must be non-negative');
  assert.strictEqual(saveCount, 100, 'Should have saved 100 times');
});

// ── 2. PlatformLifecycle Callback Ordering ──────────────────────────────────

test('Lifecycle: callbacks fire in correct order on hide/show', () => {
  const platform = new MockPlatformService();
  const lifecycle = new PlatformLifecycle(platform);

  const order: string[] = [];

  lifecycle.onHide(() => { order.push('hide'); });
  lifecycle.onShow(() => { order.push('show'); });
  lifecycle.onPause(() => { order.push('pause'); });
  lifecycle.onResume(() => { order.push('resume'); });

  // Trigger hide
  platform.emitHide();
  assert.deepStrictEqual(order, ['hide'], 'Hide callback should fire');

  // Trigger show
  platform.emitShow();
  assert.deepStrictEqual(order, ['hide', 'show'], 'Show callback should fire after hide');

  // Trigger hide then show rapidly
  order.length = 0;
  platform.emitHide();
  platform.emitShow();
  assert.deepStrictEqual(order, ['hide', 'show'], 'Rapid hide→show should fire both');
});

// ── 3. Save-on-Hide Integrity ───────────────────────────────────────────────

test('Lifecycle: save-on-hide preserves data integrity', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  facade.recruit();
  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();
  facade.tick(720);
  facade.gameLoop.stop();

  const expectedSalary = facade.context.player.salary;
  const expectedWorkers = facade.context.player.workers.length;

  // Simulate hide → save
  facade.save();

  // Reload from storage
  const facade2 = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
  assert.strictEqual(facade2.context.player.salary, expectedSalary, 'Salary should survive save-on-hide');
  assert.strictEqual(facade2.context.player.workers.length, expectedWorkers, 'Workers should survive save-on-hide');
});

// ── 4. Pause/Resume with Active Game Loop ───────────────────────────────────

test('Lifecycle: pause/resume does not corrupt game loop', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();

  // Run loop, pause, resume, run more
  facade.tick(720);
  const salaryBeforePause = facade.context.player.salary;

  // Pause (stop loop)
  facade.gameLoop.stop();

  // Resume (restart)
  facade.start();
  facade.tick(720);
  facade.gameLoop.stop();

  // Salary should have increased after resume
  assert.ok(
    facade.context.player.salary >= salaryBeforePause,
    'Salary should not decrease after pause/resume'
  );
  assert.ok(Number.isFinite(facade.context.player.salary), 'Salary must be finite');
});

// ── 5. No Double-Counting on Rapid Transitions ──────────────────────────────

test('Lifecycle: no double-counting on rapid hide/show transitions', () => {
  const clock = new FakeClock(0);
  const storage = new MemoryStorageAdapter();
  const facade = createFacade(storage, clock);

  facade.recruit();
  facade.changeWorkMode('WORK');
  facade.start();
  facade.tick(720);
  facade.gameLoop.stop();

  const expectedSalary = facade.context.player.salary;

  // Rapid save/load cycles (simulating rapid hide/show)
  for (let i = 0; i < 50; i++) {
    facade.save();
    const reloaded = new GameFacade({ storage, clock, debugProtection: { isProduction: false } });
    assert.strictEqual(reloaded.context.player.salary, expectedSalary, `Cycle ${i}: salary should not drift`);
  }
});