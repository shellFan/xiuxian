'use strict';

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/i;
const ACTIONS = new Set(['click', 'clickIfPresent', 'clickUntilState', 'doubleClick', 'type', 'scroll', 'key', 'pressKey', 'wait', 'waitFor', 'screenshot', 'getGameState', 'assertVisible', 'assertClickable', 'assertState', 'call', 'assert', 'restart', 'restartGame', 'professionMatrix', 'setViewport', 'homeArenaPlay', 'homeArenaSoak']);
const FAILURE_CLASSES = new Set(['SETUP_BLOCKED', 'AUTOMATION_DEFECT', 'GAME_DEFECT', 'ASSERTION_DEFECT', 'ENVIRONMENT_BLOCKED', 'NOT_VERIFIED']);
const VALUE_TYPES = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);
const SAFE_STATE_PATH = /^(?:@[a-z][a-zA-Z0-9]*)?(?:\.[a-zA-Z_$][\w$]*|\[(?:\d+|"[a-zA-Z0-9_:-]+")\])*$/;
const SAFE_CLICK_STATE_PATH = /^[a-zA-Z_$][\w$]*(?:(?:\.[a-zA-Z_$][\w$]*)|\[(?:\d+|"[a-zA-Z0-9_:-]+")\])*$/;

function safeRunId(value) {
  return typeof value === 'string' && SAFE_ID.test(value) && !value.includes('..') ? value : null;
}

