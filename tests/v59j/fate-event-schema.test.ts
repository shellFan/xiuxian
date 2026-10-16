import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateFateEventContent, type FateEventDefinition } from '../../assets/scripts/v59j/fate-event-schema';

const path = resolve(__dirname, '../../../../assets/configs/v2/fate-events.json');
const content = JSON.parse(readFileSync(path, 'utf8')) as { events: FateEventDefinition[] };
const npcContent = JSON.parse(readFileSync(resolve(__dirname, '../../../../assets/configs/v2/fate-npcs.json'), 'utf8')) as { npcs: { id: string; name: string; role: string }[] };

function testAuthoredContentMeetsJMinimums(): void {
  const result = validateFateEventContent(content.events);
  assert.deepEqual(result.errors, []);
  assert.ok(content.events.length >= 30);
  assert.ok(new Set(content.events.map((event) => event.id)).size >= 30);
  assert.ok(content.events.filter((event) => event.options.length >= 3).length >= 20);
  assert.ok(content.events.filter((event) => event.options.some((option) => option.successChance !== undefined)).length >= 10);
  assert.ok(result.chainIds.length >= 5);
  assert.ok(content.events.filter((event) => event.hidden === true).length >= 3);
  assert.ok(result.endingIds.length >= 5);
  assert.ok(result.deathEndingIds.length >= 3);
  assert.ok(npcContent.npcs.length >= 5);
  assert.equal(new Set(npcContent.npcs.map((npc) => npc.id)).size, npcContent.npcs.length);
  const npcIds = new Set(npcContent.npcs.map((npc) => npc.id));
  for (const event of content.events) for (const option of event.options) {
    for (const outcome of [option.success, option.failure]) {
      for (const id of Object.keys(outcome.relationship ?? {})) assert.ok(npcIds.has(id), `${event.id} references unknown NPC ${id}`);
    }
    for (const id of Object.keys(option.requirements?.relationship ?? {})) assert.ok(npcIds.has(id), `${event.id} gates on unknown NPC ${id}`);
  }
  for (const event of content.events) {
    assert.equal(new Set(event.options.map((option) => option.text)).size, event.options.length, `${event.id} should offer distinct actions`);
    for (const option of event.options) {
      if (event.chainId) assert.ok(option.text.trim().length >= 6, `${event.id}/${option.id} needs a clear actionable choice`);
      for (const outcome of [option.success, option.failure]) {
        assert.doesNotMatch(outcome.text, /你把混乱拆成了几件能做的小事|你低估了连锁影响|边界说清以后/,
          `${event.id}/${option.id} must describe its authored consequence instead of a reused generic template`);
      }
    }
  }
}

function testValidatorRejectsDeadLinksAndUnboundedRewards(): void {
  const invalid: FateEventDefinition[] = [{
    id: 'broken', title: 'broken', description: 'broken', category: 'WORKPLACE', weight: 1,
    trigger: { milestone: 'never' }, options: [
      { id: 'bad', text: 'bad', successChance: 2,
        success: { text: 'bad', nextEventId: 'missing', salary: Number.MAX_SAFE_INTEGER },
        failure: { text: 'bad' },
      },
      { id: 'other', text: 'other', success: { text: 'ok' }, failure: { text: 'ok' } },
    ],
  }];
  const result = validateFateEventContent(invalid);
  assert.ok(result.errors.some((error) => error.includes('successChance')));
  assert.ok(result.errors.some((error) => error.includes('missing')));
  assert.ok(result.errors.some((error) => error.includes('salary')));
}

testAuthoredContentMeetsJMinimums();
testValidatorRejectsDeadLinksAndUnboundedRewards();
console.log('v59j fate event schema tests passed');
