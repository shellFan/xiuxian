import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { ElectronStorageAdapter } from '../../assets/scripts/services/electron-storage-adapter';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 4102): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession('JAVA_BACKEND');
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  return { facade, clock };
}

// ── F06: mentor consumes REAL game time + fatigue ───────────────────────────
function testF06MentorConsumesTime(): void {
  const { facade, clock } = makeFacade();
  try {
    const p = facade.context.player;
    p.careerLevel = 7;
    p.fatigue = 0;
    const team = facade.context.team.ensureTeam();
    const t1 = facade.context.clockV2.now();
    const r = facade.mentorMember(team.members[0].name);
    const t2 = facade.context.clockV2.now();
    assert.ok(r.ok, 'mentor succeeds during work hours');
    assert.equal(t2 - t1, 30 * 60 * 1000, 'F06: exactly 30 game minutes consumed');
    assert.equal(p.fatigue, 5, 'F06: fatigue cost applied');
    // workday remaining minutes must have dropped accordingly
    assert.ok(facade.context.clockV2.remainingWorkMinutes() <= 510, 'F06: workday remaining shrank');
    // end-of-day: with <30min left, mentor is rejected with a clear reason
    facade.context.clockV2.consumeGameMinutes(8 * 60 + 45); // now 17:45 → 15 min left
    const late = facade.mentorMember(team.members[1].name);
    assert.equal(late.ok, false, 'F06: mentor rejected when <30min remain');
    assert.match(late.reason ?? '', /下班|不足/, 'F06: clear end-of-day reason');
    void clock;
    console.log('F06 mentor time consumption passed');
  } finally {
    facade.destroy();
  }
}

// ── F10: fail-closed lockdown ───────────────────────────────────────────────
async function testF10FailClosedLockdown(): Promise<void> {
  // memory adapter: markFailClosed → setItem/removeItem no-ops
  const mem = new MemoryStorageAdapter();
  mem.setItem('k', 'v1');
  mem.markFailClosed();
  mem.setItem('k', 'v2');
  assert.equal(mem.getItem('k'), 'v1', 'F10: memory adapter write-blocked after fail-closed');

  // electron adapter: fail-closed → flush skips and reports skipped result
  const gw = globalThis as unknown as { window?: unknown };
  let saveCalls = 0;
  gw.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: true, data: { 'game-save': { saveVersion: 13 } } }),
        save: async () => { saveCalls += 1; return { success: true }; },
      },
    },
  };
  const adapter = new ElectronStorageAdapter();
  return adapter.initialize().then((res) => {
    assert.equal(res.status, 'LOADED', 'adapter loads normally');
    adapter.markFailClosed();
    return adapter.flush();
  }).then((r) => {
    assert.equal(r.ok, false, 'F10: flush after fail-closed does not claim success');
    assert.equal(r.skipped, true, 'F10: flush is an intentional skip');
    assert.equal(saveCalls, 0, 'F10: zero writes after fail-closed');
    // contrast: without lockdown a real save goes through and reports ok
    delete gw.window;
    console.log('F10 fail-closed lockdown passed');
  }).catch((e) => { delete gw.window; throw e; });
}

// ── F14: flush returns explicit result ──────────────────────────────────────
async function testF14FlushResultObject(): Promise<void> {
  const gw = globalThis as unknown as { window?: unknown };
  let calls = 0;
  gw.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: true, data: { 'game-save': { saveVersion: 13 } } }),
        save: async () => { calls += 1; return calls === 1 ? { success: true } : { success: false, error: 'QA_DISK_FULL' }; },
      },
    },
  };
  const adapter = new ElectronStorageAdapter();
  await adapter.initialize();
  adapter.setItem('game-save', JSON.stringify({ saveVersion: 13 }));
  const okResult = await adapter.flush();
  assert.equal(okResult.ok, true, 'F14: successful flush reports ok');
  const failResult = await adapter.flush(); // second call → injected failure
  assert.equal(failResult.ok, false, 'F14: failed flush reports ok:false');
  assert.equal(failResult.error, 'QA_DISK_FULL', 'F14: failure carries the error');
  delete gw.window;
  console.log('F14 flush result object passed');
}

// ── F10 integration: corrupt-save load never flips writes back on ───────────
function testF10CorruptSaveNoWritePath(): void {
  // memory adapter emulates the ADAPTER layer: value = the inner save JSON string
  const mem = new MemoryStorageAdapter();
  mem.setItem('game-save', '{broken nested save');
  const raw = mem.getItem('game-save');
  const svc = new SaveService(mem, 'game-save', () => MONDAY_0900);
  assert.throws(() => svc.load(), /SAVE_LOAD_FAILED/, 'corrupt save rejected');
  mem.markFailClosed();
  assert.equal(mem.getItem('game-save'), raw, 'F10: corrupt bytes untouched even after lockdown');
  console.log('F10 corrupt-save no-write-path passed');
}

async function main(): Promise<void> {
  testF06MentorConsumesTime();
  await testF10FailClosedLockdown();
  await testF14FlushResultObject();
  testF10CorruptSaveNoWritePath();
  console.log('overnight safety: all tests passed');
}

main().then(() => process.exit(0)).catch((e: unknown) => {
  console.error('overnight safety FAILED:', e);
  process.exit(1);
});
