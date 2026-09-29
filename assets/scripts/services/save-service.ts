import { CURRENT_SAVE_VERSION, type ActiveMessageChainState, type DailyRealityEntryState, type FirstWeekStoryState, type GameSaveData, type MessengerConversationState, type MessengerMessageState, type StoryDirectorState, type WorkerSaveData } from '../model/save-data';
import { PlayerData } from '../model/player-data';
import type { StorageAdapter } from './storage-adapter';
import { DEFAULT_CLOCK, type Clock } from '../core/clock';

export const DEFAULT_SAVE_KEY = 'game-save';
const TUTORIAL_VERSION = 2;
const TUTORIAL_STEPS = new Set(['WELCOME', 'FIRST_WORK', 'FIRST_FISH', 'FIRST_CULTIVATE', 'FIRST_TASK', 'NONE']);

export class SaveService {
  private latestSnapshot: GameSaveData | null = null;
  public constructor(
    private readonly storage: StorageAdapter,
    private readonly key = DEFAULT_SAVE_KEY,
    private readonly clockOrNow: Clock | (() => number) = DEFAULT_CLOCK,
  ) {}

  public load(): GameSaveData {
    const now = this.currentTime();
    const raw = this.storage.getItem(this.key);
    if (!raw || !raw.trim()) return this.commitLoaded(this.newPlayerSave(now));
    try {
      const parsed = JSON.parse(raw) as unknown;
      const data = migrate(parsed, now);
      if (tutorialMigrationChanged(parsed, data)) {
        try { this.storage.setItem(this.key, JSON.stringify(data)); } catch { /* load remains usable if migration cannot be persisted */ }
      }
      return this.commitLoaded(data);
    } catch {
      return this.commitLoaded(this.newPlayerSave(now));
    }
  }

  public getLatestCommittedSnapshot(): GameSaveData | null {
    return this.latestSnapshot ? cloneSaveData(this.latestSnapshot) : null;
  }

  public get latestCommittedSnapshot(): GameSaveData | null { return this.getLatestCommittedSnapshot(); }

  public save(player: PlayerData): void {
    const now = typeof this.clockOrNow === 'function' ? this.clockOrNow() : this.clockOrNow.now();
    this.saveAt(player, now);
  }

  public saveAt(player: PlayerData, timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const tutorial = normalizeTutorialState(player, Math.max(0, timestamp));
    const data = { ...player.toSaveData(), ...tutorial, lastSaveTime: saveTime };
    this.storage.setItem(this.key, JSON.stringify(data));
    this.latestSnapshot = cloneSaveData(data);
    applyTutorialState(player, tutorial);
    player.lastSaveTime = saveTime;
  }

  public saveIdleSettlement(player: PlayerData, settlementId: string, timestamp: number): void {
    if (typeof settlementId !== 'string' || settlementId.trim() === '') throw new Error('Invalid settlement id');
    if (!Number.isFinite(timestamp)) throw new Error('Invalid save time');
    const saveTime = Math.max(player.lastSaveTime, timestamp);
    const tutorial = normalizeTutorialState(player, Math.max(0, timestamp));
    const data = { ...player.toSaveData(), ...tutorial, lastIdleSettlementId: settlementId, lastSaveTime: saveTime };
    this.storage.setItem(this.key, JSON.stringify(data));
    this.latestSnapshot = cloneSaveData(data);
    applyTutorialState(player, tutorial);
    player.lastIdleSettlementId = settlementId;
    player.lastSaveTime = saveTime;
  }

  public autoSave(player: PlayerData): void { this.save(player); }

  /** Clear the save data from storage (dev/debug only). */
  public clearSave(): void {
    this.storage.removeItem(this.key);
    this.latestSnapshot = null;
  }

  private commitLoaded(data: GameSaveData): GameSaveData {
    this.latestSnapshot = cloneSaveData(data);
    return cloneSaveData(data);
  }

  private currentTime(): number {
    const now = typeof this.clockOrNow === 'function' ? this.clockOrNow() : this.clockOrNow.now();
    return Number.isFinite(now) && now >= 0 ? now : 0;
  }

  private newPlayerSave(now: number): GameSaveData {
    return new PlayerData({ tutorialVersion: TUTORIAL_VERSION, tutorialStartedAt: now }).toSaveData();
  }
}

