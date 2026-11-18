/**
 * V10 ULTIMATE — 新 Boss 机制与真实引擎的集成断言。
 *
 * 验证两件纯函数单测覆盖不到的事：
 *  1. pendingEnergyLeech 在 startPlayerTurn 真实生效（能量被吞噬后低于基础值）；
 *  2. 出牌记录 lastPlayedCard*（MIRROR 的复制源真实存在）。
 */
import assert from 'node:assert/strict';
import {
  beginCardBattle,
  endPlayerTurn,
  playCard,
  startPlayerTurn,
} from '../../assets/scripts/v59o/card-battle/card-engine';
import { installEngineResolver, battleRules } from '../../assets/scripts/v59o/card-battle/card-database';
import type { CardBattleState, CardEnemy, CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';

installEngineResolver();

function makeEnemy(attack = 6): CardEnemy {
  return {
    uid: 'enemy_boss', defId: 'boss_resource_devourer', name: '资源吞噬者', tier: 'BOSS',
    hp: 300, maxHp: 300, attack, block: 0, statuses: {}, intent: null, timers: {}, telegraphed: {},
  };
}

function makeEnv(): CardEngineEnv {
  return {
    waveTotal: 1,
    reviveOnce: false,
    spawnWave: () => [makeEnemy()],
    rollRewards: () => ['card_strike', 'card_block', 'card_strike'],
    planIntent: (enemy: CardEnemy) => ({ kind: 'SPECIAL', mechanic: 'ENERGY_LEECH' } as const),
    runBossSpecial: (enemy: CardEnemy, _intent: unknown, state: CardBattleState) => {
      // 模拟 runBossSpecial 委托的资源吞噬：记录到 pendingEnergyLeech
      state.pendingEnergyLeech = (state.pendingEnergyLeech ?? 0) + 1;
      enemy.block += 10;
    },
  } as unknown as CardEngineEnv;
}

let fixtureSeq = 0;
function beginFixture(): { state: CardBattleState; env: CardEngineEnv } {
  fixtureSeq += 1;
  const state = beginCardBattle({
    battleId: `bt_ult_${fixtureSeq}`,
    runId: `run_ult_${fixtureSeq}`,
    seed: 20261118,
    playerHp: 120,
    playerMaxHp: 120,
    playerAttack: 20,
    playerCritChance: 0,
    startShield: 0,
    baseEnergy: battleRules().baseEnergy,
    drawPerTurn: battleRules().drawPerTurn,
    handLimit: battleRules().handLimit,
    deck: ['card_strike', 'card_strike', 'card_block', 'card_block', 'card_block'].map((id, i) => ({ uid: `${id}_u${fixtureSeq}_${i}`, defId: id, upgraded: 0, turnCostDelta: 0 })),
    modifiers: { sectId: null, destinyId: null, startBlockPerTurn: 0, damageMul: 1, endTurnHeal: 0, energyEveryTurns: 0, openingStatuses: {} },
    env: makeEnv(),
  });
  return { state, env: makeEnv() };
}

// 1. 出牌记录 lastPlayedCard*（MIRROR 复制源真实存在）
{
  const { state, env } = beginFixture();
  const strike = state.hand.find((c) => c.defId === 'card_strike')!;
  playCard(state, env, strike.uid, state.enemies[0]!.uid, `a_play_${fixtureSeq}`);
  assert.equal(state.lastPlayedCardDefId, 'card_strike', 'must record played defId');
  assert.ok(state.lastPlayedCardName && state.lastPlayedCardName.length > 0, 'must record card name');
  assert.ok(typeof state.lastPlayedDamageMul === 'number', 'must record damage mul');
}
console.log('ok - 出牌记录 lastPlayedCard*（MIRROR 复制源）');

// 2. pendingEnergyLeech 在下个玩家回合开始时真实扣能量（吞噬不是空操作）
{
  const { state, env } = beginFixture();
  const beforeEnergy = state.player.energy;
  // 结束回合 → 敌人回合触发 SPECIAL(ENERGY_LEECH) → 回到下个玩家回合
  endPlayerTurn(state, env, `a_end_${fixtureSeq}`);
  assert.equal(state.pendingEnergyLeech, 0, 'leech must be consumed at turn start');
  assert.equal(state.phase, 'PLAYER_TURN');
  assert.equal(state.turn, 2);
  assert.ok(state.player.energy < beforeEnergy, `energy after leech (${state.player.energy}) must be below base (${beforeEnergy})`);
  assert.ok(state.enemies[0]!.block > 0, 'boss gains shield from leech');
}
console.log('ok - pendingEnergyLeech 在回合开始真实结算（非空操作）');

// 3. 连续吞噬可叠加但单回合有下限保护（能量不会为负）
{
  const { state, env } = beginFixture();
  state.pendingEnergyLeech = 99; // 模拟极端叠加
  startPlayerTurn(state, env);
  assert.equal(state.player.energy, 0, 'energy clamps at 0, never negative');
  assert.equal(state.pendingEnergyLeech, 0, 'consumed');
}
console.log('ok - 极端吞噬下能量钳制为 0（不负数）');

console.log('v10-ultimate boss integration tests passed');
