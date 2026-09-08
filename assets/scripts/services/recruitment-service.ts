import type { BoardPosition } from '../game/merge/merge-types';
import { WorkerEntity } from '../model/worker-entity';
import type { GameContext } from '../core/game-context';

export interface RecruitmentSuccess {
  readonly success: true;
  readonly worker: WorkerEntity;
  readonly position: BoardPosition;
}

export interface RecruitmentFailure {
  readonly success: false;
  readonly message: '工位满了';
}

export type RecruitmentResult = RecruitmentSuccess | RecruitmentFailure;

export class RecruitmentService {
  /** @deprecated PC V1 does not use RecruitmentService. Requires a non-null board. */
  public constructor(private readonly context: GameContext) {}

  public recruit(): RecruitmentResult {
    const board = this.context.board;
    if (!board) {
      return { success: false, message: '工位满了' };
    }
    const position = board.findEmptyPosition();
    if (!position) {
      return { success: false, message: '工位满了' };
    }

    const worker = WorkerEntity.create(1);
    board.place(worker, position);
    this.context.syncPlayerWorkers();
    this.context.player.maxWorkerLevel = Math.max(this.context.player.maxWorkerLevel, worker.level);
    this.context.events.emit('workerRecruited', { worker, position });
    this.context.saveService.save(this.context.player);
    this.context.events.emit('gameSaved', { reason: 'recruitment' });
    return { success: true, worker, position };
  }
}
