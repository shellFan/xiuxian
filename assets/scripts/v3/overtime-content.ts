import overtimeAchievementsConfig from '../../configs/v3/overtime-achievements.json';
import overtimeContentConfig from '../../configs/v3/overtime-content.json';
import type { AchievementBundle } from '../services/achievement-service';
import type { EventDefinition } from '../v2/event-engine';

/** Immutable V3 content bundles. Runtime systems read these; they never own literal pools. */
export const OVERTIME_EVENTS: readonly EventDefinition[] = Object.freeze(
  (overtimeContentConfig as { events: EventDefinition[] }).events.map((event) => Object.freeze({ ...event })),
);

export const OVERTIME_ACHIEVEMENTS: AchievementBundle = Object.freeze({
  achievements: Object.freeze((overtimeAchievementsConfig as AchievementBundle).achievements.map((achievement) => Object.freeze({ ...achievement }))),
});

/** Merge configuration bundles defensively: a duplicate id is a startup/content error, never an override. */
export function mergeUniqueById<T extends { readonly id: string }>(
  base: readonly T[],
  additions: readonly T[],
  kind: string,
): readonly T[] {
  const ids = new Set<string>();
  const result: T[] = [];
  for (const entry of [...base, ...additions]) {
    if (ids.has(entry.id)) throw new Error(`Duplicate ${kind} id: ${entry.id}`);
    ids.add(entry.id);
    result.push(entry);
  }
  return Object.freeze(result);
}
