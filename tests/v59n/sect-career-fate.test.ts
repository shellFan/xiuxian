import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { validateFateEventContent, type FateEventDefinition } from '../../assets/scripts/v59j/fate-event-schema';
import { SECT_CAREER_FATE_EVENTS, SECT_CAREER_FATE_CHAINS } from '../../assets/scripts/v59j/sect-career-fate-events';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const base = JSON.parse(readFileSync(resolve(__dirname, '../../../../assets/configs/v2/fate-events.json'), 'utf8')) as { events: FateEventDefinition[] };

test('eight sect career Fate chains have five connected, authored stages with stateful outcomes', () => {
  const events = [...base.events, ...SECT_CAREER_FATE_EVENTS];
  assert.deepEqual(validateFateEventContent(events).errors, []);
  assert.equal(SECT_CAREER_FATE_CHAINS.length, 8);
  for (const chain of SECT_CAREER_FATE_CHAINS) {
    const stages = events.filter((event) => event.chainId === chain.chainId).sort((a, b) => (a.chainStage ?? 0) - (b.chainStage ?? 0));
    assert.deepEqual(stages.map((event) => event.chainStage), [1, 2, 3, 4, 5], chain.sectId);
    assert.equal(stages[0].trigger.milestone, `career:sect-chain:${chain.sectId}`);
    for (const [index, stage] of stages.entries()) {
      assert.ok(stage.description.length >= 20, `${stage.id} needs narrative context`);
      assert.ok(stage.options.length >= 2, `${stage.id} needs meaningful choices`);
      for (const option of stage.options) {
        for (const outcome of [option.success, option.failure]) {
          if (index < 4) assert.equal(outcome.nextEventId, stages[index + 1].id, `${stage.id} must preserve causal continuity`);
          else assert.ok(outcome.setFlags?.includes(`career:chain:${chain.sectId}:complete`), `${stage.id} must persist completion`);
        }
      }
    }
  }
});

test('career Fate chain is selected from current sect and cannot be replayed twice in the same run', () => {
  const clock = new FakeClock(Date.parse('2026-10-19T10:00:00+08:00'));
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), sectId: 'BIG_TECH', profession: 'QA', salary: 100, mind: 80 }),
  });
  try {
    facade.context.fateEvents.beginRun(4102);
    assert.deepEqual(facade.triggerCareerSectEventChain(), ['sect_big_tech_s1']);
    assert.equal(facade.queryFateEvent()?.id, 'sect_big_tech_s1');
    assert.deepEqual(facade.triggerCareerSectEventChain(), []);
    const event = facade.queryFateEvent()!;
    facade.resolveFateEvent(event.id, event.options[0].id);
    assert.equal(facade.queryFateEvent()?.id, 'sect_big_tech_s2');
    const persisted = JSON.parse((facade.context.storage as MemoryStorageAdapter).getItem('game-save') ?? '{}') as { fateRun?: { eventQueue?: string[] } };
    assert.equal(persisted.fateRun?.eventQueue?.[0], 'sect_big_tech_s2');
  } finally { facade.destroy(); }
});
