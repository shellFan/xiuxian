import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { FixedRandomProvider, SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { ConfigService, ConfigValidationError } from '../../assets/scripts/services/config-service';
import { CareerEventService, FISH_EVENT_ELIGIBILITY } from '../../assets/scripts/services/career-event-service';
import { EventRuntimeAdapter } from '../../assets/scripts/services/event-runtime-adapter';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { ConfigBundle } from '../../assets/scripts/model/config-types';
import careerEvents from '../../assets/configs/career-events.json';

const VALID_TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];

// The 30 authoritative titles from TASK-029 v2 + 7 摸鱼场景事件（V11-F5）。Any future deletion breaks equality.
const EXPECTED_TITLES = [
  '老板画饼', '需求又改了', 'P0事故', '线上炸了', '同事跑路', '老板跑路', '突然团建', '强制周报',
  '绩效3.25', '年终奖取消', '融资成功', '公司上市', '空降领导', '老板亲戚入职', '部门裁员', '35岁优化',
  'HR约谈', '凌晨电话', '周末上线', '客户临时改需求', '项目延期', '产品经理失踪', '服务器炸了',
  '数据库慢查询', '线上紧急回滚', '同事请假', '下午茶', '领导出差', '项目奖金', '提前下班',
  // V11-F5 摸鱼场景（requiresWorkMode=FISHING）
  '茶水间偶遇', '会议摸鱼', '厕所秘籍', '隐藏红包', '领导抓包', '同事掩护', '高人指点',
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

function createService(clock: FakeClock, random: SequenceRandomProvider | FixedRandomProvider, playerOverrides: Record<string, unknown> = {}): CareerEventService {
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData(playerOverrides), clock, randomProvider: random });
  return new CareerEventService(context, { clock, randomProvider: random });
}

/*
 * V11-F5 选择算法种子说明（EventRuntimeAdapter / EVENT-POOL-V1）：
 *   随机数消费顺序 = 调度器间隔（markTriggered）→ 类别彩票（0..9999，≥110 为 NORMAL）
 *   → 类别权重选择（普通池按 career 档位 P/N/C 权重，entries 按 pool 顺序：
 *     career1 默认 [CHOICE 35, NEGATIVE 15, POSITIVE 50]）→ 类别内均匀。
 * 新档默认 workMode='FISHING' → 摸鱼事件参与普通池（POSITIVE 7 / NEGATIVE 17）。
 */

function testLoadsThirtySevenValidEvents(): void {
  const events = loadRealEvents().careerEvents.events;
  assert.equal(events.length, 37);
  assert.equal(new Set(events.map((event) => event.id)).size, 37);
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

function testFishEventsAreRegisteredAsFishingOnly(): void {
  const fishIds = ['FISH_TEABREAK', 'FISH_MEETING', 'FISH_TOILET_SECRET', 'FISH_RED_PACKET', 'FISH_CAUGHT', 'FISH_COVER', 'FISH_MASTER'];
  for (const id of fishIds) {
    assert.equal(FISH_EVENT_ELIGIBILITY.get(id)?.requiresWorkMode, 'FISHING', `${id} must be FISHING-gated`);
    assert.ok(careerEvents.events.some((e) => e.id === id), `${id} must exist in pool`);
  }
  assert.equal(FISH_EVENT_ELIGIBILITY.size, fishIds.length);
}

function testThirtySevenAuthoritativeTitlesPresent(): void {
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
  // 彩票 roll=0 → EASTER_EGG；新档 FISHING 模式下两个彩蛋均合格，池序首个 = 提前下班
  assert.equal(service.poll()?.id, 'EVENT_LEAVE_EARLY');
}

function testChoiceEventAppliesDeterministicEffect(): void {
  const clock = new FakeClock(0);
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData(), clock });
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.2, 0.0]) });
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
  // [0 间隔, 0.5 彩票 NORMAL, 0.4 → NEGATIVE 段, 0.0 → NEGATIVE[0]]
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.4, 0.0]) });
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
  // [0, 0.5 NORMAL, 0.6 → POSITIVE 段, 0.0 → POSITIVE[0]] = 融资成功
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.6, 0.0]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'EVENT_FINANCING_SUCCESS');
  service.resolve(event.id);
  assert.equal(context.player.salary, 20);
  assert.equal(context.player.mind, 60);
  assert.equal(context.player.performance, 5);
}

