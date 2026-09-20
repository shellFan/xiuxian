export const CURRENT_SAVE_VERSION = 7;

/** V2 四种核心工作行为（§18）。 */
export type WorkMode = 'WORK' | 'FISHING' | 'CULTIVATING' | 'SOCIAL';

export interface DailySignInState {
  /** Timestamp (ms) of the last sign-in claim */
  readonly lastClaimTime: number;
  /** Current day in the 7-day cycle (1-based) */
  readonly currentDay: number;
}

export interface DailyTaskState {
  readonly taskId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

/** Task type for the core gameplay task system. */
export type TaskType = 'DAILY' | 'WORK' | 'CULTIVATION' | 'EVENT';

// ── Gameplay V2 存档类型（saveVersion 6） ──────────────────────────────────

/** 当日活动时长（秒）。 */
export interface ActivityDurationsState {
  work: number;
  fishing: number;
  cultivating: number;
  social: number;
  meeting: number;
  lunch: number;
  overtime: number;
  incident: number;
}

export type OvertimeSource = 'VOLUNTARY' | 'REQUESTED' | 'FORCED' | 'EMERGENCY' | 'WEEKEND' | 'COMPENSATED' | null;
export type OvertimeStatus = 'NONE' | 'OFFERED' | 'ACTIVE' | 'COMPLETED';
export interface WorkTimelineEntry { id: string; kind: 'MODE_TRANSITION' | 'EVENT'; occurredAt: number; eventId?: string; }
export interface OvertimeStats { totalSeconds: number; paidSeconds: number; freeSeconds: number; sessions: number; consecutiveDays: number; longestStreak: number; }

/** 单个工作日的持久化状态。 */
export interface GameDayState {
  /** 第几个牛马修仙日，从 1 开始。 */
  dayIndex: number;
  /** 真实星期 0=周日…6=周六。 */
  weekday: number;
  /** 该工作日开始时的现实时间戳。 */
  startedAt: number;
  /** 日结算是否已完成（exactly once 保证）。 */
  settled: boolean;
  durations: ActivityDurationsState;
  income: { salary: number; cultivation: number; performance: number };
  eventsHandled: number;
  materialsGained: number;
  /** 今日局势 modifier id（公司/老板/项目/个人 各一条）。 */
  situationIds: string[];
  overtimeSource: OvertimeSource;
  overtimeStatus: OvertimeStatus;
  overtimeFree: boolean;
  settlementInputs: { paidFishingSalary: number };
  eventHistory: WorkTimelineEntry[];
}

/** 离线积压的重要选择事件。 */
export interface PendingEventState {
  uid: string;
  eventId: string;
  occurredAt: number;
  priority: 'CRITICAL' | 'IMPORTANT' | 'NORMAL' | 'FLAVOR';
}

/** 日结算历史（保留最近 90 天，更早丢弃）。 */
export interface DaySummaryState {
  dayIndex: number;
  salary: number;
  cultivation: number;
  performance: number;
  mindEnd: number;
  innerDemonEnd: number;
  titleId: string;
  rank: string;
}

/** 周结算历史。 */
export interface WeeklySummaryState {
  weekIndex: number;
  salary: number;
  cultivation: number;
  performance: number;
  workSeconds: number;
  eventsHandled: number;
  titleId: string;
}

/** 事件链进度。 */
export interface EventChainState {
  stage: number;
  lastDayIndex: number;
}

/** A single active task tracked by the TaskService. */
export interface ActiveTaskState {
  readonly taskId: string;
  readonly taskType: TaskType;
  readonly name: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly startedAt: number;
  readonly rewardSalary: number;
  readonly rewardCultivation: number;
  readonly rewardSpiritStones: number;
  /** Optional performance delta granted on claim (Web V1 design tasks). */
  rewardPerformance?: number;
  /** Optional mind delta granted on claim — may be negative (design: 道心-5). */
  rewardMind?: number;
  completed: boolean;
  claimed: boolean;
}

/** @deprecated Board/merge system worker data. PC V1 does not use workers on a grid. */
export interface WorkerSaveData {
  readonly id: string;
  readonly level: number;
  readonly row: number;
  readonly column: number;
}

export interface GameSaveData {
  readonly saveVersion: number;
  readonly salary: number;
  /** @deprecated Board/merge system. PC V1 does not use workers on a grid. */
  readonly maxWorkerLevel: number;
  readonly lastSaveTime: number;
  /** @deprecated Board/merge system. PC V1 does not use workers on a grid. */
  readonly workers: readonly WorkerSaveData[];
  readonly cultivationExp: number;
  readonly careerLevel: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly performance: number;
  readonly sectId: string | null;
  readonly lastSectSwitchTime?: number;
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
  readonly cultivatingMindRemainder?: number;
  readonly socialMindRemainder?: number;
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

  // ── Gameplay V2 字段（saveVersion 6；旧存档迁移时补默认值） ──
  readonly gameDay?: GameDayState | null;
  readonly innerDemon?: number;
  readonly activeDemons?: readonly string[];
  readonly materials?: Readonly<Record<string, number>>;
  readonly ownedTechniques?: readonly string[];
  readonly techniqueLevels?: Readonly<Record<string, number>>;
  /** [主修, 辅助1, 辅助2]，元素可为 null。 */
  readonly equippedTechniques?: readonly (string | null)[];
  readonly ownedEquipment?: readonly string[];
  /** 槽位 → 装备 id（DESK / BADGE / ACCESSORY）。 */
  readonly equippedEquipment?: Readonly<Record<string, string | null>>;
  readonly relationships?: Readonly<Record<string, number>>;
  readonly eventFlags?: Readonly<Record<string, boolean>>;
  readonly eventChainState?: Readonly<Record<string, EventChainState>>;
  readonly eventCooldowns?: Readonly<Record<string, number>>;
  /** 已触发过的一次性事件 id。 */
  readonly firedEvents?: readonly string[];
  readonly pendingEvents?: readonly PendingEventState[];
  readonly dailyHistory?: readonly DaySummaryState[];
  readonly weeklyHistory?: readonly WeeklySummaryState[];
  readonly devTimeOffsetMs?: number;
  /** 渐进解锁（craft/technique/npc/sect/advancedEquipment…）。 */
  readonly unlockState?: Readonly<Record<string, boolean>>;
  /** 终身模式时长（秒）。 */
  readonly cultivatingSeconds?: number;
  readonly socialSeconds?: number;
  readonly performanceRemainder?: number;
  readonly compTime?: number;
  readonly overtimeStats?: OvertimeStats;
}
