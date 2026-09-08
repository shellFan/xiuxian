/**
 * Phase 5 ViewModels — facade-driven, immutable UI data contracts.
 *
 * UI components MUST NOT hold mutable references to GameContext, PlayerData,
 * or services. They read from ViewModels produced by builder functions that
 * derive data exclusively from GameFacade (via snapshot() + query API).
 *
 * Each ViewModel is a frozen, point-in-time snapshot. Re-build when the
 * facade's UI event stream signals a change.
 */

import type { GameFacade } from '../facade/game-facade';
import type { AchievementStatus, AchievementCategory } from '../services/achievement-service';
import type { DailyTaskProgress } from '../services/daily-task-service';
import type { TutorialStep } from '../services/tutorial-service';
import type { SettingsService } from '../services/settings-service';
import { CURRENT_SAVE_VERSION, type WorkMode } from '../model/save-data';
import type { IdleEfficiencyBreakdown } from '../services/idle-efficiency-service';
import type { LeaderboardEntry } from '../services/leaderboard-service';
import type { FriendEntry } from '../services/friends-service';
import type { AdPlacement } from '../services/rewarded-ad-service';

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

/** @deprecated 4×4 merge board grid state. PC V1 does not use the board. */
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

// ── Cultivation (WEB V1) ────────────────────────────────────────────────────

export interface CultivationViewModel {
  readonly cultivationExp: number;
  readonly cultivationRequired: number;
  readonly cultivationProgress: number; // 0.0 to 1.0
  readonly cooldownRemaining: number; // seconds
  readonly mindEfficiency: number; // 0.0 to 1.0
  readonly cultivationEfficiency: number; // 0.0 to 1.0
  readonly mindStatusText: string;
  readonly canCultivate: boolean;
}

// ── Task (WEB V1) ───────────────────────────────────────────────────────────

export interface TaskItemViewModel {
  readonly taskId: string;
  readonly configId: string;
  readonly type: 'DAILY' | 'WORK' | 'CULTIVATION' | 'EVENT';
  readonly name: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
  readonly progress: number; // 0.0 to 1.0
  readonly completed: boolean;
  readonly claimed: boolean;
  readonly rewards: ReadonlyArray<{ readonly type: string; readonly amount: number }>;
}

export interface TaskViewModel {
  readonly activeTasks: readonly TaskItemViewModel[];
  readonly availableConfigs: readonly TaskConfigViewModel[];
  readonly activeCount: number;
  readonly maxConcurrent: number;
  readonly canStartMore: boolean;
}

export interface TaskConfigViewModel {
  readonly configId: string;
  readonly type: 'DAILY' | 'WORK' | 'CULTIVATION' | 'EVENT';
  readonly name: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly rewards: ReadonlyArray<{ readonly type: string; readonly amount: number }>;
}

// ── Idle Efficiency (WEB V1) ────────────────────────────────────────────────

export interface IdleViewModel {
  readonly workMode: WorkMode;
  readonly isFishingMode: boolean;
  readonly salaryEfficiency: number;
  readonly performanceEfficiency: number;
  readonly mindRecoveryEfficiency: number;
  readonly cultivationEfficiency: number;
  readonly isWorkIncomeStopped: boolean;
  readonly mindRatio: number;
  readonly mindStatusText: string;
  readonly sectModifier: number;
  readonly overallEfficiency: number;
  readonly breakdown: IdleEfficiencyBreakdown;
}

// ── Leaderboard (WEB V1) ────────────────────────────────────────────────────

export interface LeaderboardViewModel {
  readonly entries: readonly LeaderboardEntry[];
  readonly playerRank: number;
  readonly totalEntries: number;
  readonly lastUpdated: number;
  readonly top3: readonly LeaderboardEntry[];
  readonly aroundPlayer: readonly LeaderboardEntry[];
}

// ── Friends (WEB V1) ────────────────────────────────────────────────────────

export interface FriendsViewModel {
  readonly friends: readonly FriendEntry[];
  readonly totalFriends: number;
  readonly onlineCount: number;
  readonly giftsToSend: number;
  readonly giftsToClaim: number;
}

// ── Rewarded Ad (WEB V1) ────────────────────────────────────────────────────

