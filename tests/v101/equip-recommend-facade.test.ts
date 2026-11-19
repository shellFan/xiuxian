/**
 * V10.1 一键推荐装备 — GameFacade 公共 API 集成测试。
 *
 * 验证 facade.equipRecommended() → queryEquipView() 公共契约：
 *  - 推荐后每槽位已穿 = 背包该槽位评分最高（atk×2+hp 口径）
 *  - 与 UI 探针（equip-reco-probe）同一不变式
 */
import assert from 'node:assert/strict';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function makeFacade(): GameFacade {
  const facade = new GameFacade({ storage: new MemoryStorageAdapter(), board: null, battleRng: () => 0.5 });
  facade.queryAutoBattle(); // 触发 ensureStarted
  return facade;
}

function score(it: { atk: number; hp: number }): number { return it.atk * 2 + it.hp; }

/** 注入装备实例到 v64Equipment（与 equipState 同一存储路径） */
function inject(facade: GameFacade, bag: { id: string; defId: string; level: number }[], equipped: Record<string, string | null>): void {
  const player = facade.snapshot() as unknown as Record<string, unknown>;
  // snapshot 是只读投影——直接通过 facade 公共 API 拿不到 v64Equipment，
  // 但 equipRecommended 服务读取的是 player.v64Equipment；集成层通过
  // GameContext 的 player 引用（facade 内部 context）注入，与生产写入路径一致。
  const ctxPlayer = (facade as unknown as { context: { player: Record<string, unknown> } }).context.player;
  ctxPlayer.v64Equipment = { bag, equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null, ...equipped }, fragments: 0 };
  void player;
}

ok('facade.equipRecommended：换装后每槽位已穿=背包最优', () => {
  const facade = makeFacade();
  inject(facade, [
    { id: 'w1', defId: 'eq_weapon_1', level: 1 },
    { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    { id: 'a1', defId: 'eq_armor_1', level: 1 },
  ], {});
  const r = facade.equipRecommended();
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 2); // 武器+护甲
  const ev = facade.queryEquipView();
  // 不变式：每槽位已穿 = 该槽位背包评分最高
  for (const slot of ['WEAPON', 'ARMOR', 'ACCESSORY', 'RELIC'] as const) {
    const cands = ev.bag.filter(it => it.slot === slot);
    if (cands.length === 0) continue;
    const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
    const cur = ev.equipped[slot];
    assert.ok(cur, `${slot} 应已装备`);
    assert.equal(cur!.id, best.id, `${slot} 应装备最优项`);
  }
  assert.ok(ev.totalAtk > 0);
});

ok('facade.equipRecommended：空背包提示已是最优', () => {
  const facade = makeFacade();
  inject(facade, [], {});
  const r = facade.equipRecommended();
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 0);
  assert.ok(r.reason && r.reason.includes('最优'));
});

ok('facade.equipRecommended：已穿非最优时换装并保留强化等级比较', () => {
  const facade = makeFacade();
  inject(facade, [
    { id: 'w1', defId: 'eq_weapon_1', level: 5 }, // atk 5+2×4=13
    { id: 'w2', defId: 'eq_weapon_2', level: 1 }, // atk 12
  ], { WEAPON: 'w2' });
  const r = facade.equipRecommended();
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0]!.itemId, 'w1'); // 13 > 12
  const ev = facade.queryEquipView();
  assert.equal(ev.equipped.WEAPON!.id, 'w1');
});

console.log(`\n${passed} equip-recommend-facade tests passed`);
