import type { BoardPosition } from '../game/merge/merge-types';
import { WorkerEntity } from '../model/worker-entity';
import type { GameContext } from '../core/game-context';

export interface MergeSuccess {
  readonly success: true;
  readonly worker: WorkerEntity;
  readonly salaryReward: number;
}

export interface MergeFailure {
  readonly success: false;
  readonly message: '合成进行中' | '工位不足' | '只能合成同级牛马' | '最高等级为Lv6';
}

export type MergeResult = MergeSuccess | MergeFailure;

export class MergeService {
  private locked = false;
  public constructor(private readonly context: GameContext) {
    if (context.economy.mergeRewards.length < Math.min(this.context.board.maxWorkerLevel, 6) - 1 ||
      context.economy.mergeRewards.some((reward) => !Number.isInteger(reward) || reward < 0)) {
      throw new Error('Merge rewards must cover every merge level and be non-negative');
    }
  }

  public merge(first: BoardPosition, second: BoardPosition): MergeResult {
    if (this.locked) return { success: false, message: '合成进行中' };
    const left = this.context.board.getWorker(first);
    const right = this.context.board.getWorker(second);
    if (!left || !right) return { success: false, message: '工位不足' };
    if (left.level !== right.level) return { success: false, message: '只能合成同级牛马' };
    if (left.level >= 6 || left.level >= this.context.board.maxWorkerLevel) {
      return { success: false, message: '最高等级为Lv6' };
    }

    this.locked = true;
    const boardBefore = this.context.board.toSaveData();
    const workersBefore = this.context.player.workers.map((worker) => ({ ...worker }));
    const salaryBefore = this.context.player.salary;
    const maxWorkerLevelBefore = this.context.player.maxWorkerLevel;
    const mergeId = [left.id, right.id].sort().join(':');

    try {
      const worker = this.context.board.merge(first, second);
      this.context.syncPlayerWorkers();
      this.context.player.maxWorkerLevel = Math.max(this.context.player.maxWorkerLevel, worker.level);
      let salaryReward: number;
      try {
        salaryReward = this.context.economy.grantMergeReward(mergeId, left.level);
      } catch (error) {
        this.restore(boardBefore, workersBefore, salaryBefore, maxWorkerLevelBefore);
        throw error;
      }

      this.emitFeedback('mergeCompleted', { first, second, worker, salaryReward });
      return { success: true, worker, salaryReward };
    } finally {
      this.locked = false;
    }
  }

  private restore(
    boardData: ReturnType<GameContext['board']['toSaveData']>,
    workers: typeof this.context.player.workers,
    salary: number,
    maxWorkerLevel: number,
  ): void {
    for (const cell of this.context.board.cells) {
      this.context.board.remove(cell);
    }
    for (const savedWorker of boardData) {
      this.context.board.place(WorkerEntity.fromSaveData(savedWorker), savedWorker);
    }
    this.context.player.workers = workers.map((worker) => ({ ...worker }));
    this.context.player.salary = salary;
    this.context.player.maxWorkerLevel = maxWorkerLevel;
  }

  private emitFeedback<K extends keyof import('../core/game-events').GameEvents>(
    event: K,
    payload: import('../core/game-events').GameEvents[K],
  ): void {
    try {
      this.context.events.emit(event, payload);
    } catch {
      // Feedback listeners are outside the committed transaction.
    }
  }
}
