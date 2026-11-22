import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { TalentTreeService, type TalentTreeConfig } from '../../assets/scripts/services/talent-tree-service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function createContext(playerOverrides: Record<string, unknown> = {}): GameContext {
  return new GameContext({
    player: new PlayerData(playerOverrides),
    saveService: new SaveService(new MemoryStorageAdapter()),
  });
}

/** 迷你天赋表：CAREER 路线 3 节点链 + FISH 路线 1 节点（折扣载体）。 */
const TEST_NODES: TalentTreeConfig['nodes'] = [
  { id: 'CAREER_N1', route: 'CAREER', routeName: '职场精英', tier: 1, name: '加班觉', description: '工资+3%/级', buffType: 'WORK_SALARY_BOOST', multPerRank: 1.03, maxRank: 3, costPerRank: 1, requires: null },
  { id: 'CAREER_N2', route: 'CAREER', routeName: '职场精英', tier: 2, name: '周报道术', description: 'KPI+5%/级', buffType: 'KPI_PROGRESS_BOOST', multPerRank: 1.05, maxRank: 2, costPerRank: 2, requires: 'CAREER_N1' },
  { id: 'CAREER_N3', route: 'CAREER', routeName: '职场精英', tier: 3, name: '数据护体', description: '工资+4%/级', buffType: 'WORK_SALARY_BOOST', multPerRank: 1.04, maxRank: 3, costPerRank: 3, requires: 'CAREER_N2' },
  { id: 'FISH_N1', route: 'FISH', routeName: '摸鱼大师', tier: 1, name: '厕所吐纳', description: '道心+6%/级', buffType: 'FISHING_MIND_BOOST', multPerRank: 1.06, maxRank: 3, costPerRank: 1, requires: null },
  { id: 'RESOURCE_N1', route: 'RESOURCE', routeName: '资源管理大师', tier: 1, name: '炼丹比价', description: '成本×0.97/级', buffType: 'CRAFT_COST_REDUCTION', multPerRank: 0.97, maxRank: 3, costPerRank: 1, requires: null },
];

const TEST_CONFIG: TalentTreeConfig = { schemaVersion: 1, status: 'TEST', routes: [], nodes: TEST_NODES };

// ── Tests ────────────────────────────────────────────────────────────────────

function testPointsDeriveFromCareerAndGates(): void {
  const ctx = createContext({ careerLevel: 5, lifetimeStats: { 'realmGatePassed:3': 1, 'realmGatePassed:6': 1, realmHighestReached: 6 } });
  const tree = new TalentTreeService(ctx, TEST_CONFIG);
  assert.equal(tree.totalPoints(), 5 + 2 * 2); // 5 career + 2 gates×2
  assert.equal(tree.availablePoints(), 9);
  console.log('✔ TalentTree: points derive from careerLevel + realm gates ×2');
}

function testUnlockRequiresPointsAndDependency(): void {
  const ctx = createContext({ careerLevel: 1 }); // 1 point
  const tree = new TalentTreeService(ctx, TEST_CONFIG);
  // N2 需要 N1 前置
  const blocked = tree.upgradeNode('CAREER_N2');
  assert.equal(blocked.success, false);
  assert.equal(blocked.reason, '需先解锁前置');
  // N1 升级成功（花费 1 点）
  const ok = tree.upgradeNode('CAREER_N1');
  assert.equal(ok.success, true);
  assert.equal(ok.newRank, 1);
  assert.equal(ctx.player.lifetimeStats['talentNode:CAREER_N1'], 1);
  assert.equal(ctx.player.lifetimeStats.talentSpent, 1);
  // 点数耗尽 → 升 N1 第二级失败
  const noPoints = tree.upgradeNode('CAREER_N1');
  assert.equal(noPoints.success, false);
  assert.equal(noPoints.reason, '天赋点不足');
  console.log('✔ TalentTree: dependency + point ledger enforced');
}

