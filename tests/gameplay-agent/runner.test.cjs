'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure, classifyStepFailure } = require('../../ai/gameplay-agent/lib/report.cjs');
const { boundsWithinViewport, createVariableScopes, formatHitTarget, readScenarioVariable, readStatePath, storeScenarioVariable, popupDismissalComplete, canFinishClickAfterFinalPopupDismissal, popupControlKind, popupControlSelector, popupChoiceCanBeClicked, canRecoverObstructedClick, shouldInspectPopupForTarget, shouldWaitForObscuringPopup, shouldContinuePopupRecovery, scrollPositionChanged, intersectVisibleBounds, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldRestoreScrollContextAfterPopup, scenarioStateMatchesFrom, shouldRetryStatefulClick } = require('../../ai/gameplay-agent/lib/scenario-state.cjs');
const { waitForArenaSkillButton, waitForArenaControl } = require('../../ai/gameplay-agent/lib/home-arena-play.cjs');
const { cleanupIsolatedProfile } = require('../../ai/gameplay-agent/lib/profile-cleanup.cjs');
const { chooseCardBattleAction, cardBattleActionAdvanced, cardBattleControlCandidate, dismissPopupAfterStalledCardAction, waitForCardBattleActionTransition, shouldRetryCardBattleAction } = require('../../ai/gameplay-agent/lib/card-battle-play.cjs');
const { tabScrollTargetIntoView } = require('../../ai/gameplay-agent/lib/scroll-recovery.cjs');

test('scenario ids cannot escape the reports directory', () => {
  assert.equal(safeRunId('../outside'), null);
  assert.match(safeRunId('20261013-120000'), /^20261013-120000$/);
});

test('shared new-player setup waits for authoritative character creation completion', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/_new-player.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.ok(scenario.steps.some((step) => step.action === 'clickUntilState'
    && step.selector === '[data-creation-action="finalize"]'
    && step.method === 'queryCharacterCreation'
    && step.path === 'status'
    && step.from === 'CREATION_REQUIRED'
    && step.expected === 'COMPLETE'
    && step.maxAttempts === 3),
  'the setup must wait for durable character creation before dependent UI scenarios continue');
});

test('shared new-player setup confirms industry selection in the authoritative draft before advancing', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/_new-player.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const selection = scenario.steps.find((step) => step.selector === '[data-creation-choice="industry:INTERNET"]');
  assert.equal(selection?.action, 'clickUntilState', 'industry selection must be confirmed through bounded visible UI input');
  assert.equal(selection.method, 'queryCharacterCreation');
  assert.equal(selection.path, 'draft.industry');
  assert.equal(selection.from, null);
  assert.equal(selection.expected, 'INTERNET');
  assert.equal(selection.maxAttempts, 3);
});

test('long character creation scroll steps declare a real UI target for bounded keyboard fallback', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/_new-player.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const scrolls = scenario.steps.filter((step) => step.action === 'scroll' && step.selector === '.v59-step-content');

  assert.ok(scrolls.length >= 3);
  assert.ok(scrolls.every((step) => typeof step.ensureVisibleSelector === 'string' && step.keyboardRecoveryMaxTabSteps === 24),
    'each creation scroll must name the real control to expose and bound Tab focus recovery');
});

test('reemployment scenario confirms a next-day contract after the visible accept-offer click', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/career-layoff-reemployment.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const acceptance = scenario.steps.find((step) => step.action === 'clickUntilState' && step.selector === '[data-action="acceptSectOffer"]');
  assert.equal(acceptance?.action, 'clickUntilState', 'acceptance must retry only while the authoritative pending contract is absent');
  assert.equal(acceptance.method, 'queryPendingSectContract');
  assert.equal(acceptance.path, 'sectId');
  assert.equal(acceptance.from, null);
  assert.equal(acceptance.expected, 'INTERNAL');
  assert.equal(acceptance.maxAttempts, 3);
});

test('shared new-player setup waits for authoritative allocation after clicking the plus-five control', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/_new-player.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.ok(scenario.steps.some((step) => step.action === 'clickUntilState'
    && step.selector === '[data-creation-action="allocate"][data-stat="insight"][data-delta="5"]'
    && step.method === 'queryCharacterCreation'
    && step.path === 'draft.allocation.insight'
    && step.from === 0
    && step.expected === 5
    && step.maxAttempts === 3),
  'the setup must wait for the visible +5 click to reach the persisted creation draft before asserting or continuing');
});

test('new-player sect and background choices retry until their authoritative draft fields are selected', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/_new-player.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  for (const [selector, path, expected] of [
    ['[data-creation-choice="sect:OUTSOURCING"]', 'draft.sectId', 'OUTSOURCING'],
    ['[data-creation-choice="background:ORDINARY_WORKER"]', 'draft.background', 'ORDINARY_WORKER'],
  ]) {
    const selection = scenario.steps.find((step) => step.selector === selector);
    assert.equal(selection?.action, 'clickUntilState', `${selector} must be verified through bounded UI input`);
    assert.equal(selection.method, 'queryCharacterCreation');
    assert.equal(selection.path, path);
    assert.equal(selection.from, null, 'null represents an absent optional field in the authoritative draft');
    assert.equal(selection.expected, expected);
    assert.equal(selection.maxAttempts, 3);
  }
});

test('stateful clicks treat an absent draft field as the explicit null starting state only', () => {
  assert.equal(scenarioStateMatchesFrom(undefined, null), true);
  assert.equal(scenarioStateMatchesFrom(null, null), true);
  assert.equal(scenarioStateMatchesFrom('OUTSOURCING', null), false);
  assert.equal(scenarioStateMatchesFrom(undefined, 'SECT'), false);
});

test('stateful clicks retry when a null starting field is absent from the query object', () => {
  assert.equal(shouldRetryStatefulClick({ current: undefined, from: null, attempt: 1, maxAttempts: 3 }), true);
  assert.equal(shouldRetryStatefulClick({ current: null, from: null, attempt: 1, maxAttempts: 3 }), true);
  assert.equal(shouldRetryStatefulClick({ current: 'OUTSOURCING', from: null, attempt: 1, maxAttempts: 3 }), false);
  assert.equal(shouldRetryStatefulClick({ current: undefined, from: null, attempt: 3, maxAttempts: 3 }), false);
});

test('home arena scenarios require fixed seed and real paced input; soak cannot claim less than twenty minutes', () => {
  assert.doesNotThrow(() => validateScenario({ id: 'home-five', steps: [{ action: 'homeArenaPlay', seed: 5911, clickIntervalMs: 400 }] }));
  assert.doesNotThrow(() => validateScenario({ id: 'home-soak', steps: [{ action: 'homeArenaSoak', seed: 5911, clickIntervalMs: 400, durationMs: 1200000 }] }));
  assert.throws(() => validateScenario({ id: 'short-soak', steps: [{ action: 'homeArenaSoak', seed: 5911, clickIntervalMs: 400, durationMs: 1000 }] }), /twenty minutes/);
  assert.throws(() => validateScenario({ id: 'fast-input', steps: [{ action: 'homeArenaPlay', seed: 5911, clickIntervalMs: 1 }] }), /clickIntervalMs/);
});

