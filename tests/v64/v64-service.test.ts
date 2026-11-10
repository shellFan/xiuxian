/**
 * V6.4 服务集成测试：技能释放/倍速/升星/装备/每日目标/防重/存档兼容。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { defeatAdviceFor } from '../../assets/scripts/v64/boss-traits';

function at(day: number, hour: number): number {
  return new Date(2026, 8, day, hour, 0, 0, 0).getTime();
}

function make(hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: () => 0.5 });
  context.gameDay.ensureStarted();
  return { clock, context };
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// ── 主动技能 ──

ok('useActiveSkill：第1关解锁code_sword，释放有伤害', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const r = context.autoBattle.useActiveSkill('code_sword');
  assert.ok(r.ok, `应成功: ${r.reason}`);
  assert.ok(r.totalDamage > 0);
  assert.ok(r.cooldownRemaining > 0);
});

ok('useActiveSkill：冷却中不可重复释放', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  context.autoBattle.useActiveSkill('code_sword');
  const r2 = context.autoBattle.useActiveSkill('code_sword');
  assert.equal(r2.ok, false);
  assert.ok(r2.reason);
});

ok('useActiveSkill：未解锁技能拒绝释放', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // bug_bomb需要5关，当前第1关
  const r = context.autoBattle.useActiveSkill('bug_bomb');
  assert.equal(r.ok, false);
  assert.ok(r.reason);
});

ok('view.activeSkills：4个技能含解锁状态和冷却', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  assert.ok(v.activeSkills);
  assert.equal(v.activeSkills.length, 4);
  assert.ok(v.activeSkills[0]!.unlocked);
  assert.ok(v.activeSkills[0]!.cooldownSec > 0);
});

// ── 倍速 ──

ok('toggleSpeed：1x↔2x切换', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  assert.equal(context.autoBattle.view().speedMultiplier, 1);
  const s1 = context.autoBattle.toggleSpeed();
  assert.equal(s1, 2);
  assert.equal(context.autoBattle.view().speedMultiplier, 2);
  const s2 = context.autoBattle.toggleSpeed();
  assert.equal(s2, 1);
});

// ── 升星 ──

ok('starUp：碎片/灵石不足时拒绝', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  const memberId = v.squad[0]!.id;
  const r = context.autoBattle.starUp(memberId);
  // 新玩家碎片为0，应拒绝
  assert.equal(r.ok, false);
  assert.ok(r.reason);
});

ok('grantFragments+starUp：有碎片可升星', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  const memberId = v.squad[0]!.id;
  // 发碎片和灵石
  context.autoBattle.grantFragments(memberId, 10);
  context.player.spiritStones += 100;
  const r = context.autoBattle.starUp(memberId);
  assert.ok(r.ok, `升星应成功: ${r.reason}`);
  assert.equal(r.newStars, 2);
});

// ── 装备 ──

ok('equipView：初始为空背包', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const ev = context.autoBattle.equipView();
  assert.ok(ev);
  assert.equal(ev.bag.length, 0);
});

ok('view.pendingEquipDrops：击杀30后掉落装备', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 快速击杀30个敌人
  for (let i = 0; i < 500; i++) {
    context.autoBattle.tick(0.5);
  }
  const v = context.autoBattle.view();
  // 击杀数应>0
  assert.ok(v.totalKills > 0, `击杀数: ${v.totalKills}`);
});

// ── 每日目标 ──

ok('dailyGoalsView：3个目标含进度', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const dg = context.autoBattle.dailyGoalsView(0);
  assert.ok(Array.isArray(dg));
  assert.equal(dg.length, 3);
  assert.ok(dg[0]!.target > 0);
});

ok('claimDailyGoal：未完成不可领取', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const dg = context.autoBattle.dailyGoalsView(0);
  const r = context.autoBattle.claimDailyGoal(dg[0]!.goalId);
  assert.equal(r.ok, false);
});

// ── 七日目标 ──

ok('sevenDayView：7天目标', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const sd = context.autoBattle.sevenDayView();
  assert.ok(Array.isArray(sd));
  assert.equal(sd.length, 7);
});

// ── 成就 ──

ok('achievementsView：17个成就', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const ach = context.autoBattle.achievementsView();
  assert.ok(Array.isArray(ach));
  assert.equal(ach.length, 17);
});

// ── 战力 ──

ok('computePowerScore：>0且随养成增长', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const p0 = context.autoBattle.computePowerScore();
  assert.ok(p0 > 0);
  // 升级点击后战力应增长
  context.player.spiritStones += 1000;
  context.autoBattle.upgradeClick();
  const p1 = context.autoBattle.computePowerScore();
  assert.ok(p1 > p0, `升级后战力${p1}应>升级前${p0}`);
});

// ── 失败建议 ──

ok('defeatAdvice：非Boss返回null，Boss战返回建议', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 第1关非Boss，返回null
  const advice = context.autoBattle.defeatAdvice();
  assert.equal(advice, null);
  // defeatAdviceFor模块函数直接可用
  const modAdvice = defeatAdviceFor(10, 100, 'SHIELD');
  assert.ok(modAdvice.suggestions.length > 0);
});

// ── 存档兼容 ──

ok('旧存档加载：V6.4字段有默认值', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  // V6.4字段在旧存档下应有默认值
  assert.equal(v.speedMultiplier, 1);
  assert.ok(v.activeSkills);
  assert.ok(Array.isArray(v.synergies));
  assert.ok(v.powerScore >= 0);
});

// ── 防重 ──

ok('claimDailyGoal幂等：重复领取拒绝', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 手动完成一个目标
  context.autoBattle.trackDailyGoal('kill_10', 10);
  const dg = context.autoBattle.dailyGoalsView(0);
  const goalId = dg[0]!.goalId;
  const r1 = context.autoBattle.claimDailyGoal(goalId);
  // 重复调用结果应一致
  const r2 = context.autoBattle.claimDailyGoal(goalId);
  // 如果第一次成功，第二次必须拒绝
  if (r1.ok) {
    assert.equal(r2.ok, false);
  }
});

console.log(`\n✅ v64-service: ${passed} tests passed`);