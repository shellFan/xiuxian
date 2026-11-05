/**
 * V5.9-O.2 迁移：v3 战斗回归测试从 tick 语义迁到回合制卡牌语义。
 * 覆盖：双尊互锁复活上限/REVIVE 伪死/能量拒绝/三选一暂停/复盘 Boss/
 * Lv3 进化可达/DODGE 状态消耗。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { CardEnemy, CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';
import type { BattleRunState } from '../../assets/scripts/v3/battle-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

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

function envOf(context: GameContext): CardEngineEnv {
  const cards = (context.battle as unknown as { cards: { envFor: (r: BattleRunState) => CardEngineEnv } }).cards;
  return cards.envFor(context.battle.current()!);
}

function giveCard(context: GameContext, defId: string): string {
  const card = context.battle.battleCardView()!;
  const instance = { uid: `t_${defId}_${Math.floor(Math.random() * 1e9).toString(36)}`, defId, upgraded: 0, turnCostDelta: 0 };
  card.hand.push(instance);
  return instance.uid;
}

/** 打出攻击牌直到敌人死亡或能量耗尽（返回打出的次数）。 */
function strikeUntilDead(context: GameContext, target: CardEnemy): number {
  let plays = 0;
  let view = context.battle.battleCardView()!;
  while (target.hp > 0 && plays < 30) {
    view = context.battle.battleCardView()!;
    if (view.phase !== 'PLAYER_TURN') break;
    let strike = view.hand.find((c) => c.defId === 'card_strike' && !cardIsUnplayable(c.defId) && cardCost(c.defId) <= view.player.energy);
    if (!strike) strike = view.hand.find((c) => !cardIsUnplayable(c.defId) && cardCost(c.defId) <= view.player.energy);
    if (!strike) break;
    const def = cardDef(strike.defId);
    context.battle.playBattleCard(strike.uid, def?.target === 'ENEMY' ? target.uid : null, `s${plays}`);
    plays += 1;
  }
  return plays;
}

function cardDef(defId: string): import('../../assets/scripts/v59o/card-battle/card-types').CardDef | undefined {
  return (require('../../assets/scripts/v59o/card-battle/card-database') as typeof import('../../assets/scripts/v59o/card-battle/card-database')).cardDefById(defId);
}
function cardCost(defId: string): number {
  return cardDef(defId)?.cost ?? 99;
}
function cardIsUnplayable(defId: string): boolean {
  return cardDef(defId)?.unplayable === true;
}

function twinEnemy(uid: string): CardEnemy {
  return {
    uid, defId: 'boss_deadlock_twins', name: '死锁双尊', tier: 'BOSS',
    hp: 10, maxHp: 10, attack: 13, block: 0, statuses: {}, intent: null,
    timers: {}, telegraphed: {}, revived: 0, linkGroup: 'twin_test',
  };
}

