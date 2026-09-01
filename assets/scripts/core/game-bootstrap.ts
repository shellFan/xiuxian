import { MemoryStorageAdapter, type StorageAdapter } from '../services/storage-adapter';
import { GameLoopService } from '../services/game-loop-service';
import { GameContext, type GameContextOptions } from './game-context';
import type { LifecycleState } from './game-types';

export interface GameBootstrapOptions extends Omit<GameContextOptions, 'storage'> {
  readonly storage?: StorageAdapter;
}

export class GameBootstrap {
  public lifecycle: LifecycleState = 'created';
  public readonly context: GameContext;
  public readonly events: GameContext['events'];
  public readonly gameLoop: GameLoopService;

  public constructor(options: GameBootstrapOptions = {}) {
    this.context = new GameContext({ ...options, storage: options.storage ?? new MemoryStorageAdapter() });
    this.events = this.context.events;
    this.gameLoop = new GameLoopService(this.context);
  }

  public start(): void {
    if (this.lifecycle !== 'created') {
      return;
    }
    this.lifecycle = 'started';
    this.gameLoop.start();
  }

  public tick(deltaSeconds: number): void {
    if (this.lifecycle !== 'started') return;
    this.gameLoop.tick(deltaSeconds);
  }

  public destroy(): void {
    if (this.lifecycle === 'destroyed') {
      return;
    }
    this.gameLoop.stop();
    this.context.careerEvents.destroy();
    this.context.events.clear();
    this.lifecycle = 'destroyed';
  }
}
