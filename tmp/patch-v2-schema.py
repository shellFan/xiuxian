# -*- coding: utf-8 -*-
"""Gameplay V2 Phase 1 — save-data.ts / player-data.ts schema patch."""
import io

# ── save-data.ts ─────────────────────────────────────────────────────────────
p = 'assets/scripts/model/save-data.ts'
s = io.open(p, encoding='utf-8').read()

old = "export const CURRENT_SAVE_VERSION = 5;\n\nexport type WorkMode = 'WORK' | 'FISHING';"
new = "export const CURRENT_SAVE_VERSION = 6;\n\n/** V2 四种核心工作行为（§18）。 */\nexport type WorkMode = 'WORK' | 'FISHING' | 'CULTIVATING' | 'SOCIAL';"
assert old in s, 'save-data version anchor'
s = s.replace(old, new)

anchor = "/** A single active task tracked by the TaskService. */"
v2types = '''// ── Gameplay V2 存档类型（saveVersion 6） ──────────────────────────────────

/** 当日活动时长（秒）。 */
export interface ActivityDurationsState {
  work: number;
  fishing: number;
  cultivating: number;
  social: number;
  meeting: number;
  lunch: number;
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

/** A single active task tracked by the TaskService. */'''
assert anchor in s, 'save-data task anchor'
s = s.replace(anchor, v2types, 1)

anchor2 = "  readonly craftedItemIds?: readonly string[];\n}"
v2fields = """  readonly isFishingMode: boolean;

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
}"""
assert anchor2 in s, 'save-data fields anchor'
s = s.replace(anchor2, v2fields, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('save-data.ts patched')

# ── player-data.ts ───────────────────────────────────────────────────────────
p = 'assets/scripts/model/player-data.ts'
s = io.open(p, encoding='utf-8').read()

old = "import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData, type WorkMode, type DailySignInState, type DailyTaskState, type ActiveTaskState } from './save-data';"
new = ("import { CURRENT_SAVE_VERSION, type GameSaveData, type WorkerSaveData, type WorkMode, type DailySignInState, "
       "type DailyTaskState, type ActiveTaskState, type ActivityDurationsState, type GameDayState, type PendingEventState, "
       "type DaySummaryState, type WeeklySummaryState, type EventChainState } from './save-data';")
assert old in s, 'player-data import anchor'
s = s.replace(old, new)

old = "  readonly craftedItemIds?: readonly string[];\n}"
new = """  readonly craftedItemIds?: readonly string[];
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
}"""
assert old in s, 'player-data options anchor'
s = s.replace(old, new)

old = "  /** Crafted item recipe IDs (PC V1 craft system). */\n  public craftedItemIds: string[];\n"
new = """  /** Crafted item recipe IDs (PC V1 craft system). */
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
"""
assert old in s, 'player-data fields anchor'
s = s.replace(old, new)

old = "    this.craftedItemIds = [...(options.craftedItemIds ?? [])];\n  }"
new = """    this.craftedItemIds = [...(options.craftedItemIds ?? [])];
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
  }"""
assert old in s, 'player-data ctor anchor'
s = s.replace(old, new)

old = "      craftedItemIds: [...this.craftedItemIds],\n    };"
new = """      craftedItemIds: [...this.craftedItemIds],
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
    if (this.performanceRemainder !== 0) Object.assign(data, { performanceRemainder: this.performanceRemainder });"""
assert old in s, 'player-data toSaveData anchor'
s = s.replace(old, new)

old = "function normalizeRemainder(value: number | undefined): number {\n  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : 0;\n}"
new = """function normalizeRemainder(value: number | undefined): number {
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
}"""
assert old in s, 'player-data helpers anchor'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('player-data.ts patched')
print('ALL OK')
