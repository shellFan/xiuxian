import type { GameContext } from '../core/game-context';

export interface GameLoopServiceOptions {
  /** Seconds between auto-saves. 0 disables auto-save. */
  readonly autoSaveIntervalSeconds?: number;
  readonly tickIntervalSeconds?: number;
}

/** Headless-friendly game loop. Cocos components should call `tick(deltaSeconds)` only. */
export class GameLoopService {
  private readonly tickIntervalSeconds: number;
  private readonly autoSaveIntervalSeconds: number;
  private accumulatedSeconds = 0;
  private autoSaveAccumulatedSeconds = 0;
  private running = false;

  public constructor(private readonly context: GameContext, options: GameLoopServiceOptions = {}) {
    this.tickIntervalSeconds = options.tickIntervalSeconds ?? 1;
    this.autoSaveIntervalSeconds = options.autoSaveIntervalSeconds ?? 60;
  }

  public start(): void { this.running = true; }

  public stop(): void { this.running = false; }

  public isRunning(): boolean { return this.running; }

  public tick(deltaSeconds: number): void {
    if (!this.running || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.accumulatedSeconds += deltaSeconds;
    while (this.accumulatedSeconds >= this.tickIntervalSeconds) {
      this.accumulatedSeconds -= this.tickIntervalSeconds;
      this.step(this.tickIntervalSeconds);
    }
  }

  private step(seconds: number): void {
    const workResult = this.context.work.tick(seconds);

    // Track KPI salary earned from work/fishing ticks
    if (workResult.salary > 0) {
      this.context.kpi.recordSalaryEarned(workResult.salary);
    }

    if (workResult.salary !== 0 || workResult.cultivationExp !== 0 || workResult.mind !== 0) {
      this.context.events.emit('playerChanged', { reason: 'workTick', mode: workResult.mode });
    }
    if (workResult.mind !== 0) {
      this.context.events.emit('mindChanged', { delta: workResult.mind, total: this.context.player.mind });
    }

    // Poll for career events
    this.context.careerEvents.poll();

    // Auto-save periodically
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