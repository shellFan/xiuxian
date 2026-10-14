'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure } = require('../../ai/gameplay-agent/lib/report.cjs');
const { boundsWithinViewport, createVariableScopes, formatHitTarget, readScenarioVariable, storeScenarioVariable, popupDismissalComplete, popupControlKind, canRecoverObstructedClick, shouldWaitForObscuringPopup, shouldContinuePopupRecovery, scrollPositionChanged, intersectVisibleBounds, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldRestoreScrollContextAfterPopup } = require('../../ai/gameplay-agent/lib/scenario-state.cjs');

test('scenario ids cannot escape the reports directory', () => {
  assert.equal(safeRunId('../outside'), null);
  assert.match(safeRunId('20261013-120000'), /^20261013-120000$/);
});

test('scenario validation rejects an unknown action before launching the EXE', () => {
  assert.throws(() => validateScenario({ id: 'bad', steps: [{ action: 'run-shell', command: 'whoami' }] }), /unsupported action/i);
});

test('scenario validation accepts the unified interaction and observation actions', () => {
  const scenario = validateScenario({ id: 'unified-actions', steps: [
    { action: 'clickIfPresent', selector: '#SettleOk', timeoutMs: 3000 },
    { action: 'doubleClick', selector: '#play' },
    { action: 'pressKey', key: 'Enter' },
    { action: 'waitFor', selector: '#home', state: 'visible', timeoutMs: 2000 },
    { action: 'getGameState', as: 'game', asType: 'object' },
    { action: 'assertVisible', selector: '#home' },
    { action: 'assertClickable', selector: '#play' },
    { action: 'assertState', path: '@vars.game.clock.dayNumber', check: 'exists' },
    { action: 'restartGame' },
  ] });
  assert.equal(scenario.steps.length, 9);
});

test('scenario validation accepts bounded UI clicks that wait for authoritative state transitions', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'stateful-click', steps: [{
    action: 'clickUntilState', selector: '[data-creation-action="advance"]', method: 'queryCharacterCreation',
    path: 'draft.step', from: 'PROFESSION', expected: 'IDENTITY', as: 'identity', maxAttempts: 3, timeoutMs: 1000,
  }] }));
  assert.throws(() => validateScenario({ id: 'unbounded-stateful-click', steps: [{
    action: 'clickUntilState', selector: '#go', method: 'queryCharacterCreation',
    path: 'draft.step', from: 'PROFESSION', expected: 'IDENTITY', maxAttempts: 4,
  }] }), /maxAttempts/);
});

test('scroll recovery routes are optional but must be valid selectors', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'scroll-route-recovery', steps: [{
    action: 'scroll', selector: '.home-scroll', deltaY: 400, recoverySelector: '[data-nav="HOME"]',
  }] }));
  assert.throws(() => validateScenario({ id: 'invalid-scroll-route-recovery', steps: [{
    action: 'scroll', selector: '.home-scroll', recoverySelector: ' ',
  }] }), /recoverySelector/);
});

test('every maintained scenario validates before the runner can launch a game process', () => {
  const scenariosDir = path.join(__dirname, '..', '..', 'ai', 'gameplay-agent', 'scenarios');
  for (const name of fs.readdirSync(scenariosDir).filter((entry) => entry.endsWith('.json') && !entry.startsWith('_'))) {
    assert.doesNotThrow(() => validateScenario(JSON.parse(fs.readFileSync(path.join(scenariosDir, name), 'utf8'))), name);
  }
});

test('waitFor rejects unbounded timeouts and state assertions reject unsafe paths', () => {
  assert.throws(() => validateScenario({ id: 'bad-timeout', steps: [{ action: 'waitFor', selector: '#home', timeoutMs: 999999 }] }), /timeoutMs/);
  assert.throws(() => validateScenario({ id: 'bad-modal-timeout', steps: [{ action: 'clickIfPresent', selector: '#SettleOk', timeoutMs: 999999 }] }), /timeoutMs/);
  assert.throws(() => validateScenario({ id: 'bad-state', steps: [{ action: 'assertState', path: 'window.process', check: 'exists' }] }), /safe state path/);
});