test('home arena waits for the replay control to render after authoritative campaign completion', async () => {
  let time = 0;
  let inspections = 0;
  const result = await waitForArenaControl({
    selector: '#ArenaReplay',
    inspect: async () => {
      inspections += 1;
      return inspections < 3
        ? { found: true, visible: false, disabled: false, covered: false }
        : { found: true, visible: true, disabled: false, covered: false };
    },
    delay: async (ms) => { time += ms; },
    now: () => time,
    timeoutMs: 200,
    pollIntervalMs: 50,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.target.visible, true);
  assert.equal(inspections, 3);
});

test('special challenge scenario starts and observes an actual V3 battle through visible UI', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '#FateChallengeControls [data-fate-challenge="start"]'));
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryBattle'));
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action=abandonBattle]'));
  const settlementIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryFinishedBattle' && step.as === 'abandonedBattle');
  const resultModalIndex = scenario.steps.findIndex((step) => step.action === 'clickIfPresent' && step.selector === '[data-battle-fallback-exit]');
  const abandonIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action=abandonBattle]');
  const defeatAssertIndex = scenario.steps.findIndex((step) => step.action === 'assert' && step.path === '@vars.abandonedBattle.status' && step.expected === 'DEFEAT');
  const interruptionWaitIndex = scenario.steps.findIndex((step) => step.action === 'waitFor'
    && step.selector.includes('[data-battle-fallback-exit]') && step.selector.includes('[data-vevent-choice]'));
  assert.ok(interruptionWaitIndex >= 0,
    'the challenge result wait must include the real Fate choice attribute used by the UI');
  const interruptionWait = scenario.steps[interruptionWaitIndex];
  const multiChoiceIndex = scenario.steps.findIndex((step, index) => index > interruptionWaitIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-modal-layer [data-vevent-choice]');
  const multiChoiceResultIndex = scenario.steps.findIndex((step, index) => index > multiChoiceIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-modal-layer #V2EventOk');
  const multiChoiceClosedIndex = scenario.steps.findIndex((step, index) => index > multiChoiceResultIndex
    && step.action === 'waitFor' && step.state === 'hidden'
    && step.selector.includes('.ux-modal-layer [data-vevent-choice]')
    && step.selector.includes('.ux-modal-layer #V2EventOk'));
  const queuedEventChoiceIndex = scenario.steps.findIndex((step) => step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer [data-vevent-choice="__auto"]');
  const queuedEventResultIndex = scenario.steps.findIndex((step, index) => index > queuedEventChoiceIndex && step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer #V2EventOk');
  const resultAckIndex = scenario.steps.findIndex((step) => step.action === 'clickIfPresent' && step.selector === '[data-battle-fallback-exit]');
  const resultClosedIndex = scenario.steps.findIndex((step, index) => index > resultAckIndex
    && step.action === 'waitFor' && step.selector === '[data-battle-fallback-exit]' && step.state === 'hidden');
  assert.ok(settlementIndex >= 0 && settlementIndex < resultModalIndex,
    'the scenario must record authoritative battle settlement before checking its UI result');
  assert.equal(interruptionWait?.failureClass, 'AUTOMATION_DEFECT');
  assert.ok(multiChoiceIndex > interruptionWaitIndex && multiChoiceResultIndex > multiChoiceIndex
    && multiChoiceClosedIndex > multiChoiceResultIndex,
  'resolve the visible multi-choice Fate event and its result using real clicks, then wait until both modal controls are hidden');
  assert.doesNotMatch(interruptionWait.selector, /\.ux-event-option\[data-choice\]/,
    'the Fate interruption wait must use the real data-vevent-choice UI attribute');
  assert.ok(abandonIndex < settlementIndex && settlementIndex < defeatAssertIndex
    && defeatAssertIndex < interruptionWaitIndex && interruptionWaitIndex < queuedEventChoiceIndex
    && queuedEventChoiceIndex < queuedEventResultIndex && queuedEventResultIndex < resultModalIndex
    && resultModalIndex === resultAckIndex && resultClosedIndex > resultAckIndex,
  'the real interruption is acknowledged when present, then the actual visible defeat result control is clicked and confirmed hidden');
  const criticalConversationIndex = scenario.steps.findIndex((step, index) => index > queuedEventResultIndex
    && step.action === 'clickIfPresent' && step.selector === '[data-critical-conv]');
  const criticalReplyIndex = scenario.steps.findIndex((step, index) => index > criticalConversationIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-reply-option');
  const messengerBackIndex = scenario.steps.findIndex((step, index) => index > criticalConversationIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-screen:has(.ux-messenger) .ux-header [data-action="back"]');
  const restoreProjectReadyIndex = scenario.steps.findIndex((step, index) => index > resultClosedIndex
    && step.action === 'assertClickable' && step.selector === '.ux-nav-item[data-nav=PROJECT]');
  const restoreProjectIndex = scenario.steps.findIndex((step, index) => index > restoreProjectReadyIndex
    && step.action === 'click' && step.selector === '.ux-nav-item[data-nav=PROJECT]');
  assert.ok(criticalConversationIndex > queuedEventResultIndex && criticalReplyIndex > criticalConversationIndex
    && messengerBackIndex > criticalReplyIndex && resultModalIndex > messengerBackIndex
    && resultClosedIndex > resultModalIndex && restoreProjectReadyIndex > resultClosedIndex
    && restoreProjectIndex > restoreProjectReadyIndex,
  'resolve the critical conversation, dismiss the visible defeat result, confirm it hidden, then restore project navigation');
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor'
    && step.selector.includes('.ux-modal-layer [data-vevent-choice="__auto"]')
    && step.selector.includes('[data-battle-fallback-exit]')),
  'the scenario must accept either the queued workplace popup or the actual defeat result as the first visible interruption');
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor' && step.selector.includes('data-battle-fallback-exit')));
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryFateRun'));
  assert.ok(scenario.steps.filter((step) => step.action === 'call').every((step) => step.method.startsWith('query')),
    'challenge state must come from the existing authoritative battle and fate query APIs');
  const battleVisibleIndex = scenario.steps.findIndex((step) => step.action === 'waitFor' && step.selector === '.ux-battle2');
  const eventChoiceIndex = scenario.steps.findIndex((step, index) => index > battleVisibleIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-modal-layer .ux-event-option');
  const eventAckIndex = scenario.steps.findIndex((step, index) => index > eventChoiceIndex
    && step.action === 'clickIfPresent' && step.selector === '.ux-modal-layer #V2EventOk');
  const abandonActionIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action=abandonBattle]');
  assert.ok(battleVisibleIndex >= 0 && eventChoiceIndex > battleVisibleIndex && eventAckIndex > eventChoiceIndex
    && abandonActionIndex > eventAckIndex,
  'resolve a currently visible real event first, then use the recovery-aware battle click so a newly appearing event cannot trip an immediate clickability assertion');
});

test('J fate recovery scenarios exercise choices, death, settlement, rebirth and talent through visible UI controls', () => {
  const scenarioDir = path.join(__dirname, '../../ai/gameplay-agent/scenarios');
  const scenarios = ['fate-chain-death-rebirth', 'fate-choice-negotiation'].map((id) =>
    validateScenario(JSON.parse(fs.readFileSync(path.join(scenarioDir, `${id}.json`), 'utf8'))),
  );
  const chain = scenarios[0];
  const clickableSteps = chain.steps.filter((step) => ['click', 'clickUntilState'].includes(step.action));
  const clicks = clickableSteps.map((step) => step.selector);
  assert.ok(clicks.includes('#FateEventChoices [data-fate-choice="RISK"]'));
  assert.ok(clicks.includes('#FateChallengeControls [data-fate-settle]'));
  assert.ok(clicks.includes('#FateTalentList [data-fate-talent="born_cow"]'));
  assert.ok(clicks.includes('#FateChallengeControls [data-fate-rebirth]'));
  assert.ok(chain.steps.some((step) => step.action === 'restartGame'));
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.health' && step.expected === 0),
    'the fatal risk assertion must verify zero run health without assuming which seeded probability branch won');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.eventHistory[3].eventId' && step.expected === 'coffee_event'),
    'the unlocked coffee event is recorded between intern stages three and four');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.eventHistory[3].choiceId' && step.expected === 'NEGOTIATE'),
    'the coffee event is resolved through its free-water branch');
  assert.ok(chain.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterDeath.eventHistory[5].choiceId' && step.expected === 'RISK'),
    'after the coffee event, the terminal risk choice is the sixth history entry');
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

test('Fate stories are progressed through visible card battles instead of legacy enemy-click combat', () => {
  const scenarioDir = path.join(__dirname, '../../ai/gameplay-agent/scenarios');
  const ids = ['fate-first-choice', 'fate-choice-negotiation', 'fate-chain-death-rebirth'];
  const scenarios = ids.map((id) => validateScenario(JSON.parse(fs.readFileSync(path.join(scenarioDir, `${id}.json`), 'utf8'))));
  for (const scenario of scenarios) {
    assert.ok(!scenario.steps.some((step) => step.action === 'clickUntilState' && step.method === 'queryHomeArena'),
      `${scenario.id} must not advance Fate through the retired HomeArena click loop`);
    assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '#ArenaAttack'),
      `${scenario.id} starts the normal card battle from the home combat entrance`);
    assert.ok(scenario.steps.some((step) => step.selector === '.ux-cardbattle-card.ux-cardbattle-attack:not([disabled])'),
      `${scenario.id} must play an actual rendered attack card`);
    assert.ok(scenario.steps.some((step) => step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="VICTORY"]'),
      `${scenario.id} must wait for authoritative card-battle victory UI`);
    const victoryIndex = scenario.steps.findIndex((step) => step.action === 'waitFor'
      && step.selector === '.ux-cardbattle[data-card-phase="VICTORY"]');
    const rewardIndex = scenario.steps.findIndex((step, index) => index > victoryIndex
      && step.action === 'clickUntilState' && step.selector === '[data-action="cardReward"]'
      && step.method === 'queryCardBattle' && step.path === 'rewards[0].chosen' && step.expected === true);
    const claimIndex = scenario.steps.findIndex((step, index) => index > rewardIndex
      && step.action === 'clickUntilState' && step.selector === '[data-action="cardClaim"]'
      && step.method === 'queryCardBattle' && step.path === 'settlement.claimed' && step.expected === true);
    const firstFateEventIndex = scenario.steps.findIndex((step, index) => index > victoryIndex
      && step.action === 'waitFor' && step.selector.includes('#FateEventCard'));
    const queuedEventAssertIndex = scenario.steps.findIndex((step, index) => index > claimIndex
      && step.action === 'assert' && step.path === '@vars.queuedFate.eventQueue[0]' && step.expected === 'intern_s1');
    const returnHomeIndex = scenario.steps.findIndex((step, index) => index > queuedEventAssertIndex
      && step.action === 'click' && step.selector === '[data-nav="HOME"]');
    assert.ok(rewardIndex > victoryIndex && claimIndex > rewardIndex
      && queuedEventAssertIndex > claimIndex && returnHomeIndex > queuedEventAssertIndex
      && firstFateEventIndex > returnHomeIndex,
    `${scenario.id} must claim the reward, verify Fate was queued, then return home before waiting for its HomeArena card`);
  }
});

