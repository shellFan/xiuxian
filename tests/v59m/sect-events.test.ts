import assert from 'node:assert/strict';
import { test } from 'node:test';
import sectConfig from '../../assets/configs/sect.json';
import sectEventsConfig from '../../assets/configs/v3/sect-events.json';
import { EVENTS } from '../../assets/scripts/v2/v2-event-service';
import { checkEventConditions, type EventWorldState } from '../../assets/scripts/v2/event-engine';

test('all configured sect-specific events exist and have at least two consequential choices', () => {
  const ids = sectConfig.sects.flatMap((sect) => sect.employment?.eventIds ?? []);
  assert.equal(ids.length, 16);
  for (const id of ids) {
    const event = EVENTS.find((entry) => entry.id === id);
    assert.ok(event, `missing event ${id}`);
    assert.ok((event.choices?.length ?? 0) >= 2, `${id} must offer at least two choices`);
    assert.ok(event.choices!.every((choice) => Object.keys(choice.effects ?? {}).length > 0), `${id} choices must change state`);
  }
});

test('sect event content loads as 16 supported events with consequential choices', () => {
  const configured = sectEventsConfig as { events: { id: string; choices?: { effects?: Record<string, unknown> }[] }[] };
  assert.equal(configured.events.length, 16);
  assert.equal(new Set(configured.events.map((event) => event.id)).size, 16, 'event IDs must be unique');

  const supportedEffects = new Set([
    'salary', 'cultivation', 'performance', 'mind', 'innerDemon', 'relationship', 'material',
    'salaryCost', 'grantTechnique', 'grantEquipment', 'grantConsumable', 'buff', 'setFlags', 'removeFlags',
    'nextEvent', 'promotionModifier', 'promotionCooldownDays', 'evidence', 'assignTask', 'openCase',
    'raiseIncident', 'techDebt', 'startOvertime', 'lifetime',
  ]);
  for (const event of configured.events) {
    assert.ok((event.choices?.length ?? 0) >= 2, `${event.id} must have at least two choices`);
    for (const choice of event.choices ?? []) {
      const keys = Object.keys(choice.effects ?? {});
      assert.ok(keys.length > 0, `${event.id} choice must change state`);
      assert.ok(keys.every((key) => supportedEffects.has(key)), `${event.id} contains unsupported effect: ${keys.join(', ')}`);
    }
    assert.ok(EVENTS.some((eventInRuntime) => eventInRuntime.id === event.id), `${event.id} must be registered in the runtime scheduler`);
  }
});

test('sect event scheduler conditions expose only the player employer events', () => {
  const world: EventWorldState = {
    careerLevel: 1, workMode: 'WORK', mind: 60, innerDemon: 0, salary: 100, cultivation: 0,
    weekday: 1, hour: 10, minuteOfDay: 600, situationIds: [], sectId: 'OUTSOURCING',
    relationships: {}, materials: {}, ownedTechniques: [], ownedEquipment: [], eventFlags: { 'sect:OUTSOURCING': true },
  };
  const available = EVENTS.filter((event) => event.id.startsWith('SECT_') && checkEventConditions(event, world));
  assert.equal(available.length, 2);
  assert.ok(available.every((event) => event.id.includes('OUTSOURCE')));
});
