#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { CdpSession, listenPort } = require('./lib/cdp.cjs');
const { runHomeArena } = require('./lib/home-arena-play.cjs');
const { cleanupIsolatedProfile } = require('./lib/profile-cleanup.cjs');
const { classifyFailure, classifyStepFailure, collectFailedScenarioIds, safeRunId, summarizeResults, validateScenario } = require('./lib/report.cjs');
const { boundsWithinViewport, canFinishClickAfterFinalPopupDismissal, canRecoverObstructedClick, createVariableScopes, formatHitTarget, intersectVisibleBounds, popupChoiceCanBeClicked, popupControlKind, popupControlSelector, popupDismissalComplete, readScenarioVariable, readStatePath, scrollPositionChanged, scrollBoundaryTargetReady, scrollTargetAlreadyVisible, shouldContinuePopupRecovery, shouldRestoreScrollContextAfterPopup, shouldWaitForObscuringPopup, storeScenarioVariable, scenarioStateMatchesFrom } = require('./lib/scenario-state.cjs');

const root = path.resolve(__dirname, '..', '..');
const scenarioDir = path.join(__dirname, 'scenarios');
const reportsDir = path.join(__dirname, 'reports');
const allowedCalls = /^(query[A-Z]\w*|snapshot|startTask|claimTask|completeAssignedTask|tick|tickTasks|claimDailyTask|claimHomeGoal|consumeHomeLife|recordTodayLife|characterCreation\w*|query\w*|devAdvanceTime|devJumpToHour|settleDay|queryCanSettleDay|toggleWorkMode|changeWorkMode|cultivate|save|startBattleRun|chooseBattleSkill|castBattleSkill|clearFinishedBattle|queryFinishedBattle|pauseTask|resumeTask|switchTask)$/;
const identifierPath = /^(?:@[a-z][a-zA-Z0-9]*)?(?:\.[a-zA-Z_$][\w$]*|\[(?:\d+|"[a-zA-Z0-9_:-]+")\])*$/;

