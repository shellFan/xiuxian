/**
 * V10.2 功法流派（§7.1）— 聚合器与接线测试。
 *
 * 覆盖：
 *  1. 配置完整性：30 功法全部有合法 route；五流派分布齐备
 *  2. 聚合器：mode 门槛 / 等级缩放（Lv2 ×1.5 delta、Lv3 翻倍）/ 流派共鸣 ×1.1
 *  3. work-service 接线：WORK 模式 salaryMul（键盘御剑术）/ CULTIVATING 模式 cultivationMul（工位聚灵诀）
 *  4. 事件绩效接线：996燃血大法 performanceMul
 *  5. NPC 好感接线：划水大道 relationshipMul（SOCIAL 模式）
 */
import assert from 'node:assert/strict';
import itemsConfig from '../../assets/configs/v2/items.json';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { TECHNIQUE_MAP, ROUTE_LABELS, type TechniqueRoute } from '../../assets/scripts/v2/v2-item-service';
import type { TechniqueRoute as RouteType } from '../../assets/scripts/v2/v2-item-service';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function make(): GameContext {
  const clock = new FakeClock(new Date(2026, 10, 20, 10, 0, 0, 0).getTime());
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: () => 0.5 });
  context.gameDay.ensureStarted();
  return context;
}

function equip(context: GameContext, ids: string[]): void {
  const p = context.player;
  p.ownedTechniques = [...new Set([...p.ownedTechniques, ...ids])];
  // 先清空三槽再装备（支持测试内重装）
  for (const slot of [0, 1, 2] as const) context.v2Items.equipTechnique(slot, null);
  ids.slice(0, 3).forEach((id, index) => context.v2Items.equipTechnique(index as 0 | 1 | 2, id));
}

ok('配置完整性：30 功法全部有合法 route，五流派齐备', () => {
  const techniques = itemsConfig.techniques;
  assert.equal(techniques.length, 30);
  const legal: RouteType[] = ['WORK', 'FISH', 'CULTIVATE', 'SOCIAL', 'ADAPTIVE'];
  const counts = new Map<string, number>();
  for (const t of techniques) {
    assert.ok(legal.includes(t.route as RouteType), `${t.id} route 非法: ${t.route}`);
    counts.set(t.route, (counts.get(t.route) ?? 0) + 1);
    assert.ok(TECHNIQUE_MAP.get(t.id)!.route === t.route, `${t.id} MAP 与配置一致`);
  }
  for (const route of legal) {
    assert.ok((counts.get(route) ?? 0) >= 3, `${route} 流派至少 3 个功法（实际 ${counts.get(route) ?? 0}）`);
  }
  assert.equal(Object.keys(ROUTE_LABELS).length, 5);
});

ok('聚合器：mode 门槛——WORK 功法只在 WORK 模式生效', () => {
  const context = make();
  equip(context, ['tech_996_burn']); // performanceMul 1.4, mode WORK
  const inWork = context.v2Items.techniqueAggregates('WORK');
  assert.equal(inWork.performanceMul, 1.4);
  const inFishing = context.v2Items.techniqueAggregates('FISHING');
  assert.equal(inFishing.performanceMul, 1);
  const noMode = context.v2Items.techniqueAggregates(null);
  assert.equal(noMode.performanceMul, 1, 'mode=null 时 mode 型功法跳过');
});

ok('聚合器：等级缩放 Lv2 delta×1.5 / Lv3 翻倍', () => {
  const context = make();
  equip(context, ['tech_kbd_sword']); // salaryMul 1.1, maxLevel 3
  context.player.techniqueLevels['tech_kbd_sword'] = 2;
  assert.ok(Math.abs(context.v2Items.techniqueAggregates('WORK').salaryMul - 1.15) < 1e-9);
  context.player.techniqueLevels['tech_kbd_sword'] = 3;
  assert.ok(Math.abs(context.v2Items.techniqueAggregates('WORK').salaryMul - 1.2) < 1e-9); // 1 + 0.1×2
});

