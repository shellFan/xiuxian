/**
 * V5.9-O.2 卡牌引擎全边界测试（§41）：
 * 五手牌/三能量/费用/能量不足/抽牌/弃牌/洗牌/消耗牌/结束回合/敌人行动/
 * 格挡/状态效果/胜负/奖励幂等/保留与状态牌/种子可复现。
 */
import assert from 'node:assert/strict';
import {
  beginCardBattle,
  claimCardReward,
  drawCards,
  effectiveCost,
  endPlayerTurn,
  isCardBattleState,
  makeCardInstance,
  playCard,
} from '../../assets/scripts/v59o/card-battle/card-engine';
import { installEngineResolver, cardDefById, battleRules } from '../../assets/scripts/v59o/card-battle/card-database';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { CardEnemy, CardEngineEnv, CardInstance } from '../../assets/scripts/v59o/card-battle/card-types';
import type { CardBattleState } from '../../assets/scripts/v59o/card-battle/card-types';

installEngineResolver();

function makeEnv(waveTotal = 2, overrides: Partial<CardEngineEnv> = {}, enemyOpts: { hp?: number; attack?: number } = {}): CardEngineEnv & { spawnedWaves: number[] } {
  const env: CardEngineEnv & { spawnedWaves: number[] } = {
    spawnedWaves: [],
    waveTotal,
    reviveOnce: false,
    spawnWave: (waveIndex: number) => {
      env.spawnedWaves.push(waveIndex);
      return [makeEnemy(`wave${waveIndex}`, enemyOpts)];
    },
    rollRewards: () => ['card_heavy', 'card_shield', 'card_docs'],
    planIntent: (enemy: CardEnemy) => ({ kind: 'ATTACK', damage: enemy.attack, hits: 1 }),
    runBossSpecial: () => {},
    ...overrides,
  };
  return env;
}

function makeEnemy(name: string, opts: { hp?: number; attack?: number } = {}): CardEnemy {
  return {
    uid: `enemy_${name}`,
    defId: `mon_${name}`,
    name,
    tier: 'NORMAL',
    hp: opts.hp ?? 60,
    maxHp: opts.hp ?? 60,
    attack: opts.attack ?? 8,
    block: 0,
    statuses: {},
    intent: null,
    timers: {},
    telegraphed: {},
  };
}

let fixtureSeq = 0;

function beginFixture(opts: {
  waveTotal?: number;
  deckDefIds?: string[];
  playerHp?: number;
  playerAttack?: number;
  seed?: number;
  reviveOnce?: boolean;
  enemyHp?: number;
  enemyAttack?: number;
} = {}): { state: CardBattleState; env: CardEngineEnv & { spawnedWaves: number[] } } {
  const env = makeEnv(opts.waveTotal ?? 2, { reviveOnce: opts.reviveOnce ?? false }, { hp: opts.enemyHp, attack: opts.enemyAttack });
  const deckIds = opts.deckDefIds ?? ['card_strike', 'card_strike', 'card_block', 'card_block', 'card_block'];
  fixtureSeq += 1;
  const state = beginCardBattle({
    battleId: `bt_test_${fixtureSeq}`,
    runId: `run_test_${fixtureSeq}`,
    seed: opts.seed ?? 42,
    playerHp: opts.playerHp ?? 100,
    playerMaxHp: opts.playerHp ?? 100,
    playerAttack: opts.playerAttack ?? 20,
    playerCritChance: 0,
    startShield: 0,
    baseEnergy: battleRules().baseEnergy,
    drawPerTurn: battleRules().drawPerTurn,
    handLimit: battleRules().handLimit,
    deck: deckIds.map((id, i) => ({ uid: `${id}_f${fixtureSeq}_${i}`, defId: id, upgraded: 0, turnCostDelta: 0 })),
    modifiers: { sectId: null, destinyId: null, startBlockPerTurn: 0, damageMul: 1, endTurnHeal: 0, energyEveryTurns: 0, openingStatuses: {} },
    env,
  });
  return { state, env };
}