test('Fate death-rebirth scenario earns the coffee milestone through its second visible card-battle win', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-chain-death-rebirth.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const internS2Choice = scenario.steps.findIndex((step) => step.action === 'clickUntilState'
    && step.selector === '#FateEventChoices [data-fate-choice=HELP]'
    && step.method === 'queryFateRun' && step.path === 'eventQueue[0]'
    && step.from === 'intern_s2' && step.expected === 'intern_s3');
  const secondBattle = scenario.steps.findIndex((step, index) => index > internS2Choice
    && step.action === 'click' && step.selector === '[data-action="startCardBattle"][data-encounter="NORMAL"]');
  const secondVictory = scenario.steps.findIndex((step, index) => index > secondBattle
    && step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="VICTORY"]');
  const secondReward = scenario.steps.findIndex((step, index) => index > secondVictory
    && step.action === 'clickUntilState' && step.selector === '[data-action="cardReward"]'
    && step.method === 'queryCardBattle' && step.path === 'rewards[0].chosen' && step.expected === true);
  const secondClaim = scenario.steps.findIndex((step, index) => index > secondReward
    && step.action === 'clickUntilState' && step.selector === '[data-action="cardClaim"]'
    && step.method === 'queryCardBattle' && step.path === 'settlement.claimed' && step.expected === true);
  const secondClear = scenario.steps.findIndex((step, index) => index > secondClaim
    && step.action === 'click' && step.selector === '[data-action="cardClear"]');
  const secondWinQueue = scenario.steps.findIndex((step, index) => index > secondClear
    && step.action === 'assert' && step.path === '@vars.afterSecondWin.eventQueue[1]'
    && step.expected === 'coffee_event');
  assert.ok(internS2Choice >= 0 && secondBattle > internS2Choice && secondVictory > secondBattle
    && secondReward > secondVictory && secondClaim > secondReward && secondClear > secondClaim && secondWinQueue > secondClear,
  'the scenario must earn card-battle:second-win through visible combat, claim and clear its reward before expecting the hidden coffee event');
});

test('secret coffee trial is unlocked by completed visible card battles rather than HomeArena kills', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.ok(!scenario.steps.some((step) => step.method === 'queryHomeArena'),
    'the retired HomeArena kill counter cannot stand in for card-battle progress');
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '#ArenaAttack'),
    'the first normal battle starts through the existing home combat entry');
  assert.ok(scenario.steps.some((step) => step.action === 'cardBattleAdvance'),
    'the scenario must play actual cards without requiring a particular shuffled hand');
  const battleInteractions = scenario.steps.filter((step) => step.action === 'cardBattleAdvance');
  assert.ok(battleInteractions.length >= 16
    && battleInteractions.every((step) => step.popupChoiceSelector?.includes('[data-vevent-choice="__auto"]')),
  'card actions and turn endings must recover actual workplace-event popups before continuing a battle');
  assert.ok(scenario.steps.filter((step) => step.selector === '[data-action="cardReward"]').length >= 2
    && scenario.steps.filter((step) => step.selector === '[data-action="cardClaim"]').length >= 2,
  'both normal battles must resolve visible card rewards and claims before they count toward Fate milestones');
  const claims = scenario.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.selector === '[data-action="cardClaim"]');
  assert.ok(claims.length >= 2 && claims.every(({ index }) => scenario.steps.slice(index + 1, index + 3).some((step) => step.action === 'click' && step.selector === '[data-action="cardClear"]')),
    'each claimed card-battle result must be dismissed through its visible Return to Project Entry control before the next flow');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterSecondWin.eventQueue[1]' && step.expected === 'coffee_event'),
    'the second battle milestone queues coffee behind the unfinished intern story instead of making it current early');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterInternS3.eventQueue[0]' && step.expected === 'coffee_event'),
    'resolving intern_s3 exposes the second-win coffee event before intern_s4 reaches its ending');
  assert.ok(scenario.steps.some((step) => step.action === 'clickUntilState' && step.selector === '#FateEventChoices [data-fate-choice=HELP]'
    && step.method === 'queryFateRun' && step.path === 'eventQueue[0]' && step.from === 'intern_s3' && step.expected === 'coffee_event'),
  'the scenario must select intern_s3 through its visible UI before asserting the coffee event becomes current');
  const secondWinIndex = scenario.steps.findIndex((step) => step.action === 'assert' && step.path === '@vars.afterSecondWin.eventQueue[1]');
  const returnHomeIndex = scenario.steps.findIndex((step, index) => index > secondWinIndex && step.action === 'click' && step.selector === '[data-nav="HOME"]');
  const internS3WaitIndex = scenario.steps.findIndex((step, index) => index > secondWinIndex && step.action === 'waitFor' && step.selector === '#FateEventCard[data-event-id=intern_s3]:not([hidden])');
  assert.ok(returnHomeIndex > secondWinIndex && internS3WaitIndex > returnHomeIndex,
    'after the second battle the visible home route must be restored before waiting for the queued intern event');
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor'
    && step.selector === '#FateEventCard[data-event-id=coffee_event]:not([hidden])'),
  'the hidden coffee event must be visibly rendered before its choice');
  assert.ok(scenario.steps.some((step) => step.action === 'assert'
    && step.path === '@vars.afterUnlock.activeChallengeId'
    && step.expected === 'secret_trial'),
  'the visible coffee choice must unlock the authoritative secret trial');
});

