/**
 * Gameplay V2 Phase 2 — EventEngine: conditions, scheduling, choices, chains, pending triage.
 */
import assert from 'node:assert/strict';

import {
  type EventDefinition,
  type EventWorldState,
  checkRequirements,
  checkEventConditions,
  visibleChoices,
  EventScheduler,
  triageOfflineEvents,
  DEFAULT_SCHEDULER_CONFIG,
} from '../../assets/scripts/v2/event-engine';
import { EVENTS, EVENT_MAP, V2EventService } from '../../assets/scripts/v2/v2-event-service';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { createRng, mulberry32 } from '../../assets/scripts/v2/random-service';

// ── config integrity（§143 基本校验） ────────────────────────────────────────

function testConfigIntegrity(): void {
  assert.ok(EVENTS.length >= 100, `events >= 100, got ${EVENTS.length}`);
  const ids = new Set<string>();
  let branching = 0;
  let rare = 0;
  let secret = 0;
  let npc = 0;
  const chains = new Set<string>();
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.title && e.description, `${e.id} missing text`);
    if (e.choices && (e.choices.length > 1 || e.choices.some((c) => c.successChance !== undefined))) branching += 1;
    if (e.rarity === 'RARE' || e.rarity === 'EPIC') rare += 1;
    // 彩蛋：隐藏低权重（baseWeight<=3）或 onceEver 的 SECRET 事件
    if (e.category === 'SECRET' && (e.onceEver || e.baseWeight <= 3)) secret += 1;
    if (e.category === 'NPC') npc += 1;
    if (e.chainId) chains.add(e.chainId);
  }
  assert.ok(branching >= 40, `branching >= 40, got ${branching}`);
  assert.ok(rare >= 20, `rare+epic >= 20, got ${rare}`);
  assert.ok(npc >= 15, `npc events >= 15, got ${npc}`);
  assert.ok(secret >= 10, `secret/egg events >= 10, got ${secret}`);
  assert.ok(chains.size >= 10, `chains >= 10, got ${chains.size}`);
  // 链引用完整
  for (const e of EVENTS) {
    if (e.chainId) {
      const stages = EVENTS.filter((x) => x.chainId === e.chainId).map((x) => x.chainStage ?? 0);
      assert.equal(Math.min(...stages), 0, `chain ${e.chainId} starts at stage 0`);
      assert.ok(Math.max(...stages) >= 2, `chain ${e.chainId} has >= 3 stages`);
    }
    for (const c of e.choices ?? []) {
      if (c.nextEvent) assert.ok(EVENT_MAP.has(c.nextEvent), `${e.id} broken nextEvent ${c.nextEvent}`);
      if (c.successEffects?.nextEvent) assert.ok(EVENT_MAP.has(c.successEffects.nextEvent), `${e.id} broken success nextEvent`);
    }
  }
}

// ── conditions ───────────────────────────────────────────────────────────────

function baseWorld(overrides?: Partial<EventWorldState>): EventWorldState {
  return {
    careerLevel: 1, workMode: 'WORK', mind: 80, innerDemon: 0,
    salary: 100, cultivation: 100, weekday: 3, hour: 10,
    situationIds: [], sectId: null, relationships: {}, materials: {},
    ownedTechniques: [], ownedEquipment: [], eventFlags: {},
    ...overrides,
  };
}

function testConditions(): void {
  assert.equal(checkRequirements({ minCareer: 2 }, baseWorld({ careerLevel: 1 })), false);
  assert.equal(checkRequirements({ minCareer: 2 }, baseWorld({ careerLevel: 3 })), true);
  assert.equal(checkRequirements({ relationship: { BOSS: 30 } }, baseWorld({ relationships: { BOSS: 40 } })), true);
  assert.equal(checkRequirements({ material: { bug: 2 } }, baseWorld({ materials: { bug: 1 } })), false);
  assert.equal(checkRequirements({ eventFlag: 'x' }, baseWorld({ eventFlags: { x: true } })), true);
  assert.equal(checkRequirements(undefined, baseWorld()), true);
  // 工作日限制
  assert.equal(checkEventConditions({ id: 't', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1 }, baseWorld({ weekday: 6 })), false);
  assert.equal(checkEventConditions({ id: 't', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1, allowedModes: ['FISHING'] }, baseWorld({ workMode: 'WORK' })), false);
}

function testVisibleChoices(): void {
  const def: EventDefinition = {
    id: 't', title: 't', description: '', category: 'NPC', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1,
    choices: [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b', requirements: { technique: 'tech_x' } },
    ],
  };
  assert.equal(visibleChoices(def, baseWorld()).length, 1);
  assert.equal(visibleChoices(def, baseWorld({ ownedTechniques: ['tech_x'] })).length, 2);
}

// ── scheduler ────────────────────────────────────────────────────────────────