function handOf(state: CardBattleState, defId: string): CardInstance | undefined {
  return state.hand.find((c) => c.defId === defId);
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// ── 开局与能量 ───────────────────────────────────────────────────────────────

ok('开局手牌 5 张、能量 3 点、阶段为 PLAYER_TURN', () => {
  const { state } = beginFixture({ deckDefIds: ['card_strike', 'card_strike', 'card_strike', 'card_strike', 'card_block'] });
  assert.equal(state.hand.length, 5);
  assert.equal(state.player.energy, 3);
  assert.equal(state.phase, 'PLAYER_TURN');
  assert.equal(state.turn, 1);
});

ok('出牌扣除能量；能量不足整体拒绝且状态不变', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike', 'card_block'] });
  const strike = handOf(state, 'card_strike')!;
  const enemy = state.enemies[0]!;
  playCard(state, env, strike.uid, enemy.uid, 'a1');
  assert.equal(state.player.energy, 2);
  const block = handOf(state, 'card_block')!;
  playCard(state, env, block.uid, null, 'a2');
  assert.equal(state.player.energy, 1);
  // 能量不足：heavy 需要 2 能量 → 拒绝且状态不变。
  const playerBefore = JSON.stringify(state.player);
  const enemyHpBefore = enemy.hp;
  const fakeHeavy: CardInstance = { uid: 'fake_heavy', defId: 'card_heavy', upgraded: 0, turnCostDelta: 0 };
  state.hand.push(fakeHeavy);
  assert.throws(() => playCard(state, env, 'fake_heavy', enemy.uid, 'a4'), /能量不足/);
  assert.equal(JSON.stringify(state.player), playerBefore);
  assert.equal(enemy.hp, enemyHpBefore);
});

ok('0 费用卡不消耗能量', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'], enemyHp: 9999 });
  const enemy = state.enemies[0]!;
  const breath = makeCardInstance(state, 'card_breath');
  state.hand.push(breath);
  const before = state.player.energy;
  playCard(state, env, breath.uid, null, 'z1');
  assert.equal(state.player.energy, before);
  assert.equal(state.player.block, 4);
});

ok('手牌外的卡、非法目标、非玩家回合都被拒绝', () => {
  const { state, env } = beginFixture();
  assert.throws(() => playCard(state, env, 'nope', null, 'x1'), /手牌/);
  const strike = handOf(state, 'card_strike')!;
  assert.throws(() => playCard(state, env, strike.uid, null, 'x2'), /目标/);
  assert.throws(() => playCard(state, env, strike.uid, 'enemy_nope', 'x3'), /目标/);
  state.phase = 'ENEMY_TURN';
  assert.throws(() => playCard(state, env, strike.uid, state.enemies[0]!.uid, 'x4'), /玩家出牌阶段/);
});

ok('重复 actionId 幂等：只结算一次', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'] });
  const strike = handOf(state, 'card_strike')!;
  const enemy = state.enemies[0]!;
  playCard(state, env, strike.uid, enemy.uid, 'dup-1');
  const hpAfterFirst = enemy.hp;
  playCard(state, env, strike.uid, enemy.uid, 'dup-1');
  assert.equal(enemy.hp, hpAfterFirst);
  assert.ok(hpAfterFirst < 60);
});

// ── 伤害与状态 ───────────────────────────────────────────────────────────────

ok('攻击卡按攻击力×倍率结算', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'], playerAttack: 20 });
  const strike = handOf(state, 'card_strike')!;
  const enemy = state.enemies[0]!;
  playCard(state, env, strike.uid, enemy.uid, 'd1');
  assert.equal(enemy.hp, 60 - 20);
});

ok('格挡吸收敌人攻击，玩家回合开始清空格挡', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_block', 'card_block', 'card_block', 'card_block'], playerHp: 100 });
  const enemy = state.enemies[0]!;
  enemy.attack = 8;
  for (let i = 0; i < 2; i += 1) {
    const block = handOf(state, 'card_block');
    if (block) playCard(state, env, block.uid, null, `b${i}`);
  }
  assert.equal(state.player.block, 10);
  const hpBefore = state.player.hp;
  endPlayerTurn(state, env, 'end1');
  assert.equal(state.player.hp, hpBefore);
  assert.equal(state.turn, 2);
  assert.equal(state.player.block, 0);
});

ok('虚弱降低玩家伤害，易伤提高所受伤害', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'], playerAttack: 30, enemyHp: 999 });
  const enemy = state.enemies[0]!;
  const strike = handOf(state, 'card_strike')!;
  state.player.statuses.WEAK = 1;
  playCard(state, env, strike.uid, enemy.uid, 'w1');
  assert.equal(enemy.hp, 999 - Math.floor(30 * 0.66));
  state.player.statuses.WEAK = 0;
  enemy.statuses.VULNERABLE = 1;
  const strike2 = makeCardInstance(state, 'card_strike');
  state.hand.push(strike2);
  const hpBefore = enemy.hp;
  playCard(state, env, strike2.uid, enemy.uid, 'w2');
  assert.equal(enemy.hp, hpBefore - Math.floor(30 * 1.5));
});

