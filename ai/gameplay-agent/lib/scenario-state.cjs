'use strict';

const VARIABLE_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
const VARIABLE_PATH = /^@(vars|run)((?:\.[a-zA-Z_$][\w$]*|\[(?:\d+|"[a-zA-Z0-9_:-]+")\])+)$/;
const TYPES = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);

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

function canRecoverObstructedClick(target, popup) {
  return target?.covered === true && popup?.visible === true
    && !!popup.control && popup.control.disabled !== true;
}

function shouldWaitForObscuringPopup(target, popup) {
  return target?.covered === true && popup?.visible !== true;
}

function shouldContinuePopupRecovery(target, popup, attempt, maxAttempts = 3) {
  return attempt < maxAttempts && target?.found === true && target.visible === true
    && target.covered === true && popup?.visible === true;
}

function popupControlKind({ presentationKind, hasCriticalChoice, hasClose, hasAcknowledge }) {
  if (hasCriticalChoice) return 'critical-message-choice';
  if (hasClose) return 'close';
  if (hasAcknowledge) return 'acknowledge';
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

function formatHitTarget(hit) {
  if (hit == null) return 'unknown element';
  if (typeof hit === 'string') return hit;
  if (hit.id) return `#${hit.id}`;
  const className = typeof hit.className === 'string' && hit.className.trim()
    ? `.${hit.className.trim().split(/\s+/).join('.')}` : '';
  return `${hit.tag ?? 'element'}${className} (${JSON.stringify(hit)})`;
}

module.exports = { createVariableScopes, storeScenarioVariable, readScenarioVariable, formatHitTarget, popupDismissalComplete, popupControlKind, canRecoverObstructedClick, shouldWaitForObscuringPopup, shouldContinuePopupRecovery, boundsWithinViewport, scrollPositionChanged, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldRestoreScrollContextAfterPopup, intersectVisibleBounds };
