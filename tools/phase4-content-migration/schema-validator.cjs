'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const Ajv = require('ajv');

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA_DIR = path.join(ROOT, 'docs/schema');
const SCHEMAS = [
  { key: 'events', file: 'office-events.schema.json', source: 'assets/configs/phase4/office-events.json' },
  { key: 'achievements', file: 'achievements.schema.json', source: 'assets/configs/phase4/achievements.json' },
  { key: 'daily', file: 'daily-tasks.schema.json', source: 'assets/configs/phase4/daily-tasks.json' },
  { key: 'audio', file: 'audio-plan.schema.json', source: 'assets/configs/audio-plan.json' },
  { key: 'theme', file: 'ui-theme.schema.json', source: 'assets/configs/ui-theme.json' },
];

function makeIssue(code, severity, id, source, message, extra = {}) {
  return { code, severity, id: id ?? null, source: source ?? null, message, ...extra };
}

function walkNumbers(value, location = '$') {
  const issues = [];
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      issues.push({ location, value });
    }
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...walkNumbers(item, `${location}[${index}]`)));
    return issues;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      issues.push(...walkNumbers(item, `${location}.${key}`));
    }
  }
  return issues;
}

function decodePointer(pathValue) {
  if (!pathValue) return [];
  return pathValue.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function idAtPath(document, instancePath) {
  let current = document;
  for (const segment of decodePointer(instancePath)) {
    if (current == null) break;
    current = current[segment];
    if (current && typeof current === 'object' && typeof current.id === 'string') return current.id;
  }
  return null;
}

function formatAjvError(name, error) {
  const at = error.instancePath || '$';
  if (error.keyword === 'const' && at.endsWith('/runtimeEnabled')) {
    return `${name} runtime disabled must remain false at ${at}`;
  }
  if (at.includes('/choices') && (error.keyword === 'minItems' || error.keyword === 'maxItems')) {
    return `${name} choice count must be between 2 and 3 at ${at}`;
  }
  if (error.keyword === 'additionalProperties') {
    const property = error.params.additionalProperty;
    if (at.includes('/effects')) return `${name} effect key ${property} is unsupported at ${at}`;
    if (at.includes('/reward')) return `${name} reward key ${property} is unsupported at ${at}`;
    return `${name} unknown field ${property} at ${at}`;
  }
  if (error.keyword === 'required') {
    return `${name} missing required field ${error.params.missingProperty} at ${at}`;
  }
  if (error.keyword === 'pattern' && error.params.pattern === '\\S') {
    return `${name} nonblank string required at ${at}`;
  }
  return `${name} ${error.message} at ${at}`;
}

function compiledValidators() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  return new Map(SCHEMAS.map((spec) => {
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, spec.file), 'utf8'));
    return [spec.key, { spec, validate: ajv.compile(schema) }];
  }));
}

