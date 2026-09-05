// EventRuntimeAdapter — Phase 5 event pool strategy per EVENT-POOL-V1
// 类别彩票: EASTER_EGG 0.1%, RARE 1%, 普通池 98.9%
// 普通池权重: career stage → POSITIVE/NEGATIVE/CHOICE weights
// 资格过滤: careerLevel/workMode/mind ratio/KPI progress
// 冷却: 同ID 30min; 历史: 最近5ID排除; 负面连击: 2连负→NEGATIVE×0
// 彩蛋: oncePerSave + oncePerDay(每日1次)
// 无合格候选时跳过本机会，不降级/不重抽/不除以0

import { DEFAULT_CLOCK, type Clock } from '../core/clock';
import { DEFAULT_RANDOM_PROVIDER, type RandomProvider } from '../core/random-provider';
import type { CareerEventConfig, CareerEventType } from '../model/config-types';

// ── Eligibility metadata (sidecar, not in CareerEventConfig) ──

export type WorkModeRequirement = 'ANY' | 'WORK' | 'FISHING';

export interface EventEligibility {
  readonly eventId: string;
  readonly minCareerLevel: number;       // 1..10, default 1
  readonly maxCareerLevel: number;       // 1..10, default 10
  readonly requiresWorkMode: WorkModeRequirement; // default ANY
  readonly cooldownMs: number;           // default 1800000 (30min)
  readonly minMindRatio?: number;        // 0..1, default 0
  readonly maxMindRatio?: number;        // 0..1, default 1
  readonly minKpiProgress?: number;      // 0..1, default 0
  readonly oncePerSave: boolean;         // default false; EASTER_EGG forced true
  readonly oncePerDay: boolean;          // default false
}

// ── Career stage weight table ──

export interface CategoryWeights {
  readonly POSITIVE: number;
  readonly NEGATIVE: number;
  readonly CHOICE: number;
}

const STAGE_WEIGHTS: readonly CategoryWeights[] = [
  // index 0 unused; career 1-2
  { POSITIVE: 50, NEGATIVE: 15, CHOICE: 35 },
  { POSITIVE: 50, NEGATIVE: 15, CHOICE: 35 },
  // career 3-6
  { POSITIVE: 35, NEGATIVE: 25, CHOICE: 40 },
  { POSITIVE: 35, NEGATIVE: 25, CHOICE: 40 },
  { POSITIVE: 35, NEGATIVE: 25, CHOICE: 40 },
  { POSITIVE: 35, NEGATIVE: 25, CHOICE: 40 },
  // career 7-10
  { POSITIVE: 30, NEGATIVE: 25, CHOICE: 45 },
  { POSITIVE: 30, NEGATIVE: 25, CHOICE: 45 },
  { POSITIVE: 30, NEGATIVE: 25, CHOICE: 45 },
  { POSITIVE: 30, NEGATIVE: 25, CHOICE: 45 },
];

// ── Lottery constants ──

const EASTER_EGG_CEILING = 10;    // 0..9 → 0.1%
const RARE_CEILING = 110;         // 10..109 → 1%
const LOTTERY_MAX = 10000;        // 0..9999

const RECENT_HISTORY_SIZE = 5;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const EGG_DAILY_LIMIT = 1;

// ── Snapshot needed for eligibility ──

export interface PlayerSnapshot {
  readonly careerLevel: number;     // 1..10
  readonly workMode: 'WORK' | 'FISHING';
  readonly mind: number;
  readonly maxMind: number;
  readonly kpiCompleted: number;
  readonly kpiTotal: number;
}

// ── Adapter ──

export interface EventRuntimeAdapterOptions {
  readonly clock?: Clock;
  readonly randomProvider?: RandomProvider;
  readonly eligibilityOverrides?: ReadonlyMap<string, Partial<EventEligibility>>;
}

export class EventRuntimeAdapter {
  private readonly clock: Clock;
  private readonly random: RandomProvider;
  private readonly eligibilityMap: Map<string, EventEligibility>;

  // persistent state
  private recentEventIds: string[] = [];
  private negativeStreak = 0;
  private lastShownAtById = new Map<string, number>();
  private eggSeenIds = new Set<string>();
  private eggDayKey = '';
  private eggDailyCount = 0;

