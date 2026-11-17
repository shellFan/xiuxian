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
    | 'ATTACK_SPEED_DEBUFF' | 'HP_DRAIN' | 'PROMOTE_MINION' | 'DODGE' | 'BLIND' | 'RANDOM'
    // ── V10.1 Boss 独特战术（卡牌战斗回合化） ──
    | 'JUDGE'        // 绩效审判：蓄力一回合，窗口期内被打掉足量 HP 则被打断
    | 'COST_CURSE'   // 需求费率上调：玩家下一手手牌费用 +N
    | 'MORALE_DRAIN' // 加班磨蚀：玩家获得虚弱，Boss 自愈（逼迫快攻或稳健抉择）
    // ── V10 ULTIMATE 五种新 Boss 机制（回合化） ──
    | 'ENERGY_LEECH'          // 资源吞噬：抽走玩家能量并转化为自身护盾
    | 'MIRROR'                // 代码心魔：复制玩家最近打出的卡牌反噬
    | 'COUNTER_STANCE'        // 绩效判官：按玩家上回合攻防行为反制
    | 'TRIBULATION_COUNTDOWN' // 天劫倒计时：每 N 回合引爆一次重击
  readonly everySec?: number;
  readonly minion?: string;
  readonly cap?: number;
  readonly mulPerTick?: number;
  readonly mul?: number;
  readonly hpPct?: number;
  readonly reviveHpPct?: number;
  readonly amount?: number;
  readonly durationSec?: number;
  /** JUDGE：打断所需伤害（占 Boss 最大生命比例；缺省 0.1）。 */
  readonly interruptHpPct?: number;
  /** JUDGE：审判命中的攻击倍率（缺省 2.5）。 */
  readonly judgeDamageMul?: number;
  /** COST_CURSE：下一手手牌费用 +N（缺省 1）。 */
  readonly costDelta?: number;
  /** ENERGY_LEECH：抽取玩家能量点数（缺省 1）。 */
  readonly energyDrain?: number;
  /** ENERGY_LEECH：转化为护盾的比例（占 Boss 最大生命，缺省 0.03）。 */
  readonly shieldPct?: number;
  /** MIRROR：复制玩家卡牌伤害倍率的缩放（缺省 1）。 */
  readonly mirrorScale?: number;
  /** COUNTER_STANCE：判定「龟缩」的格挡门槛（缺省 10）。 */
  readonly blockGate?: number;
  /** TRIBULATION_COUNTDOWN：引爆倒计时回合数（缺省 4）。 */
  readonly everyTurns?: number;
  /** TRIBULATION_COUNTDOWN：引爆攻击倍率（缺省 2.5）。 */
  readonly strikeDamageMul?: number;
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

/**
 * V5.8 装备词条联动：技能流派 tag（AffixEffects.skillTagMul 消费端）。
 * 词条如"JVM技能 +8%"只增幅携带对应 tag 的技能。tag 由技能 id 派生（升级/进化
 * 与 base 同流派），无需在 84 条技能配置上逐条维护。
 */
const SKILL_TAG_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['JVM', /^(skill_gc|pass_jit_warmup|pass_gc_tuning|pass_bytecode)/],
  ['DBA', /^(skill_index_sword|skill_index_composite|skill_sql_optimize|pass_index_cache)/],
  ['REDIS', /^(skill_cache_shield|pass_cache_first)/],
  ['CONCURRENT', /^(skill_thread_clone|skill_thread_pool|skill_dist_lock|pass_thread_isolation)/],
  ['SPRING', /^(skill_aop_array)/],
  ['TX', /^(skill_tx_shield|skill_saga_shield)/],
  ['PIXEL', /^(skill_css_array|pass_pixel_eye|pass_virtual_dom|pass_responsive)/],
  ['DEVTOOLS', /^(skill_devtools|skill_sourmap_eye|pass_devtools_panel|pass_typescript)/],
  ['PERF', /^(skill_lazy_load|skill_tree_shake|skill_bundle_split|pass_hot_reload)/],
  ['COMPAT', /^(skill_polyfill|pass_semver)/],
  ['BUILD', /^(skill_hot_fix)/],
  ['AUTOMATION', /^(skill_auto_script|pass_parallel_run|pass_automation)/],
  ['BOUNDARY', /^(skill_boundary_eye|pass_suspicion)/],
  ['REGRESSION', /^(skill_regression_wave|pass_repro_steps|pass_checklist)/],
  ['STRESS', /^(skill_stress_storm|pass_risk_sense)/],
  ['MOCK', /^(skill_mock_seal)/],
  ['EVIDENCE', /^(skill_test_report|pass_evidence_chain|pass_quality_gate)/],
  ['K8S', /^(skill_k8s_swarm|pass_oncall)/],
  ['NGINX', /^(skill_nginx_proxy|skill_nginx_cluster)/],
  ['MONITOR', /^(skill_log_eye|skill_prometheus|pass_monitoring|pass_infra_as_code)/],
  ['CONTAINER', /^(skill_docker_clone|pass_capacity)/],
  ['DR', /^(skill_circuit_break|pass_redundancy|pass_backup_habit|pass_calm_night)/],
];

/** 技能的流派 tag（未命中任何流派时为 null）。 */
export function skillTagOf(skillId: string): string | null {
  for (const [tag, pattern] of SKILL_TAG_PATTERNS) {
    if (pattern.test(skillId)) return tag;
  }
  return null;
}
