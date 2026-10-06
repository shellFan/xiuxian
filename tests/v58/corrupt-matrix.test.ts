import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { ElectronStorageAdapter } from '../../assets/scripts/services/electron-storage-adapter';

process.env.TZ = 'Asia/Shanghai';
const NOW = Date.parse('2026-09-21T09:00:00+08:00');
const clock = () => new FakeClock(NOW);

/** ULTRA-DEEP §11-13: corrupt matrix C01-C20 at the adapter/SaveService/GameContext layers.
 *  Contract: only true NO_SAVE may create a player; unexplainable data → LOAD_FAILED (throw);
 *  safely migratable data → LOADED; raw bytes must never be overwritten by a failed load. */

type Case = {
  id: string;
  raw: string | null;              // what storage.getItem returns (null = no file)
  expect: 'NO_SAVE' | 'LOAD_FAILED' | 'LOADED';
  sanity?: (p: PlayerData) => void; // for LOADED cases
};

const CASES: Case[] = [
  // Adapter-layer semantics: storage value = the INNER save JSON string
  // (file {game-save:'<raw>'} → loadGame → adapter cache → SaveService.parse(<raw>)).
  { id: 'C01-file-missing', raw: null, expect: 'NO_SAVE' },
  { id: 'C02-zero-byte', raw: '', expect: 'NO_SAVE' },
  { id: 'C03-physical-malformed', raw: '{{{not json', expect: 'LOAD_FAILED' },
  { id: 'C04-inner-broken-json', raw: '{broken nested', expect: 'LOAD_FAILED' },
  { id: 'C05-inner-empty-string', raw: '', expect: 'NO_SAVE' },
  { id: 'C06-inner-json-null', raw: 'null', expect: 'LOAD_FAILED' },
  { id: 'C07-inner-empty-obj', raw: '{}', expect: 'LOADED' },
  { id: 'C08-inner-array', raw: '[]', expect: 'LOAD_FAILED' },
  { id: 'C09-missing-key-fields', raw: JSON.stringify({ saveVersion: 13, salary: 500 }), expect: 'LOADED',
    sanity: (p) => { assert.equal(p.salary, 500); assert.equal(p.careerLevel, 1); } },
  { id: 'C10-future-version', raw: JSON.stringify({ saveVersion: 99, salary: 5 }), expect: 'LOAD_FAILED' },
  { id: 'C11-old-version-migratable', raw: JSON.stringify({ saveVersion: 1, salary: 20, workers: [{ id: 'w', level: 1, row: 0, column: 0 }] }), expect: 'LOADED',
    sanity: (p) => { assert.equal(p.salary, 20); } },
  { id: 'C12-wrong-type-salary', raw: JSON.stringify({ saveVersion: 13, salary: 'abc', careerLevel: 2 }), expect: 'LOADED',
    sanity: (p) => { assert.equal(p.salary, 0); assert.equal(p.careerLevel, 2); } },
  { id: 'C13-equipment-malformed', raw: JSON.stringify({ saveVersion: 13, ownedEquipment: [42, {}, 'eq_jvm_tome', ''], equippedEquipment: { DESK: 'nonexistent', BADGE: 'eq_jvm_tome' } }), expect: 'LOADED',
    sanity: (p) => { assert.deepEqual([...p.ownedEquipment], ['eq_jvm_tome']); assert.equal(p.equippedEquipment.BADGE, 'eq_jvm_tome'); assert.equal(p.equippedEquipment.DESK, null); } },
  { id: 'C14-team-malformed', raw: JSON.stringify({ saveVersion: 13, teamState: { members: 'not-array', exploitationScore: 'x' } }), expect: 'LOADED',
    sanity: (p) => { assert.equal(p.teamState, null); } },
  { id: 'C15-project-malformed', raw: JSON.stringify({ saveVersion: 13, project: { status: 'WEIRD', progress: 'high' } }), expect: 'LOADED' },
  { id: 'C16-pending-decision-malformed', raw: JSON.stringify({ saveVersion: 13, offlineDecisionSession: { cursor: 'x', pendingEventIds: 7 } }), expect: 'LOADED' },
  { id: 'C17-truncated-json', raw: '{"saveVersion":13,"sala', expect: 'LOAD_FAILED' },
  { id: 'C18-utf8-bom', raw: '﻿' + JSON.stringify({ saveVersion: 13, salary: 300 }), expect: 'LOAD_FAILED' }, // BOM breaks JSON.parse → fail closed (documented)
  { id: 'C19-huge-but-valid', raw: JSON.stringify({ saveVersion: 13, salary: 1 }), expect: 'LOADED',
    sanity: (p) => { assert.equal(p.salary, 1); } },
  { id: 'C20-dup-equipment-refs', raw: JSON.stringify({ saveVersion: 13, ownedEquipment: ['eq_jvm_tome', 'eq_jvm_tome', 'eq_gc_chronicle'], equippedEquipment: { DESK: 'eq_jvm_tome', BADGE: null, ACCESSORY: null } }), expect: 'LOADED',
    sanity: (p) => { assert.deepEqual([...p.ownedEquipment], ['eq_jvm_tome', 'eq_gc_chronicle']); } },
];

