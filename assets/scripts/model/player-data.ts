import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData, type WorkMode, type DailySignInState, type DailyTaskState, type ActiveTaskState, type ActivityDurationsState, type GameDayState, type PendingEventState, type DaySummaryState, type WeeklySummaryState, type EventChainState } from './save-data';

export interface PlayerDataOptions {
  readonly salary?: number;
  /** @deprecated Board/merge system. PC V1 does not use workers on a grid. */
  readonly maxWorkerLevel?: number;
  /** @deprecated Board/merge system. PC V1 does not use workers on a grid. */
  readonly workers?: readonly WorkerSaveData[];
  readonly lastSaveTime?: number;
  readonly cultivationExp?: number;
  readonly careerLevel?: number;
  readonly mind?: number;
  readonly maxMind?: number;
  readonly performance?: number;
  readonly sectId?: string | null;
  readonly lastSectSwitchTime?: number;
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
  readonly dailyTasks?: readonly DailyTaskState[];
  readonly dailyTaskDay?: number;
  readonly tutorialStep?: string;
  readonly tutorialCompleted?: boolean;
  readonly spiritStones?: number;
  readonly lastCultivateTime?: number;
  readonly activeTasks?: readonly ActiveTaskState[];
  readonly craftedItemIds?: readonly string[];
  // ── Gameplay V2 ──
  readonly cultivatingSeconds?: number;
  readonly socialSeconds?: number;
  readonly performanceRemainder?: number;
  readonly gameDay?: GameDayState | null;
  readonly innerDemon?: number;
  readonly activeDemons?: readonly string[];
  readonly materials?: Readonly<Record<string, number>>;
  readonly ownedTechniques?: readonly string[];
  readonly techniqueLevels?: Readonly<Record<string, number>>;
  readonly equippedTechniques?: readonly (string | null)[];
  readonly ownedEquipment?: readonly string[];
  readonly equippedEquipment?: Readonly<Record<string, string | null>>;
  readonly relationships?: Readonly<Record<string, number>>;
  readonly eventFlags?: Readonly<Record<string, boolean>>;
  readonly eventChainState?: Readonly<Record<string, EventChainState>>;
  readonly eventCooldowns?: Readonly<Record<string, number>>;
  readonly firedEvents?: readonly string[];
  readonly pendingEvents?: readonly PendingEventState[];
  readonly dailyHistory?: readonly DaySummaryState[];
  readonly weeklyHistory?: readonly WeeklySummaryState[];
  readonly devTimeOffsetMs?: number;
  readonly unlockState?: Readonly<Record<string, boolean>>;
}

