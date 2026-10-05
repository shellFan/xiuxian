import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { ElectronStorageAdapter } from '../../assets/scripts/services/electron-storage-adapter';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveLoadError, SaveService } from '../../assets/scripts/services/save-service';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

/**
 * V5.8 Release Safety Recovery Round 3 — formal regression tests for F01–F09.
 * 每条测试对应 Codex QA 打包 EXE 独立验收发现的一个缺陷。
 */

// ── F01 BLOCKER: nested corrupt save must fail closed ──────────────────────
function testF01CorruptSaveFailsClosed(): void {
  // 1. Nested corrupt JSON in storage — load() must throw, never silently new-save
  var adapter = new MemoryStorageAdapter();
  adapter.setItem('game-save', '{"saveVersion":13,"workers":[{"broken":');
  var clock = new FakeClock(MONDAY_0900);
  var svc = new SaveService(adapter, 'game-save', clock);
  assert.throws(() => svc.load(), SaveLoadError, 'corrupt save → SaveLoadError');
  assert.throws(() => svc.load(), /SAVE_LOAD_FAILED/, 'error tagged SAVE_LOAD_FAILED');

  // 2. Raw data must be untouched — no autosave may overwrite it
  assert.equal(adapter.getItem('game-save'), '{"saveVersion":13,"workers":[{"broken":', 'corrupt bytes unchanged after failed load');

  // 3. A second SaveService on the same storage still fails (no new-save on reload)
  var svc2 = new SaveService(adapter, 'game-save', clock);
  assert.throws(() => svc2.load(), SaveLoadError, 'reload still fails closed');

  // 4. NO_SAVE (empty storage) still creates a fresh save — the safe path must keep working
  var emptyAdapter = new MemoryStorageAdapter();
  var fresh = new SaveService(emptyAdapter, 'game-save', clock).load();
  assert.equal(fresh.saveVersion, 13, 'empty storage → fresh v13 save');

  // 5. Semantically corrupt (version too new / wrong shape) also fails closed
  var futureAdapter = new MemoryStorageAdapter();
  futureAdapter.setItem('game-save', JSON.stringify({ saveVersion: 99, workers: [] }));
  assert.throws(() => new SaveService(futureAdapter, 'game-save', clock).load(), SaveLoadError, 'future version → SaveLoadError');

  // 6. Unsupported shape (non-record) fails closed
  var junkAdapter = new MemoryStorageAdapter();
  junkAdapter.setItem('game-save', '"just a string"');
  assert.throws(() => new SaveService(junkAdapter, 'game-save', clock).load(), SaveLoadError, 'non-record save → SaveLoadError');

  console.log('F01 corrupt-save fail-closed passed');
}

// ── F01×F05: ElectronStorageAdapter fail-closed persist guard ──────────────
async function testF01AdapterFailClosedPersist(): Promise<void> {
  var globalWindow = globalThis as unknown as { window?: unknown };

  // Case 1: LOAD_FAILED — flush() must NOT write anything (SHA invariant)
  var saveCalls = 0;
  globalWindow.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: false, error: 'SAVE_LOAD_FAILED: corrupted' }),
        save: async () => { saveCalls += 1; return { success: true }; },
      },
    },
  };
  var failedAdapter = new ElectronStorageAdapter();
  var result = await failedAdapter.initialize();
  assert.equal(result.status, 'LOAD_FAILED', 'load failure → LOAD_FAILED');
  await failedAdapter.flush();
  assert.equal(saveCalls, 0, 'F01×F05: no persist after LOAD_FAILED (empty cache must not clobber corrupt save)');

  // Case 2: NO_SAVE with empty cache — flush must not create a "{}" file
  globalWindow.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: true, data: null }),
        save: async () => { saveCalls += 1; return { success: true }; },
      },
    },
  };
  var freshAdapter = new ElectronStorageAdapter();
  var freshResult = await freshAdapter.initialize();
  assert.equal(freshResult.status, 'NO_SAVE', 'no data → NO_SAVE');
  await freshAdapter.flush();
  assert.equal(saveCalls, 0, 'empty cache → no persist (no {} clobber)');

  // Case 3: real setItem persists; IPC failure → LOAD_FAILED not NO_SAVE
  freshAdapter.setItem('game-save', JSON.stringify({ saveVersion: 13 }));
  await freshAdapter.flush();
  assert.equal(saveCalls, 1, 'real save persists exactly once');

  // Case 4: IPC reported failure (success:false) → LOAD_FAILED
  globalWindow.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: false, error: 'disk error' }),
        save: async () => { saveCalls += 1; return { success: true }; },
      },
    },
  };
  var ipcFailAdapter = new ElectronStorageAdapter();
  var ipcFailResult = await ipcFailAdapter.initialize();
  assert.equal(ipcFailResult.status, 'LOAD_FAILED', 'IPC success:false → LOAD_FAILED');

  // Case 5: IPC rejection → LOAD_FAILED (not NO_SAVE — this is the F01 root)
  globalWindow.window = {
    electronAPI: {
      storage: {
        load: () => Promise.reject(new Error('EIO')),
        save: async () => { saveCalls += 1; return { success: true }; },
      },
    },
  };
  var rejectAdapter = new ElectronStorageAdapter();
  var rejectResult = await rejectAdapter.initialize();
  assert.equal(rejectResult.status, 'LOAD_FAILED', 'IPC rejection → LOAD_FAILED');
  await rejectAdapter.flush();
  assert.equal(saveCalls, 1, 'still no write after rejection');

  delete globalWindow.window;
  console.log('F01 adapter fail-closed persist passed');
}

