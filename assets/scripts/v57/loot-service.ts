import equipmentContent from '../../configs/v57/equipment-content.json';
import battleExtension from '../../configs/v57/battle-extension.json';
import { EQUIPMENT_MAP as BASE_EQUIPMENT_MAP } from '../v2/v2-item-service';
import type { GameContext } from '../core/game-context';

/**
 * V5.7 Phase D — Loot / 装备追求。
 * 装备 = 基础 modifiers + Affix 词缀 + 套装。战斗/工作两端消费。
 * Boss 专属掉落带轻量保底（pity），不走抽卡界面。
 */

export interface AffixEffects {
  readonly atkMul?: number;
  readonly critBonus?: number;
  readonly aspdMul?: number;
  readonly maxHpBonus?: number;
  readonly shieldBonus?: number;
  readonly lootBonus?: number;
  readonly dodgeBonus?: number;
  readonly taskEfficiency?: number;
  readonly professionExpBonus?: number;
  readonly evidenceBonus?: number;
  /** [装备Tag, 增幅]：对应流派技能伤害提升。 */
  readonly skillTagMul?: readonly [string, number];
}

export interface AffixDef {
  readonly id: string;
  readonly name: string;
  readonly profession?: string;
  readonly effects: AffixEffects;
}

export interface SetBonusEffects {
  readonly atkMul?: number;
  readonly critBonus?: number;
  readonly aspdMul?: number;
  readonly maxHpBonus?: number;
  readonly shieldBonus?: number;
  readonly lootBonus?: number;
  readonly dodgeBonus?: number;
  readonly damageReduce?: number;
  readonly intervalMulDelta?: number;
  readonly healPerKill?: number;
  readonly executePct?: number;
  readonly aoe?: boolean;
  readonly reviveOnce?: boolean;
  readonly immuneEverySec?: number;
  readonly summonCapBonus?: number;
  readonly taskEfficiency?: number;
  readonly mindRecoveryMul?: number;
  readonly fatigueGainMul?: number;
  readonly professionExpBonus?: number;
  readonly performanceRisk?: number;
  readonly incidentRiskMul?: number;
}

export interface SetBonus {
  readonly count: number;
  readonly desc: string;
  readonly effects: SetBonusEffects;
}

export interface SetDef {
  readonly id: string;
  readonly name: string;
  readonly profession?: string;
  readonly members: readonly string[];
  readonly bonuses: readonly SetBonus[];
}

export interface LootEquipmentDef {
  readonly id: string;
  readonly name: string;
  readonly rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  readonly slot: 'DESK' | 'BADGE' | 'ACCESSORY';
  readonly profession?: string;
  readonly tag?: string;
  readonly set?: string;
  readonly bossDrop?: string;
  readonly description: string;
  readonly modifiers: Record<string, number>;
  readonly affixes?: readonly string[];
}

export interface Bundle {
  readonly affixes: readonly AffixDef[];
  readonly equipment: readonly LootEquipmentDef[];
  readonly sets: readonly SetDef[];
}

const bundle = equipmentContent as unknown as Bundle;

export const V57_AFFIXES: readonly AffixDef[] = bundle.affixes;
export const V57_EQUIPMENT: readonly LootEquipmentDef[] = bundle.equipment;
export const V57_SETS: readonly SetDef[] = bundle.sets;
export const AFFIX_MAP: ReadonlyMap<string, AffixDef> = new Map(V57_AFFIXES.map((a) => [a.id, a]));
export const SET_MAP: ReadonlyMap<string, SetDef> = new Map(V57_SETS.map((s) => [s.id, s]));

export const RARITY_CN: Record<string, string> = {
  COMMON: '凡品', UNCOMMON: '良品', RARE: '上品', EPIC: '极品', LEGENDARY: '仙品',
};

/** v2 装备 + v57 职业装备合并视图（v2 定义同样可带 affixes 字段的读取尝试）。 */
export function allEquipmentDefs(): LootEquipmentDef[] {
  const baseDefs = Array.from(BASE_EQUIPMENT_MAP.values()) as unknown as LootEquipmentDef[];
  return [...V57_EQUIPMENT, ...baseDefs];
}

export function equipmentDef(id: string): LootEquipmentDef | undefined {
  return V57_EQUIPMENT.find((e) => e.id === id) ?? (BASE_EQUIPMENT_MAP.get(id) as LootEquipmentDef | undefined);
}

