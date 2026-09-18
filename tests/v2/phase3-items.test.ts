/**
 * Gameplay V2 Phase 3 — items: materials / techniques / equipment / craft / consumables / shop.
 */
import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import {
  ITEMS, MATERIAL_MAP, TECHNIQUE_MAP, EQUIPMENT_MAP, RECIPE_MAP, CONSUMABLE_MAP, EQUIP_SLOTS,
} from '../../assets/scripts/v2/v2-item-service';

function makeCtx(hour = 10) {
  const clock = new FakeClock(new Date(new Date().setHours(hour, 0, 0, 0)).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now(), salary: 1000 }), clock });
  return { context, clock };
}

// ── 配置完整性（§143/§194） ─────────────────────────────────────────────────

function testItemConfigIntegrity(): void {
  assert.ok(ITEMS.materials.length >= 25, `materials >= 25, got ${ITEMS.materials.length}`);
  assert.ok(ITEMS.techniques.length >= 30, `techniques >= 30, got ${ITEMS.techniques.length}`);
  assert.ok(ITEMS.equipment.length >= 30, `equipment >= 30, got ${ITEMS.equipment.length}`);
  assert.ok(ITEMS.recipes.length >= 30, `recipes >= 30, got ${ITEMS.recipes.length}`);
  assert.ok(ITEMS.consumables.length >= 8, `consumables >= 8, got ${ITEMS.consumables.length}`);
  // 功法至少一半带 trigger/condition/special（§51）
  const special = ITEMS.techniques.filter((t) => {
    const m = t.modifiers;
    return m.trigger || m.eventWeight || m.eventRewardMul || m.eventMindLossMul || m.bossEventWeight || m.fishingRiskMul;
  }).length;
  assert.ok(special >= 15, `special techniques >= 15, got ${special}`);
  // 装备槽位合法
  for (const e of ITEMS.equipment) {
    assert.ok((EQUIP_SLOTS as readonly string[]).includes(e.slot), `${e.id} bad slot`);
    assert.ok(!('attack' in e.modifiers) && !('defense' in e.modifiers), `${e.id} no combat stats`);
  }
  // 配方引用完整
  for (const r of ITEMS.recipes) {
    for (const ing of Object.keys(r.ingredients)) {
      assert.ok(MATERIAL_MAP.has(ing) || CONSUMABLE_MAP.has(ing), `${r.id} missing ingredient ${ing}`);
    }
  }
}

// ── 材料库存 ────────────────────────────────────────────────────────────────

function testMaterialClamp(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  svc.addMaterial('mat_lingcao', 3);
  assert.equal(svc.materialCount('mat_lingcao'), 3);
  svc.addMaterial('mat_lingcao', -10); // 不允许负库存
  assert.equal(svc.materialCount('mat_lingcao'), 0);
  assert.throws(() => svc.addMaterial('no_such_material', 1));
}

// ── 功法 ────────────────────────────────────────────────────────────────────

function testTechniqueEquipRules(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  // 未拥有不能装备
  assert.equal(svc.equipTechnique(0, 'tech_paid_fish'), false);
  svc.grantTechnique('tech_paid_fish'); // either
  svc.grantTechnique('tech_996_burn'); // main
  assert.equal(svc.equipTechnique(0, 'tech_996_burn'), true); // 主修槽可放 main
  assert.equal(svc.equipTechnique(1, 'tech_996_burn'), false); // 辅助槽不可放 main
  assert.equal(svc.equipTechnique(1, 'tech_paid_fish'), true);
  assert.equal(svc.equipTechnique(2, 'tech_paid_fish'), false); // 不可重复装备
  assert.equal(svc.equipTechnique(0, null), true); // 卸下
}

function testTechniqueUpgrade(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  // tech_bug_body 为 RARE：升级消耗 mat_page×6 + mat_dao_ink×1（配置读取）
  svc.grantTechnique('tech_bug_body');
  const def = TECHNIQUE_MAP.get('tech_bug_body');
  assert.ok(def);
  const lv1Cost = def.upgradeCost;
  for (const [mat, n] of Object.entries(lv1Cost)) if (n > 0) svc.addMaterial(mat, n);
  let r = svc.upgradeTechnique('tech_bug_body');
  assert.equal(r.success, true);
  assert.equal(context.player.techniqueLevels['tech_bug_body'], 2);
  for (const [mat, n] of Object.entries(lv1Cost)) if (n > 0) assert.equal(svc.materialCount(mat), 0, `${mat} consumed`);
  // Lv3 双倍消耗
  for (const [mat, n] of Object.entries(lv1Cost)) if (n > 0) svc.addMaterial(mat, n * 2);
  r = svc.upgradeTechnique('tech_bug_body');
  assert.equal(r.success, true);
  assert.equal(context.player.techniqueLevels['tech_bug_body'], 3);
  // 已满级
  r = svc.upgradeTechnique('tech_bug_body');
  assert.equal(r.success, false);
  assert.equal(r.reason, '已达最高等级');
}