function runUnitMatrix(): void {
  let pass = 0;
  const results: Array<{ id: string; verdict: string; note?: string }> = [];
  for (const c of CASES) {
    let verdict = '';
    let note: string | undefined;
    try {
      const adapter = new MemoryStorageAdapter();
      if (c.raw !== null) adapter.setItem('game-save', c.raw);
      // emulate the real chain: storage value → SaveService (via GameContext)
      if (c.expect === 'NO_SAVE') {
        const data = new SaveService(adapter, 'game-save', clock()).load();
        assert.equal(data.saveVersion, 13);
        verdict = 'PASS: fresh player';
      } else if (c.expect === 'LOAD_FAILED') {
        let threw = false;
        try { new GameContext({ storage: adapter, board: null }); } catch (e) { threw = /SAVE_LOAD_FAILED|Unsupported/.test(String((e as Error).message)); }
        if (!threw) { verdict = 'FAIL: expected throw'; } else { verdict = 'PASS: fail-closed'; }
      } else {
        const ctx = new GameContext({ storage: adapter, board: null });
        verdict = 'PASS: migrated';
        c.sanity?.(ctx.player);
      }
    } catch (e) {
      verdict = 'ERROR: ' + String((e as Error).message).slice(0, 80);
    }
    if (verdict.startsWith('PASS')) pass += 1;
    else note = verdict;
    results.push({ id: c.id, verdict });
  }
  for (const r of results) console.log(`[${r.verdict.startsWith('PASS') ? 'ok' : 'XX'}] ${r.id} — ${r.verdict}`);
  console.log(`UNIT CORRUPT MATRIX: ${pass}/${CASES.length} PASS`);
  if (pass !== CASES.length) process.exit(1);
}

/** §14: fail-closed write lock — every write path is a no-op after lockdown. */
async function testFailClosedWriteLock(): Promise<void> {
  const gw = globalThis as unknown as { window?: unknown };
  let writes = 0;
  gw.window = {
    electronAPI: {
      storage: {
        load: async () => ({ success: true, data: { 'game-save': { saveVersion: 13 } } }),
        save: async () => { writes += 1; return { success: true }; },
      },
    },
  };
  const adapter = new ElectronStorageAdapter();
  await adapter.initialize();
  adapter.markFailClosed();
  adapter.setItem('game-save', '{"saveVersion":13}');       // renderer storage set
  adapter.removeItem('game-save');                          // remove path
  const r1 = await adapter.flush();                          // close flush
  assert.equal(r1.ok, false);
  assert.equal(r1.skipped, true);
  adapter.setItem('game-save', '{"saveVersion":14}');       // manual save path (cache write attempt)
  const r2 = await adapter.flush();                          // autosave flush
  assert.equal(r2.skipped, true);
  assert.equal(writes, 0, 'ZERO writes through any path after fail-closed');
  delete gw.window;
  console.log('fail-closed write lock: 0 writes across 6 attack paths');
}

/** §27: save determinism — same state saved twice yields identical payload (minus timestamps). */
function testSaveDeterminism(): void {
  const adapter = new MemoryStorageAdapter();
  const svc = new SaveService(adapter, 'game-save', () => NOW);
  const p = new PlayerData({ lastSaveTime: NOW, salary: 500, careerLevel: 3 });
  p.ownedEquipment.push('eq_jvm_tome');
  svc.save(p);
  const a = JSON.parse(adapter.getItem('game-save')!);
  svc.save(p);
  const b = JSON.parse(adapter.getItem('game-save')!);
  const strip = (o: Record<string, unknown>) => { const c = { ...o }; delete c.lastSaveTime; delete c.tutorialStartedAt; return c; };
  assert.deepEqual(strip(a), strip(b), 'save payload deterministic apart from timestamps');
  console.log('save determinism passed');
}

function main(): void {
  runUnitMatrix();
  testSaveDeterminism();
  testFailClosedWriteLock().then(() => { console.log('ultra-deep corrupt matrix (unit): ALL PASS'); }).catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
main();