test('secret-trial normal battles adapt to shuffled hands through visible card play and end-turn controls', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const battleAdvances = scenario.steps.filter((step) => step.action === 'cardBattleAdvance');
  assert.ok(battleAdvances.length >= 16, 'each normal battle must allow enough visible UI actions to handle defense-only hands');
  assert.ok(battleAdvances.every((step) => step.popupChoiceSelector?.includes('[data-vevent-choice="__auto"]')),
    'each card or end-turn interaction must resolve interruptions through their visible choice');
  assert.ok(scenario.steps.filter((step) => step.selector === '.ux-cardbattle-card.ux-cardbattle-attack:not([disabled])').length <= 2,
    'normal-battle progression cannot assume a randomly drawn hand always contains an attack card');
  assert.ok(scenario.steps.filter((step) => step.action === 'assert' && step.path === '@vars.battleAfterAdvance.phase' && step.expected === 'VICTORY').length >= 2,
    'both normal battles must still prove victory through authoritative state after UI actions');
});

test('secret-trial defeat uses a visible event choice before abandoning an obscured challenge battle', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const abandonIndex = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action=abandonBattle]');
  const abandon = scenario.steps[abandonIndex];
  assert.ok(!scenario.steps.slice(0, abandonIndex).some((step) => step.action === 'assertClickable'
    && step.selector === '[data-action=abandonBattle]'),
  'do not make a one-shot clickability assertion before the recovery-aware visible click; a Fate popup can appear between checks');
  assert.ok(abandon, 'the challenge defeat must use the real visible battle exit control');
  assert.ok(abandon.popupChoiceSelector?.includes('.ux-modal-layer .ux-event-option'),
    'the real challenge battle may be interrupted by a workplace event, so the scenario must select a visible event option before retrying abandon');
});

test('secret-trial dismisses the visible defeat result before clicking a navigation button it covers', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-secret-trial.json'), 'utf8'));
  const resultClick = scenario.steps.findIndex((step) => step.action === 'clickIfPresent'
    && step.selector === '[data-battle-fallback-exit]');
  const resultClosed = scenario.steps.findIndex((step, index) => index > resultClick
    && step.action === 'waitFor' && step.selector === '[data-battle-fallback-exit]' && step.state === 'hidden');
  const projectClickable = scenario.steps.findIndex((step, index) => index > resultClosed
    && step.action === 'assertClickable' && step.selector === '.ux-nav-item[data-nav=PROJECT]');
  const projectNavigation = scenario.steps.findIndex((step, index) => index > projectClickable
    && step.action === 'click' && step.selector === '.ux-nav-item[data-nav=PROJECT]');
  assert.ok(resultClick >= 0 && resultClosed > resultClick && projectClickable > resultClosed
    && projectNavigation > projectClickable,
  'click the actual “返回项目” result, confirm it hidden, then validate and click the normal project navigation');
});

test('career Fate chain scenario records its authoritative run around the visible trigger', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/career-life-growth.json'), 'utf8'));
  const trigger = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action="careerSectFateChain"]');
  const runRead = scenario.steps.findIndex((step, index) => index > trigger && step.action === 'call' && step.method === 'queryFateRun');
  const eventRead = scenario.steps.findIndex((step, index) => index > trigger && step.action === 'call' && step.method === 'queryFateEvent');
  assert.ok(trigger >= 0 && runRead > trigger && eventRead > runRead,
    'capture the Fate run and queued chain head after the visible trigger so a missing event is classified from authority');
});

test('layoff reemployment scenario resolves the real boss one-on-one popup before home navigation', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/career-layoff-reemployment.json'), 'utf8'));
  const nextDay = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'tick'
    && /next game day/i.test(step.description || ''));
  const bossChoice = scenario.steps.findIndex((step, index) => index > nextDay && step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer .ux-event-option[data-vevent-choice="PLAN"]');
  const resultAck = scenario.steps.findIndex((step, index) => index > bossChoice && step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer [data-vevent-choice="__auto"]');
  const popupClosed = scenario.steps.findIndex((step, index) => index > resultAck && step.action === 'waitFor'
    && step.selector === '.ux-modal-layer' && step.state === 'hidden');
  const home = scenario.steps.findIndex((step, index) => index > popupClosed && step.action === 'click'
    && step.selector === '[data-nav="HOME"]');
  assert.ok(nextDay >= 0 && bossChoice > nextDay && resultAck > bossChoice && popupClosed > resultAck && home > popupClosed,
    'choose through the visible boss event option, acknowledge its result, and wait for the modal to close before navigating');
});

test('career NPC interaction retries only while authoritative memory-backed trust is unchanged', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/career-life-growth.json'), 'utf8'));
  const support = scenario.steps.find((step) => step.action === 'clickUntilState'
    && step.selector === '[data-action="careerNpcInteract"][data-npc="BOSS"][data-kind="SUPPORT"]');
  assert.equal(support?.action, 'clickUntilState');
  assert.equal(support?.method, 'queryCareerLife');
  assert.equal(support?.path, 'relationships[0].trust');
  assert.equal(support?.from, 50);
  assert.equal(support?.expected, 58);
  assert.equal(support?.maxAttempts, 3);
});

test('card-battle progression chooses only visible real controls based on authoritative phase', () => {
  const playerTurn = { phase: 'PLAYER_ACTION', turn: 2, hitLog: [], actionLog: [] };
  assert.deepEqual(chooseCardBattleAction(playerTurn, { attack: true, otherCard: true, endTurn: true }), { kind: 'attack' });
  assert.deepEqual(chooseCardBattleAction(playerTurn, { attack: false, otherCard: true, endTurn: true }), { kind: 'card' });
  assert.deepEqual(chooseCardBattleAction(playerTurn, { attack: false, otherCard: false, endTurn: true }), { kind: 'endTurn' });
  assert.deepEqual(chooseCardBattleAction({ ...playerTurn, phase: 'ENEMY_ACTION' }, { attack: true, otherCard: true, endTurn: true }), { kind: 'wait' });
  assert.deepEqual(chooseCardBattleAction({ ...playerTurn, phase: 'VICTORY' }, { attack: true, otherCard: true, endTurn: true }), { kind: 'complete' });
  assert.deepEqual(chooseCardBattleAction(playerTurn, { attack: false, otherCard: false, endTurn: false }), { kind: 'unavailable' });
  assert.equal(cardBattleActionAdvanced(playerTurn, { ...playerTurn, hitLog: [{ id: 'hit-1' }] }, 'attack'), true);
  assert.equal(cardBattleActionAdvanced(playerTurn, { ...playerTurn, actionLog: [{ id: 'action-1' }] }, 'card'), true);
  assert.equal(cardBattleActionAdvanced(playerTurn, { ...playerTurn, turn: 3 }, 'endTurn'), true);
  assert.equal(cardBattleActionAdvanced(playerTurn, { ...playerTurn, turn: 2 }, 'endTurn'), false);
  assert.equal(cardBattleControlCandidate({ found: true, visible: true, disabled: false, covered: true }), true,
    'a covered but rendered control must be handed to popup recovery instead of being mistaken for a missing card');
  assert.equal(cardBattleControlCandidate({ found: true, visible: true, disabled: true, covered: false }), false);
});