function migrate(raw: unknown, now: number): GameSaveData {
  if (!isRecord(raw) || (raw.saveVersion !== undefined && (!isFiniteNumber(raw.saveVersion) || raw.saveVersion > CURRENT_SAVE_VERSION))) {
    throw new Error('Unsupported save data');
  }
  const workers = sanitizeWorkers(raw.workers);
  const maxWorkerLevel = isNonNegativeSafeInteger(raw.maxWorkerLevel) ? raw.maxWorkerLevel : workers.reduce((max, worker) => Math.max(max, worker.level), 0);
  const tutorialCompleted = raw.tutorialCompleted === true
    || (raw.tutorialVersion === TUTORIAL_VERSION && raw.tutorialStep === 'NONE');
  const tutorialStep = tutorialCompleted
    ? 'NONE'
    : raw.tutorialVersion === TUTORIAL_VERSION && typeof raw.tutorialStep === 'string' && TUTORIAL_STEPS.has(raw.tutorialStep) && raw.tutorialStep !== 'NONE'
      ? raw.tutorialStep
      : 'WELCOME';
  const data: GameSaveData = {
    saveVersion: CURRENT_SAVE_VERSION,
    salary: isNonNegativeSafeInteger(raw.salary) ? raw.salary : 0,
    maxWorkerLevel,
    lastSaveTime: isNonNegativeSafeInteger(raw.lastSaveTime) ? raw.lastSaveTime : 0,
    workers,
    cultivationExp: isNonNegativeSafeInteger(raw.cultivationExp) ? raw.cultivationExp : 0,
    careerLevel: isPositiveSafeInteger(raw.careerLevel) ? raw.careerLevel : 1,
    mind: isNonNegativeSafeInteger(raw.mind) ? raw.mind : 100,
    maxMind: isPositiveSafeInteger(raw.maxMind) ? raw.maxMind : 100,
    performance: isNonNegativeSafeInteger(raw.performance) ? raw.performance : 0,
    sectId: typeof raw.sectId === 'string' ? raw.sectId : null,
    lastSectSwitchTime: isNonNegativeSafeInteger(raw.lastSectSwitchTime) ? raw.lastSectSwitchTime : 0,
    talentId: typeof raw.talentId === 'string' ? raw.talentId : null,
    workMode: raw.workMode === 'WORK' ? 'WORK' : 'FISHING',
    workSeconds: isNonNegativeSafeInteger(raw.workSeconds) ? raw.workSeconds : 0,
    fishingSeconds: isNonNegativeSafeInteger(raw.fishingSeconds) ? raw.fishingSeconds : 0,
    kpiProgress: isRecord(raw.kpiProgress) ? numericRecord(raw.kpiProgress) : {},
    promotionFailCount: isNonNegativeSafeInteger(raw.promotionFailCount) ? raw.promotionFailCount : 0,
    officeLevel: isPositiveSafeInteger(raw.officeLevel) ? raw.officeLevel : 1,
    lastIdleSettlementId: typeof raw.lastIdleSettlementId === 'string' ? raw.lastIdleSettlementId : null,
    unlockedAchievementIds: uniqueIds(Array.isArray(raw.unlockedAchievementIds) ? raw.unlockedAchievementIds : []),
    claimedAchievementIds: uniqueIds(Array.isArray(raw.claimedAchievementIds) ? raw.claimedAchievementIds : []),
    dailySignIn: isDailySignInState(raw.dailySignIn) ? { lastClaimTime: raw.dailySignIn.lastClaimTime, currentDay: raw.dailySignIn.currentDay } : null,
    dailyTasks: Array.isArray(raw.dailyTasks) ? raw.dailyTasks.filter(isDailyTaskState) : [],
    dailyTaskDay: typeof raw.dailyTaskDay === 'number' && Number.isSafeInteger(raw.dailyTaskDay) && raw.dailyTaskDay >= -1 ? raw.dailyTaskDay : -1,
    tutorialStep,
    tutorialCompleted,
    tutorialVersion: TUTORIAL_VERSION,
    tutorialStartedAt: isFiniteNonNegativeNumber(raw.tutorialStartedAt) ? raw.tutorialStartedAt : now,
    spiritStones: isNonNegativeSafeInteger(raw.spiritStones) ? raw.spiritStones : 0,
    lastCultivateTime: isNonNegativeSafeInteger(raw.lastCultivateTime) ? raw.lastCultivateTime : 0,
    activeTasks: Array.isArray(raw.activeTasks) ? raw.activeTasks.filter(isActiveTaskState) : [],
    craftedItemIds: Array.isArray(raw.craftedItemIds) ? (raw.craftedItemIds as unknown[]).filter(isString) : [],
  };
  if (isNonNegativeSafeInteger(raw.salaryRemainder) && raw.salaryRemainder !== 0) dataWithRemainder(data, 'salaryRemainder', raw.salaryRemainder);
  if (isNonNegativeSafeInteger(raw.cultivationRemainder) && raw.cultivationRemainder !== 0) dataWithRemainder(data, 'cultivationRemainder', raw.cultivationRemainder);
  if (isNonNegativeSafeInteger(raw.workMindRemainder) && raw.workMindRemainder !== 0) dataWithRemainder(data, 'workMindRemainder', raw.workMindRemainder);
  if (isNonNegativeSafeInteger(raw.fishingMindRemainder) && raw.fishingMindRemainder !== 0) dataWithRemainder(data, 'fishingMindRemainder', raw.fishingMindRemainder);
  const legacyMindRemainder = raw.mindRemainder;
  const modeMindRemainderKey = raw.workMode === 'WORK' ? 'workMindRemainder' : 'fishingMindRemainder';
  if (isNonNegativeSafeInteger(legacyMindRemainder)) {
    if ((isFiniteNumber(raw.saveVersion) ? raw.saveVersion : 0) >= 6) {
      // V2 统一槽：mindRemainder 直接保留（四模式共用）
      dataWithRemainder(data, 'mindRemainder', legacyMindRemainder);
    } else if (!isNonNegativeSafeInteger(raw[modeMindRemainderKey])) {
      dataWithRemainder(data, modeMindRemainderKey, legacyMindRemainder);
    }
  }
  // ── Gameplay V2 (saveVersion 6): old saves migrate with safe defaults ──
  // V2 fields with safe defaults for old saves (readonly — assign via mutable copy).
  const ownedTechniques = uniqueIds(Array.isArray(raw.ownedTechniques) ? raw.ownedTechniques : []);
  const ownedEquipment = uniqueIds(Array.isArray(raw.ownedEquipment) ? raw.ownedEquipment : []);
  const pendingEvents = sanitizePendingEvents(raw.pendingEvents);
  const v2: V2Fields = {
    gameDay: normalizeGameDay(raw.gameDay),
    innerDemon: isNonNegativeSafeInteger(raw.innerDemon) ? raw.innerDemon : 0,
    activeDemons: uniqueIds(Array.isArray(raw.activeDemons) ? raw.activeDemons : []),
    materials: isRecord(raw.materials) ? numericRecord(raw.materials) : {},
    ownedTechniques,
    techniqueLevels: isRecord(raw.techniqueLevels) ? numericRecord(raw.techniqueLevels) : {},
    equippedTechniques: normalizeEquippedTechniques(raw.equippedTechniques, ownedTechniques),
    ownedEquipment,
    equippedEquipment: normalizeEquippedEquipment(raw.equippedEquipment, ownedEquipment),
    relationships: isRecord(raw.relationships) ? boundedNumberRecord(raw.relationships) : {},
    eventFlags: isRecord(raw.eventFlags) ? booleanRecord(raw.eventFlags) : {},
    eventChainState: isRecord(raw.eventChainState) ? (raw.eventChainState as GameSaveData['eventChainState']) : {},
    eventCooldowns: isRecord(raw.eventCooldowns) ? numericRecord(raw.eventCooldowns) : {},
    firedEvents: uniqueIds(Array.isArray(raw.firedEvents) ? raw.firedEvents : []),
    pendingEvents,
    dailyHistory: Array.isArray(raw.dailyHistory) ? (raw.dailyHistory as GameSaveData['dailyHistory']) : [],
    weeklyHistory: Array.isArray(raw.weeklyHistory) ? (raw.weeklyHistory as GameSaveData['weeklyHistory']) : [],
    devTimeOffsetMs: isNonNegativeSafeInteger(raw.devTimeOffsetMs) ? raw.devTimeOffsetMs : 0,
    unlockState: isRecord(raw.unlockState) ? booleanRecord(raw.unlockState) : {},
    cultivatingSeconds: isNonNegativeSafeInteger(raw.cultivatingSeconds) ? raw.cultivatingSeconds : 0,
    socialSeconds: isNonNegativeSafeInteger(raw.socialSeconds) ? raw.socialSeconds : 0,
  };
  const merged = Object.assign(data, v2);
  const overtimeStats = isRecord(raw.overtimeStats) ? raw.overtimeStats : {};
  Object.assign(merged, {
    compTime: isNonNegativeSafeInteger(raw.compTime) ? raw.compTime : 0,
    overtimeStats: {
      totalSeconds: isNonNegativeSafeInteger(overtimeStats.totalSeconds) ? overtimeStats.totalSeconds : 0,
      paidSeconds: isNonNegativeSafeInteger(overtimeStats.paidSeconds) ? overtimeStats.paidSeconds : 0,
      freeSeconds: isNonNegativeSafeInteger(overtimeStats.freeSeconds) ? overtimeStats.freeSeconds : 0,
      sessions: isNonNegativeSafeInteger(overtimeStats.sessions) ? overtimeStats.sessions : 0,
      nightSessions: isNonNegativeSafeInteger(overtimeStats.nightSessions) ? overtimeStats.nightSessions : 0,
      freeSessions: isNonNegativeSafeInteger(overtimeStats.freeSessions) ? overtimeStats.freeSessions : 0,
      consecutiveDays: isNonNegativeSafeInteger(overtimeStats.consecutiveDays) ? overtimeStats.consecutiveDays : 0,
      longestStreak: isNonNegativeSafeInteger(overtimeStats.longestStreak) ? overtimeStats.longestStreak : 0,
    },
    lastOvertimeWorkdayStartAt: isNonNegativeSafeInteger(raw.lastOvertimeWorkdayStartAt) ? raw.lastOvertimeWorkdayStartAt : 0,
    overtimeFatigue: raw.overtimeFatigue === 'TIRED' || raw.overtimeFatigue === 'EXHAUSTED' ? raw.overtimeFatigue : 'RESTED',
  });
  // ── Gameplay V4 (saveVersion 8): 职场地狱字段，旧存档安全默认值 ──
  const assignedTasks = sanitizeUniqueRecords(raw.assignedTasks, isAssignedTask);
  const incidents = sanitizeUniqueRecords(raw.incidents, isIncidentState);
  Object.assign(merged, {
    activeOvertimeSession: normalizeOvertimeSession(raw.activeOvertimeSession),
    evidence: sanitizeUniqueRecords(raw.evidence, isEvidenceItem),
    responsibilityCases: sanitizeUniqueRecords(raw.responsibilityCases, isResponsibilityCase),
    incidents,
    technicalDebt: isRecord(raw.technicalDebt) ? boundedNumberRecord(raw.technicalDebt) : {},
    assignedTasks,
    autoPolicy: migrateAutoPolicy(raw.autoPolicy),
    offlineDecisionSession: normalizeOfflineDecisionSession(raw.offlineDecisionSession, new Set(pendingEvents.map((event) => event.uid))),
    handledWelcomeItemIds: Array.isArray(raw.handledWelcomeItemIds) ? [...new Set((raw.handledWelcomeItemIds as unknown[]).filter(isString))].slice(-100) : [],
    lifetimeStats: isRecord(raw.lifetimeStats) ? numericRecord(raw.lifetimeStats) : {},
    activeBattleRun: normalizeBattleRun(
      raw.activeBattleRun,
      new Set(assignedTasks.map((task) => task.id)),
      new Set(incidents.map((incident) => incident.id)),
    ),
    conversations: normalizeConversations(raw.conversations),
    messages: normalizeMessages(raw.messages),
    storyDirector: normalizeStoryDirector(raw.storyDirector),
    firstWeekStory: normalizeFirstWeekStory(raw.firstWeekStory, data.careerLevel, data.gameDay?.dayIndex ?? 0),
    dialogFlags: sanitizeFlagRecord(raw.dialogFlags),
    dailyPlan: Array.isArray(raw.dailyPlan) ? (raw.dailyPlan as unknown[]).filter(isString).slice(0, 8) : [],
    dailyReality: Array.isArray(raw.dailyReality) ? (raw.dailyReality as unknown[]).filter(isDailyRealityEntry).slice(-40) : [],
  });
  return merged;
}

