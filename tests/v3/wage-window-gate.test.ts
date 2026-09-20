import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';

function at(hour: number, minute = 0): number {
  return new Date(2026, 8, 21, hour, minute, 0, 0).getTime();
}

function contextAt(hour: number): GameContext {
  const clock = new FakeClock(at(hour));
  return new GameContext({ board: null, clock, player: new PlayerData({ lastSaveTime: clock.now(), workMode: 'WORK' }) });
}

function testLunchAndOffWorkDoNotAccrueOrdinaryWages(): void {
  for (const hour of [12, 18]) {
    const context = contextAt(hour);
    const result = context.work.tick(3600);
    assert.deepEqual(result, { salary: 0, cultivationExp: 0, mind: 0, elapsedSeconds: 0, mode: 'WORK' }, `${hour}:00 must be unpaid`);
    assert.equal(context.player.salary, 0);
    assert.equal(context.player.workSeconds, 0);
  }
}

function testWorkingWindowStillAccruesOrdinaryWages(): void {
  const context = contextAt(9);
  const result = context.work.tick(3600);
  assert.equal(result.elapsedSeconds, 3600);
  assert.ok(result.salary > 0);
  assert.equal(context.player.workSeconds, 3600);
}

testLunchAndOffWorkDoNotAccrueOrdinaryWages();
testWorkingWindowStillAccruesOrdinaryWages();
console.log('wage window gate tests passed');