function testSchedulerPickAndCooldown(): void {
  const scheduler = new EventScheduler({ ...DEFAULT_SCHEDULER_CONFIG, minGapMs: 1000, maxGapMs: 2000 });
  const defs: EventDefinition[] = [
    { id: 'a', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 10, cooldown: 60 },
    { id: 'b', title: '', description: '', category: 'BUG', rarity: 'COMMON', priority: 'NORMAL', baseWeight: 1 },
  ];
  const rng = createRng(mulberry32(7));
  const picked = scheduler.pick(defs, baseWorld(), rng, 10000);
  assert.ok(picked, 'picked an event');
  scheduler.markFired(picked, 10000);
  assert.equal(scheduler.state.nextEventAt > 10000, true);
  // 冷却内不再出 a
  const again = scheduler.pick([defs[0]], baseWorld(), rng, 10000 + 30_000);
  assert.equal(again, null, 'cooldown blocks re-fire');
  const later = scheduler.pick([defs[0]], baseWorld(), rng, 10000 + 61_000);
  assert.ok(later, 'cooldown expires');
}

function testSchedulerNegativeStreak(): void {
  const scheduler = new EventScheduler({ ...DEFAULT_SCHEDULER_CONFIG });
  scheduler.reportOutcome('NEGATIVE');
  scheduler.reportOutcome('NEGATIVE');
  scheduler.reportOutcome('NEGATIVE');
  assert.equal(scheduler.state.negativeStreak, 3);
  scheduler.reportOutcome('POSITIVE');
  assert.equal(scheduler.state.negativeStreak, 0);
}

// ── pending triage（§41） ────────────────────────────────────────────────────

function testTriageOffline(): void {
  const flavor: EventDefinition = { id: 'f', title: '', description: '', category: 'WORK', rarity: 'COMMON', priority: 'FLAVOR', baseWeight: 1 };
  const important: EventDefinition = { id: 'i', title: '', description: '', category: 'BOSS', rarity: 'RARE', priority: 'IMPORTANT', baseWeight: 1, choices: [{ id: 'a', text: 'a' }] };
  const result = triageOfflineEvents([flavor, important, flavor], []);
  assert.deepEqual(result.toPending.map((d) => d.id), ['i']);
  assert.equal(result.autoResolve.length, 2);
  // 队列满 → 降级
  const full = triageOfflineEvents([important, important, important, important, important, important], []);
  assert.equal(full.toPending.length, 5, 'max pending 5');
  assert.equal(full.autoResolve.length, 1);
}

// ── V2EventService runtime ───────────────────────────────────────────────────

function testV2EventServiceFlow(): void {
  const clock = new FakeClock(new Date(new Date().setHours(10, 0, 0, 0)).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock });
  const svc = context.v2Events;
  // 强制触发一个分支事件
  const def = EVENT_MAP.get('legacy_s0');
  assert.ok(def, 'legacy_s0 exists');
  assert.ok(svc.forceTrigger('legacy_s0'));
  const choices = svc.currentChoices();
  assert.equal(choices.length, 2);
  const result = svc.choose('REFACTOR');
  assert.ok(result.success !== null);
  assert.ok(context.player.eventChainState['legacy'], 'chain progressed regardless of roll');
  if (result.success) {
    assert.equal(context.player.eventFlags['legacy_refactored'], true, 'success branch sets flag');
  } else {
    assert.ok(context.player.innerDemon > 0, 'failure branch adds inner demon');
  }
}

function testV2EventApplyEffects(): void {
  const clock = new FakeClock(new Date(new Date().setHours(10, 0, 0, 0)).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now(), salary: 100 }), clock });
  const svc = context.v2Events;
  svc.applyEffects({
    salary: 50, cultivation: 10, performance: 5, mind: -5, innerDemon: 8,
    relationship: { BOSS: 10 }, material: { bug_crystal: 2 },
    setFlags: ['flag_test'], grantEquipment: 'eq_test',
  });
  assert.equal(context.player.salary, 150);
  assert.equal(context.player.cultivationExp, 10);
  assert.equal(context.player.performance, 5);
  assert.equal(context.player.mind, 95);
  assert.equal(context.player.innerDemon, 8);
  assert.equal(context.player.relationships['BOSS'], 10);
  assert.equal(context.player.materials['bug_crystal'], 2);
  assert.equal(context.player.eventFlags['flag_test'], true);
  assert.deepEqual(context.player.ownedEquipment, ['eq_test']);
  // clamp 校验
  svc.applyEffects({ relationship: { BOSS: 500 }, innerDemon: 999 });
  assert.equal(context.player.relationships['BOSS'], 100);
  assert.equal(context.player.innerDemon, 100);
}

function testV2EventPendingQueue(): void {
  const clock = new FakeClock(new Date(new Date().setHours(10, 0, 0, 0)).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock });
  const svc = context.v2Events;
  const def = EVENT_MAP.get('npc_boss_1on1');
  assert.ok(def);
  svc.triagePending([def]);
  assert.equal(context.player.pendingEvents.length, 1);
  assert.equal(svc.currentEvent()?.id, 'npc_boss_1on1');
  // 选择后队列弹出
  svc.choose('LISTEN');
  assert.equal(context.player.pendingEvents.length, 0);
  assert.equal(svc.currentEvent(), null);
}

// ── run ──────────────────────────────────────────────────────────────────────

testConfigIntegrity();
testConditions();
testVisibleChoices();
testSchedulerPickAndCooldown();
testSchedulerNegativeStreak();
testTriageOffline();
testV2EventServiceFlow();
testV2EventApplyEffects();
testV2EventPendingQueue();
console.log('gameplay v2 phase2 event engine tests passed');