// ── V5 飞剑传书 save v9 迁移（§49/§96：旧档无损加载，messages 初始化为空） ──

function normalizeConversations(value: unknown): MessengerConversationState[] {
  if (!Array.isArray(value)) {
    // 首次进入 V5：由 MessengerService.ensureInitialized 按内容配置生成默认会话。
    return [];
  }
  return (value as unknown[]).filter((item): item is MessengerConversationState => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') return false;
    return typeof item.unreadCount === 'number' && item.unreadCount >= 0 && typeof item.lastMessageAt === 'number';
  }).slice(0, 64);
}

function normalizeMessages(value: unknown): MessengerMessageState[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((item): item is MessengerMessageState => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.conversationId !== 'string') return false;
    return typeof item.timestamp === 'number' && Number.isSafeInteger(item.timestamp)
      && typeof item.content === 'string' && typeof item.read === 'boolean';
  }).slice(-600);
}

function normalizeStoryDirector(value: unknown): StoryDirectorState {
  const fallback: StoryDirectorState = {
    storyBudget: 0, interruptBudget: 0, tension: 0, lastMessageAt: 0, lastMajorEventAt: 0,
    recentActors: {}, activeChains: [], unresolvedCases: [], firedKeys: [],
  };
  if (!isRecord(value)) return fallback;
  return {
    storyBudget: isNonNegativeSafeInteger(value.storyBudget) ? value.storyBudget : 0,
    interruptBudget: isNonNegativeSafeInteger(value.interruptBudget) ? value.interruptBudget : 0,
    tension: isFiniteNumber(value.tension) ? Math.max(0, Math.min(10, value.tension)) : 0,
    lastMessageAt: isFiniteNonNegativeNumber(value.lastMessageAt) ? value.lastMessageAt : 0,
    lastMajorEventAt: isFiniteNonNegativeNumber(value.lastMajorEventAt) ? value.lastMajorEventAt : 0,
    recentActors: isRecord(value.recentActors) ? numericRecord(value.recentActors) : {},
    activeChains: Array.isArray(value.activeChains)
      ? (value.activeChains as unknown[]).filter((chain): chain is ActiveMessageChainState => isRecord(chain)
        && typeof chain.chainId === 'string' && typeof chain.stepId === 'string'
        && isPositiveSafeInteger(chain.gameDayId) && isFiniteNonNegativeNumber(chain.nextStepAt)).slice(0, 32)
      : [],
    unresolvedCases: Array.isArray(value.unresolvedCases) ? (value.unresolvedCases as unknown[]).filter(isString).slice(0, 24) : [],
    firedKeys: Array.isArray(value.firedKeys) ? (value.firedKeys as unknown[]).filter(isString).slice(-240) : [],
  };
}