  public constructor(
    private readonly events: readonly CareerEventConfig[],
    options: EventRuntimeAdapterOptions = {},
  ) {
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.eligibilityMap = new Map();
    for (const ev of events) {
      const override = options.eligibilityOverrides?.get(ev.id);
      this.eligibilityMap.set(ev.id, buildEligibility(ev, override));
    }
  }

  // ── Public API ──

  /** Select next event using EVENT-POOL-V1 strategy. Returns undefined when skipping. */
  public poll(snapshot: PlayerSnapshot): CareerEventConfig | undefined {
    // Step 1: Category lottery
    const roll = Math.floor(this.random.next() * LOTTERY_MAX);
    let category: 'EASTER_EGG' | 'RARE' | 'NORMAL';
    if (roll < EASTER_EGG_CEILING) {
      category = 'EASTER_EGG';
    } else if (roll < RARE_CEILING) {
      category = 'RARE';
    } else {
      category = 'NORMAL';
    }

    // Step 2: Filter eligible events for the drawn category
    const eligible = this.filterEligible(snapshot, category);
    if (eligible.length === 0) return undefined; // skip, no reroll

    // Step 3: Select from eligible
    if (category === 'NORMAL') {
      return this.selectWeighted(eligible, snapshot);
    }
    // RARE / EASTER_EGG: uniform from eligible
    return eligible[Math.floor(this.random.next() * eligible.length)];
  }

  /** Record that an event was shown to the player. Call after event becomes pending. */
  public recordShown(eventId: string): void {
    const now = this.clock.now();
    this.lastShownAtById.set(eventId, now);
    this.recentEventIds.push(eventId);
    if (this.recentEventIds.length > RECENT_HISTORY_SIZE) {
      this.recentEventIds.shift();
    }
    const ev = this.events.find(e => e.id === eventId);
    if (ev?.type === 'NEGATIVE') {
      this.negativeStreak++;
    } else {
      this.negativeStreak = 0;
    }
    if (ev?.type === 'EASTER_EGG') {
      this.eggSeenIds.add(eventId);
      const dayKey = dayKeyFromMs(now);
      if (dayKey !== this.eggDayKey) {
        this.eggDayKey = dayKey;
        this.eggDailyCount = 0;
      }
      this.eggDailyCount++;
    }
  }

  /** Reset state for new save. */
  public resetForNewSave(): void {
    this.recentEventIds = [];
    this.negativeStreak = 0;
    this.lastShownAtById.clear();
    this.eggSeenIds.clear();
    this.eggDayKey = '';
    this.eggDailyCount = 0;
  }

  // ── Internal ──

  private filterEligible(snapshot: PlayerSnapshot, category: 'EASTER_EGG' | 'RARE' | 'NORMAL'): CareerEventConfig[] {
    const now = this.clock.now();
    const result: CareerEventConfig[] = [];

    for (const ev of this.events) {
      const elig = this.eligibilityMap.get(ev.id);
      if (!elig) continue;

      // Category match
      if (category === 'EASTER_EGG' && ev.type !== 'EASTER_EGG') continue;
      if (category === 'RARE' && ev.type !== 'RARE') continue;
      if (category === 'NORMAL' && (ev.type === 'EASTER_EGG' || ev.type === 'RARE')) continue;

      // Career level
      if (snapshot.careerLevel < elig.minCareerLevel || snapshot.careerLevel > elig.maxCareerLevel) continue;

      // Work mode
      if (elig.requiresWorkMode !== 'ANY' && elig.requiresWorkMode !== snapshot.workMode) continue;

      // Mind ratio
      if (elig.minMindRatio !== undefined || elig.maxMindRatio !== undefined) {
        const mindRatio = snapshot.maxMind > 0 ? snapshot.mind / snapshot.maxMind : 0;
        const min = elig.minMindRatio ?? 0;
        const max = elig.maxMindRatio ?? 1;
        if (mindRatio < min || mindRatio > max) continue;
        // maxMind <= 0 means ineligible
        if (snapshot.maxMind <= 0 && min > 0) continue;
      }

      // KPI progress
      if (elig.minKpiProgress !== undefined && elig.minKpiProgress > 0) {
        if (snapshot.kpiTotal <= 0) continue; // no KPI data
        const kpiProgress = snapshot.kpiCompleted / snapshot.kpiTotal;
        if (kpiProgress < elig.minKpiProgress) continue;
      }

      // Cooldown
      const lastShown = this.lastShownAtById.get(ev.id);
      if (lastShown !== undefined && (now - lastShown) < elig.cooldownMs) continue;

      // Recent history
      if (this.recentEventIds.includes(ev.id)) continue;

      // oncePerSave (EASTER_EGG)
      if (elig.oncePerSave && this.eggSeenIds.has(ev.id)) continue;

      // oncePerDay (EASTER_EGG daily limit)
      if (elig.oncePerDay) {
        const dayKey = dayKeyFromMs(now);
        if (dayKey === this.eggDayKey && this.eggDailyCount >= EGG_DAILY_LIMIT) continue;
      }

      result.push(ev);
    }

    return result;
  }

