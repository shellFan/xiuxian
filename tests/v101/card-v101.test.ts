/**
 * V10.1 卡牌深度测试：
 * 流派联动伤害（连击/格挡转攻/毒爆/破甲精准）、净化（CLEANSE）、需求费率上调、
 * Boss 独特战术（JUDGE 打断窗口/COST_CURSE/MORALE_DRAIN）、敌人行为类型、
 * 卡组净化（移除）与新 Boss 注册。
 */
import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { beginCardBattle, endPlayerTurn, playCard } from '../../assets/scripts/v59o/card-battle/card-engine';
import { installEngineResolver } from '../../assets/scripts/v59o/card-battle/card-database';
import { CardRng } from '../../assets/scripts/v59o/card-battle/card-rng';
import type { CardBattleState, CardEnemy, CardEngineEnv } from '../../assets/scripts/v59o/card-battle/card-types';
import { MONSTER_MAP, bossMechanicsFor } from '../../assets/scripts/v57/battle-merge';

installEngineResolver();

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

function make(hour = 10, seed = 0x5eed): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, hour));
  const context = new GameContext({ storage: new MemoryStorageAdapter(), player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null, battleRng: seededRng(seed) });
  context.gameDay.ensureStarted();
  return { clock, context };
}

/** 引擎级最小战斗（固定敌人/无专克乘数，便于精确断言）。 */
function miniBattle(deckDefIds: string[]): { state: CardBattleState; env: CardEngineEnv } {
  const makeEnemy = (): CardEnemy => ({
    uid: 'e1', defId: 'mon_dummy', name: '测试靶', tier: 'NORMAL',
    hp: 9999, maxHp: 9999, attack: 5, block: 0, statuses: {}, intent: null,
    timers: {}, telegraphed: {}, revived: 0,
  });
  const env: CardEngineEnv = {
    waveTotal: 1,
    spawnWave: () => [makeEnemy()],
    rollRewards: () => [],
    planIntent: () => ({ kind: 'ATTACK', damage: 3, hits: 1 }),
    runBossSpecial: () => undefined,
  };
  const deck = deckDefIds.map((id, i) => ({ uid: `${id}_${i}`, defId: id, upgraded: 0, turnCostDelta: 0 }));
  const state = beginCardBattle({
    battleId: 't', runId: 't', seed: 1,
    playerHp: 50, playerMaxHp: 50, playerAttack: 10, playerCritChance: 0,
    startShield: 0, baseEnergy: 5, drawPerTurn: 5, handLimit: 10,
    deck, modifiers: { sectId: null, destinyId: null, startBlockPerTurn: 0, damageMul: 1, endTurnHeal: 0, energyEveryTurns: 0, openingStatuses: {} },
    env,
  });
  return { state, env };
}

function play(state: CardBattleState, env: CardEngineEnv, uidPrefix: string, actionId: string): void {
  const card = state.hand.find((c) => c.uid.startsWith(uidPrefix));
  assert.ok(card, `手牌中应有 ${uidPrefix}`);
  const target = state.enemies.find((e) => e.hp > 0)?.uid ?? null;
  playCard(state, env, card!.uid, target, actionId);
}

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// ── 流派联动伤害 ──────────────────────────────────────────────────────────────

ok('连击联动：perCardPlayed 按本回合已出牌数加成', () => {
  const { state, env } = miniBattle(['card_strike', 'card_flurry']);
  const enemy = state.enemies[0]!;
  play(state, env, 'card_strike', 'a1');            // 打出第 1 张（计数 0 时结算）
  const afterStrike = enemy.hp;
  play(state, env, 'card_flurry', 'a2');            // 第 2 张：0.5 + 1×0.3 = 0.8 → floor(10×0.8)=8
  assert.equal(afterStrike - enemy.hp, 8, `连击加成伤害应为 8，实际 ${afterStrike - enemy.hp}`);
  assert.ok(state.log.some((l) => l.includes('连击')), '战斗日志应包含连击联动');
});

ok('格挡转攻：perSelfBlockPerTen 每 10 点格挡加成', () => {
  const { state, env } = miniBattle(['card_iron_wall', 'card_block_smash']);
  const enemy = state.enemies[0]!;
  play(state, env, 'card_iron_wall', 'a1');         // +15 格挡
  play(state, env, 'card_block_smash', 'a2');       // 0.9 + floor(15/10)×1.0 = 1.9 → 19
  assert.equal(9999 - enemy.hp, 19, `格挡转攻伤害应为 19，实际 ${9999 - enemy.hp}`);
});

