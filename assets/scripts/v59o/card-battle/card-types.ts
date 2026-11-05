/**
 * V5.9-O.2 回合制卡牌战斗 — 类型定义。
 *
 * 本文件是卡牌战斗的唯一权威状态形状（单一 BattleRun 内嵌 card 字段）。
 * 引擎（card-engine.ts）只操作本文件声明的纯数据；UI 不直接改写任何数值。
 * 全部状态可 JSON 序列化（存档恢复），随机数状态可保存/恢复（确定性回放）。
 */

// ── 阶段状态机 ───────────────────────────────────────────────────────────────

/**
 * 权威阶段状态机（§10）：
 * NOT_STARTED → BATTLE_START → PLAYER_TURN_START → PLAYER_TURN
 *   ├─ PLAY_CARD / SELECT_TARGET / END_TURN（玩家子动作）
 *   └─ END_TURN → ENEMY_TURN → TURN_SETTLEMENT → PLAYER_TURN_START
 * 胜利：任意结算节点 → VICTORY_SETTLED → REWARD_SELECTION → FINISHED
 * 失败：任意结算节点 → DEFEAT_SETTLED → FINISHED
 */
export type CardPhase =
  | 'NOT_STARTED'
  | 'BATTLE_START'
  | 'PLAYER_TURN_START'
  | 'PLAYER_TURN'
  | 'ENEMY_TURN'
  | 'TURN_SETTLEMENT'
  | 'VICTORY_SETTLED'
  | 'REWARD_SELECTION'
  | 'DEFEAT_SETTLED'
  | 'FINISHED';

export type StatusId =
  | 'STRENGTH'      // 攻击 +N/点
  | 'WEAK'          // 造成伤害 ×0.66
  | 'VULNERABLE'    // 受到伤害 ×1.5
  | 'DODGE'         // 闪避接下来 N 次攻击
  | 'BLIND'         // 攻击 50% 落空
  | 'POISON'        // 回合结束受到 N 伤害并 -1 层
  | 'REGEN'         // 回合开始回复 N
  | 'COST_DOWN'     // 本回合手牌费用 -1（回合结束清除）
  | 'INTANGIBLE';   // 本回合受到的所有伤害/攻击无效

// 引擎环境签名引用（类型循环在此为纯类型依赖，编译期擦除）。
import type { CardRng } from './card-rng';

export interface CardStatuses {
  STRENGTH?: number;
  WEAK?: number;
  VULNERABLE?: number;
  DODGE?: number;
  BLIND?: number;
  POISON?: number;
  REGEN?: number;
  COST_DOWN?: number;
  INTANGIBLE?: number;
}

// ── 卡牌定义 ─────────────────────────────────────────────────────────────────

export type CardType = 'ATTACK' | 'DEFENSE' | 'SKILL' | 'PROFESSION' | 'FATE' | 'SPECIAL';
export type CardRarity = 'BASIC' | 'COMMON' | 'RARE' | 'EPIC';
export type CardTargetMode = 'ENEMY' | 'ALL_ENEMIES' | 'SELF';

export type CardEffect =
  | { kind: 'DAMAGE'; mul?: number; flat?: number; aoe?: boolean; pierce?: boolean }
  | { kind: 'BLOCK'; flat: number }
  | { kind: 'HEAL'; flat: number }
  | { kind: 'DRAW'; count: number }
  | { kind: 'ENERGY'; delta: number }
  | { kind: 'APPLY_STATUS'; target: 'ENEMY' | 'ALL_ENEMIES' | 'SELF'; status: StatusId; stacks: number }
  | { kind: 'REMOVE_STATUS'; target: 'SELF'; status: StatusId }
  | { kind: 'DISCARD_HAND' }                                   // 弃掉其余手牌
  | { kind: 'ADD_CARD_TO_HAND'; cardId: string; copies: number } // 生成临时牌
  | { kind: 'CONDITIONAL'; if: ConditionDef; then: CardEffect[]; otherwise?: CardEffect[] };

