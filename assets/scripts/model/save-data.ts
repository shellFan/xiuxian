export const CURRENT_SAVE_VERSION = 4;

export type WorkMode = 'WORK' | 'FISHING';

export interface DailySignInState {
  /** Timestamp (ms) of the last sign-in claim */
  readonly lastClaimTime: number;
  /** Current day in the 7-day cycle (1-based) */
  readonly currentDay: number;
}

export interface WorkerSaveData {
  readonly id: string;
  readonly level: number;
  readonly row: number;
  readonly column: number;
}

export interface GameSaveData {
  readonly saveVersion: number;
  readonly salary: number;
  readonly maxWorkerLevel: number;
  readonly lastSaveTime: number;
  readonly workers: readonly WorkerSaveData[];
  readonly cultivationExp: number;
  readonly careerLevel: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly performance: number;
  readonly sectId: string | null;
  readonly talentId: string | null;
  readonly workMode: WorkMode;
  readonly workSeconds: number;
  readonly fishingSeconds: number;
  readonly kpiProgress: Readonly<Record<string, number>>;
  readonly promotionFailCount: number;
  readonly officeLevel: number;
  readonly lastIdleSettlementId: string | null;
  readonly salaryRemainder?: number;
  readonly cultivationRemainder?: number;
  readonly mindRemainder?: number;
  readonly workMindRemainder?: number;
  readonly fishingMindRemainder?: number;
  readonly unlockedAchievementIds?: readonly string[];
  readonly dailySignIn?: DailySignInState | null;
}