test('a stalled card action retries only when the same authoritative state and safe control remain', () => {
  const before = {
    battleId: 'battle-1', phase: 'PLAYER_ACTION', turn: 1,
    player: { energy: 3, hp: 100, block: 0 },
    enemies: [{ id: 'bug-1', hp: 32 }],
    piles: { hand: [{ instanceId: 'card-1' }] }, hitLog: [], actionLog: [{ id: 'log-1' }],
  };
  const control = { found: true, visible: true, disabled: false, covered: false };
  assert.equal(shouldRetryCardBattleAction({ before, after: structuredClone(before), kind: 'attack', control, attempt: 1, maxAttempts: 2 }), true);
  assert.equal(shouldRetryCardBattleAction({ before, after: { ...structuredClone(before), enemies: [{ id: 'bug-1', hp: 26 }] }, kind: 'attack', control, attempt: 1, maxAttempts: 2 }), false,
    'a partially applied action must never be replayed');
  assert.equal(shouldRetryCardBattleAction({ before, after: structuredClone(before), kind: 'attack', control: { ...control, covered: true }, attempt: 1, maxAttempts: 2 }), false,
    'a covered control must go through popup recovery instead of retry');
  assert.equal(shouldRetryCardBattleAction({ before, after: structuredClone(before), kind: 'attack', control, attempt: 2, maxAttempts: 2 }), false,
    'the retry count stays bounded');
});

test('random-event battle acknowledges a visible Fate result before waiting for the card hand', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/card-battle-random-event.json'), 'utf8'));
  const start = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action="startCardBattle"][data-encounter="NORMAL"]');
  const battleWait = scenario.steps.findIndex((step, index) => index > start && step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="PLAYER_ACTION"]');
  const resultAcknowledgement = scenario.steps.findIndex((step, index) => index > start && index < battleWait
    && step.action === 'clickIfPresent' && step.selector === '.ux-modal-layer #V2EventOk');
  assert.ok(start >= 0 && resultAcknowledgement > start && battleWait > resultAcknowledgement,
    'a real Fate result can cover the newly opened battle; acknowledge its visible result before waiting for the card hand');
});

test('a popup that appears after a card click is closed through its visible control before battle input retries', async () => {
  let popupVisible = true;
  const clicked = [];
  const result = await dismissPopupAfterStalledCardAction({
    inspectPopup: async () => popupVisible
      ? { visible: true, control: { selector: '#V2EventOk', visible: true, disabled: false } }
      : { visible: false, control: null },
    clickControl: async (control) => {
      clicked.push(control.selector);
      popupVisible = false;
      return true;
    },
    delay: async () => {},
  });
  assert.deepEqual(clicked, ['#V2EventOk'], 'only the real acknowledgement button closes the popup');
  assert.equal(result.status, 'dismissed');
  assert.equal(result.attempts, 1);
  assert.equal(result.popup.visible, false, 'the helper returns only after confirming the popup is gone');
});

test('popup recovery after a stalled card click stops after three real attempts when the popup remains visible', async () => {
  let clicks = 0;
  const result = await dismissPopupAfterStalledCardAction({
    inspectPopup: async () => ({ visible: true, control: { selector: '#V2EventOk', visible: true, disabled: false } }),
    clickControl: async () => { clicks += 1; return true; },
    delay: async () => {},
  });
  assert.equal(clicks, 3);
  assert.equal(result.status, 'still-visible');
  assert.equal(result.attempts, 3);
});

test('card battle input waits for a delayed authoritative update instead of declaring a successful visible play failed', async () => {
  const before = { phase: 'PLAYER_ACTION', turn: 1, hitLog: [], actionLog: [] };
  const after = { ...before, hitLog: [{ id: 'hit-delayed' }] };
  let elapsedMs = 0;
  let reads = 0;
  const result = await waitForCardBattleActionTransition({
    before,
    kind: 'attack',
    readState: async () => (++reads < 18 ? before : after),
    delay: async (ms) => { elapsedMs += ms; },
    now: () => elapsedMs,
    timeoutMs: 2500,
    pollIntervalMs: 100,
  });
  assert.equal(result.status, 'advanced');
  assert.deepEqual(result.state, after);
  assert.ok(elapsedMs >= 1700, 'the delayed 1.8-second state update must be observed before failure classification');
});

test('Fate chain event waits opt into real popup recovery before waiting for the next stage', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/fate-chain-death-rebirth.json');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  const eventWaits = scenario.steps.filter((step) => step.action === 'waitFor' && step.selector.includes('#FateEventCard'));
  assert.ok(eventWaits.length >= 5, 'the scenario keeps its five visible intern story stages');
  assert.ok(eventWaits.every((step) => step.popupChoiceSelector?.startsWith('.ux-modal-layer .ux-event-option')),
    'waiting for a Fate card must actively detect and resolve any interrupting modal through its real visible choice');
  const chainTransitions = [
    ['intern_s1', 'intern_s2'], ['intern_s2', 'intern_s3'], ['intern_s3', 'coffee_event'], ['coffee_event', 'intern_s4'], ['intern_s4', 'intern_s5'],
  ];
  for (const [from, expected] of chainTransitions) {
    const choice = from === 'coffee_event' ? 'NEGOTIATE' : 'HELP';
    assert.ok(scenario.steps.some((step) => step.action === 'clickUntilState'
      && step.selector === `#FateEventChoices [data-fate-choice=${choice}]`
      && step.method === 'queryFateRun'
      && step.path === 'eventQueue[0]'
      && step.from === from
      && step.expected === expected),
    `the visible ${choice} choice on ${from} must wait for the authoritative queue to advance to ${expected}`);
  }
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor'
    && step.selector === '#FateEventCard[data-event-id=coffee_event]:not([hidden])'),
  'the scenario must wait for the actual coffee event card before selecting its free-water option');
  assert.ok(scenario.steps.some((step) => step.action === 'assert'
    && step.path === '@vars.afterCoffeeEvent.flags.coffee_event_negotiate'
    && step.expected === true),
  'the scenario must verify the coffee choice outcome in authoritative Fate state');
  assert.ok(scenario.steps.some((step) => step.action === 'clickUntilState'
    && step.selector === '#FateEventChoices [data-fate-choice="RISK"]'
    && step.method === 'queryFateRun'
    && step.path === 'status'
    && step.from === 'ACTIVE'
    && step.expected === 'ENDED'),
  'the final visible risk choice must wait for the authoritative death ending before rebirth steps');
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