function testAfternoonTeaReachableViaWithinCategoryIndex(): void {
  const clock = new FakeClock(0);
  const player = new PlayerData({ mind: 50 });
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player, clock });
  // POSITIVE[2] = 下午茶（floor(0.35*7)=2）
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.6, 0.35]) });
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
  // NEGATIVE[7] = 部门裁员（floor(0.44*17)=7）
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.4, 0.44]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'EVENT_DEPARTMENT_LAYOFF');
  service.resolve(event.id);
  assert.equal(context.player.performance, 40);
  assert.equal(context.player.mind, 38);
  assert.equal(context.player.cultivationExp, 45);
}

function testFishEventResolvesEffect(): void {
  const clock = new FakeClock(0);
  const player = new PlayerData({ mind: 50 });
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player, clock });
  // POSITIVE[5] = 茶水间偶遇（floor(0.85*7)=5，新档 FISHING 模式下摸鱼事件参与普通池）
  const service = new CareerEventService(context, { clock, randomProvider: new SequenceRandomProvider([0, 0.5, 0.6, 0.85]) });
  assert.equal(service.poll(), undefined);
  clock.advance(180_000);
  const event = service.poll();
  assert.equal(event?.id, 'FISH_TEABREAK');
  service.resolve(event.id);
  assert.equal(context.player.mind, 58);
  assert.equal(context.player.cultivationExp, 10);
}

function testFishEventsGatedByWorkMode(): void {
  // 引擎级门控：WORK 模式下摸鱼事件永不出现在候选（即使类内掷点到最后一位）
  const pool = [
    { id: 'WORK_EV', type: 'POSITIVE' as const, title: 'w', description: 'w', effects: { mind: 1 } },
    { id: 'FISH_TEABREAK', type: 'POSITIVE' as const, title: 'f', description: 'f', effects: { mind: 2 } },
  ];
  const build = (workMode: 'WORK' | 'FISHING', roll: number): string | undefined => {
    const clock = new FakeClock(0);
    const adapter = new EventRuntimeAdapter(pool, { clock, randomProvider: new SequenceRandomProvider([0.5, 0.6, roll]), eligibilityOverrides: FISH_EVENT_ELIGIBILITY });
    const picked = adapter.poll({ careerLevel: 1, workMode, mind: 100, maxMind: 100, kpiCompleted: 0, kpiTotal: 3 });
    return picked?.id;
  };
  assert.equal(build('WORK', 0.99), 'WORK_EV', 'WORK 模式下 0.99 也只能选到 WORK_EV（摸鱼事件被资格过滤）');
  assert.equal(build('FISHING', 0.99), 'FISH_TEABREAK', 'FISHING 模式下类内末位掷点选中摸鱼事件');
  console.log('  (gating verified via EventRuntimeAdapter with FISH_EVENT_ELIGIBILITY)');
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
  // 类别 roll 0.5*100 → POSITIVE 段（entries [CHOICE,NEG,POS]）；类内 floor(0.5*7)=3
  assert.equal(a.service.poll()?.id, 'EVENT_LEADER_BUSINESS_TRIP');
  assert.equal(b.service.poll()?.id, 'EVENT_LEADER_BUSINESS_TRIP');
}

function testRejectsIllegalCareerEventConfig(): void {
  // invalid type
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'WEIRD', title: 't', description: 'd', effects: { mind: 1 } }] } }),
    (error: unknown) => error instanceof ConfigValidationError && /type is invalid/.test(error.message));
  // missing effects and choices
  assert.throws(() => ConfigService.load({ ...baseConfig(), careerEvents: { events: [{ id: 'x', type: 'POSITIVE', title: 't', description: 'd' }] } }),
    (error: unknown) => error instanceof ConfigValidationError && /effects must be an object/.test(error.message));
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

testLoadsThirtySevenValidEvents();
testFishEventsAreRegisteredAsFishingOnly();
testThirtySevenAuthoritativeTitlesPresent();
testUsesInjectedClockForThreeToEightMinuteInterval();
testChoiceEventAppliesDeterministicEffect();
testNormalEventResolvesDeterministicEffect();
testPositiveEventEffect();
testAfternoonTeaReachableViaWithinCategoryIndex();
testNegativeEventEffect();
testFishEventResolvesEffect();
testFishEventsGatedByWorkMode();
testFixedRandomProviderIsDeterministic();
testRejectsIllegalCareerEventConfig();
console.log('career event tests passed (V11-F5: EventRuntimeAdapter wired, 37 events)');