ok('毒爆联动：perTargetStatus 按目标中毒层数加成', () => {
  const { state, env } = miniBattle(['card_poison_dart', 'card_poison_bloom']);
  const enemy = state.enemies[0]!;
  play(state, env, 'card_poison_dart', 'a1');       // 40% = 4 伤害 + 中毒 3
  assert.equal(enemy.statuses.POISON, 3, '毒镖应施加 3 层中毒');
  play(state, env, 'card_poison_bloom', 'a2');      // 0.6 + 3×0.5 = 2.1 → 21
  assert.equal(9999 - enemy.hp, 4 + 21, `毒爆总伤害应为 25，实际 ${9999 - enemy.hp}`);
});

ok('破甲精准：perTargetStatus(VULNERABLE) 按易伤层数加成', () => {
  const { state, env } = miniBattle(['card_weak_point', 'card_root_cause']);
  const enemy = state.enemies[0]!;
  play(state, env, 'card_weak_point', 'a1');        // 易伤 3 + 40% 伤害（先上易伤，自身伤害也享受 ×1.5）= 6
  play(state, env, 'card_root_cause', 'a2');        // 1.2 + 3×0.4 = 2.4 → 24；易伤再 ×1.5 → 36
  assert.equal(9999 - enemy.hp, 6 + 36, `破甲精准总伤害应为 42，实际 ${9999 - enemy.hp}`);
});

ok('净化：CLEANSE 清除虚弱/失明/中毒并给格挡', () => {
  const { state, env } = miniBattle(['card_disaster_dr']);
  state.player.statuses.WEAK = 2;
  state.player.statuses.BLIND = 1;
  state.player.statuses.POISON = 3;
  play(state, env, 'card_disaster_dr', 'a1');
  assert.equal(state.player.statuses.WEAK, undefined, '虚弱应被清除');
  assert.equal(state.player.statuses.BLIND, undefined, '失明应被清除');
  assert.equal(state.player.statuses.POISON, undefined, '中毒应被清除');
  assert.equal(state.player.block, 8, '容灾演练应给 8 点格挡');
});

ok('需求费率上调：pendingHandCostDelta 在下一手手牌生效后清零', () => {
  const { state, env } = miniBattle(['card_strike', 'card_block', 'card_shield']);
  state.pendingHandCostDelta = 1;
  endPlayerTurn(state, env, 'a_end1'); // 结算当前手牌 → 敌人行动 → 新回合发新牌
  assert.ok(state.hand.length > 0, '新回合应有手牌');
  assert.ok(state.hand.every((c) => c.turnCostDelta === 1), `本手手牌费用应 +1，实际 ${state.hand.map((c) => c.turnCostDelta).join(',')}`);
  assert.equal(state.pendingHandCostDelta, 0, '费率诅咒应消费后清零');
  // 下一手不再上调（settleHandAtTurnEnd 清除临时费用）。
  endPlayerTurn(state, env, 'a_end2');
  assert.ok(state.hand.every((c) => c.turnCostDelta === 0), '费率诅咒只持续一手');
});

// ── Boss 独特战术（服务层 env） ────────────────────────────────────────────────

function bossEnv(context: GameContext): CardEngineEnv {
  const run = context.battle.current()!;
  return (context.battle as unknown as { cards: { envFor: (r: unknown) => CardEngineEnv } }).cards.envFor(run);
}

function fakeBoss(defId: string, hp: number, maxHp: number): CardEnemy {
  return {
    uid: `${defId}_x`, defId, name: MONSTER_MAP.get(defId)?.name ?? defId, tier: 'BOSS',
    hp, maxHp, attack: 10, block: 0, statuses: {}, intent: null,
    timers: {}, telegraphed: {}, revived: 0,
  };
}

ok('KPI 暴君 JUDGE：窗口期内足量伤害 → 打断（不命中玩家）', () => {
  const { context } = make(10, 0x1234);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  const boss = fakeBoss('boss_kpi_tyrant', 500, 1000);
  boss.timers.judgeRefHp = 600; // 窗口期内已造成 100 伤害（阈值 10% = 100）
  boss.timers.judgeNeed = 100;
  card.enemies = [boss];
  const env = bossEnv(context);
  let struck = 0;
  const lines: string[] = [];
  env.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'JUDGE' }, card, new CardRng(3), (l) => lines.push(l), { strikePlayer: () => { struck += 1; } });
  assert.ok(lines.some((l) => l.includes('打断成功')), '足量伤害应打断审判');
  assert.equal(struck, 0, '打断后不应命中玩家');
  assert.ok((boss.statuses.WEAK ?? 0) >= 2, '打断后 Boss 应陷入虚弱');
  assert.equal(boss.timers.judgeRefHp, undefined, '窗口基准应清除');
});