// ── F02: equipment + pendingOffer survive save/reload ──────────────────────
function testF02EquipmentAndOfferRoundTrip(): void {
  var adapter = new MemoryStorageAdapter();
  var clock = new FakeClock(MONDAY_0900);
  var p1 = new PlayerData({ lastSaveTime: clock.now() });
  p1.ownedEquipment.push('eq_jvm_tome', 'eq_gc_chronicle', 'eq_mech_keyboard');
  p1.equippedEquipment = { DESK: 'eq_mech_keyboard', BADGE: 'eq_gc_chronicle', ACCESSORY: null };
  p1.pendingOffer = {
    offerId: 'offer_r3', dayIndex: 1, expiresAtDay: 4,
    companyId: 'COMP_FOREIGN', companyName: '外企宗',
    salaryDeltaPct: 18, overtimeDeltaPct: -50, incidentDeltaPct: -30, promotionDeltaPct: -15, lootDeltaPct: 10,
    pitch: 'round-trip',
  };
  var svc = new SaveService(adapter, 'game-save', clock);
  svc.save(p1);

  // Fresh load through a second SaveService (migrate → hydrate)
  var loaded = new SaveService(adapter, 'game-save', clock).load();
  var p2 = new PlayerData(loaded);
  assert.deepEqual([...p2.ownedEquipment], ['eq_jvm_tome', 'eq_gc_chronicle', 'eq_mech_keyboard'], 'F02: ownedEquipment exact round trip (not [{}])');
  assert.equal(p2.equippedEquipment.DESK, 'eq_mech_keyboard', 'F02: equipped DESK survives');
  assert.equal(p2.equippedEquipment.BADGE, 'eq_gc_chronicle', 'F02: equipped BADGE survives');
  assert.equal(p2.equippedEquipment.ACCESSORY, null, 'F02: empty slot stays null');
  assert.ok(p2.pendingOffer, 'F02: pendingOffer survives restart');
  assert.equal(p2.pendingOffer!.offerId, 'offer_r3', 'F02: offer id intact');
  assert.equal(p2.pendingOffer!.salaryDeltaPct, 18, 'F02: offer terms intact');

  // and again — double round trip must stay stable
  var svc2 = new SaveService(adapter, 'game-save', clock);
  svc2.save(p2);
  var p3 = new PlayerData(new SaveService(adapter, 'game-save', clock).load());
  assert.deepEqual([...p3.ownedEquipment], ['eq_jvm_tome', 'eq_gc_chronicle', 'eq_mech_keyboard'], 'F02: second round trip stable');
  console.log('F02 equipment/offer round trip passed');
}

// ── F03: team daily state survives save/reload ─────────────────────────────
function testF03TeamDailyStateRoundTrip(): void {
  var adapter = new MemoryStorageAdapter();
  var clock = new FakeClock(MONDAY_0900);
  var p1 = new PlayerData({ lastSaveTime: clock.now() });
  p1.careerLevel = 7;
  p1.teamState = {
    members: [
      { npcId: 'm1', name: '实习生小陈', profession: '后端', level: 1, mood: 80, workload: 0, fatigue: 0, trustPlayer: 50, growth: 0, mentoredByPlayer: true, specialty: 'CRUD' },
      { npcId: 'm2', name: '初级小李', profession: '前端', level: 2, mood: 70, workload: 0, fatigue: 0, trustPlayer: 50, growth: 3, mentoredByPlayer: false, specialty: '切图' },
    ],
    exploitationScore: 0,
    protectionScore: 0,
    dailyAssignment: { day: 1, count: 3 },
    dailyMentorship: { day: 1, count: 2 },
  };
  new SaveService(adapter, 'game-save', clock).save(p1);
  var p2 = new PlayerData(new SaveService(adapter, 'game-save', clock).load());
  assert.ok(p2.teamState, 'F03: teamState survives');
  assert.deepEqual(p2.teamState!.dailyAssignment, { day: 1, count: 3 }, 'F03: numeric assignment counter survives (cap intact after restart)');
  assert.deepEqual(p2.teamState!.dailyMentorship, { day: 1, count: 2 }, 'F03: numeric mentorship counter survives');
  assert.equal(p2.teamState!.members.length, 2, 'F03: members survive');
  console.log('F03 team daily state round trip passed');
}

