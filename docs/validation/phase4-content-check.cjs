// Read-only acceptance checks for the isolated candidate pack, not a game loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const {
  assertValidSchemas,
  validateSemantics,
} = require(path.join(ROOT, 'tools/phase4-content-migration/schema-validator.cjs'));
const BASE = 'b9a1eb77e33424f39545baa1b05e1a4179025fd8';
const DOCS = ['UI-IA', 'UI-DESIGN-SYSTEM', 'CHARACTER-VISUAL-GUIDE',
  'CULTIVATION-VISUAL-GUIDE', 'OFFICE-SCENE-GUIDE', 'COCOS-PREFAB-ARCHITECTURE',
  'UI-BINDING-CONTRACT', 'ANIMATION-GUIDE', 'AUDIO-GUIDE', 'IAA-DESIGN',
  'NUMBER-FORMAT', 'BALANCE-PRESENTATION', 'ASSET-STRUCTURE',
  'ART-GENERATION-PROMPTS', 'CONTENT-INTEGRATION'];

function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')); }
function loadPack() {
  return {
    events: readJson('assets/configs/phase4/office-events.json'),
    achievements: readJson('assets/configs/phase4/achievements.json'),
    daily: readJson('assets/configs/phase4/daily-tasks.json'),
    sourceEvents: readJson('assets/configs/career-events.json').events,
    sourceAchievements: readJson('assets/configs/achievements.json').achievements,
    sourceDaily: readJson('assets/configs/daily-tasks.json').tasks,
    audio: readJson('assets/configs/audio-plan.json'),
    theme: readJson('assets/configs/ui-theme.json'),
  };
}
function text(value, label, max = 200) {
  assert.equal(typeof value, 'string', label);
  assert.ok(value.trim().length > 0 && [...value].length <= max, label);
}
function unique(items, key, label) {
  const values = items.map(item => item[key]);
  values.forEach(value => text(value, label));
  assert.equal(new Set(values).size, values.length, `duplicate ${label}`);
}
function validatePack(pack) {
  assertValidSchemas(pack);
  const semanticIssues = validateSemantics(pack);
  if (semanticIssues.length > 0) throw new Error(semanticIssues[0].message);
  const events = pack.events.events;
  const achievements = pack.achievements.achievements;
  const daily = pack.daily.tasks;
  return { events: events.length, eggs: events.filter(e => e.type === 'EASTER_EGG').length,
    achievements: achievements.length, hidden: achievements.filter(a => a.hidden).length, daily: daily.length };
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
function validateTokenReferences(markdown, theme) {
  const references = [...markdown.matchAll(/token:([A-Za-z0-9_.]+)/g)];
  for (const [, tokenPath] of references) {
    let current = theme;
    for (const segment of tokenPath.split('.')) {
      assert.ok(current && typeof current === 'object'
        && Object.prototype.hasOwnProperty.call(current, segment), `invalid token reference token:${tokenPath}`);
      current = current[segment];
    }
  }
  return references.length;
}
function validateRepository() {
  assertValidSchemas(loadPack());
  const productionResult = require('./phase45-production-check.cjs').validateProduction();
  assert.equal(productionResult.status, 'PASS', 'production candidate validation');
  for (const file of walk(path.join(ROOT, 'assets/configs')).filter(f => f.endsWith('.json'))) JSON.parse(fs.readFileSync(file,'utf8'));
  for (const name of DOCS) assert.ok(fs.statSync(path.join(ROOT, 'docs', `${name}.md`)).size > 200, `doc ${name}`);
  const theme = readJson('assets/configs/ui-theme.json');
  for (const key of ['spacing','radius','fontScale','panelPadding','buttonHeight','iconSize','dialogWidth','safeArea','animationDuration']) {
    assert.ok(theme[key] && Object.values(theme[key]).every(n => Number.isFinite(n) && n > 0), `theme ${key}`);
  }
  assert.equal(theme.runtimeEnabled, false); assert.ok(Math.min(...Object.values(theme.buttonHeight)) >= 88);
  validateTokenReferences(fs.readFileSync(path.join(ROOT, 'docs/UI-DESIGN-SYSTEM.md'), 'utf8'), theme);
  assert.equal(readJson('assets/configs/ui-mock-data.json').status, 'DEV_ONLY');
  assert.equal(readJson('assets/configs/ui-mock-data.json').runtimeEnabled, false);
  const audio = readJson('assets/configs/audio-plan.json');
  assert.equal(audio.runtimeEnabled, false); assert.equal(audio.cues.length, 25);
  unique(audio.cues, 'id', 'audio id');
  for (const cue of audio.cues) {
    assert.match(cue.id, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    assert.equal(cue.assetStatus, 'PLANNED'); assert.equal(typeof cue.loop, 'boolean');
    assert.ok(cue.suggestedDurationMs > 0 && cue.priority >= 0 && cue.priority <= 3);
    text(cue.trigger, 'audio trigger'); text(cue.usage, 'audio usage');
  }
  // Git pin ensures candidate preservation wasn't made vacuous by editing both source and copy.
  for (const file of ['assets/configs/career-events.json','assets/configs/achievements.json','assets/configs/daily-tasks.json','assets/configs/career.json','assets/configs/economy.json','assets/configs/daily.json']) {
    const original = execFileSync('git', ['show', `${BASE}:${file}`], { cwd: ROOT, encoding:'utf8' });
    assert.deepEqual(readJson(file), JSON.parse(original), `baseline changed ${file}`);
  }
  const sourceDiff = execFileSync('git', ['diff', BASE, '--', 'assets/scripts', 'assets/scenes', 'assets/prefabs'], { cwd: ROOT, encoding:'utf8' });
  assert.equal(sourceDiff.trim(), '', 'runtime source must remain unchanged');
  for (const file of walk(path.join(ROOT, 'assets/scripts')).filter(f => f.endsWith('.ts'))) {
    assert.doesNotMatch(fs.readFileSync(file,'utf8'), /configs\/phase4|ui-mock-data|ui-theme\.json|audio-plan\.json/, `candidate loader ${file}`);
  }
  return { json: 'PASS', documents: DOCS.length, audioCues: audio.cues.length, baseline: BASE };
}
module.exports = { loadPack, validatePack, validateRepository, validateTokenReferences };
if (require.main === module) {
  console.log(JSON.stringify({ status:'PASS', ...validatePack(loadPack()), ...validateRepository() }, null, 2));
}
