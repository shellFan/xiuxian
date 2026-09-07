/**
 * IdleEfficiencyService — Unified idle efficiency calculation for WEB V1.
 *
 * Combines work mode, mind efficiency, and sect modifiers into a single
 * efficiency multiplier used for all idle income calculations.
 *
 * Rules:
 * - WORK mode: salary +30%, performance +20%, mind recovery -50%
 * - FISHING mode: salary -40%, performance -30%, mind recovery +200%
 * - Mind efficiency: 80-100→100%, 50-79→90%, 20-49→70%, 1-19→50%, 0→0% (stops work income)
 * - Sect modifiers multiply the base rates
 */

import type { GameContext } from '../core/game-context';
import type { WorkMode } from '../model/save-data';

export interface IdleEfficiencyBreakdown {
  /** Overall efficiency multiplier (0.0 to ~2.0). */
  readonly overall: number;
  /** Work mode modifier component. */
  readonly workModeModifier: number;
  /** Mind efficiency component (0.0 to 1.0). */
  readonly mindEfficiency: number;
  /** Sect modifier component. */
  readonly sectModifier: number;
  /** Current work mode. */
  readonly workMode: WorkMode;
  /** Mind ratio (0.0 to 1.0). */
  readonly mindRatio: number;
  /** Human-readable status text. */
  readonly statusText: string;
}

/** Work mode modifiers for idle efficiency. */
const WORK_MODE_MODIFIERS: Record<WorkMode, { salary: number; performance: number; mindRecovery: number }> = {
  WORK: { salary: 1.3, performance: 1.2, mindRecovery: 0.5 },
  FISHING: { salary: 0.6, performance: 0.7, mindRecovery: 3.0 },
};

/** Mind efficiency tiers based on mind/maxMind ratio. */
function getMindEfficiency(mindRatio: number): number {
  if (mindRatio >= 0.8) return 1.0;
  if (mindRatio >= 0.5) return 0.9;
  if (mindRatio >= 0.2) return 0.7;
  if (mindRatio >= 0.01) return 0.5;
  return 0; // mind=0: stops work income but keeps cultivation base
}

/** Mind efficiency status text. */
function getMindStatusText(mindRatio: number): string {
  if (mindRatio >= 0.8) return '精神饱满';
  if (mindRatio >= 0.5) return '正常牛马';
  if (mindRatio >= 0.2) return '心态不稳';
  if (mindRatio >= 0.01) return '濒临破防';
  return '彻底破防';
}

export class IdleEfficiencyService {
  public constructor(private readonly context: GameContext) {}

  /** Get the current overall idle efficiency multiplier. */
  public getEfficiency(): number {
    return this.getBreakdown().overall;
  }

  /** Get the full efficiency breakdown. */
  public getBreakdown(): IdleEfficiencyBreakdown {
    const player = this.context.player;
    const workMode = player.workMode;
    const mindRatio = player.maxMind > 0 ? player.mind / player.maxMind : 0;
    const mindEfficiency = getMindEfficiency(mindRatio);
    const workModeModifier = WORK_MODE_MODIFIERS[workMode];

    // Sect modifier: use salary multiplier as base
    const sect = this.context.sect.current();
    const sectModifier = sect ? sect.modifiers.salaryMultiplier : 1.0;

    // Overall efficiency: work mode × mind efficiency × sect modifier
    // For salary/performance, mind efficiency applies
    // For mind recovery, mind efficiency does NOT apply (recovery is flat per mode)
    const overall = workModeModifier.salary * mindEfficiency * sectModifier;

    return Object.freeze({
      overall,
      workModeModifier: workModeModifier.salary,
      mindEfficiency,
      sectModifier,
      workMode,
      mindRatio,
      statusText: getMindStatusText(mindRatio),
    });
  }

  /** Get salary efficiency (work mode × mind × sect). */
  public getSalaryEfficiency(): number {
    const b = this.getBreakdown();
    return b.workModeModifier * b.mindEfficiency * b.sectModifier;
  }

  /** Get performance efficiency (work mode × mind). */
  public getPerformanceEfficiency(): number {
    const player = this.context.player;
    const workMode = player.workMode;
    const mindRatio = player.maxMind > 0 ? player.mind / player.maxMind : 0;
    const mindEfficiency = getMindEfficiency(mindRatio);
    return WORK_MODE_MODIFIERS[workMode].performance * mindEfficiency;
  }

  /** Get mind recovery efficiency (work mode only, no mind modifier). */
  public getMindRecoveryEfficiency(): number {
    const player = this.context.player;
    const workMode = player.workMode;
    return WORK_MODE_MODIFIERS[workMode].mindRecovery;
  }

  /** Get cultivation efficiency (mind efficiency only). */
  public getCultivationEfficiency(): number {
    const player = this.context.player;
    const mindRatio = player.maxMind > 0 ? player.mind / player.maxMind : 0;
    return getMindEfficiency(mindRatio);
  }

  /** Whether work income is stopped (mind = 0). */
  public isWorkIncomeStopped(): boolean {
    return this.context.player.mind <= 0;
  }

  /** Whether player is in fishing mode. */
  public isFishingMode(): boolean {
    return this.context.player.workMode === 'FISHING';
  }
}