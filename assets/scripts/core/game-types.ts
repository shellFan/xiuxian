export type LifecycleState = 'created' | 'started' | 'destroyed';

export interface BoardSize {
  readonly columns: number;
  readonly rows: number;
}

export interface GameContext {
  readonly config: typeof import('./game-config').GameConfig;
}