function normalizeFirstWeekStory(value: unknown, careerLevel: number, dayIndex: number): FirstWeekStoryState {
  // 老玩家（career > 1 或 day > 7）不重跑首周（§96）。
  if (!isRecord(value)) return { completed: careerLevel > 1 || dayIndex > 7, doneSteps: [] };
  const doneSteps = Array.isArray(value.doneSteps) ? (value.doneSteps as unknown[]).filter(isString).slice(0, 24) : [];
  return { completed: value.completed === true || careerLevel > 1 || dayIndex > 7, doneSteps };
}

function sanitizeFlagRecord(value: unknown): Readonly<Record<string, boolean>> {
  if (!isRecord(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key === 'string' && key.length > 0 && key.length <= 64 && typeof val === 'boolean') out[key] = val;
  }
  return out;
}

function isDailyRealityEntry(value: unknown): value is DailyRealityEntryState {
  if (!isRecord(value) || typeof value.text !== 'string' || !isFiniteNonNegativeNumber(value.time)) return false;
  const kinds = ['WORK', 'FAVOR', 'MEETING', 'INCIDENT', 'OVERTIME', 'CHANGE', 'BLAME', 'REST'];
  return typeof value.kind === 'string' && kinds.includes(value.kind);
}

/** Non-optional V2 fields set by migrate() for old saves. */
type V2Fields = {
  gameDay: GameSaveData['gameDay'];
  innerDemon: number;
  activeDemons: readonly string[];
  materials: Readonly<Record<string, number>>;
  ownedTechniques: readonly string[];
  techniqueLevels: Readonly<Record<string, number>>;
  equippedTechniques: readonly (string | null)[];
  ownedEquipment: readonly string[];
  equippedEquipment: Readonly<Record<string, string | null>>;
  relationships: Readonly<Record<string, number>>;
  eventFlags: Readonly<Record<string, boolean>>;
  eventChainState: GameSaveData['eventChainState'];
  eventCooldowns: Readonly<Record<string, number>>;
  firedEvents: readonly string[];
  pendingEvents: GameSaveData['pendingEvents'];
  dailyHistory: GameSaveData['dailyHistory'];
  weeklyHistory: GameSaveData['weeklyHistory'];
  devTimeOffsetMs: number;
  unlockState: Readonly<Record<string, boolean>>;
  cultivatingSeconds: number;
  socialSeconds: number;
};

