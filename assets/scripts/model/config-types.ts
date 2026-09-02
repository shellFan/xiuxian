export interface WorkerLevelConfig {
  readonly level: number;
  readonly name: string;
  readonly salary: number;
}
export interface WorkerConfig { readonly levels: readonly WorkerLevelConfig[]; }
export interface CareerLevelConfig {
  readonly level: number;
  readonly name: string;
  readonly realm: string;
  readonly requiredExp: number;
}
export interface CareerConfig { readonly levels: readonly CareerLevelConfig[]; }
export interface EconomyConfig {
  readonly mergeRewards: readonly number[];
  readonly cultivationRewards?: readonly number[];
}
export interface GameConfig { readonly board: Readonly<{ columns: number; rows: number }>; }
export type SectId = 'PRIVATE' | 'FOREIGN' | 'STATE' | 'BIG_TECH';
export interface SectModifiers {
  readonly salaryMultiplier: number;
  readonly cultivationMultiplier: number;
  readonly mindMultiplier: number;
  readonly performanceMultiplier: number;
}
export interface SectConfig {
  readonly id: SectId;
  readonly name: string;
  readonly modifiers: SectModifiers;
}
export interface SectBundle { readonly sects: readonly SectConfig[]; }
export interface TalentConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}
export interface TalentBundle { readonly talents: readonly TalentConfig[]; }
export type CareerEventType = 'POSITIVE' | 'NEGATIVE' | 'CHOICE' | 'RARE' | 'EASTER_EGG';
export interface CareerEventChoice { readonly id: string; readonly text: string; readonly effects: import('./game-effect').GameEffect; }
export interface CareerEventConfig {
  readonly id: string;
  readonly type: CareerEventType;
  readonly title: string;
  readonly description: string;
  readonly effects?: import('./game-effect').GameEffect;
  readonly choices?: readonly CareerEventChoice[];
}
export interface CareerEventBundle { readonly events: readonly CareerEventConfig[]; }
export interface ConfigBundle {
  readonly worker: WorkerConfig;
  readonly career?: CareerConfig;
  readonly economy: EconomyConfig;
  readonly game: GameConfig;
  readonly sect?: SectBundle;
  readonly talent?: TalentBundle;
  readonly careerEvents?: CareerEventBundle;
  readonly kpi?: KpiBundle;
  readonly office?: OfficeBundle;
  readonly promotion?: PromotionBundle;
  readonly achievements?: AchievementBundle;
  readonly daily?: DailyBundle;
}

/**
 * KPI identifiers. Only MERGE_COUNT / SALARY_EARNED / EVENT_RESOLVED are stored
 * in `PlayerData.kpiProgress` (they cannot be derived from existing facts).
 * WORK_SECONDS reads `PlayerData.workSeconds` and CULTIVATION reads
 * `PlayerData.cultivationExp` directly, so they must NOT be duplicated into kpiProgress.
 */
export type KpiType = 'MERGE_COUNT' | 'WORK_SECONDS' | 'CULTIVATION' | 'SALARY_EARNED' | 'EVENT_RESOLVED';

export interface KpiRequirement {
  readonly type: KpiType;
  readonly target: number;
  readonly description?: string;
}

export interface KpiLevelConfig {
  readonly careerLevel: number;
  readonly requirements: readonly KpiRequirement[];
}

export interface KpiBundle {
  readonly levels: readonly KpiLevelConfig[];
}

export interface PromotionOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}
export interface PromotionBundle { readonly options: readonly PromotionOption[]; }

export interface OfficeConfig {
  readonly level: number;
  readonly name: string;
  readonly minCareerLevel: number;
  readonly maxCareerLevel: number;
}
export interface OfficeBundle { readonly offices: readonly OfficeConfig[]; }

export type AchievementCategory = 'MERGE' | 'SALARY' | 'CAREER' | 'EVENT' | 'PROMOTION' | 'OFFICE' | 'MIND' | 'IDLE' | 'SECT' | 'TALENT' | 'WORK';

export type AchievementConditionType =
  | 'KPI' | 'SALARY' | 'CAREER_LEVEL' | 'EVENT_TYPE'
  | 'PROMOTION' | 'OFFICE_LEVEL' | 'MIND_FULL'
  | 'IDLE_CLAIM' | 'SECT_JOIN' | 'TALENT_PICK' | 'WORK_SECONDS';

export interface AchievementCondition {
  readonly type: AchievementConditionType;
  readonly kpiKey?: string;
  readonly target?: number;
  readonly eventType?: string;
}

export interface AchievementConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AchievementCategory;
  readonly condition: AchievementCondition;
}

export interface AchievementBundle { readonly achievements: readonly AchievementConfig[]; }

export interface DailyRewardConfig {
  readonly day: number;
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
}

export interface DailyBundle {
  readonly rewards: readonly DailyRewardConfig[];
  readonly cycleDays: number;
  readonly graceHours: number;
}
