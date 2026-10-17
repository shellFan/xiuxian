'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure, classifyStepFailure } = require('../../ai/gameplay-agent/lib/report.cjs');
const { boundsWithinViewport, createVariableScopes, formatHitTarget, readScenarioVariable, readStatePath, storeScenarioVariable, popupDismissalComplete, popupControlKind, popupChoiceCanBeClicked, canRecoverObstructedClick, shouldWaitForObscuringPopup, shouldContinuePopupRecovery, scrollPositionChanged, intersectVisibleBounds, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldRestoreScrollContextAfterPopup } = require('../../ai/gameplay-agent/lib/scenario-state.cjs');
const { waitForArenaSkillButton } = require('../../ai/gameplay-agent/lib/home-arena-play.cjs');

test('scenario ids cannot escape the reports directory', () => {
  assert.equal(safeRunId('../outside'), null);
  assert.match(safeRunId('20261013-120000'), /^20261013-120000$/);
});

test('home arena scenarios require fixed seed and real paced input; soak cannot claim less than twenty minutes', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'home-five', steps: [{ action: 'homeArenaPlay', seed: 5911, clickIntervalMs: 400 }] }));
  assert.doesNotThrow(() => validateScenario({ id: 'home-soak', steps: [{ action: 'homeArenaSoak', seed: 5911, clickIntervalMs: 400, durationMs: 1200000 }] }));
  assert.throws(() => validateScenario({ id: 'short-soak', steps: [{ action: 'homeArenaSoak', seed: 5911, clickIntervalMs: 400, durationMs: 1000 }] }), /twenty minutes/);
  assert.throws(() => validateScenario({ id: 'fast-input', steps: [{ action: 'homeArenaPlay', seed: 5911, clickIntervalMs: 1 }] }), /clickIntervalMs/);
});

test('special challenge scenario starts and observes an actual V3 battle through visible UI', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '#FateChallengeControls [data-fate-challenge="start"]'));
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryBattle'));
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action=abandonBattle]'));
  const settlementIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryFinishedBattle' && step.as === 'abandonedBattle');
  const resultModalIndex = scenario.steps.findIndex((step) => step.action === 'waitFor' && step.selector.includes('data-battle-fallback-exit'));
  const criticalChoiceIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-critical-conv]');
  const eventChoiceIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-vevent-choice=__auto]');
  const eventResultIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '#V2EventOk');
  assert.ok(settlementIndex >= 0 && settlementIndex < resultModalIndex,
    'the scenario must record authoritative battle settlement before checking its UI result');
  assert.ok(criticalChoiceIndex >= 0 && !scenario.steps.slice(criticalChoiceIndex + 1, resultModalIndex)
    .some((step) => step.action === 'click' && step.selector === '.ux-nav-item[data-nav=PROJECT]'),
  'the result popup may appear over the messenger page, so the scenario must acknowledge it before navigating');
  assert.ok(criticalChoiceIndex < eventChoiceIndex && eventChoiceIndex < eventResultIndex && eventResultIndex < resultModalIndex,
    'the scenario must resolve the surfaced V2 story event before asserting the battle-result popup');
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor' && step.selector.includes('data-battle-fallback-exit')));
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryFateRun'));
  assert.ok(scenario.steps.filter((step) => step.action === 'call').every((step) => step.method.startsWith('query')),
    'challenge state must come from the existing authoritative battle and fate query APIs');
});