export interface RewardedAdViewModel {
  readonly isWatching: boolean;
  readonly adsThisHour: number;
  readonly maxAdsPerHour: number;
  readonly placementCooldowns: ReadonlyArray<{ readonly placement: AdPlacement; readonly remaining: number }>;
  readonly canShowPlacements: ReadonlyArray<AdPlacement>;
}

// ── Craft (PC V1) ───────────────────────────────────────────────────────────

export interface CraftRecipeViewModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly costCultivation: number;
  readonly costSpiritStones: number;
  readonly effect: Readonly<Record<string, number>>;
  readonly unlockCareerLevel: number;
  readonly maxCraftCount: number;
  readonly craftedCount: number;
  readonly canCraft: boolean;
  readonly reason: string;
}

export interface CraftViewModel {
  readonly recipes: readonly CraftRecipeViewModel[];
  readonly totalCrafted: number;
  readonly playerCultivation: number;
  readonly playerSpiritStones: number;
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
//
// All builders use ONLY facade.snapshot() + facade.query*() methods.
// They NEVER access facade.context directly.

/** Build MainHUDViewModel from GameFacade. */
export function buildMainHUDViewModel(facade: GameFacade): MainHUDViewModel {
  const snap = facade.snapshot();
  const career = facade.queryCareer();
  const sect = facade.querySect();
  const talent = facade.queryTalent(snap.talentId);
  const kpiView = facade.queryKpi();
  const board = facade.queryBoard();

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
    boardCapacity: board?.capacity ?? 0,
    boardIsFull: board?.isFull ?? false,
    sectName: sect ? sect.name : '未选择宗门',
    talentName: talent ? talent.name : '未觉醒天赋',
    officeName: facade.queryOfficeName(),
  });
}

/** Build MergeBoardViewModel from GameFacade. @deprecated PC V1 does not use MergeBoard. */
export function buildMergeBoardViewModel(facade: GameFacade): MergeBoardViewModel {
  const board = facade.queryBoard();
  if (!board) {
    return Object.freeze({
      rows: 0,
      columns: 0,
      cells: [],
      maxWorkerLevel: 0,
      isFull: false,
      workerCount: 0,
    });
  }
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
  const snap = facade.snapshot();
  const career = facade.queryCareer();
  const sect = facade.querySect();
  const talent = facade.queryTalent(snap.talentId);
  const check = facade.queryPromotionCheck();

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
    officeName: facade.queryOfficeName(),
    canPromote: check.allowed,
    promotionReason: check.reason,
  });
}

/** Build KpiViewModel from GameFacade. */
export function buildKpiViewModel(facade: GameFacade): KpiViewModel {
  const kpiView = facade.queryKpi();
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
  const check = facade.queryPromotionCheck();

  return Object.freeze({
    allowed: check.allowed,
    reason: check.reason,
    probability: facade.queryPromotionProbability(),
    needsRetry: facade.queryPromotionNeedsRetry(),
    options: Object.freeze(
      facade.queryPromotionOptions().map((o) =>
        Object.freeze({ id: o.id, name: o.name, description: o.description }),
      ),
    ),
  });
}

/** Build EventViewModel from GameFacade. */
export function buildEventViewModel(facade: GameFacade): EventViewModel {
  const event = facade.queryCurrentEvent();
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
  const configs = facade.queryAchievementConfigs();
  const categories = [...new Set(configs.map((c) => c.category))];

  const items: AchievementItemViewModel[] = configs.map((cfg) => {
    const status = facade.queryAchievementStatus(cfg.id);
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
  const progress = facade.queryDailyTaskProgress();
  const snap = facade.snapshot();

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
    dayIndex: snap.dailyTaskDay,
  });
}

/** Build OfflineRewardViewModel from GameFacade. */
export function buildOfflineRewardViewModel(facade: GameFacade, settlementId: string): OfflineRewardViewModel {
  const preview = facade.queryOfflinePreview(settlementId);
  const isSettled = facade.queryOfflineIsSettled(settlementId);

  if (!preview || preview.duplicate || preview.elapsedSeconds <= 0) {
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
      isSettled,
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
    saveVersion: CURRENT_SAVE_VERSION,
    lastSaveTime: snap.lastSaveTime,
  });
}

