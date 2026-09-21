import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { IdleService } from '../../assets/scripts/services/idle-service';
import {
  segmentOfflineInterval,
  type OfflineTimeCategory,
  type OfflineTimeProjection,
} from '../../assets/scripts/services/offline-time-segmenter';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';

const HOUR_MS = 60 * 60 * 1000;

function shanghaiMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour - 8, minute);
}

function categoryDurations(projection: OfflineTimeProjection): Array<[OfflineTimeCategory, number]> {
  return projection.segments.map((segment) => [segment.category, segment.durationSeconds]);
}

function testExactBoundaryInclusivity(): void {
  const cases: ReadonlyArray<readonly [string, number, OfflineTimeCategory]> = [
    ['09:00 starts work', shanghaiMs(2026, 9, 21, 9), 'WORK'],
    ['12:00 starts lunch', shanghaiMs(2026, 9, 21, 12), 'LUNCH'],
    ['13:00 resumes work', shanghaiMs(2026, 9, 21, 13), 'WORK'],
    ['18:00 starts after-hours', shanghaiMs(2026, 9, 21, 18), 'AFTER_HOURS'],
    ['weekday 00:00 is recovery', shanghaiMs(2026, 9, 21), 'RECOVERY'],
    ['Saturday 00:00 starts weekend', shanghaiMs(2026, 9, 26), 'WEEKEND'],
  ];

  for (const [description, startMs, category] of cases) {
    const projection = segmentOfflineInterval(startMs, startMs + HOUR_MS, 8 * 3600);
    assert.deepEqual(categoryDurations(projection), [[category, 3600]], description);
  }
}

function testCrossesWorkAndAfterHours(): void {
  const startMs = shanghaiMs(2026, 9, 21, 17, 30);
  const endMs = shanghaiMs(2026, 9, 21, 20, 30);
  const projection = segmentOfflineInterval(startMs, endMs, 8 * 3600);

  assert.equal(projection.startMs, startMs);
  assert.equal(projection.effectiveEndMs, endMs);
  assert.equal(projection.elapsedSeconds, 3 * 3600);
  assert.equal(projection.capped, false);
  assert.deepEqual(categoryDurations(projection), [
    ['WORK', 30 * 60],
    ['AFTER_HOURS', 2.5 * 3600],
  ]);
  assert.deepEqual(projection.secondsByCategory, {
    WORK: 30 * 60,
    LUNCH: 0,
    AFTER_HOURS: 2.5 * 3600,
    RECOVERY: 0,
    WEEKEND: 0,
  });
}

function testCrossesMidnightIntoWeekend(): void {
  const startMs = shanghaiMs(2026, 9, 25, 23, 30);
  const endMs = shanghaiMs(2026, 9, 26, 0, 30);
  const projection = segmentOfflineInterval(startMs, endMs, 8 * 3600);

  assert.deepEqual(categoryDurations(projection), [
    ['AFTER_HOURS', 30 * 60],
    ['WEEKEND', 30 * 60],
  ]);
}

function testGlobalCapIsAppliedBeforeSplitting(): void {
  const startMs = shanghaiMs(2026, 9, 25, 17, 30);
  const requestedEndMs = shanghaiMs(2026, 9, 26, 10, 30);
  const projection = segmentOfflineInterval(startMs, requestedEndMs, 8 * 3600);

  assert.equal(projection.effectiveEndMs, startMs + 8 * HOUR_MS);
  assert.equal(projection.elapsedSeconds, 8 * 3600);
  assert.equal(projection.capped, true);
  assert.deepEqual(categoryDurations(projection), [
    ['WORK', 30 * 60],
    ['AFTER_HOURS', 6 * 3600],
    ['WEEKEND', 1.5 * 3600],
  ]);
  assert.equal(projection.segments[projection.segments.length - 1]?.endMs, startMs + 8 * HOUR_MS);
}

function testEmptyAndInvalidInputs(): void {
  const instant = shanghaiMs(2026, 9, 21, 9);
  const empty = segmentOfflineInterval(instant, instant, 8 * 3600);
  assert.equal(empty.elapsedSeconds, 0);
  assert.deepEqual(empty.segments, []);
  assert.throws(() => segmentOfflineInterval(Number.NaN, instant, 8 * 3600), /finite Unix epoch milliseconds/);
  assert.throws(() => segmentOfflineInterval(instant, Number.POSITIVE_INFINITY, 8 * 3600), /finite Unix epoch milliseconds/);
  assert.throws(() => segmentOfflineInterval(instant, instant + HOUR_MS, 0), /positive finite maximum/);
}

function testIdleServiceConsumesProjectionAggregate(): void {
  const startMs = shanghaiMs(2026, 9, 21, 17, 30);
  const endMs = shanghaiMs(2026, 9, 21, 20, 30);
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(endMs);
  const player = new PlayerData({ lastSaveTime: startMs, careerLevel: 1 });
  const context = new GameContext({ player, saveService: new SaveService(storage, 'game-save', clock), storage });
  context.board!.place(WorkerEntity.create(1), { row: 0, column: 0 });
  const idle = new IdleService(context, {
    clock,
    salaryPerHour: 10,
    cultivationPerHour: 8,
    spiritStonesPerHour: 6,
  });

  assert.deepEqual(idle.preview('segmented-preview'), {
    salary: 30,
    cultivationExp: 24,
    spiritStones: 18,
    elapsedSeconds: 3 * 3600,
    capped: false,
    duplicate: false,
  });
}

testExactBoundaryInclusivity();
testCrossesWorkAndAfterHours();
testCrossesMidnightIntoWeekend();
testGlobalCapIsAppliedBeforeSplitting();
testEmptyAndInvalidInputs();
testIdleServiceConsumesProjectionAggregate();
console.log('offline boundary tests passed');
