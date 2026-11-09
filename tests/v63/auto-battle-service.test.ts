/**
 * V6.3 AutoBattleService 测试：
 * 状态机启动/tick推关/点击攻击/招募/升级/宝箱/通天塔/卡牌Boss衔接/离线结算/存档恢复。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { enemyDefForStage, stageKind, TOTAL_STAGES, CHEST_KILL_INTERVAL, chapterOfStage } from '../../assets/scripts/v63/auto-battle-content';
import type { SquadProfession } from '../../assets/scripts/v63/auto-battle-types';

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

// ── 1. 启动与状态机 ─────────────────────────────────────────────────────────

ok('ensureStarted：IDLE→FIGHTING，生成第一关敌人', () => {
  const { context } = make();
  assert.equal(context.autoBattle.view().status, 'IDLE');
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  assert.equal(v.status, 'FIGHTING');
  assert.equal(v.stage, 1);
  assert.ok(v.enemy, '应有敌人');
  const def = enemyDefForStage(1);
  assert.equal(v.enemy!.name, def.name);
  assert.equal(v.enemy!.maxHp, def.hp);
  assert.equal(v.enemy!.hpPct, 100);
});

ok('view：UI快照字段完整', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v = context.autoBattle.view();
  const ch = chapterOfStage(1);
  assert.equal(v.chapterTitle, ch.title);
  assert.equal(v.chapterEmoji, ch.emoji);
  assert.ok(v.squad.length >= 1, '至少有队长');
  assert.equal(v.squad[0]!.id, 'leader');
  assert.ok(v.clickDamage > 0);
  assert.equal(v.dps > 0, true, 'DPS应大于0');
  assert.equal(v.towerFloor, 0);
  assert.equal(v.pendingChests, 0);
  assert.equal(v.totalKills, 0);
});

// ── 2. tick推关 ─────────────────────────────────────────────────────────────

ok('tick：小队自动攻击击杀敌人→VICTORY→1.5s后推进下一关', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const v0 = context.autoBattle.view();
  const enemyHp = v0.enemy!.hp;
  const dps = v0.dps;
  // 模拟足够多的tick击杀敌人
  const secPerTick = 0.1;
  const maxTicks = Math.ceil((enemyHp / Math.max(1, dps)) / secPerTick) + 200;
  let sawVictory = false;
  let sawAdvance = false;
  context.events.on('v63Victory', () => { sawVictory = true; });
  context.events.on('v63StageAdvanced', () => { sawAdvance = true; });
  for (let i = 0; i < maxTicks; i++) {
    context.autoBattle.tick(secPerTick);
    const v = context.autoBattle.view();
    if (v.status === 'VICTORY') { sawVictory = true; }
    if (v.stage > 1) { sawAdvance = true; break; }
  }
  assert.ok(sawVictory, '应进入VICTORY状态');
  assert.ok(sawAdvance, '应推进到第2关');
  const vEnd = context.autoBattle.view();
  assert.equal(vEnd.stage, 2);
  assert.ok(vEnd.totalKills >= 1, '总击杀数应增加');
});

ok('敌人确定性：同关卡同敌人（纯函数无随机）', () => {
  const { context: c1 } = make();
  c1.autoBattle.ensureStarted();
  const v1 = c1.autoBattle.view();
  const { context: c2 } = make();
  c2.autoBattle.ensureStarted();
  const v2 = c2.autoBattle.view();
  assert.equal(v1.enemy!.name, v2.enemy!.name);
  assert.equal(v1.enemy!.maxHp, v2.enemy!.maxHp);
});

// ── 3. 点击攻击 ─────────────────────────────────────────────────────────────

ok('tapAttack：造成伤害，血量减少', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const before = context.autoBattle.view().enemy!.hp;
  const r = context.autoBattle.tapAttack();
  assert.equal(r.ok, true);
  assert.ok(r.damage > 0, '点击伤害应大于0');
  const after = context.autoBattle.view().enemy!.hp;
  assert.equal(after, Math.max(0, before - r.damage));
  assert.equal(r.enemyHpAfter, after);
});

ok('tapAttack：非FIGHTING状态返回失败', () => {
  const { context } = make();
  // 未启动，状态IDLE
  const r = context.autoBattle.tapAttack();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NOT_FIGHTING');
});

ok('tapAttack：点击击杀敌人→stageCleared=true', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 用tick把敌人打到残血
  const v = context.autoBattle.view();
  const hp = v.enemy!.hp;
  const dps = v.dps;
  const secPerTick = 0.1;
  const ticksToNearDeath = Math.floor((hp / Math.max(1, dps)) / secPerTick) - 5;
  for (let i = 0; i < ticksToNearDeath; i++) context.autoBattle.tick(secPerTick);
  // 点击收割
  let r = context.autoBattle.tapAttack();
  let guard = 0;
  while (!r.enemyDefeated && guard < 200) { r = context.autoBattle.tapAttack(); guard++; }
  assert.ok(r.enemyDefeated, '点击应击杀敌人');
  assert.equal(r.stageCleared, true, '关卡应清除');
  assert.ok(r.rewards, '应有奖励');
});

// ── 4. 招募与升级 ───────────────────────────────────────────────────────────

ok('hireMember：消耗灵石招募小队成员', () => {
  const { context } = make();
  context.player.spiritStones = 500;
  const before = context.autoBattle.view().squad.length;
  const r = context.autoBattle.hireMember('FRONTEND' as SquadProfession);
  assert.equal(r.ok, true);
  assert.ok(r.member);
  assert.equal(r.member!.profession, 'FRONTEND');
  const after = context.autoBattle.view().squad.length;
  assert.equal(after, before + 1);
  assert.ok(context.player.spiritStones < 500, '灵石应消耗');
});

ok('hireMember：灵石不足返回失败', () => {
  const { context } = make();
  context.player.spiritStones = 0;
  const r = context.autoBattle.hireMember('QA' as SquadProfession);
  assert.equal(r.ok, false);
  assert.ok(r.reason);
});

ok('upgradeClick：升级点击伤害', () => {
  const { context } = make();
  context.player.spiritStones = 500;
  const v0 = context.autoBattle.view();
  const r = context.autoBattle.upgradeClick();
  assert.equal(r.ok, true);
  assert.equal(r.newLevel, v0.clickDamage > 0 ? 2 : 2);
  const v1 = context.autoBattle.view();
  assert.ok(v1.clickDamage > v0.clickDamage, '点击伤害应提升');
});

// ── 5. 宝箱 ─────────────────────────────────────────────────────────────────

ok('宝箱：击杀足够数量后掉落，开启获得奖励', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 设置宝箱计数器接近阈值，再击杀一个敌人触发掉落
  const b = (context.player as any).v63AutoBattle;
  b.chestKillCounter = CHEST_KILL_INTERVAL - 1;
  b.enemy.hp = 1;
  context.autoBattle.tapAttack();
  const v = context.autoBattle.view();
  assert.ok(v.pendingChests >= 1, `应掉落宝箱（击杀${v.totalKills}）`);
  const salaryBefore = context.player.salary;
  const r = context.autoBattle.openChest();
  assert.equal(r.ok, true);
  assert.ok(r.reward);
  assert.ok(r.reward!.amount > 0);
  assert.equal(context.autoBattle.view().pendingChests, v.pendingChests - 1);
});

ok('openChest：无宝箱时返回失败', () => {
  const { context } = make();
  const r = context.autoBattle.openChest();
  assert.equal(r.ok, false);
  assert.equal(r.reward, null);
});

// ── 6. 通天塔 ───────────────────────────────────────────────────────────────

ok('enterTower：进入996通天塔第1层', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const r = context.autoBattle.enterTower();
  assert.equal(r.ok, true);
  assert.equal(r.floor, 1);
  const v = context.autoBattle.view();
  assert.equal(v.towerFloor, 1);
  assert.ok(v.enemy, '塔内应有敌人');
});

ok('enterTower：重复进入返回失败', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  context.autoBattle.enterTower();
  const r = context.autoBattle.enterTower();
  assert.equal(r.ok, false);
});

ok('exitTower：退出回到普通关卡', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  context.autoBattle.enterTower();
  context.autoBattle.exitTower();
  const v = context.autoBattle.view();
  assert.equal(v.towerFloor, 0);
  assert.equal(v.status, 'FIGHTING');
});

// ── 7. 卡牌Boss衔接 ─────────────────────────────────────────────────────────

ok('卡牌Boss：章末关卡击杀后进入BOSS_PENDING', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 跳到章末关卡（第1章末=第12关，根据CHAPTERS定义）
  const ch1 = chapterOfStage(1);
  const bossStage = ch1.endStage;
  const b = (context.player as any).v63AutoBattle;
  b.stage = bossStage;
  b.maxStage = bossStage - 1;
  // 重新生成敌人
  context.autoBattle.ensureStarted();
  // 确认是卡牌Boss
  const def = enemyDefForStage(bossStage);
  assert.equal(stageKind(bossStage), 'cardBoss', `第${bossStage}关应为cardBoss`);
  assert.equal(def.isCardBoss, true);
  // 强制击杀
  b.enemy.hp = 1;
  let bossPendingFired = false;
  context.events.on('v63BossPending', () => { bossPendingFired = true; });
  context.autoBattle.tapAttack();
  const v = context.autoBattle.view();
  assert.equal(v.status, 'BOSS_PENDING');
  assert.ok(bossPendingFired, 'v63BossPending事件应触发');
});

ok('bossDefeated：卡牌胜利后推进到下一章', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const ch1 = chapterOfStage(1);
  const bossStage = ch1.endStage;
  const b = (context.player as any).v63AutoBattle;
  b.stage = bossStage;
  b.maxStage = bossStage - 1;
  context.autoBattle.ensureStarted();
  b.enemy.hp = 1;
  context.autoBattle.tapAttack();
  assert.equal(context.autoBattle.view().status, 'BOSS_PENDING');
  context.autoBattle.bossDefeated();
  const v = context.autoBattle.view();
  assert.equal(v.status, 'FIGHTING');
  assert.equal(v.stage, bossStage + 1, '应推进到下一章第一关');
});

ok('bossFailed：卡牌失败后停留在Boss关', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const ch1 = chapterOfStage(1);
  const bossStage = ch1.endStage;
  const b = (context.player as any).v63AutoBattle;
  b.stage = bossStage;
  b.maxStage = bossStage - 1;
  context.autoBattle.ensureStarted();
  b.enemy.hp = 1;
  context.autoBattle.tapAttack();
  context.autoBattle.bossFailed();
  const v = context.autoBattle.view();
  assert.equal(v.status, 'FIGHTING');
  assert.equal(v.stage, bossStage, '应停留在Boss关');
  assert.equal(v.enemy!.hp, v.enemy!.maxHp, '敌人应满血重生');
});

// ── 8. 离线结算 ─────────────────────────────────────────────────────────────

ok('settleOffline：离线时间推关并获得收益', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const salaryBefore = context.player.salary;
  const r = context.autoBattle.settleOffline(3600); // 1小时
  assert.ok(r.stagesCleared > 0, '应推关');
  assert.ok(r.salary > 0, '应获得工资');
  assert.ok(context.player.salary > salaryBefore, '玩家工资应增加');
  assert.ok(context.autoBattle.view().stage > 1, '关卡应推进');
});

ok('settleOffline：Boss关离线不推', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  const ch1 = chapterOfStage(1);
  const bossStage = ch1.endStage;
  const b = (context.player as any).v63AutoBattle;
  b.stage = bossStage - 1;
  b.maxStage = bossStage - 2;
  context.autoBattle.ensureStarted();
  // 离线1小时，会推到bossStage-1之后停在Boss关前
  const r = context.autoBattle.settleOffline(3600);
  // boss关不推，所以最终stage不应超过bossStage
  assert.ok(context.autoBattle.view().stage <= bossStage, '不应越过卡牌Boss关');
});

ok('settleOffline：短于5秒不结算', () => {
  const { context } = make();
  const r = context.autoBattle.settleOffline(3);
  assert.equal(r.stagesCleared, 0);
  assert.equal(r.salary, 0);
});

// ── 9. toggleAuto / skipStage ───────────────────────────────────────────────

ok('toggleAuto：切换自动战斗开关', () => {
  const { context } = make();
  const v0 = context.autoBattle.view().autoEnabled;
  const v1 = context.autoBattle.toggleAuto();
  assert.equal(v1, !v0);
});

ok('skipStage：只能跳过已通关关卡', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  // 第1关未通关，不能跳
  const r0 = context.autoBattle.skipStage();
  assert.equal(r0.ok, false);
  // 标记已通关
  const b = (context.player as any).v63AutoBattle;
  b.maxStage = 5;
  b.stage = 3;
  context.autoBattle.ensureStarted();
  const r1 = context.autoBattle.skipStage();
  assert.equal(r1.ok, true);
  assert.equal(context.autoBattle.view().stage, 4);
});

// ── 10. 存档恢复 ────────────────────────────────────────────────────────────

ok('存档恢复：v63状态通过PlayerData深拷贝保留', () => {
  const { context } = make();
  context.autoBattle.ensureStarted();
  context.autoBattle.enterTower();
  const p = context.player;
  assert.ok(p.v63AutoBattle);
  assert.equal(p.v63AutoBattle!.towerFloor, 1);
  // 模拟存档→读档
  const saved = p.toSaveData();
  assert.ok(saved.v63AutoBattle);
  assert.equal(saved.v63AutoBattle!.towerFloor, 1);
  const restored = new PlayerData(saved);
  assert.equal(restored.v63AutoBattle!.towerFloor, 1);
  assert.equal(restored.v63AutoBattle!.stage, p.v63AutoBattle!.stage);
  // 深拷贝验证：修改拷贝不影响原对象
  restored.v63AutoBattle!.stage = 999;
  assert.notEqual(p.v63AutoBattle!.stage, 999);
});

console.log(`auto-battle-service tests passed (${passed})`);