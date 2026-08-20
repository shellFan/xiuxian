import type { ConfigBundle, EconomyConfig, GameConfig, WorkerConfig, WorkerLevelConfig } from '../model/config-types';

export class ConfigValidationError extends Error {
  public constructor(message: string) {
    super(`Invalid game configuration: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

export class ConfigService {
  public readonly worker: WorkerConfig;
  public readonly economy: EconomyConfig;
  public readonly game: GameConfig;

  private constructor(config: ConfigBundle) {
    this.worker = deepFreeze(config.worker);
    this.economy = deepFreeze(config.economy);
    this.game = deepFreeze(config.game);
    Object.freeze(this);
  }

  public static load(raw: unknown): ConfigService {
    validateBundle(raw);
    return new ConfigService(raw as ConfigBundle);
  }

  public static loadFromJson(worker: unknown, economy: unknown, game: unknown): ConfigService {
    return ConfigService.load({ worker, economy, game });
  }
}

function validateBundle(raw: unknown): asserts raw is ConfigBundle {
  requireObject(raw, 'root');
  const bundle = raw as Record<string, unknown>;
  requireObject(bundle.worker, 'worker');
  requireObject(bundle.economy, 'economy');
  requireObject(bundle.game, 'game');
  validateWorkers(bundle.worker as Record<string, unknown>);
  validateEconomy(bundle.economy as Record<string, unknown>);
  validateGame(bundle.game as Record<string, unknown>);
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