function testBuffGrantedOnUnlockAndUpgradedOnRankUp(): void {
  const ctx = createContext({ careerLevel: 10 }); // 10 points
  const tree = new TalentTreeService(ctx, TEST_CONFIG);
  tree.upgradeNode('CAREER_N1'); // rank1 → WORK_SALARY_BOOST ×1.03
  assert.equal(ctx.buffs.getMultiplier('WORK_SALARY_BOOST'), 1.03);
  tree.upgradeNode('CAREER_N1'); // rank2 → ×1.06（旧 buff 移除，新 buff 施加）
  assert.equal(ctx.buffs.getMultiplier('WORK_SALARY_BOOST'), 1.06);
  tree.upgradeNode('FISH_N1'); // 另一路线叠加：FISHING_MIND_BOOST ×1.06 独立
  assert.equal(ctx.buffs.getMultiplier('FISHING_MIND_BOOST'), 1.06);
  assert.equal(ctx.buffs.getMultiplier('WORK_SALARY_BOOST'), 1.06);
  console.log('✔ TalentTree: buffs granted per rank, upgraded in place, per-type isolated');
}

function testResetRouteRefundsHalfAndRemovesBuffs(): void {
  const ctx = createContext({ careerLevel: 10 });
  const tree = new TalentTreeService(ctx, TEST_CONFIG);
  tree.upgradeNode('CAREER_N1'); // 花 1
  tree.upgradeNode('CAREER_N2'); // 花 2（前置已过）
  assert.equal(ctx.player.lifetimeStats.talentSpent, 3);
  const result = tree.resetRoute('CAREER');
  assert.equal(result.success, true);
  assert.equal(ctx.player.lifetimeStats.talentSpent, 2); // 3 - floor(3*0.5)=1 → 2
  assert.equal(ctx.player.lifetimeStats['talentNode:CAREER_N1'], undefined);
  assert.equal(ctx.buffs.getMultiplier('WORK_SALARY_BOOST'), 1); // buff 移除
  assert.equal(ctx.buffs.getMultiplier('KPI_PROGRESS_BOOST'), 1);
  console.log('✔ TalentTree: route reset refunds 50% and removes route buffs');
}

function testCostReductionCarrierSubOne(): void {
  const ctx = createContext({ careerLevel: 10 });
  const tree = new TalentTreeService(ctx, TEST_CONFIG);
  tree.upgradeNode('RESOURCE_N1'); // rank1 → CRAFT_COST_REDUCTION ×0.97（折扣系数直接乘）
  assert.equal(ctx.buffs.getMultiplier('CRAFT_COST_REDUCTION'), 0.97);
  console.log('✔ TalentTree: sub-1 discount carrier multiplies directly');
}

function testDuplicateAndInvalidConfigThrows(): void {
  assert.throws(() => new TalentTreeService(createContext(), { ...TEST_CONFIG, nodes: [TEST_NODES[0], TEST_NODES[0]] }), /Duplicate talent node id/);
  assert.throws(() => new TalentTreeService(createContext(), { ...TEST_CONFIG, nodes: [{ ...TEST_NODES[0], requires: 'GHOST' }] }), /requires unknown node/);
  console.log('✔ TalentTree: duplicate ids / unknown requires rejected');
}

function testProductionConfigLoads50Nodes(): void {
  const talentTreeConfig = require('../../assets/configs/talent-tree.json') as TalentTreeConfig;
  const tree = new TalentTreeService(createContext(), talentTreeConfig);
  assert.equal(tree.allNodes.length, 50);
  const routes = new Set(tree.allNodes.map((n) => n.route));
  assert.equal(routes.size, 5);
  tree.applyAllActiveBuffs(); // 新档无节点 → 无 buff、无异常
  console.log('✔ TalentTree: production config loads 50 nodes / 5 routes, boot re-apply safe');
}

// ── Run ──────────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testPointsDeriveFromCareerAndGates,
  testUnlockRequiresPointsAndDependency,
  testBuffGrantedOnUnlockAndUpgradedOnRankUp,
  testResetRouteRefundsHalfAndRemovesBuffs,
  testCostReductionCarrierSubOne,
  testDuplicateAndInvalidConfigThrows,
  testProductionConfigLoads50Nodes,
];

for (const test of tests) test();
console.log(`\nTalentTreeService: ${tests.length}/${tests.length} tests passed`);