function validateSchemas(pack) {
  const errors = [];
  let validators;
  try {
    validators = compiledValidators();
  } catch (error) {
    return {
      valid: false,
      errors: [makeIssue('SCHEMA_ERROR', 'ERROR', null, 'docs/schema', error.message)],
    };
  }

  for (const [key, { spec, validate }] of validators) {
    if (!pack || !Object.prototype.hasOwnProperty.call(pack, key)) {
      errors.push(makeIssue('MISSING_FIELD', 'ERROR', null, spec.source, `missing candidate document ${key}`));
      continue;
    }
    const document = pack[key];
    for (const unsafe of walkNumbers(document)) {
      errors.push(makeIssue(
        'UNSAFE_NUMBER',
        'ERROR',
        idAtPath(document, unsafe.location.replace(/^\$/, '').replace(/\.([A-Za-z0-9_]+)/g, '/$1').replace(/\[(\d+)\]/g, '/$1')),
        spec.source,
        `nonfinite or unsafe numeric value at ${unsafe.location}`,
      ));
    }
    if (!validate(document)) {
      for (const error of validate.errors || []) {
        errors.push(makeIssue(
          error.keyword === 'additionalProperties' && (error.instancePath || '').includes('/effects')
            ? 'UNSUPPORTED_EFFECT'
            : error.keyword === 'additionalProperties' && (error.instancePath || '').includes('/reward')
              ? 'UNSUPPORTED_REWARD'
              : error.keyword === 'required' ? 'MISSING_FIELD' : 'SCHEMA_ERROR',
          'ERROR',
          idAtPath(document, error.instancePath),
          spec.source,
          formatAjvError(key, error),
          { instancePath: error.instancePath || '', keyword: error.keyword },
        ));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function assertValidSchemas(pack) {
  const result = validateSchemas(pack);
  if (!result.valid) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result;
}

function addDuplicateIssues(items, key, kind, source, issues, options = {}) {
  if (!Array.isArray(items)) return;
  const seen = new Map();
  items.forEach((item) => {
    const value = item && item[key];
    if (typeof value !== 'string') return;
    if (seen.has(value)) {
      const code = key === 'id' ? 'DUPLICATE_ID' : 'TITLE_COLLISION';
      const affectedIds = [seen.get(value), item]
        .map((affected) => options.affectedId || (affected && typeof affected.id === 'string' ? affected.id : (key === 'id' ? value : null)))
        .filter((affectedId, index, all) => affectedId && all.indexOf(affectedId) === index);
      for (const affectedId of affectedIds) {
        issues.push(makeIssue(code, 'ERROR', affectedId, source, `duplicate ${kind} ${key} ${value}`));
      }
      if (options.failClosed) {
        issues.push(makeIssue(code, 'ERROR', null, source, `source ${kind} collection is malformed because ${key} ${value} is duplicated`));
      }
    } else {
      seen.set(value, item);
    }
  });
}

function mapById(items) {
  return new Map(Array.isArray(items)
    ? items.filter((item) => item && typeof item.id === 'string' && item.id.trim()).map((item) => [item.id, item])
    : []);
}

function sourceTitleCollisions(items, sourceItems, titleKey, source, issues) {
  const sourceTitles = new Map();
  for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
    if (item && typeof item[titleKey] === 'string') sourceTitles.set(item[titleKey], item.id);
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item[titleKey] !== 'string') continue;
    const sourceId = sourceTitles.get(item[titleKey]);
    if (sourceId && sourceId !== item.id) {
      issues.push(makeIssue('TITLE_COLLISION', 'ERROR', item.id, source, `candidate title collides with source ${sourceId}`));
    }
  }
}

function validateSourceCollection(items, sources, kind, sourcePath, issues) {
  if (!Array.isArray(sources)) {
    issues.push(makeIssue('MISSING_FIELD', 'ERROR', null, sourcePath, `missing source ${kind} collection`));
    return new Map();
  }
  sources.forEach((member, index) => {
    if (!member || typeof member !== 'object' || Array.isArray(member)
      || typeof member.id !== 'string' || !member.id.trim()) {
      issues.push(makeIssue(
        'MALFORMED_SOURCE_MEMBER',
        'ERROR',
        null,
        sourcePath,
        `source ${kind} collection member at index ${index} must have a nonblank string id`,
        { index },
      ));
    }
  });
  addDuplicateIssues(sources, 'id', `source ${kind}`, sourcePath, issues, { failClosed: true });
  const sourceById = mapById(sources);
  if (!Array.isArray(items)) {
    issues.push(makeIssue('MISSING_FIELD', 'ERROR', null, sourcePath, `missing candidate ${kind} collection`));
    return sourceById;
  }
  for (const source of sources) {
    if (!source || typeof source.id !== 'string') continue;
    if (!items.some((item) => item && item.id === source.id)) {
      issues.push(makeIssue('MISSING_FIELD', 'ERROR', null, sourcePath, `source ${kind} ${source.id} is missing from the candidate collection`));
    }
  }
  return sourceById;
}

const EFFECT_FIELDS = ['salary', 'performance', 'cultivation', 'mind'];
const EVENT_TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];
const ACHIEVEMENT_CATEGORIES = ['成长', '合成', '职业', '摸鱼', '工作', '财富', '修仙', '事件', '隐藏'];

function validateEffectBudget(effect, id, source, caps, issues, label = 'event') {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return;
  for (const [key, amount] of Object.entries(effect)) {
    if (!EFFECT_FIELDS.includes(key) || typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    if (caps && Math.abs(amount) > caps[key]) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', id, source, `${label} ${id} reward cap exceeded for ${key}`));
    }
  }
}

function validateChoiceTradeoffs(event, source, issues) {
  if (!event || event.type !== 'CHOICE' || !Array.isArray(event.choices)) return;
  addDuplicateIssues(event.choices, 'id', 'choice', source, issues, { affectedId: event.id });
  addDuplicateIssues(event.choices, 'text', 'choice', source, issues, { affectedId: event.id });
  if (!event.id || !event.id.startsWith('EVENT_P4_')) return;
  for (let left = 0; left < event.choices.length; left += 1) {
    for (let right = left + 1; right < event.choices.length; right += 1) {
      const a = event.choices[left] && event.choices[left].effects;
      const b = event.choices[right] && event.choices[right].effects;
      if (!a || !b) continue;
      const dominates = EFFECT_FIELDS.every((field) => (a[field] ?? 0) >= (b[field] ?? 0))
        && EFFECT_FIELDS.some((field) => (a[field] ?? 0) > (b[field] ?? 0));
      const reverseDominates = EFFECT_FIELDS.every((field) => (b[field] ?? 0) >= (a[field] ?? 0))
        && EFFECT_FIELDS.some((field) => (b[field] ?? 0) > (a[field] ?? 0));
      if (dominates || reverseDominates) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', event.id, source, `dominated choice ${event.id}`));
        return;
      }
      if (EFFECT_FIELDS.every((field) => (a[field] ?? 0) === (b[field] ?? 0))) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', event.id, source, `identical choice ${event.id}`));
        return;
      }
    }
  }
}

