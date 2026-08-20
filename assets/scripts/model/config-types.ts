export interface WorkerLevelConfig {
  readonly level: number;
  readonly name: string;
  readonly salary: number;
}
export interface WorkerConfig { readonly levels: readonly WorkerLevelConfig[]; }
export interface EconomyConfig { readonly mergeRewards: readonly number[]; }
export interface GameConfig { readonly board: Readonly<{ columns: number; rows: number }>; }
export interface ConfigBundle {
  readonly worker: WorkerConfig;
  readonly economy: EconomyConfig;
  readonly game: GameConfig;
}