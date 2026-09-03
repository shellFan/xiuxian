import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData, type WorkMode, type DailySignInState } from './save-data';

export interface PlayerDataOptions {
  readonly salary?: number;
  readonly maxWorkerLevel?: number;
  readonly lastSaveTime?: number;
  readonly workers?: readonly WorkerSaveData[];
  readonly cultivationExp?: number;
  readonly careerLevel?: number;
  readonly mind?: number;
  readonly maxMind?: number;
  readonly performance?: number;
  readonly sectId?: string | null;
  readonly talentId?: string | null;
  readonly workMode?: WorkMode;
  readonly workSeconds?: number;
  readonly fishingSeconds?: number;
  readonly kpiProgress?: Readonly<Record<string, number>>;
  readonly promotionFailCount?: number;
  readonly officeLevel?: number;
  readonly lastIdleSettlementId?: string | null;
  readonly salaryRemainder?: number;
  readonly cultivationRemainder?: number;
  readonly mindRemainder?: number;
  readonly workMindRemainder?: number;
  readonly fishingMindRemainder?: number;
  readonly unlockedAchievementIds?: readonly string[];
  readonly claimedAchievementIds?: readonly string[];
  readonly dailySignIn?: DailySignInState | null;
}

export class PlayerData {
  public salary: number;
  public maxWorkerLevel: number;
  public lastSaveTime: number;
  public workers: WorkerSaveData[];
  public cultivationExp: number;
  public careerLevel: number;
  public mind: number;
  public maxMind: number;
  public performance: number;
  public sectId: string | null;
  public talentId: string | null;
  public workMode: WorkMode;
  public workSeconds: number;
  public fishingSeconds: number;
  public kpiProgress: Record<string, number>;
  public promotionFailCount: number;
  /**
   * @deprecated Persisted compatibility mirror only. The office level is a pure function of
   * `careerLevel` (see OfficeService); no business logic must read this field. It is kept in
   * sync through `OfficeService.syncToCareer` for old-save compatibility and to populate the
   * save schema. Always derive via `context.office.getOfficeLevel()`.
   */
  public officeLevel: number;
  public lastIdleSettlementId: string | null;
  public salaryRemainder: number;
  public cultivationRemainder: number;
  public mindRemainder: number;
  public workMindRemainder: number;
  public fishingMindRemainder: number;
  public unlockedAchievementIds: string[];
  public claimedAchievementIds: string[];
  public dailySignIn: DailySignInState | null;

  public constructor(options: PlayerDataOptions = {}) {
    this.salary = options.salary ?? 0;
    this.maxWorkerLevel = options.maxWorkerLevel ?? 0;
    this.lastSaveTime = options.lastSaveTime ?? 0;
    this.workers = (options.workers ?? []).map((worker) => ({ ...worker }));
    this.cultivationExp = options.cultivationExp ?? 0;
    this.careerLevel = options.careerLevel ?? 1;
    this.mind = options.mind ?? 100;
    this.maxMind = options.maxMind ?? 100;
    this.performance = options.performance ?? 0;
    this.sectId = options.sectId ?? null;
    this.talentId = options.talentId ?? null;
    this.workMode = options.workMode ?? 'FISHING';
    this.workSeconds = options.workSeconds ?? 0;
    this.fishingSeconds = options.fishingSeconds ?? 0;
    this.kpiProgress = { ...(options.kpiProgress ?? {}) };
    this.promotionFailCount = options.promotionFailCount ?? 0;
    this.officeLevel = options.officeLevel ?? 1;
    this.lastIdleSettlementId = options.lastIdleSettlementId ?? null;
    this.salaryRemainder = normalizeRemainder(options.salaryRemainder);
    this.cultivationRemainder = normalizeRemainder(options.cultivationRemainder);
    this.mindRemainder = normalizeRemainder(options.mindRemainder);
    this.workMindRemainder = normalizeRemainder(options.workMindRemainder);
    this.fishingMindRemainder = normalizeRemainder(options.fishingMindRemainder);
    this.unlockedAchievementIds = [...(options.unlockedAchievementIds ?? [])];
    this.claimedAchievementIds = [...(options.claimedAchievementIds ?? [])];
    this.dailySignIn = options.dailySignIn ?? null;
  }

  public static createDefault(): PlayerData {
    return new PlayerData();
  }

  public toSaveData(): GameSaveData {
    const data: GameSaveData = {
      saveVersion: CURRENT_SAVE_VERSION,
      salary: this.salary,
      maxWorkerLevel: this.maxWorkerLevel,
      lastSaveTime: this.lastSaveTime,
      workers: this.workers.map((worker) => ({ ...worker })),
      cultivationExp: this.cultivationExp, careerLevel: this.careerLevel, mind: this.mind, maxMind: this.maxMind,
      performance: this.performance, sectId: this.sectId, talentId: this.talentId, workMode: this.workMode,
      workSeconds: this.workSeconds, fishingSeconds: this.fishingSeconds, kpiProgress: { ...this.kpiProgress },
      promotionFailCount: this.promotionFailCount, officeLevel: this.officeLevel, lastIdleSettlementId: this.lastIdleSettlementId,
      unlockedAchievementIds: [...this.unlockedAchievementIds],
      claimedAchievementIds: [...this.claimedAchievementIds],
      dailySignIn: this.dailySignIn ? { ...this.dailySignIn } : null,
    };
    if (this.salaryRemainder !== 0) Object.assign(data, { salaryRemainder: this.salaryRemainder });
    if (this.cultivationRemainder !== 0) Object.assign(data, { cultivationRemainder: this.cultivationRemainder });
    if (this.workMindRemainder !== 0) Object.assign(data, { workMindRemainder: this.workMindRemainder });
    if (this.fishingMindRemainder !== 0) Object.assign(data, { fishingMindRemainder: this.fishingMindRemainder });
    return data;
  }
}

function normalizeRemainder(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
