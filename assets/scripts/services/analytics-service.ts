/**
 * AnalyticsService — privacy-friendly analytics interface.
 *
 * V1 only tracks behavioral events (no PII: no names, phone numbers,
 * WeChat IDs, device unique identifiers, or chat content).
 *
 * All events go through the analyticsConsent gate from SettingsService.
 * If consent is not given, events are silently dropped.
 */

export type AnalyticsEventType =
  | 'game_start'
  | 'game_save'
  | 'session_duration'
  | 'worker_recruit'
  | 'worker_merge'
  | 'career_promote'
  | 'career_event'
  | 'reward_request'
  | 'reward_grant'
  | 'reward_cancel'
  | 'reward_fail'
  | 'offline_claim'
  | 'achievement_unlock'
  | 'achievement_claim'
  | 'daily_sign_in'
  | 'daily_task_complete'
  | 'tutorial_step'
  | 'settings_change'
  | 'error_occurred'
  | 'work_mode_change';

export interface AnalyticsEvent {
  readonly type: AnalyticsEventType;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

export interface AnalyticsTransport {
  event(event: AnalyticsEvent): void;
}

/** No-op transport for headless/test environments. */
export class NullAnalyticsTransport implements AnalyticsTransport {
  public event(_event: AnalyticsEvent): void { /* no-op */ }
}

/** Console transport for development. */
export class ConsoleAnalyticsTransport implements AnalyticsTransport {
  public event(event: AnalyticsEvent): void {
    console.log(`[Analytics] ${event.type}`, event.params ?? '');
  }
}

export interface AnalyticsServiceOptions {
  readonly transport?: AnalyticsTransport;
  readonly consentEnabled?: boolean;
}

export class AnalyticsService {
  private readonly transport: AnalyticsTransport;
  private consentEnabled: boolean;
  private readonly eventBuffer: AnalyticsEvent[] = [];
  private readonly maxBufferSize: number;
  private sessionStartTime: number;

  public constructor(options: AnalyticsServiceOptions = {}) {
    this.transport = options.transport ?? new NullAnalyticsTransport();
    this.consentEnabled = options.consentEnabled ?? false;
    this.maxBufferSize = 100;
    this.sessionStartTime = Date.now();
  }

  /**
   * Track an analytics event.
   * Silently drops if consent is not given.
   */
  public track(type: AnalyticsEventType, params?: Record<string, unknown>): void {
    if (!this.consentEnabled) return;

    const sanitized = params ? sanitizeAnalyticsParams(params) : undefined;
    const event: AnalyticsEvent = {
      type,
      params: sanitized ? Object.freeze(sanitized) : undefined,
      timestamp: Date.now(),
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    try {
      this.transport.event(event);
    } catch {
      // Transport errors must not crash the game
    }
  }

  /** Update consent status. When consent is granted, flush buffered events. */
  public setConsent(enabled: boolean): void {
    const wasEnabled = this.consentEnabled;
    this.consentEnabled = enabled;
    if (!wasEnabled && enabled) {
      // Flush buffered events on consent grant
      for (const event of this.eventBuffer) {
        try { this.transport.event(event); } catch { /* ignore */ }
      }
    }
  }

  /** Whether analytics consent is currently granted. */
  public hasConsent(): boolean { return this.consentEnabled; }

  /** Record session start. */
  public recordSessionStart(): void {
    this.sessionStartTime = Date.now();
    this.track('game_start');
  }

  /** Record session end and track duration. */
  public recordSessionEnd(): void {
    const durationSeconds = Math.floor((Date.now() - this.sessionStartTime) / 1000);
    this.track('session_duration', { duration_seconds: durationSeconds });
  }

  /** Get buffered events (for debugging). */
  public getBufferedEvents(): ReadonlyArray<AnalyticsEvent> {
    return [...this.eventBuffer];
  }

  /** Clear the event buffer. */
  public clearBuffer(): void {
    this.eventBuffer.length = 0;
  }

  /** Dispose the analytics service. */
  public dispose(): void {
    this.recordSessionEnd();
    this.eventBuffer.length = 0;
  }
}

/**
 * Privacy policy: fields that MUST NOT be collected.
 * Any analytics params containing these keys will be stripped.
 */
export const PRIVACY_RESTRICTED_FIELDS: readonly string[] = [
  'name',
  'phone',
  'phoneNumber',
  'mobile',
  'wechatId',
  'openId',
  'unionId',
  'deviceId',
  'imei',
  'idfa',
  'idfv',
  'chatContent',
  'message',
  'address',
  'email',
];

/**
 * Recursively strip privacy-restricted fields from analytics params.
 * Handles nested objects and arrays. Returns a sanitized deep copy.
 */
export function sanitizeAnalyticsParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const restricted = new Set(PRIVACY_RESTRICTED_FIELDS);
  return sanitizeObject(params, restricted) as Record<string, unknown>;
}

function sanitizeObject(value: unknown, restricted: Set<string>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeObject(item, restricted));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (!restricted.has(key)) {
        result[key] = sanitizeObject(val, restricted);
      }
    }
    return result;
  }
  return value;
}