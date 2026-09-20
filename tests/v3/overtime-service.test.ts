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

testNoOvertimeMeansNoActiveSession();
testFreeOvertimeHasNoSalaryAndBuildsFatigue();
testPaidVoluntaryOvertimeTracksCompensation();
console.log('overtime service tests passed');
