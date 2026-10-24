import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import type { BattleEnemyState, BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

/** 简单 LCG：战斗 rng 可注入，测试可复现。 */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(hour = 10): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(0x5eed) });
  context.gameDay.ensureStarted();
  return { clock, context };
}

/** 手工构造一个合法的 FIGHTING run（绕过 start() 的随机波次，精确控制敌人）。 */
function handBuiltRun(overrides: Partial<BattleRunState> = {}, enemies: BattleEnemyState[] = []): BattleRunState {
  return {
    runId: `run_test_${Math.floor(Math.random() * 1e9).toString(36)}`,
    source: 'PROJECT',
    linkedTaskId: null,
    linkedIncidentId: null,
    buildId: 'build_db',
    night: false,
    dayIndex: 1,
    status: 'FIGHTING',
    wave: 4,
    waveTotal: 5,
    playerHp: 100000,
    playerMaxHp: 100000,
    shield: 0,
    attack: 99999,
    intervalSec: 1.4,
    critChance: 0,
    level: 1,
    exp: 0,
    expNext: 30,
    skills: ['skill_index_sword'],
    skillLevels: { skill_index_sword: 1 },
    evolvedSkills: [],
    synergies: [],
    skillOffers: null,
    skillOfferKind: null,
    enemies,
    kills: 0,
    loot: { materials: {}, equipment: [], spiritStones: 0, expGained: 0 },
    runSeconds: 0,
    immuneReadyAt: 0,
    usedRevive: false,
    rewardsClaimed: false,
    replayOf: null,
    replayBossId: null,
    log: [],
    ...overrides,
  };
}

function twinEnemy(uid: string): BattleEnemyState {
  return {
    uid,
    defId: 'boss_deadlock_twins',
    name: '死锁双尊',
    tier: 'BOSS',
    hp: 10,
    maxHp: 10,
    attack: 13,
    intervalSec: 2.2,
    attackTimer: 0,
    mechanic: undefined,
    timers: {},
    telegraphed: {},
    revived: 0,
    linkGroup: 'twin_test',
  };
}