/** Build TutorialViewModel from GameFacade. */
export function buildTutorialViewModel(facade: GameFacade): TutorialViewModel {
  const tutorial = facade.queryTutorial();

  return Object.freeze({
    currentStep: tutorial.currentStep,
    isCompleted: tutorial.isCompleted,
    stepIndex: tutorial.stepIndex,
    totalSteps: tutorial.steps.length,
    steps: Object.freeze([...tutorial.steps]),
  });
}

/** Build SectViewModel from GameFacade. */
export function buildSectViewModel(facade: GameFacade): SectViewModel {
  const snap = facade.snapshot();
  const currentSect = facade.querySect();
  const allSects = facade.querySects();

  const sects = allSects.map((s) =>
    Object.freeze({
      id: s.id,
      name: s.name,
      selected: snap.sectId === s.id,
    }),
  );

  return Object.freeze({
    currentSectId: snap.sectId,
    currentSectName: currentSect ? currentSect.name : '散修',
    sects: Object.freeze(sects),
  });
}

// ── WEB V1 Builder functions ────────────────────────────────────────────────

/** Build CultivationViewModel from GameFacade. */
export function buildCultivationViewModel(facade: GameFacade): CultivationViewModel {
  const snap = facade.snapshot();
  const career = facade.queryCareer();
  const cooldown = facade.queryCultivationCooldown();
  const mindEff = facade.queryMindEfficiency();
  const cultivationEff = snap.cultivationEfficiency;

  return Object.freeze({
    cultivationExp: snap.cultivationExp,
    cultivationRequired: career.requiredExp,
    cultivationProgress: career.requiredExp > 0 ? Math.min(1, snap.cultivationExp / career.requiredExp) : 0,
    cooldownRemaining: cooldown,
    mindEfficiency: mindEff,
    cultivationEfficiency: cultivationEff,
    mindStatusText: mindStatusText(snap.mind, snap.maxMind),
    canCultivate: cooldown <= 0 && snap.mind > 0,
  });
}

/** Build TaskViewModel from GameFacade. */
export function buildTaskViewModel(facade: GameFacade): TaskViewModel {
  const snap = facade.snapshot();
  const configs = facade.queryTaskConfigs();
  const activeTasks = snap.activeTasks;
  const MAX_CONCURRENT = 3;

  const taskItems: TaskItemViewModel[] = activeTasks.map((t) => {
    const remaining = facade.queryTaskRemaining(t.taskId);
    const duration = t.durationSeconds;
    const progress = duration > 0 ? Math.min(1, (duration - remaining) / duration) : 0;
    return Object.freeze({
      taskId: t.taskId,
      configId: t.taskId, // taskId serves as configId reference
      type: t.taskType,
      name: t.name,
      description: t.description,
      durationSeconds: duration,
      remainingSeconds: remaining,
      progress,
      completed: t.completed,
      claimed: t.claimed,
      rewards: Object.freeze([
        ...(t.rewardSalary > 0 ? [Object.freeze({ type: 'salary', amount: t.rewardSalary })] : []),
        ...(t.rewardCultivation > 0 ? [Object.freeze({ type: 'cultivation', amount: t.rewardCultivation })] : []),
        ...(t.rewardSpiritStones > 0 ? [Object.freeze({ type: 'spiritStones', amount: t.rewardSpiritStones })] : []),
      ]),
    });
  });

  const availableConfigs: TaskConfigViewModel[] = configs.map((c) =>
    Object.freeze({
      configId: c.id,
      type: c.type,
      name: c.name,
      description: c.description,
      durationSeconds: c.durationSeconds,
      rewards: Object.freeze([
        ...(c.rewardSalary > 0 ? [Object.freeze({ type: 'salary', amount: c.rewardSalary })] : []),
        ...(c.rewardCultivation > 0 ? [Object.freeze({ type: 'cultivation', amount: c.rewardCultivation })] : []),
        ...(c.rewardSpiritStones > 0 ? [Object.freeze({ type: 'spiritStones', amount: c.rewardSpiritStones })] : []),
      ]),
    }),
  );

  return Object.freeze({
    activeTasks: Object.freeze(taskItems),
    availableConfigs: Object.freeze(availableConfigs),
    activeCount: activeTasks.length,
    maxConcurrent: MAX_CONCURRENT,
    canStartMore: activeTasks.length < MAX_CONCURRENT,
  });
}

