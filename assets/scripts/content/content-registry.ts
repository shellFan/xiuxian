import professionsConfig from '../../configs/professions.json';
import v57Content from '../../configs/v57/profession-content.json';

/**
 * V5.8 P0 — ContentRegistry（§28）：职业内容唯一事实源。
 *
 * 事实源 = v57/profession-content.json（任务/怪物/Boss/Build/技能/装备/称号/perk）。
 * professions.json（V5.5 老接口）保留为兼容视图，由 Registry 派生——修改职业内容只改 v57 文件。
 * content:check 断言两份文件派生结果一致，双源不一致 fail fast。
 */

export interface RegistryProfession {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly traits: readonly string[];
  readonly initialSkill: string;
  readonly initialEquipment: string;
  readonly specialty: readonly string[];
  readonly specialtyBonus: number;
  readonly monsters: readonly string[];
  readonly bosses: readonly string[];
  readonly builds: readonly string[];
  readonly taskPool: readonly string[];
  readonly activeSkills: readonly string[];
  readonly passiveSkills: readonly string[];
  readonly equipment: readonly string[];
  readonly color: string;
  readonly locked?: boolean;
}

const V57 = v57Content as unknown as {
  professions: Record<string, {
    title: string; titlesByLevel: Record<string, string>;
    monsters: string[]; bosses: string[]; builds: string[];
    activeSkills: string[]; passiveSkills: string[]; equipment: string[];
    perks: Record<string, unknown>; tasks: { id: string; title: string; minutes: number; source: string }[];
  }>;
  universal: { fishBuildId: string; crossProfessionShare: number };
};

const LEGACY = professionsConfig as unknown as {
  professions: { id: string; name: string; title: string; description: string; traits: string[]; initialSkill: string; initialEquipment: string; specialty: string[]; specialtyBonus: number; color: string; locked?: boolean }[];
};

/** Registry 派生视图：v57 内容 + v55 元数据合成（monsters/builds/taskPool 全部来自 v57）。 */
export const REGISTRY_PROFESSIONS: readonly RegistryProfession[] = LEGACY.professions.map((legacy) => {
  const deep = V57.professions[legacy.id];
  if (!deep) {
    const legacyExt = legacy as unknown as { monsters?: string[]; builds?: string[]; taskPool?: string[] };
    return { ...legacy, monsters: legacyExt.monsters ?? [], bosses: [], builds: legacyExt.builds ?? [], taskPool: legacyExt.taskPool ?? [], activeSkills: [], passiveSkills: [], equipment: [] };
  }
  return {
    id: legacy.id,
    name: legacy.name,
    title: deep.title,
    description: legacy.description,
    traits: legacy.traits,
    initialSkill: legacy.initialSkill,
    initialEquipment: legacy.initialEquipment,
    specialty: legacy.specialty,
    specialtyBonus: legacy.specialtyBonus,
    monsters: deep.monsters,
    bosses: deep.bosses,
    builds: deep.builds,
    taskPool: deep.tasks.map((t) => t.id),
    activeSkills: deep.activeSkills,
    passiveSkills: deep.passiveSkills,
    equipment: deep.equipment,
    color: legacy.color,
    locked: legacy.locked,
  };
});

export const REGISTRY_MAP: ReadonlyMap<string, RegistryProfession> = new Map(REGISTRY_PROFESSIONS.map((p) => [p.id, p]));

export function registryProfession(id: string): RegistryProfession | undefined {
  return REGISTRY_MAP.get(id);
}

export function fishBuildId(): string {
  return V57.universal.fishBuildId;
}

export function crossProfessionShare(): number {
  return V57.universal.crossProfessionShare;
}

/** 双源一致性校验（content:check / 启动测试调用）：professions.json 与 Registry 派生是否一致。 */
export function validateDualSource(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const legacy of LEGACY.professions) {
    const reg = REGISTRY_MAP.get(legacy.id);
    if (!reg) { issues.push(`${legacy.id}: missing in registry`); continue; }
    if (legacy.id === 'DBA' || legacy.id === 'PRODUCT_OWNER') continue; // locked 职业 V5.8 不要求深度
    const legacyMonsters = (legacy as unknown as { monsters?: string[] }).monsters ?? [];
    if (JSON.stringify(legacyMonsters) !== JSON.stringify(reg.monsters)) issues.push(`${legacy.id}: monsters dual-source drift`);
    const legacyBuilds = (legacy as unknown as { builds?: string[] }).builds ?? [];
    if (JSON.stringify(legacyBuilds) !== JSON.stringify(reg.builds)) issues.push(`${legacy.id}: builds dual-source drift`);
  }
  return { ok: issues.length === 0, issues };
}
