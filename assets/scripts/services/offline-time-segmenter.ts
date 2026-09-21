export type OfflineTimeCategory = 'WORK' | 'LUNCH' | 'AFTER_HOURS' | 'RECOVERY' | 'WEEKEND';

export interface OfflineTimeSegment {
  readonly category: OfflineTimeCategory;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationSeconds: number;
}

export interface OfflineTimeProjection {
  readonly startMs: number;
  readonly effectiveEndMs: number;
  readonly elapsedSeconds: number;
  readonly capped: boolean;
  readonly segments: readonly OfflineTimeSegment[];
  readonly secondsByCategory: Readonly<Record<OfflineTimeCategory, number>>;
}

/** Logical game time zone. Asia/Shanghai is modelled as its current fixed UTC+08:00 offset. */
export const OFFLINE_TIME_ZONE = 'Asia/Shanghai';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SHANGHAI_OFFSET_MS = 8 * HOUR_MS;
const JAVASCRIPT_DATE_LIMIT_MS = 8_640_000_000_000_000;

/**
 * Split a half-open offline interval into logical game-time categories.
 * The maximum duration is applied once to the whole interval before any split.
 */
export function segmentOfflineInterval(startMs: number, endMs: number, maxSeconds: number): OfflineTimeProjection {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Offline interval requires finite Unix epoch milliseconds');
  }
  if (Math.abs(startMs) > JAVASCRIPT_DATE_LIMIT_MS || Math.abs(endMs) > JAVASCRIPT_DATE_LIMIT_MS) {
    throw new Error('Offline interval must be within the valid JavaScript Date range');
  }
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || !Number.isFinite(maxSeconds * 1000)) {
    throw new Error('Offline interval requires a positive finite maximum');
  }

  const maximumEndMs = startMs + maxSeconds * 1000;
  const capped = endMs > maximumEndMs;
  const effectiveEndMs = endMs <= startMs ? startMs : Math.min(endMs, maximumEndMs);
  const segments: OfflineTimeSegment[] = [];
  const secondsByCategory: Record<OfflineTimeCategory, number> = {
    WORK: 0,
    LUNCH: 0,
    AFTER_HOURS: 0,
    RECOVERY: 0,
    WEEKEND: 0,
  };

  let cursorMs = startMs;
  while (cursorMs < effectiveEndMs) {
    const { category, nextBoundaryMs } = categoryAndNextBoundary(cursorMs);
    const segmentEndMs = Math.min(nextBoundaryMs, effectiveEndMs);
    const durationSeconds = (segmentEndMs - cursorMs) / 1000;
    const previous = segments[segments.length - 1];
    if (previous?.category === category && previous.endMs === cursorMs) {
      segments[segments.length - 1] = {
        category,
        startMs: previous.startMs,
        endMs: segmentEndMs,
        durationSeconds: previous.durationSeconds + durationSeconds,
      };
    } else {
      segments.push({ category, startMs: cursorMs, endMs: segmentEndMs, durationSeconds });
    }
    secondsByCategory[category] += durationSeconds;
    cursorMs = segmentEndMs;
  }

  return {
    startMs,
    effectiveEndMs,
    elapsedSeconds: (effectiveEndMs - startMs) / 1000,
    capped,
    segments,
    secondsByCategory,
  };
}

function categoryAndNextBoundary(epochMs: number): { category: OfflineTimeCategory; nextBoundaryMs: number } {
  const localMs = epochMs + SHANGHAI_OFFSET_MS;
  const localDayStartMs = Math.floor(localMs / DAY_MS) * DAY_MS;
  const localDayIndex = Math.floor(localMs / DAY_MS);
  const dayOfWeek = ((localDayIndex + 4) % 7 + 7) % 7;

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { category: 'WEEKEND', nextBoundaryMs: localDayStartMs + DAY_MS - SHANGHAI_OFFSET_MS };
  }

  const localTimeMs = localMs - localDayStartMs;
  if (localTimeMs < 9 * HOUR_MS) return boundary('RECOVERY', 9);
  if (localTimeMs < 12 * HOUR_MS) return boundary('WORK', 12);
  if (localTimeMs < 13 * HOUR_MS) return boundary('LUNCH', 13);
  if (localTimeMs < 18 * HOUR_MS) return boundary('WORK', 18);
  return boundary('AFTER_HOURS', 24);

  function boundary(category: OfflineTimeCategory, hour: number): { category: OfflineTimeCategory; nextBoundaryMs: number } {
    return { category, nextBoundaryMs: localDayStartMs + hour * HOUR_MS - SHANGHAI_OFFSET_MS };
  }
}
