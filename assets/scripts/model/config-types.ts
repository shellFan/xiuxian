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
}
