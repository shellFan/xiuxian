/** V5.9-L deterministic, serializable card-battle domain. No engine/runtime dependencies. */

export type CardType = 'ATTACK' | 'DEFENSE' | 'SKILL' | 'FATE';
export type CardRarity = 'COMMON' | 'UNCOMMON' | 'RARE';
export type BattlePhase = 'BATTLE_START' | 'PLAYER_DRAW' | 'PLAYER_ACTION' | 'ENEMY_ACTION' | 'TURN_END' | 'VICTORY' | 'DEFEAT';
export type CardId =
  | 'ATK-01' | 'ATK-02' | 'ATK-03' | 'ATK-04' | 'ATK-05' | 'ATK-06'
  | 'ATK-07' | 'ATK-08' | 'ATK-09' | 'ATK-10' | 'ATK-11' | 'ATK-12'
  | 'DEF-01' | 'DEF-02' | 'DEF-03' | 'DEF-04' | 'DEF-05' | 'DEF-06' | 'DEF-07' | 'DEF-08'
  | 'SKL-01' | 'SKL-02' | 'SKL-03' | 'SKL-04' | 'SKL-05' | 'SKL-06' | 'SKL-07' | 'SKL-08'
  | 'FTE-01' | 'FTE-02' | 'FTE-03' | 'FTE-04' | 'FTE-05' | 'FTE-06' | 'FTE-07' | 'FTE-08';
export type EventId = 'EVT-01' | 'EVT-02' | 'EVT-03' | 'EVT-04' | 'EVT-05' | 'EVT-06'
  | 'EVT-07' | 'EVT-08' | 'EVT-09' | 'EVT-10' | 'EVT-11' | 'EVT-12';
export type CardProfessionId = 'JAVA_BACKEND' | 'FRONTEND' | 'QA' | 'DEVOPS';
export type EnemyIntentKind = 'ATTACK' | 'CHARGE_ATTACK' | 'BLOCK' | 'SPLIT' | 'ENRAGE'
  | 'WEAKEN' | 'POISON' | 'SUMMON' | 'LIFESTEAL' | 'MUTATE' | 'DEFLECT';

export interface CardDefinition {
  id: CardId;
  effectId: string;
  name: string;
  description: string;
  type: CardType;
  rarity: CardRarity;
  cost: number;
  target: 'NONE' | 'ENEMY';
  exhaust?: boolean;
  upgrade: Readonly<Record<string, number | string | boolean>>;
}

const card = (
  id: CardId, effectId: string, name: string, description: string, type: CardType,
  cost: number, rarity: CardRarity, target: 'NONE' | 'ENEMY',
  upgrade: Readonly<Record<string, number | string | boolean>>, exhaust = false,
): CardDefinition => ({ id, effectId, name, description, type, cost, rarity, target, upgrade, exhaust });

export const CARD_CATALOG: readonly CardDefinition[] = Object.freeze([
  card('ATK-01', 'damage.single.6', '普通修复', '对单体造成 6 点伤害。', 'ATTACK', 1, 'COMMON', 'ENEMY', { damage: 9 }),
  card('ATK-02', 'damage.double.3', '双重提交', '对单体造成 2 次各 3 点伤害。', 'ATTACK', 1, 'COMMON', 'ENEMY', { damage: 4 }),
  card('ATK-03', 'damage.triple.2', '三连代码斩', '对单体造成 3 次各 2 点伤害。', 'ATTACK', 1, 'COMMON', 'ENEMY', { hits: 4 }),
  card('ATK-04', 'damage.tenfold.blood', '十连爆发', '先失去 5 点生命，再造成 10 次各 2 点伤害。', 'ATTACK', 2, 'RARE', 'ENEMY', { selfDamage: 3 }),
  card('ATK-05', 'damage.weakness.bonus', 'SQL 注入反击', '造成 5 点伤害；目标带弱点时额外造成 6 点。', 'ATTACK', 1, 'UNCOMMON', 'ENEMY', { bonus: 9 }),
  card('ATK-06', 'damage.all.4', '代码风暴', '对所有存活敌人各造成 4 点伤害。', 'ATTACK', 1, 'UNCOMMON', 'NONE', { damage: 6 }),
  card('ATK-07', 'status.critical.next', '暴击编译', '下一张攻击卡伤害翻倍。', 'ATTACK', 1, 'UNCOMMON', 'NONE', { multiplier: 3 }),
  card('ATK-08', 'damage.dispel.4', '线上热修复', '造成 4 点伤害并移除目标一个增益。', 'ATTACK', 1, 'UNCOMMON', 'ENEMY', { damage: 7 }),
  card('ATK-09', 'damage.random.threads', '多线程打击', '产生 4 个各 2 点、由战斗 RNG 选择目标的独立命中。', 'ATTACK', 1, 'RARE', 'NONE', { hits: 5 }),
  card('ATK-10', 'damage.energy.consume', '终极提交', '造成 5 + 剩余能量 × 4 点伤害，并消耗全部剩余能量。', 'ATTACK', 0, 'RARE', 'ENEMY', { scale: 5 }),
  card('ATK-11', 'damage.kill.chain', '连锁修复', '造成 7 点伤害；击杀后对另一目标追加 5 点伤害。', 'ATTACK', 1, 'UNCOMMON', 'ENEMY', { chain: 8 }),
  card('ATK-12', 'damage.legacy.debt', '祖传代码', '造成 12 点伤害，下回合少 1 点能量。', 'ATTACK', 1, 'RARE', 'ENEMY', { damage: 16 }),
  card('DEF-01', 'block.gain.8', '代码审查', '获得 8 点护盾。', 'DEFENSE', 1, 'COMMON', 'NONE', { block: 11 }),
  card('DEF-02', 'block.cleanse', '紧急回滚', '获得 5 点护盾并移除一个负面状态。', 'DEFENSE', 1, 'COMMON', 'NONE', { block: 8 }),
  card('DEF-03', 'guard.once.8', '假装开会', '下一次受到的伤害减少 8 点。', 'DEFENSE', 1, 'UNCOMMON', 'NONE', { reduction: 12 }),
  card('DEF-04', 'block.temporary.5', '摸鱼护体', '获得 5 点本回合护盾，回合结束清零。', 'DEFENSE', 0, 'COMMON', 'NONE', { block: 8 }),
  card('DEF-05', 'block.ward.two', '工位结界', '获得 3 点护盾，随后两次敌方行动开始时各补 3 点。', 'DEFENSE', 1, 'UNCOMMON', 'NONE', { ward: 4 }),
  card('DEF-06', 'status.reflect.once', '反向甩锅', '下次受到伤害时反弹实际伤害的一半。', 'DEFENSE', 1, 'UNCOMMON', 'NONE', { percent: 75 }),
  card('DEF-07', 'intent.scan.block', '安全扫描', '显示目标完整下一步意图并获得 3 点护盾。', 'DEFENSE', 0, 'COMMON', 'ENEMY', { block: 6 }),
  card('DEF-08', 'revive.once', '九命牛马', '每场一次：致命伤害后生命保留 1。', 'DEFENSE', 2, 'RARE', 'NONE', { hp: 5 }),
  card('SKL-01', 'status.auto.script', '自动脚本', '随后 3 个玩家回合开始时对首个敌人造成 3 点伤害。', 'SKILL', 1, 'UNCOMMON', 'NONE', { turns: 4 }),
  card('SKL-02', 'status.accelerate.next', '代码加速', '下一张攻击卡额外造成 5 点伤害。', 'SKILL', 1, 'COMMON', 'NONE', { bonus: 8 }),
  card('SKL-03', 'heal.hp.4', '咖啡续命', '恢复 4 点生命，不超过上限。', 'SKILL', 1, 'COMMON', 'NONE', { heal: 7 }),
  card('SKL-04', 'heal.will.3', '道心稳定', '恢复 3 点道心，不超过上限。', 'SKILL', 1, 'COMMON', 'NONE', { will: 6 }),
  card('SKL-05', 'draw.cards.2', '技术突破', '立即抽 2 张牌。', 'SKILL', 1, 'UNCOMMON', 'NONE', { draw: 3 }),
  card('SKL-06', 'energy.overclock', '超频工作', '本回合获得 2 点临时能量，战斗后疲劳增加 10。', 'SKILL', 0, 'UNCOMMON', 'NONE', { energy: 3 }),
  card('SKL-07', 'debuff.bug.weakness', 'Bug 标记', '目标获得 2 回合弱点，每次受击额外 4 点伤害。', 'SKILL', 1, 'UNCOMMON', 'ENEMY', { turns: 3 }),
  card('SKL-08', 'energy.capacity', '服务器扩容', '本战斗能量上限 +1，并立刻获得 1 点能量。', 'SKILL', 1, 'RARE', 'NONE', { capacity: 2 }),
  card('FTE-01', 'fate.risk.energy', '危险实验', '按 seed 获得临时能量或失去生命。', 'FATE', 0, 'UNCOMMON', 'NONE', { energy: 2 }, true),
  card('FTE-02', 'fate.enemy.mutate', '怪物变异', '目标攻击 +2、生命 +6，稀有奖励预算 +1。', 'FATE', 0, 'RARE', 'ENEMY', { hp: 9 }, true),
  card('FTE-03', 'fate.reroll.last', '命运逆转', '重掷最近一次可逆结果并记录原值、seed 与新结果。', 'FATE', 1, 'RARE', 'NONE', { block: 2 }, true),
  card('FTE-04', 'fate.relationship.block', '同事支援', '依据关系值获得 2–6 点护盾。', 'FATE', 1, 'UNCOMMON', 'NONE', { block: 2 }, true),
  card('FTE-05', 'fate.attack.pie', '老板画饼', '本回合攻击 +4，回合结束失去 3 点生命。', 'FATE', 1, 'UNCOMMON', 'NONE', { attack: 6 }, true),
  card('FTE-06', 'fate.life.gamble', '生死一搏', '失去 10 点生命并造成 20 点伤害；生命不足 11 时不可用。', 'FATE', 2, 'RARE', 'ENEMY', { damage: 26 }, true),
  card('FTE-07', 'fate.rare.temporary', '神秘传承', '从稀有池加入一张本场临时卡。', 'FATE', 1, 'RARE', 'NONE', { upgraded: true }, true),
  card('FTE-08', 'fate.awaken.threshold', '牛马觉醒', '生命不高于 30% 时造成 15 点伤害，否则获得 7 点护盾。', 'FATE', 1, 'RARE', 'ENEMY', { damage: 20, block: 10 }, true),
]);

