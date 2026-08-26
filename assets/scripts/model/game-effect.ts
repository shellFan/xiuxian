/** A single atomic delta applied to the player's core resources. */
export interface GameEffect {
  readonly salary?: number;
  readonly performance?: number;
  readonly cultivation?: number;
  readonly mind?: number;
}