function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || !SAFE_ID.test(scenario.id ?? '') || scenario.id.includes('..')) {
    throw new Error('scenario id must contain only letters, digits and hyphens');
  }
  if (scenario.setupFailureClass !== undefined && !FAILURE_CLASSES.has(scenario.setupFailureClass)) {
    throw new Error(`scenario ${scenario.id}: invalid setup failure classification`);
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new Error(`scenario ${scenario.id} needs at least one step`);
  for (const [index, step] of scenario.steps.entries()) {
    if (!step || !ACTIONS.has(step.action)) throw new Error(`scenario ${scenario.id} step ${index + 1}: unsupported action`);
    if (['homeArenaPlay', 'homeArenaSoak'].includes(step.action)) {
      if (step.seed !== 5911) throw new Error('home arena needs the controlled fixed seed 5911');
      if (!Number.isInteger(step.clickIntervalMs) || step.clickIntervalMs < 200 || step.clickIntervalMs > 1000) throw new Error('home arena clickIntervalMs must be between 200 and 1000');
      if (step.action === 'homeArenaSoak' && (!Number.isInteger(step.durationMs) || step.durationMs < 1200000 || step.durationMs > 1800000)) throw new Error('home arena durationMs must cover at least twenty minutes and at most thirty real minutes');
    }
    if (['click', 'clickIfPresent', 'clickUntilState', 'doubleClick', 'type', 'scroll', 'waitFor', 'assertVisible', 'assertClickable'].includes(step.action) && (typeof step.selector !== 'string' || !step.selector.trim())) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: ${step.action} needs a selector`);
    }
    if (step.action === 'waitFor' && !['visible', 'hidden', 'exists', 'notExists', 'clickable'].includes(step.state ?? 'visible')) throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid waitFor state`);
    if (['waitFor', 'clickIfPresent'].includes(step.action) && step.timeoutMs !== undefined && (!Number.isFinite(step.timeoutMs) || step.timeoutMs < 1 || step.timeoutMs > 120000)) throw new Error(`scenario ${scenario.id} step ${index + 1}: ${step.action} timeoutMs must be between 1 and 120000`);
    if (step.action === 'clickUntilState') {
      if (typeof step.method !== 'string' || !/^([a-zA-Z_$][\w$]*\.)*[a-zA-Z_$][\w$]*$/.test(step.method)) throw new Error(`scenario ${scenario.id} step ${index + 1}: clickUntilState needs a valid facade method`);
      if (typeof step.path !== 'string' || !SAFE_CLICK_STATE_PATH.test(step.path) || /(?:__proto__|prototype|constructor|window|globalThis|process|require)/i.test(step.path)) throw new Error(`scenario ${scenario.id} step ${index + 1}: clickUntilState needs a safe state path`);
      if (!Object.hasOwn(step, 'from') || !Object.hasOwn(step, 'expected')) throw new Error(`scenario ${scenario.id} step ${index + 1}: clickUntilState needs from and expected states`);
      if (!Number.isInteger(step.maxAttempts) || step.maxAttempts < 1 || step.maxAttempts > 3) throw new Error(`scenario ${scenario.id} step ${index + 1}: clickUntilState maxAttempts must be between 1 and 3`);
      if (step.timeoutMs !== undefined && (!Number.isFinite(step.timeoutMs) || step.timeoutMs < 1 || step.timeoutMs > 120000)) throw new Error(`scenario ${scenario.id} step ${index + 1}: clickUntilState timeoutMs must be between 1 and 120000`);
      if (step.as !== undefined && !/^[a-z][a-zA-Z0-9]{0,39}$/.test(step.as)) throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result alias`);
    }
    if (step.popupChoiceSelector !== undefined && (typeof step.popupChoiceSelector !== 'string' || !/^\.ux-modal-layer\s+/.test(step.popupChoiceSelector) || step.popupChoiceSelector.length > 500)) throw new Error(`scenario ${scenario.id} step ${index + 1}: popupChoiceSelector must target a control inside .ux-modal-layer`);
    if (step.action === 'scroll' && step.ensureVisibleSelector !== undefined && (typeof step.ensureVisibleSelector !== 'string' || !step.ensureVisibleSelector.trim())) throw new Error(`scenario ${scenario.id} step ${index + 1}: ensureVisibleSelector must be a nonempty selector`);
    if (step.action === 'scroll' && step.recoverySelector !== undefined && (typeof step.recoverySelector !== 'string' || !step.recoverySelector.trim())) throw new Error(`scenario ${scenario.id} step ${index + 1}: recoverySelector must be a nonempty selector`);
    if (step.action === 'scroll' && step.recoverySelectors !== undefined && (!Array.isArray(step.recoverySelectors) || step.recoverySelectors.length < 1 || step.recoverySelectors.length > 4 || step.recoverySelectors.some((selector) => typeof selector !== 'string' || !selector.trim()))) throw new Error(`scenario ${scenario.id} step ${index + 1}: recoverySelectors must contain one to four nonempty selectors`);
    if (['getGameState', 'call'].includes(step.action) && step.as !== undefined && !/^[a-z][a-zA-Z0-9]{0,39}$/.test(step.as)) throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result alias`);
    if (['getGameState', 'call'].includes(step.action) && step.asScope !== undefined && !['scenario', 'run'].includes(step.asScope)) throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result scope`);
    if (['getGameState', 'call'].includes(step.action) && step.asType !== undefined && !VALUE_TYPES.has(step.asType)) throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result type`);
    if (step.action === 'assertState' && (typeof step.path !== 'string' || !['equals', 'truthy', 'exists', 'gte', 'gt', 'lte'].includes(step.check))) throw new Error(`scenario ${scenario.id} step ${index + 1}: assertState needs a supported check and state path`);
    if (['assert', 'assertState'].includes(step.action) && step.path !== undefined && (!SAFE_STATE_PATH.test(step.path) || /(?:__proto__|prototype|constructor|window|globalThis|process|require)/i.test(step.path))) throw new Error(`scenario ${scenario.id} step ${index + 1}: unsafe state path`);
    if (step.action === 'setViewport' && (![1280, 1366, 1600, 1024].includes(step.width) || ![720, 768, 900].includes(step.height))) throw new Error(`scenario ${scenario.id} step ${index + 1}: unsupported viewport size`);
    if (step.action === 'call' && (typeof step.method !== 'string' || !/^([a-zA-Z_$][\w$]*\.)*[a-zA-Z_$][\w$]*$/.test(step.method))) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid facade method`);
    }
    if (step.action === 'call' && step.as !== undefined && !/^[a-z][a-zA-Z0-9]{0,39}$/.test(step.as)) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result alias`);
    }
    if (step.action === 'call' && step.asScope !== undefined && !['scenario', 'run'].includes(step.asScope)) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result scope`);
    }
    if (step.action === 'call' && step.asType !== undefined && !VALUE_TYPES.has(step.asType)) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid result type`);
    }
    if (step.failureClass !== undefined && !FAILURE_CLASSES.has(step.failureClass)) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: invalid failure classification`);
    }
    if (step.action === 'assert' && !['equals', 'truthy', 'exists', 'gte', 'gt', 'lte', 'change', 'clickable', 'notObscured', 'inBounds', 'windowSize'].includes(step.check)) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: unsupported assertion`);
    }
    if (step.action === 'assert' && ['equals', 'truthy', 'exists', 'gte', 'gt', 'lte', 'change'].includes(step.check) && typeof step.path !== 'string') {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: ${step.check} needs a safe state path`);
    }
    if (step.action === 'assert' && step.check === 'change' && typeof step.from !== 'string') throw new Error(`scenario ${scenario.id} step ${index + 1}: change needs a from state path`);
    if (step.action === 'assert' && step.check === 'windowSize' && (!Number.isFinite(step.minimumWidth) || !Number.isFinite(step.minimumHeight))) throw new Error(`scenario ${scenario.id} step ${index + 1}: windowSize needs minimumWidth and minimumHeight`);
  }
  return scenario;
}

function collectFailedScenarioIds(report) {
  return (report?.scenarios ?? []).filter((scenario) => ['failed', 'blocked'].includes(scenario.status)).map((scenario) => scenario.id);
}

function summarizeResults(scenarios) {
  const passed = scenarios.filter((result) => result.status === 'passed').length;
  const failed = scenarios.filter((result) => result.status === 'failed').length;
  const blocked = scenarios.filter((result) => result.status === 'blocked').length;
  const notVerified = scenarios.filter((result) => result.status === 'not_verified').length;
  return { status: failed ? 'FAILED' : blocked ? 'BLOCKED' : notVerified ? 'NOT_VERIFIED' : 'PASS', total: scenarios.length, passed, failed, blocked, notVerified };
}

function classifyFailure({ step, error, isSetup = false, setupFailureClass, launchFailure = false, environmentBlocked = false }) {
  if (step?.failureClass) return step.failureClass;
  if (environmentBlocked || error?.environmentBlocked) return 'ENVIRONMENT_BLOCKED';
  if (error?.message?.startsWith('ENVIRONMENT:')) return 'ENVIRONMENT_BLOCKED';
  if (error?.message?.startsWith('NOT_VERIFIED:')) return 'NOT_VERIFIED';
  if (/click target not found:/.test(error?.message ?? '')) return 'NOT_VERIFIED';
  if (error?.message?.startsWith('AUTOMATION:') || /CDP command timed out/.test(error?.message ?? '')) return 'AUTOMATION_DEFECT';
  if (launchFailure) return 'NOT_VERIFIED';
  if (isSetup) return setupFailureClass ?? 'SETUP_BLOCKED';
  if (step && ['assert', 'assertState'].includes(step.action)) return 'ASSERTION_DEFECT';
  if (error?.failureClass) return error.failureClass;
  return 'GAME_DEFECT';
}

function classifyStepFailure({ step, error, isSetup = false, setupFailureClass, childExitCode }) {
  const classification = classifyFailure({ step, error, isSetup, setupFailureClass });
  if (classification !== 'GAME_DEFECT') return classification;
  return childExitCode === null || childExitCode === undefined ? classification : 'GAME_DEFECT';
}

module.exports = { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure, classifyStepFailure };