function validateEventSemantics(pack, issues) {
  const items = pack && pack.events && pack.events.events;
  const sources = pack && pack.sourceEvents;
  const sourceById = validateSourceCollection(items, sources, 'event', 'assets/configs/career-events.json', issues);
  addDuplicateIssues(items, 'id', 'event', 'assets/configs/phase4/office-events.json', issues);
  addDuplicateIssues(items, 'title', 'event', 'assets/configs/phase4/office-events.json', issues);
  sourceTitleCollisions(items, sources, 'title', 'assets/configs/phase4/office-events.json', issues);
  if (!Array.isArray(items) || items.length < 80) {
    issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/office-events.json', 'event count must be at least 80'));
  }
  if (Array.isArray(items) && items.filter((item) => item && item.type === 'EASTER_EGG').length < 10) {
    issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/office-events.json', 'egg count must be at least 10'));
  }
  for (const type of EVENT_TYPES) {
    if (Array.isArray(items) && !items.some((item) => item && item.type === type)) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/office-events.json', `event category ${type} is missing`));
    }
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== 'string') continue;
    const source = sourceById.get(item.id);
    if (source && !isDeepStrictEqual(item, source)) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/career-events.json', `source event ${item.id} must preserve exact content`));
    }
    if (!source && !/^EVENT_P4_[A-Z0-9_]+$/.test(item.id)) {
      issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/office-events.json', `new event ${item.id} must use an EVENT_P4_ id`));
    }
    if (!source && typeof item.title === 'string' && [...item.title].length > 18) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/phase4/office-events.json', `new event ${item.id} title exceeds 18 characters`));
    }
    if (!source && typeof item.description === 'string' && [...item.description].length > 65) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/phase4/office-events.json', `new event ${item.id} description exceeds 65 characters`));
    }
    const caps = source ? null : (['RARE', 'EASTER_EGG'].includes(item.type)
      ? { salary: 80, performance: 8, cultivation: 25, mind: 15 }
      : { salary: 30, performance: 5, cultivation: 15, mind: 10 });
    if (item.type === 'CHOICE') {
      validateChoiceTradeoffs(item, 'assets/configs/phase4/office-events.json', issues);
      for (const choice of Array.isArray(item.choices) ? item.choices : []) {
        validateEffectBudget(choice && choice.effects, item.id, 'assets/configs/phase4/office-events.json', caps, issues, 'choice');
      }
    } else {
      validateEffectBudget(item.effects, item.id, 'assets/configs/phase4/office-events.json', caps, issues);
    }
  }
}

