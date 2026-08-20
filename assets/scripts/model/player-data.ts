import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData } from './save-data';

export interface PlayerDataOptions {
  readonly salary?: number;
  readonly maxWorkerLevel?: number;
  readonly lastSaveTime?: number;
  readonly workers?: readonly WorkerSaveData[];
}

export class PlayerData {
  public salary: number;
  public maxWorkerLevel: number;
  public lastSaveTime: number;
  public workers: WorkerSaveData[];

  public constructor(options: PlayerDataOptions = {}) {
    this.salary = options.salary ?? 0;
    this.maxWorkerLevel = options.maxWorkerLevel ?? 0;
    this.lastSaveTime = options.lastSaveTime ?? 0;
    this.workers = (options.workers ?? []).map((worker) => ({ ...worker }));
  }

  public static createDefault(): PlayerData {
    return new PlayerData();
  }

  public toSaveData(): GameSaveData {
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      salary: this.salary,
      maxWorkerLevel: this.maxWorkerLevel,
      lastSaveTime: this.lastSaveTime,
      workers: this.workers.map((worker) => ({ ...worker })),
    };
  }
}