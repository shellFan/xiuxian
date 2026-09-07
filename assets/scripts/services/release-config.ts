/**
 * ReleaseConfig — production configuration for 《牛马修仙传》.
 *
 * Centralizes all environment-specific settings. Build pipeline should
 * inject these values at build time. Never commit secrets or private keys.
 *
 * Version: 1.0.0-rc.1
 */

export interface ReleaseConfig {
  /** Runtime environment: 'production' | 'staging' | 'development'. */
  readonly environment: 'production' | 'staging' | 'development';
  /** Semantic version string. */
  readonly version: string;
  /** Monotonically increasing build number. */
  readonly buildNumber: number;
  /** WeChat Mini Game App ID. */
  readonly wechatAppId: string;
  /** WeChat rewarded video ad unit ID. Empty string disables ads gracefully. */
  readonly rewardedAdUnitId: string;
  /** Whether analytics events are emitted. */
  readonly analyticsEnabled: boolean;
  /** Whether debug tools (console.log, debug panel, cheat) are available. */
  readonly debugEnabled: boolean;
  /** Max offline reward seconds (default: 28800 = 8 hours). */
  readonly maxOfflineSeconds: number;
  /** Auto-save interval in seconds. */
  readonly autoSaveIntervalSeconds: number;
  /** Game loop tick interval in seconds. */
  readonly tickIntervalSeconds: number;
  /** Reward ad policy: max ads per session. */
  readonly maxSessionAds: number;
  /** Reward ad policy: max ads per day. */
  readonly maxDailyAds: number;
  /** Reward ad policy: minimum interval between ads in seconds. */
  readonly minAdIntervalSeconds: number;
  /** Reward ad policy: cancel cooldown in seconds. */
  readonly cancelCooldownSeconds: number;
  /** Reward ad policy: failure cooldown in seconds. */
  readonly failureCooldownSeconds: number;
}

/** Default production configuration. */
export const PRODUCTION_CONFIG: Readonly<ReleaseConfig> = {
  environment: 'production',
  version: '1.0.0-rc.1',
  buildNumber: 1,
  wechatAppId: '',
  rewardedAdUnitId: '',
  analyticsEnabled: true,
  debugEnabled: false,
  maxOfflineSeconds: 28800,
  autoSaveIntervalSeconds: 60,
  tickIntervalSeconds: 1,
  maxSessionAds: 10,
  maxDailyAds: 20,
  minAdIntervalSeconds: 60,
  cancelCooldownSeconds: 30,
  failureCooldownSeconds: 120,
};

/** Development configuration with debug enabled. */
export const DEVELOPMENT_CONFIG: Readonly<ReleaseConfig> = {
  ...PRODUCTION_CONFIG,
  environment: 'development',
  debugEnabled: true,
  analyticsEnabled: false,
};

/** Staging configuration. */
export const STAGING_CONFIG: Readonly<ReleaseConfig> = {
  ...PRODUCTION_CONFIG,
  environment: 'staging',
  debugEnabled: true,
  analyticsEnabled: true,
};

/**
 * Resolve the active release config based on environment.
 * Priority: RELEASE_CONFIG global > environment variable > default.
 */
export function resolveReleaseConfig(): Readonly<ReleaseConfig> {
  // Check for build-time injected config
  const globalRef = globalThis as { RELEASE_CONFIG?: Partial<ReleaseConfig> };
  if (globalRef.RELEASE_CONFIG) {
    return { ...PRODUCTION_CONFIG, ...globalRef.RELEASE_CONFIG };
  }

  // Check environment variable
  const env = typeof process !== 'undefined' && process.env?.NODE_ENV;
  if (env === 'production') return PRODUCTION_CONFIG;
  if (env === 'staging') return STAGING_CONFIG;
  if (env === 'test') return { ...DEVELOPMENT_CONFIG, analyticsEnabled: false };

  return DEVELOPMENT_CONFIG;
}

/** Whether the current config is production. */
export function isProduction(config: Readonly<ReleaseConfig>): boolean {
  return config.environment === 'production';
}

/** Whether rewarded ads are available (requires a valid ad unit ID). */
export function isAdAvailable(config: Readonly<ReleaseConfig>): boolean {
  return config.rewardedAdUnitId.length > 0;
}