const tests: Array<[string, () => void]> = [
  ['死锁双尊互锁复活有上限——战斗必然可胜利（P0 回归）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    // 置于终盘波次：双尊清空即胜利（对应旧手造 run wave=4 的语义）。
    view.wave = envOf(context).waveTotal - 1;
    view.enemies = [twinEnemy('twin_a'), twinEnemy('twin_b')];
    view.player.attack = 999;
    let mutualReviveSeen = false;
    let guard = 0;
    while (context.battle.current() && guard < 40) {
      guard += 1;
      const run = context.battle.current()!;
      if (run.skillOffers) context.battle.chooseSkill(run.skillOffers[0]);
      const live = context.battle.battleCardView()!;
      if (live.phase === 'REWARD_SELECTION') break;
      const alive = live.enemies.filter((e) => e.hp > 0);
      if (alive.length === 0) break;
      const target = alive[0]!;
      const played = strikeUntilDead(context, target);
      if (played === 0) {
        // 能量耗尽 → 结束回合；保留牌/新回合继续
        const revivedLog = live.log.some((line) => line.includes('死死锁住资源'));
        if (revivedLog) mutualReviveSeen = true;
        context.battle.endBattleTurn(`t${guard}`);
      }
      if (context.battle.battleCardView()?.log.some((line) => line.includes('死死锁住资源'))) mutualReviveSeen = true;
    }
    const finished = context.battle.finished();
    assert.ok(finished, 'twins battle must finish');
    assert.equal(finished.status, 'VICTORY', 'twins battle must be winnable');
    assert.ok(mutualReviveSeen, 'mutual revive fired at least once (mechanic preserved)');
    assert.equal(finished.kills, 2, 'only real deaths count as kills');
  }],

  ['REVIVE 伪死不计击杀不给经验（P2 回归）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    view.wave = envOf(context).waveTotal - 1; // 真死即胜利
    // 单体带 REVIVE 机制的 Boss（复活 40%）。
    const reviver: CardEnemy = { ...twinEnemy('revive_a'), linkGroup: undefined } as CardEnemy;
    view.enemies = [reviver];
    view.player.attack = 999;
    const run = context.battle.current()!;
    run.expNext = 999999; // 屏蔽升级干扰
    // 第一击：伪死 → 自复活 40%。
    const s1 = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s1, 'revive_a', 'k1');
    const live = context.battle.battleCardView()!;
    assert.ok(live.enemies[0]!.hp > 0, 'battle continues after fake death');
    assert.equal(run.kills, 0, 'fake death must not count as a kill');
    assert.equal(run.exp, 0, 'fake death must not grant exp');
    assert.equal(live.enemies[0]!.hp, 4, 'revived to 40% hp');
    assert.ok(live.log.some((l) => l.includes('又活了')), 'revive logged');
    // 第二击：复活次数用尽 → 真死。
    const s2 = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s2, 'revive_a', 'k2');
    const finished = context.battle.finished();
    assert.ok(finished, 'battle finished after real death');
    assert.equal(finished.status, 'VICTORY');
    assert.equal(finished.kills, 1, 'real death counts once');
    assert.ok(finished.loot.expGained > 0, 'exp granted exactly once');
  }],

  ['能量耗尽拒绝出牌——不再叠加伤害（P0 回归，能量经济替代旧 CD）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    const target: CardEnemy = { ...view.enemies[0]!, hp: 999999, maxHp: 999999 };
    view.enemies = [target];
    // 打空全部能量。
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      const live = context.battle.battleCardView()!;
      const playable = live.hand.find((c) => { const d = cardDef(c.defId); return d && !d.unplayable && d.cost <= live.player.energy; });
      if (!playable) break;
      const def = cardDef(playable.defId)!;
      context.battle.playBattleCard(playable.uid, def.target === 'ENEMY' ? target.uid : null, `e${guard}`);
    }
    assert.equal(context.battle.battleCardView()!.player.energy, 0, 'energy fully spent');
    const hpBefore = target.hp;
    const s = giveCard(context, 'card_strike');
    assert.throws(() => context.battle.playBattleCard(s, target.uid, 'over'), /能量不足/, 'second play must be rejected');
    assert.equal(context.battle.battleCardView()!.enemies[0]!.hp, hpBefore, 'rejected play must not deal damage');
    // 下一回合能量恢复后可再次出牌。
    context.battle.endBattleTurn('next');
    const live2 = context.battle.battleCardView()!;
    assert.equal(live2.player.energy, 3, 'energy restored');
    const s2 = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s2, target.uid, 'after');
    assert.ok(context.battle.battleCardView()!.enemies[0]!.hp < hpBefore, 'play after restore lands');
    context.battle.abandon();
  }],

  ['三选一挂起时禁止出牌与结束回合（P0/P2 回归）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const run = context.battle.current()!;
    run.skillOffers = ['skill_gc', 'skill_thread_pool', 'skill_plus_attack'];
    run.skillOfferKind = 'skill';
    assert.throws(() => context.battle.playBattleCard('whatever', null, 'x'), /技能选择/, 'play during pending choice must be rejected');
    assert.throws(() => context.battle.endBattleTurn('x'), /技能选择/, 'end turn during pending choice must be rejected');
    // 选择后恢复。
    context.battle.chooseSkill(null);
    const view = context.battle.battleCardView()!;
    assert.equal(view.phase, 'PLAYER_TURN', 'combat resumes after choice');
    context.battle.abandon();
  }],

  ['复盘 Boss 在终盘强制出场（P1 回归）', () => {
    const { context } = make();
    const run = context.battle.start('PROJECT', 'build_db', null, null, { replayBossId: 'boss_white_screen', replayOf: '白屏天魔（复盘）' });
    assert.equal(run.replayBossId, 'boss_white_screen', 'replay boss id persisted on run');
    const view = context.battle.battleCardView()!;
    const env = envOf(context);
    const spawned = env.spawnWave(env.waveTotal - 1, new CardRng(3), view);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0]!.defId, 'boss_white_screen', 'final wave must spawn the replayed boss');
  }],

  ['Lv2 基础技能换出后仍可触发 Lv3 进化二选一（P1 回归）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const run = context.battle.current()!;
    const view = context.battle.battleCardView()!;
    // 换装形态：skills 只剩 v2，skillLevels 里 base 保留 Lv2；击杀即升级。
    run.skills = ['skill_gc_v2'];
    run.skillLevels = { skill_gc: 2, skill_gc_v2: 2 };
    run.exp = 0;
    run.expNext = 5;
    view.player.attack = 9999;
    const weak: CardEnemy = { ...view.enemies[0]!, hp: 5, maxHp: 5 };
    view.enemies = [weak];
    const s = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s, weak.uid, 'evo1');
    assert.equal(run.skillOfferKind, 'evolution', `expected evolution offer, got: ${run.skillOfferKind}`);
    assert.ok(run.skillOffers, 'offers present');
    const evoOptions = (run.skillOffers ?? []).filter((id) => id.startsWith('evo_gc'));
    assert.ok(evoOptions.length >= 1, `evolution options offered, got: ${JSON.stringify(run.skillOffers)}`);
    context.battle.chooseSkill(evoOptions[0]!);
    assert.equal(context.battle.current()!.skillLevels?.skill_gc, 3, 'base skill advanced to Lv3');
    assert.ok(context.player.skillEvolutions?.skill_gc, 'evolution persisted on player');
    context.battle.abandon();
  }],

  ['DODGE 状态按次消耗——消耗完后攻击命中（P2 回归）', () => {
    const { context } = make();
    context.battle.start('PROJECT', 'build_db');
    const view = context.battle.battleCardView()!;
    const dodger: CardEnemy = { ...view.enemies[0]!, hp: 1000, maxHp: 1000, statuses: { DODGE: 1 } };
    view.enemies = [dodger];
    view.player.attack = 50;
    const s1 = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s1, dodger.uid, 'd1');
    assert.equal(context.battle.battleCardView()!.enemies[0]!.hp, 1000, 'attack dodged while DODGE active');
    assert.equal(context.battle.battleCardView()!.enemies[0]!.statuses.DODGE, undefined, 'dodge consumed');
    const s2 = giveCard(context, 'card_strike');
    context.battle.playBattleCard(s2, dodger.uid, 'd2');
    assert.ok(context.battle.battleCardView()!.enemies[0]!.hp < 1000, 'attack lands after dodge consumed');
    context.battle.abandon();
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
