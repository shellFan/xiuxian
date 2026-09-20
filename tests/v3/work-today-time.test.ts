import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { CURRENT_SAVE_VERSION, type GameDayState } from '../../assets/scripts/model/save-data';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { DEFAULT_SAVE_KEY, SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { WorkTodayService } from '../../assets/scripts/v3/work-today-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function makeStartedDay(hour = 9, minute = 0) {
  const clock = new FakeClock(at(21, 9));
  const player = new PlayerData({ lastSaveTime: clock.now(), workMode: 'WORK' });
  const context = new GameContext({
    player,
    storage: new MemoryStorageAdapter(),
    clock,
    board: null,
  });
  context.gameDay.ensureStarted();
  clock.set(at(hour === 0 ? 22 : 21, hour, minute));
  return { clock, context, workToday: new WorkTodayService(player, context.clockV2, context.gameDay) };
}

function testClockBoundariesAndConservation(): void {
  const cases = [
    { hour: 9, minute: 0, countdown: 9 * 3600, standard: 0, lunch: 0, overtime: 0, allocated: 0 },
    { hour: 12, minute: 0, countdown: 6 * 3600, standard: 3 * 3600, lunch: 0, overtime: 0, allocated: 3 * 3600 },
    { hour: 13, minute: 0, countdown: 5 * 3600, standard: 3 * 3600, lunch: 3600, overtime: 0, allocated: 4 * 3600 },
    { hour: 17, minute: 30, countdown: 30 * 60, standard: 7.5 * 3600, lunch: 3600, overtime: 0, allocated: 8.5 * 3600 },
    { hour: 17, minute: 55, countdown: 5 * 60, standard: 7 * 3600 + 55 * 60, lunch: 3600, overtime: 0, allocated: 8 * 3600 + 55 * 60 },
    { hour: 17, minute: 59, countdown: 60, standard: 7 * 3600 + 59 * 60, lunch: 3600, overtime: 0, allocated: 8 * 3600 + 59 * 60 },
    { hour: 18, minute: 0, countdown: 0, standard: 8 * 3600, lunch: 3600, overtime: 0, allocated: 9 * 3600 },
    { hour: 20, minute: 0, countdown: 0, standard: 8 * 3600, lunch: 3600, overtime: 2 * 3600, allocated: 11 * 3600 },
    { hour: 23, minute: 59, countdown: 0, standard: 8 * 3600, lunch: 3600, overtime: 5 * 3600 + 59 * 60, allocated: 14 * 3600 + 59 * 60 },
    { hour: 0, minute: 0, countdown: 0, standard: 8 * 3600, lunch: 3600, overtime: 6 * 3600, allocated: 15 * 3600 },
  ] as const;

  for (const item of cases) {
    const { context, workToday } = makeStartedDay(item.hour, item.minute);
    const before = JSON.stringify(context.player.toSaveData());
    const snapshot = workToday.snapshot();
    assert.equal(snapshot.countdownMs, item.countdown * 1000, `${item.hour}:${item.minute} countdown`);
    assert.equal(snapshot.standardWorkSeconds, item.standard, `${item.hour}:${item.minute} standard`);
    assert.equal(snapshot.overtimeSeconds, item.overtime, `${item.hour}:${item.minute} overtime`);
    assert.equal(snapshot.freeOvertimeSeconds, 0);
    assert.equal(snapshot.paidFishingSalary, 0);
    assert.equal(snapshot.allocatedSeconds, item.allocated, `${item.hour}:${item.minute} allocation`);
    assert.equal(snapshot.allocatedSeconds, snapshot.standardWorkSeconds + item.lunch + snapshot.overtimeSeconds);
    assert.equal(JSON.stringify(context.player.toSaveData()), before, 'snapshot must be a pure projection');
  }
}

function testClockPhaseHelpers(): void {
  const at1729 = makeStartedDay(17, 29).context.clockV2;
  const at1730 = makeStartedDay(17, 30).context.clockV2;
  const at1759 = makeStartedDay(17, 59).context.clockV2;
  const at1800 = makeStartedDay(18).context.clockV2;
  const at2000 = makeStartedDay(20).context.clockV2;
  const at2359 = makeStartedDay(23, 59).context.clockV2;
  const at0000 = makeStartedDay(0).context.clockV2;
  assert.equal(at1729.isPreOffWorkRiskWindow(), false);
  assert.equal(at1730.isPreOffWorkRiskWindow(), true);
  assert.equal(at1759.isPreOffWorkRiskWindow(), true);
  assert.equal(at1800.isPreOffWorkRiskWindow(), false);
  assert.equal(at1800.isOvertimeWindow(), true);
  assert.equal(at2000.isNightShift(), true);
  assert.equal(at2359.isOvertimeWindow(), true);
  assert.equal(at0000.isNightShift(), true);
  assert.equal(at0000.isMidnight(), true);
}

function testTransitionAndEventIntervalsAreRecordedOnce(): void {
  const { clock, context, workToday } = makeStartedDay(9);
  clock.set(at(21, 10));
  context.gameDay.transitionMode('FISHING');
  clock.set(at(21, 10, 30));
  context.gameDay.recordEventInterval('MEETING', 'daily-sync', at(21, 10), at(21, 10, 30));
  clock.set(at(21, 11));

  const first = workToday.snapshot();
  const second = workToday.snapshot();
  assert.equal(first.allocatedSeconds, 2 * 3600);
  assert.equal(first.standardWorkSeconds, 2 * 3600);
  assert.equal(first.durations.work, 3600);
  assert.equal(first.durations.fishing, 30 * 60);
  assert.equal(first.durations.meeting, 30 * 60);
  assert.equal(first.timeline.filter((entry) => entry.kind === 'MODE_TRANSITION').length, 1);
  assert.equal(first.timeline.filter((entry) => entry.eventId === 'daily-sync').length, 1);
  assert.deepEqual(second, first, 'repeated projections must not append per-frame history');
}

