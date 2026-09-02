import type { CareerConfig, CareerEventBundle, ConfigBundle, EconomyConfig, GameConfig, KpiBundle, OfficeBundle, PromotionBundle, SectBundle, TalentBundle, WorkerConfig, AchievementBundle, DailyBundle } from '../model/config-types';

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
  public readonly kpi: KpiBundle;
  public readonly office: OfficeBundle;
  public readonly promotion: PromotionBundle;
  public readonly achievements: AchievementBundle;
  public readonly daily: DailyBundle;

  private constructor(config: ConfigBundle) {
    this.worker = deepFreeze(config.worker);
    this.career = deepFreeze(config.career ?? defaultCareerConfig());
    this.economy = deepFreeze(config.economy);
    this.game = deepFreeze(config.game);
    this.sect = deepFreeze(config.sect ?? defaultSectConfig());
    this.talent = deepFreeze(config.talent ?? defaultTalentConfig());
    this.careerEvents = deepFreeze(config.careerEvents ?? { events: [] });
    this.kpi = deepFreeze(config.kpi ?? { levels: [] });
    this.office = deepFreeze(config.office ?? defaultOfficeConfig());
    this.promotion = deepFreeze(config.promotion ?? { options: [] });
    this.achievements = deepFreeze(config.achievements ?? { achievements: [] });
    this.daily = deepFreeze(config.daily ?? { rewards: [], cycleDays: 7, graceHours: 3 });
    Object.freeze(this);
  }

  public static load(raw: unknown): ConfigService {
    validateBundle(raw);
    return new ConfigService(raw as ConfigBundle);
  }

  public static loadFromJson(worker: unknown, economy: unknown, game: unknown, career?: unknown, sect?: unknown, talent?: unknown, careerEvents?: unknown, kpi?: unknown, office?: unknown, promotion?: unknown, achievements?: unknown, daily?: unknown): ConfigService {
    return ConfigService.load({ worker, economy, game, career: career as CareerConfig | undefined, sect: sect as SectBundle | undefined, talent: talent as TalentBundle | undefined, careerEvents: careerEvents as CareerEventBundle | undefined, kpi: kpi as KpiBundle | undefined, office: office as OfficeBundle | undefined, promotion: promotion as PromotionBundle | undefined, achievements: achievements as AchievementBundle | undefined, daily: daily as DailyBundle | undefined });
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
  if (bundle.kpi !== undefined) validateKpi(bundle.kpi as Record<string, unknown>);
  if (bundle.office !== undefined) validateOffice(bundle.office as Record<string, unknown>);
  if (bundle.promotion !== undefined) validatePromotion(bundle.promotion as Record<string, unknown>);
  if (bundle.achievements !== undefined) validateAchievements(bundle.achievements as Record<string, unknown>);
  if (bundle.daily !== undefined) validateDaily(bundle.daily as Record<string, unknown>);
}

const VALID_CAREER_EVENT_TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];
const VALID_EFFECT_KEYS = ['salary', 'performance', 'cultivation', 'mind'];
const VALID_KPI_TYPES = ['MERGE_COUNT', 'WORK_SECONDS', 'CULTIVATION', 'SALARY_EARNED', 'EVENT_RESOLVED'];

/**
 * Unified validation for a GameEffect config object. Only the four known resource
 * keys are permitted; unknown keys (typos like `gold`) are rejected, and an empty
 * object is rejected so that a silently-passing no-op effect cannot slip through.
 * This is config-layer validation only; the EffectService runtime behavior is unchanged.
 */
