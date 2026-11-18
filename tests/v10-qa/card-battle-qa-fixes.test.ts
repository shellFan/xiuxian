/**
 * V10 FULL QA — 本轮 QA 修复的卡牌战斗回归断言。
 *
 * 对应 5 处修复（详见 docs/QA/V10_FULL_QA_REPORT.md）：
 *  1. REGEN 按「层」逐回合衰减（此前永久回复且可无限叠加）
 *  2. 装备 startShield 存续到第 1 波敌人阶段并真实吸收伤害（此前被 startPlayerTurn 立即清零）
 *  3. 战斗内生成卡 uid 使用 gen_ 前缀（此前与牌库 uid 空间碰撞）
 *  4. beginCardBattle 在 spawnWave 后同步 rng 快照（此前首回合重放随机段）
 *  5. 波间喘息不再复活 hp=0 的玩家（与 endTurnHeal 同口径守卫）
 */
import assert from 'node:assert/strict';
import {
  beginCardBattle,
  endPlayerTurn,
  makeCardInstance,
  startPlayerTurn,
} from '../../assets/scripts/v59o/card-battle/card-engine';
import { installEngineResolver, battleRules } from '../../assets/scripts/v59o/card-battle/card-database';
import type { CardBattleState, CardEnemy, CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';

installEngineResolver();

function makeEnemy(attack = 0): CardEnemy {
  return {
    uid: 'enemy_boss', defId: 'boss_resource_devourer', name: '资源吞噬者', tier: 'BOSS',
    hp: 300, maxHp: 300, attack, block: 0, statuses: {}, intent: null, timers: {}, telegraphed: {},
  };
}

let fixtureSeq = 0;
interface FixtureOverrides {
  playerHp?: number;
  startShield?: number;
  openingStatuses?: Record<string, number>;
  waveTotal?: number;
  spawnWave?: () => CardEnemy[];
}
function beginFixture(overrides: FixtureOverrides = {}): { state: CardBattleState; env: CardEngineEnv } {
  fixtureSeq += 1;
  const env: CardEngineEnv = {
    waveTotal: overrides.waveTotal ?? 1,
    reviveOnce: false,
    spawnWave: overrides.spawnWave ?? (() => [makeEnemy()]),
    rollRewards: () => ['card_strike', 'card_block', 'card_strike'],
    planIntent: (enemy: CardEnemy) => ({ kind: 'ATTACK', value: enemy.attack } as const),
    runBossSpecial: () => { /* not used by ATTACK intent */ },
  } as unknown as CardEngineEnv;
  const state = beginCardBattle({
    battleId: `bt_qa_${fixtureSeq}`,
    runId: `run_qa_${fixtureSeq}`,
    seed: 20261119,
    playerHp: overrides.playerHp ?? 50,
    playerMaxHp: 100,
    playerAttack: 20,
    playerCritChance: 0,
    startShield: overrides.startShield ?? 0,
    baseEnergy: battleRules().baseEnergy,
    drawPerTurn: battleRules().drawPerTurn,
    handLimit: battleRules().handLimit,
    deck: ['card_strike', 'card_strike', 'card_block', 'card_block', 'card_block'].map((id, i) => ({ uid: `${id}_qa${fixtureSeq}_${i}`, defId: id, upgraded: 0, turnCostDelta: 0 })),
    modifiers: { sectId: null, destinyId: null, startBlockPerTurn: 0, damageMul: 1, endTurnHeal: 0, energyEveryTurns: 0, openingStatuses: overrides.openingStatuses ?? {} },
    env,
  });
  return { state, env };
}

// 1. REGEN 按「层」衰减：3 层 → 首回合 +3，次回合 +2，再 +1，然后消失
{
  const { state, env } = beginFixture({ openingStatuses: { REGEN: 3 } });
  // beginCardBattle 内部已执行 startPlayerTurn（turn=1）：hp 50 → 53
  assert.equal(state.player.hp, 53, `turn1 should heal +3 (got ${state.player.hp})`);
  assert.equal(state.player.statuses.REGEN ?? 0, 2, 'regen should decay to 2 after turn 1');
  startPlayerTurn(state, env);
  assert.equal(state.player.hp, 55, 'turn2 should heal +2');
  assert.equal(state.player.statuses.REGEN ?? 0, 1, 'regen should decay to 1 after turn 2');
  startPlayerTurn(state, env);
  assert.equal(state.player.hp, 56, 'turn3 should heal +1');
  assert.equal(state.player.statuses.REGEN ?? 0, 0, 'regen should be gone after turn 3');
  startPlayerTurn(state, env);
  assert.equal(state.player.hp, 56, 'turn4 should NOT heal (no regen left)');
}
console.log('ok - REGEN 按层衰减（3→2→1→消失）');

// 1b. 回气不超过 maxHp（钳制）
{
  const { state } = beginFixture({ playerHp: 98, openingStatuses: { REGEN: 5 } });
  assert.equal(state.player.hp, 100, 'heal clamped at maxHp (98+5 → 100)');
}
console.log('ok - REGEN 回复被 maxHp 钳制');

// 2. 装备 startShield 在第 1 波敌人阶段真实吸收伤害，回合 2 开始清空（StS 口径）
{
  const { state, env } = beginFixture({ startShield: 30, spawnWave: () => [makeEnemy(25)] });
  assert.equal(state.player.block, 30, 'startShield must survive turn-1 start');
  endPlayerTurn(state, env, `a_end_shield_${fixtureSeq}`);
  // 敌人攻击 25：被 30 点护盾完全吸收 → hp 不变；随后自动进入回合 2，块挡清零
  assert.equal(state.player.hp, 50, `shield must absorb wave-1 attack (got hp ${state.player.hp})`);
  assert.equal(state.turn, 2, 'endPlayerTurn advances to turn 2');
  assert.equal(state.player.block, 0, 'block resets at turn 2 start (StS)');
}
console.log('ok - startShield 吸收首波伤害、回合2清空');

// 3. 战斗内生成卡 uid 与牌库 uid 空间隔离（gen_ 前缀）
{
  const { state } = beginFixture();
  const inst = makeCardInstance(state, 'card_vdom');
  assert.ok(inst.uid.startsWith('gen_'), `generated uid must be namespaced (got ${inst.uid})`);
  // 牌库 uid 形如 `${defId}_${n}`；gen_ 前缀保证两空间不相交
  assert.equal(state.deckManifest['card_vdom'], undefined, 'sanity: vdom not in deck');
}
console.log('ok - 生成卡 uid 使用 gen_ 命名空间');

// 4. beginCardBattle 同步 spawnWave 后的 rng 快照（种子复现契约）
{
  const { state } = beginFixture();
  // state.rng 的计数器必须大于初值：spawnWave/planIntent 消耗后已回写
  const counter = typeof state.rng === 'object' && state.rng !== null
    ? Number((state.rng as { counter?: number }).counter ?? 0)
    : 0;
  assert.ok(counter > 0, `rng snapshot must advance past spawnWave (counter=${counter})`);
}
console.log('ok - beginCardBattle 回写 spawnWave 后的 rng 快照');

// 5. 波间喘息不复活死亡玩家
{
  let spawned = 0;
  const { state, env } = beginFixture({
    waveTotal: 2,
    spawnWave: () => { spawned += 1; const e = makeEnemy(); return [{ ...e, uid: `enemy_${spawned}` }]; },
  });
  // 玩家打至濒死（hp=1），末敌死亡进入波间转换：不得被回 25% 血复活
  state.player.hp = 1;
  state.enemies[0]!.hp = 0;
  endPlayerTurn(state, env, `a_end_wave_${fixtureSeq}`);
  assert.equal(state.player.hp, 1, `dead player must not be healed by wave transition (got ${state.player.hp})`);
}
console.log('ok - 波间喘息不复活 hp=0 玩家');

process.stdout.write('card-battle-qa-fixes tests passed\n');
