/** Shared integer hit settlement for project battles and the home campaign. */
export function calculateBattleDamage(attack: number, critical: boolean, criticalMultiplier = 1.8): number {
  return Math.max(1, Math.floor(attack * (critical ? criticalMultiplier : 1)));
}