test('popup controls clipped below the viewport are not treated as clickable before a real scroll brings them into view', () => {
  const popup = { visible: true };
  assert.equal(popupChoiceCanBeClicked(popup, {
    found: true, visible: true, disabled: false, covered: false,
    bounds: { x: 351, y: 832, width: 578, height: 38 }, viewport: { width: 1280, height: 720 },
  }), false);
  assert.equal(popupChoiceCanBeClicked(popup, {
    found: true, visible: true, disabled: false, covered: false,
    bounds: { x: 351, y: 640, width: 578, height: 38 }, viewport: { width: 1280, height: 720 },
  }), true);
});

test('card battle first-win scenario closes the visible weekly recap before attacking and verifies it is gone', () => {
  const scenario = validateScenario(JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/card-battle-first-win.json'), 'utf8')));
  const statefulAttack = scenario.steps.find((step) => step.action === 'clickUntilState' && step.selector?.includes('ux-cardbattle-attack'));
  assert.match(statefulAttack.popupChoiceSelector, /\.ux-week-close/);
  const close = scenario.steps.find((step) => step.action === 'clickIfPresent' && step.selector === '.ux-weekly-popup .ux-week-close');
  assert.ok(close, 'weekly recap must be closed through its real button when it is visible');
  assert.equal(close.timeoutMs, 3000, 'runner must wait for the real control to disappear after clicking');
  for (const selector of [".ux-modal-layer .ux-event-option[data-vevent-choice='NOT_HOME']", '#V2EventOk', ".ux-modal-layer .ux-event-option[data-weekend='SECLUDED_CULTIVATE']"]) {
    assert.ok(scenario.steps.some((step) => step.action === 'clickIfPresent' && step.selector === selector), `queued home modal must be resolved through its real UI control: ${selector}`);
  }
  const attacks = scenario.steps.filter((step) => step.action === 'clickUntilState' && step.selector?.includes('ux-cardbattle-attack'));
  assert.ok(attacks.length > 0 && attacks.every((step) => step.popupChoiceSelector?.includes('[data-vevent-choice="__auto"]')),
    'attack recovery must include the real visible no-choice workplace-event acknowledgement');
});

test('isolated Chromium profile cleanup retries transient Windows locks and reports a deferred cleanup without throwing', async () => {
  let removals = 0;
  const delays = [];
  const recovered = await cleanupIsolatedProfile('isolated-profile', {
    remove: async () => {
      removals += 1;
      if (removals < 3) throw Object.assign(new Error('file in use'), { code: 'EBUSY' });
    },
    delay: async (ms) => delays.push(ms),
  });
  assert.deepEqual(recovered, { status: 'removed', attempts: 3 });
  assert.deepEqual(delays, [100, 200]);

  const deferred = await cleanupIsolatedProfile('isolated-profile', {
    attempts: 2,
    remove: async () => { throw Object.assign(new Error('file in use'), { code: 'EBUSY' }); },
    delay: async () => {},
  });
  assert.equal(deferred.status, 'deferred');
  assert.equal(deferred.attempts, 2);
  assert.match(deferred.error, /EBUSY/);
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

test('project contract flow scopes messenger back navigation before returning through the project tab', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/sect-project-contract.json'), 'utf8'));
  const startIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="startSectProject"]');
  const backIndex = scenario.steps.findIndex((step) => step.action === 'clickIfPresent' && step.selector === '[data-action="back"]');
  const messengerBackIndex = scenario.steps.findIndex((step, index) => index > startIndex && step.action === 'clickIfPresent' && step.selector === '.ux-screen:has(.ux-messenger) .ux-header [data-action="back"]');
  const projectNavIndex = scenario.steps.findIndex((step, index) => index > startIndex && step.action === 'click' && step.selector === '[data-nav="PROJECT"]');
  assert.ok(startIndex >= 0, 'the scenario starts its project contract visibly before resolving modal interruptions');
  assert.equal(backIndex, -1, 'the global back control exists on the active project page and is not proof that the messenger is open');
  assert.ok(messengerBackIndex >= 0 && messengerBackIndex < projectNavIndex, 'only the messenger-scoped back control may leave a critical conversation before restoring the project route');
  assert.ok(projectNavIndex >= 0, 'the scenario should use the visible project tab to restore the intended route');
});

test('time-save compares the persisted second settlement with its workday rather than the possibly advanced current day', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/time-save.json'), 'utf8'));
  const assertion = scenario.steps.find((step) => step.description === 'The second persisted wage slip matches the authoritative second workday');
  assert.equal(assertion?.path, '@vars.settlementHistoryTwo[2].dayIndex', 'two earlier persisted calendar-day slips precede the scenario workdays');
  assert.equal(assertion?.expected, '@vars.workdayTwo.dayIndex', 'the game loop can roll the current day forward while persisting settlement history');
});

test('time-save does not infer the authoritative workday index from a 24-hour clock advance', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/time-save.json'), 'utf8'));
  const firstWorkday = scenario.steps.find((step) => step.path === '@vars.workdayOne.dayIndex');
  const firstSlip = scenario.steps.find((step) => step.path === '@vars.settlementHistoryOne[0].dayIndex');
  assert.equal(firstWorkday?.check, 'gte');
  assert.equal(firstWorkday?.expected, 1, 'a new save may still be on its first authoritative game day after the clock advances');
  assert.equal(firstSlip?.check, 'lte');
  assert.equal(firstSlip?.expected, '@vars.workdayOne.dayIndex', 'the persisted slip must not claim a day later than the authoritative workday');
});

test('release check recompiles test JavaScript before executing the compiled suite', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const script = packageJson.scripts['release:check'];
  assert.match(script, /tsc -p tsconfig\.game\.json --outDir tests\/\.compiled --noEmit false/,
    'release check must refresh compiled tests so stale output cannot contradict source tests');
  assert.match(script, /node tests\/run-all\.cjs/);
});

