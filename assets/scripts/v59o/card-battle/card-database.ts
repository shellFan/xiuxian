/**
 * V5.9-O.2 卡牌数据库：加载 assets/configs/v59o/card-battle.json，
 * 校验（启动即抛错）、生成升级链（card_x_up1/_up2）、构建牌组与奖励池。
 *
 * 数据驱动（§12）：卡牌全部定义在 JSON；本文件只做结构与关系校验，
 * 不写任何具体卡牌效果分支（效果解释在 card-engine.applyEffect）。
 */
import cardConfig from '../../../configs/v59o/card-battle.json';
import {
  type CardDef,
  type CardEffect,
  type CardInstance,
  type CardRarity,
  type CardTargetMode,
  type CardType,
  type StatusId,
} from './card-types';
import { installCardDefResolver, upgradeId } from './card-engine';

export const CARD_BATTLE_CONFIG = cardConfig;

const VALID_TYPES: readonly CardType[] = ['ATTACK', 'DEFENSE', 'SKILL', 'PROFESSION', 'FATE', 'SPECIAL'];
const VALID_RARITIES: readonly CardRarity[] = ['BASIC', 'COMMON', 'RARE', 'EPIC'];
const VALID_TARGETS: readonly CardTargetMode[] = ['ENEMY', 'ALL_ENEMIES', 'SELF'];
const VALID_STATUS: readonly StatusId[] = ['STRENGTH', 'WEAK', 'VULNERABLE', 'DODGE', 'BLIND', 'POISON', 'REGEN', 'COST_DOWN', 'INTANGIBLE'];
export const OPEN_PROFESSIONS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'] as const;
export const FATE_IDS = ['LABOR_SAINT', 'KING_OF_GRIND', 'FISHING_IMMORTAL', 'SCAPEGOAT', 'CODE_SPIRIT', 'SOCIAL_FATE'] as const;

// ── 校验与展开 ───────────────────────────────────────────────────────────────

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`[card-battle.json] ${message}`);
}

function validateEffects(effects: readonly CardEffect[], context: string): void {
  assert(Array.isArray(effects) && effects.length > 0, `${context}: effects 不能为空`);
  for (const effect of effects) {
    switch (effect.kind) {
      case 'DAMAGE':
        assert(typeof effect.mul === 'number' && effect.mul > 0, `${context}: DAMAGE.mul 必须为正数`);
        break;
      case 'BLOCK':
      case 'HEAL':
        assert(typeof effect.flat === 'number' && effect.flat >= 0, `${context}: ${effect.kind}.flat 必须非负`);
        break;
      case 'DRAW':
      case 'ENERGY':
        assert(typeof effect.count === 'number' || typeof effect.delta === 'number', `${context}: ${effect.kind} 数值缺失`);
        break;
      case 'APPLY_STATUS':
        assert(VALID_STATUS.includes(effect.status), `${context}: 未知状态 ${String(effect.status)}`);
        assert(typeof effect.stacks === 'number' && effect.stacks > 0, `${context}: APPLY_STATUS.stacks 必须为正`);
        break;
      case 'REMOVE_STATUS':
        assert(VALID_STATUS.includes(effect.status), `${context}: 未知状态 ${String(effect.status)}`);
        break;
      case 'ADD_CARD_TO_HAND':
        assert(typeof effect.cardId === 'string' && effect.cardId.length > 0, `${context}: ADD_CARD_TO_HAND.cardId 缺失`);
        break;
      case 'CONDITIONAL':
        assert(Array.isArray(effect.then) && effect.then.length > 0, `${context}: CONDITIONAL.then 缺失`);
        validateEffects(effect.then, `${context}.then`);
        if (effect.otherwise) validateEffects(effect.otherwise, `${context}.otherwise`);
        break;
      case 'DISCARD_HAND':
        break;
      default:
        throw new Error(`[card-battle.json] ${context}: 未知效果 ${JSON.stringify(effect)}`);
    }
  }
}

interface RawCard {
  id: string;
  name: string;
  desc: string;
  type: CardType;
  rarity: CardRarity;
  cost: number;
  target: CardTargetMode;
  effects?: readonly CardEffect[];
  profession?: string;
  sect?: string;
  fate?: string;
  exhaust?: boolean;
  retain?: boolean;
  rewardable?: boolean;
  unplayable?: boolean;
  upgrades?: { name: string; desc: string; cost: number; effects: readonly CardEffect[] }[];
}

