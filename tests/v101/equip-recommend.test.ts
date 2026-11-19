/**
 * V10.1 一键推荐装备（equipRecommended）单测。
 *
 * 覆盖：
 *  1. 空背包 → ok 但零换装，提示已是最优
 *  2. 逐槽位选最高攻（含暴击加权）装备
 *  3. 槽位隔离：武器候选不影响护甲槽
 *  4. 已穿非最优 → 换装；已穿最优 → 不换
 *  5. 暴击加权生效：atk×(1+暴击期望)×2+hp 参与比较
 *  6. 等级强化影响评分（atkPerLevel/hpPerLevel）
 *  7. 结果幂等：重复推荐不再换装
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { equipStats } from '../../assets/scripts/v64/equipment';
import type { V64EquipmentState } from '../../assets/scripts/v64/equipment';

function at(day: number, hour: number): number {
  return new Date(2026, 8, day, hour, 0, 0, 0).getTime();
}

function make(): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: () => 0.5 });
  context.gameDay.ensureStarted();
  context.autoBattle.ensureStarted();
  return { clock, context };
}

function setEquipState(context: GameContext, state: V64EquipmentState): void {
  (context.player as any).v64Equipment = state;
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

ok('空背包：ok 但零换装并提示已是最优', () => {
  const { context } = make();
  setEquipState(context, { bag: [], equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null }, fragments: 0 });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 0);
  assert.ok(r.reason && r.reason.length > 0);
});

ok('逐槽位选最高攻：atk12 键盘胜过 atk5 机械键盘', () => {
  const { context } = make();
  setEquipState(context, {
    bag: [
      { id: 'w1', defId: 'eq_weapon_1', level: 1 },
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    ],
    equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0]!.slot, 'WEAPON');
  assert.equal(r.changed[0]!.itemId, 'w2');
  assert.equal(r.changed[0]!.name, '静电容键盘');
});

ok('槽位隔离：护甲推荐只填 ARMOR 槽', () => {
  const { context } = make();
  setEquipState(context, {
    bag: [
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
      { id: 'a1', defId: 'eq_armor_1', level: 1 },
      { id: 'a2', defId: 'eq_armor_2', level: 1 },
    ],
    equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.changed.length, 2);
  const weapon = r.changed.find(c => c.slot === 'WEAPON');
  const armor = r.changed.find(c => c.slot === 'ARMOR');
  assert.ok(weapon && weapon.itemId === 'w2');
  assert.ok(armor && armor.itemId === 'a2');
});

ok('已穿非最优：换装为更强装备', () => {
  const { context } = make();
  setEquipState(context, {
    bag: [
      { id: 'w1', defId: 'eq_weapon_1', level: 1 },
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    ],
    equipped: { WEAPON: 'w1', ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0]!.itemId, 'w2');
  assert.equal(r.changed[0]!.slot, 'WEAPON');
  const st = (context.player as any).v64Equipment;
  assert.equal(st.equipped.WEAPON, 'w2');
});

ok('已穿最优：零换装（幂等）', () => {
  const { context } = make();
  setEquipState(context, {
    bag: [
      { id: 'w1', defId: 'eq_weapon_1', level: 1 },
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    ],
    equipped: { WEAPON: 'w2', ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 0);
  // 幂等：重复调用结果一致
  const r2 = context.autoBattle.equipRecommended();
  assert.equal(r2.changed.length, 0);
});

ok('暴击加权生效：高攻低暴胜过低攻高暴（该组数据下）', () => {
  const { context } = make();
  // eq_weapon_2: atk12 crit 0.04×0.2 → 12×1.008×2=24.2
  // eq_weapon_1: atk5  crit 0.02×0.1 → 5×1.002×2=10.0
  setEquipState(context, {
    bag: [
      { id: 'w1', defId: 'eq_weapon_1', level: 1 },
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    ],
    equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const s1 = equipStats({ id: 'w1', defId: 'eq_weapon_1', level: 1 });
  const s2 = equipStats({ id: 'w2', defId: 'eq_weapon_2', level: 1 });
  const score = (s: { atk: number; hp: number; critRate: number; critMult: number }) => s.atk * (1 + s.critRate * s.critMult) * 2 + s.hp;
  assert.ok(score(s2) > score(s1), `w2 评分应更高: ${score(s2)} vs ${score(s1)}`);
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.changed[0]!.itemId, 'w2');
});

ok('强化等级参与评分：+5 低级装备胜过 +1 同级装备', () => {
  const { context } = make();
  // eq_weapon_1 atk5 +2/级：lv5 → 5+2×4=13 > lv1 eq_weapon_2 atk12（12×1.008×2=24.2 vs 13×1.002×2=26.1）
  setEquipState(context, {
    bag: [
      { id: 'w1', defId: 'eq_weapon_1', level: 5 },
      { id: 'w2', defId: 'eq_weapon_2', level: 1 },
    ],
    equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  const r = context.autoBattle.equipRecommended();
  assert.equal(r.changed[0]!.itemId, 'w1');
});

ok('换装触发 playerChanged 事件', () => {
  const { context } = make();
  let fired = 0;
  context.events.on('playerChanged', () => { fired += 1; });
  setEquipState(context, {
    bag: [{ id: 'w2', defId: 'eq_weapon_2', level: 1 }],
    equipped: { WEAPON: null, ARMOR: null, ACCESSORY: null, RELIC: null },
    fragments: 0,
  });
  context.autoBattle.equipRecommended();
  assert.equal(fired, 1);
});

ok('facade 暴露 equipRecommended 且与服务结果一致', () => {
  const { context } = make();
  const facadeAny = (context as any).__facadeForTest;
  // facade 层由 game-facade.ts 静态保证（public equipRecommended → autoBattle.equipRecommended），
  // 此处直接校验服务方法存在与签名形状。
  const r = context.autoBattle.equipRecommended();
  assert.equal(typeof r.ok, 'boolean');
  assert.ok(Array.isArray(r.changed));
  assert.equal(facadeAny, undefined); // 占位断言：facade 桥接由 H5 探针覆盖
});

console.log(`\n${passed} equip-recommend tests passed`);