/** Build IdleViewModel from GameFacade. */
export function buildIdleViewModel(facade: GameFacade): IdleViewModel {
  const snap = facade.snapshot();
  const breakdown = facade.queryIdleEfficiency();

  return Object.freeze({
    workMode: snap.workMode,
    isFishingMode: snap.isFishingMode,
    salaryEfficiency: snap.salaryEfficiency,
    performanceEfficiency: snap.performanceEfficiency,
    mindRecoveryEfficiency: snap.mindRecoveryEfficiency,
    cultivationEfficiency: snap.cultivationEfficiency,
    isWorkIncomeStopped: snap.isWorkIncomeStopped,
    mindRatio: breakdown.mindRatio,
    mindStatusText: breakdown.statusText,
    sectModifier: breakdown.sectModifier,
    overallEfficiency: breakdown.overall,
    breakdown: Object.freeze({ ...breakdown }),
  });
}

/** Build LeaderboardViewModel from GameFacade. */
export function buildLeaderboardViewModel(facade: GameFacade): LeaderboardViewModel {
  const view = facade.queryLeaderboard();

  return Object.freeze({
    entries: view.entries,
    playerRank: view.playerRank,
    totalEntries: view.totalEntries,
    lastUpdated: view.lastUpdated,
    top3: Object.freeze(view.entries.slice(0, 3)),
    aroundPlayer: Object.freeze([...facade.queryLeaderboardAroundPlayer(5)]),
  });
}

/** Build FriendsViewModel from GameFacade. */
export function buildFriendsViewModel(facade: GameFacade): FriendsViewModel {
  const view = facade.queryFriends();

  return Object.freeze({
    friends: view.friends,
    totalFriends: view.totalFriends,
    onlineCount: view.onlineCount,
    giftsToSend: view.giftsToSend,
    giftsToClaim: view.giftsToClaim,
  });
}

/** Build RewardedAdViewModel from GameFacade. */
export function buildRewardedAdViewModel(facade: GameFacade): RewardedAdViewModel {
  const PLACEMENTS: AdPlacement[] = [
    'TASK_SPEEDUP', 'TASK_DOUBLE_REWARD', 'OFFLINE_DOUBLE',
    'MIND_RECOVERY', 'PROMOTION_RETRY', 'CULTIVATION_BOOST', 'MERGE_HINT',
  ];

  const placementCooldowns = PLACEMENTS.map((p) =>
    Object.freeze({ placement: p, remaining: facade.queryRewardedAdCooldown(p) }),
  );

  const canShowPlacements = PLACEMENTS.filter((p) => facade.canShowRewardedAd(p));

  return Object.freeze({
    isWatching: facade.isRewardedAdWatching(),
    adsThisHour: 0, // facade doesn't expose this directly yet
    maxAdsPerHour: 10,
    placementCooldowns: Object.freeze(placementCooldowns),
    canShowPlacements: Object.freeze(canShowPlacements),
  });
}

// ── Craft Builder (PC V1) ───────────────────────────────────────────────────

/** Build CraftViewModel from GameFacade. */
export function buildCraftViewModel(facade: GameFacade): CraftViewModel {
  const snap = facade.snapshot();
  const recipes = facade.queryCraftRecipes();
  const allRecipes = facade.queryAllCraftRecipes();

  const recipeViewModels: CraftRecipeViewModel[] = allRecipes.map((recipe) => {
    const check = facade.queryCanCraft(recipe.id);
    const craftedCount = facade.queryCraftedCount(recipe.id);
    const isAvailable = recipes.some((r) => r.id === recipe.id);

    return Object.freeze({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      costCultivation: recipe.costCultivation,
      costSpiritStones: recipe.costSpiritStones,
      effect: Object.freeze({ ...recipe.effect }),
      unlockCareerLevel: recipe.unlockCareerLevel,
      maxCraftCount: recipe.maxCraftCount,
      craftedCount,
      canCraft: isAvailable && check.canCraft,
      reason: !isAvailable ? '职级不足' : (check.reason ?? ''),
    });
  });

  return Object.freeze({
    recipes: Object.freeze(recipeViewModels),
    totalCrafted: facade.queryTotalCraftedCount(),
    playerCultivation: snap.cultivationExp,
    playerSpiritStones: snap.spiritStones,
  });
}