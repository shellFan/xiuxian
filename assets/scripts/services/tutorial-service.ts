import type { GameContext } from '../core/game-context';

/**
 * Tutorial step identifiers — ordered sequence for new-player onboarding.
 * The tutorial is linear: each step must be completed before the next unlocks.
 * Once all steps are done, `tutorialCompleted` is set to true and no further
 * steps are shown.
 */
export type TutorialStep =
  | 'FIRST_RECRUIT'
  | 'SECOND_RECRUIT'
  | 'FIRST_MERGE'
  | 'START_WORK'
  | 'CHECK_KPI'
  | 'FIRST_PROMOTION';

/** Ordered sequence — index determines progression. */
const TUTORIAL_STEPS: readonly TutorialStep[] = [
  'FIRST_RECRUIT',
  'SECOND_RECRUIT',
  'FIRST_MERGE',
  'START_WORK',
  'CHECK_KPI',
  'FIRST_PROMOTION',
];

/**
 * TutorialService drives the new-player onboarding flow.
 *
 * Each step has an auto-detection condition checked by `checkAutoAdvance()`.
 * The game loop (or UI) should call this periodically. When a condition is
 * met the service advances to the next step automatically and emits a
 * `tutorialStepChanged` event. UI can also call `advance()` explicitly for
 * steps that require user confirmation (e.g. "CHECK_KPI" after the player
 * opens the KPI panel).
 */
export class TutorialService {
  private readonly context: GameContext;

  public constructor(context: GameContext) {
    this.context = context;
  }

  /** Current tutorial step. Returns 'NONE' if tutorial is completed. */
  public currentStep(): TutorialStep | 'NONE' {
    if (this.context.player.tutorialCompleted) return 'NONE';
    return this.context.player.tutorialStep as TutorialStep;
  }

  /** Whether the tutorial has been completed. */
  public isCompleted(): boolean {
    return this.context.player.tutorialCompleted;
  }

  /** All tutorial steps in order (for UI rendering). */
  public getSteps(): readonly TutorialStep[] {
    return TUTORIAL_STEPS;
  }

  /** Index of the current step (-1 if completed). */
  public currentStepIndex(): number {
    if (this.context.player.tutorialCompleted) return -1;
    return TUTORIAL_STEPS.indexOf(this.context.player.tutorialStep as TutorialStep);
  }

  /**
   * Advance to the next tutorial step.
   * Throws if the tutorial is already completed.
   * If this was the last step, marks the tutorial as completed.
   */
  public advance(): void {
    if (this.context.player.tutorialCompleted) return;
    const current = this.context.player.tutorialStep as TutorialStep;
    const index = TUTORIAL_STEPS.indexOf(current);
    if (index < 0) return;
    if (index >= TUTORIAL_STEPS.length - 1) {
      this.complete();
      return;
    }
    const next = TUTORIAL_STEPS[index + 1];
    this.context.player.tutorialStep = next;
    this.context.events.emit('tutorialStepChanged', { step: next, completed: false });
  }

  /**
   * Complete the tutorial immediately, skipping any remaining steps.
   */
  public complete(): void {
    if (this.context.player.tutorialCompleted) return;
    this.context.player.tutorialCompleted = true;
    this.context.events.emit('tutorialStepChanged', { step: 'NONE', completed: true });
  }

  /**
   * Check if the current step's auto-advance condition is met.
   * Returns true if the step was auto-advanced (or tutorial completed).
   *
   * Auto-advance rules:
   *   FIRST_RECRUIT  → board.occupiedCount >= 1
   *   SECOND_RECRUIT → board.occupiedCount >= 2
   *   FIRST_MERGE    → player.maxWorkerLevel >= 2
   *   START_WORK     → player.workMode === 'WORK' && player.workSeconds > 0
   *   CHECK_KPI      → kpi.isCurrentKpiCompleted() (auto-advance when KPI met)
   *   FIRST_PROMOTION → player.careerLevel >= 2
   */
  public checkAutoAdvance(): boolean {
    if (this.context.player.tutorialCompleted) return false;
    const step = this.context.player.tutorialStep as TutorialStep;
    if (!this.isConditionMet(step)) return false;
    this.advance();
    return true;
  }

  /** Check the auto-advance condition for a specific step. */
  public isConditionMet(step: TutorialStep): boolean {
    const player = this.context.player;
    switch (step) {
      case 'FIRST_RECRUIT':
        return this.context.board.occupiedCount >= 1;
      case 'SECOND_RECRUIT':
        return this.context.board.occupiedCount >= 2;
      case 'FIRST_MERGE':
        return player.maxWorkerLevel >= 2;
      case 'START_WORK':
        return player.workMode === 'WORK' && player.workSeconds > 0;
      case 'CHECK_KPI':
        return this.context.kpi.isCurrentKpiCompleted();
      case 'FIRST_PROMOTION':
        return player.careerLevel >= 2;
      default:
        return false;
    }
  }
}