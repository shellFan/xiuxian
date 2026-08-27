import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { FixedRandomProvider, SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { ConfigService, ConfigValidationError } from '../../assets/scripts/services/config-service';
import { CareerEventService } from '../../assets/scripts/services/career-event-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { ConfigBundle } from '../../assets/scripts/model/config-types';
import careerEvents from '../../assets/configs/career-events.json';

const VALID_TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];

// The 30 authoritative titles from TASK-029 v2. Any future deletion breaks equality.
const EXPECTED_TITLES = [
  '老板画饼', '需求又改了', 'P0事故', '线上炸了', '同事跑路', '老板跑路', '突然团建', '强制周报',
  '绩效3.25', '年终奖取消', '融资成功', '公司上市', '空降领导', '老板亲戚入职', '部门裁员', '35岁优化',
  'HR约谈', '凌晨电话', '周末上线', '客户临时改需求', '项目延期', '产品经理失踪', '服务器炸了',
  '数据库慢查询', '线上紧急回滚', '同事请假', '下午茶', '领导出差', '项目奖金', '提前下班',
];

function baseConfig(): ConfigBundle {
  return {
    worker: { levels: Array.from({ length: 6 }, (_, index) => ({ level: index + 1, name: `L${index + 1}`, salary: 1 })) },
    economy: { mergeRewards: [1, 2, 3, 4, 5] },
    game: { board: { columns: 4, rows: 4 } },
  };
}

function loadRealEvents(): ConfigService {
  return ConfigService.loadFromJson(
    baseConfig().worker, baseConfig().economy, baseConfig().game,
    undefined, undefined, undefined, careerEvents,
  );
}

function createService(clock: FakeClock, random: SequenceRandomProvider | FixedRandomProvider): CareerEventService {
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData(), clock, randomProvider: random });
  return new CareerEventService(context, { clock, randomProvider: random });
}

function testLoadsThirtyValidEvents(): void {
  const events = loadRealEvents().careerEvents.events;
  assert.equal(events.length, 30);
  assert.equal(new Set(events.map((event) => event.id)).size, 30);
  for (const event of events) {
    assert.ok(event.id, 'event id must be present');
    assert.ok(event.title.trim(), 'event title must be non-empty');
    assert.ok(event.description.trim(), 'event description must be non-empty');
    assert.ok(VALID_TYPES.includes(event.type), `event ${event.id} type ${event.type} is invalid`);
    const hasChoices = Array.isArray(event.choices) && event.choices.length > 0;
    if (hasChoices) {
      assert.ok((event.choices as unknown[]).length >= 2, `event ${event.id} choices must be >= 2`);
      const choiceIds = new Set<string>();
      for (const choice of event.choices) {
        assert.ok(choice.id, 'choice id must be present');
        assert.ok(choice.text.trim(), 'choice text must be non-empty');
        assert.ok(choice.effects, 'choice effects must be present');
        assert.ok(!choiceIds.has(choice.id), `duplicate choice id ${choice.id}`);
        choiceIds.add(choice.id);
      }
    } else {
      assert.ok(event.effects, `event ${event.id} must define effects when it has no choices`);
    }
  }
}

function testThirtyAuthoritativeTitlesPresent(): void {
  const loaded = new Set(loadRealEvents().careerEvents.events.map((event) => event.title));
  assert.deepEqual([...loaded].sort(), [...EXPECTED_TITLES].sort());
}

function testUsesInjectedClockForThreeToEightMinuteInterval(): void {
  const clock = new FakeClock(1_000);
  const service = createService(clock, new SequenceRandomProvider([0, 0]));
  assert.equal(service.poll(), undefined);
  clock.advance(179_999);
  assert.equal(service.poll(), undefined);
  clock.advance(1);
  assert.equal(service.poll()?.id, 'EVENT_BOSS_PROMISE');
}

function testChoiceEventAppliesDeterministicEffect(): void {
  const clock = new FakeClock(0);
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData(), clock });
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.ok(event);
  assert.equal(event.id, 'EVENT_BOSS_PROMISE');
  service.choose(event.id, 'BELIEVE');
  assert.equal(context.player.cultivationExp, 15);
  assert.equal(context.player.mind, 92);
  assert.equal(service.current(), undefined);
}

