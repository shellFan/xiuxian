import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { BattleEnemyState, BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

/** 可控 rng:固定序列(测试确定性)。 */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

function make(rng: () => number): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: rng });
  context.gameDay.ensureStarted();
  return { clock, context };
}

function tankyEnemy(uid: string, over: Partial<BattleEnemyState> = {}): BattleEnemyState {
  return {
    uid, defId: 'mon_null_pointer', name: '空指针小鬼', tier: 'NORMAL',
    hp: 999_999, maxHp: 999_999, attack: 5, intervalSec: 3, attackTimer: 0,
    mechanic: undefined, timers: {}, telegraphed: {}, revived: 0, ...over,
  };
}

function runWith(skills: string[], enemies: BattleEnemyState[], overrides: Partial<BattleRunState> = {}): BattleRunState {
  return {
    runId: 'run_n11_' + Math.floor(Math.random() * 1e9).toString(36),
    source: 'PROJECT', linkedTaskId: null, linkedIncidentId: null,
    buildId: 'build_db', night: false, dayIndex: 1, status: 'FIGHTING',
    wave: 0, waveTotal: 5, playerHp: 100_000, playerMaxHp: 100_000, shield: 0,
    attack: 50, intervalSec: 1.4, critChance: 0, level: 1, exp: 0, expNext: 9999,
    skills, skillLevels: Object.fromEntries(skills.map((s) => [s, 1])), evolvedSkills: [],
    synergies: [], skillOffers: null, skillOfferKind: null, enemies, kills: 0,
    loot: { materials: {}, equipment: [], spiritStones: 0, expGained: 0 },
    runSeconds: 0, immuneReadyAt: 0, usedRevive: false, rewardsClaimed: false,
    replayOf: null, replayBossId: null, log: [], ...overrides,
  };
}

const tests: Array<[string, () => void]> = [
  ['防御技施放:获得护盾且本回合不出手(攻击/防御取舍)', () => {
    const { context } = make(scriptedRng([0.9]));
    const enemy = tankyEnemy('e1');
    const run = runWith(['skill_cache_shield'], [enemy]);
    context.player.activeBattleRun = run;
    const hpBefore = enemy.hp;
    context.battle.castSkill('skill_cache_shield');
    const live = context.battle.current()!;
    assert.equal(live.shield, 30, 'shield granted by defensive cast');
    assert.equal(live.enemies[0].hp, hpBefore, 'defensive cast does not attack');
    assert.ok(live.log.some((l) => l.includes('护盾')), 'feedback logged');
  }],

  ['控制技施放:打断已积累的敌人攻势', () => {
    const { context } = make(scriptedRng([0.9]));
    const enemy = tankyEnemy('e1', { attackTimer: 2.5 }); // 即将出手
    const run = runWith(['skill_requirement_freeze'], [enemy]);
    context.player.activeBattleRun = run;
    context.battle.castSkill('skill_requirement_freeze');
    const live = context.battle.current()!;
    assert.equal(live.enemies[0].attackTimer, 0, 'enemy attack timer reset by control cast');
  }],

  ['攻击技施放:立即额外攻击步(specialty 1.2 × damageMul 1.35 聚合)', () => {
    const { context } = make(scriptedRng([0.99, 0.99, 0.99])); // 无暴击
    const enemy = tankyEnemy('e1');
    const run = runWith(['skill_null_sword'], [enemy]); // damageMul 0.35 已聚合
    context.player.activeBattleRun = run;
    const hpBefore = enemy.hp;
    context.battle.castSkill('skill_null_sword');
    const live = context.battle.current()!;
    const dealt = hpBefore - live.enemies[0].hp;
    // attack 50 × specialty 1.2(mon_null_pointer ∈ JAVA 池)× damageMul 1.35 = 81
    assert.equal(dealt, Math.floor(50 * 1.2 * 1.35), `expected 81, got ${dealt}`);
    assert.ok(live.log.some((l) => l.includes('主动发动')), 'cast feedback logged');
  }],

  ['玩家闪避:dodgeBonus 生效并有反馈日志(死属性接通)', () => {
    // pass_responsive dodge=0.08;rng=0.01 → 闪避命中判定
    const { context } = make(scriptedRng([0.01])); // 所有判定都 < dodge 0.08 → 敌人攻击必被闪避
    const enemy = tankyEnemy('e1', { attack: 999 });
    const run = runWith(['pass_responsive'], [enemy]);
    context.player.activeBattleRun = run;
    context.battle.tick(4); // 敌人 3s 攻击间隔走满 → 攻击判定吃 rng=0.01 < 0.08 → 闪避
    const live = context.battle.current()!;
    assert.ok(live.log.some((l) => l.includes('闪开了')), 'dodge feedback logged');
    assert.equal(live.playerHp, live.playerMaxHp, 'no damage taken on dodge');
  }],

  ['敌人意图:telegraphed 置位后进入预警窗口(供 UI 渲染)', () => {
    const { context } = make(scriptedRng([0.9]));
    // Boss 带 SUMMON everySec 5:attackTimer 累积到 every-2 → telegraphed.SUMMON = true
    const boss = tankyEnemy('b1', { defId: 'boss_oom_lord', name: 'OOM 领主', tier: 'BOSS' });
    const run = runWith(['skill_null_sword'], [boss]);
    context.player.activeBattleRun = run;
    context.battle.tick(8);
    const live = context.battle.current()!;
    const tele = live.enemies[0]?.telegraphed ?? {};
    assert.ok(tele['SUMMON'] === true || live.enemies.length > 1, 'SUMMON telegraph set or already fired');
  }],
];

for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

console.log('v3 battle strategy tests passed');