const EVIDENCE_TYPES = new Set<unknown>(['GIT_LOG', 'CHAT_RECORD', 'REQUIREMENT_DOC', 'MEETING_NOTE', 'EMAIL', 'TEST_REPORT', 'DEPLOY_LOG', 'MONITOR_LOG', 'RISK_CONFIRMATION', 'TICKET_HISTORY']);
const INCIDENT_TYPES = new Set<unknown>(['PAYMENT_FAILURE', 'DATABASE_LOCK', 'SLOW_SQL', 'REDIS_OUTAGE', 'CACHE_AVALANCHE', 'NGINX_502', 'DISK_FULL', 'CPU_HIGH', 'OOM', 'MESSAGE_BACKLOG', 'CERT_EXPIRED', 'THIRD_PARTY_FAILURE', 'BAD_DEPLOY', 'CONFIG_ERROR']);
const INCIDENT_SEVERITIES = new Set<unknown>(['S1', 'S2', 'S3', 'S4']);
const INCIDENT_STATUSES = new Set<unknown>(['DETECTED', 'MITIGATING', 'RECOVERED', 'POSTMORTEM_DONE', 'CLOSED']);
const RESPONSIBILITY_STATUSES = new Set<unknown>(['OPEN', 'DISPUTED', 'PLAYER_ACCEPTED', 'PLAYER_CLEARED', 'RESOLVED']);
const ASSIGNED_TASK_PRIORITIES = new Set<unknown>(['P0', 'P1', 'P2', 'P3']);
const ASSIGNED_TASK_SOURCES = new Set<unknown>(['BOSS', 'COLLEAGUE', 'PRODUCT', 'TEST', 'CLIENT', 'INCIDENT', 'SYSTEM']);
const ASSIGNED_TASK_STATUSES = new Set<unknown>(['OPEN', 'DONE', 'REFUSED', 'EXPIRED']);

function sanitizeWorkers(value: unknown): WorkerSaveData[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const positions = new Set<string>();
  const result: WorkerSaveData[] = [];
  for (const worker of value) {
    if (!isWorker(worker) || !isPositiveSafeInteger(worker.level) || worker.level > 6
      || !isNonNegativeSafeInteger(worker.row) || !isNonNegativeSafeInteger(worker.column)) continue;
    const position = `${worker.row}:${worker.column}`;
    if (ids.has(worker.id) || positions.has(position)) continue;
    ids.add(worker.id);
    positions.add(position);
    result.push({ ...worker });
  }
  return result;
}

function sanitizePendingEvents(value: unknown): import('../model/save-data').PendingEventState[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: import('../model/save-data').PendingEventState[] = [];
  for (const event of value) {
    if (!isPendingEvent(event) || seen.has(event.uid)) continue;
    seen.add(event.uid);
    result.push({ ...event });
  }
  return result;
}

function sanitizeUniqueRecords<T extends { readonly id: string }>(value: unknown, predicate: (item: unknown) => item is T): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of value) {
    if (!predicate(item) || item.id.trim() === '' || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ ...item });
  }
  return result;
}

function normalizeEquippedTechniques(value: unknown, owned: readonly string[]): (string | null)[] {
  const allowed = new Set(owned);
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => typeof source[index] === 'string' && allowed.has(source[index] as string) ? source[index] as string : null);
}

function normalizeEquippedEquipment(value: unknown, owned: readonly string[]): Record<string, string | null> {
  if (!isRecord(value)) return {};
  const allowed = new Set(owned);
  const result: Record<string, string | null> = {};
  for (const [slot, item] of Object.entries(value)) {
    if (item === null) result[slot] = null;
    else if (typeof item === 'string') result[slot] = allowed.has(item) ? item : null;
  }
  return result;
}

function normalizeGameDay(value: unknown): GameSaveData['gameDay'] {
  if (!isRecord(value) || !isPositiveSafeInteger(value.dayIndex) || !isNonNegativeSafeInteger(value.weekday) || value.weekday > 6
    || !isNonNegativeSafeInteger(value.startedAt)) return null;
  const durations = isRecord(value.durations) ? value.durations : {};
  const income = isRecord(value.income) ? value.income : {};
  const settlementInputs = isRecord(value.settlementInputs) ? value.settlementInputs : {};
  const duration = (key: string) => isNonNegativeSafeInteger(durations[key]) ? durations[key] : 0;
  const amount = (key: string) => isNonNegativeSafeInteger(income[key]) ? income[key] : 0;
  const overtimeSource = value.overtimeSource === null || value.overtimeSource === 'VOLUNTARY' || value.overtimeSource === 'REQUESTED'
    || value.overtimeSource === 'FORCED' || value.overtimeSource === 'EMERGENCY' || value.overtimeSource === 'WEEKEND'
    || value.overtimeSource === 'COMPENSATED' ? value.overtimeSource : null;
  const overtimeStatus = value.overtimeStatus === 'OFFERED' || value.overtimeStatus === 'ACTIVE' || value.overtimeStatus === 'COMPLETED'
    ? value.overtimeStatus : 'NONE';
  return {
    dayIndex: value.dayIndex,
    weekday: value.weekday,
    startedAt: value.startedAt,
    settled: value.settled === true,
    durations: {
      work: duration('work'), fishing: duration('fishing'), cultivating: duration('cultivating'), social: duration('social'),
      meeting: duration('meeting'), lunch: duration('lunch'), overtime: duration('overtime'), incident: duration('incident'),
    },
    income: { salary: amount('salary'), cultivation: amount('cultivation'), performance: amount('performance') },
    eventsHandled: isNonNegativeSafeInteger(value.eventsHandled) ? value.eventsHandled : 0,
    materialsGained: isNonNegativeSafeInteger(value.materialsGained) ? value.materialsGained : 0,
    situationIds: uniqueIds(Array.isArray(value.situationIds) ? value.situationIds : []),
    overtimeSource,
    overtimeStatus,
    overtimeFree: value.overtimeFree === true,
    settlementInputs: { paidFishingSalary: isNonNegativeSafeInteger(settlementInputs.paidFishingSalary) ? settlementInputs.paidFishingSalary : 0 },
    eventHistory: Array.isArray(value.eventHistory) ? value.eventHistory.filter(isWorkTimelineEntry).map((entry) => ({ ...entry })) : [],
  };
}