export interface EventDefinition { id: EventId; name: string; choices: readonly { id: 'A' | 'B' | 'C'; text: string }[]; }
const choices = (a: string, b: string, c: string): EventDefinition['choices'] => [{ id: 'A', text: a }, { id: 'B', text: b }, { id: 'C', text: c }];
export const EVENT_CATALOG: readonly EventDefinition[] = Object.freeze([
  { id: 'EVT-01', name: 'Bug 分裂', choices: choices('消灭孵化器', '不干预', '牺牲生命阻止分裂') },
  { id: 'EVT-02', name: '服务器过载', choices: choices('使用防御卡', '承受伤害', '关闭服务') },
  { id: 'EVT-03', name: '同事求助', choices: choices('消耗关系换护盾', '帮忙', '拒绝') },
  { id: 'EVT-04', name: '主管查岗', choices: choices('展示日志', '甩锅', '直接汇报') },
  { id: 'EVT-05', name: '线上事故', choices: choices('紧急回滚', '在线修复', '忽略告警') },
  { id: 'EVT-06', name: '神秘代码', choices: choices('学习', '删除', '运行') },
  { id: 'EVT-07', name: '稀有卡牌奇遇', choices: choices('加入稀有卡', '升级手牌', '获得材料') },
  { id: 'EVT-08', name: '怪物变异', choices: choices('阻止变异', '允许变异', '危险实验') },
  { id: 'EVT-09', name: '职场危机', choices: choices('花费技能卡', '承担事故', '转移责任') },
  { id: 'EVT-10', name: '道心考验', choices: choices('支付道心', '接受考验', '保持本心') },
  { id: 'EVT-11', name: '夜间告警风暴', choices: choices('立即处理', '延迟处理', '关闭告警') },
  { id: 'EVT-12', name: '因果审计', choices: choices('重掷判定', '接受因果', '拒绝审计') },
]);

export interface CardInstance { instanceId: string; cardId: CardId; upgraded: boolean; temporary: boolean; }
export interface PlayerBattleState {
  hp: number; maxHp: number; will: number; maxWill: number; energy: number; maxEnergy: number;
  block: number; fatigue: number; relationship: number;
  statuses: Record<string, number>;
}
export interface EnemyIntent { kind: EnemyIntentKind; amount: number; hits: number; target: 'PLAYER' | 'SELF'; detail: string; revealed: boolean; }
export interface EnemyBattleState {
  id: string; kind: string; name: string; hp: number; maxHp: number; attack: number; block: number;
  phase: 1 | 2; phaseTransitions: number; intentIndex: number; intent: EnemyIntent; statuses: Record<string, number>;
}
export interface HitRecord { id: string; sourceId: string; targetId: string; amount: number; blocked: number; hpDamage: number; hitIndex: number; }
export interface ActionLogEntry { id: string; actorId: string; intent?: EnemyIntentKind; message: string; }
export interface EventLogEntry { eventId: EventId; choiceId: string; seed: number; receiptId: string; result: string; originalValue?: number; newValue?: number; }
export interface OperationReceipt { id: string; kind: string; applied: boolean; reason?: string; data?: Record<string, string | number | boolean>; }
export interface RewardChoice { id: string; kind: 'ADD_CARD' | 'UPGRADE' | 'MATERIAL'; cardId?: CardId; amount?: number; chosen: boolean; }
export interface Settlement { receiptId: string; result: 'VICTORY' | 'DEFEAT'; claimed: boolean; fatigue: number; rewardBudget: number; }
export interface CardBattleState {
  schemaVersion: 1;
  battleId: string;
  seed: number;
  rng: { draw: number; target: number; fate: number; event: number };
  phase: BattlePhase;
  turn: number;
  player: PlayerBattleState;
  enemies: EnemyBattleState[];
  piles: { draw: CardInstance[]; hand: CardInstance[]; discard: CardInstance[]; exhaust: CardInstance[]; removed: CardInstance[] };
  hitLog: HitRecord[];
  actionLog: ActionLogEntry[];
  eventLog: EventLogEntry[];
  pendingEventId?: EventId;
  receipts: Record<string, OperationReceipt>;
  rewards: RewardChoice[];
  settlement?: Settlement;
  rewardBudget: number;
  rareRewardBudget: number;
  materials: Record<string, number>;
  storyFlags: Record<string, boolean>;
  nextInstance: number;
  nextLog: number;
  reversibleResult?: { value: number; seed: number; source: string; receiptId?: string; targetId?: string; instanceId?: string; created?: boolean };
}

export interface CreateCardBattleOptions {
  seed?: number;
  battleId?: string;
  encounterId?: 'NORMAL' | 'MUTANT_BUG_KING' | 'BLAME_MANAGER';
  deckCardIds?: CardId[];
  professionId?: CardProfessionId;
  player?: Partial<Pick<PlayerBattleState, 'hp' | 'maxHp' | 'will' | 'maxWill' | 'fatigue' | 'relationship'>>;
  enemies?: Array<Partial<EnemyBattleState> & Pick<EnemyBattleState, 'id' | 'kind' | 'name' | 'hp' | 'maxHp' | 'attack'>>;
}
type EnemyInput = Partial<EnemyBattleState> & Pick<EnemyBattleState, 'id' | 'kind' | 'name' | 'hp' | 'maxHp' | 'attack'>;

const CARD_BY_ID = new Map<CardId, CardDefinition>(CARD_CATALOG.map((entry) => [entry.id, entry]));
const RARE_CARDS = CARD_CATALOG.filter((entry) => entry.rarity === 'RARE').map((entry) => entry.id);
export const STARTER_CLASS_CARD_BY_PROFESSION: Readonly<Record<CardProfessionId, CardId>> = Object.freeze({
  JAVA_BACKEND: 'ATK-05', // SQL 爆破
  FRONTEND: 'ATK-06', // DOM 风暴
  QA: 'SKL-07', // Bug 定位
  DEVOPS: 'DEF-02', // 紧急回滚
});

function starterDeck(professionId: CardProfessionId): CardId[] {
  return [
    'ATK-01', 'ATK-01', 'ATK-01', 'ATK-01', 'ATK-01',
    'DEF-01', 'DEF-01', 'DEF-01', 'DEF-01',
    STARTER_CLASS_CARD_BY_PROFESSION[professionId],
  ];
}

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function normalizeSeed(seed: number): number { return (Math.trunc(seed) >>> 0) || 0x6d2b79f5; }
function step(seed: number): number { let value = normalizeSeed(seed); value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return value >>> 0; }
function initialIntent(kind: string, attack: number): EnemyIntent {
  if (kind === 'MUTANT_BUG_KING') return { kind: 'CHARGE_ATTACK', amount: attack + 4, hits: 1, target: 'PLAYER', detail: `蓄力攻击 ${attack + 4}`, revealed: true };
  if (kind === 'BLAME_MANAGER') return { kind: 'BLOCK', amount: 8, hits: 1, target: 'SELF', detail: '获得 8 点护盾', revealed: true };
  return { kind: 'ATTACK', amount: attack, hits: 1, target: 'PLAYER', detail: `攻击 ${attack}`, revealed: true };
}

