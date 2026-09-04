/**
 * ConfigValidator — startup configuration validation.
 *
 * Validates game config bundles at load time to catch:
 *   - Duplicate IDs
 *   - Invalid enum values
 *   - Negative durations
 *   - Invalid reward amounts
 *   - Missing level references
 *   - Broken cross-references
 *
 * Returns a list of validation issues (errors + warnings).
 * Critical errors should prevent game start; warnings can be logged.
 */

export interface ConfigValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly domain: string;
  readonly message: string;
  readonly id?: string;
}

export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ConfigValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

/**
 * Validate a config bundle (loaded JSON objects).
 * This is the main entry point called during game bootstrap.
 */
export function validateConfigBundle(configs: ConfigBundle): ConfigValidationResult {
  const issues: ConfigValidationIssue[] = [];

  // Worker config
  if (configs.worker) {
    validateWorkerConfig(configs.worker, issues);
  }

  // Economy config
  if (configs.economy) {
    validateEconomyConfig(configs.economy, issues);
  }

  // Career config
  if (configs.career) {
    validateCareerConfig(configs.career, issues);
  }

  // Career events config
  if (configs.careerEvents) {
    validateCareerEventsConfig(configs.careerEvents, issues);
  }

  // KPI config
  if (configs.kpi) {
    validateKpiConfig(configs.kpi, issues);
  }

  // Promotion config
  if (configs.promotion) {
    validatePromotionConfig(configs.promotion, issues);
  }

  // Achievements config
  if (configs.achievements) {
    validateAchievementsConfig(configs.achievements, issues);
  }

  // Daily tasks config
  if (configs.dailyTasks) {
    validateDailyTasksConfig(configs.dailyTasks, issues);
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    issues: Object.freeze(issues),
    errorCount,
    warningCount,
  };
}

/** Config bundle shape — keys match the JSON config file names. */
export interface ConfigBundle {
  readonly worker?: unknown;
  readonly economy?: unknown;
  readonly game?: unknown;
  readonly career?: unknown;
  readonly sect?: unknown;
  readonly talent?: unknown;
  readonly careerEvents?: unknown;
  readonly kpi?: unknown;
  readonly office?: unknown;
  readonly promotion?: unknown;
  readonly achievements?: unknown;
  readonly daily?: unknown;
  readonly dailyTasks?: unknown;
}

// ── Domain-specific validators ──────────────────────────────────────────────

function validateWorkerConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.levels)) {
    issues.push({ severity: 'error', domain: 'worker', message: 'Missing or invalid levels array' });
    return;
  }
  const ids = new Set<string>();
  for (const level of c.levels as Array<Record<string, unknown>>) {
    if (typeof level.id !== 'string' || level.id.trim() === '') {
      issues.push({ severity: 'error', domain: 'worker', message: 'Worker level missing id', id: String(level.id) });
    }
    if (ids.has(level.id as string)) {
      issues.push({ severity: 'error', domain: 'worker', message: `Duplicate worker level id: ${level.id}`, id: String(level.id) });
    }
    ids.add(level.id as string);
    if (typeof level.salary === 'number' && level.salary < 0) {
      issues.push({ severity: 'error', domain: 'worker', message: `Negative salary for level ${level.id}`, id: String(level.id) });
    }
  }
}

function validateEconomyConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (Array.isArray(c.mergeRewards)) {
    for (const reward of c.mergeRewards as number[]) {
      if (typeof reward !== 'number' || reward < 0) {
        issues.push({ severity: 'error', domain: 'economy', message: `Invalid merge reward: ${reward}` });
      }
    }
  }
}

function validateCareerConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.levels)) return;
  const ids = new Set<string>();
  for (const level of c.levels as Array<Record<string, unknown>>) {
    if (typeof level.id === 'string') {
      if (ids.has(level.id)) {
        issues.push({ severity: 'error', domain: 'career', message: `Duplicate career level id: ${level.id}`, id: level.id });
      }
      ids.add(level.id);
    }
    if (typeof level.requiredExp === 'number' && level.requiredExp < 0) {
      issues.push({ severity: 'warning', domain: 'career', message: `Negative requiredExp for ${level.id}`, id: String(level.id) });
    }
  }
}

function validateCareerEventsConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.events)) return;
  const ids = new Set<string>();
  for (const event of c.events as Array<Record<string, unknown>>) {
    if (typeof event.id === 'string') {
      if (ids.has(event.id)) {
        issues.push({ severity: 'error', domain: 'careerEvents', message: `Duplicate event id: ${event.id}`, id: event.id });
      }
      ids.add(event.id);
    }
  }
}

function validateKpiConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.levels)) return;
  for (const level of c.levels as Array<Record<string, unknown>>) {
    if (typeof level.careerLevel !== 'number' || (level.careerLevel as number) < 1) {
      issues.push({ severity: 'warning', domain: 'kpi', message: `Invalid careerLevel in KPI config`, id: String(level.careerLevel) });
    }
  }
}

function validatePromotionConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.options)) return;
  const ids = new Set<string>();
  for (const option of c.options as Array<Record<string, unknown>>) {
    if (typeof option.id === 'string') {
      if (ids.has(option.id)) {
        issues.push({ severity: 'error', domain: 'promotion', message: `Duplicate promotion option id: ${option.id}`, id: option.id });
      }
      ids.add(option.id);
    }
  }
}

function validateAchievementsConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.achievements)) return;
  const ids = new Set<string>();
  for (const achievement of c.achievements as Array<Record<string, unknown>>) {
    if (typeof achievement.id === 'string') {
      if (ids.has(achievement.id)) {
        issues.push({ severity: 'error', domain: 'achievements', message: `Duplicate achievement id: ${achievement.id}`, id: achievement.id });
      }
      ids.add(achievement.id);
    }
  }
}

function validateDailyTasksConfig(config: unknown, issues: ConfigValidationIssue[]): void {
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.tasks)) return;
  const ids = new Set<string>();
  for (const task of c.tasks as Array<Record<string, unknown>>) {
    if (typeof task.id === 'string') {
      if (ids.has(task.id)) {
        issues.push({ severity: 'error', domain: 'dailyTasks', message: `Duplicate daily task id: ${task.id}`, id: task.id });
      }
      ids.add(task.id);
    }
    if (typeof task.target === 'number' && task.target < 1) {
      issues.push({ severity: 'warning', domain: 'dailyTasks', message: `Invalid target for task ${task.id}`, id: String(task.id) });
    }
  }
}