// ── 装备 ────────────────────────────────────────────────────────────────────

function testEquipmentSlots(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  svc.grantEquipment('eq_mech_keyboard'); // DESK
  assert.equal(svc.equipItem('BADGE', 'eq_mech_keyboard'), false, 'slot mismatch');
  assert.equal(svc.equipItem('DESK', 'eq_mech_keyboard'), true);
  svc.grantEquipment('eq_coffee_cup');
  assert.equal(svc.equipItem('DESK', 'eq_coffee_cup'), true, 'replace same slot');
  assert.equal(context.player.equippedEquipment['DESK'], 'eq_coffee_cup');
  assert.equal(svc.equipItem('DESK', null), true);
}

// ── 合成（§64/§262 事务式） ─────────────────────────────────────────────────

function testCraftTransaction(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  // 材料不足
  let r = svc.craft('rp_coffee_life'); // needs bean2 + residue1
  assert.equal(r.success, false);
  assert.equal(svc.materialCount('cons_coffee'), 0, 'no partial output on failure');
  // 给材料后成功
  svc.addMaterial('mat_coffee_bean', 2);
  svc.addMaterial('mat_coffee_residue', 1);
  r = svc.craft('rp_coffee_life');
  assert.equal(r.success, true);
  assert.equal(svc.materialCount('cons_coffee'), 1);
  assert.equal(svc.materialCount('mat_coffee_bean'), 0);
  // 工资不足
  context.player.salary = 0;
  svc.addMaterial('mat_page', 5);
  svc.addMaterial('mat_dao_ink', 1);
  r = svc.craft('rp_page_rare'); // salaryCost 100
  assert.equal(r.success, false);
  assert.equal(svc.materialCount('mat_page'), 5, 'materials not consumed on salary failure');
  // salaryCost 成功路径
  context.player.salary = 500;
  r = svc.craft('rp_page_rare');
  assert.equal(r.success, true);
  assert.equal(context.player.salary, 400);
  assert.ok(context.player.ownedTechniques.length > 0, 'random technique granted');
}

// ── 消耗品 ──────────────────────────────────────────────────────────────────

function testConsumables(): void {
  const { context } = makeCtx();
  const svc = context.v2Items;
  svc.addMaterial('cons_coffee', 2);
  context.player.mind = 50;
  const r = svc.useConsumable('cons_coffee');
  assert.equal(r.success, true);
  assert.equal(context.player.mind, 70);
  assert.equal(svc.materialCount('cons_coffee'), 1);
  // 数量不足
  svc.useConsumable('cons_coffee');
  assert.equal(svc.useConsumable('cons_coffee').success, false);
  // 摸鱼符一次性
  svc.addMaterial('cons_fish_charm', 2);
  assert.equal(svc.useConsumable('cons_fish_charm').success, true);
  assert.equal(svc.useConsumable('cons_fish_charm').success, false, 'charm already active');
}

// ── 商店 ────────────────────────────────────────────────────────────────────

function testShopRefreshAndBuy(): void {
  const { context, clock } = makeCtx();
  const svc = context.v2Items;
  context.gameDay.ensureStarted();
  const shop1 = svc.todayShop();
  assert.ok(shop1.length >= 10);
  assert.ok(shop1.some((s) => !s.sold));
  // 购买
  const target = shop1.find((s) => !s.sold);
  assert.ok(target);
  const price = target.item.price;
  const before = context.player.salary;
  const r = svc.buy(target.item.itemId, price);
  assert.equal(r.success, true);
  assert.equal(context.player.salary, before - price);
  // 重复购买被拒
  assert.equal(svc.buy(target.item.itemId, price).success, false);
  // 次日货架变化（确定性种子）
  clock.advance(24 * 3600 * 1000);
  context.gameDay.ensureStarted();
  const shop2 = svc.todayShop();
  assert.ok(shop2.every((s) => !s.sold), 'new day resets sold flags');
}

// ── run ──────────────────────────────────────────────────────────────────────

testItemConfigIntegrity();
testMaterialClamp();
testTechniqueEquipRules();
testTechniqueUpgrade();
testEquipmentSlots();
testCraftTransaction();
testConsumables();
testShopRefreshAndBuy();
console.log('gameplay v2 phase3 item tests passed');
