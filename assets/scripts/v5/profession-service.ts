import professionsConfig from '../../configs/professions.json';
import { REGISTRY_MAP, registryProfession } from '../content/content-registry';
import type { GameContext } from '../core/game-context';
import { PlayerData } from '../model/player-data';
import { applyCharacterEffectToInteger } from '../v59/character-attributes';

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

export interface ProfessionCareerSkillView {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly maxLevel: 5;
  readonly effect: string;
}

const CAREER_SKILLS: Readonly<Record<string, readonly { id: string; name: string; effect: string }[]>> = {
  JAVA_BACKEND: [
    { id: 'database', name: '数据库优化', effect: '降低项目工时并提高专业怪战斗专精' },
    { id: 'concurrency', name: '并发处理', effect: '降低项目工时并提高专业怪战斗专精' },
    { id: 'api', name: '接口架构', effect: '提高技术岗位面试评分' },
    { id: 'incident', name: '故障排查', effect: '提高风险题面试评分' },
  ],
  FRONTEND: [
    { id: 'components', name: '组件设计', effect: '降低项目工时并提升项目绩效' },
    { id: 'performance', name: '页面性能', effect: '降低项目工时并提升项目绩效' },
    { id: 'ui', name: 'UI 实现', effect: '提高交付题面试评分' },
    { id: 'compatibility', name: '兼容性处理', effect: '提高团队协作面试评分' },
  ],
  QA: [
    { id: 'automation', name: '自动化测试', effect: '降低项目工时并提高专业怪战斗专精' },
    { id: 'triage', name: '缺陷定位', effect: '提高风险题面试评分' },
    { id: 'performance', name: '性能测试', effect: '提升项目绩效奖励' },
    { id: 'quality', name: '质量保障', effect: '提高交付题面试评分' },
  ],
  DEVOPS: [
    { id: 'release', name: '部署发布', effect: '降低项目工时并提升项目绩效' },
    { id: 'recovery', name: '故障恢复', effect: '提高风险题面试评分并增强战斗专精' },
    { id: 'monitoring', name: '监控告警', effect: '提高交付题面试评分' },
    { id: 'capacity', name: '容量规划', effect: '提升项目绩效奖励' },
  ],
};

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
    if (this.context.player.characterSetupStatus === 'CREATION_REQUIRED') {
      return { success: false, reason: '请先完成牛马降世角色创建' };
    }
    const def = professionDef(professionId);
    if (!def) return { success: false, reason: '未知职业' };
    if (def.locked) return { success: false, reason: '该职业尚未开放' };
    if (this.isSelected()) return { success: false, reason: '职业已确定（本轮不可更换）' };
    this.context.player.profession = def.id;
    const starterKit = this.grantStarterKit(def.id);
    if (!starterKit.success) {
      this.context.player.profession = undefined;
      return starterKit;
    }
    this.context.events.emit('professionChosen', { profession: def.id });
    return { success: true };
  }

  /** Apply the profession's existing starter rewards once inside the caller's save transaction. */
  public grantStarterKit(professionId: string): { success: boolean; reason?: string } {
    const def = professionDef(professionId);
    if (!def || def.locked) return { success: false, reason: '该职业不可发放入职物品' };
    const receipt = `starter-kit:${def.id}`;
    if (this.context.player.professionPerksGranted.includes(receipt)) return { success: true };
    const player = this.context.player;
    const before = player.toSaveData();
    try {
      // Profession combat skills belong to ProfessionContentService, not the separate V2
      // technique inventory. The configured initial skill is already active for the role.
      const learnedAsTechnique = this.context.v2Items.grantTechnique(def.initialSkill);
      if (!learnedAsTechnique && !this.context.professionContent.activeSkills().includes(def.initialSkill)) {
        throw new Error(`职业初始技能未在权威职业配置中启用：${def.initialSkill}`);
      }
      const equipmentGranted = this.context.v2Items.grantEquipment(def.initialEquipment)
        || player.ownedEquipment.includes(def.initialEquipment);
      if (!equipmentGranted) throw new Error(`职业初始装备无效：${def.initialEquipment}`);
      const equipmentSlot = this.context.v2Items.equipmentSlot(def.initialEquipment);
      if (!equipmentSlot || !this.context.v2Items.equipItem(equipmentSlot, def.initialEquipment)) {
        throw new Error(`职业初始装备无法穿戴：${def.initialEquipment}`);
      }
      // V5.8 §7.1：新员工欢迎礼——2 瓶咖啡缓解开局道心下沉
      this.context.v2Items.addMaterial('cons_coffee', 2);
      player.professionPerksGranted.push(receipt);
      return { success: true };
    } catch (error) {
      Object.assign(player, new PlayerData(before));
      return { success: false, reason: `入职物品发放失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** 老档一次性免费改职业（§14）。 */
  public rechooseOnce(professionId: string): { success: boolean; reason?: string } {
    if (this.context.player.characterSetupStatus === 'CREATION_REQUIRED') {
      return { success: false, reason: '请先完成牛马降世角色创建' };
    }
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

  /** Four profession-specific directions share the existing bounded profession experience. */
  public careerSkills(): readonly ProfessionCareerSkillView[] {
    const skills = CAREER_SKILLS[this.currentId()] ?? (this.currentId() === 'DBA' ? CAREER_SKILLS.JAVA_BACKEND : CAREER_SKILLS.FRONTEND);
    const level = Math.max(1, Math.min(5, Math.ceil(this.level() / 2)));
    return skills.map((skill) => ({ ...skill, level, maxLevel: 5 }));
  }

  private careerSkillRank(): number { return Math.max(0, this.careerSkills()[0].level - 1); }

  public projectTimeMultiplier(): number { return Math.max(0.8, 1 - this.careerSkillRank() * 0.04); }

  public projectPerformanceBonus(): number { return Math.min(4, this.careerSkillRank()); }

  public interviewBonus(answer: 'DELIVERY' | 'TEAMWORK' | 'RISK'): number {
    const rank = this.careerSkillRank();
    if (rank === 0) return 0;
    const preferred: Readonly<Record<string, 'DELIVERY' | 'TEAMWORK' | 'RISK'>> = {
      JAVA_BACKEND: 'RISK', FRONTEND: 'DELIVERY', QA: 'RISK', DEVOPS: 'RISK',
      DBA: 'RISK', PRODUCT_OWNER: 'TEAMWORK',
    };
    return Math.min(8, rank + (preferred[this.currentId()] === answer ? rank : Math.floor(rank / 2)));
  }

  /** 职业经验来源：任务完成/项目贡献/职业怪击杀（§195）。 */
  public grantExp(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const player = this.context.player;
    const settledAmount = applyCharacterEffectToInteger(amount, player, 'PROFESSION_GROWTH');
    const before = player.professionExp ?? 0;
    player.professionExp = before + settledAmount;
    if (this.level() > 1 + PROFESSION_LEVEL_EXP.findIndex((t) => t > before) - 1 + 1) {
      // 简化：只在升级时 emit
    }
    this.context.events.emit('professionExpGained', { amount: settledAmount, total: player.professionExp, level: this.level() });
  }

  /** 战斗专精：本职业怪物伤害 +specialtyBonus（§98）。 */
  public specialtyMultiplier(monsterDefId: string): number {
    const def = this.def();
    const monster = def.monsters.includes(monsterDefId);
    return monster ? Math.min(2.5, 1 + def.specialtyBonus + this.careerSkillRank() * 0.02) : 1;
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
