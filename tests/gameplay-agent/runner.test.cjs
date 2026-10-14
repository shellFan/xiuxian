'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure } = require('../../ai/gameplay-agent/lib/report.cjs');
const { boundsWithinViewport, createVariableScopes, formatHitTarget, readScenarioVariable, storeScenarioVariable, popupDismissalComplete, scrollPositionChanged, intersectVisibleBounds } = require('../../ai/gameplay-agent/lib/scenario-state.cjs');

test('scenario ids cannot escape the reports directory', () => {
  assert.equal(safeRunId('../outside'), null);
  assert.match(safeRunId('20261013-120000'), /^20261013-120000$/);
});

test('scenario validation rejects an unknown action before launching the EXE', () => {
  assert.throws(() => validateScenario({ id: 'bad', steps: [{ action: 'run-shell', command: 'whoami' }] }), /unsupported action/i);
});

test('failed rerun selects only scenarios that actually failed', () => {
  assert.deepEqual(collectFailedScenarioIds({ scenarios: [
    { id: 'home', status: 'passed' },
    { id: 'salary', status: 'failed' },
    { id: 'blocked-after-setup', status: 'blocked' },
    { id: 'save', status: 'failed' },
  ] }), ['salary', 'blocked-after-setup', 'save']);
});

test('a missing GUI is never represented as a passing release gate', () => {
  const summary = summarizeResults([{ id: 'smoke', status: 'not_verified' }]);
  assert.equal(summary.status, 'NOT_VERIFIED');
  assert.equal(summary.passed, 0);
});

test('scenario variables remain readable by the runner after a page restart', () => {
  const variables = createVariableScopes();
  storeScenarioVariable(variables, 'beforeRestart', { salary: 42, tasks: [{ id: 'task-1' }] }, { type: 'object' });
  storeScenarioVariable(variables, 'sharedRunToken', 'run-value', { scope: 'run', type: 'string' });
  assert.equal(readScenarioVariable(variables, '@vars.beforeRestart.salary'), 42);
  assert.equal(readScenarioVariable(variables, '@vars.beforeRestart.tasks[0].id'), 'task-1');
  assert.equal(readScenarioVariable(variables, '@run.sharedRunToken'), 'run-value');
  assert.throws(() => readScenarioVariable(createVariableScopes(), '@vars.beforeRestart.salary'), /missing/);
  assert.throws(() => storeScenarioVariable(variables, 'badType', 3, { type: 'string' }), /expected string, received number/);
  assert.throws(() => storeScenarioVariable(variables, 'badScope', 3, { scope: 'global' }), /unsupported variable scope/);
  const independentScenario = createVariableScopes();
  assert.throws(() => readScenarioVariable(independentScenario, '@vars.beforeRestart.salary'), /missing/);
});

test('hit-test diagnostics identify the overlay that covers a target', () => {
  assert.equal(formatHitTarget({ tag: 'DIV', id: null, className: 'ux-modal-layer' }), 'DIV.ux-modal-layer ({"tag":"DIV","id":null,"className":"ux-modal-layer"})');
});

test('failure reports distinguish automation, setup, game, assertion and verification failures', () => {
  assert.equal(classifyFailure({ error: Object.assign(new Error('AUTOMATION: popup did not close'), { failureClass: 'AUTOMATION_DEFECT' }) }), 'AUTOMATION_DEFECT');
  assert.equal(classifyFailure({ step: {}, error: new Error('missing creation choice'), isSetup: true }), 'SETUP_BLOCKED');
  assert.equal(classifyFailure({ step: {}, error: new Error('salary did not grow') }), 'GAME_DEFECT');
  assert.equal(classifyFailure({ step: {}, error: new Error('character creation flow failed'), isSetup: true, setupFailureClass: 'GAME_DEFECT' }), 'GAME_DEFECT');
  assert.equal(classifyFailure({ step: { failureClass: 'ASSERTION_DEFECT' }, error: new Error('bad expected value') }), 'ASSERTION_DEFECT');
  assert.equal(classifyFailure({ error: new Error('no GUI evidence'), launchFailure: true }), 'NOT_VERIFIED');
});

test('blocked setup dependencies cannot be summarized as a pass', () => {
  const summary = summarizeResults([{ id: 'economy', status: 'blocked' }]);
  assert.equal(summary.status, 'BLOCKED');
  assert.equal(summary.blocked, 1);
});

test('an obscured game choice remains blocked until the event popup is gone and target is uncovered', () => {
  assert.equal(popupDismissalComplete({ closed: false }, { covered: false }), false);
  assert.equal(popupDismissalComplete({ closed: true }, { covered: true }), false);
  assert.equal(popupDismissalComplete({ closed: true }, { covered: false }), true);
});

test('off-window controls are not considered clickable', () => {
  assert.equal(boundsWithinViewport({ x: 10, y: 10, width: 20, height: 20 }, { width: 100, height: 100 }), true);
  assert.equal(boundsWithinViewport({ x: 10, y: 90, width: 20, height: 20 }, { width: 100, height: 100 }), false);
  assert.equal(boundsWithinViewport({ x: -1, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }), false);
});

test('wheel automation waits until the scroll container reports a changed position', () => {
  const before = { scrollTop: 0, scrollLeft: 0 };
  assert.equal(scrollPositionChanged(before, { scrollTop: 0, scrollLeft: 0 }), false);
  assert.equal(scrollPositionChanged(before, { scrollTop: 220, scrollLeft: 0 }), true);
  assert.equal(scrollPositionChanged(before, { scrollTop: 0, scrollLeft: 20 }), true);
});

test('a click point for a clipped control stays inside its visible scroll container region', () => {
  assert.deepEqual(intersectVisibleBounds(
    { x: 100, y: 280, width: 220, height: 240 },
    [{ x: 80, y: 200, width: 600, height: 190 }],
    { width: 800, height: 600 },
  ), { x: 100, y: 280, width: 220, height: 110 });
});

test('a fully clipped control has no valid pointer target', () => {
  assert.equal(intersectVisibleBounds(
    { x: 100, y: 400, width: 220, height: 80 },
    [{ x: 80, y: 200, width: 600, height: 190 }],
    { width: 800, height: 600 },
  ), null);
});
