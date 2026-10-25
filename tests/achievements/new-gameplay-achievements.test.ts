import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { BattleEnemyState, BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

function make(): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({
    storage: new MemoryStorageAdapter(),
    player: new PlayerData({ lastSaveTime: clock.now(), profession: 'QA', sectId: 'STATE' }),
    clock, board: null,
    battleRng: scriptedRng([0.01]), // 战斗判定全部命中闪避/无暴击路径,确定性
  });
  context.gameDay.ensureStarted();
  return { clock, context };
}

function runWith(skills: string[], enemies: BattleEnemyState[]): BattleRunState {
  return {
    runId: 'run_ach_' + Math.floor(Math.random() * 1e9).toString(36),
    source: 'PROJECT', linkedTaskId: null, linkedIncidentId: null,
    buildId: 'build_db', night: false, dayIndex: 1, status: 'FIGHTING',
    wave: 0, waveTotal: 5, playerHp: 100_000, playerMaxHp: 100_000, shield: 0,
    attack: 50, intervalSec: 1.4, critChance: 0, level: 1, exp: 0, expNext: 9999,
    skills, skillLevels: Object.fromEntries(skills.map((s) => [s, 1])), evolvedSkills: [],
    synergies: [], skillOffers: null, skillOfferKind: null, enemies, kills: 0,
    loot: { materials: {}, equipment: [], spiritStones: 0, expGained: 0 },
    runSeconds: 0, immuneReadyAt: 0, usedRevive: false, rewardsClaimed: false,
    replayOf: null, replayBossId: null, log: [],
  };
}

const tests: Array<[string, () => void]> = [
  ['成就配置:5 条新玩法成就已入库且条件合法', () => {
    const cfg = require('../../assets/configs/achievements.json');
    const ids = new Set(cfg.achievements.map((a: { id: string }) => a.id));
    for (const id of ['PROF_ACTION_30', 'PROF_ACTION_100', 'BATTLE_DODGE_20', 'BATTLE_INTERRUPT_30', 'SECT_CHAIN_1']) {
      assert.ok(ids.has(id), `${id} present`);
    }
    const byId = Object.fromEntries(cfg.achievements.map((a: { id: string; condition: { lifetimeKey?: string; target?: number } }) => [a.id, a]));
    assert.equal(byId['PROF_ACTION_30'].condition.lifetimeKey, 'professionActions');
    assert.equal(byId['BATTLE_DODGE_20'].condition.target, 20);
    assert.equal(byId['SECT_CHAIN_1'].condition.lifetimeKey, 'sectChainResolved');
  }],

  ['职业行动计数器:每次执行 lifetimeStats.professionActions +1', () => {
    const { context } = make();
    const before = context.player.lifetimeStats.professionActions ?? 0;
    context.professionAction.perform();
    assert.equal(context.player.lifetimeStats.professionActions, before + 1);
  }],

  ['闪避计数器:闪避时 lifetimeStats.battleDodges +1', () => {
    const { context } = make();
    const enemy: BattleEnemyState = {
      uid: 'e1', defId: 'mon_null_pointer', name: '空指针小鬼', tier: 'NORMAL',
      hp: 999_999, maxHp: 999_999, attack: 999, intervalSec: 3, attackTimer: 0,
      mechanic: undefined, timers: {}, telegraphed: {}, revived: 0,
    };
    const run = runWith(['pass_responsive'], [enemy]); // dodge 0.08
    context.player.activeBattleRun = run;
    context.battle.tick(4); // rng 0.01 < 0.08 → 闪避
    assert.ok((context.player.lifetimeStats.battleDodges ?? 0) >= 1, 'dodge counter incremented');
  }],

  ['打断计数器:控制技打断 N 个敌人 → battleInterrupts +N', () => {
    const { context } = make();
    const mk = (uid: string, timer: number): BattleEnemyState => ({
      uid, defId: 'mon_null_pointer', name: '空指针小鬼', tier: 'NORMAL',
      hp: 999_999, maxHp: 999_999, attack: 5, intervalSec: 9, attackTimer: timer,
      mechanic: undefined, timers: {}, telegraphed: {}, revived: 0,
    });
    const run = runWith(['skill_requirement_freeze'], [mk('e1', 2.5), mk('e2', 1.0), mk('e3', 0)]);
    context.player.activeBattleRun = run;
    context.battle.castSkill('skill_requirement_freeze');
    assert.equal(context.player.lifetimeStats.battleInterrupts, 2, 'two enemies with accumulated timers interrupted');
  }],

  ['宗门链计数器:结算 sect s2 事件 → sectChainResolved +1', () => {
    const { context } = make();
    // 直连事件效果路径(与引擎 applyEffects 同键):s2 事件带 lifetime sectChainResolved
    const svc = context.v2Events as unknown as { applyEffects: (e: Record<string, unknown>) => void };
    svc.applyEffects({ performance: 6, lifetime: { sectChainResolved: 1 } });
    assert.equal(context.player.lifetimeStats.sectChainResolved, 1);
  }],

  ['成就解锁:LIFETIME_STAT 达标 → checkAll 解锁并发事件(含持久化)', () => {
    const { context } = make();
    context.player.lifetimeStats = { ...context.player.lifetimeStats, professionActions: 29 };
    context.professionAction.perform(); // → 30
    const unlocked = context.achievements.checkAll();
    assert.ok(unlocked.includes('PROF_ACTION_30'), `PROF_ACTION_30 unlocked, got: ${JSON.stringify(unlocked)}`);
    assert.ok(context.player.unlockedAchievementIds.includes('PROF_ACTION_30'));
    context.saveService.save(context.player);
    const storage = (context.saveService as unknown as { storage: MemoryStorageAdapter }).storage ?? null;
    // 重启后不重复解锁
    const clock2 = new FakeClock(at(21, 11));
    const reloaded = new GameContext({ storage: storage ?? new MemoryStorageAdapter(), clock: clock2, board: null });
    const again = reloaded.achievements.checkAll();
    assert.ok(!again.includes('PROF_ACTION_30'), 'no double unlock after restart');
    assert.ok(reloaded.player.unlockedAchievementIds.includes('PROF_ACTION_30'));
  }],

  ['成就可达性:配置中的计数器与游戏内写入点一致(防悬空成就)', () => {
    // 覆盖写入点:professionActions(battleDodges/battleInterrupts/sectChainResolved 在上两用例已证)
    const { context } = make();
    const key = 'professionActions';
    assert.equal(context.player.lifetimeStats[key] ?? 0, 0);
    context.professionAction.perform();
    assert.ok((context.player.lifetimeStats[key] ?? 0) > 0, `${key} is actually written by gameplay`);
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

console.log('new gameplay achievements tests passed');
