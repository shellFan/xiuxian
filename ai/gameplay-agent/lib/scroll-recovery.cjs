'use strict';

async function dispatchTabKey(session) {
  if (!session || typeof session.send !== 'function') throw new TypeError('Tab recovery requires a CDP session');
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
}

async function tabScrollTargetIntoView({ selector, maxTabSteps = 24, inspectTarget, dispatchTab, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (typeof selector !== 'string' || !selector.trim()) throw new TypeError('scroll recovery requires a target selector');
  if (!Number.isInteger(maxTabSteps) || maxTabSteps < 0 || maxTabSteps > 40) throw new TypeError('maxTabSteps must be an integer from 0 to 40');
  if (typeof inspectTarget !== 'function' || typeof dispatchTab !== 'function') throw new TypeError('scroll recovery requires target inspection and Tab input handlers');

  let target = await inspectTarget(selector);
  let tabSteps = 0;
  const ready = () => target?.found === true && target.visible === true && target.covered !== true && target.disabled !== true;
  while (!ready() && tabSteps < maxTabSteps) {
    if (!target?.found) break;
    await dispatchTab();
    tabSteps += 1;
    await wait(80);
    target = await inspectTarget(selector);
  }
  return { visible: ready(), tabSteps, target };
}

module.exports = { dispatchTabKey, tabScrollTargetIntoView };
