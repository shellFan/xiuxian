/**
 * UIUpdateStrategy — determines which UI regions need re-rendering
 * based on GameSnapshot diff.
 *
 * Instead of re-rendering all components on every tick, this strategy
 * compares the current snapshot with the previous one and identifies
 * which ViewModel categories have changed. Only affected components
 * are refreshed.
 *
 * Usage:
 *   const strategy = new UIUpdateStrategy();
 *   const changes = strategy.diff(prevSnapshot, currSnapshot);
 *   if (changes.career) careerPanel.refresh();
 *   if (changes.resources) hud.refresh();
 */

import type { GameSnapshot } from '../facade/game-snapshot';
import { snapshotEqual } from '../facade/game-snapshot';

// ── Change Set ──────────────────────────────────────────────────────────────

export interface UIChangeSet {
  /** Career level, realm, or name changed. */
  readonly career: boolean;
  /** Salary, cultivation, performance changed. */
  readonly resources: boolean;
  /** Mind value or status changed. */
  readonly mind: boolean;
  /** Work mode changed (WORK ↔ FISHING). */
  readonly workMode: boolean;
  /** Board state changed (workers, positions). */
  readonly board: boolean;
  /** KPI state changed. */
  readonly kpi: boolean;
  /** Achievement state changed. */
  readonly achievement: boolean;
  /** Daily task state changed. */
  readonly dailyTask: boolean;
  /** Tutorial state changed. */
  readonly tutorial: boolean;
  /** Office level changed. */
  readonly office: boolean;
  /** Sect changed. */
  readonly sect: boolean;
  /** Talent changed. */
  readonly talent: boolean;
  /** Any change at all. */
  readonly any: boolean;
}

// ── Strategy ────────────────────────────────────────────────────────────────

const EMPTY_CHANGESET: UIChangeSet = {
  career: false,
  resources: false,
  mind: false,
  workMode: false,
  board: false,
  kpi: false,
  achievement: false,
  dailyTask: false,
  tutorial: false,
  office: false,
  sect: false,
  talent: false,
  any: false,
};

export class UIUpdateStrategy {
  /**
   * Compare two snapshots and return which UI regions changed.
   * Returns EMPTY_CHANGESET (all false) if snapshots are identical.
   */
  public diff(prev: GameSnapshot | null, curr: GameSnapshot): UIChangeSet {
    // If no previous snapshot, everything is "changed" (initial render)
    if (!prev) return ALL_CHANGED;

    // Quick check: if snapshots are shallow-equal, nothing changed
    if (snapshotEqual(prev, curr)) return EMPTY_CHANGESET;

    // Field-by-field diff
    const career = prev.careerLevel !== curr.careerLevel;
    const resources =
      prev.salary !== curr.salary ||
      prev.cultivationExp !== curr.cultivationExp ||
      prev.performance !== curr.performance;
    const mind = prev.mind !== curr.mind || prev.maxMind !== curr.maxMind || prev.mindStatus !== curr.mindStatus;
    const workMode = prev.workMode !== curr.workMode;
    const board = prev.workerCount !== curr.workerCount || prev.maxWorkerLevel !== curr.maxWorkerLevel;
    const kpi = false; // KPI is derived from GameContext, not snapshot
    const achievement =
      !arraysEqual(prev.unlockedAchievementIds, curr.unlockedAchievementIds) ||
      !arraysEqual(prev.claimedAchievementIds, curr.claimedAchievementIds);
    const dailyTask =
      prev.dailyTaskDay !== curr.dailyTaskDay ||
      !arraysEqual(prev.dailyTasks, curr.dailyTasks);
    const tutorial = prev.tutorialStep !== curr.tutorialStep || prev.tutorialCompleted !== curr.tutorialCompleted;
    const office = prev.officeLevel !== curr.officeLevel;
    const sect = prev.sectId !== curr.sectId;
    const talent = prev.talentId !== curr.talentId;

    const any = career || resources || mind || workMode || board || kpi ||
      achievement || dailyTask || tutorial || office || sect || talent;

    return {
      career,
      resources,
      mind,
      workMode,
      board,
      kpi,
      achievement,
      dailyTask,
      tutorial,
      office,
      sect,
      talent,
      any,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function arraysEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const ALL_CHANGED: UIChangeSet = {
  career: true,
  resources: true,
  mind: true,
  workMode: true,
  board: true,
  kpi: true,
  achievement: true,
  dailyTask: true,
  tutorial: true,
  office: true,
  sect: true,
  talent: true,
  any: true,
};