ok('KPI 暴君 JUDGE：窗口期伤害不足 → 绩效审判命中玩家', () => {
  const { context } = make(10, 0x1235);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  const boss = fakeBoss('boss_kpi_tyrant', 980, 1000);
  boss.timers.judgeRefHp = 980; // 未造成伤害
  boss.timers.judgeNeed = 100;
  card.enemies = [boss];
  const env = bossEnv(context);
  let struckRaw = 0;
  env.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'JUDGE' }, card, new CardRng(3), () => undefined, { strikePlayer: (raw) => { struckRaw = raw; } });
  assert.ok(struckRaw >= 25, `审判未打断应以 2.5 倍重击命中玩家，实际 ${struckRaw}`);
});

ok('需求幻魔 COST_CURSE：写入 pendingHandCostDelta', () => {
  const { context } = make(10, 0x1236);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  const boss = fakeBoss('boss_req_phantom', 760, 760);
  card.enemies = [boss];
  const env = bossEnv(context);
  const lines: string[] = [];
  env.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'COST_CURSE' }, card, new CardRng(3), (l) => lines.push(l), { strikePlayer: () => undefined });
  assert.equal(card.pendingHandCostDelta ?? 0, 1, '费率诅咒应写入待生效手牌费率');
  assert.ok(lines.some((l) => l.includes('费率')));
});

ok('加班魔王 MORALE_DRAIN：玩家虚弱 + Boss 自愈', () => {
  const { context } = make(10, 0x1237);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  const boss = fakeBoss('boss_overtime_demon', 100, 820);
  card.enemies = [boss];
  const env = bossEnv(context);
  env.runBossSpecial(boss, { kind: 'SPECIAL', mechanic: 'MORALE_DRAIN' }, card, new CardRng(3), () => undefined, { strikePlayer: () => undefined });
  assert.ok((card.player.statuses.WEAK ?? 0) >= 1, '玩家应获得虚弱');
  assert.ok(boss.hp > 100, `魔王应自愈，实际 hp=${boss.hp}`);
});

// ── 敌人行为类型 ───────────────────────────────────────────────────────────────

function behaviorEnemy(defId: string, tier: 'NORMAL' | 'ELITE' | 'BOSS' = 'NORMAL'): CardEnemy {
  return {
    uid: `${defId}_b`, defId, name: MONSTER_MAP.get(defId)?.name ?? defId, tier,
    hp: 100, maxHp: 100, attack: 6, block: 0, statuses: {}, intent: null,
    timers: {}, telegraphed: {}, revived: 0,
  };
}

ok('强攻型敌人：第 3 回合连击两段（意图可见）', () => {
  const { context } = make(10, 0x1238);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  card.turn = 2;
  const env = bossEnv(context);
  const intent = env.planIntent(behaviorEnemy('mon_502'), card, new CardRng(3));
  assert.equal(intent.kind, 'ATTACK');
  assert.equal((intent as { hits: number }).hits, 2, '强攻型第 3 回合应连击 2 段');
});

ok('防御型敌人：高频格挡意图', () => {
  const { context } = make(10, 0x1239);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  card.turn = 2; // 偶数回合 → BLOCK
  const env = bossEnv(context);
  const intent = env.planIntent(behaviorEnemy('mon_slow_sql'), card, new CardRng(3));
  assert.equal(intent.kind, 'BLOCK', `防御型偶数回合应格挡，实际 ${intent.kind}`);
});

ok('消耗型敌人：施加中毒意图', () => {
  const { context } = make(10, 0x123a);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  card.turn = 3; // turn%3===0 → POISON
  const env = bossEnv(context);
  const intent = env.planIntent(behaviorEnemy('mon_cache_penetrate'), card, new CardRng(3));
  assert.equal(intent.kind, 'DEBUFF', `消耗型应施加负面状态，实际 ${intent.kind}`);
});

ok('增益型精英：交替强化自身', () => {
  const { context } = make(10, 0x123b);
  context.battle.start('PROJECT', 'build_java');
  const card = context.battle.battleCardView()!;
  card.turn = 2;
  const env = bossEnv(context);
  const intent = env.planIntent(behaviorEnemy('mon_elite_race', 'ELITE'), card, new CardRng(3));
  assert.equal(intent.kind, 'BUFF', `增益型精英应强化，实际 ${intent.kind}`);
});