test('J fate recovery scenarios exercise choices, death, settlement, rebirth and talent through visible UI controls', () => {
  const scenarioDir = path.join(__dirname, '../../ai/gameplay-agent/scenarios');
  const scenarios = ['fate-chain-death-rebirth', 'fate-choice-negotiation'].map((id) =>
    validateScenario(JSON.parse(fs.readFileSync(path.join(scenarioDir, `${id}.json`), 'utf8'))),
  );
  const chain = scenarios[0];
  const clicks = chain.steps.filter((step) => step.action === 'click').map((step) => step.selector);
  assert.ok(clicks.includes('#FateEventChoices [data-fate-choice="RISK"]'));
  assert.ok(clicks.includes('#FateChallengeControls [data-fate-settle]'));
  assert.ok(clicks.includes('#FateTalentList [data-fate-talent="born_cow"]'));
  assert.ok(clicks.includes('#FateChallengeControls [data-fate-rebirth]'));
  assert.ok(chain.steps.some((step) => step.action === 'restartGame'));
  assert.ok(chain.steps.some((step) => step.action === 'waitFor' && step.selector.includes('data-event-id=coffee_event')),
    'the chain replay must resolve the event queued ahead of intern_s4 before asserting the next story card');
  assert.ok(chain.steps.some((step) => step.action === 'click' && step.selector === '#FateEventChoices [data-fate-choice="NEGOTIATE"]'),
    'the queued coffee event must be resolved through its visible choice control');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.health' && step.expected === 0),
    'the fatal risk assertion must verify zero run health without assuming which seeded probability branch won');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.eventHistory[5].choiceId' && step.expected === 'RISK'),
    'the final intern choice follows the separately recorded queued coffee event in the authoritative history');
  assert.ok(!chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.eventHistory[4].choiceId'),
    'the scenario must not index the final intern choice as if no event had been interleaved');
  assert.ok(!chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.terminalOutcomeId' && step.expected === 'intern_s5_LAST_STAND'),
    'the replay must not hard-code the risk success branch when either success or failure ends the run');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterRestart.status'));
  assert.ok(chain.steps.filter((step) => step.action === 'call').every((step) => step.method.startsWith('query')),
    'the scenario must observe state only through facade calls; it cannot manufacture a death or reward');

  const negotiation = scenarios[1];
  assert.ok(negotiation.steps.some((step) => step.action === 'click' && step.selector === '#FateEventChoices [data-fate-choice="NEGOTIATE"]'));
  assert.ok(negotiation.steps.some((step) => step.action === 'assert' && step.path === '@vars.after.work.salaryBalance'));
  assert.ok(negotiation.steps.some((step) => step.action === 'assert' && step.path === '@vars.after.work.salaryBalance' && step.check === 'gt' && step.expected === '@vars.before.work.salaryBalance'));
  assert.ok(negotiation.steps.some((step) => step.action === 'screenshot'));
  assert.ok(negotiation.steps.filter((step) => step.action === 'call').every((step) => step.method.startsWith('query')),
    'the alternate choice must be submitted through the rendered UI');
});

test('arena skill automation waits for the rendered button to catch up with authoritative cooldown state', async () => {
  const ready = { skillUnlocked: true, skillRemainingMs: 0, complete: false };
  let inspections = 0, now = 0;
  const caughtUp = await waitForArenaSkillButton({
    readState: async () => ready,
    inspect: async () => ({ found: true, visible: true, disabled: ++inspections < 3 }),
    delay: async (ms) => { now += ms; },
    now: () => now,
    timeoutMs: 50,
    pollIntervalMs: 1,
  });
  assert.equal(caughtUp.status, 'ready');
  assert.equal(inspections, 3);

  const cooldown = await waitForArenaSkillButton({
    readState: async () => ({ ...ready, skillRemainingMs: 10 }),
    inspect: async () => ({ found: true, visible: true, disabled: true }),
    delay: async () => {},
  });
  assert.equal(cooldown.status, 'not-ready');

  const stuck = await waitForArenaSkillButton({
    readState: async () => ready,
    inspect: async () => ({ found: true, visible: true, disabled: true }),
    delay: async (ms) => { now += ms; },
    now: () => now,
    timeoutMs: 5,
    pollIntervalMs: 1,
  });
  assert.equal(stuck.status, 'inconsistent');
  assert.equal(stuck.state.skillRemainingMs, 0);
  assert.equal(stuck.target.disabled, true);
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

test('clickUntilState can wait on an indexed authoritative reward field', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'indexed-state', steps: [{
    action: 'clickUntilState', selector: '[data-action="cardReward"]', method: 'queryCardBattle',
    path: 'rewards[0].chosen', from: false, expected: true, maxAttempts: 3,
  }] }));
  assert.equal(readStatePath({ rewards: [{ chosen: true }] }, 'rewards[0].chosen'), true);
  assert.equal(readStatePath({ data: { byId: { 'reward:one': { chosen: true } } } }, 'data.byId["reward:one"].chosen'), true);
});