function testFreeOvertimeAndSettlementInputProjection(): void {
  const { clock, context, workToday } = makeStartedDay(18);
  context.gameDay.setOvertimeState('REQUESTED', 'ACTIVE', true);
  context.gameDay.recordSettlementInput({ paidFishingSalary: 88 });
  clock.set(at(21, 20));
  const snapshot = workToday.snapshot();
  assert.equal(snapshot.overtimeSeconds, 2 * 3600);
  assert.equal(snapshot.freeOvertimeSeconds, 2 * 3600);
  assert.equal(snapshot.paidFishingSalary, 88);
  assert.equal(context.player.gameDay?.overtimeSource, 'REQUESTED');
  assert.equal(context.player.gameDay?.overtimeStatus, 'ACTIVE');
}

function testCrossMidnightOwnershipSurvivesRestartAndRetries(): void {
  const { clock, context } = makeStartedDay(23, 59);
  const first = context.gameDay.current();
  assert.ok(first);
  const originalStartedAt = first.startedAt;
  clock.set(at(22, 0));
  assert.equal(context.gameDay.ensureStarted().startedAt, originalStartedAt);
  assert.equal(context.gameDay.ensureStarted().dayIndex, 1, 'retry remains idempotent after midnight');

  const reloadedPlayer = new PlayerData(context.player.toSaveData());
  const restarted = new GameContext({
    player: reloadedPlayer,
    storage: new MemoryStorageAdapter(),
    clock,
    board: null,
  });
  assert.equal(restarted.gameDay.ensureStarted().startedAt, originalStartedAt, 'restart keeps originating game day');
  restarted.gameDay.markSettled();
  clock.set(at(22, 9));
  const next = restarted.gameDay.ensureStarted();
  assert.equal(next.dayIndex, 2);
  assert.equal(next.startedAt, at(22, 9));
}

function testV6MigrationAndImmutableRoundTrip(): void {
  assert.equal(CURRENT_SAVE_VERSION, 7);
  const storage = new MemoryStorageAdapter();
  const v6Day = {
    dayIndex: 4,
    weekday: 1,
    startedAt: at(21, 9),
    settled: false,
    durations: { work: 10, fishing: 20, cultivating: 30, social: 40, meeting: 50, lunch: 60 },
    income: { salary: 7, cultivation: 8, performance: 9 },
    eventsHandled: 2,
    materialsGained: 3,
    situationIds: ['company-a'],
  };
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ saveVersion: 6, salary: 123, gameDay: v6Day }));
  const loaded = new SaveService(storage).load();
  assert.equal(loaded.saveVersion, 7);
  assert.equal(loaded.salary, 123);
  assert.equal(loaded.compTime, 0);
  assert.deepEqual(loaded.overtimeStats, {
    totalSeconds: 0,
    paidSeconds: 0,
    freeSeconds: 0,
    sessions: 0,
    consecutiveDays: 0,
    longestStreak: 0,
  });
  assert.equal(loaded.gameDay?.durations.incident, 0);
  assert.equal(loaded.gameDay?.durations.overtime, 0);
  assert.equal(loaded.gameDay?.overtimeSource, null);
  assert.equal(loaded.gameDay?.overtimeStatus, 'NONE');
  assert.deepEqual(loaded.gameDay?.eventHistory, []);

  const player = new PlayerData(loaded);
  player.gameDay?.eventHistory.push({ id: 'event-1', kind: 'EVENT', occurredAt: at(21, 10), eventId: 'mail' });
  const serialized = player.toSaveData();
  const day = serialized.gameDay as GameDayState;
  day.eventHistory[0].eventId = 'mutated';
  assert.equal(player.gameDay?.eventHistory[0].eventId, 'mail', 'serialization deeply clones nested V7 state');

  const roundTripStorage = new MemoryStorageAdapter();
  const saveService = new SaveService(roundTripStorage, DEFAULT_SAVE_KEY, () => at(21, 11));
  saveService.save(player);
  const roundTrip = saveService.load();
  assert.deepEqual(roundTrip.overtimeStats, loaded.overtimeStats);
  assert.equal(roundTrip.gameDay?.eventHistory[0].eventId, 'mail');
}

function testInvalidNestedV7StateIsSanitizedWithoutDiscardingSave(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({
    saveVersion: 7,
    salary: 456,
    compTime: -1,
    overtimeStats: { totalSeconds: 'bad', paidSeconds: 5 },
    gameDay: {
      dayIndex: 1,
      weekday: 99,
      startedAt: at(21, 9),
      settled: false,
      durations: { work: -5 },
    },
  }));
  const loaded = new SaveService(storage).load();
  assert.equal(loaded.salary, 456);
  assert.equal(loaded.compTime, 0);
  assert.equal(loaded.overtimeStats?.totalSeconds, 0);
  assert.equal(loaded.gameDay, null);
}

testClockBoundariesAndConservation();
testClockPhaseHelpers();
testTransitionAndEventIntervalsAreRecordedOnce();
testFreeOvertimeAndSettlementInputProjection();
testCrossMidnightOwnershipSurvivesRestartAndRetries();
testV6MigrationAndImmutableRoundTrip();
testInvalidNestedV7StateIsSanitizedWithoutDiscardingSave();
console.log('work today time tests passed');