function enemy(input: EnemyInput): EnemyBattleState {
  return {
    id: input.id, kind: input.kind, name: input.name, hp: input.hp, maxHp: input.maxHp, attack: input.attack,
    block: input.block ?? 0, phase: input.phase ?? 1, phaseTransitions: input.phaseTransitions ?? 0,
    intentIndex: input.intentIndex ?? 0, intent: input.intent ?? initialIntent(input.kind, input.attack), statuses: { ...(input.statuses ?? {}) },
  };
}

function encounterEnemies(id: CreateCardBattleOptions['encounterId']): EnemyBattleState[] {
  if (id === 'MUTANT_BUG_KING') return [enemy({ id: 'boss-bug-king', kind: 'MUTANT_BUG_KING', name: '变异 Bug 王', hp: 100, maxHp: 100, attack: 9 })];
  if (id === 'BLAME_MANAGER') return [enemy({ id: 'boss-manager', kind: 'BLAME_MANAGER', name: '甩锅主管', hp: 120, maxHp: 120, attack: 10 })];
  return [enemy({ id: 'bug-1', kind: 'WORK_BUG', name: '工位 Bug', hp: 32, maxHp: 32, attack: 6 })];
}

export function createCardBattleState(options: CreateCardBattleOptions = {}): CardBattleState {
  const seed = normalizeSeed(options.seed ?? 5919);
  const deck = options.deckCardIds ?? starterDeck(options.professionId ?? 'JAVA_BACKEND');
  for (const id of deck) if (!CARD_BY_ID.has(id)) throw new Error(`Unknown card id: ${id}`);
  const maxHp = options.player?.maxHp ?? 100;
  const maxWill = options.player?.maxWill ?? 20;
  const instances = deck.map((cardId, index): CardInstance => ({ instanceId: `card-${index + 1}`, cardId, upgraded: false, temporary: false }));
  return {
    schemaVersion: 1, battleId: options.battleId ?? `battle-${seed}`, seed,
    rng: { draw: step(seed ^ 0x11), target: step(seed ^ 0x22), fate: step(seed ^ 0x33), event: step(seed ^ 0x44) },
    phase: 'BATTLE_START', turn: 0,
    player: {
      hp: Math.min(options.player?.hp ?? maxHp, maxHp), maxHp,
      will: Math.min(options.player?.will ?? maxWill, maxWill), maxWill,
      energy: 0, maxEnergy: 3, block: 0, fatigue: options.player?.fatigue ?? 0,
      relationship: options.player?.relationship ?? 50, statuses: {},
    },
    enemies: options.enemies?.map(enemy) ?? encounterEnemies(options.encounterId ?? 'NORMAL'),
    piles: { draw: instances, hand: [], discard: [], exhaust: [], removed: [] },
    hitLog: [], actionLog: [], eventLog: [], receipts: {}, rewards: [],
    rewardBudget: 3, rareRewardBudget: 0, materials: {}, storyFlags: {}, nextInstance: instances.length + 1, nextLog: 1,
  };
}

const PILE_NAMES = ['draw', 'hand', 'discard', 'exhaust', 'removed'] as const;
type PileName = typeof PILE_NAMES[number];