test('environment failures are classified separately from game and runner defects', () => {
  assert.equal(classifyFailure({ error: Object.assign(new Error('desktop session unavailable'), { failureClass: 'ENVIRONMENT_BLOCKED' }) }), 'ENVIRONMENT_BLOCKED');
  assert.equal(classifyFailure({ error: new Error('cannot create a Windows desktop window'), launchFailure: true, environmentBlocked: true }), 'ENVIRONMENT_BLOCKED');
  assert.equal(classifyFailure({ error: new Error('AUTOMATION: screenshot capture failed: connection closed') }), 'AUTOMATION_DEFECT');
  assert.equal(classifyFailure({ error: new Error('NOT_VERIFIED: authoritative state unavailable') }), 'NOT_VERIFIED');
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
  assert.throws(() => readScenarioVariable(variables, '@vars.beforeRestart.unknownField'), /path is missing/);
  assert.throws(() => readScenarioVariable(variables, '@vars.beforeRestart.__proto__'), /invalid scenario variable/);
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
  assert.equal(classifyFailure({ step: {}, error: Object.assign(new Error('onboarding did not complete'), { failureClass: 'GAME_DEFECT' }), isSetup: true }), 'SETUP_BLOCKED');
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

test('a popup that appears during pointer movement is recoverable only through a visible supported control', () => {
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: { disabled: false } }), true);
  assert.equal(canRecoverObstructedClick({ covered: false }, { visible: true, control: { disabled: false } }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: false, control: { disabled: false } }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: null }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: { disabled: true } }), false);
});

test('an obscuring popup transition is observed until its real control becomes visible', () => {
  assert.equal(shouldWaitForObscuringPopup({ covered: true }, { visible: false }), true);
  assert.equal(shouldWaitForObscuringPopup({ covered: true }, { visible: true }), false);
  assert.equal(shouldWaitForObscuringPopup({ covered: false }, { visible: false }), false);
});

test('popup recovery can handle a result modal while respecting the three-attempt limit', () => {
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: true }, 1), true);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: true }, 3), false);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: false }, 1), false);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: false }, { visible: true }, 1), false);
});

test('critical-message popups require selecting their real conversation option', () => {
  assert.equal(popupControlKind({ presentationKind: 'CRITICAL_MESSAGE', hasCriticalChoice: true, hasClose: false, hasAcknowledge: false }), 'critical-message-choice');
  assert.equal(popupControlKind({ presentationKind: null, hasCriticalChoice: true, hasClose: false, hasAcknowledge: false }), 'critical-message-choice');
  assert.equal(popupControlKind({ presentationKind: 'CRITICAL_MESSAGE', hasCriticalChoice: false, hasClose: false, hasAcknowledge: false }), null);
  assert.equal(popupControlKind({ presentationKind: 'RANDOM_EVENT', hasCriticalChoice: false, hasClose: true, hasAcknowledge: true }), 'close');
  assert.equal(popupControlKind({ presentationKind: 'RANDOM_EVENT', hasCriticalChoice: false, hasClose: false, hasAcknowledge: true }), 'acknowledge');
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

test('a scroll boundary is accepted only when the requested target is visibly reachable', () => {
  assert.equal(scrollBoundaryTargetReady(false, { found: true, visible: true, covered: false }), true);
  assert.equal(scrollBoundaryTargetReady(false, { found: true, visible: false, covered: false }), false);
  assert.equal(scrollBoundaryTargetReady(false, { found: true, visible: true, covered: true }), false);
  assert.equal(scrollBoundaryTargetReady(true, { found: false }), false);
});

test('targeted scrolling does not move a target that is already visible and uncovered', () => {
  assert.equal(scrollTargetAlreadyVisible({ found: true, visible: true, covered: false, bounds: { x: 10, y: 10, width: 20, height: 20 }, viewport: { width: 100, height: 100 } }), true);
  assert.equal(scrollTargetAlreadyVisible({ found: true, visible: true, covered: false, bounds: { x: 10, y: 110, width: 20, height: 20 }, viewport: { width: 100, height: 100 } }), false);
  assert.equal(scrollTargetAlreadyVisible({ found: true, visible: false, covered: false }), false);
  assert.equal(scrollTargetAlreadyVisible({ found: true, visible: true, covered: true }), false);
});

test('a closed popup that navigates away from the scroll target restores the requested route before retrying', () => {
  assert.equal(shouldRestoreScrollContextAfterPopup({ popupClosed: true, scrollContainerFound: false }), true);
  assert.equal(shouldRestoreScrollContextAfterPopup({ popupClosed: true, scrollContainerFound: true }), false);
  assert.equal(shouldRestoreScrollContextAfterPopup({ popupClosed: false, scrollContainerFound: false }), false);
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
