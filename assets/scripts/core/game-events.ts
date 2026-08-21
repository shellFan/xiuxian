import type { BoardPosition } from '../game/merge/merge-types';
import type { WorkerEntity } from '../model/worker-entity';

export interface WorkerRecruitedEvent {
  readonly worker: WorkerEntity;
  readonly position: BoardPosition;
}
export interface GameSavedEvent {
  readonly reason: 'recruitment' | 'merge' | 'economy';
}
export interface RecruitmentFailedEvent { readonly message: string; }
export interface MergeCompletedEvent {
  readonly first: BoardPosition;
  readonly second: BoardPosition;
  readonly worker: WorkerEntity;
  readonly salaryReward: number;
  readonly cultivationReward: number;
}
export interface SalaryChangedEvent { readonly amount: number; readonly total: number; }
export interface GameEvents extends Record<string, unknown> {
  readonly workerRecruited: WorkerRecruitedEvent;
  readonly gameSaved: GameSavedEvent;
  readonly recruitmentFailed: RecruitmentFailedEvent;
  readonly mergeCompleted: MergeCompletedEvent;
  readonly salaryChanged: SalaryChangedEvent;
}