export function validateCardBattleState(state: CardBattleState): string[] {
  const errors: string[] = [];
  if (!state || state.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  if (!state || !Number.isInteger(state.seed)) errors.push('seed must be an integer');
  if (!state || !['BATTLE_START', 'PLAYER_DRAW', 'PLAYER_ACTION', 'ENEMY_ACTION', 'TURN_END', 'VICTORY', 'DEFEAT'].includes(state.phase)) errors.push('invalid phase');
  if (!state?.player || state.player.hp < 0 || state.player.hp > state.player.maxHp) errors.push('invalid player hp');
  const seen = new Set<string>();
  if (!state?.piles) errors.push('missing piles');
  else for (const pileName of PILE_NAMES) {
    if (!Array.isArray(state.piles[pileName])) { errors.push(`invalid ${pileName} pile`); continue; }
    for (const instance of state.piles[pileName]) {
      if (!CARD_BY_ID.has(instance.cardId)) errors.push(`unknown card ${instance.cardId}`);
      if (seen.has(instance.instanceId)) errors.push(`duplicate card instance ${instance.instanceId}`);
      seen.add(instance.instanceId);
    }
  }
  const enemyIds = new Set<string>();
  if (!Array.isArray(state?.enemies) || state.enemies.length === 0) errors.push('at least one enemy is required');
  else for (const item of state.enemies) {
    if (enemyIds.has(item.id)) errors.push(`duplicate enemy id ${item.id}`);
    enemyIds.add(item.id);
    if (item.hp < 0 || item.hp > item.maxHp) errors.push(`invalid enemy hp ${item.id}`);
    if (item.phase !== 1 && item.phase !== 2) errors.push(`invalid enemy phase ${item.id}`);
  }
  if (!state?.rng || Object.values(state.rng).some((value) => !Number.isInteger(value))) errors.push('invalid rng state');
  if (state?.pendingEventId && !EVENT_CATALOG.some((event) => event.id === state.pendingEventId)) errors.push('invalid pending event');
  if (!state?.receipts || Array.isArray(state.receipts)) errors.push('invalid receipts');
  return errors;
}

interface AttackContext { multiplier: number; bonus: number; bonusUsed: boolean; sourceId: string; }

export class CardBattleEngine {
  private state: CardBattleState;

  public constructor(state: CardBattleState = createCardBattleState()) {
    const candidate = copy(state);
    const errors = validateCardBattleState(candidate);
    if (errors.length > 0) throw new Error(`Invalid card battle state: ${errors.join('; ')}`);
    this.state = candidate;
  }

  public static restore(serialized: CardBattleState | string): CardBattleEngine {
    let value: CardBattleState;
    try { value = typeof serialized === 'string' ? JSON.parse(serialized) as CardBattleState : serialized; }
    catch (error) { throw new Error(`Invalid card battle state: ${(error as Error).message}`); }
    return new CardBattleEngine(value);
  }

  public inspect(): CardBattleState { return copy(this.state); }

  public init(operationId = 'start'): OperationReceipt { return this.start(operationId); }

  public start(operationId = 'start'): OperationReceipt {
    const key = `start:${operationId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'BATTLE_START') return this.reject(key, 'START', 'battle already started');
    this.state.turn = 1;
    this.state.phase = 'PLAYER_DRAW';
    this.state.player.energy = this.state.player.maxEnergy;
    this.shuffle('draw');
    this.draw(5);
    this.state.phase = 'PLAYER_ACTION';
    this.log('system', '战斗开始，抽取 5 张牌');
    return this.accept(key, 'START');
  }

  public playCard(instanceId: string, targetId?: string, operationId?: string): OperationReceipt {
    const key = `play:${operationId ?? instanceId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'PLAYER_ACTION') return this.reject(key, 'PLAY_CARD', 'not player action phase');
    const index = this.state.piles.hand.findIndex((item) => item.instanceId === instanceId);
    if (index < 0) return this.reject(key, 'PLAY_CARD', 'card is not in hand');
    const instance = this.state.piles.hand[index];
    const definition = CARD_BY_ID.get(instance.cardId)!;
    const cost = this.cardCost(definition, instance.upgraded);
    if (this.state.player.energy < cost) return this.reject(key, 'PLAY_CARD', 'insufficient energy');
    let target: EnemyBattleState | undefined;
    if (definition.target === 'ENEMY') {
      target = this.state.enemies.find((item) => item.id === targetId && item.hp > 0);
      if (!target) return this.reject(key, 'PLAY_CARD', 'invalid target');
    }
    if (instance.cardId === 'ATK-04' && this.state.player.hp <= (instance.upgraded ? 3 : 5)) return this.reject(key, 'PLAY_CARD', 'insufficient hp');
    if (instance.cardId === 'FTE-06' && this.state.player.hp <= 10) return this.reject(key, 'PLAY_CARD', 'insufficient hp');
    if (instance.cardId === 'DEF-08' && (this.state.player.statuses.nineLivesUsed ?? 0) > 0) return this.reject(key, 'PLAY_CARD', 'nine lives already used');
    if (instance.cardId === 'FTE-03' && !this.hasLegalReversibleEvent()) return this.reject(key, 'PLAY_CARD', 'no reversible event result');

    this.state.player.energy -= cost;
    this.state.piles.hand.splice(index, 1);
    this.state.piles[definition.exhaust ? 'exhaust' : 'discard'].push(instance);
    const attackContext: AttackContext | undefined = definition.type === 'ATTACK' ? {
      multiplier: this.state.player.statuses.nextAttackCritical || 1,
      bonus: this.state.player.statuses.nextAttackBonus || 0,
      bonusUsed: false,
      sourceId: instance.instanceId,
    } : undefined;
    this.applyCard(instance, definition, target, attackContext);
    if (definition.type === 'ATTACK' && attackContext) {
      if (attackContext.multiplier > 1) this.state.player.statuses.nextAttackCritical = 0;
      if (attackContext.bonus > 0) this.state.player.statuses.nextAttackBonus = 0;
    }
    this.log(instance.instanceId, `使用 ${definition.name}`);
    this.checkBattleEnd();
    return this.accept(key, 'PLAY_CARD', { cardId: definition.id, effectId: definition.effectId });
  }

  private applyCard(instance: CardInstance, definition: CardDefinition, target: EnemyBattleState | undefined, context: AttackContext | undefined): void {
    const upgraded = instance.upgraded;
    const hitContext = context ?? { multiplier: 1, bonus: 0, bonusUsed: false, sourceId: instance.instanceId };
    const hit = (victim: EnemyBattleState, amount: number, hitIndex = 1): number => this.attackHit(victim, amount, hitIndex, hitContext);
    switch (definition.id) {
      case 'ATK-01': hit(target!, upgraded ? 9 : 6); break;
      case 'ATK-02': for (let index = 1; index <= 2; index += 1) hit(target!, upgraded ? 4 : 3, index); break;
      case 'ATK-03': for (let index = 1; index <= (upgraded ? 4 : 3); index += 1) hit(target!, 2, index); break;
      case 'ATK-04': {
        this.loseHp(upgraded ? 3 : 5, instance.instanceId);
        for (let index = 1; index <= 10; index += 1) hit(target!, 2, index);
        break;
      }
      case 'ATK-05': hit(target!, 5 + ((target!.statuses.weakness ?? 0) > 0 ? (upgraded ? 9 : 6) : 0)); break;
      case 'ATK-06': for (const victim of this.aliveEnemies()) hit(victim, upgraded ? 6 : 4); break;
      case 'ATK-07': this.state.player.statuses.nextAttackCritical = upgraded ? 3 : 2; break;
      case 'ATK-08': hit(target!, upgraded ? 7 : 4); this.removeEnemyBuff(target!); break;
      case 'ATK-09': {
        const hits = upgraded ? 5 : 4;
        for (let index = 1; index <= hits; index += 1) {
          const candidates = this.aliveEnemies();
          if (candidates.length === 0) break;
          hit(candidates[this.randomInt('target', candidates.length)], 2, index);
        }
        break;
      }
      case 'ATK-10': {
        const energy = this.state.player.energy;
        this.state.player.energy = 0;
        hit(target!, 5 + energy * (upgraded ? 5 : 4));
        break;
      }
      case 'ATK-11': {
        const wasAlive = target!.hp > 0;
        hit(target!, 7);
        if (wasAlive && target!.hp === 0) {
          const next = this.aliveEnemies().find((item) => item.id !== target!.id);
          if (next) hit(next, upgraded ? 8 : 5, 2);
        }
        break;
      }
      case 'ATK-12': hit(target!, upgraded ? 16 : 12); this.state.player.statuses.legacyDebt = 1; break;
      case 'DEF-01': this.gainBlock(upgraded ? 11 : 8); break;
      case 'DEF-02': this.gainBlock(upgraded ? 8 : 5); this.cleansePlayer(); break;
      case 'DEF-03': this.state.player.statuses.nextDamageReduction = upgraded ? 12 : 8; break;
      case 'DEF-04': { const amount = upgraded ? 8 : 5; this.gainBlock(amount); this.state.player.statuses.temporaryBlock = (this.state.player.statuses.temporaryBlock ?? 0) + amount; break; }
      case 'DEF-05': this.gainBlock(3); this.state.player.statuses.workWard = 2; this.state.player.statuses.workWardAmount = upgraded ? 4 : 3; break;
      case 'DEF-06': this.state.player.statuses.reflectPercent = upgraded ? 75 : 50; break;
      case 'DEF-07': this.gainBlock(upgraded ? 6 : 3); target!.intent.revealed = true; target!.statuses.scanned = (target!.statuses.scanned ?? 0) + 1; break;
      case 'DEF-08': this.state.player.statuses.nineLives = 1; this.state.player.statuses.nineLivesHp = upgraded ? 5 : 1; break;
      case 'SKL-01': this.state.player.statuses.autoScript = upgraded ? 4 : 3; break;
      case 'SKL-02': this.state.player.statuses.nextAttackBonus = upgraded ? 8 : 5; break;
      case 'SKL-03': this.healPlayer(upgraded ? 7 : 4); break;
      case 'SKL-04': this.state.player.will = Math.min(this.state.player.maxWill, this.state.player.will + (upgraded ? 6 : 3)); break;
      case 'SKL-05': this.draw(upgraded ? 3 : 2); break;
      case 'SKL-06': this.state.player.energy += upgraded ? 3 : 2; this.state.player.statuses.overclockFatigue = (this.state.player.statuses.overclockFatigue ?? 0) + 10; break;
      case 'SKL-07': target!.statuses.weakness = upgraded ? 3 : 2; break;
      case 'SKL-08': { const amount = upgraded ? 2 : 1; this.state.player.maxEnergy += amount; this.state.player.energy += amount; break; }
      case 'FTE-01': this.applyDangerousExperiment(upgraded); break;
      case 'FTE-02': target!.maxHp += upgraded ? 9 : 6; target!.hp += upgraded ? 9 : 6; target!.attack += 2; target!.statuses.mutated = 1; this.state.rareRewardBudget += 1; break;
      case 'FTE-03': this.rerollLastResult(instance.instanceId); if (upgraded) this.gainBlock(2); break;
      case 'FTE-04': this.gainBlock(Math.min(6, Math.max(2, Math.floor(this.state.player.relationship / 20) + 2)) + (upgraded ? 2 : 0)); break;
      case 'FTE-05': this.state.player.statuses.attackBonus = upgraded ? 6 : 4; this.state.player.statuses.pieDamage = 3; break;
      case 'FTE-06': this.loseHp(10, instance.instanceId); hit(target!, upgraded ? 26 : 20); break;
      case 'FTE-07': this.addTemporaryRare(upgraded); break;
      case 'FTE-08': if (this.state.player.hp <= this.state.player.maxHp * 0.3) hit(target!, upgraded ? 20 : 15); else this.gainBlock(upgraded ? 10 : 7); break;
    }
  }

  private attackHit(target: EnemyBattleState, baseAmount: number, hitIndex: number, context: AttackContext): number {
    if (target.hp <= 0) return 0;
    let amount = baseAmount + (this.state.player.statuses.attackBonus ?? 0);
    if (!context.bonusUsed && context.bonus > 0) { amount += context.bonus; context.bonusUsed = true; }
    amount *= context.multiplier;
    if ((target.statuses.weakness ?? 0) > 0) amount += 4;
    return this.damageEnemy(target, amount, context.sourceId, hitIndex);
  }

  private damageEnemy(target: EnemyBattleState, rawAmount: number, sourceId: string, hitIndex: number): number {
    const amount = Math.max(0, Math.floor(rawAmount));
    const blocked = Math.min(target.block, amount);
    target.block -= blocked;
    const hpDamage = Math.min(target.hp, amount - blocked);
    target.hp -= hpDamage;
    this.state.hitLog.push({ id: `hit-${this.state.nextLog++}`, sourceId, targetId: target.id, amount, blocked, hpDamage, hitIndex });
    this.checkBossPhase(target);
    return hpDamage;
  }

  public endTurn(operationId?: string): OperationReceipt {
    const key = `end-turn:${operationId ?? this.state.turn}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'PLAYER_ACTION') return this.reject(key, 'END_TURN', 'not player action phase');
    this.state.phase = 'ENEMY_ACTION';
    const temporary = this.state.player.statuses.temporaryBlock ?? 0;
    this.state.player.block = Math.max(0, this.state.player.block - temporary);
    this.state.player.statuses.temporaryBlock = 0;
    if ((this.state.player.statuses.pieDamage ?? 0) > 0) {
      this.loseHp(this.state.player.statuses.pieDamage, 'boss-pie');
      this.state.player.statuses.pieDamage = 0;
      this.state.player.statuses.attackBonus = 0;
    }
    this.state.piles.discard.push(...this.state.piles.hand.splice(0));
    if (this.state.player.hp > 0) {
      for (const foe of this.aliveEnemies()) {
        if ((this.state.player.statuses.workWard ?? 0) > 0) {
          this.gainBlock(this.state.player.statuses.workWardAmount ?? 3);
          this.state.player.statuses.workWard -= 1;
        }
        const acted = copy(foe.intent);
        this.resolveEnemyIntent(foe, acted);
        this.state.actionLog.push({ id: `log-${this.state.nextLog++}`, actorId: foe.id, intent: acted.kind, message: `${foe.name}：${acted.detail}` });
        if (this.state.player.hp <= 0) break;
        foe.intentIndex += 1;
        foe.intent = this.nextIntent(foe);
      }
    }
    this.state.phase = 'TURN_END';
    for (const foe of this.aliveEnemies()) {
      if ((foe.statuses.poison ?? 0) > 0) {
        this.damageEnemy(foe, 3, 'poison', 1);
        foe.statuses.poison -= 1;
      }
      if ((foe.statuses.weakness ?? 0) > 0) foe.statuses.weakness -= 1;
      if ((foe.statuses.weakened ?? 0) > 0) foe.statuses.weakened -= 1;
    }
    this.checkBattleEnd();
    if (this.isTerminal()) return this.accept(key, 'END_TURN');
    this.state.turn += 1;
    this.state.phase = 'PLAYER_DRAW';
    const debt = (this.state.player.statuses.legacyDebt ?? 0) > 0 ? 1 : 0;
    this.state.player.statuses.legacyDebt = 0;
    this.state.player.energy = Math.max(0, this.state.player.maxEnergy - debt);
    if ((this.state.player.statuses.autoScript ?? 0) > 0) {
      const foe = this.aliveEnemies()[0];
      if (foe) this.damageEnemy(foe, 3, 'auto-script', 1);
      this.state.player.statuses.autoScript -= 1;
    }
    const bonusDraw = this.state.player.statuses.bonusDraw ?? 0;
    this.state.player.statuses.bonusDraw = 0;
    this.draw(5 + bonusDraw);
    this.checkBattleEnd();
    if (!this.isTerminal()) this.state.phase = 'PLAYER_ACTION';
    return this.accept(key, 'END_TURN');
  }

  public drawEvent(operationId = `turn-${this.state.turn}`): OperationReceipt {
    const key = `draw-event:${operationId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'PLAYER_ACTION') return this.reject(key, 'DRAW_EVENT', 'event unavailable in current phase');
    if (this.state.pendingEventId) return this.reject(key, 'DRAW_EVENT', 'pending event must be resolved first');
    const eventId = EVENT_CATALOG[this.randomInt('event', EVENT_CATALOG.length)].id;
    this.state.pendingEventId = eventId;
    this.log('event', `触发事件 ${eventId}`);
    return this.accept(key, 'DRAW_EVENT', { eventId });
  }

  public chooseEvent(eventId: EventId, choiceId: string, operationId?: string): OperationReceipt {
    const key = `event:${eventId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'PLAYER_ACTION') return this.reject(key, 'EVENT', 'event unavailable in current phase');
    if (this.state.pendingEventId !== eventId) return this.reject(key, 'EVENT', 'event is not pending');
    const event = EVENT_CATALOG.find((item) => item.id === eventId);
    if (!event || !event.choices.some((choice) => choice.id === choiceId)) return this.reject(key, 'EVENT', 'invalid event choice');
    const gate = this.eventGate(eventId, choiceId);
    if (gate) return this.reject(key, 'EVENT', gate);
    const seed = this.state.rng.event;
    const result = this.applyEvent(eventId, choiceId as 'A' | 'B' | 'C');
    const receiptId = `event-receipt:${eventId}:${choiceId}:${seed}`;
    if (this.state.reversibleResult?.source === eventId) this.state.reversibleResult.receiptId = receiptId;
    this.state.eventLog.push({ eventId, choiceId, seed, receiptId, result });
    this.state.pendingEventId = undefined;
    this.log(eventId, `${event.name}/${choiceId}：${result}`);
    this.checkBattleEnd();
    return this.accept(key, 'EVENT', { eventId, choiceId, receiptId, operationId: operationId ?? '' });
  }

  private eventGate(eventId: EventId, choiceId: string): string | undefined {
    if (eventId === 'EVT-01' && choiceId === 'A' && this.state.player.energy < 1) return 'insufficient energy';
    if (eventId === 'EVT-02' && choiceId === 'A' && !this.findCardByType('DEFENSE')) return 'defense card required';
    if (eventId === 'EVT-03' && choiceId === 'A' && this.state.player.relationship < 10) return 'insufficient relationship';
    if (eventId === 'EVT-08' && choiceId === 'A' && this.state.player.energy < 2) return 'insufficient energy';
    if (eventId === 'EVT-08' && choiceId === 'C' && this.state.player.hp <= 10) return 'insufficient hp';
    if (eventId === 'EVT-09' && choiceId === 'A' && !this.findCardByType('SKILL')) return 'skill card required';
    if (eventId === 'EVT-10' && choiceId === 'A' && this.state.player.will < 2) return 'insufficient will';
    if (eventId === 'EVT-12' && choiceId === 'A' && !this.hasLegalReversibleEvent()) return 'no reversible event result';
    return undefined;
  }

  private applyEvent(eventId: EventId, choiceId: 'A' | 'B' | 'C'): string {
    const first = this.aliveEnemies()[0];
    switch (`${eventId}:${choiceId}`) {
      case 'EVT-01:A': this.state.player.energy -= 1; this.story('incubatorDestroyed'); return '支付能量并摧毁孵化器';
      case 'EVT-01:B': this.summon('split-bug', '分裂 Bug', 8, 3); return '新增一只 8 生命 Bug';
      case 'EVT-01:C': this.loseHp(4, eventId); this.gainBlock(5); this.story('splitPrevented'); return '失去生命并阻止分裂';
      case 'EVT-02:A': this.consumeCardByType('DEFENSE'); if (first) first.statuses.charging = 0; return '消耗防御卡并取消蓄力';
      case 'EVT-02:B': this.takePlayerDamage(5, first); this.state.player.statuses.bonusDraw = (this.state.player.statuses.bonusDraw ?? 0) + 2; return '承受伤害并预定额外抽牌';
      case 'EVT-02:C': for (const foe of this.aliveEnemies()) foe.attack = Math.max(0, foe.attack - 2); this.state.rewardBudget -= 1; return '关闭服务并降低敌人攻击';
      case 'EVT-03:A': this.state.player.relationship -= 10; this.gainBlock(6); return '消耗关系并获得护盾';
      case 'EVT-03:B': this.healPlayer(3); this.state.player.relationship += 5; return '帮助同事并改善关系';
      case 'EVT-03:C': this.state.player.energy += 1; if (first) first.statuses.enraged = (first.statuses.enraged ?? 0) + 1; return '拒绝求助，双方强化';
      case 'EVT-04:A': this.state.player.statuses.weakness = 2; return '展示日志并获得弱点';
      case 'EVT-04:B': if (first) first.block += 6; this.state.player.energy += 4; return '甩锅并获得能量';
      case 'EVT-04:C': this.loseHp(5, eventId); this.story('directReport'); return '直接汇报并留下永久记录';
      case 'EVT-05:A': this.cleansePlayer(); return '回滚并移除负面状态';
      case 'EVT-05:B': for (const foe of this.aliveEnemies()) this.damageEnemy(foe, 8, eventId, 1); this.state.player.fatigue += 5; return '全体修复伤害并增加疲劳';
      case 'EVT-05:C': this.state.player.energy += 5; for (const foe of this.aliveEnemies()) foe.statuses.doubleAttack = 1; return '忽略告警并使敌人攻击翻倍';
      case 'EVT-06:A': this.addTemporaryRare(false); return '学习并获得临时稀有卡';
      case 'EVT-06:B': this.healPlayer(6); for (const foe of this.aliveEnemies()) this.removeAllEnemyBuffs(foe); return '删除代码、恢复生命并清除增益';
      case 'EVT-06:C': return this.eventShieldOrPoison(eventId);
      case 'EVT-07:A': this.addTemporaryRare(false); return '稀有卡加入本场牌组';
      case 'EVT-07:B': this.upgradeFirstHandCard(); return '升级一张手牌';
      case 'EVT-07:C': this.state.materials.rare = (this.state.materials.rare ?? 0) + 1; return '跳过并获得稀有材料';
      case 'EVT-08:A': this.state.player.energy -= 2; this.story('mutationPrevented'); return '支付能量阻止变异';
      case 'EVT-08:B': if (first) { first.attack += 2; first.statuses.mutated = 1; } this.state.rareRewardBudget += 1; return '允许敌人变异';
      case 'EVT-08:C': this.loseHp(10, eventId); return this.dangerousMutation(first);
      case 'EVT-09:A': this.consumeCardByType('SKILL'); this.gainBlock(8); return '消耗技能卡并获得护盾';
      case 'EVT-09:B': this.loseHp(6, eventId); if (first) first.statuses.weakened = 2; return '承担事故并使敌人虚弱';
      case 'EVT-09:C': if (first) first.block += 5; this.draw(3); return '转移责任并抽牌';
      case 'EVT-10:A': this.state.player.will -= 2; this.state.player.statuses.attackBonus = (this.state.player.statuses.attackBonus ?? 0) + 10; return '支付道心并获得伤害增益';
      case 'EVT-10:B': return this.eventTrial(eventId);
      case 'EVT-10:C': this.cleansePlayer(); if (first) first.statuses.enraged = (first.statuses.enraged ?? 0) + 1; return '保持本心并激怒敌人';
      case 'EVT-11:A': this.state.player.fatigue += 10; if (first) first.statuses.poison = 2; return '立即处理，敌人中毒';
      case 'EVT-11:B': this.takePlayerDamage(5, first); this.addTemporaryCard('ATK-01', false); this.addTemporaryCard('DEF-01', false); return '延迟处理并获得临时牌';
      case 'EVT-11:C': if (first) first.statuses.summonCancelled = 1; this.state.rareRewardBudget -= 1; return '关闭告警并取消召唤';
      case 'EVT-12:A': this.rerollLastResult(eventId); return '重掷最近一次合法判定';
      case 'EVT-12:B': this.loseHp(3, eventId); this.story('acceptedCausality'); return '接受因果并记录剧情';
      case 'EVT-12:C': if (first) first.block += 5; this.state.player.energy += 1; return '拒绝审计，双方获得资源';
    }
    throw new Error(`Unhandled event choice ${eventId}/${choiceId}`);
  }

  public chooseReward(rewardId: string, operationId?: string): OperationReceipt {
    const key = `reward:${operationId ?? rewardId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (this.state.phase !== 'VICTORY' || !this.state.settlement) return this.reject(key, 'REWARD', 'rewards require victory');
    if (this.state.rewards.some((reward) => reward.chosen)) return this.reject(key, 'REWARD', 'reward already chosen');
    const reward = this.state.rewards.find((item) => item.id === rewardId);
    if (!reward) return this.reject(key, 'REWARD', 'unknown reward');
    reward.chosen = true;
    if (reward.kind === 'ADD_CARD' && reward.cardId) this.addCard(reward.cardId, false, false, 'discard');
    else if (reward.kind === 'UPGRADE') this.upgradeFirstAvailableCard();
    else this.state.materials.rare = (this.state.materials.rare ?? 0) + (reward.amount ?? 1);
    return this.accept(key, 'REWARD', { rewardId });
  }

  public upgradeCard(instanceId: string, operationId?: string): OperationReceipt {
    const key = `upgrade:${operationId ?? instanceId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    const located = this.locateCard(instanceId);
    if (!located || located.pile === 'removed') return this.reject(key, 'UPGRADE', 'card unavailable');
    if (located.card.upgraded) return this.reject(key, 'UPGRADE', 'card already upgraded');
    located.card.upgraded = true;
    return this.accept(key, 'UPGRADE', { instanceId });
  }

  public removeCard(instanceId: string, operationId?: string): OperationReceipt {
    const key = `remove:${operationId ?? instanceId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    const located = this.locateCard(instanceId);
    if (!located || located.pile === 'removed') return this.reject(key, 'REMOVE', 'card unavailable');
    this.state.piles[located.pile].splice(located.index, 1);
    this.state.piles.removed.push(located.card);
    return this.accept(key, 'REMOVE', { instanceId });
  }

  public claimRewards(operationId = 'claim'): OperationReceipt {
    const key = `claim:${operationId}`;
    const duplicate = this.duplicate(key);
    if (duplicate) return duplicate;
    if (!this.state.settlement || this.state.phase !== 'VICTORY') return this.reject(key, 'CLAIM', 'nothing to claim');
    if (this.state.settlement.claimed) return this.reject(key, 'CLAIM', 'rewards already claimed');
    if (!this.state.rewards.some((reward) => reward.chosen)) return this.reject(key, 'CLAIM', 'choose a reward first');
    this.state.settlement.claimed = true;
    this.state.player.fatigue += this.state.settlement.fatigue;
    this.removeTemporaryCards();
    return this.accept(key, 'CLAIM', { settlementReceiptId: this.state.settlement.receiptId });
  }

  private checkBattleEnd(): void {
    if (this.state.settlement) return;
    if (this.state.player.hp <= 0) {
      this.state.phase = 'DEFEAT';
      this.state.settlement = { receiptId: `settle:${this.state.battleId}:defeat`, result: 'DEFEAT', claimed: false, fatigue: 0, rewardBudget: 0 };
      this.removeTemporaryCards();
      this.log('system', '战斗失败');
      return;
    }
    if (this.state.enemies.every((item) => item.hp <= 0)) {
      this.state.phase = 'VICTORY';
      const totalBudget = Math.max(0, this.state.rewardBudget + this.state.rareRewardBudget);
      this.state.settlement = {
        receiptId: `settle:${this.state.battleId}:victory`, result: 'VICTORY', claimed: false,
        fatigue: this.state.player.statuses.overclockFatigue ?? 0, rewardBudget: totalBudget,
      };
      const rare = RARE_CARDS[this.randomInt('fate', RARE_CARDS.length)];
      this.state.rewards = [
        { id: `reward:${this.state.battleId}:card`, kind: 'ADD_CARD', cardId: rare, chosen: false },
        { id: `reward:${this.state.battleId}:upgrade`, kind: 'UPGRADE', chosen: false },
        { id: `reward:${this.state.battleId}:material`, kind: 'MATERIAL', amount: Math.max(1, totalBudget), chosen: false },
      ];
      this.log('system', '战斗胜利');
    }
  }

  private checkBossPhase(target: EnemyBattleState): void {
    if (target.phase !== 1 || target.hp <= 0 || target.hp > target.maxHp * 0.5) return;
    if (target.kind !== 'MUTANT_BUG_KING' && target.kind !== 'BLAME_MANAGER') return;
    target.phase = 2;
    target.phaseTransitions += 1;
    target.statuses.poison = 0;
    target.statuses.weakness = 0;
    if (target.kind === 'MUTANT_BUG_KING') {
      target.statuses.enraged = 1;
      target.intent = { kind: 'SUMMON', amount: 4, hits: 1, target: 'SELF', detail: '召唤 Bug 并进入狂暴', revealed: true };
    } else {
      target.block = 0;
      target.statuses.deflect = 1;
      target.intent = { kind: 'DEFLECT', amount: target.attack, hits: 1, target: 'PLAYER', detail: '甩锅反弹标记与攻击', revealed: true };
    }
    this.log(target.id, `${target.name} 进入阶段二`);
  }

  private resolveEnemyIntent(foe: EnemyBattleState, intent: EnemyIntent): void {
    const attackScale = (foe.statuses.doubleAttack ?? 0) > 0 ? 2 : 1;
    const weakened = (foe.statuses.weakened ?? 0) > 0 ? 2 : 0;
    switch (intent.kind) {
      case 'ATTACK': case 'CHARGE_ATTACK': case 'DEFLECT':
        for (let index = 0; index < intent.hits; index += 1) this.takePlayerDamage(Math.max(0, (intent.amount - weakened) * attackScale), foe);
        foe.statuses.doubleAttack = 0;
        if (intent.kind === 'DEFLECT') this.state.player.statuses.blame = 1;
        break;
      case 'BLOCK': foe.block += intent.amount; break;
      case 'SPLIT': this.summon(`split-${this.state.nextLog}`, '分裂 Bug', 8, 3); break;
      case 'ENRAGE': foe.attack += intent.amount; foe.statuses.enraged = (foe.statuses.enraged ?? 0) + 1; break;
      case 'WEAKEN': this.state.player.statuses.weakness = Math.max(this.state.player.statuses.weakness ?? 0, 2); break;
      case 'POISON': this.state.player.statuses.poison = (this.state.player.statuses.poison ?? 0) + 2; this.takePlayerDamage(intent.amount, foe); break;
      case 'SUMMON':
        if (!(foe.statuses.summonCancelled ?? 0)) this.summon(`summon-${this.state.nextLog}`, '召唤 Bug', 10, 4);
        foe.statuses.summonCancelled = 0;
        if (foe.kind === 'MUTANT_BUG_KING' && foe.phase === 2) { foe.attack += 2; foe.statuses.enraged = (foe.statuses.enraged ?? 0) + 1; }
        break;
      case 'LIFESTEAL': { const dealt = this.takePlayerDamage(intent.amount, foe); foe.hp = Math.min(foe.maxHp, foe.hp + dealt); break; }
      case 'MUTATE': foe.attack += 2; foe.maxHp += 6; foe.hp += 6; foe.statuses.mutated = 1; break;
    }
  }

  private nextIntent(foe: EnemyBattleState): EnemyIntent {
    if (foe.kind === 'MUTANT_BUG_KING') {
      if (foe.phase === 2) return foe.intentIndex % 2 === 0
        ? { kind: 'SUMMON', amount: 4, hits: 1, target: 'SELF', detail: '召唤 Bug', revealed: true }
        : { kind: 'ENRAGE', amount: 2, hits: 1, target: 'SELF', detail: '狂暴：攻击 +2', revealed: true };
      return foe.intentIndex % 2 === 0
        ? { kind: 'SPLIT', amount: 0, hits: 1, target: 'SELF', detail: '分裂', revealed: true }
        : { kind: 'CHARGE_ATTACK', amount: foe.attack + 4, hits: 1, target: 'PLAYER', detail: `蓄力攻击 ${foe.attack + 4}`, revealed: true };
    }
    if (foe.kind === 'BLAME_MANAGER') {
      if (foe.phase === 2) return { kind: 'DEFLECT', amount: foe.attack, hits: 1, target: 'PLAYER', detail: '甩锅反弹攻击', revealed: true };
      return foe.intentIndex % 2 === 0
        ? { kind: 'CHARGE_ATTACK', amount: foe.attack + 5, hits: 1, target: 'PLAYER', detail: `蓄力攻击 ${foe.attack + 5}`, revealed: true }
        : { kind: 'BLOCK', amount: 8, hits: 1, target: 'SELF', detail: '获得 8 点护盾', revealed: true };
    }
    const rotation: EnemyIntentKind[] = ['ATTACK', 'BLOCK', 'WEAKEN', 'POISON', 'LIFESTEAL', 'MUTATE', 'SPLIT', 'ENRAGE', 'SUMMON', 'CHARGE_ATTACK'];
    const kind = rotation[foe.intentIndex % rotation.length];
    const self = ['BLOCK', 'SPLIT', 'ENRAGE', 'SUMMON', 'MUTATE'].includes(kind);
    const amount = kind === 'BLOCK' ? 5 : kind === 'ENRAGE' ? 2 : kind === 'POISON' ? 1 : kind === 'CHARGE_ATTACK' ? foe.attack + 4 : foe.attack;
    return { kind, amount, hits: 1, target: self ? 'SELF' : 'PLAYER', detail: `${kind} ${amount}`, revealed: true };
  }

  private takePlayerDamage(rawAmount: number, source?: EnemyBattleState): number {
    let amount = Math.max(0, Math.floor(rawAmount));
    const reduction = this.state.player.statuses.nextDamageReduction ?? 0;
    if (reduction > 0) {
      amount = Math.max(0, amount - reduction);
      this.state.player.statuses.nextDamageReduction = 0;
    }
    const blocked = Math.min(this.state.player.block, amount);
    this.state.player.block -= blocked;
    const hpDamage = Math.min(this.state.player.hp, amount - blocked);
    this.state.player.hp -= hpDamage;
    if (hpDamage > 0 && (this.state.player.statuses.reflectPercent ?? 0) > 0 && source) {
      const reflected = Math.floor(hpDamage * this.state.player.statuses.reflectPercent / 100);
      this.state.player.statuses.reflectPercent = 0;
      this.damageEnemy(source, reflected, 'reflect', 1);
    }
    this.applyNineLives();
    return hpDamage;
  }

  private loseHp(amount: number, sourceId: string): void {
    const lost = Math.min(this.state.player.hp, Math.max(0, Math.floor(amount)));
    this.state.player.hp -= lost;
    this.state.hitLog.push({ id: `hit-${this.state.nextLog++}`, sourceId, targetId: 'player', amount: lost, blocked: 0, hpDamage: lost, hitIndex: 1 });
    this.applyNineLives();
  }

  private applyNineLives(): void {
    if (this.state.player.hp > 0 || (this.state.player.statuses.nineLives ?? 0) <= 0) return;
    this.state.player.statuses.nineLives = 0;
    this.state.player.statuses.nineLivesUsed = 1;
    this.state.player.hp = Math.max(1, this.state.player.statuses.nineLivesHp ?? 1);
    this.state.player.statuses.nineLivesHp = 0;
    this.log('nine-lives', '九命牛马触发');
  }

  private gainBlock(amount: number): void { this.state.player.block += Math.max(0, Math.floor(amount)); }
  private healPlayer(amount: number): void { this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + Math.max(0, Math.floor(amount))); }
  private aliveEnemies(): EnemyBattleState[] { return this.state.enemies.filter((item) => item.hp > 0); }

  private cleansePlayer(): void {
    const negative = ['poison', 'weakness', 'blame'];
    const found = negative.find((name) => (this.state.player.statuses[name] ?? 0) > 0);
    if (found) this.state.player.statuses[found] = 0;
  }

  private removeEnemyBuff(target: EnemyBattleState): void {
    if (target.block > 0) { target.block = 0; return; }
    const positive = ['enraged', 'mutated', 'charging', 'deflect', 'doubleAttack'];
    const found = positive.find((name) => (target.statuses[name] ?? 0) > 0);
    if (found) target.statuses[found] = 0;
  }

  private removeAllEnemyBuffs(target: EnemyBattleState): void {
    target.block = 0;
    for (const name of ['enraged', 'mutated', 'charging', 'deflect', 'doubleAttack']) target.statuses[name] = 0;
  }

  private applyDangerousExperiment(upgraded: boolean): void {
    const seed = this.state.rng.fate;
    const success = this.randomInt('fate', 2) === 0;
    const value = success ? (upgraded ? 2 : 1) : (upgraded ? -2 : -4);
    if (success) this.state.player.energy += value;
    else this.loseHp(-value, 'dangerous-experiment');
    this.state.reversibleResult = { value, seed, source: 'FTE-01' };
    this.log('FTE-01', `危险实验结果 ${value}`);
  }

  private rerollLastResult(source: string): void {
    const previous = this.state.reversibleResult;
    if (!previous || !this.hasLegalReversibleEvent()) return;
    const originalValue = previous.value;
    const seed = this.state.rng.fate;
    this.revertEventResult(previous);
    const next = this.applyRerolledEventResult(previous.source, seed);
    const newValue = next.value;
    this.state.reversibleResult = { ...next, seed, source: previous.source, receiptId: previous.receiptId };
    this.state.eventLog.push({
      eventId: previous.source as EventId,
      choiceId: source.startsWith('card-') ? 'FTE-03' : 'REROLL',
      seed,
      receiptId: `reroll:${source}:${seed}`,
      result: '重掷随机结果', originalValue, newValue,
    });
  }

  private hasLegalReversibleEvent(): boolean {
    const reversible = this.state.reversibleResult;
    if (!reversible?.receiptId || !reversible.source.startsWith('EVT-')) return false;
    return this.state.eventLog.some((entry) => entry.receiptId === reversible.receiptId && entry.eventId === reversible.source);
  }

  private revertEventResult(previous: NonNullable<CardBattleState['reversibleResult']>): void {
    if (previous.source === 'EVT-06') {
      if (previous.value === 8) this.state.player.block = Math.max(0, this.state.player.block - 8);
      else this.state.player.statuses.poison = Math.max(0, (this.state.player.statuses.poison ?? 0) - 2);
      return;
    }
    if (previous.source === 'EVT-10') {
      if (previous.value > 0) this.state.player.block = Math.max(0, this.state.player.block - previous.value);
      else this.healPlayer(-previous.value);
      return;
    }
    if (previous.source === 'EVT-08') {
      if (previous.value > 0 && previous.instanceId) {
        const located = this.locateCard(previous.instanceId);
        if (located) {
          if (previous.created) {
            this.state.piles[located.pile].splice(located.index, 1);
          } else located.card.upgraded = false;
        }
      } else if (previous.targetId) {
        const target = this.state.enemies.find((item) => item.id === previous.targetId);
        if (target) { target.attack = Math.max(0, target.attack - 2); target.maxHp = Math.max(1, target.maxHp - 6); target.hp = Math.min(target.maxHp, Math.max(0, target.hp - 6)); }
      }
    }
  }

  private applyRerolledEventResult(eventId: string, seed: number): NonNullable<CardBattleState['reversibleResult']> {
    const favorable = this.randomInt('fate', 2) === 0;
    if (eventId === 'EVT-06') {
      if (favorable) { this.gainBlock(8); return { value: 8, seed, source: eventId }; }
      this.state.player.statuses.poison = (this.state.player.statuses.poison ?? 0) + 2;
      return { value: -2, seed, source: eventId };
    }
    if (eventId === 'EVT-10') {
      if (favorable) { this.gainBlock(8); return { value: 8, seed, source: eventId }; }
      const before = this.state.player.hp;
      this.loseHp(5, 'FTE-03');
      return { value: -(before - this.state.player.hp), seed, source: eventId };
    }
    const target = this.aliveEnemies()[0];
    if (favorable) {
      const existing = this.allCards().find((item) => item.temporary && !item.upgraded);
      const cardItem = existing ?? this.addCard(RARE_CARDS[this.randomInt('fate', RARE_CARDS.length)], true, true, 'discard');
      if (existing) existing.upgraded = true;
      return { value: 1, seed, source: eventId, instanceId: cardItem.instanceId, created: !existing };
    }
    if (target) { target.attack += 2; target.maxHp += 6; target.hp += 6; }
    return { value: -1, seed, source: eventId, targetId: target?.id };
  }

  private eventShieldOrPoison(source: string): string {
    const seed = this.state.rng.event;
    if (this.randomInt('event', 2) === 0) {
      this.gainBlock(8);
      this.state.reversibleResult = { value: 8, seed, source };
      return '运行代码并获得 8 点护盾';
    }
    this.state.player.statuses.poison = (this.state.player.statuses.poison ?? 0) + 2;
    this.state.reversibleResult = { value: -2, seed, source };
    return '运行代码并中毒 2 回合';
  }

  private eventTrial(source: string): string {
    const seed = this.state.rng.event;
    if (this.randomInt('event', 2) === 0) {
      const before = this.state.player.hp;
      this.loseHp(5, source);
      this.state.reversibleResult = { value: -(before - this.state.player.hp), seed, source };
      return '考验失败，失去 5 点生命';
    }
    this.gainBlock(8);
    this.state.reversibleResult = { value: 8, seed, source };
    return '考验成功，获得 8 点护盾';
  }

  private dangerousMutation(target: EnemyBattleState | undefined): string {
    const seed = this.state.rng.event;
    if (this.randomInt('event', 2) === 0) {
      const existing = this.allCards().find((item) => item.temporary && !item.upgraded);
      const cardItem = existing ?? this.addCard(RARE_CARDS[this.randomInt('fate', RARE_CARDS.length)], true, true, 'discard');
      if (existing) existing.upgraded = true;
      this.state.reversibleResult = { value: 1, seed, source: 'EVT-08', instanceId: cardItem.instanceId, created: !existing };
      return '危险实验强化临时卡';
    }
    if (target) { target.attack += 2; target.maxHp += 6; target.hp += 6; }
    this.state.reversibleResult = { value: -1, seed, source: 'EVT-08', targetId: target?.id };
    return '危险实验再次强化敌人';
  }

  private randomInt(stream: keyof CardBattleState['rng'], exclusiveMax: number): number {
    const current = this.state.rng[stream];
    this.state.rng[stream] = step(current);
    return exclusiveMax <= 1 ? 0 : current % exclusiveMax;
  }

  private shuffle(pileName: 'draw' | 'discard'): void {
    const pile = this.state.piles[pileName];
    for (let index = pile.length - 1; index > 0; index -= 1) {
      const selected = this.randomInt('draw', index + 1);
      [pile[index], pile[selected]] = [pile[selected], pile[index]];
    }
  }

  private draw(count: number): void {
    for (let index = 0; index < count; index += 1) {
      if (this.state.piles.draw.length === 0 && this.state.piles.discard.length > 0) {
        this.state.piles.draw.push(...this.state.piles.discard.splice(0));
        this.shuffle('draw');
      }
      const next = this.state.piles.draw.pop();
      if (!next) break;
      this.state.piles.hand.push(next);
    }
  }

  private addTemporaryRare(upgraded: boolean): void {
    const id = RARE_CARDS[this.randomInt('fate', RARE_CARDS.length)];
    this.addCard(id, upgraded, true, 'discard');
  }

  private addTemporaryCard(cardId: CardId, upgraded: boolean): void { this.addCard(cardId, upgraded, true, 'discard'); }

  private addCard(cardId: CardId, upgraded: boolean, temporary: boolean, pile: 'draw' | 'discard'): CardInstance {
    const instance: CardInstance = { instanceId: `card-${this.state.nextInstance++}`, cardId, upgraded, temporary };
    this.state.piles[pile].push(instance);
    return instance;
  }

  private removeTemporaryCards(): void {
    for (const pileName of PILE_NAMES) this.state.piles[pileName] = this.state.piles[pileName].filter((cardItem) => !cardItem.temporary);
  }

  private summon(id: string, name: string, hp: number, attack: number): void {
    let unique = id;
    while (this.state.enemies.some((item) => item.id === unique)) unique = `${id}-${this.state.nextLog++}`;
    this.state.enemies.push(enemy({ id: unique, kind: 'SUMMONED_BUG', name, hp, maxHp: hp, attack }));
  }

  private findCardByType(type: CardType): { card: CardInstance; pile: PileName; index: number } | undefined {
    for (const pile of ['hand', 'draw', 'discard'] as const) {
      const index = this.state.piles[pile].findIndex((item) => CARD_BY_ID.get(item.cardId)?.type === type);
      if (index >= 0) return { card: this.state.piles[pile][index], pile, index };
    }
    return undefined;
  }

  private consumeCardByType(type: CardType): void {
    const found = this.findCardByType(type);
    if (!found) return;
    this.state.piles[found.pile].splice(found.index, 1);
    this.state.piles.exhaust.push(found.card);
  }

  private upgradeFirstHandCard(): void { const cardItem = this.state.piles.hand.find((item) => !item.upgraded); if (cardItem) cardItem.upgraded = true; }
  private upgradeFirstAvailableCard(): void { const cardItem = this.allCards().find((item) => !item.upgraded && !item.temporary); if (cardItem) cardItem.upgraded = true; }
  private allCards(): CardInstance[] { return PILE_NAMES.flatMap((pile) => this.state.piles[pile]); }

  private locateCard(instanceId: string): { card: CardInstance; pile: PileName; index: number } | undefined {
    for (const pile of PILE_NAMES) {
      const index = this.state.piles[pile].findIndex((item) => item.instanceId === instanceId);
      if (index >= 0) return { card: this.state.piles[pile][index], pile, index };
    }
    return undefined;
  }

  private cardCost(definition: CardDefinition, upgraded: boolean): number {
    const reduction = upgraded && typeof definition.upgrade.cost === 'number' ? definition.upgrade.cost : 0;
    return Math.max(0, definition.cost - reduction);
  }

  private story(flag: string): void { this.state.storyFlags[flag] = true; }
  private isTerminal(): boolean { return this.state.phase === 'VICTORY' || this.state.phase === 'DEFEAT'; }
  private log(actorId: string, message: string): void { this.state.actionLog.push({ id: `log-${this.state.nextLog++}`, actorId, message }); }

  private duplicate(key: string): OperationReceipt | undefined {
    const receipt = this.state.receipts[key];
    if (!receipt) return undefined;
    return { ...copy(receipt), applied: false, reason: 'duplicate operation' };
  }

  private accept(key: string, kind: string, data?: OperationReceipt['data']): OperationReceipt {
    const receipt: OperationReceipt = { id: key, kind, applied: true, ...(data ? { data } : {}) };
    this.state.receipts[key] = copy(receipt);
    return copy(receipt);
  }

  private reject(key: string, kind: string, reason: string): OperationReceipt {
    return { id: key, kind, applied: false, reason };
  }
}
