export const CURRENT_SAVE_VERSION = 2;

export interface WorkerSaveData {
  readonly id: string;
  readonly level: number;
  readonly row: number;
  readonly column: number;
}

export interface GameSaveData {
  readonly saveVersion: number;
  readonly salary: number;
  readonly maxWorkerLevel: number;
  readonly lastSaveTime: number;
  readonly workers: readonly WorkerSaveData[];
}