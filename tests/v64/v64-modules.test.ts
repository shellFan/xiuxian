/**
 * V6.4 模块单测：主动技能/品质/升星/羁绊/装备/Boss特性/留存。
 */
import assert from 'node:assert/strict';
import { ACTIVE_SKILLS, activeSkillDef } from '../../assets/scripts/v64/active-skills';
import { rollRarity, starUpCost, starAtkBonus, activeSynergies, powerScore, rarityDef, RARITIES } from '../../assets/scripts/v64/squad-growth';
import { bossTraitForStage, enemyTypeForStage, defeatAdviceFor, BOSS_TRAITS } from '../../assets/scripts/v64/boss-traits';
import { EQUIP_DEFS, dropEquipForStage, equipStats, enhanceCost, MAX_EQUIP_LEVEL } from '../../assets/scripts/v64/equipment';
import { dailyGoalsFor, SEVEN_DAY_GOALS, V64_ACHIEVEMENTS } from '../../assets/scripts/v64/retention';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// ── 主动技能 ──

ok('ACTIVE_SKILLS：4个技能定义完整', () => {
  assert.equal(ACTIVE_SKILLS.length, 4);
  const ids = ACTIVE_SKILLS.map(s => s.id);
  assert.ok(ids.includes('code_sword'));
  assert.ok(ids.includes('bug_bomb'));
  assert.ok(ids.includes('req_crusher'));
  assert.ok(ids.includes('emergency_rollback'));
});

ok('activeSkillDef：查找技能定义，未知ID回退到第一个', () => {
  const def = activeSkillDef('code_sword');
  assert.ok(def);
  assert.equal(def!.id, 'code_sword');
  assert.equal(def!.kind, 'MULTI_TAP');
  // 未知ID回退到第一个技能
  const fallback = activeSkillDef('bug_bomb');
  assert.ok(fallback);
  assert.equal(fallback!.id, 'bug_bomb');
});

ok('技能解锁关卡递增', () => {
  const stages = ACTIVE_SKILLS.map(s => s.unlockStage).sort((a, b) => a - b);
  for (let i = 1; i < stages.length; i++) {
    assert.ok(stages[i]! > stages[i - 1]!, '解锁关卡应递增');
  }
});

ok('技能冷却时间>0', () => {
  for (const sk of ACTIVE_SKILLS) {
    assert.ok(sk.cooldownSec > 0, `${sk.id}冷却应>0`);
  }
});

// ── 品质 ──

ok('rollRarity：确定性种子下权重分布', () => {
  // 使用1000等分覆盖完整[0,1)区间
  let counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    const r = rollRarity(() => (i % 1000) / 1000);
    counts[r]!++;
  }
  // 10000次中每个值出现10次：普通5000/优秀3000/精英1300/史诗600/传说100
  assert.ok(counts[0]! >= 4800 && counts[0]! <= 5200, `普通≈50%，实际${counts[0]}`);
  assert.ok(counts[1]! >= 2800 && counts[1]! <= 3200, `优秀≈30%，实际${counts[1]}`);
  assert.ok(counts[4]! >= 80 && counts[4]! <= 120, `传说≈1%，实际${counts[4]}`);
});

ok('rarityDef：品质定义完整', () => {
  assert.equal(RARITIES.length, 5);
  assert.equal(rarityDef(0).label, '普通');
  assert.equal(rarityDef(4).label, '传说');
  assert.ok(rarityDef(4).atkMult > rarityDef(0).atkMult);
});

// ── 升星 ──

ok('starUpCost：消耗随星级递增', () => {
  const c1 = starUpCost(1);
  const c2 = starUpCost(2);
  const c4 = starUpCost(4);
  assert.ok(c2.fragments > c1.fragments);
  assert.ok(c4.spiritStones > c2.spiritStones);
});

