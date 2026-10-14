'use strict';

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/i;
const ACTIONS = new Set(['click', 'type', 'scroll', 'key', 'wait', 'screenshot', 'call', 'assert', 'restart', 'professionMatrix']);
const FAILURE_CLASSES = new Set(['SETUP_BLOCKED', 'AUTOMATION_DEFECT', 'GAME_DEFECT', 'ASSERTION_DEFECT', 'NOT_VERIFIED']);
const VALUE_TYPES = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);

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
    if (['click', 'type', 'scroll'].includes(step.action) && (typeof step.selector !== 'string' || !step.selector.trim())) {
      throw new Error(`scenario ${scenario.id} step ${index + 1}: ${step.action} needs a selector`);
    }
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

function classifyFailure({ step, error, isSetup = false, setupFailureClass, launchFailure = false }) {
  if (error?.failureClass) return error.failureClass;
  if (step?.failureClass) return step.failureClass;
  if (error?.message?.startsWith('AUTOMATION:') || /CDP command timed out/.test(error?.message ?? '')) return 'AUTOMATION_DEFECT';
  if (launchFailure) return 'NOT_VERIFIED';
  if (isSetup) return setupFailureClass ?? 'SETUP_BLOCKED';
  return 'GAME_DEFECT';
}

module.exports = { safeRunId, validateScenario, collectFailedScenarioIds, summarizeResults, classifyFailure };