// ── F04: save failure propagates to the caller ─────────────────────────────
function testF04SaveFailurePropagates(): void {
  class DiskFullAdapter extends MemoryStorageAdapter {
    public setItem(_key: string, _value: string): void {
      throw new Error('DISK_FULL');
    }
  }
  var clock = new FakeClock(MONDAY_0900);
  var facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new DiskFullAdapter(), board: null,
    randomV2: new RandomService(mulberry32(11)),
    randomProvider: { next: mulberry32(11) },
    battleRng: mulberry32(11), autoSaveIntervalSeconds: 0,
  });
  try {
    assert.throws(() => facade.save(), /DISK_FULL/, 'F04: facade.save() propagates storage failure');
  } finally {
    facade.destroy();
  }
  console.log('F04 save failure propagation passed');
}

// ── F05: expired offer cannot be decided ───────────────────────────────────
function testF05ExpiredOfferRejected(): void {
  var clock = new FakeClock(MONDAY_0900);
  var facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(13)),
    randomProvider: { next: mulberry32(13) },
    battleRng: mulberry32(13), autoSaveIntervalSeconds: 0,
  });
  try {
    var p = facade.context.player;
    var day = p.gameDay?.dayIndex ?? 1;
    p.pendingOffer = {
      offerId: 'offer_old', dayIndex: day, expiresAtDay: day + 1,
      companyId: 'COMP_BIG', companyName: '大厂宗',
      salaryDeltaPct: 20, overtimeDeltaPct: 30, incidentDeltaPct: 0, promotionDeltaPct: 0, lootDeltaPct: 0,
      pitch: 'expired',
    };
    // Advance past expiry
    p.gameDay = { ...(p.gameDay as { dayIndex: number }), dayIndex: day + 3 } as never;
    assert.equal(facade.queryOffer(), null, 'F05: pending() auto-clears expired offer');
    var r = facade.decideOffer('ACCEPTED');
    assert.equal(r.ok, false, 'F05: decide() rejects expired offer');
    var history = p.offerHistory ?? [];
    assert.ok(history.some((h) => h.companyId === 'COMP_BIG' && h.decision === 'DECLINED'), 'F05: expiry recorded as DECLINED in history');
    console.log('F05 expired offer rejection passed');
  } finally {
    facade.destroy();
  }
}

// ── F08: build manifest covers ALL desktop runtime inputs ──────────────────
function testF08ManifestCoversRuntimeInputs(): void {
  var manifestSrc = fs.readFileSync(path.join(process.cwd(), 'scripts', 'build-manifest.cjs'), 'utf8');
  // The desktopFiles list inside computeInputsHash is the single source of truth
  var required = ['storage.cjs', 'game-server.cjs', 'main.cjs', 'preload.cjs', 'ui-overlay.js', 'ui-overlay-v2.js', 'ui-overlay.css', 'patch-html.cjs'];
  for (var f of required) {
    assert.ok(manifestSrc.includes(`'${f}'`), `F08: build manifest must hash desktop/${f}`);
  }
  // And the manifest module itself must load cleanly
  var manifest = require(path.join(process.cwd(), 'scripts', 'build-manifest.cjs'));
  var hash = manifest.computeInputsHash();
  assert.ok(/^[0-9a-f]{64}$/.test(hash), 'F08: inputsHash deterministic SHA256');
  var hash2 = manifest.computeInputsHash();
  assert.equal(hash, hash2, 'F08: inputsHash stable across calls');
  console.log('F08 manifest runtime-input coverage passed');
}

async function main(): Promise<void> {
  testF01CorruptSaveFailsClosed();
  await testF01AdapterFailClosedPersist();
  testF02EquipmentAndOfferRoundTrip();
  testF03TeamDailyStateRoundTrip();
  testF04SaveFailurePropagates();
  testF05ExpiredOfferRejected();
  testF08ManifestCoversRuntimeInputs();
}

main().then(() => {
  console.log('release-safety-r3: all tests passed');
}).catch((e) => {
  console.error('release-safety-r3 FAILED:', e);
  process.exit(1);
});