function validateGameEffect(effect: unknown, path: string): void {
  if (!isPlainObject(effect)) fail(`${path} must be an object`);
  const record = effect as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) fail(`${path} must not be empty`);
  for (const key of keys) {
    if (!VALID_EFFECT_KEYS.includes(key)) fail(`${path} has unknown key ${key}`);
    if (!Number.isSafeInteger(record[key])) fail(`${path}.${key} must be a safe integer`);
  }
}

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
    const type = event.type as string;
    if (type === 'CHOICE') {
      // CHOICE events are driven by their choices; they must declare at least two
      // branches and may not rely solely on a top-level effects object.
      if (!Array.isArray(event.choices) || event.choices.length < 2) {
        fail(`careerEvents.events[${index}] is CHOICE and must define at least 2 choices`);
      }
      const choices = event.choices as unknown[];
      const choiceIds = new Set<string>();
      choices.forEach((rawChoice, choiceIndex) => {
        requireObject(rawChoice, `careerEvents.events[${index}].choices[${choiceIndex}]`);
        const choice = rawChoice as Record<string, unknown>;
        requireString(choice.id, `careerEvents.events[${index}].choices[${choiceIndex}].id`);
        if (choiceIds.has(choice.id as string)) fail(`careerEvents.events[${index}].choices contains duplicate id ${choice.id}`);
        choiceIds.add(choice.id as string);
        requireString(choice.text, `careerEvents.events[${index}].choices[${choiceIndex}].text`);
        validateGameEffect(choice.effects, `careerEvents.events[${index}].choices[${choiceIndex}].effects`);
      });
    } else {
      // POSITIVE / NEGATIVE / RARE / EASTER_EGG must declare a top-level effects object
      // and must NOT use choices.
      if (Array.isArray(event.choices)) fail(`careerEvents.events[${index}] is ${type} and must not define choices`);
      validateGameEffect(event.effects, `careerEvents.events[${index}].effects`);
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateKpi(kpi: Record<string, unknown>): void {
  if (!Array.isArray(kpi.levels)) fail('kpi.levels must be an array');
  const levels = kpi.levels as unknown[];
  const seenLevels = new Set<number>();
  levels.forEach((raw, index) => {
    requireObject(raw, `kpi.levels[${index}]`);
    const level = raw as Record<string, unknown>;
    requireNumber(level.careerLevel, `kpi.levels[${index}].careerLevel`);
    const careerLevel = level.careerLevel as number;
    if (!Number.isSafeInteger(careerLevel) || careerLevel < 1 || careerLevel > 10) {
      fail(`kpi.levels[${index}].careerLevel must be between 1 and 10`);
    }
    if (seenLevels.has(careerLevel)) fail(`kpi.levels contains duplicate careerLevel ${careerLevel}`);
    seenLevels.add(careerLevel);
    if (!Array.isArray(level.requirements) || level.requirements.length === 0) {
      fail(`kpi.levels[${index}].requirements must be a non-empty array`);
    }
    const reqs = level.requirements as unknown[];
    const seenTypes = new Set<string>();
    reqs.forEach((rawReq, reqIndex) => {
      requireObject(rawReq, `kpi.levels[${index}].requirements[${reqIndex}]`);
      const req = rawReq as Record<string, unknown>;
      requireString(req.type, `kpi.levels[${index}].requirements[${reqIndex}].type`);
      if (!VALID_KPI_TYPES.includes(req.type as string)) {
        fail(`kpi.levels[${index}].requirements[${reqIndex}].type is invalid`);
      }
      if (seenTypes.has(req.type as string)) fail(`kpi.levels[${index}] contains duplicate requirement type ${req.type}`);
      seenTypes.add(req.type as string);
      requireNumber(req.target, `kpi.levels[${index}].requirements[${reqIndex}].target`);
      const target = req.target as number;
      if (!Number.isSafeInteger(target) || target <= 0) fail(`kpi.levels[${index}].requirements[${reqIndex}].target must be a positive safe integer`);
    });
  });
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

function validateOffice(office: Record<string, unknown>): void {
  if (!Array.isArray(office.offices) || office.offices.length !== 5) fail('office.offices must contain exactly 5 offices');
  const levels = new Set<number>();
  const covered = new Set<number>();
  (office.offices as unknown[]).forEach((raw, index) => {
    requireObject(raw, `office.offices[${index}]`);
    const item = raw as Record<string, unknown>;
    requireNumber(item.level, `office.offices[${index}].level`);
    const level = item.level as number;
    if (!Number.isSafeInteger(level) || level < 1 || level > 5) fail(`office.offices[${index}].level must be between 1 and 5`);
    if (levels.has(level)) fail(`office.offices contains duplicate level ${level}`);
    levels.add(level);
    requireString(item.name, `office.offices[${index}].name`);
    requireNumber(item.minCareerLevel, `office.offices[${index}].minCareerLevel`);
    requireNumber(item.maxCareerLevel, `office.offices[${index}].maxCareerLevel`);
    const min = item.minCareerLevel as number;
    const max = item.maxCareerLevel as number;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max > 10 || min > max) fail(`office.offices[${index}] has invalid career level range`);
    for (let career = min; career <= max; career += 1) covered.add(career);
  });
  for (let level = 1; level <= 5; level += 1) if (!levels.has(level)) fail(`office.offices is missing level ${level}`);
  for (let career = 1; career <= 10; career += 1) if (!covered.has(career)) fail(`office.offices does not cover career level ${career}`);
}

function validateDaily(daily: Record<string, unknown>): void {
  requireNumber(daily.cycleDays, 'daily.cycleDays');
  requireNumber(daily.graceHours, 'daily.graceHours');
  if (!Number.isSafeInteger(daily.cycleDays) || daily.cycleDays < 1) fail('daily.cycleDays must be a positive safe integer');
  if (!Number.isSafeInteger(daily.graceHours) || daily.graceHours < 0 || daily.graceHours > 24) fail('daily.graceHours must be a safe integer between 0 and 24');
  if (!Array.isArray(daily.rewards)) fail('daily.rewards must be an array');
  const rewards = daily.rewards as unknown[];
  if (rewards.length === 0) fail('daily.rewards must not be empty');
  const seenDays = new Set<number>();
  rewards.forEach((raw, index) => {
    requireObject(raw, `daily.rewards[${index}]`);
    const item = raw as Record<string, unknown>;
    requireNumber(item.day, `daily.rewards[${index}].day`);
    const day = item.day as number;
    if (!Number.isSafeInteger(day) || day < 1 || day > (daily.cycleDays as number)) fail(`daily.rewards[${index}].day must be between 1 and ${daily.cycleDays}`);
    if (seenDays.has(day)) fail(`daily.rewards contains duplicate day ${day}`);
    seenDays.add(day);
    requireNumber(item.salary, `daily.rewards[${index}].salary`);
    requireNumber(item.cultivationExp, `daily.rewards[${index}].cultivationExp`);
    requireNumber(item.mind, `daily.rewards[${index}].mind`);
    if ((item.salary as number) < 0) fail(`daily.rewards[${index}].salary must be non-negative`);
    if ((item.cultivationExp as number) < 0) fail(`daily.rewards[${index}].cultivationExp must be non-negative`);
    if ((item.mind as number) < 0) fail(`daily.rewards[${index}].mind must be non-negative`);
  });
}

function validatePromotion(promotion: Record<string, unknown>): void {
  if (!Array.isArray(promotion.options) || promotion.options.length < 3) fail('promotion.options must contain at least 3 options');
  const ids = new Set<string>();
  (promotion.options as unknown[]).forEach((raw, index) => {
    requireObject(raw, `promotion.options[${index}]`);
    const item = raw as Record<string, unknown>;
    requireString(item.id, `promotion.options[${index}].id`);
    if (ids.has(item.id as string)) fail(`promotion.options contains duplicate id ${item.id}`);
    ids.add(item.id as string);
    requireString(item.name, `promotion.options[${index}].name`);
    requireString(item.description, `promotion.options[${index}].description`);
  });
}

const VALID_ACHIEVEMENT_CATEGORIES = ['MERGE', 'SALARY', 'CAREER', 'EVENT', 'PROMOTION', 'OFFICE', 'MIND', 'IDLE', 'SECT', 'TALENT', 'WORK'];
const VALID_ACHIEVEMENT_CONDITION_TYPES = ['KPI', 'SALARY', 'CAREER_LEVEL', 'EVENT_TYPE', 'PROMOTION', 'OFFICE_LEVEL', 'MIND_FULL', 'IDLE_CLAIM', 'SECT_JOIN', 'TALENT_PICK', 'WORK_SECONDS'];

function validateAchievements(achievements: Record<string, unknown>): void {
  if (!Array.isArray(achievements.achievements)) fail('achievements.achievements must be an array');
  const ids = new Set<string>();
  (achievements.achievements as unknown[]).forEach((raw, index) => {
    requireObject(raw, `achievements.achievements[${index}]`);
    const item = raw as Record<string, unknown>;
    requireString(item.id, `achievements.achievements[${index}].id`);
    if (ids.has(item.id as string)) fail(`achievements.achievements contains duplicate id ${item.id}`);
    ids.add(item.id as string);
    requireString(item.name, `achievements.achievements[${index}].name`);
    requireString(item.description, `achievements.achievements[${index}].description`);
    if (typeof item.category !== 'string' || !VALID_ACHIEVEMENT_CATEGORIES.includes(item.category)) fail(`achievements.achievements[${index}].category is invalid`);
    requireObject(item.condition, `achievements.achievements[${index}].condition`);
    const condition = item.condition as Record<string, unknown>;
    if (typeof condition.type !== 'string' || !VALID_ACHIEVEMENT_CONDITION_TYPES.includes(condition.type)) fail(`achievements.achievements[${index}].condition.type is invalid`);
    if (condition.type === 'KPI') {
      requireString(condition.kpiKey, `achievements.achievements[${index}].condition.kpiKey`);
    }
    if (condition.type === 'EVENT_TYPE') {
      requireString(condition.eventType, `achievements.achievements[${index}].condition.eventType`);
    }
    if (condition.target !== undefined) {
      requireNumber(condition.target, `achievements.achievements[${index}].condition.target`);
    }
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

function defaultOfficeConfig(): OfficeBundle {
  return { offices: [
    { level: 1, name: '共享工位', minCareerLevel: 1, maxCareerLevel: 2 },
    { level: 2, name: '普通工位', minCareerLevel: 3, maxCareerLevel: 4 },
    { level: 3, name: '隔断工位', minCareerLevel: 5, maxCareerLevel: 6 },
    { level: 4, name: '主管办公室', minCareerLevel: 7, maxCareerLevel: 8 },
    { level: 5, name: '经理办公室', minCareerLevel: 9, maxCareerLevel: 10 },
  ] };
}
