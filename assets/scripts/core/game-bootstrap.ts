import { EventBus } from './event-bus';
import { GameConfig } from './game-config';
import type { GameContext, LifecycleState } from './game-types';

export class GameBootstrap {
  public lifecycle: LifecycleState = 'created';
  public readonly context: GameContext;
  public readonly events = new EventBus<Record<string, unknown>>();

  public constructor() {
    this.context = { config: GameConfig };
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
    this.events.clear();
    this.lifecycle = 'destroyed';
  }
}
