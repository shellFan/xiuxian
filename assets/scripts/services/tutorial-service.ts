import type { GameContext } from '../core/game-context';

export const CURRENT_TUTORIAL_VERSION = 2;
export const TUTORIAL_HINT_DURATION_MS = 30_000;

export type ActiveTutorialStep =
  | 'WELCOME'
  | 'FIRST_WORK'
  | 'FIRST_FISH'
  | 'FIRST_CULTIVATE'
  | 'FIRST_TASK';

/** @deprecated Kept in the public type only so historical tests/tools still compile. */
export type LegacyTutorialStep =
  | 'FIRST_RECRUIT'
  | 'SECOND_RECRUIT'
  | 'FIRST_MERGE'
  | 'START_WORK'
  | 'CHECK_KPI'
  | 'FIRST_PROMOTION';

export type TutorialStep = ActiveTutorialStep | LegacyTutorialStep;

const TUTORIAL_STEPS: readonly ActiveTutorialStep[] = [
  'WELCOME',
  'FIRST_WORK',
  'FIRST_FISH',
  'FIRST_CULTIVATE',
  'FIRST_TASK',
];

const ACTIVE_TUTORIAL_STEPS = new Set<string>(TUTORIAL_STEPS);

/**
 * Non-blocking first-day guidance. It observes completed actions but never
 * validates or intercepts commands. Each hint disappears after its action or
 * after 30 seconds on the game clock, whichever comes first.
 */
export class TutorialService {
  private hintStep: ActiveTutorialStep | null = null;
  private hintStartedAt = 0;

  public constructor(private readonly context: GameContext) {}

  public currentStep(): ActiveTutorialStep | 'NONE' {
    this.normalizeState();
    if (this.context.player.tutorialCompleted) return 'NONE';
    return this.context.player.tutorialStep as ActiveTutorialStep;
  }

  public isCompleted(): boolean {
    this.normalizeState();
    return this.context.player.tutorialCompleted;
  }

  public getSteps(): readonly ActiveTutorialStep[] {
    return TUTORIAL_STEPS;
  }

  public currentStepIndex(): number {
    const step = this.currentStep();
    return step === 'NONE' ? -1 : TUTORIAL_STEPS.indexOf(step);
  }

  public advance(): void {
    const current = this.currentStep();
    if (current === 'NONE') return;
    const index = TUTORIAL_STEPS.indexOf(current);
    if (index >= TUTORIAL_STEPS.length - 1) {
      this.complete();
      return;
    }
    const next = TUTORIAL_STEPS[index + 1];
    this.context.player.tutorialStep = next;
    this.startHint(next);
    this.context.events.emit('tutorialStepChanged', { step: next, completed: false });
  }

  /** Skip is the same durable terminal state as normal completion. */
  public complete(): void {
    this.normalizeState();
    if (this.context.player.tutorialCompleted) return;
    this.context.player.tutorialVersion = CURRENT_TUTORIAL_VERSION;
    this.context.player.tutorialStep = 'NONE';
    this.context.player.tutorialCompleted = true;
    this.hintStep = null;
    this.context.events.emit('tutorialStepChanged', { step: 'NONE', completed: true });
  }

  public checkAutoAdvance(): boolean {
    const step = this.currentStep();
    if (step === 'NONE') return false;
    if (!this.isConditionMet(step) && !this.isHintExpired()) return false;
    this.advance();
    return true;
  }

  /** Action observation only; callers must never use this as a command guard. */
  public isConditionMet(step: TutorialStep): boolean {
    const player = this.context.player;
    switch (step) {
      case 'WELCOME':
        return false;
      case 'FIRST_WORK':
        return player.workSeconds > 0;
      case 'FIRST_FISH':
        return player.fishingSeconds > 0;
      case 'FIRST_CULTIVATE':
        return player.cultivatingSeconds > 0 || player.cultivationExp > 0;
      case 'FIRST_TASK':
        return player.activeTasks.length > 0 || (player.kpiProgress.TASK_DONE ?? 0) > 0;
      default:
        return false;
    }
  }

  private normalizeState(): void {
    const player = this.context.player;
    const now = this.now();

    if (!Number.isFinite(player.tutorialStartedAt) || player.tutorialStartedAt < 0) {
      player.tutorialStartedAt = now;
    }

    if (player.tutorialCompleted || (player.tutorialVersion === CURRENT_TUTORIAL_VERSION && player.tutorialStep === 'NONE')) {
      player.tutorialVersion = CURRENT_TUTORIAL_VERSION;
      player.tutorialStep = 'NONE';
      player.tutorialCompleted = true;
      this.hintStep = null;
      return;
    }

    if (player.tutorialVersion !== CURRENT_TUTORIAL_VERSION || !ACTIVE_TUTORIAL_STEPS.has(player.tutorialStep)) {
      player.tutorialVersion = CURRENT_TUTORIAL_VERSION;
      player.tutorialStep = 'WELCOME';
    }

    player.tutorialCompleted = false;
    const step = player.tutorialStep as ActiveTutorialStep;
    if (this.hintStep !== step) this.startHint(step, now);
  }

  private startHint(step: ActiveTutorialStep, now = this.now()): void {
    this.hintStep = step;
    this.hintStartedAt = now;
  }

  private isHintExpired(): boolean {
    return Math.max(0, this.now() - this.hintStartedAt) >= TUTORIAL_HINT_DURATION_MS;
  }

  private now(): number {
    const now = this.context.clockV2.now();
    return Number.isFinite(now) && now >= 0 ? now : 0;
  }
}
