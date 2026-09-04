/**
 * Phase 5 ViewModels — facade-driven, immutable UI data contracts.
 *
 * UI components MUST NOT hold mutable references to GameContext, PlayerData,
 * or services. They read from ViewModels produced by builder functions that
 * derive data exclusively from GameFacade.
 *
 * Each ViewModel is a frozen, point-in-time snapshot. Re-build when the
 * facade's UI event stream signals a change.
 */

import type { GameFacade } from '../facade/game-facade';
import type { AchievementStatus, AchievementCategory } from '../services/achievement-service';
import type { DailyTaskProgress } from '../services/daily-task-service';
import type { TutorialStep } from '../services/tutorial-service';
import type { SettingsService } from '../services/settings-service';
import type { WorkMode } from '../model/save-data';

// ── Main HUD ────────────────────────────────────────────────────────────────

/** Top-level HUD data: identity bar, resource bar, KPI summary. */
export interface MainHUDViewModel {
  readonly careerLevel: number;
  readonly careerName: string;
  readonly realm: string;
  readonly salary: number;
  readonly performance: number;
  readonly cultivationExp: number;
  readonly cultivationRequired: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly mindStatusText: string;
  readonly mindStatus: 'NORMAL' | 'BREAKDOWN';
  readonly workMode: WorkMode;
  readonly kpiCompleted: number;
  readonly kpiTotal: number;
  readonly kpiAllCompleted: boolean;
  readonly workerCount: number;
  readonly boardCapacity: number;
  readonly boardIsFull: boolean;
  readonly sectName: string;
  readonly talentName: string;
  readonly officeName: string;
}

// ── Merge Board ─────────────────────────────────────────────────────────────

export interface MergeCellViewModel {
  readonly row: number;
  readonly column: number;
  readonly occupied: boolean;
  readonly workerId: string | null;
  readonly workerLevel: number | null;
}

/** 4×4 merge board grid state. */
export interface MergeBoardViewModel {
  readonly rows: number;
  readonly columns: number;
  readonly cells: readonly MergeCellViewModel[];
  readonly maxWorkerLevel: number;
  readonly isFull: boolean;
  readonly workerCount: number;
}

// ── Career ──────────────────────────────────────────────────────────────────

export interface CareerViewModel {
  readonly careerLevel: number;
  readonly careerName: string;
  readonly realm: string;
  readonly salary: number;
  readonly performance: number;
  readonly cultivation: number;
  readonly cultivationRequired: number;
  readonly mind: number;
  readonly maxMind: number;
  readonly mindStatusText: string;
  readonly sectName: string;
  readonly talentName: string;
  readonly workMode: WorkMode;
  readonly officeName: string;
  readonly canPromote: boolean;
  readonly promotionReason: string;
}

// ── KPI ─────────────────────────────────────────────────────────────────────

export interface KpiItemViewModel {
  readonly type: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
}

export interface KpiViewModel {
  readonly careerLevel: number;
  readonly items: readonly KpiItemViewModel[];
  readonly completedCount: number;
  readonly totalCount: number;
  readonly allCompleted: boolean;
}

// ── Promotion ───────────────────────────────────────────────────────────────

export interface PromotionViewModel {
  readonly allowed: boolean;
  readonly reason: string;
  readonly probability: number;
  readonly needsRetry: boolean;
  readonly options: ReadonlyArray<{ readonly id: string; readonly name: string; readonly description: string }>;
}

// ── Event ───────────────────────────────────────────────────────────────────

export interface EventViewModel {
  readonly pending: boolean;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly choices: ReadonlyArray<{ readonly id: string; readonly text: string }>;
}

// ── Achievement ─────────────────────────────────────────────────────────────

export interface AchievementItemViewModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AchievementCategory;
  readonly status: AchievementStatus;
  readonly isHidden: boolean;
}

export interface AchievementViewModel {
  readonly items: readonly AchievementItemViewModel[];
  readonly unlockedCount: number;
  readonly claimedCount: number;
  readonly totalCount: number;
  readonly categories: readonly AchievementCategory[];
}

