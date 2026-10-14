#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { CdpSession, listenPort } = require('./lib/cdp.cjs');
const { classifyFailure, collectFailedScenarioIds, safeRunId, summarizeResults, validateScenario } = require('./lib/report.cjs');
const { boundsWithinViewport, createVariableScopes, formatHitTarget, intersectVisibleBounds, popupDismissalComplete, readScenarioVariable, scrollPositionChanged, storeScenarioVariable } = require('./lib/scenario-state.cjs');

const root = path.resolve(__dirname, '..', '..');
const scenarioDir = path.join(__dirname, 'scenarios');
const reportsDir = path.join(__dirname, 'reports');
const allowedCalls = /^(query[A-Z]\w*|snapshot|startTask|claimTask|completeAssignedTask|tick|tickTasks|claimDailyTask|claimHomeGoal|consumeHomeLife|recordTodayLife|characterCreation\w*|query\w*|devAdvanceTime|devJumpToHour|settleDay|queryCanSettleDay|toggleWorkMode|changeWorkMode|cultivate|save|startBattleRun|chooseBattleSkill|castBattleSkill|clearFinishedBattle|queryFinishedBattle|pauseTask|resumeTask|switchTask)$/;
const identifierPath = /^(?:@[a-z][a-zA-Z0-9]*)?(?:\.[a-zA-Z_$][\w$]*|\[(?:\d+|"[a-zA-Z0-9_-]+")\])*$/;

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

