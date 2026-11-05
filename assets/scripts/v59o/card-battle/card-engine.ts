/**
 * V5.9-O.2 回合制卡牌战斗引擎（纯状态机）。
 *
 * 规则基线（§9~§20）：
 * - 开局抽 5 张；每回合基础能量 3 点；回合开始抽 5 张；手牌上限 10。
 * - 玩家回合可出牌（攻击/防御/技能），点击结束回合后敌人执行行动。
 * - 抽牌堆耗尽时弃牌堆洗回；消耗牌进入消耗堆；状态牌回合结束自燃；诅咒牌滞留手牌。
 * - 敌人意图在玩家回合开始前可见；敌人按序执行攻击/防御/强化/削弱/召唤/特殊机制。
 * - 玩家格挡在玩家回合开始时清空；敌人格挡在敌人回合开始（行动前）清空。
 * - 胜利后进入奖励选择（3 选 1 或放弃），失败进入失败结算。
 *
 * 引擎不导入任何服务/配置模块：世界数据（怪物表、卡池、Boss 机制）通过
 * CardEngineEnv 注入；随机数只经由 CardRng（可保存恢复）。所有校验在引擎内，
 * 失败整体拒绝（不扣能量、不动状态），UI 无权绕过。
 */
import {
  CardBattleError,
  type CardBattleState,
  type CardDef,
  type CardEffect,
  type CardEngineEnv,
  type CardEnemy,
  type CardInstance,
  type CardPhase,
  type CardStatuses,
  type ConditionDef,
  type StatusId,
} from './card-types';
import { CardRng } from './card-rng';

export const HAND_LIMIT_DEFAULT = 10;
export const DRAW_PER_TURN_DEFAULT = 5;
export const BASE_ENERGY_DEFAULT = 3;

/** 存档恢复校验：结构不合法的卡牌状态绝不复活为假战斗（与旧 isBattleRunState 同原则）。 */
export function isCardBattleState(value: unknown): value is CardBattleState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  const player = s.player as Record<string, unknown> | undefined;
  const rng = s.rng as Record<string, unknown> | undefined;
  return s.cardVersion === 1
    && typeof s.battleId === 'string' && s.battleId.length > 0
    && typeof s.runId === 'string' && s.runId.length > 0
    && typeof s.phase === 'string'
    && typeof s.turn === 'number' && Number.isSafeInteger(s.turn)
    && typeof s.wave === 'number' && Number.isSafeInteger(s.wave)
    && typeof s.baseEnergy === 'number' && typeof s.drawPerTurn === 'number' && typeof s.handLimit === 'number'
    && Array.isArray(s.hand) && Array.isArray(s.drawPile) && Array.isArray(s.discardPile) && Array.isArray(s.exhaustPile)
    && Array.isArray(s.enemies) && Array.isArray(s.log)
    && !!player && typeof player.hp === 'number' && typeof player.maxHp === 'number' && typeof player.critChance === 'number'
    && !!rng && typeof rng.seed === 'number' && typeof rng.counter === 'number';
}

// ── 开局 ─────────────────────────────────────────────────────────────────────

/**
 * 构建初始状态并抽起手 5 张。牌堆由服务层组装（基础卡组 + 收藏 + 命格/宗门），
 * 引擎负责洗牌、发牌与阶段推进。玩家属性为服务层聚合快照。
 */