// ── Daily Task ──────────────────────────────────────────────────────────────

export interface DailyTaskItemViewModel {
  readonly taskId: string;
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimed: boolean;
}

export interface DailyTaskViewModel {
  readonly tasks: readonly DailyTaskItemViewModel[];
  readonly completedCount: number;
  readonly claimedCount: number;
  readonly totalCount: number;
  readonly dayIndex: number;
}

// ── Offline Reward ──────────────────────────────────────────────────────────

export interface OfflineRewardViewModel {
  readonly hasReward: boolean;
  readonly settlementId: string;
  readonly offlineSeconds: number;
  readonly baseSalary: number;
  readonly baseCultivation: number;
  readonly baseMind: number;
  readonly totalSalary: number;
  readonly totalCultivation: number;
  readonly totalMind: number;
  readonly isSettled: boolean;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface SettingsViewModel {
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly vibrationEnabled: boolean;
  readonly performanceMode: boolean;
  readonly language: string;
  readonly analyticsConsent: boolean;
  readonly saveVersion: number;
  readonly lastSaveTime: number;
}

// ── Tutorial ────────────────────────────────────────────────────────────────

export interface TutorialViewModel {
  readonly currentStep: TutorialStep | 'NONE';
  readonly isCompleted: boolean;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly steps: readonly TutorialStep[];
}

// ── Sect ────────────────────────────────────────────────────────────────────

export interface SectViewModel {
  readonly currentSectId: string | null;
  readonly currentSectName: string;
  readonly sects: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly selected: boolean;
  }>;
}

// ── Mind status text helper ─────────────────────────────────────────────────

/**
 * Five-tier mind status text. Uses a ratio against maxMind so it stays
 * correct if maxMind ever changes, while matching the absolute 0/29/49/79/100
 * thresholds when maxMind is 100.
 */
export function mindStatusText(mind: number, maxMind: number): string {
  if (mind <= 0) return '彻底破防';
  const ratio = maxMind > 0 ? mind / maxMind : 0;
  if (ratio >= 0.8) return '精神饱满';
  if (ratio >= 0.5) return '正常牛马';
  if (ratio >= 0.3) return '心态不稳';
  return '濒临破防';
}

// ── Builder functions ───────────────────────────────────────────────────────

/** Build MainHUDViewModel from GameFacade. */
export function buildMainHUDViewModel(facade: GameFacade): MainHUDViewModel {
  const ctx = facade.context;
  const snap = facade.snapshot();
  const career = ctx.career.current();
  const sect = ctx.sect.current();
  const talent = snap.talentId
    ? ctx.configService.talent.talents.find((t) => t.id === snap.talentId)
    : undefined;
  const kpiView = ctx.kpi.getView();

  return Object.freeze({
    careerLevel: snap.careerLevel,
    careerName: career.name,
    realm: career.realm,
    salary: snap.salary,
    performance: snap.performance,
    cultivationExp: snap.cultivationExp,
    cultivationRequired: career.requiredExp,
    mind: snap.mind,
    maxMind: snap.maxMind,
    mindStatusText: mindStatusText(snap.mind, snap.maxMind),
    mindStatus: snap.mindStatus,
    workMode: snap.workMode,
    kpiCompleted: kpiView.items.filter((i) => i.completed).length,
    kpiTotal: kpiView.items.length,
    kpiAllCompleted: kpiView.allCompleted,
    workerCount: snap.workerCount,
    boardCapacity: ctx.board.capacity,
    boardIsFull: ctx.board.isFull,
    sectName: sect ? sect.name : '未选择宗门',
    talentName: talent ? talent.name : '未觉醒天赋',
    officeName: ctx.office.getOfficeName(),
  });
}

