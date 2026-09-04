/**
 * GameSnapshot — immutable, copy-on-read state snapshot for UI consumption.
 *
 * UI components MUST NOT hold mutable references to PlayerData or GameContext.
 * Instead, they read from a snapshot produced by GameFacade.snapshot().
 * A new snapshot is created on every state-changing event, so UI always
 * sees a consistent point-in-time view.
 */

import type { WorkMode, DailySignInState, DailyTaskState } from '../model/save-data';

/** Readonly snapshot of all player-visible state. Frozen after creation. */
export interface GameSnapshot {
  readonly salary: number;
  readonly cultivationExp: number;
  readonly careerLevel: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly performance: number;
  readonly workMode: WorkMode;
  readonly workSeconds: number;
  readonly fishingSeconds: number;
  readonly officeLevel: number;
  readonly sectId: string | null;
  readonly talentId: string | null;
  readonly maxWorkerLevel: number;
  readonly promotionFailCount: number;
  readonly unlockedAchievementIds: readonly string[];
  readonly claimedAchievementIds: readonly string[];
  readonly dailySignIn: DailySignInState | null;
  readonly dailyTasks: readonly DailyTaskState[];
  readonly dailyTaskDay: number;
  readonly tutorialStep: string;
  readonly tutorialCompleted: boolean;
  readonly lastSaveTime: number;
  readonly workerCount: number;
  readonly mindStatus: 'NORMAL' | 'BREAKDOWN';
}

/** Build a snapshot from raw player data fields. */
export function createSnapshot(fields: GameSnapshot): GameSnapshot {
  return Object.freeze({ ...fields });
}

/**
 * Compare two snapshots for shallow equality.
 * Used to decide whether UI needs to re-render.
 */
export function snapshotEqual(a: GameSnapshot, b: GameSnapshot): boolean {
  if (a === b) return true;
  // Fast path: compare primitives first
  if (
    a.salary !== b.salary ||
    a.cultivationExp !== b.cultivationExp ||
    a.careerLevel !== b.careerLevel ||
    a.mind !== b.mind ||
    a.maxMind !== b.maxMind ||
    a.performance !== b.performance ||
    a.workMode !== b.workMode ||
    a.workSeconds !== b.workSeconds ||
    a.fishingSeconds !== b.fishingSeconds ||
    a.officeLevel !== b.officeLevel ||
    a.sectId !== b.sectId ||
    a.talentId !== b.talentId ||
    a.maxWorkerLevel !== b.maxWorkerLevel ||
    a.promotionFailCount !== b.promotionFailCount ||
    a.dailyTaskDay !== b.dailyTaskDay ||
    a.tutorialStep !== b.tutorialStep ||
    a.tutorialCompleted !== b.tutorialCompleted ||
    a.lastSaveTime !== b.lastSaveTime ||
    a.workerCount !== b.workerCount ||
    a.mindStatus !== b.mindStatus
  ) {
    return false;
  }
  // Compare arrays
  if (a.unlockedAchievementIds.length !== b.unlockedAchievementIds.length) return false;
  if (a.claimedAchievementIds.length !== b.claimedAchievementIds.length) return false;
  if (a.dailyTasks.length !== b.dailyTasks.length) return false;
  return true;
}