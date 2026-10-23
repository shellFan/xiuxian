'use strict';

async function dismissOptionalControl({ inspect, click, delay, timeoutMs = 3000, maxAttempts = 1 }) {
  if (typeof inspect !== 'function' || typeof click !== 'function' || typeof delay !== 'function') {
    throw new TypeError('optional popup dismissal requires inspect, click and delay functions');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new TypeError('optional popup timeoutMs must be between 1 and 120000');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new TypeError('maxAttempts must be an integer from 1 to 5');

  let target = await inspect();
  if (!target?.found) return { status: 'absent', attempts: [], target };

  const attempts = [];
  const deadline = Date.now() + timeoutMs;
  while (target?.found && attempts.length < maxAttempts && Date.now() < deadline) {
    const before = target;
    const interaction = await click(before);
    attempts.push({ attempt: attempts.length + 1, before, interaction });
    await delay(Math.min(200, Math.max(0, deadline - Date.now())));
    target = await inspect();
  }

  while (target?.found && Date.now() < deadline) {
    await delay(Math.min(100, Math.max(0, deadline - Date.now())));
    target = await inspect();
  }
  if (target?.found) {
    const error = new Error(`optional modal control remained visible after ${attempts.length} bounded real UI choice(s)`);
    error.failureClass = 'GAME_DEFECT';
    error.diagnostics = { attempts, target, timeoutMs, maxAttempts };
    throw error;
  }
  return { status: 'dismissed', attempts, target };
}

module.exports = { dismissOptionalControl };
