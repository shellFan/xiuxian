/**
 * V10.1 NPC 关系增益总览（queryNpcBuffs）单测。
 * 验证六项增益随好感度阶段正确变化——人际页可视化的数据契约。
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
  facade.queryAutoBattle();
  return facade;
}

function setRel(facade: GameFacade, npc: string, value: number): void {
  const ctxPlayer = (facade as unknown as { context: { player: { relationships: Record<string, number> } } }).context.player;
  ctxPlayer.relationships[npc] = value;
}

ok('默认（全部普通关系）：六项增益全中性', () => {
  const facade = makeFacade();
  const buffs = facade.queryNpcBuffs();
  assert.equal(buffs.length, 6);
  for (const b of buffs) {
    if (b.kind === 'bonus') assert.equal(b.value, 0);
    else assert.equal(b.value, 1);
  }
});

ok('BOSS 信任(+60)：晋升答辩 +10%；HR 信任：洞察 +5%', () => {
  const facade = makeFacade();
  setRel(facade, 'BOSS', 70);
  setRel(facade, 'HR', 65);
  const buffs = facade.queryNpcBuffs();
  const boss = buffs.find(b => b.npcId === 'BOSS')!;
  const hr = buffs.find(b => b.npcId === 'HR')!;
  assert.equal(boss.value, 10);
  assert.equal(hr.value, 5);
});

ok('BOSS 敌视(-60 以下)：晋升答辩 -10%', () => {
  const facade = makeFacade();
  setRel(facade, 'BOSS', -70);
  const boss = facade.queryNpcBuffs().find(b => b.npcId === 'BOSS')!;
  assert.equal(boss.value, -10);
});

ok('TESTER 信任：Bug 事件权重 ×0.8（预警生效）', () => {
  const facade = makeFacade();
  setRel(facade, 'TESTER', 70);
  const tester = facade.queryNpcBuffs().find(b => b.npcId === 'TESTER')!;
  assert.equal(tester.value, 0.8);
});

ok('VETERAN 友好：负面事件伤害 ×0.85；JUNIOR 信任：材料 ×1.25；PRODUCT 信任：道心损耗 ×0.75', () => {
  const facade = makeFacade();
  setRel(facade, 'VETERAN', 30);
  setRel(facade, 'JUNIOR', 65);
  setRel(facade, 'PRODUCT', 60);
  const buffs = facade.queryNpcBuffs();
  assert.equal(buffs.find(b => b.npcId === 'VETERAN')!.value, 0.85);
  assert.equal(buffs.find(b => b.npcId === 'JUNIOR')!.value, 1.25);
  assert.equal(buffs.find(b => b.npcId === 'PRODUCT')!.value, 0.75);
});

ok('npcId 覆盖六个不同 NPC，无重复', () => {
  const facade = makeFacade();
  const ids = facade.queryNpcBuffs().map(b => b.npcId);
  assert.equal(new Set(ids).size, 6);
});

console.log(`\n${passed} npc-buffs tests passed`);