function timestampId() {
  const date = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${part(date.getUTCMonth() + 1)}${part(date.getUTCDate())}-${part(date.getUTCHours())}${part(date.getUTCMinutes())}${part(date.getUTCSeconds())}-${crypto.randomBytes(3).toString('hex')}`;
}

function scenarioFiles() {
  return fs.readdirSync(scenarioDir).filter((name) => name.endsWith('.json') && !name.startsWith('_')).sort().map((name) => {
    const scenario = validateScenario(JSON.parse(fs.readFileSync(path.join(scenarioDir, name), 'utf8')));
    if (scenario.setup) {
      if (!/^[a-z0-9-]{1,40}$/.test(scenario.setup)) throw new Error(`invalid setup reference in ${scenario.id}`);
      const setupPath = path.join(scenarioDir, `_${scenario.setup}.json`);
      const setup = validateScenario(JSON.parse(fs.readFileSync(setupPath, 'utf8')));
      scenario.steps = [...setup.steps.map((step) => ({ ...step, __setup: true })), ...scenario.steps];
    }
    return scenario;
  });
}

function findExe() {
  const configured = process.env.GAMEPLAY_AGENT_EXE;
  const exe = configured ? path.resolve(configured) : path.join(root, 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');
  if (!fs.existsSync(exe) || !fs.statSync(exe).isFile()) return null;
  return exe;
}

function getJson(url) {
  return new Promise((resolve, reject) => http.get(url, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
  }).on('error', reject));
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function parsePath(input) {
  if (typeof input !== 'string' || !identifierPath.test(input) || /(?:__proto__|prototype|constructor|window|globalThis|process|require)/i.test(input)) {
    throw new Error(`unsafe state path: ${input}`);
  }
  return input;
}

function literal(value) { return JSON.stringify(value); }

function stateExpression(input) {
  const value = parsePath(input);
  const statePath = value.replace(/^@facade(?=\.|\[)/, '');
  if (value === '@facade') return 'window.__GAME_FACADE__';
  if (value === '@lastResult') return 'window.__GA_LAST__';
  if (value.startsWith('@lastResult.')) return `window.__GA_LAST__${statePath.slice('@lastResult'.length)}`;
  if (value.startsWith('@vars.') || value.startsWith('@run.')) throw new Error('scenario variables are stored by the runner, not in the game page');
  if (value.startsWith('@facade')) return `window.__GAME_FACADE__${statePath}`;
  return `window.__GAME_FACADE__.${statePath.replace(/^\./, '')}`;
}

async function evalJson(cdp, expression) { return cdp.evaluate(`JSON.parse(JSON.stringify(${expression}))`); }

async function getAuthoritativeGameState(cdp) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const state = await evalJson(cdp, 'window.__GAME_FACADE__?.queryRuntimeData?.() ?? window.__GAME_FACADE__?.snapshot?.()');
      if (state && typeof state === 'object') return state;
      lastError = new Error('GameFacade returned no state');
    } catch (error) { lastError = error; }
    if (attempt < 3) await delay(100 * attempt);
  }
  const error = new Error(`NOT_VERIFIED: authoritative game state unavailable after 3 observations: ${lastError?.message ?? 'unknown reason'}`);
  error.failureClass = 'NOT_VERIFIED';
  throw error;
}

async function inspectElement(cdp, selector) {
  const inspected = await cdp.evaluate(`(() => {
    const e=document.querySelector(${literal(selector)});
    if(!e) return {found:false};
    const r=e.getBoundingClientRect(), s=getComputedStyle(e), ancestors=[];
    for(let node=e.parentElement;node;node=node.parentElement){const style=getComputedStyle(node);if(style.overflowX!=='visible'||style.overflowY!=='visible'){const cr=node.getBoundingClientRect();ancestors.push({x:cr.left,y:cr.top,width:cr.width,height:cr.height,overflowX:style.overflowX,overflowY:style.overflowY});}}
    const bounds={x:r.x,y:r.y,width:r.width,height:r.height};
    let left=Math.max(0,bounds.x),top=Math.max(0,bounds.y),right=Math.min(innerWidth,bounds.x+bounds.width),bottom=Math.min(innerHeight,bounds.y+bounds.height);
    for(const clip of ancestors){if(clip.overflowX!=='visible'){left=Math.max(left,clip.x);right=Math.min(right,clip.x+clip.width);}if(clip.overflowY!=='visible'){top=Math.max(top,clip.y);bottom=Math.min(bottom,clip.y+clip.height);}}
    const visibleBounds=right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;
    const point=visibleBounds?{x:visibleBounds.x+visibleBounds.width/2,y:visibleBounds.y+visibleBounds.height/2}:null;
    const x=point?.x??r.left+r.width/2, y=point?.y??r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {found:true, visible:r.width>0&&r.height>0&&!!visibleBounds&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0,
      disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true', bounds:{x:r.x,y:r.y,width:r.width,height:r.height},
      viewport:{width:innerWidth,height:innerHeight}, visibleBounds, clippingAncestors:ancestors, clickPoint:point, covered:!!hit&&hit!==e&&!e.contains(hit), hit:hit?{tag:hit.tagName,id:hit.id||null,className:typeof hit.className==='string'?hit.className:null}:null,
      text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,160)};
  })()`);
  if (inspected.found) {
    inspected.visibleBounds = intersectVisibleBounds(inspected.bounds, inspected.clippingAncestors, inspected.viewport);
    inspected.visible = inspected.visible && !!inspected.visibleBounds;
    if (inspected.visibleBounds) inspected.clickPoint = { x: inspected.visibleBounds.x + inspected.visibleBounds.width / 2, y: inspected.visibleBounds.y + inspected.visibleBounds.height / 2 };
    delete inspected.clippingAncestors;
  }
  return inspected;
}

async function inspectScrollableState(cdp, selector) {
  return evalJson(cdp, `(() => {
    let element=document.querySelector(${literal(selector)});
    if(!element)return null;
    for(let node=element;node;node=node.parentElement){
      const style=getComputedStyle(node),vertical=/^(auto|scroll)$/.test(style.overflowY)&&node.scrollHeight>node.clientHeight,
        horizontal=/^(auto|scroll)$/.test(style.overflowX)&&node.scrollWidth>node.clientWidth;
      if(vertical||horizontal)return {scrollTop:node.scrollTop,scrollLeft:node.scrollLeft,scrollHeight:node.scrollHeight,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,clientWidth:node.clientWidth};
    }
    return null;
  })()`);
}

async function dispatchClick(cdp, item, selector) {
  let target = item;
  let x = target.clickPoint?.x ?? target.bounds.x + target.bounds.width / 2;
  let y = target.clickPoint?.y ?? target.bounds.y + target.bounds.height / 2;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (selector) {
    target = await inspectElement(cdp, selector);
    if (!target.found || !target.visible || target.disabled || target.covered || !boundsWithinViewport(target.bounds, target.viewport)) {
      const error = new Error(`AUTOMATION: click target changed or became obstructed before pointer down: ${selector}`);
      error.failureClass = 'AUTOMATION_DEFECT';
      error.diagnostics = { selector, planned: item, current: target };
      throw error;
    }
    x = target.clickPoint?.x ?? target.bounds.x + target.bounds.width / 2;
    y = target.clickPoint?.y ?? target.bounds.y + target.bounds.height / 2;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }
  const clickCount = item.clickCount ?? 1;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
  return target;
}

async function inspectRandomEventPopup(cdp) {
  const inspected = await evalJson(cdp, `(() => {
    const layer=document.querySelector('#PopupLayer .ux-modal-layer');
    if(!layer)return {visible:false,hasEventBubble:false};
    const bubble=layer.querySelector('.ux-event-bubble');
    const buttons=[...(layer?.querySelectorAll('button')??[])];
    const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
    const records=buttons.map(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),Math.max(0,Math.min(innerHeight-1,r.y+r.height/2))),close=button.classList.contains('ux-close')||button.classList.contains('ux-week-close');return {text:(button.innerText||'').trim(),id:button.id||null,className:typeof button.className==='string'?button.className:null,criticalChoice:button.hasAttribute('data-critical-conv'),close,acknowledge:['知道了','继续'].includes((button.innerText||'').trim()),visible:visible(button),disabled:!!button.disabled,bounds:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},covered:!!hit&&hit!==button&&!button.contains(hit),selector:button.hasAttribute('data-critical-conv')?'[data-critical-conv]':button.classList.contains('ux-week-close')?'.ux-weekly-popup .ux-week-close':button.classList.contains('ux-close')?'.ux-modal-layer .ux-close':null,veventChoice:button.dataset.veventChoice??null,action:button.dataset.action??null,hit:hit?{tag:hit.tagName,id:hit.id||null,className:typeof hit.className==='string'?hit.className:null}:null};});
    return {visible:visible(layer),layerVisible:visible(layer),hasEventBubble:!!bubble,presentationKind:layer?.dataset?.presentationKind??null,buttons:records,layerHtml:layer?.outerHTML?.slice(0,12000)??null};
  })()`);
  if (!inspected.visible) return inspected;
  const controlKind = popupControlKind({
    presentationKind: inspected.presentationKind,
    hasCriticalChoice: inspected.buttons?.some((button) => button.criticalChoice),
    hasClose: inspected.buttons?.some((button) => button.close),
    hasAcknowledge: inspected.buttons?.some((button) => button.acknowledge),
  });
  if (!controlKind) return { ...inspected, control: null };
  const control = inspected.buttons.find((button) => controlKind === 'critical-message-choice' ? button.criticalChoice : controlKind === 'close' ? button.close : button.acknowledge);
  return { ...inspected, control: { ...control, kind: controlKind, selector: popupControlSelector({ kind: controlKind, veventChoice: control.veventChoice, id: control.id }) ?? control.selector } };
}

async function waitForObscuringPopup(cdp, selector, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let target = await inspectElement(cdp, selector);
  let popup = await inspectRandomEventPopup(cdp);
  while (shouldWaitForObscuringPopup(target, popup) && Date.now() < deadline) {
    await delay(100);
    target = await inspectElement(cdp, selector);
    popup = await inspectRandomEventPopup(cdp);
  }
  return { target, popup };
}

async function scrollModalControlIntoView(cdp, selector, maxAttempts = 3) {
  let target;
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    target = await inspectElement(cdp, selector);
    if (target.found && target.visible && !target.disabled && !target.covered && boundsWithinViewport(target.bounds, target.viewport)) {
      return { target, attempts };
    }
    const scrollTarget = await evalJson(cdp, `(() => {
      const element=document.querySelector(${literal(selector)}); if(!element)return null;
      for(let node=element.parentElement;node;node=node.parentElement){
        const style=getComputedStyle(node),vertical=/^(auto|scroll)$/.test(style.overflowY)&&node.scrollHeight>node.clientHeight,
          horizontal=/^(auto|scroll)$/.test(style.overflowX)&&node.scrollWidth>node.clientWidth;
        if(vertical||horizontal){const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:Math.max(1,Math.min(innerHeight-1,r.top+r.height/2)),deltaY:vertical?Math.max(120,Math.min(520,element.getBoundingClientRect().bottom-innerHeight+80)):0,deltaX:horizontal?Math.max(120,Math.min(520,element.getBoundingClientRect().right-innerWidth+80)):0,scrollTop:node.scrollTop,scrollLeft:node.scrollLeft};}
      }
      return null;
    })()`);
    if (!scrollTarget) return { target, attempts };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: scrollTarget.x, y: scrollTarget.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: scrollTarget.x, y: scrollTarget.y, deltaX: scrollTarget.deltaX, deltaY: scrollTarget.deltaY });
    await delay(150);
    attempts.push({ attempt, ...scrollTarget });
  }
  target = await inspectElement(cdp, selector);
  return { target, attempts };
}

async function inputClick(cdp, selector, clickCount = 1, popupChoiceSelector = null) {
  let item = await inspectElement(cdp, selector);
  const dismissedInterruptions = [];
  const dismissalAttempts = [];
  const popupBaseline = item.found && item.visible && item.covered
    ? await collectInteractionDiagnostics(cdp, selector, []) : null;
  const choosePopupControl = async (popup) => {
    if (popup.control && popup.control.disabled !== true && popup.control.selector) {
      const located = await scrollModalControlIntoView(cdp, popup.control.selector);
      if (popupChoiceCanBeClicked(popup, located.target)) {
        return { ...located.target, selector: popup.control.selector, kind: popup.control.kind, scrollAttempts: located.attempts };
      }
      popup.control.scrollAttempts = located.attempts;
    }
    if (!popupChoiceSelector || popup.visible !== true) return null;
    const located = await scrollModalControlIntoView(cdp, popupChoiceSelector);
    return popupChoiceCanBeClicked(popup, located.target)
      ? { ...located.target, selector: popupChoiceSelector, kind: 'scenario-popup-choice', scrollAttempts: located.attempts }
      : null;
  };
  for (let attempt = 1; item.found && item.visible && item.covered && attempt <= 3; attempt++) {
    let popup = await inspectRandomEventPopup(cdp);
    if (shouldWaitForObscuringPopup(item, popup)) {
      const observed = await waitForObscuringPopup(cdp, selector);
      item = observed.target;
      popup = observed.popup;
      if (!item.covered) break;
    }
    if (!popup.visible) break;
    const control = await choosePopupControl(popup);
    if (!control) {
      const error = new Error(`AUTOMATION: a visible modal covers ${selector}, but no scenario-supported interactive choice is available`);
      error.failureClass = 'AUTOMATION_DEFECT';
      try { error.diagnostics = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); } catch (captureError) { error.diagnostics = { beforeAction: popupBaseline, captureError: captureError.message }; }
      throw error;
    }
    const record = { attempt, control, actions: [] };
    try {
      await dispatchClick(cdp, control, control.selector);
      record.actions.push(control.kind === 'critical-message-choice' ? 'CDP pointer choice of the visible critical conversation' : control.kind === 'scenario-popup-choice' ? 'CDP pointer choice of the scenario-declared visible modal option' : 'CDP pointer click');
    } catch (error) {
      record.actions.push(`CDP pointer click error: ${error.message}`);
      record.error = error.message;
      dismissalAttempts.push(record);
      const wrapped = new Error(`AUTOMATION: CDP could not activate the visible modal control: ${error.message}`);
      wrapped.failureClass = 'AUTOMATION_DEFECT';
      wrapped.diagnostics = { beforeAction: popupBaseline, attempts: dismissalAttempts, cause: error.diagnostics ?? null };
      throw wrapped;
    }
    await delay(350);
    const popupAfter = await inspectRandomEventPopup(cdp);
    if (!popupAfter.visible) await delay(350); // let the modal's exit transition stop intercepting real input
    item = await inspectElement(cdp, selector);
    record.popupClosed = !popupAfter.visible;
    record.targetUncovered = !item.covered;
    dismissalAttempts.push(record);
    if (popupDismissalComplete({ closed: record.popupClosed }, { covered: item.covered })) dismissedInterruptions.push(control.kind);
  }
  if (item.found && item.visible && item.covered && dismissalAttempts.length) {
    const error = new Error(`AUTOMATION: failed to dismiss the visible modal after ${dismissalAttempts.length} attempts; blocked click refused: ${selector}`);
    error.failureClass = 'AUTOMATION_DEFECT';
    let afterAction = null;
    try { afterAction = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); } catch (captureError) { afterAction = { error: captureError.message }; }
    error.diagnostics = { beforeAction: popupBaseline, afterAction };
    throw error;
  }
  if (!item.found) {
    const error = new Error(`NOT_VERIFIED: click target not found: ${selector}`);
    error.failureClass = 'NOT_VERIFIED';
    try { error.diagnostics = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); }
    catch (captureError) { error.diagnostics = { selector, target: item, captureError: captureError.message }; }
    throw error;
  }
  if (!item.visible) {
    const error = new Error(`click target is hidden or fully clipped: ${selector}`);
    try { error.diagnostics = { beforeAction: popupBaseline, afterAction: await collectInteractionDiagnostics(cdp, selector, dismissalAttempts) }; }
    catch (captureError) { error.diagnostics = { beforeAction: popupBaseline, captureError: captureError.message }; }
    throw error;
  }
  if (item.disabled) throw new Error(`click target is disabled: ${selector}`);
  if (!boundsWithinViewport(item.bounds, item.viewport)) throw new Error(`click target extends outside the visible window: ${selector}; bounds=${JSON.stringify(item.bounds)} viewport=${JSON.stringify(item.viewport)}`);
  if (item.covered) {
    const error = new Error(`click target is covered by ${formatHitTarget(item.hit)}: ${selector}`);
    try { error.diagnostics = { beforeAction: popupBaseline, afterAction: await collectInteractionDiagnostics(cdp, selector, dismissalAttempts) }; }
    catch (captureError) { error.diagnostics = { selector, interaction: item, beforeAction: popupBaseline, captureError: captureError.message }; }
    throw error;
  }
  for (let attempt = dismissalAttempts.length + 1; attempt <= 3; attempt++) {
    try {
      item = await dispatchClick(cdp, { ...item, clickCount }, selector);
      break;
    } catch (error) {
      const obstructedTarget = error.diagnostics?.current;
      if (obstructedTarget?.covered !== true) throw error;
      const observed = await waitForObscuringPopup(cdp, selector);
      item = observed.target;
      const popup = observed.popup;
      if (!item.covered && item.found && item.visible) {
        item = await dispatchClick(cdp, { ...item, clickCount }, selector);
        break;
      }
      const control = await choosePopupControl(popup);
      const recoverablePopup = control ? { ...popup, control } : popup;
      if (!canRecoverObstructedClick(item, recoverablePopup)) {
        error.diagnostics = { ...error.diagnostics, popup, observedTarget: item };
        throw error;
      }
      const record = { attempt, control, actions: [] };
      try {
        await dispatchClick(cdp, control, control.selector);
        record.actions.push(control.kind === 'critical-message-choice' ? 'CDP pointer choice of the visible critical conversation' : control.kind === 'scenario-popup-choice' ? 'CDP pointer choice of the scenario-declared visible modal option' : 'CDP pointer click');
      } catch (dismissError) {
        record.actions.push(`CDP pointer click error: ${dismissError.message}`);
        record.error = dismissError.message;
        dismissalAttempts.push(record);
        const wrapped = new Error(`AUTOMATION: CDP could not activate the newly appeared modal control: ${dismissError.message}`);
        wrapped.failureClass = 'AUTOMATION_DEFECT';
        wrapped.diagnostics = { selector, attempts: dismissalAttempts, diagnosticCapture: 'renderer became unresponsive during input' };
        throw wrapped;
      }
      await delay(350);
      const popupAfter = await inspectRandomEventPopup(cdp);
      if (!popupAfter.visible) await delay(350);
      item = await inspectElement(cdp, selector);
      record.popupClosed = !popupAfter.visible;
      record.targetUncovered = !item.covered;
      dismissalAttempts.push(record);
      if (!popupDismissalComplete({ closed: record.popupClosed }, { covered: item.covered }) || !item.found || !item.visible) {
        if (shouldContinuePopupRecovery(item, popupAfter, attempt)) continue;
        const wrapped = new Error(`AUTOMATION: failed to resolve a newly appeared modal after ${dismissalAttempts.length} attempts; blocked click refused: ${selector}`);
        wrapped.failureClass = 'AUTOMATION_DEFECT';
        try { wrapped.diagnostics = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); }
        catch (captureError) { wrapped.diagnostics = { selector, attempts: dismissalAttempts, captureError: captureError.message }; }
        throw wrapped;
      }
      dismissedInterruptions.push(control.kind);
      if (canFinishClickAfterFinalPopupDismissal({ popupClosed: record.popupClosed, target: item, attempt, maxAttempts: 3 })) {
        item = await dispatchClick(cdp, { ...item, clickCount }, selector);
        break;
      }
    }
  }
  if (dismissedInterruptions.length) {
    item.dismissedInterruptions = dismissedInterruptions;
    item.dismissalAttempts = dismissalAttempts;
  }
  return item;
}

async function collectInteractionDiagnostics(cdp, selector, attempts) {
  return evalJson(cdp, `(() => {
    const visible = e => { if(!e) return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0; };
    const popup=document.querySelector('#PopupLayer .ux-modal-layer');
    const eventBubble=document.querySelector('#PopupLayer .ux-event-bubble');
    const buttons=[...(popup?.querySelectorAll('button')??[])].map(button=>({text:(button.innerText||'').trim(),id:button.id||null,className:typeof button.className==='string'?button.className:null,html:button.outerHTML.slice(0,1200)}));
    const canvas=document.querySelector('canvas'); const cr=canvas?.getBoundingClientRect();
    const e=document.querySelector(${literal(selector)}); const r=e?.getBoundingClientRect(); const rawCenter=r?{x:r.x+r.width/2,y:r.y+r.height/2}:null; let left=r?Math.max(0,r.left):0,top=r?Math.max(0,r.top):0,right=r?Math.min(innerWidth,r.right):0,bottom=r?Math.min(innerHeight,r.bottom):0; const clippingAncestors=[];
    for(let node=e?.parentElement;node;node=node.parentElement){const style=getComputedStyle(node);if(style.overflowX!=='visible'||style.overflowY!=='visible'){const nr=node.getBoundingClientRect(),clip={tag:node.tagName,id:node.id||null,className:typeof node.className==='string'?node.className:null,overflowX:style.overflowX,overflowY:style.overflowY,rect:{x:nr.x,y:nr.y,width:nr.width,height:nr.height}};clippingAncestors.push(clip);if(style.overflowX!=='visible'){left=Math.max(left,nr.left);right=Math.min(right,nr.right);}if(style.overflowY!=='visible'){top=Math.max(top,nr.top);bottom=Math.min(bottom,nr.bottom);}}}
    const visibleBounds=right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null; const point=visibleBounds?{x:left+(right-left)/2,y:top+(bottom-top)/2}:rawCenter; const hit=point&&document.elementFromPoint(point.x,point.y);
    const ancestors=[]; for(let node=e?.parentElement;node;node=node.parentElement){const style=getComputedStyle(node),nr=node.getBoundingClientRect();if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth||style.overflow!=='visible')ancestors.push({tag:node.tagName,id:node.id||null,className:typeof node.className==='string'?node.className:null,overflowX:style.overflowX,overflowY:style.overflowY,scrollTop:node.scrollTop,scrollLeft:node.scrollLeft,clientWidth:node.clientWidth,clientHeight:node.clientHeight,scrollWidth:node.scrollWidth,scrollHeight:node.scrollHeight,rect:{x:nr.x,y:nr.y,width:nr.width,height:nr.height}});}
    const pageButtons=[...document.querySelectorAll('button')].filter(button=>!popup?.contains(button)&&visible(button)).slice(0,40).map(button=>({text:(button.innerText||'').trim().slice(0,100),action:button.getAttribute('data-action'),nav:button.getAttribute('data-nav'),page:button.getAttribute('data-page')}));
    const headings=[...document.querySelectorAll('h1,h2,.ux-header-title,.ux-page-title')].filter(visible).slice(0,12).map(node=>(node.innerText||'').trim().slice(0,100));
    return {url:location.href,documentTitle:document.title,headings,pageButtons,eventPopup:{visible:visible(eventBubble),hasEventBubble:!!eventBubble,buttons,layerHtml:popup?.outerHTML?.slice(0,12000)??null},
      target:{selector:${literal(selector)},found:!!e,visible:visible(e)&&!!visibleBounds,covered:!!hit&&hit!==e&&!e.contains(hit),point,rawCenterPoint:rawCenter,visibleBounds,hit:hit?{tag:hit.tagName,id:hit.id||null,className:typeof hit.className==='string'?hit.className:null,html:hit.outerHTML?.slice(0,1600)??null}:null,bounds:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,html:e?.outerHTML?.slice(0,4000)??null,clippingAncestors,ancestors},
      canvas:{present:!!canvas,width:canvas?.width??0,height:canvas?.height??0,rect:cr?{x:cr.x,y:cr.y,width:cr.width,height:cr.height}:null},
      attempts:${literal(attempts)},consoleMessages:${literal(cdp.messages.slice(-40))}};
  })()`);
}

async function resolveStatePath(cdp, reference, variables) {
  if (reference.startsWith('@vars.') || reference.startsWith('@run.')) return readScenarioVariable(variables, reference);
  return evalJson(cdp, stateExpression(reference));
}

async function assertStep(cdp, step, variables) {
  const current = step.path ? await resolveStatePath(cdp, step.path, variables) : undefined;
  const expected = typeof step.expected === 'string' && (step.expected.startsWith('@vars.') || step.expected.startsWith('@run.'))
    ? await readScenarioVariable(variables, step.expected)
    : step.expected;
  let passed;
  let detail;
  if (step.check === 'equals') { passed = JSON.stringify(current) === JSON.stringify(expected); detail = `${step.path}: ${JSON.stringify(current)}`; }
  else if (step.check === 'truthy') { passed = !!current; detail = `${step.path}: ${JSON.stringify(current)}`; }
  else if (step.check === 'exists') { passed = current !== undefined && current !== null; detail = `${step.path}: ${passed ? 'exists' : 'missing'}`; }
  else if (step.check === 'gte') { passed = typeof current === 'number' && current >= expected; detail = `${step.path}: ${current} >= ${expected}`; }
  else if (step.check === 'gt') { passed = typeof current === 'number' && current > expected; detail = `${step.path}: ${current} > ${expected}`; }
  else if (step.check === 'lte') { passed = typeof current === 'number' && current <= expected; detail = `${step.path}: ${current} <= ${expected}`; }
  else if (step.check === 'change') {
    const before = await resolveStatePath(cdp, step.from, variables);
    passed = typeof current === 'number' && typeof before === 'number' && current - before === step.expected;
    detail = `${step.path} changed by ${typeof current === 'number' && typeof before === 'number' ? current - before : 'unknown'}; expected ${step.expected}`;
  }
  else if (step.check === 'windowSize') {
    const viewport = await cdp.evaluate('({width:innerWidth,height:innerHeight})');
    passed = viewport.width >= step.minimumWidth && viewport.height >= step.minimumHeight;
    detail = `window content ${viewport.width}×${viewport.height}; minimum ${step.minimumWidth}×${step.minimumHeight}`;
  }
  else {
    const item = await inspectElement(cdp, step.selector);
    if (step.check === 'inBounds') { passed = item.found && item.visible && boundsWithinViewport(item.bounds, item.viewport); detail = `${step.selector}: ${JSON.stringify(item.bounds)} within ${JSON.stringify(item.viewport)}`; }
    else if (step.check === 'clickable') { passed = item.found && item.visible && !item.disabled && boundsWithinViewport(item.bounds, item.viewport); detail = `${step.selector}: ${item.found ? `visible=${item.visible}, disabled=${item.disabled}, inBounds=${boundsWithinViewport(item.bounds, item.viewport)}` : 'missing'}`; }
    else { passed = item.found && item.visible && !item.covered; detail = `${step.selector}: ${item.found ? `covered=${item.covered}, hit=${formatHitTarget(item.hit)}` : 'missing'}`; }
  }
  return { passed: !!passed, detail };
}

async function gracefulClose(session, child) {
  if (session) {
    try {
      await session.evaluate('window.__GAME_FACADE__?.save?.()');
      await session.evaluate('window.electronAPI?.close?.()');
    } catch { /* the renderer may already have closed */ }
    session.close();
  }
  if (!child) return;
  const until = Date.now() + 4000;
  while (Date.now() < until && child.exitCode === null) await delay(100);
  if (child.exitCode === null) {
    await new Promise((resolve) => {
      const proc = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      proc.once('error', resolve);
      proc.once('exit', resolve);
    });
  }
}

async function launchScenario(exe, profile, logPath, screenshotDir) {
  const port = await listenPort();
  const logFd = fs.openSync(logPath, 'a');
  const launchArgs = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--gameplay-agent-test=5911', '--enable-logging'];
  if (process.env.GAMEPLAY_AGENT_DISABLE_GPU === '1') launchArgs.push('--disable-gpu');
  const child = spawn(exe, launchArgs, {
    cwd: path.dirname(exe),
    windowsHide: false,
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  const session = await CdpSession.connect(port);
  await session.send('Page.bringToFront');
  const firstScreenshot = path.join(screenshotDir, 'launch-window.png');
  await session.screenshot(firstScreenshot);
  const waitStartedAt = Date.now();
  const deadline = waitStartedAt + 35000;
  while (Date.now() < deadline) {
    try {
      const ready = await session.evaluate('!!window.__GAME_FACADE__?.queryCharacterCreation');
      if (ready) {
        const bootDiagnostics = await evalJson(session, `(() => { const d=window.__XIUXIAN_BOOT_DIAGNOSTICS__; if(d){d.facadeRegistered=true;d.gameReady=true;d.mark('GAME_FACADE_READY')} return d??null })()`);
        return { child, session, port, readyWaitMs: Date.now() - waitStartedAt, bootDiagnostics };
      }
    } catch { /* wait for Cocos to initialize */ }
    await delay(500);
  }
  let diagnostics = {};
  const timeoutScreenshot = path.join(screenshotDir, 'timeout-window.png');
  try { await session.screenshot(timeoutScreenshot); } catch { /* keep DOM diagnostics if screenshot capture is unavailable */ }
  try {
    diagnostics = await evalJson(session, `(() => {
      const scene = window.cc?.director?.getScene?.();
      const canvas = document.querySelector('canvas');
      let webgl = null;
      try { webgl = !!(canvas?.getContext('webgl2') || canvas?.getContext('webgl')); } catch {}
      const system = window.System;
      return {
        url:location.href,title:document.title,readyState:document.readyState,
        canvas:!!canvas,canvasWidth:canvas?.width??0,canvasHeight:canvas?.height??0,
        webgl,gameDiv:!!document.getElementById('GameDiv'),cocos:!!window.cc,
        engine:{gameInited:window.cc?.game?._inited??null,engineInited:window.cc?.game?._engineInited??null,
          rendererInitialized:window.cc?.game?._rendererInitialized??null,gameConfig:window.cc?.game?.config??null,
          gameKeys:window.cc?.game?Object.keys(window.cc.game).slice(0,80):[],
          directorStarted:window.cc?.director?._scheduler?.isPlaying?.()??null,sceneName:scene?.name??null,
          assetManagerInitialized:window.cc?.assetManager?._initialized??null,
          bundles:window.cc?.assetManager?.bundles?._map?Object.keys(window.cc.assetManager.bundles._map):[]},
        system:{present:!!system,hasIndex:system?.has?.('./index.js')??null,
          importMap:document.querySelector('script[type="systemjs-importmap"]')?.textContent??null,
          registryCount:system?.registry?._registry?Object.keys(system.registry._registry).length:null,
          ccRegistered:!!system?.get?.('cc')},
        bootDiagnostics:window.__XIUXIAN_BOOT_DIAGNOSTICS__??null,
        runnerWait:{status:'WAITING_FOR_GAME_FACADE_TIMED_OUT',waitedMs:Date.now()-${waitStartedAt},readyPredicate:'window.__GAME_FACADE__.queryCharacterCreation'},
        overlay:!!window.__V59F__,facade:!!window.__GAME_FACADE__,
        scripts:[...document.scripts].map((script)=>({src:script.src,loaded:!!script.dataset.loaded})),
        resources:performance.getEntriesByType('resource').slice(-80).map((entry)=>({name:entry.name,duration:Math.round(entry.duration),transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize})),
        consoleErrors:[]
      };
    })()`);
    diagnostics.pendingNetworkRequests = [...session.inflightRequests.values()];
    diagnostics.consoleErrors = session.messages;
  } catch (error) { diagnostics.error = error.message; }
  await gracefulClose(session, child);
  const failure = new Error('EXE opened a GUI window, but the authoritative GameFacade did not become ready within the 35-second boot limit');
  failure.diagnostics = diagnostics;
  failure.screenshot = path.relative(root, timeoutScreenshot).replace(/\\/g, '/');
  throw failure;
}

async function applyStep({ step, context, screenshotDir }) {
  const { session } = context;
  if (['homeArenaPlay', 'homeArenaSoak'].includes(step.action)) return runHomeArena({ step, context, screenshotDir, readFacadeState, inspectElement, inputClick, gracefulClose, launchScenario, delay });
  if (step.action === 'wait') { await delay(Math.max(0, Math.min(step.ms ?? 500, 30000))); return { detail: `${step.ms ?? 500}ms` }; }
  if (step.action === 'clickUntilState') {
    if (!allowedCalls.test(step.method)) throw new Error(`facade call is not allowlisted: ${step.method}`);
    const attempts = [];
    const timeoutMs = step.timeoutMs ?? 1000;
    let lastState;
    for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
      lastState = await readFacadeState(session, step.method);
      let current = readObjectPath(lastState, step.path);
      if (current === step.expected) {
        if (step.as) storeScenarioVariable(context.variables, step.as, lastState, { scope: step.asScope ?? 'scenario', type: step.asType ?? 'object' });
        return { detail: `${step.method}().${step.path} already reached ${JSON.stringify(step.expected)}`, value: lastState };
      }
      if (!scenarioStateMatchesFrom(current, step.from)) {
        const error = new Error(`stateful click refused: ${step.method}().${step.path} was ${JSON.stringify(current)}, expected current state ${JSON.stringify(step.from)}`);
        error.diagnostics = { path: step.path, from: step.from, expected: step.expected, state: lastState, attempts };
        throw error;
      }
      const interaction = await inputClick(session, step.selector, 1, step.popupChoiceSelector ?? null);
      const deadline = Date.now() + timeoutMs;
      do {
        await delay(100);
        lastState = await readFacadeState(session, step.method);
        current = readObjectPath(lastState, step.path);
        attempts.push({ attempt, state: current, interaction });
        if (current === step.expected) {
          if (step.as) storeScenarioVariable(context.variables, step.as, lastState, { scope: step.asScope ?? 'scenario', type: step.asType ?? 'object' });
          return { detail: `${step.method}().${step.path} reached ${JSON.stringify(step.expected)} after ${attempt} real UI click attempt(s)`, value: lastState, element: interaction };
        }
        if (!scenarioStateMatchesFrom(current, step.from)) break;
      } while (Date.now() < deadline);
      if (current !== step.from) break;
    }
    const error = new Error(`stateful UI click did not transition ${step.method}().${step.path} from ${JSON.stringify(step.from)} to ${JSON.stringify(step.expected)} after ${attempts.length} observed attempt(s)`);
    error.diagnostics = { selector: step.selector, path: step.path, from: step.from, expected: step.expected, state: lastState, attempts };
    throw error;
  }
  if (step.action === 'waitFor') {
    const deadline = Date.now() + (step.timeoutMs ?? 10000);
    let item;
    const state = step.state ?? 'visible';
    do {
      item = await inspectElement(session, step.selector);
      const satisfied = state === 'exists' ? item.found : state === 'notExists' ? !item.found
        : state === 'hidden' ? !item.visible : state === 'clickable' ? item.found && item.visible && !item.disabled && !item.covered
          : item.found && item.visible;
      if (satisfied) return { detail: `${step.selector} reached ${state}` };
      if (Date.now() >= deadline) break;
      await delay(100);
    } while (Date.now() < deadline);
    return { passed: false, detail: `waitFor timed out after ${step.timeoutMs ?? 10000}ms: ${step.selector} did not reach ${state}`, element: item };
  }
  if (step.action === 'screenshot') {
    const name = `${String(context.imageCounter++).padStart(3, '0')}-${step.name ?? 'capture'}.png`.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const filePath = path.join(screenshotDir, name);
    try { await session.screenshot(filePath); }
    catch (cause) { const error = new Error(`AUTOMATION: screenshot capture failed: ${cause.message}`); error.failureClass = 'AUTOMATION_DEFECT'; throw error; }
    return { detail: name, evidence: path.relative(context.runDir, filePath).replace(/\\/g, '/') };
  }
  if (step.action === 'getGameState') {
    const state = await getAuthoritativeGameState(session);
    if (step.as) storeScenarioVariable(context.variables, step.as, state, { scope: step.asScope ?? 'scenario', type: step.asType ?? 'object' });
    return { detail: `authoritative GameFacade state${step.as ? ` → ${step.as}` : ''}`, value: state };
  }
  if (step.action === 'assertVisible' || step.action === 'assertClickable') {
    const item = await inspectElement(session, step.selector);
    const passed = step.action === 'assertVisible' ? item.found && item.visible : item.found && item.visible && !item.disabled && !item.covered && boundsWithinViewport(item.bounds, item.viewport);
    return { passed, detail: `${step.selector}: found=${item.found}, visible=${item.visible}, disabled=${item.disabled}, covered=${item.covered}`, ...(step.action === 'assertClickable' ? { element: item } : {}) };
  }
  if (step.action === 'assertState') return assertStep(session, { action: 'assert', ...step }, context.variables);
  if (step.action === 'setViewport') {
    await session.send('Emulation.setDeviceMetricsOverride', { width: step.width, height: step.height, deviceScaleFactor: step.deviceScaleFactor ?? 1, mobile: false });
    return { detail: `CDP content viewport ${step.width}×${step.height} at scale ${step.deviceScaleFactor ?? 1}; outer Windows window size is not asserted` };
  }
  if (step.action === 'assert') return assertStep(session, step, context.variables);
  if (step.action === 'clickIfPresent') {
    let before = await inspectElement(session, step.selector);
    if (!before.found) return { detail: `optional popup control is absent: ${step.selector}` };
    let scrollAttempts = [];
    if (!before.visible || !boundsWithinViewport(before.bounds, before.viewport)) {
      const located = await scrollModalControlIntoView(session, step.selector);
      before = located.target;
      scrollAttempts = located.attempts;
      if (!before.found || !before.visible || before.disabled || before.covered || !boundsWithinViewport(before.bounds, before.viewport)) {
        const error = new Error(`AUTOMATION: optional modal control could not be brought into the visible window: ${step.selector}`);
        error.failureClass = 'AUTOMATION_DEFECT';
        error.diagnostics = { selector: step.selector, target: before, scrollAttempts };
        throw error;
      }
    }
    const item = await inputClick(session, step.selector);
    const deadline = Date.now() + (step.timeoutMs ?? 3000);
    let after = await inspectElement(session, step.selector);
    while (after.found && Date.now() < deadline) { await delay(100); after = await inspectElement(session, step.selector); }
    if (after.found) {
      const error = new Error(`optional modal control did not close its popup: ${step.selector}`);
      error.failureClass = 'GAME_DEFECT';
      error.diagnostics = { selector: step.selector, before, after, timeoutMs: step.timeoutMs ?? 3000 };
      throw error;
    }
    return { detail: `clicked actual modal control and verified it closed: ${step.selector}`, element: item, scrollAttempts };
  }
  if (step.action === 'click' || step.action === 'doubleClick') {
    const item = await inputClick(session, step.selector, step.action === 'doubleClick' ? 2 : 1, step.popupChoiceSelector ?? null);
    return { detail: `${step.action} ${step.selector}`, element: item };
  }
  if (step.action === 'type') {
    await inputClick(session, step.selector);
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await session.send('Input.insertText', { text: String(step.text ?? '') });
    return { detail: `typed ${String(step.text ?? '').length} characters` };
  }
  if (step.action === 'scroll') {
    if (step.ensureVisibleSelector) {
      const requestedTarget = await inspectElement(session, step.ensureVisibleSelector);
      if (scrollTargetAlreadyVisible(requestedTarget)) {
        return { detail: `requested target is already visible and uncovered; skipped scroll: ${step.ensureVisibleSelector}` };
      }
    }
    const target = await inspectElement(session, step.selector);
    if (!target.found && step.optional === true) return { detail: `optional scroll container is absent: ${step.selector}` };
    if (!target.found || !target.visible) throw new Error(`scroll target is not visible: ${step.selector}`);
    let before = await inspectScrollableState(session, step.selector);
    if (!before) {
      const error = new Error(`AUTOMATION: no scrollable ancestor found for ${step.selector}`);
      error.failureClass = 'AUTOMATION_DEFECT';
      throw error;
    }
    const x = target.bounds.x + target.bounds.width / 2;
    const y = target.bounds.y + target.bounds.height / 2;
    const attempts = [];
    const popupRecovery = [];
    let after = before;
    for (let attempt = 1; attempt <= 3 && !scrollPositionChanged(before, after); attempt++) {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: step.deltaX ?? 0, deltaY: step.deltaY ?? 500 });
      const deadline = Date.now() + 700;
      do {
        await delay(20);
        after = await inspectScrollableState(session, step.selector);
      } while (!scrollPositionChanged(before, after) && Date.now() < deadline);
      attempts.push({ attempt, before: attempt === 1 ? before : attempts.at(-1).after, after });
      if (!scrollPositionChanged(before, after)) {
        let popup = await inspectRandomEventPopup(session);
        if (popup.visible) {
          let popupAfter = popup;
          while (popupAfter.visible && popupRecovery.length < 3) {
            if (!popupAfter.control || popupAfter.control.disabled) {
              const error = new Error(`AUTOMATION: a visible modal blocked scrolling ${step.selector}, but no supported interactive choice is available`);
              error.failureClass = 'AUTOMATION_DEFECT';
              error.diagnostics = { selector: step.selector, before, after, popup: popupAfter, popupRecovery, attempts };
              throw error;
            }
            const record = { attempt: popupRecovery.length + 1, control: popupAfter.control, actions: [] };
            try {
              await dispatchClick(session, popupAfter.control, popupAfter.control.selector);
              record.actions.push(popupAfter.control.kind === 'critical-message-choice' ? 'CDP pointer choice of the visible critical conversation' : 'CDP pointer click');
            } catch (error) {
              record.error = error.message;
              popupRecovery.push(record);
              const wrapped = new Error(`AUTOMATION: CDP could not activate the visible modal control before scrolling: ${error.message}`);
              wrapped.failureClass = 'AUTOMATION_DEFECT';
              wrapped.diagnostics = { selector: step.selector, popup: popupAfter, popupRecovery, attempts };
              throw wrapped;
            }
            await delay(350);
            popupAfter = await inspectRandomEventPopup(session);
            if (!popupAfter.visible) await delay(350);
            popupAfter = await inspectRandomEventPopup(session);
            record.popupClosed = !popupAfter.visible;
            popupRecovery.push(record);
          }
          if (popupAfter.visible) {
            const error = new Error(`AUTOMATION: failed to close the visible modal after ${popupRecovery.length} real UI attempts; scroll refused: ${step.selector}`);
            error.failureClass = 'AUTOMATION_DEFECT';
            error.diagnostics = { selector: step.selector, popup, popupAfter, popupRecovery, attempts };
            throw error;
          }
          if (step.ensureVisibleSelector) {
            const reachable = await inspectElement(session, step.ensureVisibleSelector);
            if (scrollTargetAlreadyVisible(reachable)) return { detail: `closed the visible modal through its real control; requested target is now visible: ${step.ensureVisibleSelector}`, popupRecovery };
          }
          after = await inspectScrollableState(session, step.selector);
          if (shouldRestoreScrollContextAfterPopup({ popupClosed: true, scrollContainerFound: !!after })) {
            const recoverySelectors = Array.isArray(step.recoverySelectors) ? step.recoverySelectors : step.recoverySelector ? [step.recoverySelector] : [];
            if (!recoverySelectors.length) {
              const error = new Error(`AUTOMATION: the modal closed but removed ${step.selector}; no recovery navigation is configured`);
              error.failureClass = 'AUTOMATION_DEFECT';
              error.diagnostics = { selector: step.selector, popup, popupRecovery, attempts };
              throw error;
            }
            const routeRestore = { selectors: recoverySelectors, actions: [] };
            for (const recoverySelector of recoverySelectors) {
              const selectorDeadline = Date.now() + 2000;
              let recovery = await inspectElement(session, recoverySelector);
              while (!recovery.found && Date.now() < selectorDeadline) {
                await delay(100);
                recovery = await inspectElement(session, recoverySelector);
              }
              if (!recovery.found || !recovery.visible || recovery.disabled || recovery.covered || !boundsWithinViewport(recovery.bounds, recovery.viewport)) {
                const error = new Error(`AUTOMATION: popup closed but recovery navigation is not safely clickable: ${recoverySelector}`);
                error.failureClass = 'AUTOMATION_DEFECT';
                error.diagnostics = { selector: step.selector, recoverySelector, recovery, routeRestore, popupRecovery, attempts };
                throw error;
              }
              const action = { selector: recoverySelector, control: recovery, action: 'CDP pointer navigation after popup closure' };
              try {
                await dispatchClick(session, recovery, recoverySelector);
                action.completed = true;
                routeRestore.actions.push(action);
                await delay(100);
              } catch (error) {
                action.error = error.message;
                routeRestore.actions.push(action);
                const wrapped = new Error(`AUTOMATION: could not restore the scroll page through ${recoverySelector}: ${error.message}`);
                wrapped.failureClass = 'AUTOMATION_DEFECT';
                wrapped.diagnostics = { selector: step.selector, routeRestore, popupRecovery, attempts };
                throw wrapped;
              }
            }
            const restoreDeadline = Date.now() + 3000;
            let restored = await inspectScrollableState(session, step.selector);
            while (!restored && Date.now() < restoreDeadline) {
              await delay(100);
              restored = await inspectScrollableState(session, step.selector);
            }
            routeRestore.scrollableState = restored;
            popupRecovery.at(-1).routeRestore = routeRestore;
            if (!restored) {
              const error = new Error(`AUTOMATION: recovery navigation did not restore scroll container ${step.selector}`);
              error.failureClass = 'AUTOMATION_DEFECT';
              error.diagnostics = { selector: step.selector, routeRestore, popupRecovery, attempts };
              throw error;
            }
            before = restored;
            after = restored;
            if (step.ensureVisibleSelector) {
              const reachable = await inspectElement(session, step.ensureVisibleSelector);
              if (scrollTargetAlreadyVisible(reachable)) return { detail: `closed the modal, restored the page through ${step.recoverySelector}, and confirmed the target is visible`, popupRecovery };
            }
            attempts.push({ attempt: attempts.length + 1, recovery: 'route-restored', before: restored, after: restored });
            continue;
          }
        }
      }
    }
    if (!scrollPositionChanged(before, after)) {
      if (step.ensureVisibleSelector) {
        const reachable = await inspectElement(session, step.ensureVisibleSelector);
        if (scrollBoundaryTargetReady(false, reachable)) return { detail: `scroll container is already at a boundary; requested target is visible and uncovered: ${step.ensureVisibleSelector}` };
      }
      const error = new Error(`AUTOMATION: wheel input did not change scroll position for ${step.selector}`);
      error.failureClass = 'AUTOMATION_DEFECT';
      error.diagnostics = { selector: step.selector, attempts, popupRecovery, timeoutMsPerAttempt: 700 };
      throw error;
    }
    return { detail: `scrolled ${step.selector} (${before.scrollTop},${before.scrollLeft}) → (${after.scrollTop},${after.scrollLeft}) in ${attempts.length} CDP wheel attempt(s)`, ...(popupRecovery.length ? { popupRecovery } : {}) };
  }
  if (step.action === 'key' || step.action === 'pressKey') {
    const keys = { Enter: ['Enter', 'ENTER', 13], Escape: ['Escape', 'ESC', 27], Tab: ['Tab', 'TAB', 9], ArrowDown: ['ArrowDown', 'DOWN', 40], ArrowUp: ['ArrowUp', 'UP', 38], Space: [' ', 'SPACE', 32] };
    const [key, code, keyCode] = keys[step.key] ?? [step.key, step.key.toUpperCase(), step.keyCode ?? 0];
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    return { detail: `key ${step.key}` };
  }
  if (step.action === 'call') {
    if (!allowedCalls.test(step.method)) throw new Error(`facade call is not allowlisted: ${step.method}`);
    const args = await resolveArguments(session, step.args ?? [], context.variables);
    const result = await readFacadeState(session, step.method, args);
    if (step.as) {
      storeScenarioVariable(context.variables, step.as, result, { scope: step.asScope ?? 'scenario', type: step.asType });
    }
    return { detail: `${step.method}()${step.as ? ` → ${step.as}` : ''}`, value: result };
  }
  if (step.action === 'professionMatrix') {
    const contentPath = path.join(root, 'assets', 'configs', 'professions.json');
    const config = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    const professions = (config.professions ?? []).filter((profession) => !profession.locked);
    const creation = await evalJson(session, 'window.__GAME_FACADE__.queryCharacterCreation()');
    if (creation.status === 'CREATION_REQUIRED' && creation.draft?.step === 'INDUSTRY') {
      await session.evaluate('window.__GAME_FACADE__.characterCreationSelectIndustry("INTERNET");window.__GAME_FACADE__.characterCreationAdvance()');
      await session.evaluate('window.__GAME_FACADE__.characterCreationSelectDirection("TECH_RND");window.__GAME_FACADE__.characterCreationAdvance()');
    }
    const professionStep = await evalJson(session, 'window.__GAME_FACADE__.queryCharacterCreation()');
    if (professionStep.status !== 'CREATION_REQUIRED' || professionStep.draft?.step !== 'PROFESSION') {
      return { passed: false, detail: `character creation is not at profession selection: ${professionStep.status}/${professionStep.draft?.step ?? 'unknown'}` };
    }
    const facadeIds = await evalJson(session, '(window.__GAME_FACADE__.queryProfessions?.() ?? []).map((item)=>item.id)');
    const missing = professions.filter((profession) => !facadeIds.includes(profession.id));
    const selectable = [];
    if (!missing.length) {
      for (const profession of professions) {
        const call = await session.evaluate(`JSON.parse(JSON.stringify(window.__GAME_FACADE__.characterCreationSelectProfession(${literal(profession.id)})))`);
        if (!call.success) throw new Error(`profession ${profession.id} from assets/configs/professions.json is not selectable: ${call.reason ?? 'selection rejected'}`);
        selectable.push(profession.id);
      }
    }
    return { passed: missing.length === 0 && selectable.length === professions.length, detail: missing.length ? `profession UI is missing configured ids: ${missing.map((item) => item.id).join(', ')}` : `profession loop visited ${selectable.join(', ')}`, selectable };
  }
  if (step.action === 'restart' || step.action === 'restartGame') {
    await gracefulClose(session, context.child);
    context.session = null;
    context.child = null;
    const restarted = await launchScenario(context.exe, context.profile, context.logPath, screenshotDir);
    context.child = restarted.child;
    context.session = restarted.session;
    context.bootDiagnostics = restarted.bootDiagnostics;
    context.startupAttempts.push({ readyWaitMs: restarted.readyWaitMs, diagnostics: restarted.bootDiagnostics });
    return { detail: 'closed and relaunched the real EXE with this scenario’s isolated test save' };
  }
  throw new Error(`unsupported action: ${step.action}`);
}

async function readFacadeState(session, method, args = []) {
  const expression = `(async()=>{const f=window.__GAME_FACADE__;if(!f)throw Error('GameFacade unavailable');const r=await f[${literal(method)}](...${literal(args)});const normalized=r===undefined?null:JSON.parse(JSON.stringify(r));window.__GA_LAST__=normalized;return normalized;})()`;
  return session.evaluate(expression);
}

function readObjectPath(value, pathValue) {
  return readStatePath(value, pathValue);
}

async function resolveArguments(session, args, variables) {
  if (!Array.isArray(args)) throw new Error('call args must be an array');
  const resolveOne = async (value) => {
    if (Array.isArray(value)) return Promise.all(value.map(resolveOne));
    if (typeof value === 'string' && value.startsWith('@')) {
      if (!value.startsWith('@vars.') && !value.startsWith('@run.')) throw new Error(`unknown scenario variable reference: ${value}`);
      const resolved = readScenarioVariable(variables, value);
      if (resolved === undefined) throw new Error(`scenario variable is undefined: ${value}`);
      return resolved;
    }
    if (value && typeof value === 'object') throw new Error('nested object arguments are not allowed; pass scalar values or a scenario reference');
    return value;
  };
  return Promise.all(args.map(resolveOne));
}

async function testScenario(scenario, exe, runDir, repairAttempts = {}, runVariables = Object.create(null)) {
  const result = { id: scenario.id, title: scenario.title, status: 'running', startedAt: new Date().toISOString(), steps: [], defects: [] };
  const scenarioDirPath = path.join(runDir, 'scenarios', scenario.id);
  const evidenceDir = path.join(scenarioDirPath, 'evidence');
  const screenshotDir = path.join(evidenceDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-gameplay-agent-'));
  const logPath = path.join(evidenceDir, 'exe.log');
  const context = { runDir, imageCounter: 1, child: null, session: null, exe, profile, logPath, variables: createVariableScopes(), startupAttempts: [] };
  context.variables.run = runVariables;
  let failed = false;
  let blocked = false;
  const operations = [];
  try {
    Object.assign(context, await launchScenario(exe, profile, logPath, screenshotDir));
    context.startupAttempts.push({ readyWaitMs: context.readyWaitMs, diagnostics: context.bootDiagnostics });
    for (const [index, step] of scenario.steps.entries()) {
      const started = Date.now();
      const item = { index: index + 1, action: step.action, description: step.description ?? step.name ?? '', status: 'passed' };
      let viewport = null;
      let beforeState = null;
      let beforeStateError = null;
      if (context.session) {
        try { viewport = await context.session.evaluate('({width:innerWidth,height:innerHeight})'); } catch { /* keep operation trace when renderer is unavailable */ }
        try { beforeState = await evalJson(context.session, 'window.__GAME_FACADE__.queryRuntimeData?.() ?? window.__GAME_FACADE__.snapshot?.()'); } catch (error) { beforeStateError = error.message; }
      }
      try {
        const applied = await applyStep({ step, context, screenshotDir });
        if (applied?.evidence) item.evidence = applied.evidence;
        if (applied?.detail) item.detail = applied.detail;
        if (Object.prototype.hasOwnProperty.call(applied ?? {}, 'value')) item.value = applied.value;
        if (applied?.popupRecovery) item.popupRecovery = applied.popupRecovery;
        if (applied?.element) {
          item.interaction = applied.element;
          if (!applied.element.found || applied.element.covered || !applied.element.visible) {
            item.status = 'failed';
            item.error = `button interaction audit failed: ${JSON.stringify(applied.element)}`;
          }
        }
        if (applied?.passed === false) {
          item.status = 'failed';
          item.error = applied.detail;
          item.failureClass = classifyFailure({ step, error: new Error(applied.detail), isSetup: step.__setup, setupFailureClass: scenario.setupFailureClass });
        }
      } catch (error) {
        item.status = 'failed';
        item.error = error.message;
        if (context.child?.exitCode !== null && context.child?.exitCode !== undefined) {
          item.failureClass = classifyStepFailure({ step, error, isSetup: step.__setup, setupFailureClass: scenario.setupFailureClass, childExitCode: context.child.exitCode });
          item.error = `Game process exited with code ${context.child.exitCode}: ${error.message}`;
        }
        item.failureClass ??= classifyFailure({ step, error, isSetup: step.__setup, setupFailureClass: scenario.setupFailureClass });
        if (error.diagnostics) {
          const diagnosticName = `interaction-step-${String(index + 1).padStart(2, '0')}.json`;
          fs.writeFileSync(path.join(evidenceDir, diagnosticName), `${JSON.stringify(error.diagnostics, null, 2)}\n`);
          item.diagnostics = `scenarios/${scenario.id}/evidence/${diagnosticName}`;
        }
      }
      if (item.status === 'failed') {
        try {
          const screenshotName = `${String(context.imageCounter++).padStart(3, '0')}-failure-step-${String(index + 1).padStart(2, '0')}.png`;
          await context.session.screenshot(path.join(screenshotDir, screenshotName));
          item.evidence = `scenarios/${scenario.id}/evidence/screenshots/${screenshotName}`;
        } catch (error) { item.screenshotError = error.message; }
      }
      item.durationMs = Date.now() - started;
      result.steps.push(item);
      let afterState = null;
      let afterStateError = null;
      if (context.session) {
        try { afterState = await evalJson(context.session, 'window.__GAME_FACADE__.queryRuntimeData?.() ?? window.__GAME_FACADE__.snapshot?.()'); } catch (error) { afterStateError = error.message; }
      }
      operations.push({ index: item.index, action: step.action, replayStep: JSON.parse(JSON.stringify(step)), viewport, target: item.interaction ? { selector: item.interaction.selector, point: item.interaction.clickPoint ?? null, bounds: item.interaction.bounds ?? null } : step.selector ? { selector: step.selector } : null, popupRecovery: item.popupRecovery ?? null, beforeState, beforeStateError, afterState, afterStateError, outcome: item.status, error: item.error ?? null, evidence: item.evidence ?? null, durationMs: item.durationMs });
      if (item.status === 'failed') {
        failed = true;
        result.defects.push({
          id: `${scenario.id}-step-${String(item.index).padStart(2, '0')}`,
          severity: item.failureClass === 'NOT_VERIFIED' ? 'BLOCKER' : 'HIGH', category: item.failureClass, title: item.error,
          reproduction: [`Run npm run gameplay-agent:rerun-failed`, `Scenario: ${scenario.id}`, `Step ${item.index}: ${item.description || item.action}`],
          evidence: item.evidence ?? null,
          screenshot: fs.existsSync(screenshotDir) ? fs.readdirSync(screenshotDir).sort().at(-1) ?? null : null,
          repairAttempts: repairAttempts[`${scenario.id}-step-${String(item.index).padStart(2, '0')}`] ?? 0, maxRepairAttempts: 3,
          diagnostics: item.diagnostics ?? null,
        });
        if (step.__setup) {
          blocked = true;
          for (const [blockedIndex, blockedStep] of scenario.steps.slice(index + 1).entries()) {
            result.steps.push({ index: index + blockedIndex + 2, action: blockedStep.action, description: blockedStep.description ?? '', status: 'blocked', blockedBy: item.index, failureClass: 'SETUP_BLOCKED' });
          }
          break;
        }
        if (scenario.continueOnFailure !== true || step.action === 'restart' || !context.session) break;
      }
    }
    try {
      const snapshot = await evalJson(context.session, 'window.__GAME_FACADE__.queryRuntimeData?.() ?? window.__GAME_FACADE__.snapshot?.()');
      fs.writeFileSync(path.join(evidenceDir, 'authoritative-state.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
      result.authoritativeState = path.relative(runDir, path.join(evidenceDir, 'authoritative-state.json')).replace(/\\/g, '/');
    } catch (error) { result.stateSnapshotError = error.message; }
    result.consoleExceptions = context.session?.messages ?? [];
    result.startupAttempts = context.startupAttempts;
    result.bootDiagnostics = context.bootDiagnostics ?? null;
    const homeStep = operations.find((operation) => /\.ux59f-(?:work|life-card)/.test(operation.target?.selector ?? '') && operation.outcome === 'passed');
    const taskStep = operations.find((operation) => /task|任务/i.test(operation.replayStep.description ?? '') && operation.outcome === 'passed');
    const incomeStep = operations.find((operation) => Number(operation.afterState?.salary) > 0);
    result.experienceMetrics = {
      firstPlayableHomeStep: homeStep?.index ?? null,
      firstTaskInteractionStep: taskStep?.index ?? null,
      firstPositiveWalletStep: incomeStep?.index ?? null,
      successfulInputOperations: operations.filter((operation) => ['click', 'doubleClick', 'type', 'pressKey', 'key', 'scroll'].includes(operation.action) && operation.outcome === 'passed').length,
      blockedSteps: result.steps.filter((step) => step.status === 'blocked').length,
      thresholdsApplied: false,
    };
    const exeLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    result.execution = { electronWindow: exeLog.includes('[Electron] Window shown') ? 'visible' : 'not-confirmed', input: 'CDP synthetic input', screenshotSource: 'CDP renderer surface', platform: process.platform };
    result.execution.validationModes = { UI_REAL_EXE: 'NOT_VERIFIED', ELECTRON_E2E: blocked ? 'BLOCKED' : failed ? 'FAILED' : 'PASS', SERVICE_SIM: 'NOT_RUN', NOT_VERIFIED: ['physical Windows pointer/keyboard verification', 'outer window-size matrix'] };
    if (result.consoleExceptions.length && !failed) {
      failed = true;
      result.defects.push({ id: `${scenario.id}-renderer-exception`, severity: 'HIGH', title: 'Renderer exception during scenario', reproduction: [`Run npm run gameplay-agent:rerun-failed`, `Scenario: ${scenario.id}`], details: result.consoleExceptions, repairAttempts: repairAttempts[`${scenario.id}-renderer-exception`] ?? 0, maxRepairAttempts: 3 });
    }
  } catch (error) {
    failed = true;
    result.error = error.message;
    if (error.diagnostics) fs.writeFileSync(path.join(evidenceDir, 'launch-diagnostics.json'), `${JSON.stringify(error.diagnostics, null, 2)}\n`);
    if (error.screenshot) result.startupScreenshot = error.screenshot;
    const failureClass = classifyFailure({ error, launchFailure: true });
    result.defects.push({ id: `${scenario.id}-launch`, severity: failureClass === 'NOT_VERIFIED' ? 'BLOCKER' : 'HIGH', category: failureClass, title: error.message, reproduction: [`Run npm run gameplay-agent:rerun-failed`, `Scenario: ${scenario.id}`, 'EXE was launched with a new isolated user-data directory.'], evidence: error.screenshot ? `./${error.screenshot}` : null, diagnostics: error.diagnostics ?? null, repairAttempts: repairAttempts[`${scenario.id}-launch`] ?? 0, maxRepairAttempts: 3 });
  } finally {
    await gracefulClose(context.session, context.child);
    result.profileCleanup = await cleanupIsolatedProfile(profile);
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
    result.status = blocked ? 'blocked' : failed ? 'failed' : 'passed';
    fs.writeFileSync(path.join(scenarioDirPath, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(path.join(scenarioDirPath, 'replay.json'), `${JSON.stringify({ schemaVersion: 1, scenarioId: scenario.id, sourceScenario: scenario, operations, replay: { command: 'npm run gameplay-agent:test -- --scenario=' + scenario.id, exactStepInputs: true, usesFreshIsolatedProfile: true } }, null, 2)}\n`);
  }
  return result;
}

function loadLatestReport() {
  if (!fs.existsSync(reportsDir)) return null;
  const reportDirs = fs.readdirSync(reportsDir, { withFileTypes: true }).filter((item) => item.isDirectory() && safeRunId(item.name)).map((item) => item.name).sort().reverse();
  for (const id of reportDirs) {
    const reportFile = path.join(reportsDir, id, 'report.json');
    if (fs.existsSync(reportFile)) return { id, path: reportFile, report: JSON.parse(fs.readFileSync(reportFile, 'utf8')) };
  }
  return null;
}

function writeReport(report, runDir) {
  report.summary = summarizeResults(report.scenarios);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const defects = report.scenarios.flatMap((scenario) => scenario.defects ?? []);
  fs.writeFileSync(path.join(runDir, 'defects.json'), `${JSON.stringify({ runId: report.runId, status: report.summary.status, defects }, null, 2)}\n`);
  const sceneLines = report.scenarios.map((scenario) => `| ${scenario.id} | ${scenario.status} | ${(scenario.steps ?? []).filter((step) => step.status === 'failed').length} |`).join('\n');
  const defectLines = defects.length ? defects.map((defect) => `- **${defect.severity} ${defect.category ?? 'UNCLASSIFIED'} ${defect.id}:** ${defect.title}${defect.evidence ? ` ([证据](./${defect.evidence}))` : ''}; 修复尝试 ${defect.repairAttempts}/${defect.maxRepairAttempts}`).join('\n') : '- 没有发现缺陷。';
    fs.writeFileSync(path.join(runDir, 'summary.md'), `# GamePlay Agent ${report.runId}\n\n状态：**${report.summary.status}**\n\n- EXE：\`${report.exe ?? '不可用'}\`\n- EXE SHA-256：\`${report.exeSha256 ?? '未运行'}\`\n- ASAR SHA-256：\`${report.asarSha256 ?? '未找到'}\`\n- Build SHA：\`${report.buildSha ?? '未找到'}\`\n- UI_REAL_EXE：\`${report.validationModes?.UI_REAL_EXE ?? 'NOT_VERIFIED'}\`；ELECTRON_E2E：\`${report.validationModes?.ELECTRON_E2E ?? 'NOT_VERIFIED'}\`；SERVICE_SIM：\`${report.validationModes?.SERVICE_SIM ?? 'NOT_VERIFIED'}\`\n- 隔离存档：每场景使用独立临时目录；结束后重试清理。仍被系统占用时会记录 deferred 状态，不阻断证据报告。\n- 场景：${report.summary.passed}/${report.summary.total} 通过；${report.summary.failed} 失败；${report.summary.blocked ?? 0} 前置阻塞；${report.summary.notVerified} 未验证。\n- GUI：输入为 CDP 合成事件，截图为 renderer 表面捕获，不计为物理 Windows UI 输入。每个场景另存 replay.json，包含操作、窗口内容尺寸、前后状态与证据路径。\n\n| 场景 | 状态 | 失败步骤 |\n|---|---|---:|\n${sceneLines}\n\n## 缺陷\n\n${defectLines}\n\n## 自动复测\n\n缺陷修复由 Codex Developer 修改代码。将缺陷修复轮次保留在缺陷报告中；单缺陷上限三轮，超过后状态设为 ESCALATED。复跑本次失败场景：\`npm run gameplay-agent:rerun-failed\`。\n`);
  return report.summary;
}