function testNormalEventResolvesDeterministicEffect(): void {
  const clock = new FakeClock(0);
  const player = new PlayerData({ performance: 50, mind: 50, cultivationExp: 50 });
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player, clock });
  // interval consumes 0 -> 180000ms; selection 0.04 -> floor(1.2)=1 -> EVENT_REQUIREMENT_CHANGED
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.04]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'EVENT_REQUIREMENT_CHANGED');
  service.resolve(event.id);
  assert.equal(context.player.performance, 45);
  assert.equal(context.player.mind, 40);
  assert.equal(context.player.cultivationExp, 45);
  assert.equal(service.current(), undefined);
}

function testPositiveEventEffect(): void {
  const clock = new FakeClock(0);
  const player = new PlayerData({ mind: 50 });
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player, clock });
  // selection 0.88 -> floor(26.4)=26 -> EVENT_AFTERNOON_TEA
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.88]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'EVENT_AFTERNOON_TEA');
  service.resolve(event.id);
  assert.equal(context.player.mind, 62);
  assert.equal(context.player.performance, 2);
}

function testNegativeEventEffect(): void {
  const clock = new FakeClock(0);
  const player = new PlayerData({ performance: 50, mind: 50, cultivationExp: 50, salary: 100 });
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player, clock });
  // selection 0.47 -> floor(14.1)=14 -> EVENT_DEPARTMENT_LAYOFF
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.47]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'EVENT_DEPARTMENT_LAYOFF');
  service.resolve(event.id);
  assert.equal(context.player.performance, 40);
  assert.equal(context.player.mind, 38);
  assert.equal(context.player.cultivationExp, 45);
}

function testFixedRandomProviderIsDeterministic(): void {
  const build = (): { service: CareerEventService; clock: FakeClock } => {
    const clock = new FakeClock(0);
    const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData(), clock, randomProvider: new FixedRandomProvider(0.5) });
    return { service: new CareerEventService(context, { clock, randomProvider: new FixedRandomProvider(0.5) }), clock };
  };
  const a = build();
  a.service.poll();
  a.clock.advance(330_000);
  const b = build();
  b.service.poll();
  b.clock.advance(330_000);
  assert.equal(a.service.poll()?.id, 'EVENT_AGE_35_OPTIMIZATION');
  assert.equal(b.service.poll()?.id, 'EVENT_AGE_35_OPTIMIZATION');
}

function testRejectsIllegalCareerEventConfig(): void {
  // invalid type
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'WEIRD', title: 't', description: 'd', effects: { mind: 1 } }] } }),
    (error: unknown) => error instanceof ConfigValidationError && /type is invalid/.test(error.message));
  // missing effects and choices
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'POSITIVE', title: 't', description: 'd' }] } }),
    (error: unknown) => error instanceof ConfigValidationError && /effects object/.test(error.message));
  // duplicate id
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [
    { id: 'x', type: 'POSITIVE', title: 't', description: 'd', effects: { mind: 1 } },
    { id: 'x', type: 'NEGATIVE', title: 't2', description: 'd2', effects: { mind: -1 } },
  ] } }),
    (error: unknown) => error instanceof ConfigValidationError && /duplicate id x/.test(error.message));
  // non-integer effect
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'POSITIVE', title: 't', description: 'd', effects: { mind: 1.5 } }] } }),
    (error: unknown) => error instanceof ConfigValidationError && /safe integer/.test(error.message));
  // choice missing effects
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'CHOICE', title: 't', description: 'd', choices: [{ id: 'a', text: 'ta' }] }] } }),
    (error: unknown) => error instanceof ConfigValidationError);
}

testLoadsThirtyValidEvents();
testThirtyAuthoritativeTitlesPresent();
testUsesInjectedClockForThreeToEightMinuteInterval();
testChoiceEventAppliesDeterministicEffect();
testNormalEventResolvesDeterministicEffect();
testPositiveEventEffect();
testNegativeEventEffect();
testFixedRandomProviderIsDeterministic();
testRejectsIllegalCareerEventConfig();
console.log('career event tests passed');
