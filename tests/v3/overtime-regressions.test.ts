import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { EventDefinition } from '../../assets/scripts/v2/event-engine';

function make(hour = 18) {
  const clock = new FakeClock(new Date(2026, 8, 20, hour).getTime());
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ clock, storage, board: null, player: new PlayerData() });
  return { context, clock, storage };
}

test('new offers and short sessions cannot clear persisted exhaustion; explicit rest can', () => {
  const { context } = make();
  context.player.overtimeFatigue = 'EXHAUSTED';
  context.overtime.offer('REQUESTED', true, 60);
  assert.equal(context.overtime.fatigue(), 'EXHAUSTED');
  context.overtime.accept('WORK');
  context.overtime.tick(60);
  assert.equal(context.overtime.fatigue(), 'EXHAUSTED');
  context.overtime.finish();
  assert.equal(context.player.overtimeFatigue, 'EXHAUSTED');
  context.weekend.choose('SLEEP_MADLY');
  assert.equal(context.overtime.fatigue(), 'RESTED');
  context.overtime.startVoluntary(60, false);
  assert.equal(context.overtime.fatigue(), 'RESTED');
});

test('night achievements require positive recorded overlap with the night window', () => {
  for (const [hour, seconds, expected] of [
    [18, 7200, 0], [18, 7201, 1], [18, 8 * 3600, 1],
    [20, 1, 1], [23, 7200, 1], [0, 1, 1], [8, 3600, 1], [9, 1, 0],
  ]) {
    const { context } = make(hour);
    context.overtime.startVoluntary(seconds, false);
    context.overtime.tick(seconds);
    context.overtime.finish();
    assert.equal(context.player.overtimeStats.nightSessions, expected, `${hour}:00 + ${seconds}s`);
    context.overtime.finish();
    assert.equal(context.player.overtimeStats.nightSessions, expected, 'finish is idempotent');
  }
});

test('wall-clock jumps without recorded work cannot unlock a night session', () => {
  const { context, clock } = make();
  context.overtime.startVoluntary(8 * 3600, false);
  clock.advance(8 * 3600_000);
  context.overtime.tick(1);
  context.overtime.finish();
  assert.equal(context.player.overtimeStats.nightSessions, 0);
});

test('event choice requirements are checked again before any mutation', () => {
  const { context } = make();
  const def: EventDefinition = {
    id: 'guard_fixture', title: 'Guard', description: 'Guard', category: 'WORK',
    rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1,
    choices: [{ id: 'special', text: 'Special', requirements: { minMind: 80 }, effects: { salary: 10 } }],
  };
  // Inject an isolated fixture without mutating shared production configuration.
  (context.v2Events as unknown as { current: EventDefinition }).current = def;
  assert.equal(context.v2Events.currentChoices().length, 1);
  context.player.mind = 20;
  const before = context.player.toSaveData();
  assert.throws(() => context.v2Events.choose('special'), /选项/);
  assert.deepEqual(context.player.toSaveData(), before);
  assert.equal(context.v2Events.currentEvent(), def);
  context.player.mind = 80;
  context.v2Events.choose('special');
  assert.equal(context.player.salary, 10);
});