export function beginCardBattle(params: {
  battleId: string;
  runId: string;
  seed: number;
  playerHp: number;
  playerMaxHp: number;
  playerAttack: number;
  playerCritChance: number;
  startShield: number;
  baseEnergy: number;
  drawPerTurn: number;
  handLimit: number;
  deck: CardInstance[];
  modifiers: CardBattleState['modifiers'];
  env: CardEngineEnv;
}): CardBattleState {
  const rng = new CardRng(params.seed);
  const state: CardBattleState = {
    cardVersion: 1,
    battleId: params.battleId,
    runId: params.runId,
    phase: 'BATTLE_START',
    turn: 0,
    wave: 0,
    player: {
      hp: Math.max(1, params.playerHp),
      maxHp: Math.max(1, params.playerMaxHp),
      block: 0,
      energy: 0,
      statuses: {},
      attack: Math.max(1, params.playerAttack),
      critChance: Math.min(0.8, Math.max(0, params.playerCritChance)),
    },
    enemies: [],
    hand: [],
    drawPile: rng.shuffle([...params.deck]),
    discardPile: [],
    exhaustPile: [],
    baseEnergy: params.baseEnergy,
    drawPerTurn: params.drawPerTurn,
    handLimit: params.handLimit,
    reshuffles: 0,
    rng: rng.toState(),
    deckManifest: manifestOf(params.deck),
    reward: null,
    lastActionId: null,
    uidCounter: 0,
    log: ['战斗开始。'],
    modifiers: params.modifiers,
  };
  for (const [status, stacks] of Object.entries(params.modifiers.openingStatuses ?? {})) {
    if ((stacks ?? 0) > 0) state.player.statuses[status as StatusId] = stacks!;
  }
  // 开局护盾（装备 shieldBonus 沿用旧口径）。
  if (params.startShield > 0) {
    state.player.block = params.startShield;
    state.log.push(`装备结界提供 ${params.startShield} 格挡。`);
  }
  // 第一波敌人。
  state.enemies = params.env.spawnWave(0, rng, state);
  if (state.enemies.length === 0) throw new Error('卡牌战斗至少需要一名敌人');
  state.log.push(`第 1/${params.env.waveTotal} 波：${state.enemies.map((e) => e.name).join('、')}`);
  startPlayerTurn(state, params.env);
  return state;
}

function manifestOf(deck: CardInstance[]): Record<string, number> {
  const manifest: Record<string, number> = {};
  for (const card of deck) manifest[card.defId] = (manifest[card.defId] ?? 0) + 1;
  return manifest;
}

/** 卡牌实例发号（uid 全局唯一，跨存档恢复稳定）。 */
export function makeCardInstance(state: CardBattleState, defId: string, upgraded = 0): CardInstance {
  state.uidCounter += 1;
  return { uid: `${defId}_${state.uidCounter}`, defId, upgraded, turnCostDelta: 0 };
}

// ── 回合流转 ─────────────────────────────────────────────────────────────────

/** 玩家回合开始：回合数+1、格挡清空、能量恢复、抽牌、规划敌人意图、REGEN。 */
export function startPlayerTurn(state: CardBattleState, env: CardEngineEnv): void {
  assertContinuable(state);
  state.phase = 'PLAYER_TURN_START';
  state.turn += 1;
  // 玩家格挡在玩家回合开始时清空（StS 口径）。
  state.player.block = 0;
  // 敌人意图（玩家行动前必须可见，§21）。
  const rng = CardRng.fromState(state.rng);
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) { enemy.intent = null; continue; }
    enemy.intent = env.planIntent(enemy, state, rng);
  }
  state.rng = rng.toState();
  // REGEN。
  const regen = state.player.statuses.REGEN ?? 0;
  if (regen > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + regen);
    state.log.push(`回气：+${regen} 生命。`);
  }
  // 能量恢复（基础 + 周期奖励）。
  let energy = state.baseEnergy;
  if (state.modifiers.energyEveryTurns > 0 && state.turn % state.modifiers.energyEveryTurns === 0) {
    energy += 1;
    state.log.push('【宗门加持】回合能量 +1。');
  }
  state.player.energy = energy;
  // 回合开始格挡加成（宗门/命格小加成）。
  if (state.modifiers.startBlockPerTurn > 0) {
    state.player.block += state.modifiers.startBlockPerTurn;
  }
  drawCards(state, state.drawPerTurn);
  state.phase = 'PLAYER_TURN';
}

/**
 * 玩家打出一张手牌。失败抛 CardBattleError，状态整体不变（无半次出牌）。
 * 重复 actionId 幂等忽略（双击/重复回调不会二次结算）。
 */
