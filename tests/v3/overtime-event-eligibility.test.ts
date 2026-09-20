import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { checkEventConditions, type EventDefinition, type EventWorldState } from '../../assets/scripts/v2/event-engine';

function world(overrides: Partial<EventWorldState> = {}): EventWorldState {
  return {
    careerLevel: 1,
    workMode: 'WORK',
    mind: 80,
    innerDemon: 0,
    salary: 0,
    cultivation: 0,
    weekday: 1,
    hour: 17,
    minuteOfDay: 17 * 60 + 30,
    overtimeActive: false,
    situationIds: [],
    sectId: null,
    relationships: {},
    materials: {},
    ownedTechniques: [],
    ownedEquipment: [],
    eventFlags: {},
    ...overrides,
  } as EventWorldState;
}

function event(overrides: Record<string, unknown>): EventDefinition {
  return {
    id: 'test', title: 'test', description: 'test', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1,
    ...overrides,
  } as EventDefinition;
}

const preOff = event({ minMinuteOfDay: 17 * 60 + 30, maxMinuteOfDay: 17 * 60 + 59 });
assert.equal(checkEventConditions(preOff, world({ minuteOfDay: 17 * 60 + 29 })), false, 'pre-off pool must not fire before 17:30');
assert.equal(checkEventConditions(preOff, world({ minuteOfDay: 17 * 60 + 30 })), true, 'pre-off pool starts at 17:30');
assert.equal(checkEventConditions(preOff, world({ minuteOfDay: 17 * 60 + 59 })), true, 'pre-off pool includes 17:59');
assert.equal(checkEventConditions(preOff, world({ minuteOfDay: 18 * 60 })), false, 'pre-off pool stops at 18:00');

const night = event({ minMinuteOfDay: 18 * 60, maxMinuteOfDay: 6 * 60, requiresOvertime: true, allowWeekend: true });
assert.equal(checkEventConditions(night, world({ minuteOfDay: 22 * 60, hour: 22 })), false, 'night events require an active overtime session');
assert.equal(checkEventConditions(night, world({ minuteOfDay: 22 * 60, hour: 22, overtimeActive: true })), true, 'night events fire during active overtime');
assert.equal(checkEventConditions(night, world({ minuteOfDay: 12 * 60, hour: 12, overtimeActive: true })), false, 'night events do not leak into daytime');
assert.equal(checkEventConditions(night, world({ weekday: 6, minuteOfDay: 23 * 60, hour: 23, overtimeActive: true })), true, 'weekend night overtime is supported when content allows it');

function testPausedNightChainDoesNotSurfaceWithoutActiveOvertime(): void {
  const clock = new FakeClock(new Date(2026, 0, 5, 12, 0, 0, 0).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({
    lastSaveTime: clock.now(),
    eventChainState: { ot_chain_tonight: { stage: 0, lastDayIndex: clock.now() - 4 * 3600_000 } },
  }), clock, board: null });
  const internals = context.v2Events as unknown as { scheduler: { state: { nextEventAt: number } } };
  internals.scheduler.state.nextEventAt = clock.now() + 3600_000;
  assert.equal(context.v2Events.poll(), null, 'a paused night chain must wait until overtime is active and the time window is valid');
}

testPausedNightChainDoesNotSurfaceWithoutActiveOvertime();

console.log('overtime event eligibility tests passed');