function validateAchievementSemantics(pack, issues) {
  const items = pack && pack.achievements && pack.achievements.achievements;
  const sources = pack && pack.sourceAchievements;
  const sourceById = validateSourceCollection(items, sources, 'achievement', 'assets/configs/achievements.json', issues);
  addDuplicateIssues(items, 'id', 'achievement', 'assets/configs/phase4/achievements.json', issues);
  addDuplicateIssues(items, 'name', 'achievement', 'assets/configs/phase4/achievements.json', issues);
  sourceTitleCollisions(items, sources, 'name', 'assets/configs/phase4/achievements.json', issues);
  if (!Array.isArray(items) || items.length < 30) {
    issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/achievements.json', 'achievement count must be at least 30'));
  }
  if (Array.isArray(items) && items.filter((item) => item && item.hidden === true).length < 5) {
    issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/achievements.json', 'hidden count must be at least 5'));
  }
  for (const category of ACHIEVEMENT_CATEGORIES) {
    if (Array.isArray(items) && !items.some((item) => item && item.displayCategory === category)) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/achievements.json', `achievement category ${category} is missing`));
    }
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== 'string') continue;
    const source = sourceById.get(item.id);
    if (source) {
      if (item.sourceId !== item.id) {
        issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/achievements.json', `source achievement ${item.id} must map to itself`));
      }
      if (!isDeepStrictEqual(item.condition, source.condition)) {
        issues.push(makeIssue('CONDITION_MISMATCH', 'ERROR', item.id, 'assets/configs/achievements.json', `source achievement ${item.id} condition must remain unchanged`));
      }
      if (!isDeepStrictEqual(item.reward, source.reward || {})) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/achievements.json', `source achievement ${item.id} reward must remain unchanged`));
      }
      if (item.integrationStatus !== 'PRESENTATION_ONLY') {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/phase4/achievements.json', `source achievement ${item.id} must be PRESENTATION_ONLY`));
      }
    } else {
      if (item.sourceId !== null) {
        issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/achievements.json', `new achievement ${item.id} cannot alias source achievement ${item.sourceId}`));
      }
      if (item.integrationStatus !== 'NEEDS_SERVICE_CAPABILITY') {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/phase4/achievements.json', `new achievement ${item.id} must remain capability-gated`));
      }
      if (!item.condition || item.condition.type !== 'FISH_SECONDS' || item.condition.target !== 1800) {
        issues.push(makeIssue('CONDITION_MISMATCH', 'ERROR', item.id, 'assets/configs/phase4/achievements.json', `new achievement ${item.id} uses an unsupported condition`));
      }
      validateEffectBudget(item.reward, item.id, 'assets/configs/phase4/achievements.json', { salary: 30, performance: 5, cultivation: 15, mind: 10 }, issues, 'achievement');
    }
  }
}

