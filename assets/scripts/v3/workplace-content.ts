import workplaceAchievementsConfig from '../../configs/v3/workplace-content.json';
import type { AchievementBundle } from '../services/achievement-service';
import type { EventDefinition } from '../v2/event-engine';

/** Immutable V4 workplace-hell content bundles (blame / evidence / incident / management). */
export const WORKPLACE_EVENTS: readonly EventDefinition[] = Object.freeze(
  (workplaceAchievementsConfig as { events: EventDefinition[] }).events.map((event) => Object.freeze({ ...event })),
);

export const WORKPLACE_ACHIEVEMENTS: AchievementBundle = Object.freeze({
  achievements: Object.freeze(
    ((workplaceAchievementsConfig as unknown as { achievements: AchievementBundle['achievements'] }).achievements ?? []).map((achievement) =>
      Object.freeze({ ...achievement }),
    ),
  ),
});
