import battleConfig from '../../configs/v3/battle-content.json';
import battleExtension from '../../configs/v57/battle-extension.json';

/**
 * V5.7 — 战斗内容合并层。
 * base battle-content.json（V4~V5.6 通用内容）+ v57/battle-extension.json（职业分家内容）。
 * 合并规则：v57 条目优先（同 id 覆盖），Boss 机制/进化/共鸣仅存在于 v57。
 */

export type MonsterTier = 'NORMAL' | 'ELITE' | 'BOSS';

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly tier: MonsterTier;
  readonly hp: number;
  readonly attack: number;
  readonly intervalSec: number;
  readonly exp: number;
  /** V5.6 兼容单机制。 */
  readonly mechanic?: 'SLOW' | 'SUMMON' | 'SUMMON_SMALL' | 'RANDOM';
  /** V5.7 死锁双尊：成对出现。 */
  readonly twin?: boolean;
}

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly kind?: 'ACTIVE' | 'PASSIVE';
  readonly profession?: string;
  readonly damageMul?: number;
  readonly intervalMul?: number;
  readonly shieldBonus?: number;
  readonly healPerKill?: number;
  readonly critBonus?: number;
  readonly damageReduce?: number;
  readonly enemySlow?: number;
  readonly dodgeBonus?: number;
  readonly shieldPerWave?: number;
  readonly aoe?: boolean;
  readonly evolvesTo?: string | null;
}

export interface BuildDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly baseHp: number;
  readonly baseAttack: number;
  readonly intervalSec: number;
  readonly startSkill: string;
  readonly critChance: number;
  readonly lootBonus: number;
  readonly profession?: string;
}

/** 进化选项效果词表（二选一，行为分叉，非数值 +10%）。 */
export interface EvolutionOptionEffects {
  readonly damageMulDelta?: number;
  readonly intervalMulDelta?: number;
  readonly critBonus?: number;
  readonly damageReduceDelta?: number;
  readonly shieldPerWave?: number;
  readonly healPerKill?: number;
  readonly executePct?: number;
  readonly dodgeBonus?: number;
  readonly enemySlowDelta?: number;
  readonly summonCapBonus?: number;
  readonly aoe?: boolean;
  readonly aoeKeep?: boolean;
}

export interface EvolutionOption {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly effects: EvolutionOptionEffects;
}

export interface EvolutionDef {
  readonly id: string;
  readonly baseSkillId: string;
  readonly options: readonly EvolutionOption[];
}

export interface SynergyEffects extends EvolutionOptionEffects {
  readonly maxHpBonus?: number;
  readonly immuneEverySec?: number;
  readonly reviveOnce?: boolean;
  readonly lootBonusDelta?: number;
}

export interface SynergyDef {
  readonly id: string;
  readonly name: string;
  readonly profession: string;
  readonly desc: string;
  readonly requires: {
    readonly skills?: readonly string[];
    readonly buildIds?: readonly string[];
    readonly equipmentTags?: readonly string[];
  };
  readonly effects: SynergyEffects;
}

export interface BossMechanic {
  readonly kind:
    | 'SUMMON' | 'RAGE' | 'ENRAGE' | 'LINKED' | 'REVIVE' | 'LOCK_SKILL'
    | 'ATTACK_SPEED_DEBUFF' | 'HP_DRAIN' | 'PROMOTE_MINION' | 'DODGE' | 'BLIND' | 'RANDOM';
  readonly everySec?: number;
  readonly minion?: string;
  readonly cap?: number;
  readonly mulPerTick?: number;
  readonly mul?: number;
  readonly hpPct?: number;
  readonly reviveHpPct?: number;
  readonly amount?: number;
  readonly durationSec?: number;
}

/** V5.8 §14.2：Boss Phase 2（HP 阈值触发，行为真实改变）。 */
export interface BossPhase2Def {
  readonly atHpPct: number;
  readonly name: string;
  readonly telegraph: string;
  readonly attackMul?: number;
  readonly intervalMul?: number;
  readonly summonEverySec?: number;
  readonly capBonus?: number;
  readonly blindEverySec?: number;
  readonly dodgeEverySec?: number;
  readonly lockSkillEverySec?: number;
  readonly hpDrainEverySec?: number;
  readonly promoteEverySec?: number;
  readonly debuffPlayerInterval?: number;
}

export interface BossMechanicDef {
  readonly telegraph: string;
  readonly mechanics: readonly BossMechanic[];
  readonly exclusiveDrop: { readonly equipmentId: string; readonly dropChance: number; readonly pityAt: number };
  readonly phase2?: BossPhase2Def;
}

interface BaseBundle {
  builds: BuildDef[];
  monsters: MonsterDef[];
  skills: SkillDef[];
  lootTable: Record<MonsterTier, { materialChance: number; equipmentChance: number; spiritStones: [number, number] }>;
  lootMaterials: string[];
  lootEquipment: string[];
  waves: { count: number; tiers: MonsterTier[] }[];
}

const base = battleConfig as unknown as BaseBundle;
const ext = battleExtension as unknown as {
  monsters: MonsterDef[];
  builds: BuildDef[];
  skills: SkillDef[];
  evolutions: EvolutionDef[];
  synergies: SynergyDef[];
  bossMechanics: Record<string, BossMechanicDef>;
};

function mergeById<T extends { id: string }>(baseList: T[], extList: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of baseList) map.set(item.id, item);
  for (const item of extList) map.set(item.id, item);
  return Array.from(map.values());
}

export const ALL_MONSTERS: readonly MonsterDef[] = mergeById(base.monsters, ext.monsters);
export const ALL_SKILLS: readonly SkillDef[] = mergeById(base.skills, ext.skills);
export const ALL_BUILDS: readonly BuildDef[] = mergeById(base.builds, ext.builds);

export const MONSTER_MAP: ReadonlyMap<string, MonsterDef> = new Map(ALL_MONSTERS.map((m) => [m.id, m]));
export const SKILL_MAP: ReadonlyMap<string, SkillDef> = new Map(ALL_SKILLS.map((s) => [s.id, s]));
export const BUILD_MAP: ReadonlyMap<string, BuildDef> = new Map(ALL_BUILDS.map((b) => [b.id, b]));

export const EVOLUTIONS: readonly EvolutionDef[] = ext.evolutions;
export const EVOLUTION_MAP: ReadonlyMap<string, EvolutionDef> = new Map(EVOLUTIONS.map((e) => [e.id, e]));
export const EVOLUTION_OPTIONS: ReadonlyMap<string, EvolutionOption> = new Map(
  EVOLUTIONS.flatMap((e) => e.options).map((o) => [o.id, o]),
);
export const EVOLUTIONS_BY_BASE: ReadonlyMap<string, EvolutionDef> = new Map(EVOLUTIONS.map((e) => [e.baseSkillId, e]));

export const SYNERGIES: readonly SynergyDef[] = ext.synergies;
export const BOSS_MECHANICS: ReadonlyMap<string, BossMechanicDef> = new Map(Object.entries(ext.bossMechanics));

export const LOOT_TABLE = base.lootTable;
export const LOOT_MATERIALS: readonly string[] = base.lootMaterials;
export const LOOT_EQUIPMENT: readonly string[] = base.lootEquipment;
export const WAVES = base.waves;

export function evolutionForBase(baseSkillId: string): EvolutionDef | undefined {
  return EVOLUTIONS_BY_BASE.get(baseSkillId);
}

export function bossMechanicsFor(defId: string): BossMechanicDef | undefined {
  return BOSS_MECHANICS.get(defId);
}