ok('流派共鸣：≥2 件同流派 → 主乘子 ×1.1；单件不成阵；混流派无共鸣', () => {
  const context = make();
  // 单件 WORK 功法：routes=[WORK] 但不成阵 → 无共鸣
  equip(context, ['tech_996_burn']);
  assert.equal(context.v2Items.techniqueAggregates('WORK').resonanceRoute, null);
  // WORK 流派两件 → 共鸣
  equip(context, ['tech_996_burn', 'tech_copy_paste']);
  const agg = context.v2Items.techniqueAggregates('WORK');
  assert.equal(agg.resonanceRoute, 'WORK');
  // 主乘子 performanceMul：(1.4×1.1) × 1.1 共鸣（996_burn main + copy_paste either）
  assert.ok(Math.abs(agg.performanceMul - 1.4 * 1.1 * 1.1) < 1e-9);
  const routeInfo = context.v2Items.routeResonance();
  assert.ok(routeInfo && routeInfo.route === 'WORK' && routeInfo.label === '职场流');
  // 混流派 → 无共鸣
  equip(context, []);
  equip(context, ['tech_copy_paste', 'tech_paid_fish']);
  assert.equal(context.v2Items.techniqueAggregates('WORK').resonanceRoute, null);
});

ok('work-service 接线：键盘御剑术 WORK 工资 ×1.1', () => {
  const without = make();
  without.player.workMode = 'WORK';
  const salaryBefore = runTick(without);
  const withTech = make();
  equip(withTech, ['tech_kbd_sword']);
  withTech.player.workMode = 'WORK';
  const salaryAfter = runTick(withTech);
  assert.ok(salaryAfter > salaryBefore * 1.05, `工资应提升 ≥5%: ${salaryBefore} → ${salaryAfter}`);
});

ok('work-service 接线：工位聚灵诀 CULTIVATING 修为 ×1.15', () => {
  const without = make();
  without.player.workMode = 'CULTIVATING';
  const cultBefore = runTickCult(without);
  const withTech = make();
  equip(withTech, ['tech_desk_array']); // cultivationMul 1.15, mode CULTIVATING
  withTech.player.workMode = 'CULTIVATING';
  const cultAfter = runTickCult(withTech);
  assert.ok(cultAfter > cultBefore * 1.1, `修为应提升 ≥10%: ${cultBefore} → ${cultAfter}`);
});

ok('NPC 好感接线：划水大道 SOCIAL 模式 relationshipMul 1.3', () => {
  const context = make();
  equip(context, ['tech_slack_dao']); // relationshipMul 1.3, mode SOCIAL
  context.player.workMode = 'SOCIAL';
  const gain = context.npc.change('VETERAN', 10);
  assert.equal(gain, Math.floor(10 * 1.3), `好感 10 → 13（×1.3），实际 ${gain}`);
  // WORK 模式下不生效
  const context2 = make();
  equip(context2, ['tech_slack_dao']);
  context2.player.workMode = 'WORK';
  assert.equal(context2.npc.change('VETERAN', 10), 10);
});

ok('事件绩效接线：996燃血大法 performanceMul 1.4', () => {
  const context = make();
  equip(context, ['tech_996_burn']);
  context.player.workMode = 'WORK';
  const perfBefore = context.player.performance;
  context.v2Events.applyEffects({ performance: 10 });
  assert.equal(context.player.performance - perfBefore, 14, `绩效 10 → 14（×1.4）`);
});

/** 跑一档 WORK 模式 tick，返回工资增量。 */
function runTick(context: GameContext): number {
  const salaryBefore = context.player.salary;
  context.work.tick(8 * 3600);
  return context.player.salary - salaryBefore;
}

/** 跑一档 CULTIVATING 模式 tick，返回修为增量。 */
function runTickCult(context: GameContext): number {
  const before = context.player.cultivationExp;
  context.work.tick(8 * 3600);
  return context.player.cultivationExp - before;
}

console.log(`\n${passed} technique-routes tests passed`);
