import { MemoryStorageAdapter, type StorageAdapter } from '../services/storage-adapter';
import { GameContext, type GameContextOptions } from './game-context';
import type { LifecycleState } from './game-types';

export interface GameBootstrapOptions extends Omit<GameContextOptions, 'storage'> {
  readonly storage?: StorageAdapter;
}

export class GameBootstrap {
  public lifecycle: LifecycleState = 'created';
  public readonly context: GameContext;
  public readonly events: GameContext['events'];

  public constructor(options: GameBootstrapOptions = {}) {
    this.context = new GameContext({ ...options, storage: options.storage ?? new MemoryStorageAdapter() });
    this.events = this.context.events;
  }

  public start(): void {
    if (this.lifecycle !== 'created') {
      return;
    }
    this.lifecycle = 'started';
  }

  public destroy(): void {
    if (this.lifecycle === 'destroyed') {
      return;
    }
    this.context.events.clear();
    this.lifecycle = 'destroyed';
  }
}