function finalize(raw: RawCard, override: Partial<RawCard> | null, idSuffix: string, upgradeTo: string | undefined): CardDef {
  const merged: RawCard = override ? { ...raw, ...override } : raw;
  const id = override ? `${raw.id}${idSuffix}` : raw.id;
  assert(VALID_TYPES.includes(merged.type), `${id}: 非法类型 ${String(merged.type)}`);
  assert(VALID_RARITIES.includes(merged.rarity), `${id}: 非法稀有度 ${String(merged.rarity)}`);
  assert(VALID_TARGETS.includes(merged.target), `${id}: 非法目标 ${String(merged.target)}`);
  assert(typeof merged.cost === 'number' && merged.cost >= 0 && merged.cost <= 5, `${id}: 费用必须 0-5`);
  assert(!merged.profession || OPEN_PROFESSIONS.includes(merged.profession as (typeof OPEN_PROFESSIONS)[number]), `${id}: 非法职业 ${String(merged.profession)}`);
  assert(!merged.fate || FATE_IDS.includes(merged.fate as (typeof FATE_IDS)[number]), `${id}: 非法命格 ${String(merged.fate)}`);
  if (!merged.unplayable) validateEffects(merged.effects ?? [], id);
  return {
    id,
    name: merged.name,
    desc: merged.desc,
    type: merged.type,
    rarity: merged.rarity,
    cost: merged.cost,
    target: merged.target,
    effects: merged.effects ?? [],
    profession: merged.profession,
    sect: merged.sect,
    exhaust: merged.exhaust,
    retain: merged.retain,
    rewardable: merged.rewardable,
    unplayable: merged.unplayable,
    upgradeTo,
  };
}

const CARD_MAP = new Map<string, CardDef>();
{
  const seen = new Set<string>();
  for (const raw of cardConfig.cards as RawCard[]) {
    assert(typeof raw.id === 'string' && raw.id.length > 0, '卡牌 id 缺失');
    assert(!seen.has(raw.id), `重复卡牌 id：${raw.id}`);
    seen.add(raw.id);
    // 升级链：base → _up1 → _up2（链上逐级 upgradeTo）。
    const levels = raw.upgrades ?? [];
    let nextUpgrade: string | undefined = undefined;
    for (let i = levels.length - 1; i >= 0; i -= 1) {
      const id = upgradeId(raw.id, i + 1);
      const def = finalize(raw, { ...levels[i]!, effects: levels[i]!.effects }, `_up${i + 1}`, nextUpgrade);
      // 等级与名称脱节校验：+N 名称必须包含 "+N"
      assert(def.name.includes(`+${i + 1}`), `${id}: 升级版名称应包含 +${i + 1}`);
      CARD_MAP.set(id, def);
      nextUpgrade = id;
    }
    CARD_MAP.set(raw.id, finalize(raw, null, '', levels.length > 0 ? upgradeId(raw.id, 1) : undefined));
  }
  // 交叉引用：ADD_CARD_TO_HAND 的临时牌必须存在且可打出。
  for (const def of CARD_MAP.values()) {
    for (const effect of def.effects) {
      if (effect.kind === 'ADD_CARD_TO_HAND') {
        const target = CARD_MAP.get(effect.cardId);
        assert(target, `${def.id}: 临时牌 ${effect.cardId} 未定义`);
        assert(!target.unplayable, `${def.id}: 临时牌 ${effect.cardId} 不可为状态/诅咒牌`);
      }
    }
  }
}

/** 升级素材费用（按稀有度，消耗灵石）。 */
export function upgradeCost(rarity: CardRarity): number {
  return (cardConfig.upgradeCosts as Record<CardRarity, number>)[rarity] ?? 30;
}

/** 卡牌最大升级等级（0 = 不可升级）。 */
export function maxUpgradeLevel(defId: string): number {
  if (!CARD_MAP.has(defId)) return 0;
  return countUpgrades(defId);
}

function countUpgrades(defId: string): number {
  let count = 0;
  let cursor = CARD_MAP.get(defId);
  while (cursor?.upgradeTo) {
    count += 1;
    cursor = CARD_MAP.get(cursor.upgradeTo);
  }
  return count;
}

export function cardDefById(defId: string): CardDef | undefined {
  return CARD_MAP.get(defId);
}

