'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA_DIR = path.join(ROOT, 'docs/schema');
const checker = require(path.join(ROOT, 'docs/validation/phase4-content-check.cjs'));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function loadToolPack() {
  return {
    ...checker.loadPack(),
    audio: readJson('assets/configs/audio-plan.json'),
    theme: readJson('assets/configs/ui-theme.json'),
  };
}

test('publishes five draft-07 schemas with strict stable objects', () => {
  const names = ['office-events', 'achievements', 'daily-tasks', 'audio-plan', 'ui-theme'];
  for (const name of names) {
    const schema = readJson(`docs/schema/${name}.schema.json`);
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.equal(schema.additionalProperties, false);
  }
});

test('validates the complete candidate pack through Ajv', () => {
  const { validateSchemas } = require('./schema-validator.cjs');
  const result = validateSchemas(loadToolPack());
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test('rejects missing fields and unknown effect or reward keys', () => {
  const { validateSchemas } = require('./schema-validator.cjs');

  const missing = loadToolPack();
  delete missing.events.events[0].description;
  assert.equal(validateSchemas(missing).valid, false);

  const unknownEffect = loadToolPack();
  unknownEffect.events.events[30].effects.energy = 1;
  const effectResult = validateSchemas(unknownEffect);
  assert.equal(effectResult.valid, false);
  assert.match(JSON.stringify(effectResult.errors), /additionalProperties/);

  const unknownReward = loadToolPack();
  unknownReward.achievements.achievements[0].reward.reputation = 1;
  const rewardResult = validateSchemas(unknownReward);
  assert.equal(rewardResult.valid, false);
  assert.match(JSON.stringify(rewardResult.errors), /additionalProperties/);
});

test('rejects whitespace titles and negative rewards while allowing negative event deltas', () => {
  const { validateSchemas } = require('./schema-validator.cjs');

  const whitespaceTitle = loadToolPack();
  whitespaceTitle.events.events[30].title = '   ';
  assert.equal(validateSchemas(whitespaceTitle).valid, false);

  const negativeReward = loadToolPack();
  negativeReward.achievements.achievements[0].reward.salary = -1;
  assert.equal(validateSchemas(negativeReward).valid, false);

  const negativeEventDelta = loadToolPack();
  negativeEventDelta.events.events[30].effects.mind = -1;
  assert.equal(validateSchemas(negativeEventDelta).valid, true);

  const unknownEnum = loadToolPack();
  unknownEnum.events.events[30].type = 'UNKNOWN';
  assert.equal(validateSchemas(unknownEnum).valid, false);

  const negativeTarget = loadToolPack();
  negativeTarget.daily.tasks[0].target = -1;
  assert.equal(validateSchemas(negativeTarget).valid, false);

  const negativeDuration = loadToolPack();
  negativeDuration.audio.cues[0].suggestedDurationMs = -1;
  assert.equal(validateSchemas(negativeDuration).valid, false);
});

test('semantic validation rejects duplicate ids, source aliases, title collisions, and condition drift', () => {
  const { validateSemantics } = require('./schema-validator.cjs');

  const duplicateId = loadToolPack();
  duplicateId.events.events[31].id = duplicateId.events.events[30].id;
  assert.ok(validateSemantics(duplicateId).some(issue => issue.code === 'DUPLICATE_ID'));

  const sourceAlias = loadToolPack();
  const fishing = sourceAlias.achievements.achievements.find(item => item.id === 'FISH_30M');
  fishing.sourceId = 'FIRST_MERGE';
  assert.ok(validateSemantics(sourceAlias).some(issue => issue.code === 'SOURCE_ID_COLLISION'));

  const titleCollision = loadToolPack();
  titleCollision.events.events[30].title = titleCollision.sourceEvents[0].title;
  assert.ok(validateSemantics(titleCollision).some(issue => issue.code === 'TITLE_COLLISION'));

  const conditionDrift = loadToolPack();
  conditionDrift.achievements.achievements[0].condition.target = 2;
  assert.ok(validateSemantics(conditionDrift).some(issue => issue.code === 'CONDITION_MISMATCH'));
});

test('blocks both entries affected by a duplicate title', () => {
  const { createPreview } = require('./preview.cjs');
  const pack = loadToolPack();
  const first = pack.events.events[30];
  const second = pack.events.events[31];
  first.title = second.title;
  const preview = createPreview(pack);

  assert.ok(preview.events.blocked.some(item => item.id === first.id));
  assert.ok(preview.events.blocked.some(item => item.id === second.id));
  assert.equal(preview.events.accepted.some(item => item.id === first.id), false);
  assert.equal(preview.events.accepted.some(item => item.id === second.id), false);
});

test('fails closed when a source collection is missing, duplicated, or replaced', () => {
  const { createPreview } = require('./preview.cjs');
  const { validateSemantics } = require('./schema-validator.cjs');

  const missingSource = loadToolPack();
  missingSource.sourceEvents = undefined;
  assert.ok(validateSemantics(missingSource).some(issue => issue.code === 'MISSING_FIELD'));
  assert.equal(createPreview(missingSource).events.accepted.length, 0);

  const duplicateSource = loadToolPack();
  duplicateSource.sourceEvents.push(structuredClone(duplicateSource.sourceEvents[0]));
  assert.ok(validateSemantics(duplicateSource).some(issue => issue.code === 'DUPLICATE_ID'));
  assert.equal(createPreview(duplicateSource).events.accepted.length, 0);

  const replacedEvent = loadToolPack();
  replacedEvent.events.events[0] = {
    id: 'EVENT_P4_REPLACEMENT',
    type: 'POSITIVE',
    title: '替代候选事件',
    description: '替代条目不能掩盖源事件被移除。',
    effects: { mind: 1 },
  };
  assert.ok(validateSemantics(replacedEvent).some(issue => issue.code === 'MISSING_FIELD'));
  assert.equal(createPreview(replacedEvent).events.accepted.length, 0);

  const replacedAchievement = loadToolPack();
  replacedAchievement.achievements.achievements[0] = {
    id: 'EXTRA_ACHIEVEMENT',
    sourceId: null,
    name: '额外候选成就',
    description: '额外候选成就等待服务能力。',
    displayCategory: '摸鱼',
    hidden: false,
    condition: { type: 'FISH_SECONDS', target: 1800 },
    reward: { mind: 1 },
    integrationStatus: 'NEEDS_SERVICE_CAPABILITY',
  };
  assert.ok(validateSemantics(replacedAchievement).some(issue => issue.code === 'MISSING_FIELD'));
  assert.equal(createPreview(replacedAchievement).achievements.accepted.length, 0);
});

test('rejects a daily base-task alias and keeps preview semantics aligned with checker caps', () => {
  const { createPreview } = require('./preview.cjs');
  const { validateSemantics } = require('./schema-validator.cjs');

  const dailyAlias = loadToolPack();
  dailyAlias.daily.tasks.find(item => item.id === 'merge-5').sourceId = 'work-10-min';
  assert.ok(validateSemantics(dailyAlias).some(issue => issue.code === 'SOURCE_ID_COLLISION'));

  const inflated = loadToolPack();
  inflated.events.events[30].effects.salary = 1000;
  const inflatedPreview = createPreview(inflated);
  assert.equal(inflatedPreview.events.accepted.some(item => item.id === inflated.events.events[30].id), false);
  assert.ok(inflatedPreview.report.findings.some(issue => /cap/i.test(issue.message)));

  const dominated = loadToolPack();
  const choices = dominated.events.events.find(item => item.id === 'EVENT_P4_032').choices;
  choices[0].effects = { mind: 5 };
  choices[1].effects = { mind: 3 };
  const dominatedPreview = createPreview(dominated);
  assert.equal(dominatedPreview.events.accepted.some(item => item.id === 'EVENT_P4_032'), false);
  assert.ok(dominatedPreview.report.findings.some(issue => /dominated choice/.test(issue.message)));
});

test('createPreview is deterministic, non-mutating, and keeps capability gaps blocked', () => {
  const { createPreview } = require('./preview.cjs');
  const pack = loadToolPack();
  const before = structuredClone(pack);
  const first = createPreview(pack);
  const second = createPreview(pack);

  assert.deepEqual(first, second);
  assert.deepEqual(pack, before);
  assert.equal(first.runtimeEnabled, false);
  assert.ok(first.achievements.blocked.some(item => item.id === 'FISH_30M'));
  assert.ok(first.daily.blocked.length > 0);
  assert.ok(first.events.accepted.some(item => item.id === 'EVENT_BOSS_PROMISE'));
  assert.equal(first.report.runtimeActivationReady, false);
});

test('malformed preview input has structured findings and no accepted entries', () => {
  const { createPreview } = require('./preview.cjs');
  const pack = loadToolPack();
  delete pack.events.events[0].description;
  const preview = createPreview(pack);

  assert.equal(preview.events.accepted.length, 0);
  assert.ok(preview.events.blocked.length > 0);
  assert.ok(preview.report.findings.some(issue => issue.code === 'MISSING_FIELD'));
});

test('malformed null collection elements fail closed across all three domains', () => {
  const { createPreview } = require('./preview.cjs');

  for (const [domain, collection] of [
    ['events', 'events'],
    ['achievements', 'achievements'],
    ['daily', 'tasks'],
  ]) {
    const pack = loadToolPack();
    pack[domain][collection] = [null];

    let preview;
    assert.doesNotThrow(() => {
      preview = createPreview(pack);
    }, `${domain} null element should be reported, not thrown`);

    assert.equal(preview[domain].accepted.length, 0);
    assert.ok(preview[domain].blocked.length > 0);
    assert.ok(preview.report.findings.some(issue => issue.severity === 'ERROR'));
  }
});

test('malformed null source elements produce structured errors without aggregate dereferences', () => {
  const { createPreview } = require('./preview.cjs');
  const pack = loadToolPack();
  pack.sourceDaily = [null];

  let preview;
  assert.doesNotThrow(() => {
    preview = createPreview(pack);
  }, 'null source daily element should be reported, not thrown');

  assert.equal(preview.daily.accepted.length, 0);
  assert.ok(preview.daily.blocked.length > 0);
  assert.ok(preview.report.findings.some(issue => issue.severity === 'ERROR'));
});

test('appended malformed source members fail closed per domain without blocking unaffected domains', () => {
  const { createPreview } = require('./preview.cjs');
  const baseline = createPreview(loadToolPack());
  const cases = [
    ['sourceEvents', 'events', 'event', 'assets/configs/career-events.json'],
    ['sourceAchievements', 'achievements', 'achievement', 'assets/configs/achievements.json'],
    ['sourceDaily', 'daily', 'daily task', 'assets/configs/daily-tasks.json'],
  ];
  const malformedMembers = [null, {}, { id: 42 }, { id: '' }, { id: '   ' }];

  for (const [sourceKey, domain, kind, sourcePath] of cases) {
    for (const malformed of malformedMembers) {
      const pack = loadToolPack();
      pack[sourceKey].push(malformed);
      const preview = createPreview(pack);
      const errors = preview.report.findings.filter((issue) => issue.code === 'MALFORMED_SOURCE_MEMBER');

      assert.equal(preview.report.summary.semanticValid, false, `${sourceKey} should be semantically invalid`);
      assert.equal(errors.length, 1, `${sourceKey} should report one malformed member`);
      assert.deepEqual(errors[0], {
        code: 'MALFORMED_SOURCE_MEMBER',
        severity: 'ERROR',
        id: null,
        source: sourcePath,
        message: `source ${kind} collection member at index ${pack[sourceKey].length - 1} must have a nonblank string id`,
        index: pack[sourceKey].length - 1,
      });
      assert.match(errors[0].message, /nonblank string id/);
      assert.equal(preview[domain].accepted.length, 0, `${domain} should be blocked`);
      for (const unaffected of ['events', 'achievements', 'daily'].filter((name) => name !== domain)) {
        assert.deepEqual(preview[unaffected], baseline[unaffected], `${unaffected} should remain unaffected`);
      }
    }
  }
});

test('preview writer permits only the fixed destination and rejects symlink destinations', () => {
  const { writePreviewFiles } = require('./preview.cjs');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-preview-'));
  const expected = path.join(tempRoot, 'generated/phase4-integration-preview');
  const preview = {
    events: { accepted: [], blocked: [] },
    achievements: { accepted: [], blocked: [] },
    daily: { accepted: [], blocked: [] },
    report: { findings: [] },
  };

  assert.throws(() => writePreviewFiles(preview, path.join(tempRoot, 'elsewhere'), tempRoot), /destination/);
  fs.mkdirSync(path.dirname(expected), { recursive: true });
  fs.symlinkSync(tempRoot, expected, 'junction');
  assert.throws(() => writePreviewFiles(preview, expected, tempRoot), /symlink/i);
});

test('CLI distinguishes generated output from validation failure', () => {
  const { run } = require('./index.cjs');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-cli-'));
  const files = [
    'assets/configs/phase4/achievements.json',
    'assets/configs/phase4/daily-tasks.json',
    'assets/configs/audio-plan.json',
    'assets/configs/ui-theme.json',
    'assets/configs/career-events.json',
    'assets/configs/achievements.json',
    'assets/configs/daily-tasks.json',
  ];
  for (const relative of files) {
    const target = path.join(tempRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), target);
  }
  const brokenEvents = path.join(tempRoot, 'assets/configs/phase4/office-events.json');
  fs.mkdirSync(path.dirname(brokenEvents), { recursive: true });
  fs.writeFileSync(brokenEvents, '{ malformed', 'utf8');

  const output = [];
  const originalLog = console.log;
  console.log = message => output.push(message);
  let exitCode;
  try {
    exitCode = run([], tempRoot);
  } finally {
    console.log = originalLog;
  }
  assert.equal(exitCode, 1);
  const summary = JSON.parse(output.join('\n'));
  assert.equal(summary.previewGenerated, true);
  assert.equal(summary.validation, 'FAIL');
  assert.equal(summary.activationReady, false);
  assert.notEqual(summary.status, 'PASS');
});
