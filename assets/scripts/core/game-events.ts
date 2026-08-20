import type { BoardPosition } from '../game/merge/merge-types';
import type { WorkerEntity } from '../model/worker-entity';

export interface WorkerRecruitedEvent {
  readonly worker: WorkerEntity;
  readonly position: BoardPosition;
}

export interface GameSavedEvent {
  readonly reason: 'recruitment';
}

export interface RecruitmentFailedEvent {
  readonly message: string;
}

export interface GameEvents extends Record<string, unknown> {
  readonly workerRecruited: WorkerRecruitedEvent;
  readonly gameSaved: GameSavedEvent;
  readonly recruitmentFailed: RecruitmentFailedEvent;
}