function isWorkTimelineEntry(value: unknown): value is import('../model/save-data').WorkTimelineEntry {
  return isRecord(value) && typeof value.id === 'string' && (value.kind === 'MODE_TRANSITION' || value.kind === 'EVENT')
    && isNonNegativeSafeInteger(value.occurredAt) && (value.eventId === undefined || typeof value.eventId === 'string');
}

function isWorkMode(value: unknown): value is import('../model/save-data').WorkMode {
  return value === 'WORK' || value === 'FISHING' || value === 'CULTIVATING' || value === 'SOCIAL';
}

function normalizeBattleRun(value: unknown, taskIds: ReadonlySet<string>, incidentIds: ReadonlySet<string>): unknown {
  if (!isRecord(value) || typeof value.runId !== 'string' || value.runId.trim() === ''
    || (value.source !== 'PROJECT' && value.source !== 'INCIDENT') || typeof value.buildId !== 'string' || value.buildId.trim() === ''
    || typeof value.night !== 'boolean' || !isPositiveSafeInteger(value.dayIndex)
    || (value.status !== 'FIGHTING' && value.status !== 'VICTORY' && value.status !== 'DEFEAT')
    || !isNonNegativeSafeInteger(value.wave) || !isPositiveSafeInteger(value.waveTotal) || value.wave > value.waveTotal
    || !isNonNegativeSafeInteger(value.playerHp) || !isPositiveSafeInteger(value.playerMaxHp) || value.playerHp > value.playerMaxHp
    || !isNonNegativeSafeInteger(value.shield) || !isPositiveSafeInteger(value.attack) || !isPositiveFinite(value.intervalSec)
    || !isFiniteNumber(value.critChance) || value.critChance < 0 || value.critChance > 1
    || !isPositiveSafeInteger(value.level) || !isNonNegativeSafeInteger(value.exp) || !isPositiveSafeInteger(value.expNext)
    || !Array.isArray(value.skills) || !value.skills.every(isString)
    || !(value.skillOffers === null || (Array.isArray(value.skillOffers) && value.skillOffers.every(isString)))
    || !Array.isArray(value.enemies) || !value.enemies.every(isBattleEnemy)
    || !isNonNegativeSafeInteger(value.kills) || !isBattleLoot(value.loot)
    || typeof value.rewardsClaimed !== 'boolean' || !Array.isArray(value.log) || !value.log.every(isString)) return null;
  const linkedTaskId = typeof value.linkedTaskId === 'string' && taskIds.has(value.linkedTaskId) ? value.linkedTaskId : null;
  const linkedIncidentId = typeof value.linkedIncidentId === 'string' && incidentIds.has(value.linkedIncidentId) ? value.linkedIncidentId : null;
  return {
    ...value,
    linkedTaskId,
    linkedIncidentId,
    skills: uniqueIds(value.skills),
    skillOffers: value.skillOffers === null ? null : uniqueIds(value.skillOffers),
    enemies: value.enemies.map((enemy) => ({ ...enemy })),
    loot: {
      ...(value.loot as Record<string, unknown>),
      materials: { ...((value.loot as Record<string, unknown>).materials as Record<string, number>) },
      equipment: uniqueIds((value.loot as Record<string, unknown>).equipment as unknown[]),
    },
    log: [...value.log],
  };
}

function isBattleEnemy(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.uid === 'string' && typeof value.defId === 'string' && typeof value.name === 'string'
    && (value.tier === 'NORMAL' || value.tier === 'ELITE' || value.tier === 'BOSS')
    && isNonNegativeSafeInteger(value.hp) && isPositiveSafeInteger(value.maxHp) && value.hp <= value.maxHp
    && isNonNegativeSafeInteger(value.attack) && isPositiveFinite(value.intervalSec) && isFiniteNonNegativeNumber(value.attackTimer);
}

function isBattleLoot(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.materials) || !Array.isArray(value.equipment) || !value.equipment.every(isString)
    || !isNonNegativeSafeInteger(value.spiritStones) || !isNonNegativeSafeInteger(value.expGained)) return false;
  return Object.values(value.materials).every(isNonNegativeSafeInteger);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function boundedNumberRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.max(-100, Math.min(100, v as number))]),
  );
}

function booleanRecord(value: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
}

