import type { GameContext } from '../core/game-context';

export interface GameLoopServiceOptions {
  /** Seconds between auto-saves. 0 disables auto-save. */
  readonly autoSaveIntervalSeconds?: number;
  readonly tickIntervalSeconds?: number;
  /** Seconds between achievement checks. Default 30. */
  readonly achievementCheckIntervalSeconds?: number;
}

/**
 * Headless-friendly game loop. Cocos components should call `tick(deltaSeconds)` only.
 *
 * The loop is fully frame-rate independent: it accumulates real delta time
 * and steps in fixed-size intervals. All game logic (work, fishing, salary,
 * cultivation, mind, KPI, buff, events, achievements) is driven from `step()`.
 */
export class GameLoopService {
  private readonly tickIntervalSeconds: number;
  private readonly autoSaveIntervalSeconds: number;
  private readonly achievementCheckIntervalSeconds: number;
  private accumulatedSeconds = 0;
  private autoSaveAccumulatedSeconds = 0;
  private achievementAccumulatedSeconds = 0;
  private running = false;
  /** Epsilon for floating-point tolerance in fixed-step accumulation. */
  private static readonly EPSILON = 1e-9;

  public constructor(private readonly context: GameContext, options: GameLoopServiceOptions = {}) {
    this.tickIntervalSeconds = options.tickIntervalSeconds ?? 1;
    this.autoSaveIntervalSeconds = options.autoSaveIntervalSeconds ?? 60;
    this.achievementCheckIntervalSeconds = options.achievementCheckIntervalSeconds ?? 30;
  }

  public start(): void { this.running = true; }

  public stop(): void { this.running = false; }

  public isRunning(): boolean { return this.running; }

  public tick(deltaSeconds: number): void {
    if (!this.running || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.accumulatedSeconds += deltaSeconds;
    const interval = this.tickIntervalSeconds;
    while (this.accumulatedSeconds >= interval - GameLoopService.EPSILON) {
      this.accumulatedSeconds -= interval;
      this.step(interval);
      if (Math.abs(this.accumulatedSeconds) < GameLoopService.EPSILON) this.accumulatedSeconds = 0;
    }
  }

  private step(seconds: number): void {
    // 1. Tick buffs (expire finished buffs)
    this.context.buffs.tick(seconds);

    // 2. Work / Fishing tick (salary, cultivation, mind, workSeconds/fishingSeconds)
    const workResult = this.context.work.tick(seconds);

    // 3. Track KPI salary earned from work/fishing ticks
    if (workResult.salary > 0) {
      this.context.kpi.recordSalaryEarned(workResult.salary);
    }

    // 4. Emit player change events
    if (workResult.salary !== 0 || workResult.cultivationExp !== 0 || workResult.mind !== 0) {
      this.context.events.emit('playerChanged', { reason: 'workTick', mode: workResult.mode });
    }
    if (workResult.mind !== 0) {
      this.context.events.emit('mindChanged', { delta: workResult.mind, total: this.context.player.mind });
    }

    // 5. Poll for career events
    this.context.careerEvents.poll();

    // 6. Achievement check (periodic)
    if (this.achievementCheckIntervalSeconds > 0) {
      this.achievementAccumulatedSeconds += seconds;
      if (this.achievementAccumulatedSeconds >= this.achievementCheckIntervalSeconds) {
        this.achievementAccumulatedSeconds -= this.achievementCheckIntervalSeconds;
        try {
          this.context.achievements.checkAll();
        } catch {
          // Achievement check failure must not crash the game loop
        }
      }
    }

    // 7. Tutorial auto-advance check
    try {
      this.context.tutorial.checkAutoAdvance();
    } catch {
      // Tutorial check failure must not crash the game loop
    }

    // 8. Auto-save periodically
    if (this.autoSaveIntervalSeconds > 0) {
      this.autoSaveAccumulatedSeconds += seconds;
      if (this.autoSaveAccumulatedSeconds >= this.autoSaveIntervalSeconds) {
        this.autoSaveAccumulatedSeconds -= this.autoSaveIntervalSeconds;
        try {
          this.context.saveService.autoSave(this.context.player);
          this.context.events.emit('gameSaved', { reason: 'idle' });
        } catch {
          // Auto-save failure must not crash the game loop
        }
      }
    }
  }
}