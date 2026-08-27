import type { CareerConfig, CareerEventBundle, ConfigBundle, EconomyConfig, GameConfig, SectBundle, TalentBundle, WorkerConfig } from '../model/config-types';

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
  public readonly talent: TalentBundle;
  public readonly careerEvents: CareerEventBundle;

  private constructor(config: ConfigBundle) {
    this.worker = deepFreeze(config.worker);
    this.career = deepFreeze(config.career ?? defaultCareerConfig());
    this.economy = deepFreeze(config.economy);
    this.game = deepFreeze(config.game);
    this.sect = deepFreeze(config.sect ?? defaultSectConfig());
    this.talent = deepFreeze(config.talent ?? defaultTalentConfig());
    this.careerEvents = deepFreeze(config.careerEvents ?? { events: [] });
    Object.freeze(this);
  }

  public static load(raw: unknown): ConfigService {
    validateBundle(raw);
    return new ConfigService(raw as ConfigBundle);
  }

  public static loadFromJson(worker: unknown, economy: unknown, game: unknown, career?: unknown, sect?: unknown, talent?: unknown, careerEvents?: unknown): ConfigService {
    return ConfigService.load({ worker, economy, game, career: career as CareerConfig | undefined, sect: sect as SectBundle | undefined, talent: talent as TalentBundle | undefined, careerEvents: careerEvents as CareerEventBundle | undefined });
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
  if (bundle.talent !== undefined) validateTalent(bundle.talent as Record<string, unknown>);
  if (bundle.careerEvents !== undefined) validateCareerEvents(bundle.careerEvents as Record<string, unknown>);
}

const VALID_CAREER_EVENT_TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];

function validateCareerEvents(bundle: Record<string, unknown>): void {
  if (!Array.isArray(bundle.events)) fail('careerEvents.events must be an array');
  const ids = new Set<string>();
  (bundle.events as unknown[]).forEach((raw, index) => {
    requireObject(raw, `careerEvents.events[${index}]`);
    const event = raw as Record<string, unknown>;
    requireString(event.id, `careerEvents.events[${index}].id`);
    if (ids.has(event.id as string)) fail(`careerEvents.events contains duplicate id ${event.id}`);
    ids.add(event.id as string);
    if (typeof event.type !== 'string' || !VALID_CAREER_EVENT_TYPES.includes(event.type)) fail(`careerEvents.events[${index}].type is invalid`);
    requireString(event.title, `careerEvents.events[${index}].title`);
    requireString(event.description, `careerEvents.events[${index}].description`);
    const hasChoices = Array.isArray(event.choices) && (event.choices as unknown[]).length > 0;
    if (hasChoices) {
      const choices = event.choices as unknown[];
      if (choices.length < 2) fail(`careerEvents.events[${index}].choices must contain at least 2 choices`);
      const choiceIds = new Set<string>();
      choices.forEach((rawChoice, choiceIndex) => {
        requireObject(rawChoice, `careerEvents.events[${index}].choices[${choiceIndex}]`);
        const choice = rawChoice as Record<string, unknown>;
        requireString(choice.id, `careerEvents.events[${index}].choices[${choiceIndex}].id`);
        if (choiceIds.has(choice.id as string)) fail(`careerEvents.events[${index}].choices contains duplicate id ${choice.id}`);
        choiceIds.add(choice.id as string);
        requireString(choice.text, `careerEvents.events[${index}].choices[${choiceIndex}].text`);
        requireObject(choice.effects, `careerEvents.events[${index}].choices[${choiceIndex}].effects`);
        for (const key of ['salary', 'performance', 'cultivation', 'mind']) {
          if (choice.effects[key] !== undefined && !Number.isSafeInteger(choice.effects[key])) fail(`careerEvents.events[${index}].choices[${choiceIndex}].effects.${key} must be a safe integer`);
        }
      });
    } else {
      if (!isPlainObject(event.effects)) fail(`careerEvents.events[${index}] must define either choices (>=2) or a valid effects object`);
      const effects = event.effects as Record<string, unknown>;
      for (const key of ['salary', 'performance', 'cultivation', 'mind']) {
        if (effects[key] !== undefined && !Number.isSafeInteger(effects[key])) fail(`careerEvents.events[${index}].effects.${key} must be a safe integer`);
      }
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateTalent(talent: Record<string, unknown>): void {
  if (!Array.isArray(talent.talents) || talent.talents.length < 6) fail('talent.talents must contain at least 6 talents');
  const ids = new Set<string>();
  (talent.talents as unknown[]).forEach((raw, index) => {
    requireObject(raw, `talent.talents[${index}]`);
    const item = raw as Record<string, unknown>;
    requireString(item.id, `talent.talents[${index}].id`);
    if (ids.has(item.id as string)) fail(`talent.talents contains duplicate id ${item.id}`);
    ids.add(item.id as string);
    requireString(item.name, `talent.talents[${index}].name`);
    requireString(item.description, `talent.talents[${index}].description`);
  });
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

function defaultTalentConfig(): TalentBundle {
  return { talents: [
    { id: 'HARD_WORKER', name: '加班狂魔', description: '勤能补拙，修行与工作皆有收获。' },
    { id: 'SLACKER', name: '摸鱼大师', description: '懂得休息，摸鱼时也能积攒心境。' },
    { id: 'LUCKY_STAR', name: '福星高照', description: '机缘深厚，合成时常有惊喜。' },
    { id: 'WISDOM', name: '悟性超凡', description: '一点就通，修炼效率更高。' },
    { id: 'IRON_WILL', name: '铁骨铮铮', description: '意志坚定，不惧职场磨砺。' },
    { id: 'SOCIAL_BUTTERFLY', name: '人脉通天', description: '广结善缘，处世游刃有余。' },
  ] };
}