test('layoff reemployment returns to the career tab after dismissing an incidental single-choice event', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ai/gameplay-agent/scenarios/career-layoff-reemployment.json'), 'utf8'));
  const taskStartIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="start"][data-id="task_system_migration"]');
  const taskClaimIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="claim"][data-id="task_system_migration"]');
  const layoffWarningIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="careerLayoffWarning"]');
  assert.ok(taskStartIndex >= 0 && taskClaimIndex > taskStartIndex && taskClaimIndex < layoffWarningIndex,
    'earn sufficient interview standing through a real task UI before entering the layoff flow');
  const taskTickIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'tick' && step.args?.[0] === 25200);
  assert.equal(scenario.steps[taskTickIndex + 1].action, 'clickIfPresent');
  assert.equal(scenario.steps[taskTickIndex + 1].selector, '[data-vevent-choice="__auto"]',
    'acknowledge any single-choice event surfaced by elapsed game time through its actual UI button before inspecting task completion');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterSetupPerformance.performance'
    && step.check === 'gte' && step.expected === 40), 'verify canonical performance came from the completed task');
  const layoffWarningScreenshotIndex = scenario.steps.findIndex((step) => step.action === 'screenshot' && step.name === 'layoff-warning');
  const layoffResponseIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="careerLayoffResponse"][data-response="ACCEPT_PACKAGE"]');
  const eventDrainSteps = scenario.steps.slice(layoffWarningScreenshotIndex + 1, layoffResponseIndex);
  assert.deepEqual(eventDrainSteps.map((step) => step.selector), [
    '[data-vevent-choice="__auto"]', '#V2EventOk',
    '[data-vevent-choice="__auto"]', '#V2EventOk',
    '[data-vevent-choice="__auto"]', '#V2EventOk',
  ], 'resolve up to three visible Fate choice/result pairs through their real controls before selecting severance');
  assert.ok(eventDrainSteps.every((step) => step.action === 'clickIfPresent'),
    'each incidental Fate modal control must be actually clicked and verified closed before the layoff response');
  const walletBeforePackageIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'snapshot' && step.as === 'walletBeforePackage');
  const layoffResolveIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="careerLayoffResolve"]');
  const settlementEventDrain = scenario.steps.slice(walletBeforePackageIndex + 1, layoffResolveIndex);
  assert.deepEqual(settlementEventDrain.map((step) => step.selector), [
    '[data-vevent-choice="__auto"]', '#V2EventOk',
    '[data-vevent-choice="__auto"]', '#V2EventOk',
    '[data-vevent-choice="__auto"]', '#V2EventOk',
  ], 'resolve newly surfaced Fate choice/result pairs immediately before severance settlement');
  const unemployedScreenshotIndex = scenario.steps.findIndex((step) => step.action === 'screenshot' && step.name === 'layoff-unemployed');
  assert.ok(unemployedScreenshotIndex >= 0);
  assert.equal(scenario.steps[unemployedScreenshotIndex + 1].selector, '[data-vevent-choice="__auto"]');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 2].selector, '[data-critical-conv]',
    'open a real critical-message conversation through its visible modal control before choosing a reply');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 3].selector, '.ux-reply-option',
    'if a real critical messenger detail opened, choose its visible reply before leaving the detail');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 4].selector, '[data-action="back"]');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 4].action, 'click',
    'leaving a page must use normal click recovery because the transition itself can surface a critical-message modal');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 5].selector, '[data-critical-conv]',
    'check for the real critical-message choice again after page navigation can dispatch it');
  assert.equal(scenario.steps[unemployedScreenshotIndex + 6].selector, '.ux-reply-option',
    'resolve any message conversation opened during the navigation transition');
  const recruitmentIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="goto"][data-page="sect"]');
  assert.ok(recruitmentIndex > unemployedScreenshotIndex + 6);
  assert.equal(scenario.steps[recruitmentIndex - 1].selector, '[data-nav="PROMOTION"]');
  const recruitmentScroll = scenario.steps.find((step) => step.action === 'scroll' && step.ensureVisibleSelector === '[data-action="sect"][data-id="BIG_TECH"]');
  assert.deepEqual(recruitmentScroll.recoverySelectors, ['[data-nav="PROMOTION"]', '[data-action="goto"][data-page="sect"]']);
  const eventDismissalAfterRecruitmentRoute = scenario.steps.findIndex((step, index) => index > recruitmentIndex
    && step.action === 'clickIfPresent' && step.selector === '[data-vevent-choice="__auto"]');
  assert.equal(eventDismissalAfterRecruitmentRoute, recruitmentIndex + 1,
    'a workplace event may switch away from the recruitment page as that route opens; acknowledge it through its real button before inspecting the list');
  assert.equal(scenario.steps[eventDismissalAfterRecruitmentRoute + 1].selector, '[data-nav="PROMOTION"]',
    'after the event closes, restore the career tab through normal UI navigation');
  assert.equal(scenario.steps[eventDismissalAfterRecruitmentRoute + 2].selector, '[data-action="goto"][data-page="sect"]',
    'reopen the recruitment list before scrolling or targeting a sect card');
  const applyIndex = scenario.steps.findIndex((step) => step.selector === '[data-action="sect"][data-id="INTERNAL"]');
  assert.ok(applyIndex >= 0,
    'choose an existing employer whose deterministic interview threshold the earned profile can meet');
  assert.equal(scenario.steps[applyIndex + 1].selector, '#PopupLayer .ux-dialog-actions button[data-idx="1"]');
  const interviewWaitIndex = scenario.steps.findIndex((step) => step.action === 'waitFor'
    && step.selector === '[data-action="sectInterview"][data-answer="DELIVERY"]');
  const eventDismissalAfterInterviewWait = scenario.steps.findIndex((step, index) => index > interviewWaitIndex
    && step.action === 'clickIfPresent' && step.selector === '[data-vevent-choice="__auto"]');
  assert.equal(eventDismissalAfterInterviewWait, interviewWaitIndex + 1,
    'an event can arrive between observing the interview control and clicking it; close only through its real acknowledgement control');
  assert.equal(scenario.steps[eventDismissalAfterInterviewWait + 1].selector, '[data-critical-conv]',
    'a critical-message modal must be resolved by selecting its real conversation before restoring the recruitment route');
  assert.equal(scenario.steps[eventDismissalAfterInterviewWait + 2].selector, '[data-nav="PROMOTION"]');
  assert.equal(scenario.steps[eventDismissalAfterInterviewWait + 3].selector, '[data-action="goto"][data-page="sect"]');
  assert.equal(scenario.steps[eventDismissalAfterInterviewWait + 4].action, 'waitFor',
    'the interview control must be observed again after restoring its page');
  const dayBeforeIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryGameDay' && step.as === 'dayBeforeRehire');
  const dayAfterIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryGameDay' && step.as === 'dayAfterRehire');
  assert.deepEqual(scenario.steps.slice(dayBeforeIndex + 1, dayAfterIndex).map((step) => ({ action: step.action, method: step.method, args: step.args, selector: step.selector })), [
    { action: 'call', method: 'devJumpToHour', args: [18, 0], selector: undefined },
    { action: 'call', method: 'tick', args: [60], selector: undefined },
    { action: 'clickIfPresent', method: undefined, args: undefined, selector: '#SettleOk' },
    { action: 'call', method: 'devJumpToHour', args: [9, 0], selector: undefined },
    { action: 'call', method: 'tick', args: [60], selector: undefined },
  ], 'next-day employment must be verified through real settlement and the authoritative next-workday service tick');
  const homeAfterRehireIndex = scenario.steps.findIndex((step, index) => index > dayAfterIndex && step.action === 'click' && step.selector === '[data-nav="HOME"]');
  const workModeIndex = scenario.steps.findIndex((step, index) => index > homeAfterRehireIndex && step.action === 'call' && step.method === 'changeWorkMode'
    && JSON.stringify(step.args) === JSON.stringify(['WORK']));
  const rehireWageDayIndex = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryGameDay' && step.as === 'rehireWageDay');
  assert.ok(homeAfterRehireIndex > dayAfterIndex && workModeIndex > homeAfterRehireIndex && rehireWageDayIndex > workModeIndex,
    'verify the new contract wage through the canonical work and game-loop services after UI re-employment');
  const wageClockIndex = scenario.steps.findIndex((step, index) => index > workModeIndex && step.action === 'call' && step.method === 'devAdvanceTime');
  assert.deepEqual(scenario.steps.slice(wageClockIndex, wageClockIndex + 2).map((step) => ({ method: step.method, args: step.args })), [
    { method: 'devAdvanceTime', args: [600000] }, { method: 'tick', args: [600] },
  ], 'advance enough canonical work time for fractional wage remainders to produce a wallet change');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.rehireWageDay.income.salary'
    && step.check === 'gt' && step.expected === 0), 'the effective-day wage must enter the authoritative daily salary ledger');
  const restartIndex = scenario.steps.findIndex((step, index) => index > rehireWageDayIndex && step.action === 'restart');
  assert.ok(restartIndex > rehireWageDayIndex && scenario.steps[restartIndex - 1].method === 'save'
    && scenario.steps.slice(restartIndex + 1).some((step) => step.action === 'assert' && step.path === '@vars.careerAfterRestart.sectId'
      && step.expected === 'INTERNAL'), 'the re-employment contract and earned wage must survive a real EXE restart');
  const interviewClickIndex = scenario.steps.findIndex((step, index) => index > eventDismissalAfterInterviewWait
    && step.action === 'click' && step.selector === '[data-action="sectInterview"][data-answer="DELIVERY"]');
  assert.ok(interviewClickIndex > eventDismissalAfterInterviewWait + 3);
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.rehireContract.sectId'
    && step.expected === 'INTERNAL'), 'the persisted next-day contract must match the employer selected in the UI');
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

