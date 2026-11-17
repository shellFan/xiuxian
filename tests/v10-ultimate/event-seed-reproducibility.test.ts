/**
 * V10 ULTIMATE §13 — 随机事件种子注入可复现性测试。
 * 同一随机种子必须复现完全一致的事件选取序列（加权选择 + 冷却/一次性状态）。
 */
import assert from 'node:assert/strict';
import path from 'node:path';

const { EventScheduler } = require(path.resolve(
  __dirname, '../../../..', 'tests/.compiled/assets/scripts/v2/event-engine.js',
)) as { EventScheduler: new (config?: unknown) => { pick: Function; markFired: Function; state: { firedToday: string[]; lastFiredAt: Record<string, number>; negativeStreak: number } } };

const { RandomService } = require(path.resolve(
  __dirname, '../../../..', 'tests/.compiled/assets/scripts/v2/random-service.js',
)) as { RandomService: new () => { seeded: (seed: number) => { weightedIndex: (weights: number[]) => number; int: (min: number, max: number) => number; next: () => number } } };

const { mulberry32 } = require(path.resolve(
  __dirname, '../../../..', 'tests/.compiled/assets/scripts/v2/random-service.js',
)) as { mulberry32: (seed: number) => () => number };

const eventsConfig = require(path.resolve(__dirname, '../../../..', 'assets/configs/v2/events.json')) as {
  events: Array<{
    id: string; title: string; description: string; category: string; rarity: string;
    priority: string; baseWeight: number;
  }>;
};

const randomService = new RandomService();

function makeWorld(): Record<string, unknown> {
  return {
    careerLevel: 2,
    workMode: 'WORK',
    mind: 80,
    innerDemon: 10,
    salary: 5000,
    cultivation: 100,
    weekday: 3,
    hour: 10,
    minuteOfDay: 600,
    overtimeActive: false,
    situationIds: [],
    sectId: 'JAVA_BACKEND',
    relationships: {},
    materials: {},
    ownedTechniques: [],
    ownedEquipment: [],
    eventFlags: {},
    eventWeights: {},
    evidenceTypes: [],
    destinyEventWeightMultipliers: {},
  };
}

function runSequence(seed: number, steps: number, nowBase: number): string[] {
  const engine = new EventScheduler();
  const rng = randomService.seeded(seed);
  const picked: string[] = [];
  let now = nowBase;
  for (let i = 0; i < steps; i += 1) {
    const def = engine.pick(eventsConfig.events, makeWorld(), rng, now);
    if (def) {
      picked.push(def.id);
      engine.markFired(def, now);
    }
    now += 30 * 60 * 1000; // 推进 30 分钟
  }
  return picked;
}

// 同一种子 → 完全一致的选取序列（跨引擎实例与时间起点相对一致）。
const seqA = runSequence(20261118, 20, 1000 * 60 * 600);
const seqB = runSequence(20261118, 20, 1000 * 60 * 600);
assert.deepEqual(seqB, seqA, 'same seed must reproduce the exact event sequence');
assert.ok(seqA.length > 0, 'a healthy event pool must pick something');
console.log('ok - 同种子复现事件序列（20 步，picked=' + seqA.length + '）');

// 不同种子 → 序列不同（非退化：加权选择真的消费了随机流）。
const seqC = runSequence(777, 20, 1000 * 60 * 600);
assert.notDeepEqual(seqC, seqA, 'different seeds must diverge');
console.log('ok - 不同种子序列发散');

// 引擎状态隔离：markFired 的冷却/一次性在两个实例间互不影响。
const seqD = runSequence(20261118, 20, 1000 * 60 * 600);
assert.deepEqual(seqD, seqA, 'fresh engine instances stay deterministic');
console.log('ok - 引擎实例状态隔离确定性');

console.log('v10-ultimate event seed reproducibility tests passed');