test('scenario popup recovery choices are constrained to real controls under the visible modal layer', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'popup-choice', steps: [{
    action: 'clickUntilState', selector: '#attack', method: 'queryCardBattle', path: 'turn', from: 1, expected: 2, maxAttempts: 1,
    popupChoiceSelector: '.ux-modal-layer .ux-event-option[data-weekend=\'SECLUDED_CULTIVATE\']',
  }] }));
  assert.throws(() => validateScenario({ id: 'popup-choice-outside-layer', steps: [{
    action: 'clickUntilState', selector: '#attack', method: 'queryCardBattle', path: 'turn', from: 1, expected: 2, maxAttempts: 1,
    popupChoiceSelector: '#unrelated-button',
  }] }), /inside .ux-modal-layer/);
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

test('scenario assertions can safely read namespaced outcome flags that contain colons', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'flag-path', steps: [{ action: 'assert', check: 'equals', path: '@vars.run.flags["challenge:secret_trial:DEFEAT"]', expected: true }] }));
  const variables = createVariableScopes();
  storeScenarioVariable(variables, 'after', { flags: { 'challenge:secret_trial:DEFEAT': true } });
  assert.equal(readScenarioVariable(variables, '@vars.after.flags["challenge:secret_trial:DEFEAT"]'), true);
});

test('environment failures are classified separately from game and runner defects', () => {
  assert.equal(classifyFailure({ error: Object.assign(new Error('desktop session unavailable'), { failureClass: 'ENVIRONMENT_BLOCKED' }) }), 'ENVIRONMENT_BLOCKED');
  assert.equal(classifyFailure({ error: new Error('cannot create a Windows desktop window'), launchFailure: true, environmentBlocked: true }), 'ENVIRONMENT_BLOCKED');
  assert.equal(classifyFailure({ error: new Error('AUTOMATION: screenshot capture failed: connection closed') }), 'AUTOMATION_DEFECT');
  assert.equal(classifyFailure({ error: new Error('NOT_VERIFIED: authoritative state unavailable') }), 'NOT_VERIFIED');
});

test('a process exit does not turn an underlying CDP timeout into a game defect', () => {
  const timeout = new Error('CDP command timed out: Page.captureScreenshot');
  assert.equal(classifyStepFailure({ error: timeout, childExitCode: 0 }), 'AUTOMATION_DEFECT');
  assert.equal(classifyStepFailure({ error: new Error('game closed unexpectedly'), childExitCode: 0 }), 'GAME_DEFECT');
});

test('failed scenario assertions are classified as assertion defects rather than game defects', () => {
  assert.equal(classifyStepFailure({ step: { action: 'assert' }, error: new Error('expected value did not match') }), 'ASSERTION_DEFECT');
  assert.equal(classifyStepFailure({ step: { action: 'assertState' }, error: new Error('authoritative assertion failed') }), 'ASSERTION_DEFECT');
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

test('a scenario popup choice is usable only when the real modal control is visible, enabled and uncovered', () => {
  const popup = { visible: true };
  assert.equal(popupChoiceCanBeClicked?.(popup, { found: true, visible: true, disabled: false, covered: false }) ?? false, true);
  assert.equal(popupChoiceCanBeClicked?.(popup, { found: true, visible: true, disabled: false, covered: true }) ?? false, false);
  assert.equal(popupChoiceCanBeClicked?.(popup, { found: true, visible: true, disabled: true, covered: false }) ?? false, false);
  assert.equal(popupChoiceCanBeClicked?.({ visible: false }, { found: true, visible: true, disabled: false, covered: false }) ?? false, false);
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