function isPendingEvent(value: unknown): value is import('../model/save-data').PendingEventState {
  if (!isRecord(value)) return false;
  return typeof value.uid === 'string' && typeof value.eventId === 'string'
    && isNonNegativeSafeInteger(value.occurredAt)
    && (value.priority === 'CRITICAL' || value.priority === 'IMPORTANT' || value.priority === 'NORMAL' || value.priority === 'FLAVOR');
}

function migrateAutoPolicy(value: unknown): import('../model/save-data').AutoPolicy {
  if (value === 'SAFE' || value === 'GRINDER' || value === 'SLACKER' || value === 'NORMAL') return value;
  if (value === 'ALWAYS') return 'GRINDER';
  if (value === 'NEVER') return 'SLACKER';
  return 'NORMAL';
}

function normalizeOfflineDecisionSession(value: unknown, canonicalPendingIds?: ReadonlySet<string>): import('../model/save-data').OfflineDecisionSession | null {
  if (!isRecord(value) || typeof value.settlementId !== 'string' || value.settlementId.trim() === '') return null;
  if (!Array.isArray(value.pendingEventIds) || !Array.isArray(value.resolvedEventIds)) return null;
  if (!isNonNegativeSafeInteger(value.cursor) || (value.status !== 'PENDING' && value.status !== 'COMPLETED')) return null;
  const originalIds = uniqueIds(value.pendingEventIds);
  const originalCursor = Math.min(value.cursor, originalIds.length);
  const resolvedPrefix = originalIds.slice(0, originalCursor);
  const unresolvedSuffix = originalIds.slice(originalCursor).filter((id) => !canonicalPendingIds || canonicalPendingIds.has(id));
  const pendingEventIds = [...resolvedPrefix, ...unresolvedSuffix];
  const pendingIdSet = new Set(pendingEventIds);
  const cursor = resolvedPrefix.length;
  return {
    settlementId: value.settlementId,
    pendingEventIds,
    cursor,
    resolvedEventIds: uniqueIds(value.resolvedEventIds).filter((id) => pendingIdSet.has(id)),
    status: cursor >= pendingEventIds.length ? 'COMPLETED' : 'PENDING',
  };
}

function uniqueIds(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))];
}

function normalizeOvertimeSession(value: unknown): import('../model/save-data').OvertimeSessionState | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  const sourceOk = source === 'VOLUNTARY' || source === 'REQUESTED' || source === 'FORCED' || source === 'EMERGENCY' || source === 'WEEKEND' || source === 'COMPENSATED';
  if (!sourceOk || typeof value.free !== 'boolean' || !isPositiveSafeInteger(value.plannedSeconds)
    || !isNonNegativeSafeInteger(value.elapsedSeconds) || (value.status !== 'OFFERED' && value.status !== 'ACTIVE')) return null;
  if (value.status === 'ACTIVE') {
    if (!isWorkMode(value.mode) || !isNonNegativeSafeInteger(value.startedAt)) return null;
  }
  return {
    source,
    free: value.free,
    plannedSeconds: value.plannedSeconds,
    elapsedSeconds: Math.min(value.elapsedSeconds, value.plannedSeconds),
    mode: value.status === 'ACTIVE' ? value.mode as import('../model/save-data').WorkMode : null,
    status: value.status,
    startedAt: value.status === 'ACTIVE' ? value.startedAt as number : null,
  };
}

function isEvidenceItem(value: unknown): value is import('../model/save-data').EvidenceItemState {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && EVIDENCE_TYPES.has(value.type)
    && typeof value.label === 'string'
    && isNonNegativeSafeInteger(value.dayIndex)
    && isNonNegativeSafeInteger(value.createdAt);
}

function isResponsibilityCase(value: unknown): value is import('../model/save-data').ResponsibilityCaseState {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && isPositiveSafeInteger(value.createdDay)
    && isNonNegativeSafeInteger(value.createdAt)
    && typeof value.sourceNpc === 'string'
    && typeof value.actualOwnerNpc === 'string'
    && typeof value.cause === 'string'
    && typeof value.blamedPlayer === 'boolean'
    && INCIDENT_SEVERITIES.has(value.severity)
    && RESPONSIBILITY_STATUSES.has(value.status)
    && Array.isArray(value.evidenceIds)
    && value.evidenceIds.every(isString)
    && isFiniteNumber(value.performanceDelta)
    && isRecord(value.relationshipEffects);
}

function isIncidentState(value: unknown): value is import('../model/save-data').IncidentState {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && INCIDENT_TYPES.has(value.type)
    && INCIDENT_SEVERITIES.has(value.severity)
    && isPositiveSafeInteger(value.dayIndex)
    && isNonNegativeSafeInteger(value.createdAt)
    && INCIDENT_STATUSES.has(value.status)
    && typeof value.forcedRelease === 'boolean'
    && typeof value.riskConfirmed === 'boolean'
    && isNonNegativeSafeInteger(value.mitigationSeconds);
}

function isAssignedTask(value: unknown): value is import('../model/save-data').AssignedTaskState {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && ASSIGNED_TASK_PRIORITIES.has(value.priority)
    && ASSIGNED_TASK_SOURCES.has(value.source)
    && isPositiveSafeInteger(value.createdDay)
    && isNonNegativeSafeInteger(value.createdAt)
    && ASSIGNED_TASK_STATUSES.has(value.status)
    && isNonNegativeSafeInteger(value.rewardSalary)
    && isFiniteNumber(value.rewardPerformance)
    && isNonNegativeSafeInteger(value.rewardCultivation)
    && isFiniteNumber(value.rewardMind)
    && typeof value.isFakeP0 === 'boolean';
}

