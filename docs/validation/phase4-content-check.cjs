// Read-only acceptance checks for the isolated candidate pack, not a game loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const BASE = 'b9a1eb77e33424f39545baa1b05e1a4179025fd8';
const FIELDS = ['salary', 'performance', 'cultivation', 'mind'];
const TYPES = ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'];
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
function effect(value, label, caps) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} effect object`);
  for (const [key, amount] of Object.entries(value)) {
    assert.ok(FIELDS.includes(key), `${label} effect key ${key}`);
    assert.ok(Number.isFinite(amount), `${label} finite effect ${key}`);
    if (caps) assert.ok(Math.abs(amount) <= caps[key], `${label} reward cap ${key}`);
  }
}
function validatePack(pack) {
  for (const bundle of [pack.events, pack.achievements, pack.daily]) {
    assert.equal(bundle.schemaVersion, 1);
    assert.equal(bundle.status, 'PHASE4_CANDIDATE');
    assert.equal(bundle.runtimeEnabled, false, 'runtime disabled');
  }
  const events = pack.events.events;
  assert.ok(Array.isArray(events) && events.length >= 80, 'event count');
  unique(events, 'id', 'event id'); unique(events, 'title', 'event title');
  const sourceEvents = new Map(pack.sourceEvents.map(e => [e.id, e]));
  for (const src of sourceEvents.values()) {
    assert.deepEqual(events.find(e => e.id === src.id), src, `source event ${src.id}`);
  }
  assert.ok(events.filter(e => e.type === 'EASTER_EGG').length >= 10, 'egg count');
  for (const type of TYPES) assert.ok(events.some(e => e.type === type), `event category ${type}`);
  for (const e of events) {
    assert.ok(TYPES.includes(e.type), `event type ${e.id}`);
    const isNew = !sourceEvents.has(e.id);
    text(e.description, `description ${e.id}`, isNew ? 65 : 200);
    if (isNew) {
      assert.match(e.id, /^EVENT_P4_[A-Z0-9_]+$/);
      text(e.title, `title ${e.id}`, 18);
    }
    const caps = !isNew ? null : (['RARE', 'EASTER_EGG'].includes(e.type)
      ? { salary: 80, performance: 8, cultivation: 25, mind: 15 }
      : { salary: 30, performance: 5, cultivation: 15, mind: 10 });
    if (e.type === 'CHOICE') {
      assert.ok(Array.isArray(e.choices) && e.choices.length >= 2 && e.choices.length <= 3, `choice count ${e.id}`);
      assert.equal(e.effects, undefined, `choice must not also grant base effects ${e.id}`);
      unique(e.choices, 'id', 'choice id'); unique(e.choices, 'text', 'choice text');
      for (const c of e.choices) { text(c.text, 'choice text', 14); effect(c.effects, e.id, caps); }
      if (isNew) for (let i = 0; i < e.choices.length; i++) for (let j = 0; j < e.choices.length; j++) {
        if (i === j) continue;
        const a = e.choices[i].effects, b = e.choices[j].effects;
        const dominates = FIELDS.every(f => (a[f] ?? 0) >= (b[f] ?? 0)) && FIELDS.some(f => (a[f] ?? 0) > (b[f] ?? 0));
        assert.ok(!dominates, `dominated choice ${e.id}`);
        assert.ok(FIELDS.some(f => (a[f] ?? 0) !== (b[f] ?? 0)), `identical choice ${e.id}`);
      }
    } else {
      assert.equal(e.choices, undefined, `non-choice options ${e.id}`);
      effect(e.effects, e.id, caps);
    }
  }
  const achievements = pack.achievements.achievements;
  assert.ok(Array.isArray(achievements) && achievements.length >= 30, 'achievement count');
  unique(achievements, 'id', 'achievement id'); unique(achievements, 'name', 'achievement name');
  assert.ok(achievements.filter(a => a.hidden).length >= 5, 'hidden count');
  for (const category of ['成长','合成','职业','摸鱼','工作','财富','修仙','事件','隐藏']) {
    assert.ok(achievements.some(a => a.displayCategory === category), `achievement category ${category}`);
  }
  const sourceAchievementIds = new Set(pack.sourceAchievements.map(src => src.id));
  for (const src of pack.sourceAchievements) {
    const item = achievements.find(a => a.id === src.id);
    assert.ok(item, `source achievement missing ${src.id}`);
    assert.equal(item.sourceId, src.id, 'source achievement id');
    assert.deepEqual(item.condition, src.condition, 'source achievement condition');
    assert.deepEqual(item.reward, src.reward ?? {}, 'source achievement reward');
    assert.equal(item.integrationStatus, 'PRESENTATION_ONLY');
  }
  for (const a of achievements) {
    text(a.name, 'achievement name', 18); text(a.description, 'achievement description', 100);
    assert.equal(typeof a.hidden, 'boolean'); effect(a.reward, a.id);
    if (sourceAchievementIds.has(a.id)) {
      const src = pack.sourceAchievements.find(item => item.id === a.id);
      assert.equal(a.sourceId, a.id, 'source achievement id');
      assert.deepEqual(a.condition, src.condition, 'source achievement condition');
      assert.deepEqual(a.reward, src.reward ?? {}, 'source achievement reward');
      assert.equal(a.integrationStatus, 'PRESENTATION_ONLY', 'source achievement status');
    } else {
      assert.equal(a.sourceId, null, 'source achievement id');
      assert.equal(a.integrationStatus, 'NEEDS_SERVICE_CAPABILITY');
      assert.deepEqual(a.condition, { type: 'FISH_SECONDS', target: 1800 });
      effect(a.reward, a.id, { salary: 30, performance: 5, cultivation: 15, mind: 10 });
    }
  }
  const daily = pack.daily.tasks;
  assert.ok(Array.isArray(daily), 'daily count');
  assert.equal(daily.length, 12, 'daily count');
  unique(daily, 'id', 'daily id'); unique(daily, 'name', 'daily name');
  assert.ok([5, 6].includes(pack.daily.selection.perDay), 'perDay');
  assert.equal(pack.daily.selection.status, 'NEEDS_SERVICE_CAPABILITY');
  text(pack.daily.selection.policy, 'daily selection policy');
  for (const src of pack.sourceDaily) {
    const item = daily.find(d => d.id === src.id);
    assert.ok(item, 'source daily missing');
    assert.equal(item.type, src.type, 'source daily type');
    assert.equal(item.target, src.target, 'source daily target');
    assert.deepEqual(item.reward, src.reward, 'source daily reward');
  }
  for (const item of daily) {
    text(item.name, 'daily name', 18); text(item.description, 'daily description', 100);
    assert.ok(Number.isSafeInteger(item.target) && item.target > 0, 'daily target');
    effect(item.reward, item.id);
    const src = pack.sourceDaily.find(s => s.id === item.id || s.id === item.sourceId);
    assert.ok(src, 'daily source'); assert.equal(item.type, src.type, 'daily type');
    for (const [key, amount] of Object.entries(item.reward)) {
      assert.ok(amount >= 0 && amount <= (src.reward[key] ?? 0), 'daily reward cap');
    }
  }
  // Any choice of at most one template per type must stay within the old daily total.
  for (const key of FIELDS) {
    const maxima = new Map();
    for (const item of daily) maxima.set(item.type, Math.max(maxima.get(item.type) ?? 0, item.reward[key] ?? 0));
    const worst = [...maxima.values()].sort((a,b) => b-a).slice(0,pack.daily.selection.perDay).reduce((a,b) => a+b,0);
    const sourceTotal = pack.sourceDaily.reduce((n,s) => n+(s.reward[key] ?? 0),0);
    assert.ok(worst <= sourceTotal, `daily aggregate ${key}`);
  }
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
