import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { CareerEventScheduler } from '../../assets/scripts/services/career-event-scheduler';

function testFixedClockAndRngScheduleMinimumInterval(): void {
  const clock = new FakeClock(1_000);
  const scheduler = new CareerEventScheduler({
    clock,
    randomProvider: new FixedRandomProvider(0),
    minIntervalMs: 3 * 60 * 1000,
    maxIntervalMs: 8 * 60 * 1000,
  });

  assert.equal(scheduler.isDue(), false, 'first poll only schedules, does not fire');
  clock.advance(179_999);
  assert.equal(scheduler.isDue(), false);
  clock.advance(1);
  assert.equal(scheduler.isDue(), true);
}

function testPauseBlocksDueUntilResume(): void {
  const clock = new FakeClock(0);
  const scheduler = new CareerEventScheduler({
    clock,
    randomProvider: new FixedRandomProvider(0),
    minIntervalMs: 1_000,
    maxIntervalMs: 1_000,
  });
  scheduler.isDue();
  clock.advance(1_000);
  scheduler.pause();
  assert.equal(scheduler.isPaused(), true);
  assert.equal(scheduler.isDue(), false, 'paused scheduler must not fire');
  scheduler.resume();
  assert.equal(scheduler.isDue(), true);
}

function testDestroyStopsScheduling(): void {
  const clock = new FakeClock(0);
  const scheduler = new CareerEventScheduler({
    clock,
    randomProvider: new FixedRandomProvider(0),
    minIntervalMs: 1_000,
    maxIntervalMs: 1_000,
  });
  scheduler.isDue();
  clock.advance(1_000);
  scheduler.destroy();
  assert.equal(scheduler.isDue(), false);
  scheduler.resume();
  assert.equal(scheduler.isDue(), false, 'destroy is terminal');
}

function testMarkTriggeredReschedulesNextInterval(): void {
  const clock = new FakeClock(0);
  const scheduler = new CareerEventScheduler({
    clock,
    randomProvider: new FixedRandomProvider(0),
    minIntervalMs: 5_000,
    maxIntervalMs: 5_000,
  });
  scheduler.isDue();
  clock.advance(5_000);
  assert.equal(scheduler.isDue(), true);
  scheduler.markTriggered();
  assert.equal(scheduler.isDue(), false);
  clock.advance(4_999);
  assert.equal(scheduler.isDue(), false);
  clock.advance(1);
  assert.equal(scheduler.isDue(), true);
}

testFixedClockAndRngScheduleMinimumInterval();
testPauseBlocksDueUntilResume();
testDestroyStopsScheduling();
testMarkTriggeredReschedulesNextInterval();
console.log('career event scheduler tests passed');
