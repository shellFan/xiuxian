'use strict';

const VARIABLE_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
const VARIABLE_PATH = /^@(vars|run)((?:\.[a-zA-Z_$][\w$]*|\[(?:\d+|"[a-zA-Z0-9_:-]+")\])+)$/;
const TYPES = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);
const MAX_POPUP_RECOVERY_ACTIONS = 6;

function createVariableScopes() {
  return { scenario: Object.create(null), run: Object.create(null) };
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function popupDismissalComplete(popup, target) {
  return popup.closed === true && target.covered === false;
}

function canFinishClickAfterFinalPopupDismissal({ popupClosed, target, attempt, maxAttempts }) {
  return attempt === maxAttempts && popupClosed === true && target?.found === true
    && target.visible === true && target.disabled !== true && target.covered === false
    && boundsWithinViewport(target.bounds, target.viewport);
}

function popupChoiceCanBeClicked(popup, choice) {
  return popup?.visible === true && choice?.found === true && choice.visible === true
    && choice.disabled !== true && choice.covered === false
    && boundsWithinViewport(choice.bounds, choice.viewport);
}

function canRecoverObstructedClick(target, popup) {
  return target?.covered === true && popup?.visible === true
    && !!popup.control && popup.control.disabled !== true;
}

function shouldInspectPopupForTarget(target, popupChoiceSelector) {
  return target?.covered === true || (target?.found === false && !!popupChoiceSelector);
}

function shouldWaitForObscuringPopup(target, popup) {
  return target?.covered === true && popup?.visible !== true;
}

function shouldContinuePopupRecovery(target, popup, attempt, maxAttempts = MAX_POPUP_RECOVERY_ACTIONS) {
  return attempt < maxAttempts && target?.found === true && target.visible === true
    && target.covered === true && popup?.visible === true;
}

function popupControlKind({ presentationKind, hasCriticalChoice, hasClose, hasAcknowledge }) {
  if (hasCriticalChoice) return 'critical-message-choice';
  if (hasClose) return 'close';
  if (hasAcknowledge) return 'acknowledge';
  return null;
}

function popupControlSelector({ kind, veventChoice, id }) {
  if (kind === 'critical-message-choice') return '[data-critical-conv]';
  if (kind === 'acknowledge' && veventChoice === '__auto') return '[data-vevent-choice=\"__auto\"]';
  if (kind === 'acknowledge' && id === 'V2EventOk') return '#V2EventOk';
  return null;
}

function scrollPositionChanged(before, after) {
  return !!before && !!after && (before.scrollTop !== after.scrollTop || before.scrollLeft !== after.scrollLeft);
}

function scrollBoundaryTargetReady(moved, target) {
  return !moved && !!target?.found && !!target.visible && !target.covered;
}

function scrollTargetAlreadyVisible(target) {
  return !!target?.found && !!target.visible && !target.covered
    && boundsWithinViewport(target.bounds, target.viewport);
}

function shouldRestoreScrollContextAfterPopup({ popupClosed, scrollContainerFound }) {
  return popupClosed === true && scrollContainerFound === false;
}

function boundsWithinViewport(bounds, viewport) {
  return !!bounds && !!viewport && bounds.x >= 0 && bounds.y >= 0
    && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height;
}

function intersectVisibleBounds(bounds, clippingAncestors, viewport) {
  if (!bounds || !viewport) return null;
  let left = Math.max(0, bounds.x);
  let top = Math.max(0, bounds.y);
  let right = Math.min(viewport.width, bounds.x + bounds.width);
  let bottom = Math.min(viewport.height, bounds.y + bounds.height);
  for (const clip of clippingAncestors ?? []) {
    if (clip.overflowX !== 'visible') {
      left = Math.max(left, clip.x);
      right = Math.min(right, clip.x + clip.width);
    }
    if (clip.overflowY !== 'visible') {
      top = Math.max(top, clip.y);
      bottom = Math.min(bottom, clip.y + clip.height);
    }
  }
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function storeScenarioVariable(scopes, name, value, { scope = 'scenario', type } = {}) {
  if (!VARIABLE_NAME.test(name)) throw new Error(`unsafe variable alias: ${name}`);
  if (scope !== 'scenario' && scope !== 'run') throw new Error(`unsupported variable scope: ${scope}`);
  if (type !== undefined && !TYPES.has(type)) throw new Error(`unsupported variable type: ${type}`);
  const actualType = valueType(value);
  if (type !== undefined && type !== actualType) throw new Error(`variable ${name} expected ${type}, received ${actualType}`);
  scopes[scope][name] = { value, type: actualType };
  return value;
}

function readScenarioVariable(scopes, reference) {
  const match = VARIABLE_PATH.exec(reference);
  if (!match || /(?:__proto__|prototype|constructor)/i.test(reference)) throw new Error(`invalid scenario variable reference: ${reference}`);
  const parts = [...match[2].matchAll(/\.([a-zA-Z_$][\w$]*)|\[(\d+|"[a-zA-Z0-9_:-]+")\]/g)]
    .map((part) => part[1] ?? (part[2].startsWith('"') ? part[2].slice(1, -1) : Number(part[2])));
  const scopeName = match[1] === 'vars' ? 'scenario' : 'run';
  const root = scopes[scopeName][parts.shift()];
  if (!root) throw new Error(`scenario variable is missing: ${reference}`);
  let value = root.value;
  for (const part of parts) {
    if (value === null || value === undefined || !(part in Object(value))) throw new Error(`scenario variable path is missing: ${reference}`);
    value = value[part];
  }
  return value;
}

function readStatePath(value, reference) {
  const tokens = String(reference).match(/(?:^|\.)([a-zA-Z_$][\w$]*)|\[(\d+|"[a-zA-Z0-9_:-]+")\]/g) ?? [];
  const keys = tokens.map((token) => {
    const bracket = token.startsWith('[') ? token.slice(1, -1) : token.replace(/^\./, '');
    if (/^\d+$/.test(bracket)) return Number(bracket);
    return bracket.startsWith('"') ? JSON.parse(bracket) : bracket;
  });
  return keys.reduce((current, key) => current == null ? undefined : current[key], value);
}

function scenarioStateMatchesFrom(value, from) {
  return from === null ? value == null : value === from;
}

function shouldRetryStatefulClick({ current, from, attempt, maxAttempts }) {
  return Number.isInteger(attempt) && Number.isInteger(maxAttempts)
    && attempt < maxAttempts
    && scenarioStateMatchesFrom(current, from);
}

function formatHitTarget(hit) {
  if (hit == null) return 'unknown element';
  if (typeof hit === 'string') return hit;
  if (hit.id) return `#${hit.id}`;
  const className = typeof hit.className === 'string' && hit.className.trim()
    ? `.${hit.className.trim().split(/\s+/).join('.')}` : '';
  return `${hit.tag ?? 'element'}${className} (${JSON.stringify(hit)})`;
}

module.exports = { MAX_POPUP_RECOVERY_ACTIONS, createVariableScopes, storeScenarioVariable, readScenarioVariable, readStatePath, formatHitTarget, popupDismissalComplete, canFinishClickAfterFinalPopupDismissal, popupChoiceCanBeClicked, popupControlKind, popupControlSelector, canRecoverObstructedClick, shouldInspectPopupForTarget, shouldWaitForObscuringPopup, shouldContinuePopupRecovery, boundsWithinViewport, scrollPositionChanged, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldRestoreScrollContextAfterPopup, intersectVisibleBounds, scenarioStateMatchesFrom, shouldRetryStatefulClick };