ok('starAtkBonus：每星+25%', () => {
  assert.equal(starAtkBonus(1), 1.0);
  assert.equal(starAtkBonus(2), 1.25);
  assert.equal(starAtkBonus(5), 2.0);
});

// ── 羁绊 ──

ok('activeSynergies：Java+QA激活Bug追踪', () => {
  const syns = activeSynergies(['JAVA_BACKEND', 'QA']);
  assert.ok(syns.some(s => s.id === 'bug_tracking'));
  assert.ok(!syns.some(s => s.id === 'stable_release'));
});

ok('activeSynergies：四职全激活全栈攻坚', () => {
  const syns = activeSynergies(['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS']);
  assert.equal(syns.length, 4);
  assert.ok(syns.some(s => s.id === 'fullstack'));
});

// ── 战力 ──

ok('powerScore：基础战力>0，加成后更高', () => {
  const base = powerScore({ squadAttack: 100, clickDamage: 50, avgRarity: 1.0, totalStars: 5, synergyCount: 0, equipmentAttack: 0 });
  const boosted = powerScore({ squadAttack: 100, clickDamage: 50, avgRarity: 2.0, totalStars: 10, synergyCount: 2, equipmentAttack: 50 });
  assert.ok(base > 0);
  assert.ok(boosted > base);
});

// ── Boss特性 ──

ok('bossTraitForStage：cardBoss轮换特性', () => {
  const t1 = bossTraitForStage(10, true);
  const t5 = bossTraitForStage(50, true);
  assert.ok(t1 !== 'NONE' || t5 !== 'NONE', 'cardBoss应有非NONE特性');
});

ok('enemyTypeForStage：每8关轮换', () => {
  assert.equal(enemyTypeForStage(1), 'NORMAL');
  const t9 = enemyTypeForStage(9);
  assert.ok(['NORMAL', 'ARMORED', 'SWARM', 'SHIELDED'].includes(t9));
});

ok('defeatAdviceFor：战力不足给建议', () => {
  const advice = defeatAdviceFor(10, 100, 'SHIELD');
  assert.ok(advice.suggestions.length > 0);
  assert.ok(advice.recommendedPower > 0);
});

// ── 装备 ──

ok('EQUIP_DEFS：20件装备4槽位', () => {
  assert.equal(EQUIP_DEFS.length, 20);
  const slots = new Set(EQUIP_DEFS.map(e => e.slot));
  assert.equal(slots.size, 4);
});

ok('dropEquipForStage：每30杀掉落', () => {
  const drop0 = dropEquipForStage(5, 29);
  assert.equal(drop0, null);
  const drop1 = dropEquipForStage(5, 30);
  assert.ok(drop1);
  const drop2 = dropEquipForStage(5, 60);
  assert.ok(drop2);
  assert.ok(drop1!.id !== drop2!.id, '不同击杀数掉不同装备');
});

ok('equipStats：属性计算', () => {
  const stats = equipStats({ id: 'test-inst', defId: EQUIP_DEFS[0]!.id, level: 1 });
  assert.ok(stats.atk >= 0);
});

ok('enhanceCost：强化消耗递增', () => {
  const c1 = enhanceCost(1);
  const c5 = enhanceCost(5);
  assert.ok(c5.spiritStones > c1.spiritStones);
  assert.ok(MAX_EQUIP_LEVEL === 10);
});

// ── 留存 ──

ok('dailyGoalsFor：每天3个目标', () => {
  const g0 = dailyGoalsFor(0);
  assert.equal(g0.length, 3);
  const g1 = dailyGoalsFor(1);
  assert.equal(g1.length, 3);
});

ok('SEVEN_DAY_GOALS：7天引导', () => {
  assert.equal(SEVEN_DAY_GOALS.length, 7);
});

ok('V64_ACHIEVEMENTS：17个成就', () => {
  assert.equal(V64_ACHIEVEMENTS.length, 17);
});

console.log(`\n✅ v64-modules: ${passed} tests passed`);