export function playCard(state: CardBattleState, env: CardEngineEnv, cardUid: string, targetUid: string | null, actionId: string): void {
  if (state.phase === 'FINISHED' || state.phase === 'VICTORY_SETTLED' || state.phase === 'DEFEAT_SETTLED') {
    throw new CardBattleError('BATTLE_FINISHED', '战斗已结束');
  }
  if (state.phase !== 'PLAYER_TURN') throw new CardBattleError('NOT_IN_PLAYER_TURN', '当前不是玩家出牌阶段');
  if (state.lastActionId === actionId) return; // 幂等：重复回调
  const handIndex = state.hand.findIndex((c) => c.uid === cardUid);
  if (handIndex < 0) throw new CardBattleError('CARD_NOT_IN_HAND', '该卡牌不在手牌中');
  const instance = state.hand[handIndex]!;
  const def = resolveCardDef(instance);
  if (def.unplayable) throw new CardBattleError('CARD_UNPLAYABLE', `${def.name} 无法主动打出`);
  const cost = effectiveCost(def, instance, state);
  if (state.player.energy < cost) {
    throw new CardBattleError('INSUFFICIENT_ENERGY', `能量不足（需要 ${cost}，当前 ${state.player.energy}）`);
  }
  let target: CardEnemy | null = null;
  if (def.target === 'ENEMY') {
    if (!targetUid) throw new CardBattleError('TARGET_REQUIRED', '需要选择目标');
    target = state.enemies.find((e) => e.uid === targetUid && e.hp > 0) ?? null;
    if (!target) throw new CardBattleError('TARGET_INVALID', '目标不存在或已被击败');
  }
  // ── 锁定动作：先扣能量，再执行效果（效果执行不抛错，见 applyEffect 防御式实现） ──
  state.player.energy -= cost;
  state.lastActionId = actionId;
  state.log.push(`打出【${def.name}${instance.upgraded > 0 ? `+${instance.upgraded}` : ''}】${cost > 0 ? `（-${cost} 能量）` : ''}`);
  const rng = CardRng.fromState(state.rng);
  for (const effect of def.effects) applyEffect(state, env, effect, target, rng, instance);
  state.rng = rng.toState();
  // ── 移动卡牌：消耗 / 弃牌堆 ──
  state.hand.splice(handIndex, 1);
  if (def.exhaust) {
    state.exhaustPile.push(instance);
    state.log.push(`【${def.name}】已消耗。`);
  } else {
    state.discardPile.push(instance);
  }
  checkBattleEnd(state, env);
}

/** 结束玩家回合 → 敌人回合 → 回合结算 → 下一玩家回合（同步一次完成，原子可存档）。 */
export function endPlayerTurn(state: CardBattleState, env: CardEngineEnv, actionId: string): void {
  if (state.phase !== 'PLAYER_TURN') {
    if (state.phase === 'ENEMY_TURN') throw new CardBattleError('PHASE_INVALID', '敌人正在行动');
    throw new CardBattleError('PHASE_INVALID', '当前不能结束回合');
  }
  if (state.lastActionId === actionId) return; // 幂等：重复点击
  state.lastActionId = actionId;
  // 玩家回合收尾：COST_DOWN 清除；手牌处置（保留/状态牌自燃/弃置）。
  delete state.player.statuses.COST_DOWN;
  settleHandAtTurnEnd(state);
  runEnemyTurn(state, env);
  if (currentPhase(state) === 'FINISHED') return;
  turnSettlement(state, env);
  const afterSettlement = currentPhase(state);
  if (afterSettlement === 'REWARD_SELECTION' || afterSettlement === 'FINISHED') return;
  startPlayerTurn(state, env);
}

/** 经函数读取阶段（规避 TS 控制流对可变字段的过窄收窄）。 */
function currentPhase(state: CardBattleState): CardPhase {
  return state.phase;
}

/** 敌人回合：敌人按序执行意图。玩家格挡保留（吸收伤害），于下个玩家回合开始时清空。 */
function runEnemyTurn(state: CardBattleState, env: CardEngineEnv): void {
  state.phase = 'ENEMY_TURN';
  const rng = CardRng.fromState(state.rng);
  for (const enemy of [...state.enemies]) {
    if (enemy.hp <= 0) continue;
    if (state.player.hp <= 0) break;
    enemy.block = 0; // 敌人格挡在自己的回合开始（行动前）清空
    executeEnemyIntent(state, env, enemy, rng);
  }
  state.rng = rng.toState();
}