export type ConditionDef =
  | { kind: 'ENEMY_HP_BELOW_PCT'; pct: number }
  | { kind: 'PLAYER_HP_BELOW_PCT'; pct: number }
  | { kind: 'ENEMY_COUNT_AT_LEAST'; count: number }
  | { kind: 'PLAYER_BLOCK_AT_LEAST'; block: number };

/** 卡牌定义（数据驱动，来自 assets/configs/v59o/card-battle.json）。 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly type: CardType;
  readonly rarity: CardRarity;
  readonly cost: number;                 // 能量费用（0-5；COST_DOWN 后最低 0）
  readonly target: CardTargetMode;
  readonly effects: readonly CardEffect[];
  /** 职业限制（空 = 全职业）。 */
  readonly profession?: string;
  /** 宗门专属（空 = 全宗门）。 */
  readonly sect?: string;
  /** 是否消耗（打出后进入消耗堆）。 */
  readonly exhaust?: boolean;
  /** 是否保留（回合结束不弃置）。 */
  readonly retain?: boolean;
  /** 是否可在奖励池出现（基础牌 false）。 */
  readonly rewardable?: boolean;
  /** 状态牌/诅咒牌：不可主动打出。 */
  readonly unplayable?: boolean;
  /** 升级版卡牌 id（升级指向的版本）。 */
  readonly upgradeTo?: string;
}

/** 手牌/牌堆中的卡牌实例。 */
export interface CardInstance {
  /** 实例唯一 id（uid_counter）。 */
  readonly uid: string;
  /** 卡牌定义 id。 */
  readonly defId: string;
  /** 升级等级 0=普通 1=+1 2=+2。 */
  readonly upgraded: number;
  /** 本回合临时降费（回合结束清除）。 */
  readonly turnCostDelta: number;
}

// ── 敌人 ─────────────────────────────────────────────────────────────────────

export type EnemyTier = 'NORMAL' | 'ELITE' | 'BOSS';

export type EnemyIntent =
  | { kind: 'ATTACK'; damage: number; hits: number }
  | { kind: 'ATTACK_DEBUFF'; damage: number; status: StatusId; stacks: number }
  | { kind: 'BLOCK'; amount: number }
  | { kind: 'BUFF'; status: StatusId; stacks: number }
  | { kind: 'DEBUFF'; status: StatusId; stacks: number }
  | { kind: 'SUMMON'; minionId: string }
  | { kind: 'SPECIAL'; mechanic: string }   // Boss 机制（封技/蓄力/吞噬…）
  | { kind: 'SLEEP' };

export interface CardEnemy {
  readonly uid: string;
  readonly defId: string;
  name: string;
  readonly tier: EnemyTier;
  hp: number;
  readonly maxHp: number;
  attack: number;
  block: number;
  statuses: CardStatuses;
  /** 本回合意图（回合开始时规划，玩家可提前看到）。 */
  intent: EnemyIntent | null;
  /** Boss 机制状态（按回合计时）。 */
  timers: Record<string, number>;
  telegraphed: Record<string, boolean>;
  linkGroup?: string;
  revived?: number;
  enraged?: boolean;
  phase2Active?: boolean;
  /** 已避开的意图标记（DODGE 展示）。 */
  dodgeActive?: boolean;
}

// ── 权威战斗状态 ─────────────────────────────────────────────────────────────

export interface CardRngState {
  readonly seed: number;
  counter: number;
}

export interface CardPlayerState {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  statuses: CardStatuses;
  /** 攻击快照（供 UI 展示与条件效果）。 */
  attack: number;
  /** 暴击率快照（0-0.8）。 */
  critChance: number;
  /** 灾备重生是否已用。 */
  usedRevive?: boolean;
}

export interface CardRewardState {
  /** 3 张候选（卡牌定义 id）。 */
  candidates: string[];
  /** 本场战斗是否已领取/放弃。 */
  claimed: boolean;
  /** 已选中的卡（claimed 后记录，供结算展示）。 */
  chosen: string | null;
}