/** v57 专属装备 id 集合（图鉴/掉落过滤用）。 */
export function isV57Equipment(id: string): boolean {
  return V57_EQUIPMENT.some((e) => e.id === id);
}

/** 战斗属性聚合（装备维度）。 */
export interface EquipmentBattleStats {
  atkMul: number;
  aspdMul: number;
  critBonus: number;
  maxHpBonus: number;
  shieldBonus: number;
  dodgeBonus: number;
  lootBonus: number;
  damageReduce: number;
  intervalMulDelta: number;
  executePct: number;
  aoe: boolean;
  reviveOnce: boolean;
  immuneEverySec: number;
  healPerKill: number;
  summonCapBonus: number;
}

/** 工作属性聚合（装备维度）。 */
export interface EquipmentWorkStats {
  taskEfficiency: number;
  professionExpBonus: number;
  mindRecoveryMul: number;
  fatigueGainMul: number;
  performanceRisk: number;
  incidentRiskMul: number;
  evidenceBonus: number;
}

function emptyBattle(): EquipmentBattleStats {
  return { atkMul: 0, aspdMul: 0, critBonus: 0, maxHpBonus: 0, shieldBonus: 0, dodgeBonus: 0, lootBonus: 0, damageReduce: 0, intervalMulDelta: 0, executePct: 0, aoe: false, reviveOnce: false, immuneEverySec: 0, healPerKill: 0, summonCapBonus: 0 };
}

function emptyWork(): EquipmentWorkStats {
  return { taskEfficiency: 0, professionExpBonus: 0, mindRecoveryMul: 1, fatigueGainMul: 1, performanceRisk: 0, incidentRiskMul: 1, evidenceBonus: 0 };
}

export class LootService {
  public constructor(private readonly context: GameContext) {}

  public owned(): string[] {
    return this.context.player.ownedEquipment ?? [];
  }

  /** 持有装备携带的 Tag 集合（Synergy equipmentTags 判定用）。 */
  public ownedTags(): Set<string> {
    const tags = new Set<string>();
    for (const id of this.owned()) {
      const def = equipmentDef(id);
      if (def && 'tag' in def && def.tag) tags.add(def.tag as string);
    }
    return tags;
  }

