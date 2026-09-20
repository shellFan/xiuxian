import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { OvertimeService } from '../../assets/scripts/v3/overtime-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make() {
  const clock = new FakeClock(at(21, 18));
  const context = new GameContext({ player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
  context.gameDay.ensureStarted();
  return { clock, context, overtime: new OvertimeService(context, context.clockV2, context.gameDay) };
}

function testNoOvertimeMeansNoActiveSession(): void {
  const { overtime } = make();
  assert.equal(overtime.canSettleDay(), true);
  assert.equal(overtime.current(), null);
}

function testFreeOvertimeHasNoSalaryAndBuildsFatigue(): void {
  const { overtime, context } = make();
  overtime.offer('REQUESTED', true, 2 * 3600);
  overtime.accept('FISHING');
  overtime.tick(2 * 3600);
  const session = overtime.current();
  assert.ok(session);
  assert.equal(session.free, true);
  assert.equal(session.elapsedSeconds, 2 * 3600);
  assert.equal(context.player.gameDay?.durations.overtime, 2 * 3600);
  assert.equal(context.player.gameDay?.income.salary, 0);
  assert.equal(overtime.fatigue(), 'TIRED');
  assert.equal(overtime.canSettleDay(), false);
  overtime.finish();
  assert.equal(overtime.canSettleDay(), true);
  assert.equal(context.player.overtimeStats.freeSeconds, 2 * 3600);
}

function testPaidVoluntaryOvertimeTracksCompensation(): void {
  const { overtime, context } = make();
  overtime.startVoluntary(3600, true);
  overtime.tick(3600);
  overtime.finish();
  assert.equal(context.player.overtimeStats.paidSeconds, 3600);
  assert.equal(context.player.overtimeStats.totalSeconds, 3600);
  assert.equal(context.player.overtimeStats.sessions, 1);
}

function testMultipleSessionsOnOneWorkdayDoNotIncreaseOvertimeDayStreak(): void {
  const { overtime, context } = make();
  overtime.startVoluntary(1800, true);
  overtime.tick(1800);
  overtime.finish();
  overtime.startVoluntary(1800, true);
  overtime.tick(1800);
  overtime.finish();
  assert.equal(context.player.overtimeStats.sessions, 2);
  assert.equal(context.player.overtimeStats.consecutiveDays, 1, 'two sessions on the same workday count as one overtime day');
  assert.equal(context.player.overtimeStats.longestStreak, 1);
}

function testOvertimeDayStreakPersistsAcrossAdjacentDaysAndResetsAfterAGap(): void {
  const { clock, overtime, context } = make();
  overtime.startVoluntary(60, true);
  overtime.tick(60);
  overtime.finish();
  assert.equal(context.player.lastOvertimeWorkdayStartAt, at(21, 9));

  clock.set(at(22, 18));
  context.player.gameDay = null;
  overtime.startVoluntary(60, true);
  overtime.tick(60);
  overtime.finish();
  assert.equal(context.player.overtimeStats.consecutiveDays, 2);

  clock.set(at(24, 18));
  context.player.gameDay = null;
  overtime.startVoluntary(60, true);
  overtime.tick(60);
  overtime.finish();
  assert.equal(context.player.overtimeStats.consecutiveDays, 1, 'a skipped calendar day resets the active streak');
  assert.equal(context.player.overtimeStats.longestStreak, 2);
  assert.equal(context.player.toSaveData().lastOvertimeWorkdayStartAt, at(24, 9), 'the streak marker survives save serialization');
}

function testNightAndFreeSessionCountersOnlyTrackMatchingSessions(): void {
  const { clock, overtime, context } = make();
  clock.set(at(21, 22));
  overtime.offer('REQUESTED', true, 60);
  overtime.accept('WORK');
  overtime.tick(60);
  overtime.finish();
  assert.equal(context.player.overtimeStats.nightSessions, 1);
  assert.equal(context.player.overtimeStats.freeSessions, 1);

  clock.set(at(22, 18));
  context.player.gameDay = null;
  overtime.startVoluntary(60, true);
  overtime.tick(60);
  overtime.finish();
  assert.equal(context.player.overtimeStats.nightSessions, 1, 'an evening session before 20:00 is not a night session');
  assert.equal(context.player.overtimeStats.freeSessions, 1, 'a paid session is not a free session');
}

function testUnacceptedOrZeroDurationOffersDoNotCountAsCompletedSessions(): void {
  const { clock, overtime, context } = make();
  clock.set(at(21, 22));
  overtime.offer('REQUESTED', true, 60);
  overtime.finish();
  overtime.offer('REQUESTED', true, 60);
  overtime.accept('WORK');
  overtime.finish();
  assert.equal(context.player.overtimeStats.sessions, 0);
  assert.equal(context.player.overtimeStats.freeSessions, 0);
  assert.equal(context.player.overtimeStats.nightSessions, 0);
  assert.equal(context.player.overtimeStats.totalSeconds, 0);
}

testNoOvertimeMeansNoActiveSession();
testFreeOvertimeHasNoSalaryAndBuildsFatigue();
testPaidVoluntaryOvertimeTracksCompensation();
testMultipleSessionsOnOneWorkdayDoNotIncreaseOvertimeDayStreak();
testOvertimeDayStreakPersistsAcrossAdjacentDaysAndResetsAfterAGap();
testNightAndFreeSessionCountersOnlyTrackMatchingSessions();
testUnacceptedOrZeroDurationOffersDoNotCountAsCompletedSessions();
console.log('overtime service tests passed');
