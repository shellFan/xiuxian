import professionContent from '../../configs/professions.json';
import content from '../../configs/v57/profession-content.json';
import type { GameContext } from '../core/game-context';

/**
 * V5.7 Phase A — 职业内容深度服务。
 * 每职业：任务池(26)/怪物池(22+)/Boss(4)/Build(5+fish)/主动技(10+)/被动(8)/装备(12)/事件(26)/等级称号/等级perk。
 * 数据来源 v57/profession-content.json + professions.json。
 */

type ProfessionIdStr = string;

interface TaskDef { readonly id: string; readonly title: string; readonly minutes: number; readonly source: string }

interface ProfessionContentDef {
  readonly title: string;
  readonly titlesByLevel: Readonly<Record<string, string>>;
  readonly monsters: readonly string[];
  readonly bosses: readonly string[];
  readonly builds: readonly string[];
  readonly activeSkills: readonly string[];
  readonly passiveSkills: readonly string[];
  readonly equipment: readonly string[];
  readonly perks: Readonly<Record<string, { unlockPassive?: string; unlockSkill?: string; buildPerk?: { atkMul?: number }; professionInsight?: boolean; grantEquipment?: string; evidenceBonus?: number; projectRewardMul?: number; corePassive?: { atkMul?: number }; desc: string }>>;
  readonly tasks: readonly TaskDef[];
}

interface ContentBundle {
  readonly professions: Readonly<Record<string, ProfessionContentDef>>;
  readonly universal: { readonly fishBuildId: string; readonly crossProfessionShare: number };
}

const BUNDLE = content as unknown as ContentBundle;

export interface PerkAggregate {
  readonly atkMul: number;
  readonly evidenceBonus: number;
  readonly projectRewardMul: number;
  readonly unlockedSkills: readonly string[];
  readonly unlockedPassives: readonly string[];
  readonly grantedEquipment: readonly string[];
  readonly professionInsight: boolean;
  readonly descriptions: readonly string[];
}

export interface ProfessionDepthView {
  readonly id: ProfessionIdStr;
  readonly name: string;
  readonly title: string;
  readonly currentTitle: string;
  readonly level: number;
  readonly exp: number;
  readonly expToNext: number;
  readonly nextTitle: string;
  readonly buildIds: readonly string[];
  readonly activeSkills: readonly string[];
  readonly passiveSkills: readonly string[];
  readonly taskCount: number;
  readonly monsterCount: number;
  readonly bossIds: readonly string[];
  readonly equipmentIds: readonly string[];
  readonly synergies: readonly { id: string; name: string; desc: string; active: boolean }[];
  readonly titles: readonly { level: number; title: string }[];
  readonly perks: readonly { level: number; desc: string; reached: boolean }[];
}

export function professionContentDef(id: string): ProfessionContentDef | undefined {
  return BUNDLE.professions[id];
}

export function crossProfessionShare(): number {
  return BUNDLE.universal.crossProfessionShare;
}

export function fishBuildId(): string {
  return BUNDLE.universal.fishBuildId;
}

export class ProfessionContentService {
  public constructor(private readonly context: GameContext) {}

  public def(): ProfessionContentDef {
    const id = this.context.profession?.currentId() ?? 'JAVA_BACKEND';
    return BUNDLE.professions[id] ?? BUNDLE.professions.JAVA_BACKEND;
  }

  /** 职业任务池（每日计划真正从这里抽取）。 */
  public taskPool(): readonly TaskDef[] {
    return this.def().tasks;
  }

  /** 指定职业的任务池（跨职业问题 §13：每日计划 10~20% 跨职业）。 */
  public taskPoolOf(professionId: string): readonly TaskDef[] {
    return BUNDLE.professions[professionId]?.tasks ?? [];
  }

