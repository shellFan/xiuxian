/**
 * Gameplay V2 Phase 4 — NPC relationships + weekend activities.
 */
import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import {
  NpcService, WeekendService, NPCS, relationshipStage,
} from '../../assets/scripts/v2/npc-weekend-service';

function saturdayClock(): FakeClock {
  // 找最近的周六 10:00
  const d = new Date();
  const delta = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(10, 0, 0, 0);
  return new FakeClock(d.getTime());
}

function makeCtx(clock: FakeClock): GameContext {
  return new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock });
}

function testNpcDefs(): void {
  assert.equal(NPCS.length, 6, '6 core NPCs (§44)');
  assert.deepEqual(NPCS.map((n) => n.id), ['BOSS', 'PRODUCT', 'TESTER', 'JUNIOR', 'VETERAN', 'HR']);
  for (const n of NPCS) assert.ok(n.name && n.description && n.influence);
}

function testRelationshipStages(): void {
  assert.equal(relationshipStage(80), 'TRUSTED');
  assert.equal(relationshipStage(30), 'FRIENDLY');
  assert.equal(relationshipStage(0), 'NORMAL');
  assert.equal(relationshipStage(-30), 'COLD');
  assert.equal(relationshipStage(-80), 'HOSTILE');
}

function testRelationshipClampAndEffects(): void {
  const clock = new FakeClock(new Date(new Date().setHours(10, 0, 0, 0)).getTime());
  const ctx = makeCtx(clock);
  const npc = ctx.npc;
  assert.equal(npc.value('BOSS'), 0);
  npc.change('BOSS', 50);
  npc.change('BOSS', 200); // clamp 100
  assert.equal(npc.value('BOSS'), 100);
  assert.equal(npc.promotionChanceBonus(), 10);
  npc.change('BOSS', -250);
  assert.equal(npc.value('BOSS'), -100);
  assert.equal(npc.promotionChanceBonus(), -10);
  // negativeEventMul 由 VETERAN 关系驱动（老油条背锅/指点）
  npc.change('VETERAN', -200);
  assert.equal(npc.value('VETERAN'), -100);
  assert.equal(npc.negativeEventMul(), 1.1);
  npc.change('TESTER', 70);
  assert.equal(npc.bugEventWeightMul(), 0.8);
  npc.change('JUNIOR', 65);
  assert.equal(npc.materialMul(), 1.25);
  // 视图
  const views = npc.views();
  assert.equal(views.length, 6);
  assert.equal(views[0].stageLabel, '敌视');
}

function testWeekendChooseOnce(): void {
  const clock = saturdayClock();
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  const weekend = ctx.weekend;
  assert.equal(weekend.hasChosen(), false);
  const before = ctx.player.cultivationExp;
  const result = weekend.choose('SECLUDED_CULTIVATE');
  assert.ok(result.summary.includes('修为 +80'));
  assert.equal(ctx.player.cultivationExp - before, 80);
  // exactly once
  assert.equal(weekend.hasChosen(), true);
  assert.throws(() => weekend.choose('SLEEP_MADLY'), /已选择/);
  // 下一周末可再选（weekendIndex 推进）
  const idx = weekend.currentWeekendIndex();
  assert.ok(typeof idx === 'number');
}

function testWeekendRequiresWeekend(): void {
  const clock = new FakeClock(new Date(new Date().setHours(10, 0, 0, 0)).getTime());
  // 推到确定的周三
  const d = new Date(clock.now());
  const delta = (3 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  clock.set(d.getTime());
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  assert.throws(() => ctx.weekend.choose('SLEEP_MADLY'), /不是周末/);
}

function testWeekendSleepAndGather(): void {
  const clock = saturdayClock();
  const ctx = makeCtx(clock);
  ctx.gameDay.ensureStarted();
  ctx.player.innerDemon = 40;
  ctx.player.mind = 30;
  const r = ctx.weekend.choose('SLEEP_MADLY');
  assert.ok(r.summary.includes('道心 +45'));
  assert.equal(ctx.player.mind, 75);
  assert.equal(ctx.player.innerDemon, 25);
}

testNpcDefs();
testRelationshipStages();
testRelationshipClampAndEffects();
testWeekendChooseOnce();
testWeekendRequiresWeekend();
testWeekendSleepAndGather();
console.log('gameplay v2 phase4 npc/weekend tests passed');
