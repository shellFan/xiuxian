import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';

function at(day: number, hour: number): number {
  return new Date(2026, 8, day, hour, 0, 0, 0).getTime();
}

function testOvernightOvertimePersistsExhaustionUntilWeekendRecovery(): void {
  const clock = new FakeClock(at(20, 18)); // Saturday
  const context = new GameContext({ clock, board: null, player: new PlayerData({ lastSaveTime: clock.now() }) });
  context.gameDay.ensureStarted();
  context.overtime.startVoluntary(8 * 3600, false);
  context.overtime.tick(8 * 3600);
  context.overtime.finish();
  assert.equal(context.overtime.fatigue(), 'EXHAUSTED');
  assert.equal(context.player.overtimeFatigue, 'EXHAUSTED');
  context.weekend.choose('SLEEP_MADLY');
  assert.equal(context.overtime.fatigue(), 'RESTED');
  assert.equal(context.player.overtimeFatigue, 'RESTED');
}

function testWeekendOffersVoluntaryOvertimeAsARealSession(): void {
  const clock = new FakeClock(at(20, 18));
  const context = new GameContext({ clock, board: null, player: new PlayerData({ lastSaveTime: clock.now() }) });
  context.gameDay.ensureStarted();
  assert.ok(context.weekend.options().some((option) => option.id === 'VOLUNTARY_OVERTIME'));
  context.weekend.choose('VOLUNTARY_OVERTIME');
  assert.equal(context.overtime.current()?.source, 'WEEKEND');
  assert.equal(context.overtime.current()?.status, 'ACTIVE');
}

testOvernightOvertimePersistsExhaustionUntilWeekendRecovery();
testWeekendOffersVoluntaryOvertimeAsARealSession();
console.log('overtime fatigue weekend tests passed');
