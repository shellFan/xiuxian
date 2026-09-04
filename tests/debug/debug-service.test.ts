import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';

function makeContext(player?: PlayerData): GameContext {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.5]);
  return new GameContext({
    player: player ?? new PlayerData({ mind: 100, maxMind: 100 }),
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
    randomProvider: random,
  });
}

// ── Test: addSalary ──────────────────────────────────────────────────────────

function testAddSalary(): void {
  const context = makeContext();
  assert.equal(context.player.salary, 0);
  context.debug.addSalary(100);
  assert.equal(context.player.salary, 100);
  context.debug.addSalary(50);
  assert.equal(context.player.salary, 150);
}

// ── Test: addSalary rejects invalid ──────────────────────────────────────────

function testAddSalaryRejectsInvalid(): void {
  const context = makeContext();
  assert.throws(() => context.debug.addSalary(-1));
  assert.throws(() => context.debug.addSalary(1.5));
  assert.throws(() => context.debug.addSalary(NaN));
}

// ── Test: addCultivation ─────────────────────────────────────────────────────

function testAddCultivation(): void {
  const context = makeContext();
  assert.equal(context.player.cultivationExp, 0);
  context.debug.addCultivation(200);
  assert.equal(context.player.cultivationExp, 200);
  context.debug.addCultivation(50);
  assert.equal(context.player.cultivationExp, 250);
}

// ── Test: addCultivation rejects invalid ─────────────────────────────────────

function testAddCultivationRejectsInvalid(): void {
  const context = makeContext();
  assert.throws(() => context.debug.addCultivation(-1));
  assert.throws(() => context.debug.addCultivation(1.5));
}

// ── Test: restoreMind ────────────────────────────────────────────────────────

function testRestoreMind(): void {
  const context = makeContext(new PlayerData({ mind: 30, maxMind: 100 }));
  assert.equal(context.player.mind, 30);
  context.debug.restoreMind();
  assert.equal(context.player.mind, 100);
}

// ── Test: zeroMind ───────────────────────────────────────────────────────────

function testZeroMind(): void {
  const context = makeContext(new PlayerData({ mind: 80, maxMind: 100 }));
  context.debug.zeroMind();
  assert.equal(context.player.mind, 0);
}

// ── Test: completeKpi ────────────────────────────────────────────────────────

function testCompleteKpi(): void {
  const context = makeContext();
  // Level 1 KPI: MERGE_COUNT=3, WORK_SECONDS=300, CULTIVATION=50
  assert.equal(context.kpi.isCurrentKpiCompleted(), false);
  context.debug.completeKpi();
  assert.equal(context.kpi.isCurrentKpiCompleted(), true);
}

// ── Test: promote ────────────────────────────────────────────────────────────

function testPromote(): void {
  const context = makeContext();
  assert.equal(context.player.careerLevel, 1);
  context.debug.promote();
  assert.equal(context.player.careerLevel, 2);
  assert.equal(context.player.promotionFailCount, 0);
  // Office should sync
  assert.equal(context.office.getOfficeLevel(), 1); // career 2 → office 1
}

// ── Test: promote multiple times ─────────────────────────────────────────────

function testPromoteMultiple(): void {
  const context = makeContext();
  context.debug.promote();
  context.debug.promote();
  context.debug.promote();
  assert.equal(context.player.careerLevel, 4);
  assert.equal(context.office.getOfficeLevel(), 2); // career 3-4 → office 2
}

// ── Test: simulateOffline ────────────────────────────────────────────────────

function testSimulateOffline(): void {
  const clock = new FakeClock(100_000);
  const context = new GameContext({
    player: new PlayerData({ mind: 100, maxMind: 100 }),
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
  });
  const before = context.player.lastSaveTime;
  context.debug.simulateOffline(3600); // 1 hour
  assert.equal(context.player.lastSaveTime, before - 3600 * 1000);
}

// ── Test: simulateOffline rejects invalid ────────────────────────────────────