// ── 卡组净化（移除） ───────────────────────────────────────────────────────────

ok('净化：移除基础牌扣灵石并反映到牌组清单', () => {
  const { context } = make(10, 0x123c);
  context.player.spiritStones = 500;
  const before = context.battle.cardDeckView().manifest.card_strike!;
  const view = context.battle.removeCollectionCard('card_strike');
  assert.equal(view.removals.card_strike, 1);
  assert.equal(context.battle.cardDeckView().manifest.card_strike, before - 1, '牌组应少一张打磨提交');
  assert.equal(context.player.spiritStones, 500 - 50, '首张净化应花费 50 灵石');
  assert.equal(view.nextCost, 75, '下一张净化费用应递增到 75');
});

ok('净化：基础牌保底 2 张不可再移除', () => {
  const { context } = make(10, 0x123d);
  context.player.spiritStones = 10000;
  // 打磨提交 5 张，可移除 3 张（保底 2）。
  context.battle.removeCollectionCard('card_strike');
  context.battle.removeCollectionCard('card_strike');
  context.battle.removeCollectionCard('card_strike');
  const view = context.battle.cardRemovalView();
  assert.equal(view.removable.card_strike, 0, '打磨提交应到达保底下限');
  assert.throws(() => context.battle.removeCollectionCard('card_strike'), /不可移除/, '超下限应拒绝');
});

ok('净化：收藏卡移除后从收藏扣除', () => {
  const { context } = make(10, 0x123e);
  context.player.spiritStones = 500;
  context.player.cardCollection = { card_heavy: 2 };
  context.battle.removeCollectionCard('card_heavy');
  assert.equal(context.player.cardCollection.card_heavy, 1, '收藏应扣一张');
  assert.equal(context.battle.cardRemovalView().removable.card_heavy, 1, '剩余一张仍可移除');
});

// ── 新 Boss 与新卡注册 ─────────────────────────────────────────────────────────

ok('V10.1 五大新 Boss 已注册且带专属机制', () => {
  for (const id of ['boss_kpi_tyrant', 'boss_overtime_demon', 'boss_bug_behemoth', 'boss_req_phantom', 'boss_version_calamity']) {
    assert.ok(MONSTER_MAP.has(id), `Boss ${id} 应在怪物表中`);
    const mech = bossMechanicsFor(id);
    assert.ok(mech, `Boss ${id} 应有机制定义`);
    assert.ok(mech!.mechanics.length >= 2, `Boss ${id} 应至少两种机制`);
  }
  assert.ok(bossMechanicsFor('boss_kpi_tyrant')!.mechanics.some((m) => m.kind === 'JUDGE'));
  assert.ok(bossMechanicsFor('boss_req_phantom')!.mechanics.some((m) => m.kind === 'COST_CURSE'));
  assert.ok(bossMechanicsFor('boss_overtime_demon')!.mechanics.some((m) => m.kind === 'MORALE_DRAIN'));
  assert.ok(bossMechanicsFor('boss_bug_behemoth')!.mechanics.some((m) => m.kind === 'SUMMON'));
  assert.ok(bossMechanicsFor('boss_version_calamity')!.phase2, '版本灾厄应有 Phase 2');
});

ok('V10.1 流派新卡可进入奖励池（数据驱动校验通过）', () => {
  const { cardDefById, rewardPool } = require('../../assets/scripts/v59o/card-battle/card-database') as typeof import('../../assets/scripts/v59o/card-battle/card-database');
  for (const id of ['card_block_smash', 'card_poison_bloom', 'card_flurry', 'card_finale', 'card_fortress', 'card_plague', 'card_gc_full', 'card_thread_pool', 'card_gc_tuning', 'card_component', 'card_keyframe', 'card_weak_point', 'card_root_cause', 'card_disaster_dr', 'card_gate']) {
    const def = cardDefById(id);
    assert.ok(def, `新卡 ${id} 应已注册`);
    assert.equal(def!.upgradeTo !== undefined, true, `新卡 ${id} 应有升级链`);
  }
  const pool = rewardPool('JAVA_BACKEND', null);
  assert.ok(pool.some((d) => d.id === 'card_finale'), '中立 EPIC 应在全职业奖励池');
  assert.ok(pool.some((d) => d.id === 'card_gc_tuning'), 'Java EPIC 应在 Java 奖励池');
  const fePool = rewardPool('FRONTEND', null);
  assert.ok(!fePool.some((d) => d.id === 'card_gc_tuning'), 'Java 专属卡不应出现在前端池');
});

console.log(`\nV10.1 card depth tests passed (${passed})`);