const tests: Array<[string, () => void]> = [
  ['死锁双尊互锁复活有上限——战斗必然可胜利（P0 回归）', () => {
    const { context } = make();
    const run = handBuiltRun({}, [twinEnemy('twin_a'), twinEnemy('twin_b')]);
    context.player.activeBattleRun = run;
    let mutualReviveSeen = false;
    for (let i = 0; i < 60; i += 1) {
      const live = context.battle.current();
      if (!live) throw new Error('battle vanished');
      if (live.skillOffers) context.battle.chooseSkill(live.skillOffers[0]);
      context.battle.tick(1);
      // persist() 会把 log 截断到最近 N 条，互锁标记必须在循环内即时检查
      if ((context.player.activeBattleRun as BattleRunState | null)?.log.some((line) => line.includes('死死锁住资源'))) mutualReviveSeen = true;
      const finished = context.battle.finished();
      if (finished) {
        assert.equal(finished.status, 'VICTORY', 'twins battle must be winnable');
        assert.ok(mutualReviveSeen, 'mutual revive fired at least once (mechanic preserved)');
        // 复活有上限：仅两次真死（每尊一次）
        assert.equal(finished.kills, 2, 'only real deaths count as kills');
        return;
      }
    }
    throw new Error('twins battle did not finish within 60 ticks — mutual revive still unbounded');
  }],

  ['REVIVE 伪死不计击杀不给经验（P2 回归）', () => {
    const { context } = make();
    const loneReviver: BattleEnemyState = { ...twinEnemy('revive_a'), linkGroup: undefined };
    const run = handBuiltRun({}, [loneReviver]);
    context.player.activeBattleRun = run;
    // tick(0.2) = 恰好一次玩家攻击：伪死 → 自复活，不记击杀
    context.battle.tick(0.2);
    const live = context.battle.current();
    assert.ok(live, 'battle must continue after fake death');
    assert.equal(live.kills, 0, 'fake death must not count as a kill');
    assert.equal(live.exp, 0, 'fake death must not grant exp');
    assert.equal(live.enemies[0]?.hp, 4, 'revived to 40% hp');
    // 再一击：复活次数已用尽 → 真死 → 终盘波次清空 → 胜利结算
    context.battle.tick(0.2);
    const finished = context.battle.finished();
    assert.ok(finished, 'battle finished after real death');
    assert.equal(finished.status, 'VICTORY');
    assert.equal(finished.kills, 1, 'real death counts once');
    assert.equal(finished.loot.expGained, 90, 'exp granted exactly once (run.exp is consumed by level-ups)');
  }],

  ['主动技能有施放间隔——连点不再叠加攻击步（P0 回归）', () => {
    const { context } = make();
    const enemy: BattleEnemyState = {
      uid: 'mon_test', defId: 'mon_null_bug', name: '空指针虫', tier: 'NORMAL',
      hp: 999999, maxHp: 999999, attack: 1, intervalSec: 9, attackTimer: 0,
      mechanic: undefined, timers: {}, telegraphed: {}, revived: 0,
    };
    const run = handBuiltRun({ runSeconds: 100 }, [enemy]);
    context.player.activeBattleRun = run;
    context.battle.castSkill('skill_index_sword');
    const hpAfterFirst = context.battle.current()!.enemies[0].hp;
    assert.throws(() => context.battle.castSkill('skill_index_sword'), /冷却/, 'second immediate cast must be rejected');
    assert.equal(context.battle.current()!.enemies[0].hp, hpAfterFirst, 'rejected cast must not deal damage');
    // 推进 runSeconds 超过攻击间隔后可再次施放
    context.battle.tick(5);
    context.battle.castSkill('skill_index_sword');
    assert.ok(context.battle.current()!.enemies[0].hp < hpAfterFirst, 'cast after cooldown lands');
  }],

  ['三选一挂起时禁止施放、战斗暂停（P0/P2 回归）', () => {
    const { context } = make();
    const enemy: BattleEnemyState = {
      uid: 'mon_test', defId: 'mon_null_bug', name: '空指针虫', tier: 'NORMAL',
      hp: 999999, maxHp: 999999, attack: 1, intervalSec: 9, attackTimer: 0,
      mechanic: undefined, timers: {}, telegraphed: {}, revived: 0,
    };
    const run = handBuiltRun({ runSeconds: 100, skillOffers: ['skill_gc', 'skill_thread_pool', 'skill_plus_attack'], skillOfferKind: 'skill' }, [enemy]);
    context.player.activeBattleRun = run;
    assert.throws(() => context.battle.castSkill('skill_index_sword'), /技能选择/, 'cast during pending choice must be rejected');
    const hpBefore = context.battle.current()!.enemies[0].hp;
    context.battle.tick(3);
    assert.equal(context.battle.current()!.enemies[0].hp, hpBefore, 'combat must pause while choice is pending');
    // 选择后战斗恢复
    context.battle.chooseSkill(null);
    context.battle.tick(2);
    assert.ok(context.battle.current()!.enemies[0].hp < hpBefore, 'combat resumes after choice');
  }],

  ['复盘 Boss 在终盘强制出场（P1 回归）', () => {
    const { context } = make();
    const run = context.battle.start('PROJECT', 'build_db', null, null, { replayBossId: 'boss_white_screen', replayOf: '白屏天魔（复盘）' });
    assert.equal(run.replayBossId, 'boss_white_screen', 'replay boss id persisted on run');
    for (let i = 0; i < 2000; i += 1) {
      const live = context.battle.current();
      if (!live) throw new Error('battle vanished');
      if (live.skillOffers) context.battle.chooseSkill(live.skillOffers[0]);
      // 终盘波次：校验复盘 Boss 真的出场
      if (live.status === 'FIGHTING' && live.wave === live.waveTotal - 1 && live.enemies.length > 0) {
        assert.ok(
          live.enemies.every((e) => e.defId === 'boss_white_screen'),
          `final wave must spawn the replayed boss, got: ${live.enemies.map((e) => e.defId).join(',')}`,
        );
        assert.ok(live.log.some((line) => line.includes('复盘回忆')), 'replay telegraph logged');
        return;
      }
      context.battle.tick(1);
      if (context.battle.finished()) throw new Error('battle finished before final wave check');
    }
    throw new Error('battle did not reach final wave within budget');
  }],

  ['Lv2 基础技能换出后仍可触发 Lv3 进化二选一（P1 回归）', () => {
    const { context } = make();
    // up: 换装后的形态：skills 只剩 v2，skillLevels 里 base 保留 Lv2
    const enemy: BattleEnemyState = {
      uid: 'mon_test', defId: 'mon_null_bug', name: '空指针虫', tier: 'NORMAL',
      hp: 20, maxHp: 20, attack: 1, intervalSec: 9, attackTimer: 0,
      mechanic: undefined, timers: {}, telegraphed: {}, revived: 0,
    };
    const run = handBuiltRun(
      // wave 0（非终盘）：击杀推进波次而非直接胜利，升级 offers 得以挂起
      { wave: 0, skills: ['skill_gc_v2'], skillLevels: { skill_gc: 2, skill_gc_v2: 2 }, exp: 30 },
      [enemy],
    );
    context.player.activeBattleRun = run;
    // 击杀触发升级 → prepareSkillOffers 应给出 evolution 二选一
    context.battle.tick(0.2);
    const live = context.battle.current()!;
    assert.equal(live.skillOfferKind, 'evolution', `expected evolution offer, got: ${live.skillOfferKind}`);
    assert.ok(live.skillOffers, 'offers present');
    const evoOptions = (live.skillOffers ?? []).filter((id) => id.startsWith('evo_gc'));
    assert.ok(evoOptions.length >= 1, `evolution options offered, got: ${JSON.stringify(live.skillOffers)}`);
    // 选择进化 → Lv3 持久化
    context.battle.chooseSkill(evoOptions[0]!);
    assert.equal(context.battle.current()!.skillLevels?.skill_gc, 3, 'base skill advanced to Lv3');
    assert.ok(context.player.skillEvolutions?.skill_gc, 'evolution persisted on player');
  }],

  ['DODGE 闪避窗口按秒过期（P2 回归）', () => {
    const { context } = make();
    const dodger: BattleEnemyState = {
      uid: 'boss_test', defId: 'boss_irreproducible', name: '复现天魔', tier: 'BOSS',
      hp: 1000, maxHp: 1000, attack: 5, intervalSec: 3, attackTimer: 0,
      mechanic: undefined, timers: { __dodgeActive: 3 }, telegraphed: {}, revived: 0,
    };
    // 窗口内：攻击被闪避，血量不变
    const run = handBuiltRun({ attack: 10 }, [{ ...dodger }]);
    context.player.activeBattleRun = run;
    context.battle.tick(0.2);
    assert.equal(context.battle.current()!.enemies[0]?.hp, 1000, 'attack dodged inside window');
    // 窗口只剩 0.05s：先按秒衰减到 0，随后攻击命中（旧代码窗口永不过期，会一直闪避）
    const run2 = handBuiltRun({ attack: 10 }, [{ ...dodger, timers: { __dodgeActive: 0.05 } }]);
    context.player.activeBattleRun = run2;
    context.battle.tick(0.2);
    assert.ok((context.battle.current()!.enemies[0]?.hp ?? 1000) < 1000, 'attack lands after window expires');
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

console.log('v3 battle regression tests passed');
