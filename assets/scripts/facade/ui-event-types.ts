/**
 * UI Event Stream — categorized events for UI subscription.
 *
 * Instead of UI subscribing to 25+ individual GameEvents, it subscribes
 * to a small set of categorized event channels. Each channel groups
 * related domain events into a single semantic notification.
 *
 * This reduces UI coupling: components only care about WHAT changed
 * (resources, career, mind) not WHICH service emitted it.
 */

/** 16 categorized UI event channels. */
export type UiEventCategory =
  | 'STATE_CHANGED'        // Generic state change (fallback)
  | 'RESOURCE_CHANGED'     // salary, cultivation, mind
  | 'WORK_MODE_CHANGED'    // work/fishing toggle
  | 'CAREER_CHANGED'       // career level, promotion
  | 'BOARD_CHANGED'        // worker merge, recruit
  | 'EVENT_CHANGED'        // career event appeared/resolved
  | 'ACHIEVEMENT_CHANGED'  // unlock/claim
  | 'DAILY_CHANGED'        // sign-in, daily tasks
  | 'BUFF_CHANGED'         // buff added/expired
  | 'TUTORIAL_CHANGED'     // tutorial step advanced
  | 'SAVE_COMPLETED'       // save finished
  | 'OFFLINE_REWARD'       // offline reward calculated
  | 'REWARD_REQUESTED'     // reward ad flow started
  | 'REWARD_COMPLETED'     // reward ad flow ended
  | 'ERROR_OCCURRED'       // error boundary caught
  | 'SETTINGS_CHANGED';    // settings toggled

/** Payload for a UI event notification. */
export interface UiEvent {
  /** The category channel this event was published on. */
  readonly category: UiEventCategory;
  /** The original domain event name (e.g. 'salaryChanged'). */
  readonly source: string;
  /** Timestamp (ms since epoch) when the event was emitted. */
  readonly timestamp: number;
  /** Optional detail payload from the original domain event. */
  readonly detail?: unknown;
}

/** Maps GameEvents keys to UiEventCategory. */
const EVENT_CATEGORY_MAP: Readonly<Record<string, UiEventCategory>> = {
  salaryChanged: 'RESOURCE_CHANGED',
  idleSettled: 'RESOURCE_CHANGED',
  mindChanged: 'RESOURCE_CHANGED',
  playerChanged: 'STATE_CHANGED',
  workModeChanged: 'WORK_MODE_CHANGED',
  careerChanged: 'CAREER_CHANGED',
  kpiChanged: 'CAREER_CHANGED',
  promotionChanged: 'CAREER_CHANGED',
  workerRecruited: 'BOARD_CHANGED',
  mergeCompleted: 'BOARD_CHANGED',
  recruitmentFailed: 'BOARD_CHANGED',
  eventChanged: 'EVENT_CHANGED',
  achievementUnlocked: 'ACHIEVEMENT_CHANGED',
  achievementClaimed: 'ACHIEVEMENT_CHANGED',
  dailySignInClaimed: 'DAILY_CHANGED',
  dailyTaskProgress: 'DAILY_CHANGED',
  dailyTaskCompleted: 'DAILY_CHANGED',
  dailyTaskClaimed: 'DAILY_CHANGED',
  buffAdded: 'BUFF_CHANGED',
  buffExpired: 'BUFF_CHANGED',
  tutorialStepChanged: 'TUTORIAL_CHANGED',
  gameSaved: 'SAVE_COMPLETED',
  offlineRewardChanged: 'OFFLINE_REWARD',
  clockAnomaly: 'ERROR_OCCURRED',
  phase2Refresh: 'STATE_CHANGED',
};

/**
 * Resolve a domain event name to its UI category.
 * Returns 'STATE_CHANGED' as fallback for unmapped events.
 */
export function resolveCategory(eventName: string): UiEventCategory {
  return EVENT_CATEGORY_MAP[eventName] ?? 'STATE_CHANGED';
}

/** All 16 categories as a readonly array. */
export const ALL_UI_CATEGORIES: readonly UiEventCategory[] = [
  'STATE_CHANGED',
  'RESOURCE_CHANGED',
  'WORK_MODE_CHANGED',
  'CAREER_CHANGED',
  'BOARD_CHANGED',
  'EVENT_CHANGED',
  'ACHIEVEMENT_CHANGED',
  'DAILY_CHANGED',
  'BUFF_CHANGED',
  'TUTORIAL_CHANGED',
  'SAVE_COMPLETED',
  'OFFLINE_REWARD',
  'REWARD_REQUESTED',
  'REWARD_COMPLETED',
  'ERROR_OCCURRED',
  'SETTINGS_CHANGED',
];