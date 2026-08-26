import type { CareerConfig, ConfigBundle, EconomyConfig, GameConfig, SectBundle, WorkerConfig } from '../model/config-types';

export class ConfigValidationError extends Error {
  public constructor(message: string) {
    super(`Invalid game configuration: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

export class ConfigService {
  public readonly worker: WorkerConfig;
  public readonly career: CareerConfig;
  public readonly economy: EconomyConfig;
  public readonly game: GameConfig;
  public readonly sect: SectBundle;

  private constructor(config: ConfigBundle) {
    this.worker = deepFreeze(config.worker);
    this.career = deepFreeze(config.career ?? defaultCareerConfig());
    this.economy = deepFreeze(config.economy);
    this.game = deepFreeze(config.game);
    this.sect = deepFreeze(config.sect ?? defaultSectConfig());
    Object.freeze(this);
  }

  public static load(raw: unknown): ConfigService {
    validateBundle(raw);
    return new ConfigService(raw as ConfigBundle);
  }

  public static loadFromJson(worker: unknown, economy: unknown, game: unknown, career?: unknown, sect?: unknown): ConfigService {
    return ConfigService.load({ worker, economy, game, career: career as CareerConfig | undefined, sect: sect as SectBundle | undefined });
  }
}

function validateBundle(raw: unknown): asserts raw is ConfigBundle {
  requireObject(raw, 'root');
  const bundle = raw as Record<string, unknown>;
  requireObject(bundle.worker, 'worker');
  requireObject(bundle.economy, 'economy');
  requireObject(bundle.game, 'game');
  validateWorkers(bundle.worker as Record<string, unknown>);
  if (bundle.career !== undefined) validateCareer(bundle.career as Record<string, unknown>);
  validateEconomy(bundle.economy as Record<string, unknown>);
  validateGame(bundle.game as Record<string, unknown>);
  if (bundle.sect !== undefined) validateSect(bundle.sect as Record<string, unknown>);
}

function validateSect(sect: Record<string, unknown>): void {
  if (!Array.isArray(sect.sects) || sect.sects.length !== 4) fail('sect.sects must contain exactly 4 sects');
  const ids = new Set<string>();
  (sect.sects as unknown[]).forEach((raw, index) => {
    requireObject(raw, `sect.sects[${index}]`);
    const item = raw as Record<string, unknown>;
    requireString(item.id, `sect.sects[${index}].id`); requireString(item.name, `sect.sects[${index}].name`);
    if (!['PRIVATE', 'FOREIGN', 'STATE', 'BIG_TECH'].includes(item.id as string)) fail(`sect.sects[${index}].id is invalid`);
    if (ids.has(item.id as string)) fail(`sect.sects contains duplicate id ${item.id}`); ids.add(item.id as string);
    requireObject(item.modifiers, `sect.sects[${index}].modifiers`);
    const modifiers = item.modifiers as Record<string, unknown>;
    for (const key of ['salaryMultiplier', 'cultivationMultiplier', 'mindMultiplier', 'performanceMultiplier']) {
      requireNumber(modifiers[key], `sect.sects[${index}].modifiers.${key}`);
      if ((modifiers[key] as number) < 0) fail(`sect.sects[${index}].modifiers.${key} must be non-negative`);
    }
  });
  for (const id of ['PRIVATE', 'FOREIGN', 'STATE', 'BIG_TECH']) if (!ids.has(id)) fail(`sect.sects is missing ${id}`);
}

function validateCareer(career: Record<string, unknown>): void {
  if (!Array.isArray(career.levels)) fail('career.levels must be an array');
  const levels = career.levels as unknown[];
  if (levels.length !== 10) fail('career.levels must contain exactly 10 levels');
  levels.forEach((raw, index) => {
    requireObject(raw, `career.levels[${index}]`);
    const level = raw as Record<string, unknown>;
    requireNumber(level.level, `career.levels[${index}].level`);
    if (level.level !== index + 1) fail(`career.levels[${index}].level must be ${index + 1}`);
    requireString(level.name, `career.levels[${index}].name`);
    requireString(level.realm, `career.levels[${index}].realm`);
    requireNumber(level.requiredExp, `career.levels[${index}].requiredExp`);
    if (!Number.isSafeInteger(level.requiredExp) || (level.requiredExp as number) < 0) fail(`career.levels[${index}].requiredExp must be a non-negative safe integer`);
    const previous = index > 0 ? levels[index - 1] as Record<string, unknown> : undefined;
    if (previous && (level.requiredExp as number) <= (previous.requiredExp as number)) fail(`career.levels[${index}].requiredExp must increase`);
  });
}

function validateWorkers(worker: Record<string, unknown>): void {
  if (!Array.isArray(worker.levels)) fail('worker.levels must be an array');
  const levels = worker.levels as unknown[];
  const seen = new Set<number>();
  levels.forEach((raw, index) => {
    requireObject(raw, `worker.levels[${index}]`);
    const level = raw as Record<string, unknown>;
    requireNumber(level.level, `worker.levels[${index}].level`);
    if (!Number.isInteger(level.level) || level.level < 1 || level.level > 6) fail(`worker.levels[${index}].level must be between 1 and 6`);
    if (seen.has(level.level)) fail(`worker.levels contains duplicate level ${level.level}`);
    seen.add(level.level);
    requireString(level.name, `worker.levels[${index}].name`);
    requireNumber(level.salary, `worker.levels[${index}].salary`);
    if ((level.salary as number) < 0) fail(`worker.levels[${index}].salary must be non-negative`);
  });
  for (let level = 1; level <= 6; level += 1) if (!seen.has(level)) fail(`worker.levels is missing level ${level}`);
}

function validateEconomy(economy: Record<string, unknown>): void {
  if (!Array.isArray(economy.mergeRewards)) fail('economy.mergeRewards must be an array');
  const rewards = economy.mergeRewards as unknown[];
  if (rewards.length !== 5) fail('economy.mergeRewards must contain exactly 5 rewards');
  rewards.forEach((reward, index) => {
    requireNumber(reward, `economy.mergeRewards[${index}]`);
    if ((reward as number) < 0) fail(`economy.mergeRewards[${index}] must be non-negative`);
  });
  if (economy.cultivationRewards !== undefined) {
    if (!Array.isArray(economy.cultivationRewards)) fail('economy.cultivationRewards must be an array');
    const cultivationRewards = economy.cultivationRewards as unknown[];
    if (cultivationRewards.length !== 5) fail('economy.cultivationRewards must contain exactly 5 rewards');
    cultivationRewards.forEach((reward, index) => {
      requireNumber(reward, `economy.cultivationRewards[${index}]`);
      if ((reward as number) < 0) fail(`economy.cultivationRewards[${index}] must be non-negative`);
    });
  }
}

function validateGame(game: Record<string, unknown>): void {
  requireObject(game.board, 'game.board');
  const board = game.board as Record<string, unknown>;
  requireNumber(board.columns, 'game.board.columns');
  requireNumber(board.rows, 'game.board.rows');
  if (board.columns !== 4 || board.rows !== 4) fail('game.board must be 4x4');
}

function requireObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
}
function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${path} must be a non-empty string`);
}
function requireNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number`);
}
function fail(message: string): never { throw new ConfigValidationError(message); }
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function defaultCareerConfig(): CareerConfig {
  return { levels: Array.from({ length: 10 }, (_, index) => ({ level: index + 1, name: `职级${index + 1}`, realm: `境界${index + 1}`, requiredExp: index * 100 })) };
}

function defaultSectConfig(): SectBundle {
  return { sects: [
    { id: 'PRIVATE', name: '私企', modifiers: { salaryMultiplier: 1.2, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1 } },
    { id: 'FOREIGN', name: '外企', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1.2, mindMultiplier: 1, performanceMultiplier: 1 } },
    { id: 'STATE', name: '国企', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1, mindMultiplier: 1.2, performanceMultiplier: 1 } },
    { id: 'BIG_TECH', name: '大厂', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1.2 } },
  ] };
}