/** 单个敌人意图执行。 */
function executeEnemyIntent(state: CardBattleState, env: CardEngineEnv, enemy: CardEnemy, rng: CardRng): void {
  const intent = enemy.intent;
  if (!intent) return;
  enemy.intent = null;
  switch (intent.kind) {
    case 'ATTACK': {
      for (let hit = 0; hit < Math.max(1, intent.hits); hit += 1) {
        if (state.player.hp <= 0) return;
        dealDamageToPlayer(state, enemy, intent.damage, enemy.name);
      }
      return;
    }
    case 'ATTACK_DEBUFF': {
      dealDamageToPlayer(state, enemy, intent.damage, enemy.name);
      if (state.player.hp > 0) {
        addStatus(state.player.statuses, intent.status, intent.stacks);
        state.log.push(`${enemy.name} 使你陷入【${statusName(intent.status)}×${intent.stacks}】。`);
      }
      return;
    }
    case 'BLOCK': {
      enemy.block += intent.amount;
      state.log.push(`${enemy.name} 结成防御（格挡 +${intent.amount}）。`);
      return;
    }
    case 'BUFF': {
      addStatus(enemy.statuses, intent.status, intent.stacks);
      state.log.push(`${enemy.name} 获得【${statusName(intent.status)}×${intent.stacks}】。`);
      return;
    }
    case 'DEBUFF': {
      addStatus(state.player.statuses, intent.status, intent.stacks);
      state.log.push(`${enemy.name} 使你陷入【${statusName(intent.status)}×${intent.stacks}】。`);
      return;
    }
    case 'SUMMON':
    case 'SPECIAL': {
      // Boss 机制（召唤/封技/蓄力/吞噬/狂暴预警等）由服务层回合化实现。
      env.runBossSpecial(enemy, intent, state, rng, (line) => state.log.push(line));
      return;
    }
    case 'SLEEP': {
      state.log.push(`${enemy.name} 正在蓄力……`);
      return;
    }
    default:
      return;
  }
}

/** 回合结算：POISON、状态层数衰减、回合结束回复。 */
function turnSettlement(state: CardBattleState, env: CardEngineEnv): void {
  state.phase = 'TURN_SETTLEMENT';
  const rng = CardRng.fromState(state.rng);
  const playerPoison = state.player.statuses.POISON ?? 0;
  if (playerPoison > 0) {
    state.player.hp = Math.max(0, state.player.hp - playerPoison);
    state.player.statuses.POISON = playerPoison - 1;
    if ((state.player.statuses.POISON ?? 0) <= 0) delete state.player.statuses.POISON;
    state.log.push(`中毒：-${playerPoison} 生命。`);
  }
  decayStatus(state.player.statuses, ['WEAK', 'VULNERABLE', 'BLIND']);
  const heal = state.modifiers.endTurnHeal;
  if (heal > 0 && state.player.hp > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
  }
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const poison = enemy.statuses.POISON ?? 0;
    if (poison > 0) {
      enemy.hp = Math.max(0, enemy.hp - poison);
      enemy.statuses.POISON = poison - 1;
      if ((enemy.statuses.POISON ?? 0) <= 0) delete enemy.statuses.POISON;
      state.log.push(`${enemy.name} 中毒：-${poison}`);
      if (enemy.hp <= 0) onEnemyDefeated(state, env, enemy, rng);
      if (currentPhase(state) === 'REWARD_SELECTION') break;
    }
    decayStatus(enemy.statuses, ['WEAK', 'VULNERABLE', 'BLIND']);
  }
  state.rng = rng.toState();
  checkBattleEnd(state, env);
}

function decayStatus(statuses: CardStatuses, ids: readonly StatusId[]): void {
  for (const id of ids) {
    const stacks = statuses[id] ?? 0;
    if (stacks > 0) {
      statuses[id] = stacks - 1;
      if ((statuses[id] ?? 0) <= 0) delete statuses[id];
    }
  }
}

/** 回合结束手牌处置：保留牌留手；状态牌自燃；其余弃置。临时降费清除。 */
function settleHandAtTurnEnd(state: CardBattleState): void {
  const kept: CardInstance[] = [];
  for (const card of state.hand) {
    const def = resolveCardDef(card);
    const cleared: CardInstance = { ...card, turnCostDelta: 0 };
    if (def.retain) {
      kept.push(cleared);
    } else if (def.unplayable && def.exhaust) {
      state.exhaustPile.push(cleared);
      state.log.push(`状态牌【${def.name}】消散了。`);
    } else {
      state.discardPile.push(cleared);
    }
  }
  state.hand = kept;
}

// ── 效果引擎 ─────────────────────────────────────────────────────────────────

