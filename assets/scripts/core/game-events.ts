import type { BoardPosition } from '../game/merge/merge-types';
import type { WorkerEntity } from '../model/worker-entity';

export interface WorkerRecruitedEvent {
  readonly worker: WorkerEntity;
  readonly position: BoardPosition;
}
export interface GameSavedEvent {
  readonly reason: 'recruitment' | 'merge' | 'economy' | 'idle';
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
export interface IdleSettledEvent { readonly settlementId: string; readonly salary: number; readonly cultivationExp: number; readonly elapsedSeconds: number; readonly capped: boolean; }
export interface ClockAnomalyEvent { readonly code: 'CLOCK_ANOMALY'; readonly now: number; readonly lastSaveTime: number; }
export interface Phase2RefreshEvent { readonly reason: 'merge' | 'promotion' | 'event' | 'idle' | 'manual'; }
export interface GameEvents extends Record<string, unknown> {
  readonly workerRecruited: WorkerRecruitedEvent;
  readonly gameSaved: GameSavedEvent;
  readonly recruitmentFailed: RecruitmentFailedEvent;
  readonly mergeCompleted: MergeCompletedEvent;
  readonly salaryChanged: SalaryChangedEvent;
  readonly idleSettled: IdleSettledEvent;
  readonly clockAnomaly: ClockAnomalyEvent;
  readonly phase2Refresh: Phase2RefreshEvent;
}