export interface CardBattleState {
  /** 卡牌战斗状态结构版本（存档迁移判定）。 */
  readonly cardVersion: 1;
  /** 唯一战斗 id。 */
  readonly battleId: string;
  /** 唯一 Run id（继承外部 run）。 */
  readonly runId: string;
  phase: CardPhase;
  turn: number;
  /** 当前波次（0 起）。 */
  wave: number;
  player: CardPlayerState;
  enemies: CardEnemy[];
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  /** 基础能量/回合抽牌数/手牌上限。 */
  baseEnergy: number;
  drawPerTurn: number;
  handLimit: number;
  /** 弃牌堆洗回次数（诊断用）。 */
  reshuffles: number;
  rng: CardRngState;
  /** 战斗卡组构成快照（deck 定义 id → 数量，诊断/恢复校验用）。 */
  deckManifest: Record<string, number>;
  reward: CardRewardState | null;
  /** 玩家行动去重（幂等）。 */
  lastActionId: string | null;
  /** uid 发号器。 */
  uidCounter: number;
  log: string[];
  /** 宗门/命格/装备等派生修饰（开局一次性快照，供引擎与 UI 展示）。 */
  modifiers: {
    sectId: string | null;
    destinyId: string | null;
    /** 每回合开始额外获得格挡。 */
    startBlockPerTurn: number;
    /** 卡牌伤害全局乘数（宗门/命格小加成，已去重防止膨胀）。 */
    damageMul: number;
    /** 回合结束回复。 */
    endTurnHeal: number;
    /** 每 N 回合 +1 能量（0=关闭）。 */
    energyEveryTurns: number;
    /** 开局附加状态。 */
    openingStatuses: CardStatuses;
  };
}

// ── 世界注入（引擎保持纯净，世界数据由服务层提供） ──────────────────────────

/** 波次生成器：服务层根据 wave 序号与 rng 产出敌人（引擎不含怪物表）。 */
export type WaveSpawner = (waveIndex: number, rng: CardRng, state: CardBattleState) => CardEnemy[];
/** 奖励候选生成器：服务层从卡池/职业/宗门权重抽取 3 张。 */
export type RewardRoller = (rng: CardRng, state: CardBattleState) => string[];

/** 引擎运行环境（每次调用注入，不进存档）。 */
export interface CardEngineEnv {
  readonly spawnWave: WaveSpawner;
  readonly rollRewards: RewardRoller;
  readonly waveTotal: number;
  /** 灾备重生（装备/共鸣聚合）。 */
  readonly reviveOnce?: boolean;
  /** 敌人意图规划（含 Boss 机制回合化）。 */
  readonly planIntent: (enemy: CardEnemy, state: CardBattleState, rng: CardRng) => EnemyIntent;
  /** Boss 特殊机制执行（ENEMY_TURN 中，SUMMON/SPECIAL 意图路由到这里）。 */
  readonly runBossSpecial: (
    enemy: CardEnemy,
    intent: Extract<EnemyIntent, { kind: 'SUMMON' } | { kind: 'SPECIAL' }>,
    state: CardBattleState,
    rng: CardRng,
    log: (line: string) => void,
  ) => void;
}

// ── 错误 ─────────────────────────────────────────────────────────────────────

export class CardBattleError extends Error {
  public constructor(public readonly code: CardErrorCode, message: string) {
    super(message);
    this.name = 'CardBattleError';
  }
}

export type CardErrorCode =
  | 'NOT_IN_PLAYER_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'INSUFFICIENT_ENERGY'
  | 'TARGET_REQUIRED'
  | 'TARGET_INVALID'
  | 'CARD_UNPLAYABLE'
  | 'PHASE_INVALID'
  | 'SKILL_OFFERS_PENDING'
  | 'REWARD_NOT_PENDING'
  | 'REWARD_ALREADY_CLAIMED'
  | 'REWARD_INVALID_OPTION'
  | 'BATTLE_FINISHED';
