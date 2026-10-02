import professionsConfig from '../../configs/professions.json';
import { REGISTRY_MAP, registryProfession } from '../content/content-registry';
import type { GameContext } from '../core/game-context';

/**
 * V5.5 P0：职业系统（§2~§14）。职业影响怪物池/技能池/任务池/专精加成/聊天内容。
 * V5.8：职业内容唯一事实源 = content/content-registry.ts（由 v57/profession-content.json 派生）；
 * professions.json 仅存元数据。professionDef() 读 Registry，保持双源一致由 validateDualSource/content:check 断言。
 */

export type ProfessionId =
  | 'JAVA_BACKEND' | 'FRONTEND' | 'QA' | 'DEVOPS' | 'DBA' | 'PRODUCT_OWNER';

export interface ProfessionDef {
  readonly id: ProfessionId;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly traits: readonly string[];
  readonly initialSkill: string;
  readonly initialEquipment: string;
  readonly specialty: readonly string[];
  readonly specialtyBonus: number;
  readonly monsters: readonly string[];
  readonly builds: readonly string[];
  readonly taskPool: readonly string[];
  readonly color: string;
  readonly locked?: boolean;
}

export interface ProfessionView {
  readonly id: ProfessionId;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly traits: readonly string[];
  readonly color: string;
  readonly locked: boolean;
  readonly selected: boolean;
}

/** 职业等级：技术路线，与公司职级分离（§195~§197）。 */
export const PROFESSION_LEVEL_EXP = [0, 120, 320, 700, 1300, 2200, 3500, 5300, 7800, 11500] as const;

const PROFESSIONS = (professionsConfig as { professions: ProfessionDef[] }).professions;

export function professionDef(id: string): ProfessionDef | undefined {
  // V5.8：Registry 优先（内容唯一事实源），locked 职业回退 legacy 元数据
  const reg = registryProfession(id);
  if (reg) return reg as ProfessionDef;
  return PROFESSIONS.find((p) => p.id === id);
}

export function allProfessions(): readonly ProfessionDef[] {
  return REGISTRY_MAP.size > 0 ? (Array.from(REGISTRY_MAP.values()) as ProfessionDef[]) : PROFESSIONS;
}

export class ProfessionService {
  /** 当前职业（存档 profession 字段；旧档默认 JAVA_BACKEND，§14）。 */
  public currentId(): ProfessionId {
    return (this.context.player.profession as ProfessionId) ?? 'JAVA_BACKEND';
  }

  public def(): ProfessionDef {
    return professionDef(this.currentId()) ?? PROFESSIONS[0];
  }

  public isSelected(): boolean {
    return !!this.context.player.profession;
  }

  public views(): ProfessionView[] {
    const current = this.currentId();
    return PROFESSIONS.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      description: p.description,
      traits: p.traits,
      color: p.color,
      locked: p.locked === true,
      selected: p.id === current,
    }));
  }

  /** 新档选择职业（一次性；locked 职业不可选）。 */
  public choose(professionId: string): { success: boolean; reason?: string } {
    const def = professionDef(professionId);
    if (!def) return { success: false, reason: '未知职业' };
    if (def.locked) return { success: false, reason: '该职业尚未开放' };
    if (this.isSelected()) return { success: false, reason: '职业已确定（本轮不可更换）' };
    this.context.player.profession = def.id;
    // 初始技能 + 法宝（§12）
    try { this.context.v2Items.grantTechnique(def.initialSkill); } catch { /* starter kit best-effort */ }
    try { this.context.v2Items.grantEquipment(def.initialEquipment); } catch { /* starter kit best-effort */ }
    try { this.context.v2Items.equipItem('DESK', def.initialEquipment); } catch { /* best-effort */ }
    this.context.events.emit('professionChosen', { profession: def.id });
    return { success: true };
  }

  /** 老档一次性免费改职业（§14）。 */
  public rechooseOnce(professionId: string): { success: boolean; reason?: string } {
    if (this.context.player.professionFreeRechooseUsed) return { success: false, reason: '免费改职业机会已用' };
    const player = this.context.player as unknown as { professionFreeRechooseUsed?: boolean };
    const result = (() => {
      const def = professionDef(professionId);
      if (!def || def.locked) return { success: false, reason: '该职业不可选' };
      this.context.player.profession = def.id;
      try { this.context.v2Items.grantTechnique(def.initialSkill); } catch { /* best-effort */ }
      try { this.context.v2Items.grantEquipment(def.initialEquipment); } catch { /* best-effort */ }
      this.context.events.emit('professionChosen', { profession: def.id, rechose: true });
      return { success: true };
    })();
    if (result.success) player.professionFreeRechooseUsed = true;
    return result;
  }

  /** 职业等级（技术路线，§195）。 */
  public level(): number {
    const exp = this.context.player.professionExp ?? 0;
    let level = 1;
    for (let i = 1; i < PROFESSION_LEVEL_EXP.length; i += 1) {
      if (exp >= PROFESSION_LEVEL_EXP[i]) level = i + 1;
    }
    return level;
  }

  public exp(): number {
    return this.context.player.professionExp ?? 0;
  }

  public expToNext(): number {
    const exp = this.context.player.professionExp ?? 0;
    const level = this.level();
    return level >= PROFESSION_LEVEL_EXP.length ? 0 : PROFESSION_LEVEL_EXP[level] - exp;
  }

  /** 职业经验来源：任务完成/项目贡献/职业怪击杀（§195）。 */
  public grantExp(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const player = this.context.player;
    const before = player.professionExp ?? 0;
    player.professionExp = before + amount;
    if (this.level() > 1 + PROFESSION_LEVEL_EXP.findIndex((t) => t > before) - 1 + 1) {
      // 简化：只在升级时 emit
    }
    this.context.events.emit('professionExpGained', { amount, total: player.professionExp, level: this.level() });
  }

  /** 战斗专精：本职业怪物伤害 +specialtyBonus（§98）。 */
  public specialtyMultiplier(monsterDefId: string): number {
    const def = this.def();
    const monster = def.monsters.includes(monsterDefId);
    return monster ? 1 + def.specialtyBonus : 1;
  }

  /** 本职业 Build 列表（§152~§158）。 */
  public builds(): readonly string[] {
    return this.def().builds;
  }

  /** 本职业任务池过滤（§4）。 */
  public taskAllowed(taskId: string): boolean {
    const def = this.def();
    return def.taskPool.length === 0 || def.taskPool.includes(taskId) || !taskId;
  }

  public constructor(private readonly context: GameContext) {}
}