function testSimulateOfflineRejectsInvalid(): void {
  const context = makeContext();
  assert.throws(() => context.debug.simulateOffline(0));
  assert.throws(() => context.debug.simulateOffline(-1));
  assert.throws(() => context.debug.simulateOffline(NaN));
}

// ── Test: clearSave ──────────────────────────────────────────────────────────

function testClearSave(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    player: new PlayerData({ mind: 100, maxMind: 100, salary: 500 }),
    storage,
  });
  // Save first
  context.saveService.save(context.player);
  const data = storage.getItem('game-save');
  assert.ok(data);
  // Clear
  context.debug.clearSave();
  const after = storage.getItem('game-save');
  assert.equal(after, null);
}

// ── Test: skipTutorial ───────────────────────────────────────────────────────

function testSkipTutorial(): void {
  const context = makeContext();
  assert.equal(context.tutorial.isCompleted(), false);
  context.debug.skipTutorial();
  assert.equal(context.tutorial.isCompleted(), true);
  assert.equal(context.tutorial.currentStep(), 'NONE');
}

// ── Test: setMaxWorkerLevel ──────────────────────────────────────────────────

function testSetMaxWorkerLevel(): void {
  const context = makeContext();
  assert.equal(context.player.maxWorkerLevel, 0);
  context.debug.setMaxWorkerLevel(3);
  assert.equal(context.player.maxWorkerLevel, 3);
}

// ── Test: setMaxWorkerLevel rejects invalid ──────────────────────────────────

function testSetMaxWorkerLevelRejectsInvalid(): void {
  const context = makeContext();
  assert.throws(() => context.debug.setMaxWorkerLevel(0));
  assert.throws(() => context.debug.setMaxWorkerLevel(-1));
  assert.throws(() => context.debug.setMaxWorkerLevel(1.5));
}

// ── Test: setCareerLevel ─────────────────────────────────────────────────────

function testSetCareerLevel(): void {
  const context = makeContext();
  context.debug.setCareerLevel(5);
  assert.equal(context.player.careerLevel, 5);
  assert.equal(context.office.getOfficeLevel(), 3); // career 5-6 → office 3
}

// ── Test: setCareerLevel rejects invalid ─────────────────────────────────────

function testSetCareerLevelRejectsInvalid(): void {
  const context = makeContext();
  assert.throws(() => context.debug.setCareerLevel(0));
  assert.throws(() => context.debug.setCareerLevel(-1));
}

// ── Test: setWorkMode ────────────────────────────────────────────────────────

function testSetWorkMode(): void {
  const context = makeContext();
  assert.equal(context.player.workMode, 'FISHING');
  context.debug.setWorkMode('WORK', 100);
  assert.equal(context.player.workMode, 'WORK');
  assert.equal(context.player.workSeconds, 100);
}

// ── Test: triggerEvent ───────────────────────────────────────────────────────

function testTriggerEvent(): void {
  const context = makeContext();
  // Should not throw even if no pending event
  context.debug.triggerEvent();
  // Event should be emitted
  const events: Array<{ eventId: string | null; pending: boolean }> = [];
  context.events.on('eventChanged', (e) => events.push(e));
  context.debug.triggerEvent();
  assert.equal(events.length, 1);
  assert.equal(events[0].pending, true);
  assert.ok(typeof events[0].eventId === 'string');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testAddSalary();
testAddSalaryRejectsInvalid();
testAddCultivation();
testAddCultivationRejectsInvalid();
testRestoreMind();
testZeroMind();
testCompleteKpi();
testPromote();
testPromoteMultiple();
testSimulateOffline();
testSimulateOfflineRejectsInvalid();
testClearSave();
testSkipTutorial();
testSetMaxWorkerLevel();
testSetMaxWorkerLevelRejectsInvalid();
testSetCareerLevel();
testSetCareerLevelRejectsInvalid();
testSetWorkMode();
testTriggerEvent();

console.log('debug service tests passed');