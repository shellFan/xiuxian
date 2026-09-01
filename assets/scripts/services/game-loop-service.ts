import type { GameContext } from '../core/game-context';

export interface GameLoopServiceOptions {
  readonly tickIntervalSeconds?: number;
}

/** Headless-friendly game loop. Cocos components should call `tick(deltaSeconds)` only. */
export class GameLoopService {
  private readonly tickIntervalSeconds: number;
  private accumulatedSeconds = 0;
  private running = false;

  public constructor(private readonly context: GameContext, options: GameLoopServiceOptions = {}) {
    this.tickIntervalSeconds = options.tickIntervalSeconds ?? 1;
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
    if (workResult.salary !== 0 || workResult.cultivationExp !== 0 || workResult.mind !== 0) {
      this.context.events.emit('playerChanged', { reason: 'workTick', mode: workResult.mode });
    }
    if (workResult.mind !== 0) {
      this.context.events.emit('mindChanged', { delta: workResult.mind, total: this.context.player.mind });
    }
    this.context.careerEvents.poll();
  }
}
