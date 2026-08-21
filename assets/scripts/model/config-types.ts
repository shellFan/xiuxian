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
export interface ConfigBundle {
  readonly worker: WorkerConfig;
  readonly career?: CareerConfig;
  readonly economy: EconomyConfig;
  readonly game: GameConfig;
}