function fileSha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function buildMetadata(exe) {
  const asar = exe ? path.join(path.dirname(exe), 'resources', 'app.asar') : null;
  const manifestPath = path.join(root, 'desktop', 'build', 'web-desktop', '.xiuxian-build-manifest.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* no fresh desktop build manifest */ }
  let buildFresh = false;
  try { buildFresh = !require(path.join(root, 'scripts', 'build-manifest.cjs')).verifyManifest().stale; } catch { /* manifest absent or malformed */ }
  let sourceSha = 'unknown';
  try { sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown'; } catch { /* report unknown provenance */ }
  return { sourceSha, asarSha256: asar && fs.existsSync(asar) ? fileSha256(asar) : null, buildSha: manifest?.inputsHash ?? null, buildGitHead: manifest?.gitHead ?? null, buildFresh };
}

function latestRepairAttempts(report) {
  const attempts = {};
  for (const scenario of report?.scenarios ?? []) {
    for (const defect of scenario.defects ?? []) {
      attempts[defect.id] = Math.max(attempts[defect.id] ?? 0, defect.repairAttempts ?? 0);
    }
  }
  return attempts;
}

async function run(mode, selectedIds, repairAttempts = {}) {
  const scenes = scenarioFiles();
  const allIds = new Set(scenes.map((scenario) => scenario.id));
  if (selectedIds) {
    for (const id of selectedIds) if (!allIds.has(id)) throw new Error(`report references unknown scenario: ${id}`);
  }
  const chosen = selectedIds ? scenes.filter((scenario) => selectedIds.includes(scenario.id)) : scenes;
  const runId = timestampId();
  const runDir = path.join(reportsDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const exe = findExe();
  const metadata = buildMetadata(exe);
  const report = { schemaVersion: 2, runId, mode, startedAt: new Date().toISOString(), host: { platform: process.platform, node: process.version }, sourceSha: metadata.sourceSha, buildSha: metadata.buildSha, buildGitHead: metadata.buildGitHead, buildFresh: metadata.buildFresh, interactionMode: process.platform === 'win32' ? 'Electron window with localhost CDP synthetic input' : 'no Windows GUI; real EXE test not verified', screenshotMode: 'Chromium renderer capture through CDP', validationModes: { UI_REAL_EXE: 'NOT_VERIFIED', ELECTRON_E2E: exe ? 'PENDING' : 'NOT_VERIFIED', BUILD_PROVENANCE: metadata.buildFresh ? 'FRESH' : 'NOT_VERIFIED', SERVICE_SIM: 'PENDING', NOT_VERIFIED: ['physical Windows pointer/keyboard verification', 'outer window-size matrix'] }, exe, asarSha256: metadata.asarSha256, repairAttempts, scenarios: [] };
  if (!exe) {
    report.scenarios = chosen.map((scenario) => ({ id: scenario.id, title: scenario.title, status: 'not_verified', steps: [], defects: [], error: 'Windows test EXE not found; set GAMEPLAY_AGENT_EXE or package the game.' }));
  } else {
    report.exeSha256 = fileSha256(exe);
    const runVariables = Object.create(null);
    for (const scenario of chosen) {
      process.stdout.write(`[GamePlay Agent] ${scenario.id}: ${scenario.title}\n`);
      const result = await testScenario(scenario, exe, runDir, repairAttempts, runVariables);
      report.scenarios.push(result);
      process.stdout.write(`[${result.status.toUpperCase()}] ${scenario.id}${result.error ? ` — ${result.error}` : ''}\n`);
    }
  }
  report.validationModes.ELECTRON_E2E = !exe ? 'NOT_VERIFIED' : report.scenarios.every((scenario) => scenario.status === 'passed') ? 'PASS' : report.scenarios.some((scenario) => scenario.status === 'failed') ? 'FAILED' : 'BLOCKED';
  report.validationModes.SERVICE_SIM = mode === 'gate' ? 'PENDING' : 'NOT_RUN';
  const summary = writeReport(report, runDir);
  process.stdout.write(`\n[GamePlay Agent] ${summary.status}: ${summary.passed}/${summary.total} passed; ${summary.failed} failed; ${summary.notVerified} not verified\nReport: ${path.relative(root, path.join(runDir, 'summary.md'))}\n`);
  return summary;
}

function executeNpm(script) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  process.stdout.write(`\n[gate] ${command} run ${script}\n`);
  const result = spawnSync(command, ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  return { command: `npm run ${script}`, status: result.status, error: result.error?.message ?? null };
}

async function gate() {
  const checks = ['release:check', 'pc:build', 'pc:pack', 'pc:check'];
  const commands = [];
  let buildPassed = true;
  for (const script of checks) {
    const result = executeNpm(script);
    commands.push(result);
    if (result.status !== 0) { buildPassed = false; break; }
  }
  if (!buildPassed) {
    const scenarios = scenarioFiles().map((scenario) => ({ id: scenario.id, title: scenario.title, status: 'not_verified', steps: [], defects: [], error: 'Full tests/build/package gate did not complete; the packaged EXE was not tested.' }));
    const runId = timestampId();
    const runDir = path.join(reportsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    const report = { schemaVersion: 1, runId, mode: 'gate', startedAt: new Date().toISOString(), host: { platform: process.platform, node: process.version }, exe: findExe(), gateCommands: commands, scenarios, scenariosSkipped: true };
    const summary = writeReport(report, runDir);
    process.stderr.write(`\n[GamePlay Agent] Gate failed; EXE tests are NOT_VERIFIED. Report: ${path.relative(root, path.join(runDir, 'summary.md'))}\n`);
    return { ...summary, status: 'FAILED' };
  }
  const result = await run('gate', null);
  const latest = loadLatestReport();
  if (latest) {
    latest.report.gateCommands = commands;
    latest.report.validationModes.SERVICE_SIM = commands.find((command) => command.command === 'npm run release:check')?.status === 0 ? 'PASS' : 'FAILED';
    writeReport(latest.report, path.dirname(latest.path));
  }
  return result;
}

function printLatestReport() {
  const latest = loadLatestReport();
  if (!latest) throw new Error('No saved GamePlay Agent reports found');
  process.stdout.write(`${JSON.stringify({ runId: latest.id, path: path.relative(root, latest.path), summary: latest.report.summary, scenarios: latest.report.scenarios.map(({ id, status, defects = [] }) => ({ id, status, defects })) }, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2];
  const scenarioArgument = process.argv.slice(3).find((argument) => argument.startsWith('--scenario='));
  const requestedScenarioIds = scenarioArgument ? scenarioArgument.slice('--scenario='.length).split(',').filter(Boolean) : null;
  if (!['smoke', 'test', 'report', 'rerun-failed', 'gate'].includes(command)) {
    throw new Error('Usage: node ai/gameplay-agent/index.cjs <smoke|test|report|rerun-failed|gate>');
  }
  if (command === 'report') { printLatestReport(); return; }
  if (command === 'rerun-failed') {
    const latest = loadLatestReport();
    const failedIds = collectFailedScenarioIds(latest?.report);
    if (!failedIds.length) throw new Error('The most recent run has no failed scenarios to rerun');
    const attempts = latestRepairAttempts(latest.report);
    const exhausted = (latest.report.scenarios ?? []).flatMap((scenario) => scenario.defects ?? [])
      .filter((defect) => failedIds.some((id) => defect.id.startsWith(`${id}-`)) && (attempts[defect.id] ?? 0) >= 3);
    if (exhausted.length) {
      const escalation = { runId: timestampId(), status: 'ESCALATED', createdAt: new Date().toISOString(), limit: 3, exhaustedDefects: exhausted.map((defect) => ({ id: defect.id, title: defect.title, attempts: attempts[defect.id], reproduction: defect.reproduction })) };
      fs.mkdirSync(reportsDir, { recursive: true });
      const escalationPath = path.join(reportsDir, `ESCALATED-${escalation.runId}.json`);
      fs.writeFileSync(escalationPath, `${JSON.stringify(escalation, null, 2)}\n`);
      process.stderr.write(`[GamePlay Agent] ESCALATED: ${exhausted.map((defect) => defect.id).join(', ')} reached the three-repair limit. See ${path.relative(root, escalationPath)}.\n`);
      process.exitCode = 1;
      return;
    }
    for (const scenario of latest.report.scenarios ?? []) {
      if (!failedIds.includes(scenario.id)) continue;
      for (const defect of scenario.defects ?? []) attempts[defect.id] = (attempts[defect.id] ?? 0) + 1;
    }
    const summary = await run('rerun-failed', failedIds, attempts);
    if (summary.status !== 'PASS') process.exitCode = 1;
    return;
  }
  if (command === 'gate') {
    const summary = await gate();
    if (summary.status !== 'PASS') process.exitCode = 1;
    return;
  }
  const selectedIds = requestedScenarioIds ?? (command === 'smoke' ? ['smoke'] : null);
  const summary = await run(command, selectedIds);
  if (summary.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`[GamePlay Agent] ERROR: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
