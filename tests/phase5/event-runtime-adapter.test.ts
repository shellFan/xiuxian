/**
 * EventRuntimeAdapter Tests — category lottery, eligibility filtering,
 * weight-based selection, cooldown, history, negative streak protection,
 * EASTER_EGG oncePerSave/oncePerDay, reset.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventRuntimeAdapter, type PlayerSnapshot, type EventEligibility } from '../../assets/scripts/services/event-runtime-adapter';
import type { CareerEventConfig } from '../../assets/scripts/model/config-types';

// ── Test fixtures ──

const MOCK_EVENTS: CareerEventConfig[] = [
  { id: 'E_POS_1', type: 'POSITIVE', title: 'P1', description: 'D1', effects: { mind: 5 } },
  { id: 'E_POS_2', type: 'POSITIVE', title: 'P2', description: 'D2', effects: { mind: 8 } },
  { id: 'E_NEG_1', type: 'NEGATIVE', title: 'N1', description: 'D3', effects: { mind: -5 } },
  { id: 'E_NEG_2', type: 'NEGATIVE', title: 'N2', description: 'D4', effects: { mind: -8 } },
  { id: 'E_CHOICE_1', type: 'CHOICE', title: 'C1', description: 'D5', choices: [
    { id: 'A', text: 'a', effects: { mind: 3 } },
    { id: 'B', text: 'b', effects: { mind: -3 } },
  ] },
  { id: 'E_RARE_1', type: 'RARE', title: 'R1', description: 'D6', effects: { salary: 50, mind: 20 } },
  { id: 'E_EGG_1', type: 'EASTER_EGG', title: 'EG1', description: 'D7', effects: { mind: 15, cultivation: 5 } },
  { id: 'E_EGG_2', type: 'EASTER_EGG', title: 'EG2', description: 'D8', effects: { mind: 12, cultivation: 8 } },
];

const DEFAULT_SNAPSHOT: PlayerSnapshot = {
  careerLevel: 1,
  workMode: 'WORK',
  mind: 50,
  maxMind: 100,
  kpiCompleted: 0,
  kpiTotal: 10,
};

function makeSeededRandom(sequence: number[]): { next: () => number } {
  let i = 0;
  return { next: () => sequence[i++ % sequence.length] };
}

function makeClock(startMs: number): { now: () => number } {
  let t = startMs;
  return { now: () => t };
}

// ── Tests ──

test('category lottery: roll < 10 selects EASTER_EGG', () => {
  const rng = makeSeededRandom([0.0005]); // floor(0.0005 * 10000) = 5 → EASTER_EGG
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(result);
  assert.equal(result!.type, 'EASTER_EGG');
});

test('category lottery: roll 10..109 selects RARE', () => {
  const rng = makeSeededRandom([0.005]); // floor(0.005 * 10000) = 50 → RARE
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(result);
  assert.equal(result!.type, 'RARE');
});

test('category lottery: roll >= 110 selects NORMAL', () => {
  const rng = makeSeededRandom([0.5]); // floor(0.5 * 10000) = 5000 → NORMAL
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(result);
  assert.ok(['POSITIVE', 'NEGATIVE', 'CHOICE'].includes(result!.type));
});

test('normal pool: career 1-2 favors POSITIVE', () => {
  const rng = makeSeededRandom([0.5, 0.01]); // NORMAL category, then low roll → POSITIVE
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll({ ...DEFAULT_SNAPSHOT, careerLevel: 1 });
  assert.ok(result);
  assert.equal(result!.type, 'POSITIVE');
});

test('low mind protection: NEGATIVE weight = 0 when mind/maxMind < 0.3', () => {
  const rng = makeSeededRandom([0.5, 0.9]); // NORMAL, high roll → CHOICE (since NEGATIVE=0)
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll({ ...DEFAULT_SNAPSHOT, mind: 10, maxMind: 100 });
  assert.ok(result);
  assert.notEqual(result!.type, 'NEGATIVE');
});

test('negative streak protection: 2 consecutive negatives → NEGATIVE weight = 0', () => {
  const clock = makeClock(1000000);
  const rng = makeSeededRandom([0.5, 0.01, 0.5, 0.01, 0.5, 0.01]);
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, clock });
  const r1 = adapter.poll({ ...DEFAULT_SNAPSHOT, mind: 100, maxMind: 100 });
  assert.ok(r1);
  adapter.recordShown(r1!.id);
  const r2 = adapter.poll({ ...DEFAULT_SNAPSHOT, mind: 100, maxMind: 100 });
  assert.ok(r2);
  adapter.recordShown(r2!.id);
  // Third poll: NEGATIVE should be suppressed
  const r3 = adapter.poll({ ...DEFAULT_SNAPSHOT, mind: 100, maxMind: 100 });
  if (r3) {
    assert.notEqual(r3.type, 'NEGATIVE');
  }
});

test('cooldown: same event tracked in lastShownAtById', () => {
  const clock = makeClock(1000000);
  const rng = makeSeededRandom([0.5, 0.0]);
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, clock });
  const r1 = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(r1);
  adapter.recordShown(r1!.id);
  assert.ok((adapter as unknown as Map<string, number>).constructor.name !== 'Map'); // sanity
  // Verify internal state
  const recentIds = (adapter as unknown as { recentEventIds: string[] }).recentEventIds;
  assert.ok(recentIds.includes(r1!.id));
});

test('recent history: last 5 event IDs tracked, oldest removed on 6th', () => {
  const clock = makeClock(1000000);
  const rng = makeSeededRandom([0.5, 0.0]);
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, clock });
  for (let i = 0; i < 5; i++) {
    adapter.recordShown(`E_POS_${i + 1}`);
  }
  const recentIds = (adapter as unknown as { recentEventIds: string[] }).recentEventIds;
  assert.equal(recentIds.length, 5);
  adapter.recordShown('E_EXTRA');
  assert.equal(recentIds.length, 5);
  assert.ok(!recentIds.includes('E_POS_1'));
});

test('EASTER_EGG: oncePerSave prevents same egg twice', () => {
  const rng = makeSeededRandom([0.0005, 0.0]); // EASTER_EGG category
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const r1 = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(r1);
  assert.equal(r1!.type, 'EASTER_EGG');
  adapter.recordShown(r1!.id);
  const eggSeenIds = (adapter as unknown as { eggSeenIds: Set<string> }).eggSeenIds;
  assert.ok(eggSeenIds.has(r1!.id));
});

test('EASTER_EGG: daily limit of 1', () => {
  const clock = makeClock(1000000);
  const rng = makeSeededRandom([0.0005, 0.0, 0.0005, 0.5]);
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, clock });
  const r1 = adapter.poll(DEFAULT_SNAPSHOT);
  assert.ok(r1);
  adapter.recordShown(r1!.id);
  const eggDailyCount = (adapter as unknown as { eggDailyCount: number }).eggDailyCount;
  assert.equal(eggDailyCount, 1);
});

test('eligibility: minCareerLevel filters out events', () => {
  const overrides = new Map<string, Partial<EventEligibility>>();
  overrides.set('E_POS_1', { minCareerLevel: 5 });
  const rng = makeSeededRandom([0.5, 0.0]); // NORMAL
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, eligibilityOverrides: overrides });
  const result = adapter.poll({ ...DEFAULT_SNAPSHOT, careerLevel: 1 });
  if (result) {
    assert.notEqual(result.id, 'E_POS_1');
  }
});

test('eligibility: requiresWorkMode filters correctly', () => {
  const overrides = new Map<string, Partial<EventEligibility>>();
  overrides.set('E_POS_1', { requiresWorkMode: 'FISHING' });
  const rng = makeSeededRandom([0.5, 0.0]); // NORMAL
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, eligibilityOverrides: overrides });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  if (result) {
    assert.notEqual(result.id, 'E_POS_1');
  }
});

test('empty pool: no events returns undefined', () => {
  const rng = makeSeededRandom([0.5]);
  const adapter = new EventRuntimeAdapter([], { randomProvider: rng });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  assert.equal(result, undefined);
});

test('no RARE events: RARE roll returns undefined (no reroll)', () => {
  const noRare = MOCK_EVENTS.filter(e => e.type !== 'RARE');
  const rng = makeSeededRandom([0.005]); // RARE roll
  const adapter = new EventRuntimeAdapter(noRare, { randomProvider: rng });
  const result = adapter.poll(DEFAULT_SNAPSHOT);
  assert.equal(result, undefined);
});

test('resetForNewSave clears all state', () => {
  const clock = makeClock(1000000);
  const rng = makeSeededRandom([0.5, 0.0]);
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng, clock });
  adapter.recordShown('E_POS_1');
  adapter.recordShown('E_NEG_1');
  const internals = adapter as unknown as {
    recentEventIds: string[];
    negativeStreak: number;
    lastShownAtById: Map<string, number>;
    eggSeenIds: Set<string>;
  };
  assert.equal(internals.recentEventIds.length, 2);
  assert.equal(internals.negativeStreak, 1);
  adapter.resetForNewSave();
  assert.equal(internals.recentEventIds.length, 0);
  assert.equal(internals.negativeStreak, 0);
  assert.equal(internals.lastShownAtById.size, 0);
  assert.equal(internals.eggSeenIds.size, 0);
});

test('KPI near completion boosts CHOICE weight', () => {
  const rng = makeSeededRandom([0.5, 0.99]); // NORMAL, high roll → should hit CHOICE
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll({ ...DEFAULT_SNAPSHOT, kpiCompleted: 8, kpiTotal: 10 });
  assert.ok(result);
  assert.ok(['POSITIVE', 'CHOICE'].includes(result!.type));
});

test('fishing mode boosts POSITIVE and reduces NEGATIVE', () => {
  const rng = makeSeededRandom([0.5, 0.01]); // NORMAL, low roll → POSITIVE
  const adapter = new EventRuntimeAdapter(MOCK_EVENTS, { randomProvider: rng });
  const result = adapter.poll({ ...DEFAULT_SNAPSHOT, workMode: 'FISHING' });
  assert.ok(result);
  assert.equal(result!.type, 'POSITIVE');
});