/** 卡牌定义解析器（服务层初始化时注入；引擎文件不依赖数据库模块）。 */
let CARD_DEF_RESOLVER: (instance: CardInstance) => CardDef = () => {
  throw new Error('CARD_DEF_RESOLVER 未初始化（card-database.installResolver）');
};
export function installCardDefResolver(resolver: (instance: CardInstance) => CardDef): void {
  CARD_DEF_RESOLVER = resolver;
}

function resolveCardDef(instance: CardInstance): CardDef {
  return CARD_DEF_RESOLVER(instance);
}

/** 实际费用 = max(0, def.cost + 临时降费 + COST_DOWN)。 */
export function effectiveCost(def: CardDef, instance: CardInstance, state: CardBattleState): number {
  const costDown = state.player.statuses.COST_DOWN ?? 0;
  return Math.max(0, def.cost + instance.turnCostDelta - costDown);
}

export function upgradeId(defId: string, level: number): string {
  return level <= 0 ? defId : `${defId}_up${level}`;
}

function applyEffect(
  state: CardBattleState,
  env: CardEngineEnv,
  effect: CardEffect,
  target: CardEnemy | null,
  rng: CardRng,
  _instance: CardInstance,
): void {
  switch (effect.kind) {
    case 'DAMAGE': {
      const targets = effect.aoe === true ? state.enemies.filter((e) => e.hp > 0) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        dealDamageToEnemy(state, env, enemy, effect.mul ?? 1, effect.flat ?? 0, effect.pierce === true, rng);
      }
      return;
    }
    case 'BLOCK': {
      const amount = Math.max(0, effect.flat);
      state.player.block += amount;
      state.log.push(`获得 ${amount} 格挡。`);
      return;
    }
    case 'HEAL': {
      const amount = Math.max(0, effect.flat);
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
      state.log.push(`回复 ${amount} 生命。`);
      return;
    }
    case 'DRAW': {
      drawCards(state, Math.max(0, effect.count));
      return;
    }
    case 'ENERGY': {
      state.player.energy = Math.max(0, state.player.energy + effect.delta);
      state.log.push(`能量 ${effect.delta >= 0 ? '+' : ''}${effect.delta}。`);
      return;
    }
    case 'APPLY_STATUS': {
      const stacks = Math.max(0, effect.stacks);
      if (stacks === 0) return;
      if (effect.target === 'SELF') {
        addStatus(state.player.statuses, effect.status, stacks);
        state.log.push(`你获得【${statusName(effect.status)}×${stacks}】。`);
      } else {
        const victims = effect.target === 'ALL_ENEMIES' ? state.enemies.filter((e) => e.hp > 0) : target && target.hp > 0 ? [target] : [];
        for (const victim of victims) {
          addStatus(victim.statuses, effect.status, stacks);
          state.log.push(`${victim.name} 陷入【${statusName(effect.status)}×${stacks}】。`);
        }
      }
      return;
    }
    case 'REMOVE_STATUS': {
      delete state.player.statuses[effect.status];
      state.log.push(`清除了【${statusName(effect.status)}】。`);
      return;
    }
    case 'DISCARD_HAND': {
      const toDiscard = state.hand.filter((c) => !resolveCardDef(c).retain);
      state.hand = state.hand.filter((c) => resolveCardDef(c).retain);
      state.discardPile.push(...toDiscard);
      state.log.push(`弃置了 ${toDiscard.length} 张手牌。`);
      return;
    }
    case 'ADD_CARD_TO_HAND': {
      for (let i = 0; i < Math.max(0, effect.copies); i += 1) {
        const temp = makeCardInstance(state, effect.cardId);
        if (state.hand.length < state.handLimit) {
          state.hand.push(temp);
          state.log.push(`生成临时牌【${resolveCardDef(temp).name}】。`);
        } else {
          state.discardPile.push(temp);
          state.log.push('手牌已满，临时牌进入弃牌堆。');
        }
      }
      return;
    }
    case 'CONDITIONAL': {
      const branch = evaluateCondition(state, target, effect.if) ? effect.then : (effect.otherwise ?? []);
      for (const sub of branch) applyEffect(state, env, sub, target, rng, _instance);
      return;
    }
    default:
      return;
  }
}