ok('力量状态加成攻击，中毒按层结算并递减', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'], playerAttack: 20, enemyHp: 500, enemyAttack: 0 });
  const enemy = state.enemies[0]!;
  state.player.statuses.STRENGTH = 3;
  const strike = handOf(state, 'card_strike')!;
  playCard(state, env, strike.uid, enemy.uid, 's1');
  assert.equal(enemy.hp, 500 - 23);
  state.player.statuses.POISON = 2;
  const hpBefore = state.player.hp;
  endPlayerTurn(state, env, 's2');
  // 敌人攻击保底 1 点（攻击 0 时亦然）+ 中毒 2。
  assert.equal(state.player.hp, hpBefore - 1 - 2);
  assert.equal(state.player.statuses.POISON, 1);
});

// ── 抽牌/弃牌/洗牌/消耗 ──────────────────────────────────────────────────────

ok('抽牌堆耗尽后弃牌堆洗回', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike', 'card_block'], enemyHp: 9999 });
  const enemy = state.enemies[0]!;
  assert.equal(state.drawPile.length, 0);
  while (state.hand.length > 0) {
    const card = state.hand[0]!;
    const target = cardDefById(card.defId)!.target === 'ENEMY' ? enemy.uid : null;
    playCard(state, env, card.uid, target, `r${card.uid}`);
  }
  assert.equal(state.discardPile.length, 2);
  endPlayerTurn(state, env, 'r-end1');
  assert.equal(state.reshuffles, 1);
  assert.equal(state.hand.length, 2);
});

ok('消耗牌进入消耗堆，状态牌无法打出且回合结束自燃，保留牌留手', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike', 'card_block'], playerHp: 100, enemyHp: 9999 });
  const enemy = state.enemies[0]!;
  const potion = makeCardInstance(state, 'card_potion');
  state.hand.push(potion);
  playCard(state, env, potion.uid, null, 'e1');
  assert.equal(state.exhaustPile.length, 1);
  const fatigue = makeCardInstance(state, 'card_fatigue');
  state.hand.push(fatigue);
  assert.throws(() => playCard(state, env, fatigue.uid, null, 'e2'), /无法主动打出/);
  const overtime = makeCardInstance(state, 'card_overtime');
  state.hand.push(overtime);
  endPlayerTurn(state, env, 'e3');
  assert.equal(state.exhaustPile.some((c) => c.uid === fatigue.uid), true, '状态牌应自燃');
  assert.equal(state.hand.some((c) => c.uid === overtime.uid), true, '保留牌应留在手牌');
});

ok('手牌上限：超出部分进入弃牌堆', () => {
  const { state } = beginFixture({ deckDefIds: ['card_strike'] });
  state.handLimit = 3;
  state.hand = [];
  state.drawPile = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ uid: `x${x}`, defId: 'card_strike', upgraded: 0, turnCostDelta: 0 }));
  drawCards(state, 5);
  assert.equal(state.hand.length, 3);
  assert.equal(state.discardPile.length, 2);
});

// ── 回合与胜负 ───────────────────────────────────────────────────────────────

ok('结束回合后敌人行动一次；同 actionId 重复结束回合不重复执行', () => {
  const { state, env } = beginFixture({ deckDefIds: ['card_strike'], playerHp: 100, enemyAttack: 12 });
  const hpBefore = state.player.hp;
  endPlayerTurn(state, env, 't1');
  assert.equal(state.player.hp, hpBefore - 12);
  assert.equal(state.phase, 'PLAYER_TURN');
  endPlayerTurn(state, env, 't1'); // 幂等：不重复
  assert.equal(state.player.hp, hpBefore - 12);
  endPlayerTurn(state, env, 't2'); // 新回合合法结束
  assert.equal(state.player.hp, hpBefore - 24);
});

ok('波次推进：清空第一波后第二波入场；最后一波清空进入奖励选择', () => {
  const { state, env } = beginFixture({ waveTotal: 2, deckDefIds: ['card_strike', 'card_strike', 'card_strike'], playerAttack: 99 });
  let guard = 0;
  while (state.phase === 'PLAYER_TURN' && guard < 12) {
    guard += 1;
    let strike = state.hand.find((c) => c.defId === 'card_strike');
    if (!strike) {
      strike = makeCardInstance(state, 'card_strike');
      state.hand.push(strike);
    }
    playCard(state, env, strike.uid, state.enemies[0]!.uid, `w${guard}`);
  }
  assert.equal(state.phase, 'REWARD_SELECTION');
  assert.equal(state.wave, 1);
  assert.equal(env.spawnedWaves.length, 2);
  assert.ok(state.reward && state.reward.candidates.length === 3);
});