async function dispatchClick(cdp, item) {
  const x = item.clickPoint?.x ?? item.bounds.x + item.bounds.width / 2;
  const y = item.clickPoint?.y ?? item.bounds.y + item.bounds.height / 2;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function inspectRandomEventPopup(cdp) {
  return evalJson(cdp, `(() => {
    const bubble=document.querySelector('#PopupLayer .ux-event-bubble');
    if(!bubble)return {visible:false};
    const layer=bubble.closest('.ux-modal-layer');
    const buttons=[...(layer?.querySelectorAll('button')??[])];
    const close=buttons.find(button=>button.classList.contains('ux-close'));
    const acknowledge=buttons.find(button=>['知道了','继续'].includes((button.innerText||'').trim()));
    const control=close||acknowledge;
    const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
    if(!control)return {visible:visible(layer),hasEventBubble:true,control:null,layerHtml:layer?.outerHTML?.slice(0,12000)??null};
    const r=control.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    const controlHit=!!hit&&(hit===control||control.contains(hit));
    return {visible:visible(layer)||controlHit,layerVisible:visible(layer),controlHit,hasEventBubble:true,control:{kind:control===close?'close':'acknowledge',text:(control.innerText||'').trim(),disabled:!!control.disabled,bounds:{x:r.x,y:r.y,width:r.width,height:r.height},covered:!!hit&&hit!==control&&!control.contains(hit),hit:hit?{tag:hit.tagName,id:hit.id||null,className:typeof hit.className==='string'?hit.className:null}:null},layerHtml:layer?.outerHTML?.slice(0,12000)??null};
  })()`);
}

async function inputClick(cdp, selector) {
  let item = await inspectElement(cdp, selector);
  const dismissedInterruptions = [];
  const dismissalAttempts = [];
  const popupBaseline = item.found && item.visible && item.covered
    ? await collectInteractionDiagnostics(cdp, selector, []) : null;
  for (let attempt = 1; item.found && item.visible && item.covered && attempt <= 3; attempt++) {
    const popup = await inspectRandomEventPopup(cdp);
    if (!popup.visible) break;
    if (!popup.control || popup.control.disabled) {
      const error = new Error(`AUTOMATION: a visible modal covers ${selector}, but no supported event dismissal button is available`);
      error.failureClass = 'AUTOMATION_DEFECT';
      try { error.diagnostics = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); } catch (captureError) { error.diagnostics = { beforeAction: popupBaseline, captureError: captureError.message }; }
      throw error;
    }
    const record = { attempt, control: popup.control, actions: [] };
    try {
      await dispatchClick(cdp, popup.control);
      record.actions.push('CDP pointer click');
    } catch (error) {
      record.actions.push(`CDP pointer click error: ${error.message}`);
      record.error = error.message;
      dismissalAttempts.push(record);
      const wrapped = new Error(`AUTOMATION: CDP could not activate the visible random-event close control: ${error.message}`);
      wrapped.failureClass = 'AUTOMATION_DEFECT';
      wrapped.diagnostics = { beforeAction: popupBaseline, attempts: dismissalAttempts, diagnosticCapture: 'renderer became unresponsive during input' };
      throw wrapped;
    }
    await delay(350);
    const popupAfter = await inspectRandomEventPopup(cdp);
    if (!popupAfter.visible) await delay(350); // let the modal's exit transition stop intercepting real input
    item = await inspectElement(cdp, selector);
    record.popupClosed = !popupAfter.visible;
    record.targetUncovered = !item.covered;
    dismissalAttempts.push(record);
    if (popupDismissalComplete({ closed: record.popupClosed }, { covered: item.covered })) dismissedInterruptions.push(popup.control.kind);
  }
  if (item.found && item.visible && item.covered && dismissalAttempts.length) {
    const error = new Error(`AUTOMATION: failed to dismiss the visible random-event popup after ${dismissalAttempts.length} attempts; blocked click refused: ${selector}`);
    error.failureClass = 'AUTOMATION_DEFECT';
    let afterAction = null;
    try { afterAction = await collectInteractionDiagnostics(cdp, selector, dismissalAttempts); } catch (captureError) { afterAction = { error: captureError.message }; }
    error.diagnostics = { beforeAction: popupBaseline, afterAction };
    throw error;
  }
  if (!item.found) throw new Error(`click target not found: ${selector}`);
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
  await dispatchClick(cdp, item);
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
    return {url:location.href,eventPopup:{visible:visible(eventBubble),hasEventBubble:!!eventBubble,buttons,layerHtml:popup?.outerHTML?.slice(0,12000)??null},
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
  const launchArgs = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--enable-logging'];
  if (process.env.GAMEPLAY_AGENT_DISABLE_GPU === '1') launchArgs.push('--disable-gpu');
  const child = spawn(exe, launchArgs, {
    cwd: path.dirname(exe),
    windowsHide: false,
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  const session = await CdpSession.connect(port);
  const firstScreenshot = path.join(screenshotDir, 'launch-window.png');
  await session.screenshot(firstScreenshot);
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    try {
      const ready = await session.evaluate('!!window.__GAME_FACADE__?.queryCharacterCreation');
      if (ready) return { child, session, port };
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
  if (step.action === 'wait') { await delay(Math.max(0, Math.min(step.ms ?? 500, 30000))); return { detail: `${step.ms ?? 500}ms` }; }
  if (step.action === 'screenshot') {
    const name = `${String(context.imageCounter++).padStart(3, '0')}-${step.name ?? 'capture'}.png`.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const filePath = path.join(screenshotDir, name);
    await session.screenshot(filePath);
    return { detail: name, evidence: path.relative(context.runDir, filePath).replace(/\\/g, '/') };
  }
  if (step.action === 'assert') return assertStep(session, step, context.variables);
  if (step.action === 'click') return { detail: `input click ${step.selector}`, element: await inputClick(session, step.selector) };
  if (step.action === 'type') {
    await inputClick(session, step.selector);
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await session.send('Input.insertText', { text: String(step.text ?? '') });
    return { detail: `typed ${String(step.text ?? '').length} characters` };
  }
  if (step.action === 'scroll') {
    const target = await inspectElement(session, step.selector);
    if (!target.found || !target.visible) throw new Error(`scroll target is not visible: ${step.selector}`);
    const before = await inspectScrollableState(session, step.selector);
    if (!before) {
      const error = new Error(`AUTOMATION: no scrollable ancestor found for ${step.selector}`);
      error.failureClass = 'AUTOMATION_DEFECT';
      throw error;
    }
    const x = target.bounds.x + target.bounds.width / 2;
    const y = target.bounds.y + target.bounds.height / 2;
    const attempts = [];
    let after = before;
    for (let attempt = 1; attempt <= 3 && !scrollPositionChanged(before, after); attempt++) {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: step.deltaX ?? 0, deltaY: step.deltaY ?? 500 });
      const deadline = Date.now() + 700;
      do {
        await delay(20);
        after = await inspectScrollableState(session, step.selector);
      } while (!scrollPositionChanged(before, after) && Date.now() < deadline);
      attempts.push({ attempt, before: attempt === 1 ? before : attempts.at(-1).after, after });
    }
    if (!scrollPositionChanged(before, after)) {
      const error = new Error(`AUTOMATION: wheel input did not change scroll position for ${step.selector}`);
      error.failureClass = 'AUTOMATION_DEFECT';
      error.diagnostics = { selector: step.selector, attempts, timeoutMsPerAttempt: 700 };
      throw error;
    }
    return { detail: `scrolled ${step.selector} (${before.scrollTop},${before.scrollLeft}) → (${after.scrollTop},${after.scrollLeft}) in ${attempts.length} CDP wheel attempt(s)` };
  }
  if (step.action === 'key') {
    const keys = { Enter: ['Enter', 'ENTER', 13], Escape: ['Escape', 'ESC', 27], Tab: ['Tab', 'TAB', 9], ArrowDown: ['ArrowDown', 'DOWN', 40], ArrowUp: ['ArrowUp', 'UP', 38], Space: [' ', 'SPACE', 32] };
    const [key, code, keyCode] = keys[step.key] ?? [step.key, step.key.toUpperCase(), step.keyCode ?? 0];
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    return { detail: `key ${step.key}` };
  }
  if (step.action === 'call') {
    if (!allowedCalls.test(step.method)) throw new Error(`facade call is not allowlisted: ${step.method}`);
    const args = await resolveArguments(session, step.args ?? [], context.variables);
    const expression = `(async()=>{const f=window.__GAME_FACADE__;if(!f)throw Error('GameFacade unavailable');const r=await f[${literal(step.method)}](...${literal(args)});const normalized=r===undefined?null:JSON.parse(JSON.stringify(r));window.__GA_LAST__=normalized;return normalized;})()`;
    const result = await session.evaluate(expression);
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
  if (step.action === 'restart') {
    await gracefulClose(session, context.child);
    context.session = null;
    context.child = null;
    const restarted = await launchScenario(context.exe, context.profile, context.logPath, screenshotDir);
    context.child = restarted.child;
    context.session = restarted.session;
    return { detail: 'closed and relaunched the real EXE with this scenario’s isolated test save' };
  }
  throw new Error(`unsupported action: ${step.action}`);
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
  const context = { runDir, imageCounter: 1, child: null, session: null, exe, profile, logPath, variables: createVariableScopes() };
  context.variables.run = runVariables;
  let failed = false;
  let blocked = false;
  try {
    Object.assign(context, await launchScenario(exe, profile, logPath, screenshotDir));
    for (const [index, step] of scenario.steps.entries()) {
      const started = Date.now();
      const item = { index: index + 1, action: step.action, description: step.description ?? step.name ?? '', status: 'passed' };
      try {
        const applied = await applyStep({ step, context, screenshotDir });
        if (applied?.evidence) item.evidence = applied.evidence;
        if (applied?.detail) item.detail = applied.detail;
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
        item.failureClass = classifyFailure({ step, error, isSetup: step.__setup, setupFailureClass: scenario.setupFailureClass });
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
    const exeLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    result.execution = { electronWindow: exeLog.includes('[Electron] Window shown') ? 'visible' : 'not-confirmed', input: 'CDP synthetic input', screenshotSource: 'CDP renderer surface', platform: process.platform };
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
    fs.rmSync(profile, { recursive: true, force: true });
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
    result.status = blocked ? 'blocked' : failed ? 'failed' : 'passed';
    fs.writeFileSync(path.join(scenarioDirPath, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
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
  fs.writeFileSync(path.join(runDir, 'summary.md'), `# GamePlay Agent ${report.runId}\n\n状态：**${report.summary.status}**\n\n- EXE：\`${report.exe ?? '不可用'}\`\n- EXE SHA-256：\`${report.exeSha256 ?? '未运行'}\`\n- 隔离存档：每场景使用独立临时目录；测试结束后移除。\n- 场景：${report.summary.passed}/${report.summary.total} 通过；${report.summary.failed} 失败；${report.summary.blocked ?? 0} 前置阻塞；${report.summary.notVerified} 未验证。\n- GUI：每个场景在 result.json 记录 Electron 可见窗口证据；输入为 CDP 合成事件，截图为 renderer 表面捕获。\n\n| 场景 | 状态 | 失败步骤 |\n|---|---|---:|\n${sceneLines}\n\n## 缺陷\n\n${defectLines}\n\n## 自动复测\n\n缺陷修复由 Codex Developer 修改代码。将缺陷修复轮次保留在缺陷报告中；单缺陷上限三轮，超过后状态设为 ESCALATED。复跑本次失败场景：\`npm run gameplay-agent:rerun-failed\`。\n`);
  return report.summary;
}

function fileSha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

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
  const report = { schemaVersion: 1, runId, mode, startedAt: new Date().toISOString(), host: { platform: process.platform, node: process.version }, interactionMode: process.platform === 'win32' ? 'visible Electron window with localhost CDP synthetic input' : 'no Windows GUI; real EXE test not verified', screenshotMode: 'Chromium renderer capture through CDP', exe, repairAttempts, scenarios: [] };
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
    fs.writeFileSync(latest.path, `${JSON.stringify(latest.report, null, 2)}\n`);
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