  /** 套装已激活档位（count members owned）。 */
  public activeSetCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    const owned = new Set(this.owned());
    for (const set of V57_SETS) {
      const n = set.members.filter((m) => owned.has(m)).length;
      if (n > 0) counts.set(set.id, n);
    }
    return counts;
  }

  /** 装备维度的战斗聚合：affixes + 套装 bonus（按持有件数激活档位）。 */
  public battleStats(): EquipmentBattleStats {
    const agg = emptyBattle();
    for (const id of this.owned()) {
      const def = equipmentDef(id);
      if (!def) continue;
      this.applyModifiers(agg, def.modifiers ?? {});
      for (const affixId of (def as LootEquipmentDef).affixes ?? []) {
        const affix = AFFIX_MAP.get(affixId);
        if (!affix) continue;
        this.applyModifiers(agg, affix.effects as Record<string, unknown>);
      }
    }
    const counts = this.activeSetCounts();
    for (const [setId, n] of counts) {
      const set = SET_MAP.get(setId);
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (n >= bonus.count) this.applyModifiers(agg, bonus.effects as Record<string, unknown>);
      }
    }
    return agg;
  }

  /** 装备维度的工作聚合。 */
  public workStats(): EquipmentWorkStats {
    const agg = emptyWork();
    for (const id of this.owned()) {
      const def = equipmentDef(id);
      if (!def) continue;
      const all: Record<string, unknown> = { ...(def.modifiers ?? {}) };
      for (const affixId of (def as LootEquipmentDef).affixes ?? []) {
        const affix = AFFIX_MAP.get(affixId);
        if (affix) Object.assign(all, affix.effects);
      }
      agg.taskEfficiency += (all.taskEfficiency as number) ?? 0;
      agg.professionExpBonus += (all.professionExpBonus as number) ?? 0;
      agg.evidenceBonus += (all.evidenceBonus as number) ?? 0;
      if (all.mindRecoveryMul) agg.mindRecoveryMul *= all.mindRecoveryMul as number;
      if (all.fatigueGainMul) agg.fatigueGainMul *= all.fatigueGainMul as number;
      agg.performanceRisk += (all.performanceRisk as number) ?? 0;
      if (all.incidentRiskMul) agg.incidentRiskMul *= all.incidentRiskMul as number;
    }
    const counts = this.activeSetCounts();
    for (const [setId, n] of counts) {
      const set = SET_MAP.get(setId);
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (n < bonus.count) continue;
        const e = bonus.effects as Record<string, unknown>;
        agg.taskEfficiency += (e.taskEfficiency as number) ?? 0;
        agg.professionExpBonus += (e.professionExpBonus as number) ?? 0;
        if (e.mindRecoveryMul) agg.mindRecoveryMul *= e.mindRecoveryMul as number;
        if (e.fatigueGainMul) agg.fatigueGainMul *= e.fatigueGainMul as number;
        agg.performanceRisk += (e.performanceRisk as number) ?? 0;
        if (e.incidentRiskMul) agg.incidentRiskMul *= e.incidentRiskMul as number;
      }
    }
    return agg;
  }

  private applyModifiers(agg: EquipmentBattleStats, mods: Record<string, unknown>): void {
    agg.atkMul += (mods.atkMul as number) ?? 0;
    agg.aspdMul += (mods.aspdMul as number) ?? 0;
    agg.critBonus += (mods.critChance as number) ?? (mods.critBonus as number) ?? 0;
    agg.maxHpBonus += (mods.maxHpBonus as number) ?? 0;
    agg.shieldBonus += (mods.shield as number) ?? (mods.shieldBonus as number) ?? 0;
    agg.dodgeBonus += (mods.dodge as number) ?? (mods.dodgeBonus as number) ?? 0;
    agg.lootBonus += (mods.lootBonus as number) ?? 0;
    agg.damageReduce += (mods.damageReduce as number) ?? 0;
    agg.intervalMulDelta += (mods.intervalMulDelta as number) ?? 0;
    agg.executePct = Math.max(agg.executePct, (mods.executePct as number) ?? 0);
    agg.aoe = agg.aoe || mods.aoe === true;
    agg.reviveOnce = agg.reviveOnce || mods.reviveOnce === true;
    agg.immuneEverySec = Math.max(agg.immuneEverySec, (mods.immuneEverySec as number) ?? 0);
    agg.healPerKill += (mods.healPerKill as number) ?? 0;
    agg.summonCapBonus += (mods.summonCapBonus as number) ?? 0;
  }

  /** Boss 专属掉落掷骰（含轻量保底）。 */
  public rollBossDrop(bossId: string, rng: () => number): { equipmentId: string; viaPity: boolean } | null {
    const meta = this.bossDropMeta(bossId);
    if (!meta) return null;
    const pity = { ...(this.context.player.bossPity ?? {}) };
    const attempts = (pity[bossId] ?? 0) + 1;
    const viaPity = attempts >= meta.pityAt;
    if (rng() < meta.dropChance || viaPity) {
      pity[bossId] = 0;
      this.context.player.bossPity = pity;
      return { equipmentId: meta.equipmentId, viaPity };
    }
    pity[bossId] = attempts;
    this.context.player.bossPity = pity;
    return null;
  }

  public bossDropMeta(bossId: string): { dropChance: number; pityAt: number; equipmentId: string } | undefined {
    const def = V57_EQUIPMENT.find((e) => e.bossDrop === bossId);
    if (!def) return undefined;
    const mech = (battleExtension as { bossMechanics: Record<string, { exclusiveDrop: { dropChance: number; pityAt: number } }> }).bossMechanics[bossId];
    return { dropChance: mech?.exclusiveDrop.dropChance ?? 0.2, pityAt: mech?.exclusiveDrop.pityAt ?? 10, equipmentId: def.id };
  }

  /** 分解：返还灵石（品质越高越多）。 */
  public dismantle(equipmentId: string): { success: boolean; spiritStones?: number; reason?: string } {
    const p = this.context.player;
    const idx = (p.ownedEquipment ?? []).indexOf(equipmentId);
    if (idx < 0) return { success: false, reason: '未持有该装备' };
    const def = equipmentDef(equipmentId);
    const rarity = def?.rarity ?? 'COMMON';
    const refund = { COMMON: 5, UNCOMMON: 10, RARE: 20, EPIC: 40, LEGENDARY: 80 }[rarity] ?? 5;
    const owned = [...p.ownedEquipment];
    owned.splice(idx, 1);
    p.ownedEquipment = owned;
    p.spiritStones = Math.min(9_999_999, (p.spiritStones ?? 0) + refund);
    this.context.events.emit('playerChanged', { reason: 'equipmentDismantled' });
    return { success: true, spiritStones: refund };
  }

  /** 装备 Compare 视图：同槽位当前装备 vs 新装备，逐条 delta + 套装/流派推荐。 */
  public compareView(newId: string): {
    slot: string;
    current: { id: string; name: string; rarity: string; lines: string[]; set?: string } | null;
    next: { id: string; name: string; rarity: string; lines: string[]; set?: string } | null;
    deltas: { label: string; delta: number; better: boolean }[];
    recommendation?: string;
    setName?: string;
  } | null {
    const def = equipmentDef(newId);
    if (!def) return null;
    const slot = def.slot;
    const currentId = (this.context.player.equippedEquipment as Record<string, string | null> | undefined)?.[slot] ?? null;
    const curDef = currentId ? equipmentDef(currentId) : undefined;
    const statLine = (d: LootEquipmentDef | undefined): string[] => {
      if (!d) return [];
      const lines: string[] = [];
      const mods = d.modifiers ?? {};
      if (mods.atkMul) lines.push(`攻击 +${Math.round(mods.atkMul * 100)}%`);
      if (mods.critChance) lines.push(`暴击 +${Math.round(mods.critChance * 100)}%`);
      if (mods.aspdMul) lines.push(`攻速 +${Math.round(mods.aspdMul * 100)}%`);
      if (mods.maxHpBonus) lines.push(`生命 +${mods.maxHpBonus}`);
      if (mods.damageReduce) lines.push(`减伤 +${Math.round(mods.damageReduce * 100)}%`);
      for (const a of (d as LootEquipmentDef).affixes ?? []) {
        const affix = AFFIX_MAP.get(a);
        if (affix) lines.push(affix.name);
      }
      return lines;
    };
    const keyStats = (d: LootEquipmentDef | undefined): Record<string, number> => {
      const m: Record<string, number> = {};
      if (!d) return m;
      const mods = d.modifiers ?? {};
      m['攻击%'] = (mods.atkMul ?? 0) * 100;
      m['暴击%'] = (mods.critChance ?? 0) * 100;
      m['攻速%'] = (mods.aspdMul ?? 0) * 100;
      m['生命'] = mods.maxHpBonus ?? 0;
      m['减伤%'] = (mods.damageReduce ?? 0) * 100;
      for (const a of (d as LootEquipmentDef).affixes ?? []) {
        const affix = AFFIX_MAP.get(a);
        const e = affix?.effects ?? {};
        m['攻击%'] += (e.atkMul ?? 0) * 100;
        m['暴击%'] += (e.critBonus ?? 0) * 100;
        m['攻速%'] += (e.aspdMul ?? 0) * 100;
        m['生命'] += e.maxHpBonus ?? 0;
      }
      return m;
    };
    const cur = keyStats(curDef as LootEquipmentDef | undefined);
    const nxt = keyStats(def as LootEquipmentDef);
    const deltas = Object.keys(nxt).map((label) => {
      const delta = Math.round((nxt[label] ?? 0) - (cur[label] ?? 0));
      return { label, delta, better: delta > 0 };
    }).filter((d) => d.delta !== 0);
    let recommendation: string | undefined;
    const prof = this.context.profession?.currentId();
    if ((def as LootEquipmentDef).profession && (def as LootEquipmentDef).profession === prof) {
      const set = (def as LootEquipmentDef).set ? SET_MAP.get((def as LootEquipmentDef).set!) : undefined;
      recommendation = set ? `适合：${set.name}` : '适合：本职业流派';
    }
    return {
      slot,
      current: curDef ? { id: curDef.id, name: curDef.name, rarity: curDef.rarity, lines: statLine(curDef as LootEquipmentDef), set: (curDef as LootEquipmentDef).set } : null,
      next: { id: def.id, name: def.name, rarity: def.rarity, lines: statLine(def as LootEquipmentDef), set: (def as LootEquipmentDef).set },
      deltas,
      recommendation,
      setName: (def as LootEquipmentDef).set ? SET_MAP.get((def as LootEquipmentDef).set!)?.name : undefined,
    };
  }
}