function evaluateCondition(state: CardBattleState, target: CardEnemy | null, condition: ConditionDef): boolean {
  switch (condition.kind) {
    case 'ENEMY_HP_BELOW_PCT':
      return !!target && target.maxHp > 0 && target.hp / target.maxHp < condition.pct;
    case 'PLAYER_HP_BELOW_PCT':
      return state.player.maxHp > 0 && state.player.hp / state.player.maxHp < condition.pct;
    case 'ENEMY_COUNT_AT_LEAST':
      return state.enemies.filter((e) => e.hp > 0).length >= condition.count;
    case 'PLAYER_BLOCK_AT_LEAST':
      return state.player.block >= condition.block;
    default:
      return false;
  }
}

/** 对敌人结算一次伤害：力量/暴击/虚弱/易伤/闪避/格挡全链路。 */
function dealDamageToEnemy(state: CardBattleState, env: CardEngineEnv, enemy: CardEnemy, mul: number, flat: number, pierce: boolean, rng: CardRng): void {
  if (enemy.hp <= 0) return;
  // BLIND：50% 落空。
  if ((state.player.statuses.BLIND ?? 0) > 0 && rng.chance(0.5)) {
    state.log.push('眼前发花，这一击落空了……');
    return;
  }
  // 敌人 DODGE：完全闪避一次。
  if ((enemy.statuses.DODGE ?? 0) > 0) {
    enemy.statuses.DODGE = (enemy.statuses.DODGE ?? 1) - 1;
    if ((enemy.statuses.DODGE ?? 0) <= 0) delete enemy.statuses.DODGE;
    state.log.push(`${enemy.name} 身形一晃，攻击落空！`);
    return;
  }
  const strength = state.player.statuses.STRENGTH ?? 0;
  let damage = (state.player.attack + strength) * mul + flat;
  const crit = rng.chance(state.player.critChance);
  if (crit) damage *= 1.8;
  if ((state.player.statuses.WEAK ?? 0) > 0) damage *= 0.66;
  if ((enemy.statuses.VULNERABLE ?? 0) > 0) damage *= 1.5;
  damage = Math.max(1, Math.floor(damage * (state.modifiers.damageMul || 1)));
  if (!pierce && enemy.block > 0) {
    const absorbed = Math.min(enemy.block, damage);
    enemy.block -= absorbed;
    damage -= absorbed;
    if (absorbed > 0) state.log.push(`${enemy.name} 格挡了 ${absorbed} 伤害。`);
  }
  if (damage <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  state.log.push(`${crit ? '暴击！' : ''}对${enemy.name}造成 ${damage} 伤害`);
  if (enemy.hp <= 0) onEnemyDefeated(state, env, enemy, rng);
}

/** 敌人对玩家结算一次攻击：闪避/虚境/格挡/易伤/虚弱。 */
function dealDamageToPlayer(state: CardBattleState, enemy: CardEnemy, raw: number, sourceLabel: string): void {
  if ((state.player.statuses.DODGE ?? 0) > 0) {
    state.player.statuses.DODGE = (state.player.statuses.DODGE ?? 1) - 1;
    if ((state.player.statuses.DODGE ?? 0) <= 0) delete state.player.statuses.DODGE;
    state.log.push('你身形一晃，闪开了攻击！');
    return;
  }
  if ((state.player.statuses.INTANGIBLE ?? 0) > 0) {
    state.log.push('【虚境】让这一击穿身而过！');
    return;
  }
  let damage = raw;
  if ((enemy.statuses.WEAK ?? 0) > 0) damage = Math.floor(damage * 0.66);
  if ((state.player.statuses.VULNERABLE ?? 0) > 0) damage = Math.floor(damage * 1.5);
  damage = Math.max(1, damage);
  if (state.player.block > 0) {
    const absorbed = Math.min(state.player.block, damage);
    state.player.block -= absorbed;
    damage -= absorbed;
    if (absorbed > 0) state.log.push(`格挡吸收 ${absorbed} 伤害。`);
  }
  if (damage <= 0) return;
  state.player.hp = Math.max(0, state.player.hp - damage);
  state.log.push(`${sourceLabel} 对你造成 ${damage} 伤害`);
}

export function addStatus(statuses: CardStatuses, id: StatusId, stacks: number): void {
  statuses[id] = (statuses[id] ?? 0) + stacks;
}

export function statusName(id: StatusId): string {
  switch (id) {
    case 'STRENGTH': return '力量';
    case 'WEAK': return '虚弱';
    case 'VULNERABLE': return '易伤';
    case 'DODGE': return '闪避';
    case 'BLIND': return '失明';
    case 'POISON': return '中毒';
    case 'REGEN': return '回气';
    case 'COST_DOWN': return '降费';
    case 'INTANGIBLE': return '虚境';
    default: return id;
  }
}

// ── 抽牌/弃牌 ────────────────────────────────────────────────────────────────

/** 抽 n 张：抽牌堆不足时弃牌堆洗回；超出手牌上限进入弃牌堆。 */
export function drawCards(state: CardBattleState, count: number): void {
  let remaining = Math.max(0, count);
  while (remaining > 0) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) return; // 无牌可抽（不造成伤害）
      const rng = CardRng.fromState(state.rng);
      rng.shuffle(state.drawPile = [...state.discardPile]);
      state.discardPile = [];
      state.reshuffles += 1;
      state.rng = rng.toState();
      state.log.push('弃牌堆洗回抽牌堆。');
      continue;
    }
    const card = state.drawPile.pop()!;
    remaining -= 1;
    if (state.hand.length >= state.handLimit) {
      state.discardPile.push(card);
      state.log.push(`手牌已满，【${resolveCardDef(card).name}】被弃置。`);
    } else {
      state.hand.push(card);
    }
  }
}

