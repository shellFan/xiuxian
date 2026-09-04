const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const checkerPath = path.join(__dirname, 'phase4-content-check.cjs');

test('candidate validator exists and accepts reviewed pack', () => {
  assert.ok(fs.existsSync(checkerPath), 'Phase4 validator must exist');
  const { loadPack, validatePack } = require(checkerPath);
  assert.doesNotThrow(() => validatePack(loadPack()));
});

const invalidCases = [
  ['duplicate event id', p => { p.events.events[31].id = p.events.events[30].id; }, /duplicate event id/],
  ['duplicate title', p => { p.events.events[31].title = p.events.events[30].title; }, /duplicate event title/],
  ['invalid effect key', p => { p.events.events[30].effects.energy = 1; }, /effect key/],
  ['nonfinite effect', p => { p.events.events[30].effects.mind = Infinity; }, /finite/],
  ['excessive reward', p => { p.events.events[30].effects.salary = 1000; }, /cap/],
  ['source event drift', p => { p.events.events[0].title += '!'; }, /source event/],
  ['source achievement drift', p => { p.achievements.achievements[0].reward.salary++; }, /source achievement/],
  ['source daily drift', p => { p.daily.tasks[0].target++; }, /source daily/],
  ['insufficient event count', p => { p.events.events.pop(); }, /event count/],
  ['insufficient eggs', p => { p.events.events.find(e => e.id.startsWith('EVENT_P4_') && e.type === 'EASTER_EGG').type = 'RARE'; }, /egg count/],
  ['invalid choices', p => { p.events.events.find(e => e.id.startsWith('EVENT_P4_') && e.type === 'CHOICE').choices.pop(); }, /choice count/],
  ['strictly dominant choice', p => {
    const c = p.events.events.find(e => e.id.startsWith('EVENT_P4_') && e.type === 'CHOICE').choices;
    c[0].effects = { mind: 5 }; c[1].effects = { mind: 3 };
  }, /dominated choice/],
  ['runtime enabled', p => { p.events.runtimeEnabled = true; }, /runtime disabled/],
  ['hidden count', p => { p.achievements.achievements.forEach(a => { a.hidden = false; }); }, /hidden count/],
  ['daily variant over cap', p => { p.daily.tasks[6].reward.salary = 999; }, /daily reward cap/],
  ['daily selection size', p => { p.daily.selection.perDay = 12; }, /perDay/],
];
for (const [name, mutate, expected] of invalidCases) {
  test(`rejects ${name} without writing fixtures`, () => {
    assert.ok(fs.existsSync(checkerPath), 'Phase4 validator must exist');
    const { loadPack, validatePack } = require(checkerPath);
    const pack = loadPack();
    mutate(pack);
    assert.throws(() => validatePack(pack), expected);
  });
}
