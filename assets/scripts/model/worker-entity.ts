import type { WorkerSaveData } from './save-data';

let nextWorkerNumber = 1;

export class WorkerEntity {
  public readonly id: string;
  public readonly level: number;

  public constructor(id: string, level: number) {
    if (!id.trim()) throw new Error('Worker id must not be empty');
    if (!Number.isInteger(level) || level < 1) throw new Error('Worker level must be a positive integer');
    this.id = id;
    this.level = level;
    WorkerEntity.observeId(id);
  }

  public static create(level: number): WorkerEntity {
    return new WorkerEntity(`worker-${nextWorkerNumber++}`, level);
  }

  public static fromSaveData(data: WorkerSaveData): WorkerEntity {
    return new WorkerEntity(data.id, data.level);
  }

  public toSaveData(row: number, column: number): WorkerSaveData {
    return { id: this.id, level: this.level, row, column };
  }

  private static observeId(id: string): void {
    const match = /^worker-(\d+)$/.exec(id);
    if (match) nextWorkerNumber = Math.max(nextWorkerNumber, Number(match[1]) + 1);
  }
}