// ── 胜负与奖励 ───────────────────────────────────────────────────────────────

/** 敌人被击败：波次推进（波间喘息）或胜利（生成奖励候选）。 */
function onEnemyDefeated(state: CardBattleState, env: CardEngineEnv, enemy: CardEnemy, rng: CardRng): void {
  state.log.push(`击杀 ${enemy.name}！`);
  if (state.enemies.some((e) => e.hp > 0)) return;
  if (state.wave < env.waveTotal - 1) {
    state.wave += 1;
    const healed = Math.floor(state.player.maxHp * 0.25);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + healed);
    state.log.push(`波间喘息：回复 ${healed} 生命。`);
    state.enemies = env.spawnWave(state.wave, rng, state);
    state.log.push(`第 ${state.wave + 1}/${env.waveTotal} 波：${state.enemies.map((e) => e.name).join('、')}`);
    for (const next of state.enemies) {
      next.intent = env.planIntent(next, state, rng);
    }
  } else {
    state.phase = 'VICTORY_SETTLED';
    state.log.push('项目交付！所有敌人已被超度。');
    const candidates = env.rollRewards(rng, state);
    state.reward = { candidates, claimed: false, chosen: null };
    state.phase = 'REWARD_SELECTION';
  }
}

/** 战斗终结检测：玩家死亡 → 失败（含灾备重生）。 */
function checkBattleEnd(state: CardBattleState, env: CardEngineEnv): void {
  if (state.phase === 'VICTORY_SETTLED' || state.phase === 'REWARD_SELECTION') return;
  if (state.player.hp > 0) return;
  if (env.reviveOnce === true && state.player.usedRevive !== true) {
    state.player.usedRevive = true;
    state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.5));
    state.log.push('【道法共鸣·灾备重生】你原地复活（50%）！');
    return;
  }
  state.phase = 'DEFEAT_SETTLED';
  state.log.push('你被需求淹没了……');
  state.phase = 'FINISHED';
  state.reward = null;
}

/** 领取战斗胜利卡牌奖励（cardId=null 表示放弃）。 */
export function claimCardReward(state: CardBattleState, cardId: string | null): void {
  if (!state.reward) throw new CardBattleError('REWARD_NOT_PENDING', '当前没有待领取的奖励');
  if (state.reward.claimed) throw new CardBattleError('REWARD_ALREADY_CLAIMED', '奖励已领取');
  if (cardId !== null && !state.reward.candidates.includes(cardId)) {
    throw new CardBattleError('REWARD_INVALID_OPTION', '无效的奖励选项');
  }
  state.reward.claimed = true;
  state.reward.chosen = cardId;
  state.phase = 'FINISHED';
  if (cardId) state.log.push(`收下卡牌【${cardId}】。`);
  else state.log.push('放弃了卡牌奖励。');
}

function assertContinuable(state: CardBattleState): void {
  if (state.phase === 'FINISHED' || state.phase === 'VICTORY_SETTLED' || state.phase === 'DEFEAT_SETTLED' || state.phase === 'REWARD_SELECTION') {
    throw new CardBattleError('BATTLE_FINISHED', '战斗已结束');
  }
}