export class PlayerData {
  public salary: number;
  /**
   * @deprecated Board/merge system field. PC V1 does not use workers on a grid.
   * Kept for save/load backward compatibility only.
   */
  public maxWorkerLevel: number;
  public lastSaveTime: number;
  /**
   * @deprecated Board/merge system field. PC V1 does not use workers on a grid.
   * Kept for save/load backward compatibility only.
   */
  public workers: WorkerSaveData[];
  public cultivationExp: number;
  public careerLevel: number;
  public mind: number;
  public maxMind: number;
  public performance: number;
  public sectId: string | null;
  public lastSectSwitchTime: number;
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
  public dailyTasks: DailyTaskState[];
  public dailyTaskDay: number;
  public tutorialStep: string;
  public tutorialCompleted: boolean;
  public spiritStones: number;
  public lastCultivateTime: number;
  public activeTasks: ActiveTaskState[];
  /** Crafted item recipe IDs (PC V1 craft system). */
  public craftedItemIds: string[];
  // ── Gameplay V2 ──
  public cultivatingSeconds: number;
  public socialSeconds: number;
  public performanceRemainder: number;
  public gameDay: GameDayState | null;
  public innerDemon: number;
  public activeDemons: string[];
  public materials: Record<string, number>;
  public ownedTechniques: string[];
  public techniqueLevels: Record<string, number>;
  public equippedTechniques: (string | null)[];
  public ownedEquipment: string[];
  public equippedEquipment: Record<string, string | null>;
  public relationships: Record<string, number>;
  public eventFlags: Record<string, boolean>;
  public eventChainState: Record<string, EventChainState>;
  public eventCooldowns: Record<string, number>;
  public firedEvents: string[];
  public pendingEvents: PendingEventState[];
  public dailyHistory: DaySummaryState[];
  public weeklyHistory: WeeklySummaryState[];
  public devTimeOffsetMs: number;
  public unlockState: Record<string, boolean>;

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
    this.lastSectSwitchTime = options.lastSectSwitchTime ?? 0;
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
    this.dailyTasks = (options.dailyTasks ?? []).map((t) => ({ ...t }));
    this.dailyTaskDay = options.dailyTaskDay ?? -1;
    this.tutorialStep = options.tutorialStep ?? 'FIRST_RECRUIT';
    this.tutorialCompleted = options.tutorialCompleted ?? false;
    this.spiritStones = options.spiritStones ?? 0;
    this.lastCultivateTime = options.lastCultivateTime ?? 0;
    this.activeTasks = (options.activeTasks ?? []).map((t) => ({ ...t }));
    this.craftedItemIds = [...(options.craftedItemIds ?? [])];
    this.cultivatingSeconds = options.cultivatingSeconds ?? 0;
    this.socialSeconds = options.socialSeconds ?? 0;
    this.performanceRemainder = normalizeRemainder(options.performanceRemainder);
    this.gameDay = options.gameDay ? cloneGameDay(options.gameDay) : null;
    this.innerDemon = clampInt(options.innerDemon, 0, 100, 0);
    this.activeDemons = [...(options.activeDemons ?? [])];
    this.materials = { ...(options.materials ?? {}) };
    this.ownedTechniques = [...(options.ownedTechniques ?? [])];
    this.techniqueLevels = { ...(options.techniqueLevels ?? {}) };
    this.equippedTechniques = [...(options.equippedTechniques ?? [null, null, null])];
    this.ownedEquipment = [...(options.ownedEquipment ?? [])];
    this.equippedEquipment = { ...(options.equippedEquipment ?? {}) };
    this.relationships = { ...(options.relationships ?? {}) };
    this.eventFlags = { ...(options.eventFlags ?? {}) };
    this.eventChainState = { ...(options.eventChainState ?? {}) };
    this.eventCooldowns = { ...(options.eventCooldowns ?? {}) };
    this.firedEvents = [...(options.firedEvents ?? [])];
    this.pendingEvents = (options.pendingEvents ?? []).map((e) => ({ ...e }));
    this.dailyHistory = (options.dailyHistory ?? []).map((d) => ({ ...d }));
    this.weeklyHistory = (options.weeklyHistory ?? []).map((w) => ({ ...w }));
    this.devTimeOffsetMs = options.devTimeOffsetMs ?? 0;
    this.unlockState = { ...(options.unlockState ?? {}) };
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
      performance: this.performance, sectId: this.sectId, lastSectSwitchTime: this.lastSectSwitchTime, talentId: this.talentId, workMode: this.workMode,
      workSeconds: this.workSeconds, fishingSeconds: this.fishingSeconds, kpiProgress: { ...this.kpiProgress },
      promotionFailCount: this.promotionFailCount, officeLevel: this.officeLevel, lastIdleSettlementId: this.lastIdleSettlementId,
      unlockedAchievementIds: [...this.unlockedAchievementIds],
      claimedAchievementIds: [...this.claimedAchievementIds],
      dailySignIn: this.dailySignIn ? { ...this.dailySignIn } : null,
      dailyTasks: this.dailyTasks.map((t) => ({ ...t })),
      dailyTaskDay: this.dailyTaskDay,
      tutorialStep: this.tutorialStep,
      tutorialCompleted: this.tutorialCompleted,
      spiritStones: this.spiritStones,
      lastCultivateTime: this.lastCultivateTime,
      activeTasks: this.activeTasks.map((t) => ({ ...t })),
      craftedItemIds: [...this.craftedItemIds],
      cultivatingSeconds: this.cultivatingSeconds,
      socialSeconds: this.socialSeconds,
      gameDay: this.gameDay ? cloneGameDay(this.gameDay) : null,
      innerDemon: this.innerDemon,
      activeDemons: [...this.activeDemons],
      materials: { ...this.materials },
      ownedTechniques: [...this.ownedTechniques],
      techniqueLevels: { ...this.techniqueLevels },
      equippedTechniques: [...this.equippedTechniques],
      ownedEquipment: [...this.ownedEquipment],
      equippedEquipment: { ...this.equippedEquipment },
      relationships: { ...this.relationships },
      eventFlags: { ...this.eventFlags },
      eventChainState: { ...this.eventChainState },
      eventCooldowns: { ...this.eventCooldowns },
      firedEvents: [...this.firedEvents],
      pendingEvents: this.pendingEvents.map((e) => ({ ...e })),
      dailyHistory: this.dailyHistory.map((d) => ({ ...d })),
      weeklyHistory: this.weeklyHistory.map((w) => ({ ...w })),
      devTimeOffsetMs: this.devTimeOffsetMs,
      unlockState: { ...this.unlockState },
    };
    if (this.performanceRemainder !== 0) Object.assign(data, { performanceRemainder: this.performanceRemainder });
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

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function cloneGameDay(day: GameDayState): GameDayState {
  return {
    ...day,
    durations: { ...day.durations },
    income: { ...day.income },
    situationIds: [...day.situationIds],
  };
}

export function emptyActivityDurations(): ActivityDurationsState {
  return { work: 0, fishing: 0, cultivating: 0, social: 0, meeting: 0, lunch: 0 };
}