ok('奖励领取幂等：重复领取抛错；非法选项抛错', () => {
  const { state, env } = beginFixture({ waveTotal: 1, deckDefIds: ['card_strike'], playerAttack: 99 });
  const strike = handOf(state, 'card_strike')!;
  playCard(state, env, strike.uid, state.enemies[0]!.uid, 'r1');
  assert.equal(state.phase, 'REWARD_SELECTION');
  assert.throws(() => claimCardReward(state, 'card_unknown'), /无效的奖励选项/);
  claimCardReward(state, 'card_heavy');
  assert.equal(state.phase, 'FINISHED');
  assert.equal(state.reward!.chosen, 'card_heavy');
  assert.throws(() => claimCardReward(state, 'card_shield'), /已领取/);
});

ok('放弃奖励（null）合法并进入 FINISHED', () => {
  const { state, env } = beginFixture({ waveTotal: 1, deckDefIds: ['card_strike'], playerAttack: 99 });
  const strike = handOf(state, 'card_strike')!;
  playCard(state, env, strike.uid, state.enemies[0]!.uid, 'sk1');
  claimCardReward(state, null);
  assert.equal(state.phase, 'FINISHED');
  assert.equal(state.reward!.chosen, null);
});

ok('玩家死亡进入 FINISHED；灾备重生可救一次', () => {
  const dead = beginFixture({ deckDefIds: ['card_strike'], playerHp: 5, enemyAttack: 50 });
  dead.state.player.hp = 1;
  endPlayerTurn(dead.state, dead.env, 'x1');
  assert.equal(dead.state.phase, 'FINISHED');
  const revived = beginFixture({ deckDefIds: ['card_strike'], playerHp: 100, reviveOnce: true, enemyAttack: 50 });
  revived.state.player.hp = 1;
  endPlayerTurn(revived.state, revived.env, 'y1');
  assert.equal(revived.state.phase, 'PLAYER_TURN');
  assert.equal(revived.state.player.usedRevive, true);
  assert.ok(revived.state.player.hp > 1);
});

ok('同种子完全可复现（洗牌/意图/暴击序列一致）', () => {
  const run = (seed: number): string => {
    const f = beginFixture({ seed, deckDefIds: ['card_strike', 'card_strike', 'card_block', 'card_block', 'card_block'], enemyHp: 500 });
    const enemy = f.state.enemies[0]!;
    for (let turn = 0; turn < 3; turn += 1) {
      for (const card of [...f.state.hand]) {
        const def = cardDefById(card.defId)!;
        if (def.cost > f.state.player.energy) continue; // 能量不足则跳过
        if (def.target === 'ENEMY') playCard(f.state, f.env, card.uid, enemy.uid, `p${turn}_${card.uid}`);
        else playCard(f.state, f.env, card.uid, null, `p${turn}_${card.uid}`);
      }
      if (f.state.phase !== 'PLAYER_TURN') break;
      endPlayerTurn(f.state, f.env, `e${turn}`);
    }
    return JSON.stringify({ hp: f.state.player.hp, enemyHp: enemy.hp, log: f.state.log, rng: f.state.rng });
  };
  assert.equal(run(777), run(777));
  assert.notEqual(run(777), run(778));
});

ok('isCardBattleState 校验：合法通过，损坏拒绝', () => {
  const { state } = beginFixture();
  assert.equal(isCardBattleState(state), true);
  assert.equal(isCardBattleState(null), false);
  assert.equal(isCardBattleState({ ...state, cardVersion: 2 }), false);
  assert.equal(isCardBattleState({ ...state, hand: 'nope' }), false);
});

ok('临时降费与 COST_DOWN 生效', () => {
  const { state } = beginFixture({ deckDefIds: ['card_strike'] });
  const strike = handOf(state, 'card_strike')!;
  const def = cardDefById('card_strike')!;
  state.player.statuses.COST_DOWN = 1;
  assert.equal(effectiveCost(def, strike, state), 0);
  delete state.player.statuses.COST_DOWN;
  assert.equal(effectiveCost(def, strike, state), 1);
});

ok('状态引用守卫：wave/deckManifest 等字段齐全', () => {
  const { state } = beginFixture();
  assert.equal(state.cardVersion, 1);
  assert.equal(state.wave, 0);
  assert.equal(state.deckManifest['card_strike'], 2);
  assert.equal(state.deckManifest['card_block'], 3);
});

console.log(`card-engine tests passed (${passed})`);