  private selectWeighted(eligible: CareerEventConfig[], snapshot: PlayerSnapshot): CareerEventConfig {
    // Get base weights for career stage
    const idx = Math.max(0, Math.min(9, snapshot.careerLevel - 1));
    let weights = { ...STAGE_WEIGHTS[idx] };

    // Apply modifiers
    // Low mind protection: mind/maxMind < 0.3 → NEGATIVE × 0
    if (snapshot.maxMind > 0 && snapshot.mind / snapshot.maxMind < 0.3) {
      weights.NEGATIVE = 0;
    }

    // Negative streak protection: 2 consecutive negatives → NEGATIVE × 0
    if (this.negativeStreak >= 2) {
      weights.NEGATIVE = 0;
    }

    // KPI near completion: CHOICE × 1.25
    if (snapshot.kpiTotal > 0 && snapshot.kpiCompleted / snapshot.kpiTotal >= 0.8) {
      weights.CHOICE = Math.round(weights.CHOICE * 1.25);
    }

    // Fishing mode: POSITIVE × 1.2, NEGATIVE × 0.8
    if (snapshot.workMode === 'FISHING') {
      weights.POSITIVE = Math.round(weights.POSITIVE * 1.2);
      weights.NEGATIVE = Math.round(weights.NEGATIVE * 0.8);
    }

    // Group eligible by type and compute effective weights
    const byType = new Map<CareerEventType, CareerEventConfig[]>();
    for (const ev of eligible) {
      const arr = byType.get(ev.type) ?? [];
      arr.push(ev);
      byType.set(ev.type, arr);
    }

    // Build weight entries for categories that have candidates
    type Entry = { type: CareerEventType; weight: number; events: CareerEventConfig[] };
    const entries: Entry[] = [];
    for (const [type, evs] of byType) {
      const w = type === 'POSITIVE' ? weights.POSITIVE
        : type === 'NEGATIVE' ? weights.NEGATIVE
        : type === 'CHOICE' ? weights.CHOICE
        : 0; // RARE/EASTER_EGG shouldn't be in normal pool
      if (w > 0 && evs.length > 0) {
        entries.push({ type, weight: w, events: evs });
      }
    }

    // If no entries have weight (all protected away), skip — but caller already filtered
    // Fallback: uniform from eligible if all weights zero
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalWeight === 0) {
      return eligible[Math.floor(this.random.next() * eligible.length)];
    }

    // Weighted category selection
    let roll = this.random.next() * totalWeight;
    let selected: Entry | undefined;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) { selected = entry; break; }
    }
    if (!selected) selected = entries[entries.length - 1];

    // Uniform within category
    return selected.events[Math.floor(this.random.next() * selected.events.length)];
  }
}

// ── Helpers ──

function buildEligibility(ev: CareerEventConfig, override?: Partial<EventEligibility>): EventEligibility {
  const isEgg = ev.type === 'EASTER_EGG';
  return {
    eventId: ev.id,
    minCareerLevel: override?.minCareerLevel ?? 1,
    maxCareerLevel: override?.maxCareerLevel ?? 10,
    requiresWorkMode: override?.requiresWorkMode ?? 'ANY',
    cooldownMs: override?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    minMindRatio: override?.minMindRatio,
    maxMindRatio: override?.maxMindRatio,
    minKpiProgress: override?.minKpiProgress,
    oncePerSave: override?.oncePerSave ?? isEgg,
    oncePerDay: override?.oncePerDay ?? false,
  };
}

function dayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}