function validateDailySemantics(pack, issues) {
  const items = pack && pack.daily && pack.daily.tasks;
  const sources = pack && pack.sourceDaily;
  const sourceById = validateSourceCollection(items, sources, 'daily task', 'assets/configs/daily-tasks.json', issues);
  addDuplicateIssues(items, 'id', 'daily task', 'assets/configs/phase4/daily-tasks.json', issues);
  addDuplicateIssues(items, 'name', 'daily task', 'assets/configs/phase4/daily-tasks.json', issues);
  sourceTitleCollisions(items, sources, 'name', 'assets/configs/phase4/daily-tasks.json', issues);
  if (!Array.isArray(items) || items.length !== 12) {
    issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/daily-tasks.json', 'daily count must equal 12'));
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== 'string') continue;
    const directSource = sourceById.get(item.id);
    if (directSource && item.sourceId !== undefined && item.sourceId !== item.id) {
      issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/daily-tasks.json', `source daily task ${item.id} cannot alias ${item.sourceId}`));
    }
    const sourceId = item.sourceId || item.id;
    const source = sourceById.get(sourceId);
    if (!source) {
      issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/daily-tasks.json', `daily task ${item.id} references unknown source ${sourceId}`));
      continue;
    }
    if (item.type !== source.type) {
      issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/daily-tasks.json', `daily task ${item.id} must stay in source family ${source.type}`));
    }
    if (item.id === source.id) {
      if (item.sourceId !== undefined && item.sourceId !== item.id) {
        issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/daily-tasks.json', `source daily task ${item.id} cannot alias ${item.sourceId}`));
      }
      if (item.target !== source.target || !isDeepStrictEqual(item.reward, source.reward)) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/daily-tasks.json', `source daily task ${item.id} target and reward must remain unchanged`));
      }
    } else if (!item.sourceId) {
      issues.push(makeIssue('SOURCE_ID_COLLISION', 'ERROR', item.id, 'assets/configs/phase4/daily-tasks.json', `daily variant ${item.id} must declare sourceId`));
    }
    for (const [key, amount] of Object.entries(item.reward || {})) {
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > (source.reward && source.reward[key] || 0)) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', item.id, 'assets/configs/phase4/daily-tasks.json', `daily reward cap ${item.id} ${key}`));
      }
    }
  }
  if (Array.isArray(items) && Array.isArray(sources)) {
    for (const key of EFFECT_FIELDS) {
      const maxima = new Map();
      for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.type !== 'string') continue;
        const reward = item.reward && typeof item.reward === 'object' && !Array.isArray(item.reward) ? item.reward : {};
        const amount = Number.isFinite(reward[key]) ? reward[key] : 0;
        maxima.set(item.type, Math.max(maxima.get(item.type) || 0, amount));
      }
      const perDay = pack.daily && pack.daily.selection && pack.daily.selection.perDay;
      const worst = [...maxima.values()].sort((a, b) => b - a).slice(0, perDay).reduce((sum, value) => sum + value, 0);
      const sourceTotal = sources.reduce((sum, source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return sum;
        const reward = source.reward && typeof source.reward === 'object' && !Array.isArray(source.reward) ? source.reward : {};
        return sum + (Number.isFinite(reward[key]) ? reward[key] : 0);
      }, 0);
      if (Number.isFinite(perDay) && worst > sourceTotal) {
        issues.push(makeIssue('SEMANTIC_CONFLICT', 'ERROR', null, 'assets/configs/phase4/daily-tasks.json', `daily aggregate ${key} exceeds source total`));
      }
    }
  }
}

function validateAudioSemantics(pack, issues) {
  const items = pack && pack.audio && pack.audio.cues;
  addDuplicateIssues(items, 'id', 'audio cue', 'assets/configs/audio-plan.json', issues);
}

function validateSemantics(pack) {
  const issues = [];
  validateEventSemantics(pack, issues);
  validateAchievementSemantics(pack, issues);
  validateDailySemantics(pack, issues);
  validateAudioSemantics(pack, issues);
  return issues;
}

function validateOptionalProductionMetadata(pack, validator) {
  if (validator == null) return { status: 'SKIPPED' };
  if (typeof validator !== 'function') throw new TypeError('production metadata validator must be a function');
  const result = validator(pack);
  if (result === true || (result && result.valid === true)) return { status: 'PASS' };
  throw new Error('optional production metadata validation failed');
}

module.exports = {
  SCHEMAS,
  assertValidSchemas,
  validateAudioSemantics,
  validateOptionalProductionMetadata,
  validateSchemas,
  validateSemantics,
};