function dataWithRemainder(data: GameSaveData, key: 'salaryRemainder' | 'cultivationRemainder' | 'workMindRemainder' | 'fishingMindRemainder' | 'cultivatingMindRemainder' | 'socialMindRemainder' | 'mindRemainder', value: number): void {
  Object.assign(data, { [key]: value });
}
function cloneSaveData(data: GameSaveData): GameSaveData {
  return { ...data, workers: data.workers.map((worker) => ({ ...worker })), kpiProgress: { ...data.kpiProgress }, unlockedAchievementIds: [...(data.unlockedAchievementIds ?? [])], claimedAchievementIds: [...(data.claimedAchievementIds ?? [])], dailySignIn: data.dailySignIn ? { ...data.dailySignIn } : null, dailyTasks: (data.dailyTasks ?? []).map((t) => ({ ...t })), dailyTaskDay: data.dailyTaskDay ?? -1, tutorialStep: data.tutorialStep ?? 'WELCOME', tutorialCompleted: data.tutorialCompleted ?? false, tutorialVersion: data.tutorialVersion ?? TUTORIAL_VERSION, activeTasks: (data.activeTasks ?? []).map((t) => ({ ...t })), pendingEvents: (data.pendingEvents ?? []).map((event) => ({ ...event })), handledWelcomeItemIds: [...(data.handledWelcomeItemIds ?? [])], offlineDecisionSession: data.offlineDecisionSession ? { ...data.offlineDecisionSession, pendingEventIds: [...data.offlineDecisionSession.pendingEventIds], resolvedEventIds: [...data.offlineDecisionSession.resolvedEventIds] } : null, overtimeStats: data.overtimeStats ? { ...data.overtimeStats } : undefined, activeBattleRun: cloneUnknown(data.activeBattleRun), gameDay: data.gameDay ? { ...data.gameDay, durations: { ...data.gameDay.durations }, income: { ...data.gameDay.income }, situationIds: [...data.gameDay.situationIds], settlementInputs: { ...data.gameDay.settlementInputs }, eventHistory: data.gameDay.eventHistory.map((entry) => ({ ...entry })) } : null };
}

function cloneUnknown(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneUnknown(item));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneUnknown(item)]));
}

function isWorker(value: unknown): value is WorkerSaveData {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  return isFiniteNumber(value.level) && isFiniteNumber(value.row) && isFiniteNumber(value.column);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

interface TutorialState {
  readonly tutorialVersion: number;
  readonly tutorialStep: string;
  readonly tutorialCompleted: boolean;
  readonly tutorialStartedAt: number;
}

function normalizeTutorialState(player: PlayerData, now: number): TutorialState {
  const completed = player.tutorialCompleted
    || (player.tutorialVersion === TUTORIAL_VERSION && player.tutorialStep === 'NONE');
  const tutorialStep = completed
    ? 'NONE'
    : player.tutorialVersion === TUTORIAL_VERSION && TUTORIAL_STEPS.has(player.tutorialStep) && player.tutorialStep !== 'NONE'
      ? player.tutorialStep
      : 'WELCOME';
  return {
    tutorialVersion: TUTORIAL_VERSION,
    tutorialStep,
    tutorialCompleted: completed,
    tutorialStartedAt: isFiniteNonNegativeNumber(player.tutorialStartedAt) ? player.tutorialStartedAt : now,
  };
}

function applyTutorialState(player: PlayerData, state: TutorialState): void {
  player.tutorialVersion = state.tutorialVersion;
  player.tutorialStep = state.tutorialStep;
  player.tutorialCompleted = state.tutorialCompleted;
  player.tutorialStartedAt = state.tutorialStartedAt;
}
function tutorialMigrationChanged(raw: unknown, data: GameSaveData): boolean {
  if (!isRecord(raw)) return true;
  return raw.tutorialVersion !== data.tutorialVersion
    || raw.tutorialStep !== data.tutorialStep
    || raw.tutorialCompleted !== data.tutorialCompleted
    || raw.tutorialStartedAt !== data.tutorialStartedAt;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isPositiveSafeInteger(value: unknown): value is number { return isNonNegativeSafeInteger(value) && value >= 1; }
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isDailySignInState(value: unknown): value is import('../model/save-data').DailySignInState {
  if (!isRecord(value)) return false;
  return isNonNegativeSafeInteger(value.lastClaimTime) && isPositiveSafeInteger(value.currentDay);
}
function isDailyTaskState(value: unknown): value is import('../model/save-data').DailyTaskState {
  if (!isRecord(value)) return false;
  return typeof value.taskId === 'string'
    && isNonNegativeSafeInteger(value.progress)
    && typeof value.completed === 'boolean'
    && typeof value.claimed === 'boolean';
}
function isActiveTaskState(value: unknown): value is import('../model/save-data').ActiveTaskState {
  if (!isRecord(value)) return false;
  return typeof value.taskId === 'string'
    && typeof value.taskType === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && isNonNegativeSafeInteger(value.durationSeconds)
    && isNonNegativeSafeInteger(value.startedAt)
    && isNonNegativeSafeInteger(value.rewardSalary)
    && isNonNegativeSafeInteger(value.rewardCultivation)
    && isNonNegativeSafeInteger(value.rewardSpiritStones)
    && typeof value.completed === 'boolean'
    && typeof value.claimed === 'boolean';
}
function numericRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => isNonNegativeSafeInteger(item))) as Record<string, number>;
}