/** Build MergeBoardViewModel from GameFacade. */
export function buildMergeBoardViewModel(facade: GameFacade): MergeBoardViewModel {
  const board = facade.context.board;
  const cells: MergeCellViewModel[] = board.cells.map((cell) => {
    const occupant = cell.occupant;
    return Object.freeze({
      row: cell.row,
      column: cell.column,
      occupied: occupant !== undefined,
      workerId: occupant?.id ?? null,
      workerLevel: occupant?.level ?? null,
    });
  });

  return Object.freeze({
    rows: board.rows,
    columns: board.columns,
    cells: Object.freeze(cells),
    maxWorkerLevel: board.maxWorkerLevel,
    isFull: board.isFull,
    workerCount: board.occupiedCount,
  });
}

/** Build CareerViewModel from GameFacade. */
export function buildCareerViewModel(facade: GameFacade): CareerViewModel {
  const ctx = facade.context;
  const snap = facade.snapshot();
  const career = ctx.career.current();
  const sect = ctx.sect.current();
  const talent = snap.talentId
    ? ctx.configService.talent.talents.find((t) => t.id === snap.talentId)
    : undefined;
  const check = ctx.promotion.canPromote();

  return Object.freeze({
    careerLevel: snap.careerLevel,
    careerName: career.name,
    realm: career.realm,
    salary: snap.salary,
    performance: snap.performance,
    cultivation: snap.cultivationExp,
    cultivationRequired: career.requiredExp,
    mind: snap.mind,
    maxMind: snap.maxMind,
    mindStatusText: mindStatusText(snap.mind, snap.maxMind),
    sectName: sect ? sect.name : '未选择宗门',
    talentName: talent ? talent.name : '未觉醒天赋',
    workMode: snap.workMode,
    officeName: ctx.office.getOfficeName(),
    canPromote: check.allowed,
    promotionReason: check.reason,
  });
}

/** Build KpiViewModel from GameFacade. */
export function buildKpiViewModel(facade: GameFacade): KpiViewModel {
  const kpiView = facade.context.kpi.getView();
  const items: KpiItemViewModel[] = kpiView.items.map((item) =>
    Object.freeze({
      type: item.type,
      description: item.description,
      progress: item.progress,
      target: item.target,
      completed: item.completed,
    }),
  );

  return Object.freeze({
    careerLevel: kpiView.careerLevel,
    items: Object.freeze(items),
    completedCount: items.filter((i) => i.completed).length,
    totalCount: items.length,
    allCompleted: kpiView.allCompleted,
  });
}

/** Build PromotionViewModel from GameFacade. */
export function buildPromotionViewModel(facade: GameFacade): PromotionViewModel {
  const ctx = facade.context;
  const check = ctx.promotion.canPromote();

  return Object.freeze({
    allowed: check.allowed,
    reason: check.reason,
    probability: ctx.promotion.getProbability(),
    needsRetry: ctx.promotion.needsRetry(),
    options: Object.freeze(
      ctx.configService.promotion.options.map((o) =>
        Object.freeze({ id: o.id, name: o.name, description: o.description }),
      ),
    ),
  });
}

/** Build EventViewModel from GameFacade. */
export function buildEventViewModel(facade: GameFacade): EventViewModel {
  const event = facade.context.careerEvents.current();
  if (!event) {
    return Object.freeze({
      pending: false, id: '', title: '', description: '', type: '',
      choices: [],
    });
  }
  return Object.freeze({
    pending: true,
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    choices: Object.freeze(
      (event.choices ?? []).map((c) => Object.freeze({ id: c.id, text: c.text })),
    ),
  });
}

/** Build AchievementViewModel from GameFacade. */
export function buildAchievementViewModel(facade: GameFacade): AchievementViewModel {
  const ctx = facade.context;
  const configs = ctx.achievements.getConfigs();
  const categories = [...new Set(configs.map((c) => c.category))];

  const items: AchievementItemViewModel[] = configs.map((cfg) => {
    const status = ctx.achievements.getStatus(cfg.id);
    // Hidden achievements: LOCKED and condition type is EVENT_TYPE (not discoverable by normal play)
    const isHidden = status === 'LOCKED' && cfg.condition.type === 'EVENT_TYPE';
    return Object.freeze({
      id: cfg.id,
      name: isHidden ? '???' : cfg.name,
      description: isHidden ? '还有传说没被发现' : cfg.description,
      category: cfg.category,
      status,
      isHidden,
    });
  });

  return Object.freeze({
    items: Object.freeze(items),
    unlockedCount: items.filter((i) => i.status === 'COMPLETED').length,
    claimedCount: items.filter((i) => i.status === 'CLAIMED').length,
    totalCount: items.length,
    categories: Object.freeze(categories),
  });
}

