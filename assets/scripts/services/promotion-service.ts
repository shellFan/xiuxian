import type { GameContext } from '../core/game-context';
import type { RandomProvider } from '../core/random-provider';
import { DEFAULT_RANDOM_PROVIDER } from '../core/random-provider';
import type { RewardProvider } from './reward-provider';
import { MockRewardProvider } from './reward-provider';
import type { GameSaveData } from '../model/save-data';

export type PromotionReason = 'MAX_LEVEL' | 'KPI_INCOMPLETE' | 'CULTIVATION_INSUFFICIENT' | 'READY';

export interface PromotionCheck {
  readonly allowed: boolean;
  readonly reason: PromotionReason;
}

export interface PromotionResult {
  readonly success: boolean;
  readonly probability: number;
  readonly roll: number;
  readonly oldCareerLevel: number;
  readonly newCareerLevel: number;
  readonly performanceReward: number;
  readonly mindDelta: number;
  readonly failCount: number;
}

export interface PromotionServiceOptions {
  readonly randomProvider?: RandomProvider;
  readonly rewardProvider?: RewardProvider;
}

const CONNECTION_TALENT_ID = 'GUANXI';
const BASE_PROBABILITY = 70;
const MIND_HIGH_BONUS = 10;
const MIND_LOW_PENALTY = 20;
const CONNECTION_BONUS = 8;
const MIN_PROBABILITY = 5;
const MAX_PROBABILITY = 95;
const PERFORMANCE_REWARD = 10;
const MIND_FAILURE_PENALTY = 10;

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid probability');
  return Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, value));
}

export class PromotionService {
  private readonly random: RandomProvider;
  private readonly rewardProvider: RewardProvider;
  private retryRequested = false;
  private retryAvailable = false;

  public constructor(
    private readonly context: GameContext,
    options: PromotionServiceOptions = {},
  ) {
    this.random = options.randomProvider ?? DEFAULT_RANDOM_PROVIDER;
    this.rewardProvider = options.rewardProvider ?? new MockRewardProvider();
  }

  public getOptions(): readonly { readonly id: string; readonly name: string; readonly description: string }[] {
    return contextOptions(this.context);
  }

  /** Prerequisites: below max level, current KPI completed, and cultivation meets the current level's requirement. */
  public canPromote(): PromotionCheck {
    const player = this.context.player;
    if (player.careerLevel >= 10) return { allowed: false, reason: 'MAX_LEVEL' };
    if (!this.context.kpi.isCurrentKpiCompleted()) return { allowed: false, reason: 'KPI_INCOMPLETE' };
    const required = this.context.career.current().requiredExp;
    if (player.cultivationExp < required) return { allowed: false, reason: 'CULTIVATION_INSUFFICIENT' };
    return { allowed: true, reason: 'READY' };
  }

  /** Promotion success probability (percent), driven by mind and the 关系户 talent. */
  public getProbability(): number {
    const player = this.context.player;
    let probability = BASE_PROBABILITY;
    if (player.mind >= 80) probability += MIND_HIGH_BONUS;
    else if (player.mind < 30) probability -= MIND_LOW_PENALTY;
    if (player.talentId === CONNECTION_TALENT_ID) probability += CONNECTION_BONUS;
    return clampProbability(probability);
  }

  public promote(optionId: string): PromotionResult {
    if (typeof optionId !== 'string' || optionId.trim() === '') throw new Error('Invalid promotion option');
    if (!this.getOptions().some((option) => option.id === optionId)) throw new Error(`Unknown promotion option ${optionId}`);
    const check = this.canPromote();
    if (!check.allowed) throw new Error(`Promotion not allowed: ${check.reason}`);
    const oldCareerLevel = this.context.player.careerLevel;
    const probability = this.getProbability();
    const roll = this.random.next();
    const success = roll < probability / 100;
    const before = this.context.player.toSaveData();
    try {
      if (success) {
        const required = this.context.career.current().requiredExp;
        const overflow = this.context.player.cultivationExp - required;
        this.context.player.cultivationExp = overflow;
        const newLevel = this.context.player.careerLevel + 1;
        this.context.player.careerLevel = newLevel;
        // Reset per-level KPI counters; cumulative facts (workSeconds / cultivationExp) are preserved.
        this.context.kpi.switchLevel(newLevel);
        this.context.player.performance += PERFORMANCE_REWARD;
        this.context.player.promotionFailCount = 0;
        this.context.saveService.save(this.context.player);
      } else {
        const mindDelta = this.context.mind.applyDelta(-MIND_FAILURE_PENALTY);
        this.context.player.promotionFailCount += 1;
        this.context.saveService.save(this.context.player);
        return this.result(false, probability, roll, oldCareerLevel, oldCareerLevel, 0, mindDelta, this.context.player.promotionFailCount);
      }
    } catch (error) {
      restorePlayer(this.context.player, before);
      throw error;
    }
    return this.result(true, probability, roll, oldCareerLevel, this.context.player.careerLevel, PERFORMANCE_REWARD, 0, this.context.player.promotionFailCount);
  }

  /**
   * Requests a rewarded-ad-style retry after a failed interview (Phase 2: mock only).
   * Guards against re-entrancy (double click) and duplicate reward callbacks.
   */
  public requestRetry(onResult: (granted: boolean) => void): void {
    if (this.retryRequested) return;
    this.retryRequested = true;
    let settled = false;
    this.rewardProvider.requestReward('PROMOTION_RETRY', (granted) => {
      if (settled) return;
      settled = true;
      this.retryRequested = false;
      this.retryAvailable = granted;
      onResult(granted);
    });
  }

  public get retryGranted(): boolean { return this.retryAvailable; }

  private result(
    success: boolean,
    probability: number,
    roll: number,
    oldCareerLevel: number,
    newCareerLevel: number,
    performanceReward: number,
    mindDelta: number,
    failCount: number,
  ): PromotionResult {
    return { success, probability, roll, oldCareerLevel, newCareerLevel, performanceReward, mindDelta, failCount };
  }
}

function contextOptions(context: GameContext): readonly { readonly id: string; readonly name: string; readonly description: string }[] {
  return context.configService.promotion.options;
}

function restorePlayer(player: GameContext['player'], data: GameSaveData): void {
  player.salary = data.salary;
  player.maxWorkerLevel = data.maxWorkerLevel;
  player.careerLevel = data.careerLevel;
  player.maxMind = data.maxMind;
  player.performance = data.performance;
  player.cultivationExp = data.cultivationExp;
  player.mind = data.mind;
  player.sectId = data.sectId;
  player.talentId = data.talentId;
  player.workMode = data.workMode;
  player.workSeconds = data.workSeconds;
  player.fishingSeconds = data.fishingSeconds;
  player.kpiProgress = { ...data.kpiProgress };
  player.promotionFailCount = data.promotionFailCount;
  player.officeLevel = data.officeLevel;
  player.lastIdleSettlementId = data.lastIdleSettlementId;
  player.lastSaveTime = data.lastSaveTime;
  player.salaryRemainder = data.salaryRemainder ?? 0;
  player.cultivationRemainder = data.cultivationRemainder ?? 0;
  player.mindRemainder = data.mindRemainder ?? 0;
  player.workMindRemainder = data.workMindRemainder ?? 0;
  player.fishingMindRemainder = data.fishingMindRemainder ?? 0;
}
