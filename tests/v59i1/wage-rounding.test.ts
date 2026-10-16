import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

// Fixed FISHING_IMMORTAL seed/identity: multiplying each settled ¥1 by .9 must
// retain the fraction rather than lose every regular-work salary reward.
const clock = new FakeClock(Date.parse('2026-09-21T09:00:00+08:00'));
const storage = new MemoryStorageAdapter();
const c = new GameContext({ clock, storage, board: null, player: new PlayerData({
  profession: 'JAVA_BACKEND', characterSetupStatus: 'COMPLETE', destinyId: 'FISHING_IMMORTAL',
  innateAttributes: { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 },
  workMode: 'WORK',
}) });
c.gameDay.ensureStarted();
const segments: number[] = [];
for (let segment = 0; segment < 6; segment++) {
  for (let second = 0; second < 600; second++) { clock.advance(1000); c.work.tick(1); }
  c.saveService.save(c.player);
  segments.push(c.player.salary);
}
assert.ok(c.player.salary >= 5, `0.9x regular salary must accrue across 1-second ticks: ${segments}`);
assert.ok(c.player.salary <= 6, 'preserve the existing reduced nominal wage, do not grant a bonus');
const before = c.player.salary;
const reloaded = new GameContext({ clock, storage, board: null });
for (let second = 0; second < 600; second++) { clock.advance(1000); reloaded.work.tick(1); }
assert.ok(reloaded.player.salary > before, 'fraction survives save/reload and accrual resumes');
assert.equal(reloaded.player.workSeconds, 4200);
console.log('V59I1 fixed-destiny wage segments:', segments, 'after restart:', reloaded.player.salary);
