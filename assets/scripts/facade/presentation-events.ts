/**
 * GamePresentationEvents — semantic UI events for presentation layer.
 *
 * These events represent WHAT happened in user-facing terms, not which
 * service emitted them. They bridge the gap between domain events
 * (salaryChanged, mergeCompleted) and UI reactions (show toast, animate,
 * update counter with +N float text).
 *
 * The facade emits these alongside the categorized UiEvent stream.
 * UI components subscribe to presentation events for visual feedback
 * and to the UiEvent stream for data refresh.
 */

/** Semantic presentation events for UI feedback. */
export type PresentationEvent =
  | { type: 'SALARY_GAINED'; amount: number; total: number }
  | { type: 'CULTIVATION_GAINED'; amount: number; total: number }
  | { type: 'MIND_CHANGED'; delta: number; total: number; status: 'NORMAL' | 'BREAKDOWN' }
  | { type: 'WORKER_MERGED'; level: number; position: { row: number; column: number } }
  | { type: 'WORKER_RECRUITED'; level: number }
  | { type: 'PROMOTION_SUCCESS'; careerLevel: number }
  | { type: 'PROMOTION_FAILED'; careerLevel: number; reason: string }
  | { type: 'CAREER_EVENT_APPEARED'; eventId: string; title: string }
  | { type: 'CAREER_EVENT_RESOLVED'; eventId: string }
  | { type: 'ACHIEVEMENT_UNLOCKED'; achievementId: string }
  | { type: 'ACHIEVEMENT_CLAIMED'; achievementId: string }
  | { type: 'DAILY_SIGN_IN'; day: number; rewards: { salary: number; cultivation: number; mind: number } }
  | { type: 'BUFF_ACTIVATED'; buffId: string; buffType: string; durationSeconds: number }
  | { type: 'BUFF_EXPIRED'; buffId: string; buffType: string }
  | { type: 'OFFLINE_REWARD_CLAIMED'; salary: number; cultivation: number; doubled: boolean }
  | { type: 'TUTORIAL_STEP'; step: string; completed: boolean }
  | { type: 'IDLE_SETTLED'; salary: number; cultivation: number; elapsedSeconds: number }
  | { type: 'WORK_MODE_CHANGED'; mode: 'WORK' | 'FISHING' }
  | { type: 'GAME_SAVED'; reason: string }
  | { type: 'ERROR'; code: string; message: string };

/** Type guard helpers for presentation events. */
export function isSalaryGained(event: PresentationEvent): event is PresentationEvent & { type: 'SALARY_GAINED' } {
  return event.type === 'SALARY_GAINED';
}

export function isCultivationGained(event: PresentationEvent): event is PresentationEvent & { type: 'CULTIVATION_GAINED' } {
  return event.type === 'CULTIVATION_GAINED';
}

export function isPromotionResult(event: PresentationEvent): event is PresentationEvent & { type: 'PROMOTION_SUCCESS' | 'PROMOTION_FAILED' } {
  return event.type === 'PROMOTION_SUCCESS' || event.type === 'PROMOTION_FAILED';
}

export function isError(event: PresentationEvent): event is PresentationEvent & { type: 'ERROR' } {
  return event.type === 'ERROR';
}

/** All presentation event type strings. */
export const PRESENTATION_EVENT_TYPES: readonly string[] = [
  'SALARY_GAINED',
  'CULTIVATION_GAINED',
  'MIND_CHANGED',
  'WORKER_MERGED',
  'WORKER_RECRUITED',
  'PROMOTION_SUCCESS',
  'PROMOTION_FAILED',
  'CAREER_EVENT_APPEARED',
  'CAREER_EVENT_RESOLVED',
  'ACHIEVEMENT_UNLOCKED',
  'ACHIEVEMENT_CLAIMED',
  'DAILY_SIGN_IN',
  'BUFF_ACTIVATED',
  'BUFF_EXPIRED',
  'OFFLINE_REWARD_CLAIMED',
  'TUTORIAL_STEP',
  'IDLE_SETTLED',
  'WORK_MODE_CHANGED',
  'GAME_SAVED',
  'ERROR',
];