test('a missing GUI click target without captured interface evidence is not verified', () => {
  const error = new Error('click target not found: [data-action="goto"][data-page="sect"]');
  assert.equal(classifyStepFailure({ step: { action: 'click' }, error }), 'NOT_VERIFIED');
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

test('startup stability scenario performs ten serial ready-gated launches with evidence for each', () => {
  const scenarioPath = path.join(__dirname, '../../ai/gameplay-agent/scenarios/startup-stability.json');
  assert.ok(fs.existsSync(scenarioPath), 'the 10-launch startup acceptance must be a maintained scenario');
  const scenario = validateScenario(JSON.parse(fs.readFileSync(scenarioPath, 'utf8')));
  assert.equal(scenario.steps.filter((step) => step.action === 'restart').length, 9,
    'the initial launch plus nine serialized restarts make ten ready-gated launches');
  assert.equal(scenario.steps.filter((step) => step.action === 'screenshot').length, 10,
    'every launch must have its own captured startup evidence');
  assert.ok(scenario.steps.slice(1).every((step) => step.action === 'restart' || step.action === 'screenshot'),
    'the stability run must not inject game state or perform unrelated gameplay actions');
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  assert.equal(packageJson.scripts['gameplay-agent:startup'], 'node ai/gameplay-agent/index.cjs test --scenario=startup-stability',
    'the ten-launch acceptance must be directly runnable through a maintained npm script');
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
  const target = { found: true, visible: true, disabled: false, covered: false, bounds: { x: 10, y: 10, width: 20, height: 20 }, viewport: { width: 100, height: 100 } };
  assert.equal(canFinishClickAfterFinalPopupDismissal({ popupClosed: true, target, attempt: 3, maxAttempts: 3 }), true);
  assert.equal(canFinishClickAfterFinalPopupDismissal({ popupClosed: false, target, attempt: 3, maxAttempts: 3 }), false);
  assert.equal(canFinishClickAfterFinalPopupDismissal({ popupClosed: true, target: { ...target, covered: true }, attempt: 3, maxAttempts: 3 }), false);
});

test('a scenario popup choice is usable only when the real modal control is visible, enabled and uncovered', () => {
  const popup = { visible: true };
  const inWindow = { bounds: { x: 10, y: 10, width: 20, height: 20 }, viewport: { width: 100, height: 100 } };
  assert.equal(popupChoiceCanBeClicked?.(popup, { ...inWindow, found: true, visible: true, disabled: false, covered: false }) ?? false, true);
  assert.equal(popupChoiceCanBeClicked?.(popup, { ...inWindow, found: true, visible: true, disabled: false, covered: true }) ?? false, false);
  assert.equal(popupChoiceCanBeClicked?.(popup, { ...inWindow, found: true, visible: true, disabled: true, covered: false }) ?? false, false);
  assert.equal(popupChoiceCanBeClicked?.({ visible: false }, { ...inWindow, found: true, visible: true, disabled: false, covered: false }) ?? false, false);
});

test('a popup that appears during pointer movement is recoverable only through a visible supported control', () => {
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: { disabled: false } }), true);
  assert.equal(canRecoverObstructedClick({ covered: false }, { visible: true, control: { disabled: false } }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: false, control: { disabled: false } }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: null }), false);
  assert.equal(canRecoverObstructedClick({ covered: true }, { visible: true, control: { disabled: true } }), false);
});

test('popup recovery inspects the real modal when it temporarily removes the requested target', () => {
  assert.equal(shouldInspectPopupForTarget({ found: false }, '.ux-modal-layer [data-vevent-choice="__auto"]'), true);
  assert.equal(shouldInspectPopupForTarget({ found: false }, null), false);
  assert.equal(shouldInspectPopupForTarget({ found: true, visible: true, covered: true }, null), true);
  assert.equal(shouldInspectPopupForTarget({ found: true, visible: true, covered: false }, '.ux-modal-layer [data-vevent-choice="__auto"]'), false);
});

test('an obscuring popup transition is observed until its real control becomes visible', () => {
  assert.equal(shouldWaitForObscuringPopup({ covered: true }, { visible: false }), true);
  assert.equal(shouldWaitForObscuringPopup({ covered: true }, { visible: true }), false);
  assert.equal(shouldWaitForObscuringPopup({ covered: false }, { visible: false }), false);
});

test('popup recovery can handle a result modal while respecting the three-attempt limit', () => {
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: true }, 1), true);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: true }, 3, 3), false);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: true }, { visible: false }, 1), false);
  assert.equal(shouldContinuePopupRecovery({ found: true, visible: true, covered: false }, { visible: true }, 1), false);
});

test('popup recovery handles a bounded chain of real event and result modals', () => {
  const target = { found: true, visible: true, covered: true };
  assert.equal(shouldContinuePopupRecovery(target, { visible: true }, 4), true,
    'a second event result may still be covering the requested control after three real UI acknowledgements');
  assert.equal(shouldContinuePopupRecovery(target, { visible: true }, 5), true,
    'recovery may finish a short chain of queued event/result modals');
  assert.equal(shouldContinuePopupRecovery(target, { visible: true }, 6), false,
    'modal recovery remains strictly bounded');
});

test('single-outcome event acknowledgements resolve to their real visible button selector', () => {
  assert.equal(popupControlSelector({ kind: 'acknowledge', veventChoice: '__auto' }), '[data-vevent-choice="__auto"]');
  assert.equal(popupControlSelector({ kind: 'acknowledge', id: 'V2EventOk' }), '#V2EventOk');
  assert.equal(popupControlSelector({ kind: 'critical-message-choice' }), '[data-critical-conv]');
  assert.equal(popupControlSelector({ kind: 'close' }), null, 'existing close selectors must remain authoritative');
  assert.equal(popupControlSelector({ kind: 'acknowledge' }), null);
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

test('keyboard scroll recovery tabs without activating controls and stops only when the requested target is safely visible', async () => {
  let tabs = 0;
  const result = await tabScrollTargetIntoView({
    selector: '#save-identity',
    maxTabSteps: 8,
    inspectTarget: async () => ({ found: true, visible: tabs >= 3, covered: false, disabled: false }),
    dispatchTab: async () => { tabs += 1; },
    wait: async () => {},
  });

  assert.equal(result.visible, true);
  assert.equal(result.tabSteps, 3);
  assert.equal(tabs, 3, 'focus navigation must stop as soon as the requested control is visible');
});

test('keyboard scroll recovery fails closed when the target stays obscured after its bounded Tab attempts', async () => {
  let tabs = 0;
  const result = await tabScrollTargetIntoView({
    selector: '#save-identity',
    maxTabSteps: 2,
    inspectTarget: async () => ({ found: true, visible: true, covered: true, disabled: false }),
    dispatchTab: async () => { tabs += 1; },
    wait: async () => {},
  });

  assert.equal(result.visible, false);
  assert.equal(result.tabSteps, 2);
  assert.equal(tabs, 2);
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
