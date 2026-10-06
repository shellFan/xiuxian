import assert from 'node:assert/strict';
import { buildTriggerSchedule, eventCountForDuration } from '../../assets/scripts/v56/task-runtime-director';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

/** ULTRA-DEEP #1 (BLOCKER regression): buildTriggerSchedule must terminate for EVERY seed. */
function testTriggerScheduleTerminates(): void {
  const t0 = Date.now();
  for (let seed = 1; seed <= 50000; seed += 1) {
    for (const count of [0, 1, 2, 3, 4, 5, 6]) {
      const pts = buildTriggerSchedule(seed, count);
      assert.equal(pts.length, count, `seed ${seed} count ${count} returns exactly ${count} points`);
      for (const p of pts) assert.ok(p >= 12 && p <= 88, `point ${p} within [12,88]`);
      for (let i = 1; i < pts.length; i++) assert.ok(pts[i] > pts[i - 1], `points strictly increasing (gap>=1) for seed ${seed}`);
    }
  }
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 30000, `50k seeds × 7 counts must finish fast (took ${elapsed}ms)`);
  // EPIC band still reachable
  assert.equal(eventCountForDuration(300 * 60) >= 3, true, 'EPIC task band yields ≥3 events');
  console.log(`trigger schedule termination passed (50k seeds in ${elapsed}ms)`);
}

/** ULTRA-DEEP #2 (HIGH regression): starting a claimed task replaces the claimed twin. */
function testClaimedTwinReplaced(): void {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(9109)),
    randomProvider: { next: mulberry32(9109) },
    battleRng: mulberry32(9109), autoSaveIntervalSeconds: 0,
  });
  try {
    facade.context.messenger.ensureInitialized();
    facade.chooseProfession('JAVA_BACKEND');
    const configs = facade.queryTaskConfigs();
    const config = configs.find((c) => c.durationSeconds <= 300) ?? configs[0];
    const r1 = facade.startTask(config.id);
    assert.ok(r1.success, 'first start ok');
    // force complete + claim
    const task = facade.context.player.activeTasks.find((t) => t.taskId === config.id)!;
    facade.context.player.activeTasks = facade.context.player.activeTasks.map((t) =>
      t.taskId === config.id ? { ...t, completed: true } : t);
    const claimed = facade.claimTask(config.id);
    assert.ok(claimed.success !== false, 'claim succeeds');
    // start the same config again — the claimed twin must be REPLACED, not stacked
    const r2 = facade.startTask(config.id);
    assert.ok(r2.success, `second start ok (got: ${(r2 as { reason?: string }).reason})`);
    const entries = facade.context.player.activeTasks.filter((t) => t.taskId === config.id);
    assert.equal(entries.length, 1, 'exactly one entry per taskId');
    assert.equal(entries[0].claimed, false, 'the surviving entry is the fresh unclaimed run');
    assert.equal(facade.context.player.activeTasks.filter((t) => t.claimed && t.taskId === config.id).length, 0,
      'no claimed revival / no stale twin');
    console.log('claimed-twin replacement passed');
  } finally {
    facade.destroy();
  }
}

testTriggerScheduleTerminates();
testClaimedTwinReplaced();
console.log('ultra-deep fixes: all tests passed');
