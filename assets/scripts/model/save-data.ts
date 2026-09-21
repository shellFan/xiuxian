export const CURRENT_SAVE_VERSION = 8;

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
export interface OvertimeStats { totalSeconds: number; paidSeconds: number; freeSeconds: number; sessions: number; nightSessions: number; freeSessions: number; consecutiveDays: number; longestStreak: number; }
export type OvertimeFatigueState = 'RESTED' | 'TIRED' | 'EXHAUSTED';

/** 活跃/待接受加班会话的持久化形态（V4：重启后恢复，不允许靠重开清加班）。 */
export interface OvertimeSessionState {
  source: Exclude<OvertimeSource, null>;
  free: boolean;
  plannedSeconds: number;
  elapsedSeconds: number;
  mode: WorkMode | null;
  status: 'OFFERED' | 'ACTIVE';
  startedAt: number | null;
}

// ── Gameplay V4 职场地狱存档类型 ────────────────────────────────────────────

export type EvidenceType =
  | 'GIT_LOG' | 'CHAT_RECORD' | 'REQUIREMENT_DOC' | 'MEETING_NOTE' | 'EMAIL'
  | 'TEST_REPORT' | 'DEPLOY_LOG' | 'MONITOR_LOG' | 'RISK_CONFIRMATION' | 'TICKET_HISTORY';

export interface EvidenceItemState {
  readonly id: string;
  readonly type: EvidenceType;
  readonly label: string;
  readonly dayIndex: number;
  readonly createdAt: number;
}

export type IncidentType =
  | 'PAYMENT_FAILURE' | 'DATABASE_LOCK' | 'SLOW_SQL' | 'REDIS_OUTAGE' | 'CACHE_AVALANCHE'
  | 'NGINX_502' | 'DISK_FULL' | 'CPU_HIGH' | 'OOM' | 'MESSAGE_BACKLOG'
  | 'CERT_EXPIRED' | 'THIRD_PARTY_FAILURE' | 'BAD_DEPLOY' | 'CONFIG_ERROR';

export type IncidentSeverity = 'S1' | 'S2' | 'S3' | 'S4';
export type IncidentStatus = 'DETECTED' | 'MITIGATING' | 'RECOVERED' | 'POSTMORTEM_DONE' | 'CLOSED';

export interface IncidentState {
  readonly id: string;
  readonly type: IncidentType;
  readonly severity: IncidentSeverity;
  readonly dayIndex: number;
  readonly createdAt: number;
  status: IncidentStatus;
  /** 根因（复盘后填写）。 */
  rootCause?: string;
  /** 是否由强行上线/未测试发布引发（影响复盘责任判定）。 */
  forcedRelease: boolean;
  riskConfirmed: boolean;
  mitigationSeconds: number;
  /** 结案摘要。 */
  summary?: string;
}

export type ResponsibilityStatus = 'OPEN' | 'DISPUTED' | 'PLAYER_ACCEPTED' | 'PLAYER_CLEARED' | 'RESOLVED';

export interface ResponsibilityCaseState {
  readonly id: string;
  readonly createdDay: number;
  readonly createdAt: number;
  /** 甩锅来源 NPC。 */
  readonly sourceNpc: string;
  /** 真正责任人 NPC（可能就是玩家自己）。 */
  readonly actualOwnerNpc: string;
  /** 是否试图甩锅给玩家。 */
  readonly blamedPlayer: boolean;
  readonly cause: string;
  readonly severity: IncidentSeverity;
  readonly relatedTaskId?: string;
  readonly relatedIncidentId?: string;
  /** 支持玩家反击的证据 id。 */
  evidenceIds: string[];
  status: ResponsibilityStatus;
  resolution?: string;
  /** 结案时对玩家的绩效影响（正=反击成功/背锅有赏）。 */
  performanceDelta: number;
  relationshipEffects: Record<string, number>;
}

/** 技术债领域。 */
export type TechDebtDomain = 'PAYMENT' | 'LOGIN' | 'ORDER' | 'REPORT' | 'MESSAGE' | 'DEPLOY' | 'INFRA';

export type AssignedTaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type AssignedTaskSource = 'BOSS' | 'COLLEAGUE' | 'PRODUCT' | 'TEST' | 'CLIENT' | 'INCIDENT' | 'SYSTEM';

export interface AssignedTaskState {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly priority: AssignedTaskPriority;
  readonly source: AssignedTaskSource;
  readonly createdDay: number;
  readonly createdAt: number;
  status: 'OPEN' | 'DONE' | 'REFUSED' | 'EXPIRED';
  readonly rewardSalary: number;
  readonly rewardPerformance: number;
  readonly rewardCultivation: number;
  readonly rewardMind: number;
  /** 假 P0（拒绝才是对的）。 */
  readonly isFakeP0: boolean;
}

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
  /** Workday start timestamp for the latest completed overtime session; used to maintain a calendar-day streak. */
  readonly lastOvertimeWorkdayStartAt?: number;
  /** Temporary after-effects from overtime; cleared by rest/recovery, never a currency. */
  readonly overtimeFatigue?: OvertimeFatigueState;

  // ── Gameplay V4 字段（saveVersion 8；旧存档迁移时补默认值） ──
  /** 进行中/待接受的加班会话（跨重启恢复）。 */
  readonly activeOvertimeSession?: OvertimeSessionState | null;
  /** 玩家持有的证据（解锁事件选项）。 */
  readonly evidence?: readonly EvidenceItemState[];
  /** 责任判定案件（甩锅/复盘）。 */
  readonly responsibilityCases?: readonly ResponsibilityCaseState[];
  /** 生产事故历史。 */
  readonly incidents?: readonly IncidentState[];
  /** 领域技术债（0~100）。 */
  readonly technicalDebt?: Readonly<Record<string, number>>;
  /** 被指派的临时任务（含假 P0）。 */
  readonly assignedTasks?: readonly AssignedTaskState[];
  /** 终身统计（牛马档案）：累计加班秒/摸鱼秒/背锅/反击/事故/Boss 等。 */
  readonly lifetimeStats?: Readonly<Record<string, number>>;
  /** 进行中的项目战斗（V4 战斗竖切；结构由 v3/battle-service 校验）。 */
  readonly activeBattleRun?: unknown;
}