  public taskById(id: string): TaskDef | undefined {
    for (const p of Object.values(BUNDLE.professions)) {
      const hit = p.tasks.find((t) => t.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  /** 任务是否属于当前职业池（taskAllowed 的真实现）。 */
  public taskAllowed(taskId: string): boolean {
    return this.def().tasks.some((t) => t.id === taskId);
  }

  public monsterPool(): readonly string[] {
    return this.def().monsters;
  }

  public buildIds(): readonly string[] {
    return [...this.def().builds, BUNDLE.universal.fishBuildId];
  }

  public activeSkills(): readonly string[] {
    return this.def().activeSkills;
  }

  public passiveSkills(): readonly string[] {
    return this.def().passiveSkills;
  }

  public level(): number {
    return this.context.profession?.level() ?? 1;
  }

  /** 全部已达成的等级 perk 聚合（战斗/工作消费）。 */
  public perkAggregate(): PerkAggregate {
    const level = this.level();
    const perks = this.def().perks;
    const agg: { atkMul: number; evidenceBonus: number; projectRewardMul: number; unlockedSkills: string[]; unlockedPassives: string[]; grantedEquipment: string[]; professionInsight: boolean; descriptions: string[] } = {
      atkMul: 0, evidenceBonus: 0, projectRewardMul: 0, unlockedSkills: [], unlockedPassives: [], grantedEquipment: [], professionInsight: false, descriptions: [],
    };
    for (const key of Object.keys(perks)) {
      const lvl = Number(key);
      if (lvl > level) continue;
      const perk = perks[key];
      agg.atkMul += (perk.buildPerk?.atkMul ?? 0) + (perk.corePassive?.atkMul ?? 0);
      agg.evidenceBonus += perk.evidenceBonus ?? 0;
      agg.projectRewardMul += perk.projectRewardMul ?? 0;
      if (perk.unlockSkill) agg.unlockedSkills.push(perk.unlockSkill);
      if (perk.unlockPassive) agg.unlockedPassives.push(perk.unlockPassive);
      if (perk.grantEquipment) agg.grantedEquipment.push(perk.grantEquipment);
      if (perk.professionInsight) agg.professionInsight = true;
      agg.descriptions.push(`Lv${lvl} ${perk.desc}`);
    }
    return agg;
  }

  /** perk 一次性发放（升级时调用；幂等：已拥有则跳过）。 */
  public grantLevelUps(): string[] {
    const player = this.context.player;
    const level = this.level();
    const perks = this.def().perks;
    const granted = player.professionPerksGranted ?? [];
    const messages: string[] = [];
    for (const key of Object.keys(perks)) {
      const lvl = Number(key);
      if (lvl > level || granted.includes(`${this.context.profession?.currentId()}:${lvl}`)) continue;
      const perk = perks[key];
      granted.push(`${this.context.profession?.currentId()}:${lvl}`);
      try {
        if (perk.unlockPassive) this.context.v2Items.grantTechnique(perk.unlockPassive);
        if (perk.unlockSkill) this.context.v2Items.grantTechnique(perk.unlockSkill);
        if (perk.grantEquipment) this.context.v2Items.grantEquipment(perk.grantEquipment);
      } catch { /* perk grant best-effort */ }
      messages.push(`职业 Lv${lvl}：${perk.desc}`);
    }
    player.professionPerksGranted = granted;
    return messages;
  }

  public currentTitle(): string {
    const level = this.level();
    const titles = this.def().titlesByLevel;
    let title = titles['1'] ?? this.def().title;
    for (const key of Object.keys(titles)) {
      if (level >= Number(key)) title = titles[key];
    }
    return title;
  }

  /** 职业页深度视图（§112）。 */
  public depthView(): ProfessionDepthView {
    const base = (professionContent as { professions: { id: string; name: string }[] }).professions;
    const id = this.context.profession?.currentId() ?? 'JAVA_BACKEND';
    const meta = base.find((p) => p.id === id);
    const level = this.level();
    const def = this.def();
    const perks = Object.keys(def.perks).map((k) => ({ level: Number(k), desc: def.perks[k].desc, reached: level >= Number(k) }));
    const titles = Object.keys(def.titlesByLevel).map((k) => ({ level: Number(k), title: def.titlesByLevel[k] }));
    let synergies: { id: string; name: string; desc: string; active: boolean }[] = [];
    try {
      synergies = this.context.battle.synergyViews();
    } catch { /* 无战斗上下文时为空 */ }
    return {
      id,
      name: meta?.name ?? id,
      title: def.title,
      currentTitle: this.currentTitle(),
      level,
      exp: this.context.profession?.exp() ?? 0,
      expToNext: this.context.profession?.expToNext() ?? 0,
      nextTitle: titles.find((t) => t.level > level)?.title ?? '圆满',
      buildIds: this.buildIds(),
      activeSkills: def.activeSkills,
      passiveSkills: def.passiveSkills,
      taskCount: def.tasks.length,
      monsterCount: def.monsters.length,
      bossIds: def.bosses,
      equipmentIds: def.equipment,
      synergies,
      titles,
      perks,
    };
  }
}