/** 数据库诊断（EXE 环境自检：加载条目数与异常键）。 */
export function databaseDebug(): {
  size: number; sampleKeys: unknown[]; badIdKeys: string[]; rules: ReturnType<typeof battleRules>;
  firstKeyString: string; firstKeyCtor: string; firstDef: string; cardsIsArray: boolean; cardsLen: number;
} {
  const badIdKeys: string[] = [];
  for (const [key, def] of CARD_MAP) {
    if (!def || typeof def.id !== 'string') badIdKeys.push(String(key));
  }
  const firstKey = CARD_MAP.keys().next().value;
  const firstDef = firstKey !== undefined ? CARD_MAP.get(firstKey) : undefined;
  return {
    size: CARD_MAP.size,
    sampleKeys: Array.from(CARD_MAP.keys()).slice(0, 5),
    badIdKeys: badIdKeys.slice(0, 5),
    rules: battleRules(),
    firstKeyString: String(firstKey).slice(0, 40),
    firstKeyCtor: firstKey !== null && firstKey !== undefined ? ((firstKey as unknown as { constructor?: { name?: string } }).constructor?.name ?? 'null-proto') : 'none',
    firstDef: JSON.stringify(firstDef ?? null).slice(0, 100),
    cardsIsArray: Array.isArray((cardConfig as unknown as { cards?: unknown }).cards),
    cardsLen: Array.isArray((cardConfig as unknown as { cards?: unknown[] }).cards) ? (cardConfig as unknown as { cards: unknown[] }).cards.length : -1,
  };
}

export function allCardDefs(): readonly CardDef[] {
  return Array.from(CARD_MAP.values());
}

/** 实例 → 当前等级定义（升级实例解析到对应 _upN 定义）。 */
export function resolveCardDef(instance: CardInstance): CardDef {
  const id = instance.upgraded > 0 ? upgradeId(instance.defId, instance.upgraded) : instance.defId;
  const def = CARD_MAP.get(id) ?? CARD_MAP.get(instance.defId);
  if (!def) throw new Error(`未知卡牌：${instance.defId}(${instance.upgraded})`);
  return def;
}

// ── 牌组构建 ─────────────────────────────────────────────────────────────────

export interface DeckBuildInput {
  professionId: string;
  destinyId: string | null;
  /** 跨战斗收藏（卡牌定义 id → 数量）。 */
  collection: Record<string, number>;
  /** 升级等级（卡牌定义 id → 等级）。 */
  upgrades: Record<string, number>;
}

export interface DeckBuildResult {
  /** 牌组定义 id → 数量（含基础卡组）。 */
  manifest: Record<string, number>;
  /** 新加入本战的收藏卡（相对上一场，诊断用）。 */
  total: number;
}

/** 组建战斗卡组：基础攻击 5 + 基础防御 4 + 职业特色 1 + 命格卡 1 + 收藏卡（§14）。 */
export function buildDeckManifest(input: DeckBuildInput): DeckBuildResult {
  const template = cardConfig.deckTemplate;
  const manifest: Record<string, number> = {};
  const add = (id: string, count: number) => {
    assert(CARD_MAP.has(id), `牌组引用了未定义的卡牌 ${id}`);
    manifest[id] = (manifest[id] ?? 0) + count;
  };
  add(template.basicAttack, template.basicAttackCount);
  add(template.basicDefense, template.basicDefenseCount);
  const profCard = (template.professionBasic as Record<string, string>)[input.professionId];
  assert(profCard, `职业 ${input.professionId} 没有基础职业卡`);
  add(profCard, 1);
  if (input.destinyId) {
    const fateCard = (template.fateCard as Record<string, string>)[input.destinyId];
    if (fateCard) add(fateCard, 1);
  }
  for (const [id, count] of Object.entries(input.collection)) {
    const def = CARD_MAP.get(id);
    if (!def) continue; // 未知收藏卡（配置回退）不阻塞开局
    if (def.unplayable) continue; // 状态/诅咒牌不进收藏
    add(id, count);
  }
  const total = Object.values(manifest).reduce((s, n) => s + n, 0);
  return { manifest, total };
}

export interface StarterDeckInput {
  professionId: string;
  destinyId: string | null;
  upgrades: Record<string, number>;
}

/** 新玩家初始收藏：空（基础卡组即全部）。 */
export function emptyCollection(): Record<string, number> {
  return {};
}

// ── 奖励池 ───────────────────────────────────────────────────────────────────

/** 可作为奖励的卡池（职业过滤 + 可奖励标记）。 */
export function rewardPool(professionId: string, sectId: string | null): CardDef[] {
  return Array.from(CARD_MAP.values()).filter((def) => {
    if (!def.rewardable) return false;
    if (def.profession && def.profession !== professionId) return false;
    if (def.sect && def.sect !== sectId) return false;
    return true;
  });
}

export function rewardWeights(): { COMMON: number; RARE: number; EPIC: number; professionCardChance: number; candidates: number } {
  return cardConfig.rewardWeights;
}

/** 规则常量（能量/抽牌/手牌）。 */
export function battleRules(): { baseEnergy: number; drawPerTurn: number; handLimit: number; openingHandSize: number } {
  return cardConfig.rules;
}

/** 供引擎的实例解析器安装（服务层启动时调用一次）。 */
export function installEngineResolver(): void {
  installCardDefResolver(resolveCardDef);
}
