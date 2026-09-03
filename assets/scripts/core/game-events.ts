import type { BoardPosition } from '../game/merge/merge-types';
import type { WorkerEntity } from '../model/worker-entity';
import type { WorkMode } from '../model/save-data';

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
export interface PlayerChangedEvent { readonly reason: string; readonly mode?: WorkMode; }
export interface CareerChangedEvent { readonly careerLevel: number; }
export interface KpiChangedEvent { readonly careerLevel: number; }
export interface MindChangedEvent { readonly delta: number; readonly total: number; }
export interface WorkModeChangedEvent { readonly mode: WorkMode; }
export interface EventChangedEvent { readonly eventId: string | null; readonly pending: boolean; }
export interface PromotionChangedEvent { readonly success: boolean; readonly careerLevel: number; }
export interface OfflineRewardChangedEvent { readonly settlementId: string; readonly doubled: boolean; }
export interface AchievementUnlockedEvent { readonly achievementId: string; }
export interface AchievementClaimedEvent { readonly achievementId: string; }
export interface DailySignInClaimedEvent {
  readonly day: number;
  readonly salary: number;
  readonly cultivationExp: number;
  readonly mind: number;
  readonly grace: boolean;
}
export interface BuffAddedEvent { readonly buffId: string; readonly type: string; readonly multiplier: number; readonly durationSeconds: number; }
export interface BuffExpiredEvent { readonly buffId: string; readonly type: string; }
export interface DailyTaskProgressEvent { readonly taskId: string; readonly progress: number; readonly target: number; }
export interface DailyTaskCompletedEvent { readonly taskId: string; }
export interface DailyTaskClaimedEvent { readonly taskId: string; }
export interface TutorialStepChangedEvent { readonly step: string; readonly completed: boolean; }

export interface GameEvents extends Record<string, unknown> {
  readonly workerRecruited: WorkerRecruitedEvent;
  readonly gameSaved: GameSavedEvent;
  readonly recruitmentFailed: RecruitmentFailedEvent;
  readonly mergeCompleted: MergeCompletedEvent;
  readonly salaryChanged: SalaryChangedEvent;
  readonly idleSettled: IdleSettledEvent;
  readonly clockAnomaly: ClockAnomalyEvent;
  readonly phase2Refresh: Phase2RefreshEvent;
  readonly playerChanged: PlayerChangedEvent;
  readonly careerChanged: CareerChangedEvent;
  readonly kpiChanged: KpiChangedEvent;
  readonly mindChanged: MindChangedEvent;
  readonly workModeChanged: WorkModeChangedEvent;
  readonly eventChanged: EventChangedEvent;
  readonly promotionChanged: PromotionChangedEvent;
  readonly offlineRewardChanged: OfflineRewardChangedEvent;
  readonly achievementUnlocked: AchievementUnlockedEvent;
  readonly achievementClaimed: AchievementClaimedEvent;
  readonly dailySignInClaimed: DailySignInClaimedEvent;
  readonly buffAdded: BuffAddedEvent;
  readonly buffExpired: BuffExpiredEvent;
  readonly dailyTaskProgress: DailyTaskProgressEvent;
  readonly dailyTaskCompleted: DailyTaskCompletedEvent;
  readonly dailyTaskClaimed: DailyTaskClaimedEvent;
  readonly tutorialStepChanged: TutorialStepChangedEvent;
}

/** Domain events that should refresh Phase 2 HUD. UI must not poll every frame. */
export const PHASE2_REFRESH_EVENTS = [
  'mergeCompleted',
  'salaryChanged',
  'idleSettled',
  'phase2Refresh',
  'playerChanged',
  'careerChanged',
  'kpiChanged',
  'mindChanged',
  'workModeChanged',
  'eventChanged',
  'promotionChanged',
  'offlineRewardChanged',
  'achievementUnlocked',
  'buffAdded',
  'buffExpired',
  'dailyTaskProgress',
  'dailyTaskCompleted',
  'dailyTaskClaimed',
  'tutorialStepChanged',
] as const satisfies readonly (keyof GameEvents)[];