/** Build DailyTaskViewModel from GameFacade. */
export function buildDailyTaskViewModel(facade: GameFacade): DailyTaskViewModel {
  const ctx = facade.context;
  const progress = ctx.dailyTasks.getProgress();

  const tasks: DailyTaskItemViewModel[] = progress.map((t: DailyTaskProgress) =>
    Object.freeze({
      taskId: t.taskId,
      type: t.type,
      name: t.name,
      description: t.description,
      progress: t.progress,
      target: t.target,
      completed: t.completed,
      claimed: t.claimed,
    }),
  );

  return Object.freeze({
    tasks: Object.freeze(tasks),
    completedCount: tasks.filter((t) => t.completed).length,
    claimedCount: tasks.filter((t) => t.claimed).length,
    totalCount: tasks.length,
    dayIndex: ctx.player.dailyTaskDay,
  });
}

/** Build OfflineRewardViewModel from GameFacade. */
export function buildOfflineRewardViewModel(facade: GameFacade, settlementId: string): OfflineRewardViewModel {
  const ctx = facade.context;
  const preview = ctx.offline.preview(settlementId);
  const isSettled = ctx.offline.isSettled(settlementId);

  if (!preview || preview.duplicate) {
    return Object.freeze({
      hasReward: false,
      settlementId,
      offlineSeconds: 0,
      baseSalary: 0,
      baseCultivation: 0,
      baseMind: 0,
      totalSalary: 0,
      totalCultivation: 0,
      totalMind: 0,
      isSettled: false,
    });
  }

  return Object.freeze({
    hasReward: true,
    settlementId,
    offlineSeconds: preview.elapsedSeconds,
    baseSalary: preview.salary,
    baseCultivation: preview.cultivationExp,
    baseMind: 0, // Idle settlement does not grant mind recovery
    totalSalary: preview.salary * 2,
    totalCultivation: preview.cultivationExp * 2,
    totalMind: 0,
    isSettled,
  });
}

/** Build SettingsViewModel from GameFacade. */
export function buildSettingsViewModel(facade: GameFacade, settingsService: SettingsService): SettingsViewModel {
  const settings = settingsService.getAll();
  const snap = facade.snapshot();

  return Object.freeze({
    musicEnabled: settings.musicEnabled,
    sfxEnabled: settings.sfxEnabled,
    vibrationEnabled: settings.vibrationEnabled,
    performanceMode: settings.performanceMode,
    language: settings.language,
    analyticsConsent: settings.analyticsConsent,
    saveVersion: 4, // CURRENT_SAVE_VERSION
    lastSaveTime: snap.lastSaveTime,
  });
}

/** Build TutorialViewModel from GameFacade. */
export function buildTutorialViewModel(facade: GameFacade): TutorialViewModel {
  const tutorial = facade.context.tutorial;
  const currentStep = tutorial.currentStep();
  const steps = tutorial.getSteps();
  const stepIndex = tutorial.currentStepIndex();

  return Object.freeze({
    currentStep,
    isCompleted: tutorial.isCompleted(),
    stepIndex,
    totalSteps: steps.length,
    steps: Object.freeze([...steps]),
  });
}

/** Build SectViewModel from GameFacade. */
export function buildSectViewModel(facade: GameFacade): SectViewModel {
  const ctx = facade.context;
  const currentSect = ctx.sect.current();
  const allSects = ctx.configService.sect.sects;

  const sects = allSects.map((s) =>
    Object.freeze({
      id: s.id,
      name: s.name,
      selected: ctx.player.sectId === s.id,
    }),
  );

  return Object.freeze({
    currentSectId: ctx.player.sectId,
    currentSectName: currentSect ? currentSect.name : '散修',
    sects: Object.freeze(sects),
  });
}