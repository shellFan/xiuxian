'use strict';

function chooseCardBattleAction(state, controls) {
  if (!state || typeof state !== 'object') return { kind: 'unavailable' };
  if (['VICTORY', 'DEFEAT'].includes(state.phase)) return { kind: 'complete' };
  if (state.phase !== 'PLAYER_ACTION') return { kind: 'wait' };
  if (controls.attack) return { kind: 'attack' };
  if (controls.otherCard) return { kind: 'card' };
  if (controls.endTurn) return { kind: 'endTurn' };
  return { kind: 'unavailable' };
}

function cardBattleActionAdvanced(before, after, kind) {
  if (!before || !after) return false;
  if (['VICTORY', 'DEFEAT'].includes(after.phase)) return true;
  if (kind === 'endTurn') return Number(after.turn) > Number(before.turn);
  if (kind === 'attack') return (Array.isArray(after.hitLog) && after.hitLog.length > (before.hitLog?.length ?? 0))
    || (Array.isArray(after.actionLog) && after.actionLog.length > (before.actionLog?.length ?? 0));
  return Array.isArray(after.actionLog) && after.actionLog.length > (before.actionLog?.length ?? 0);
}

function cardBattleControlCandidate(element) {
  return !!element?.found && !!element.visible && !element.disabled;
}

function shouldRetryCardBattleAction({ before, after, kind, control, attempt, maxAttempts = 2 }) {
  if (!Number.isInteger(attempt) || !Number.isInteger(maxAttempts) || attempt >= maxAttempts) return false;
  if (!before || !after || cardBattleActionAdvanced(before, after, kind)) return false;
  if (JSON.stringify(before) !== JSON.stringify(after)) return false;
  return !!control?.found && control.visible === true && control.disabled !== true && control.covered !== true;
}

async function dismissPopupAfterStalledCardAction({ inspectPopup, clickControl, delay, maxAttempts = 3, closePolls = 12 }) {
  const attemptLimit = Math.min(3, Math.max(1, Math.floor(maxAttempts)));
  let popup = await inspectPopup();
  if (popup?.visible !== true) return { status: 'none', attempts: 0, popup };

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const control = popup.control;
    if (!control || typeof control.selector !== 'string' || control.visible !== true || control.disabled === true) {
      return { status: 'unsupported-control', attempts: attempt - 1, popup };
    }
    if (await clickControl(control) !== true) return { status: 'unsupported-control', attempts: attempt, popup };

    for (let poll = 0; poll < closePolls; poll += 1) {
      await delay(100);
      popup = await inspectPopup();
      if (popup?.visible !== true) return { status: 'dismissed', attempts: attempt, popup };
    }
  }
  return { status: 'still-visible', attempts: attemptLimit, popup };
}

async function waitForCardBattleActionTransition({ before, kind, readState, delay, now = Date.now, timeoutMs = 2500, pollIntervalMs = 100 }) {
  const deadline = now() + timeoutMs;
  let state = null;
  let polls = 0;
  while (now() < deadline) {
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - now())));
    state = await readState();
    polls += 1;
    if (cardBattleActionAdvanced(before, state, kind)) return { status: 'advanced', state, polls };
  }
  return { status: 'stalled', state, polls };
}

module.exports = { chooseCardBattleAction, cardBattleActionAdvanced, cardBattleControlCandidate, dismissPopupAfterStalledCardAction, waitForCardBattleActionTransition, shouldRetryCardBattleAction };
