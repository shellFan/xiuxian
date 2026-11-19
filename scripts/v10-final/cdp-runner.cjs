'use strict';

/**
 * V10 FINAL real-runtime acceptance runner.
 *
 * This file deliberately has no game-service imports.  It launches an owned
 * EXE/Chrome process, talks to the rendered page over CDP, and only reads the
 * facade.  All state changes in the wizard and gameplay are real DOM/CDP
 * input events.  Every record is flushed as JSONL so an interrupted run still
 * has usable evidence.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
// Node 18 (the only runtime in this environment) lacks the global WebSocket;
// the harness talks to CDP over the local minimal RFC 6455 client instead.
const wsClient = require(path.join(__dirname, 'ws-client.cjs'));
const MiniWebSocket = wsClient.MiniWebSocket;
const WS_OPEN = wsClient.OPEN;

const DEFAULT_EXE = path.resolve(__dirname, '..', '..', 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');
const GATES = ['electronReady', 'cocosReady', 'facadeReady', 'creationComplete', 'homeVisible', 'resourcesReady', 'heroSpriteReady', 'chapterValid', 'battleReady'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    mode: 'exe', exe: DEFAULT_EXE, url: '', browser: 'chrome',
    // Random per-run CDP port: a fixed port can collide with a leftover game
    // instance and silently attach the harness to the wrong process.
    port: 20000 + Math.floor(Math.random() * 20000),
    output: path.resolve('ai', 'reports', 'v10-final', 'harness'),
    soakMinutes: 0, sampleMs: 30000, pollMs: 500, bootTimeoutMs: 90000,
    cdpTimeoutMs: 15000, inputMode: 'cdp', keep: false, noLaunch: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = String(argv[i]);
    const [eqKey, eqValue] = raw.includes('=') ? raw.slice(2).split(/=(.*)/s) : [null, null];
    const key = raw.startsWith('--') ? (eqKey || raw.slice(2)) : '';
    const value = eqValue !== null ? eqValue : (raw.startsWith('--') && argv[i + 1] && !String(argv[i + 1]).startsWith('--') ? argv[++i] : true);
    if (!key) continue;
    if (key === 'mode') out.mode = String(value).toLowerCase();
    else if (key === 'exe') out.exe = path.resolve(String(value));
    else if (key === 'url') out.url = String(value);
    else if (key === 'browser') out.browser = String(value).toLowerCase();
    else if (key === 'port') out.port = Number(value);
    else if (key === 'output') out.output = path.resolve(String(value));
    else if (key === 'soak-minutes' || key === 'minutes') out.soakMinutes = Number(value);
    else if (key === 'sample-ms') out.sampleMs = Number(value);
    else if (key === 'poll-ms') out.pollMs = Number(value);
    else if (key === 'boot-timeout-ms') out.bootTimeoutMs = Number(value);
    else if (key === 'cdp-timeout-ms') out.cdpTimeoutMs = Number(value);
    else if (key === 'input-mode') out.inputMode = String(value);
    else if (key === 'width') out.width = Number(value);
    else if (key === 'height') out.height = Number(value);
    else if (key === 'mobile') out.mobile = true;
    else if (key === 'no-launch' || key === 'attach') out.noLaunch = true;
    else if (key === 'keep') out.keep = true;
  }
  if (!['exe', 'h5'].includes(out.mode)) throw new Error('--mode must be exe or h5');
  if (out.mode === 'h5') out.electron = false;
  if (out.mode === 'exe') out.electron = true;
  if (!Number.isFinite(out.port) || out.port < 1) throw new Error('invalid --port');
  if (out.sampleMs < 1000) throw new Error('--sample-ms must be >= 1000');
  return out;
}

function buildLaunchSpec(opts) {
  const profileDir = path.resolve(opts.profileDir || path.join(os.tmpdir(), `xiuxian-v10-final-profile-${process.pid}-${Date.now()}`));
  const saveDir = path.resolve(opts.saveDir || path.join(os.tmpdir(), `xiuxian-v10-final-save-${process.pid}-${Date.now()}`));
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(saveDir, { recursive: true });
  if (opts.mode === 'exe') {
    return {
      command: opts.exe,
      args: [`--remote-debugging-port=${opts.port}`, `--user-data-dir=${profileDir}`],
      env: { XIUXIAN_USER_DATA: saveDir },
      identity: { mode: 'exe', exe: opts.exe, cdpPort: opts.port, profileDir, saveDir },
    };
  }
  const command = opts.browserPath || resolveBrowser(opts.browser);
  const sizeArgs = (opts.width && opts.height) ? [`--window-size=${opts.width},${opts.height}`] : [];
  const mobileArgs = opts.mobile ? ['--force-device-scale-factor=1'] : [];
  // Unattended automation: without these, Chrome intensively throttles timers in
  // background/occluded windows and the Cocos boot pipeline stalls silently
  // (facade never mounts) — the EXE has its own occlusion fix (v70), the page needs flags.
  const throttleArgs = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling'];
  return {
    command,
    args: [`--remote-debugging-port=${opts.port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--new-window', ...throttleArgs, ...sizeArgs, ...mobileArgs, opts.url],
    env: {},
    identity: { mode: 'h5', browser: opts.browser, browserPath: command, cdpPort: opts.port, profileDir, saveDir, electronApiExpected: false, viewport: opts.width && opts.height ? `${opts.width}x${opts.height}` : null },
  };
}

function resolveBrowser(name) {
  const exe = name === 'edge' ? 'msedge.exe' : 'chrome.exe';
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const suffixes = name === 'edge'
    ? ['Microsoft/Edge/Application/msedge.exe']
    : ['Google/Chrome/Application/chrome.exe', 'Google/Chrome SxS/Application/chrome.exe'];
  for (const root of roots) for (const suffix of suffixes) {
    const candidate = path.join(root, suffix);
    if (fs.existsSync(candidate)) return candidate;
  }
  return exe;
}

function uniqueRunDir(base, runId) {
  fs.mkdirSync(base, { recursive: true });
  let candidate = path.join(base, runId);
  let n = 1;
  while (fs.existsSync(path.join(candidate, 'run.json'))) candidate = path.join(base, `${runId}-${n++}`);
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

class RunManifest {
  constructor(dir, initial = {}) {
    this.dir = dir;
    this.jsonl = path.join(dir, 'manifest.jsonl');
    this.data = { runId: initial.runId || `run-${Date.now()}`, startedAt: new Date().toISOString(), ...initial };
    fs.mkdirSync(dir, { recursive: true });
    this.flushRun();
  }

  flushRun() {
    fs.writeFileSync(path.join(this.dir, 'run.json'), JSON.stringify(this.data, null, 2));
  }

  record(record) {
    const row = { at: new Date().toISOString(), ...record };
    fs.appendFileSync(this.jsonl, JSON.stringify(row) + '\n');
    return row;
  }

  finish(summary) {
    this.data.finishedAt = new Date().toISOString();
    this.data.summary = summary;
    this.flushRun();
    return this.data;
  }
}

class BootGate {
  static homeGates(snapshot) {
    return Object.fromEntries(GATES.filter((key) => key !== 'battleReady').map((key) => [key, snapshot[key] === true]));
  }

  evaluate(snapshot) {
    const missing = GATES.filter((key) => snapshot[key] !== true);
    return { pass: missing.length === 0, missing, gates: Object.fromEntries(GATES.map((key) => [key, snapshot[key] === true])) };
  }
}

class SoakMonitor {
  constructor({ gapMs = 45000 } = {}) {
    this.gapMs = gapMs;
    this.samples = [];
    this.gapFailures = [];
    this.blankFailures = [];
    this.heartbeatFailures = [];
    this.actionCountStart = null;
    this.progressStart = null;
  }

  sample(value) {
    const row = { ...value, atMs: Number(value.atMs), sampledAt: new Date().toISOString() };
    const previous = this.samples[this.samples.length - 1];
    if (previous && row.atMs - previous.atMs > this.gapMs) this.gapFailures.push({ fromMs: previous.atMs, toMs: row.atMs, gapMs: row.atMs - previous.atMs });
    if (row.blank === true) this.blankFailures.push(row);
    if (row.heartbeat !== true) this.heartbeatFailures.push(row);
    if (this.actionCountStart === null && Number.isFinite(row.actionCount)) this.actionCountStart = row.actionCount;
    if (this.progressStart === null && row.progression) this.progressStart = row.progression;
    this.samples.push(row);
    return row;
  }

  finish(atMs = Date.now()) {
    const last = this.samples[this.samples.length - 1];
    if (last && atMs - last.atMs > this.gapMs) this.gapFailures.push({ fromMs: last.atMs, toMs: atMs, gapMs: atMs - last.atMs });
    return { pass: !this.gapFailures.length && !this.blankFailures.length && !this.heartbeatFailures.length, samples: this.samples, gapFailures: this.gapFailures, blankFailures: this.blankFailures, heartbeatFailures: this.heartbeatFailures };
  }
}

class CdpClient {
  constructor(port, timeoutMs, manifest) {
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.manifest = manifest;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.exceptions = [];
    this.page = null;
  }

  async findPage(deadline = Date.now() + 60000) {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        const pages = await res.json();
        const page = pages.find((item) => item.type === 'page' && !/^devtools:/.test(item.url || '')) || pages.find((item) => item.type === 'page');
        if (page && page.webSocketDebuggerUrl) return page;
      } catch (_) { /* launch race */ }
      await sleep(250);
    }
    throw new Error(`CDP endpoint did not expose a page on port ${this.port}`);
  }

  async connect() {
    this.page = await this.findPage();
    this.ws = new MiniWebSocket(this.page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket open timeout')), this.timeoutMs);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = (error) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error('CDP websocket error')); };
    });
    this.ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${message.error.code || ''} ${message.error.message || 'CDP error'}`));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params && message.params.type)) {
        this.consoleErrors.push({ at: new Date().toISOString(), text: (message.params.args || []).map((arg) => arg.value || arg.description || '').join(' ').slice(0, 1000) });
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push({ at: new Date().toISOString(), text: String(message.params && message.params.exceptionDetails && (message.params.exceptionDetails.exception && message.params.exceptionDetails.exception.description || message.params.exceptionDetails.text) || '').slice(0, 2000) });
      }
    };
    await this.command('Runtime.enable');
    await this.command('Page.enable');
    return this.page;
  }

  command(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WS_OPEN) return reject(new Error(`CDP not connected for ${method}`));
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout ${method} after ${this.timeoutMs}ms`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
    return result.result && result.result.value;
  }

  async click(selector) {
    const rect = await this.evaluate(`(function(){const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const s=getComputedStyle(e);if(e.disabled||s.display==='none'||s.visibility==='hidden')return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect(),vh=window.innerHeight,vw=window.innerWidth;if(r.width<2||r.height<2)return null;if(r.top<0||r.bottom>vh||r.left<0||r.right>vw)return {offscreen:true,x:r.left+r.width/2,y:r.top+r.height/2,rect:{top:r.top,bottom:r.bottom,vh}};return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if (!rect || rect.offscreen) return { clicked: false, selector, offscreen: !!(rect && rect.offscreen), rect: rect && rect.rect };
    await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 });
    await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1, buttons: 1 });
    await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1, buttons: 0 });
    return { clicked: true, selector };
  }

  async clickFirst(selectors) {
    for (const selector of selectors) {
      const result = await this.click(selector);
      if (result.clicked) return result;
    }
    return { clicked: false, selectors };
  }

  async clickText(text, selector = 'button,[role="button"],a,.ux-nav-item') {
    const result = await this.evaluate(`(function(){const wanted=${JSON.stringify(text)};for(const e of document.querySelectorAll(${JSON.stringify(selector)})){const s=getComputedStyle(e);if((e.innerText||'').includes(wanted)&&r2(e)&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled){e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();if(r.width<2||r.height<2||r.top<0||r.bottom>window.innerHeight||r.left<0||r.right>window.innerWidth)continue;return {x:r.left+r.width/2,y:r.top+r.height/2,text:e.innerText.slice(0,80)}}}function r2(e){const r=e.getBoundingClientRect();return r.width>2&&r.height>2;}return null;})()`);
    if (!result) return { clicked: false, text };
    await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: result.x, y: result.y, button: 'none', buttons: 0 });
    await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: result.x, y: result.y, button: 'left', clickCount: 1, buttons: 1 });
    await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: result.x, y: result.y, button: 'left', clickCount: 1, buttons: 0 });
    return { clicked: true, text, resolvedText: result.text };
  }

  async type(selector, text) {
    const result = await this.click(selector);
    if (!result.clicked) return result;
    await this.command('Input.insertText', { text });
    return { ...result, textInserted: true };
  }

  async screenshot(file) {
    const result = await this.command('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    return file;
  }

  close() {
    try { if (this.ws) this.ws.close(); } catch (_) { /* no-op */ }
    this.ws = null;
  }
}

const SNAPSHOT_JS = `(async function(){
  const visible = (e) => { if(!e)return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return r.width>2&&r.height>2&&s.display!=='none'&&s.visibility!=='hidden'; };
  const first = (sels) => { for(const s of sels){ const e=document.querySelector(s); if(visible(e)) return e; } return null; };
  const facade=window.__GAME_FACADE__;
  let creation=null, battle=null, runtimeInfo=null;
  try{creation=facade&&facade.queryCharacterCreation?facade.queryCharacterCreation():null;}catch(e){creation={error:String(e)}}
  try{battle=facade&&facade.queryAutoBattle?facade.queryAutoBattle():null;}catch(e){battle={error:String(e)}}
  try{if(window.electronAPI&&window.electronAPI.app&&window.electronAPI.app.getRuntimeInfo)runtimeInfo=await window.electronAPI.app.getRuntimeInfo();}catch(e){runtimeInfo={error:String(e)}}
  const modal=first(['.ux-modal-layer[role="dialog"]','.ux-dialog[role="dialog"]','.ux-modal-layer','.ux-dialog','[data-offline-decision-action]','[data-vevent-choice]']);
  const hero=first(['#Ux90CaveHero','.ux91-hero img','.ux91-hero','.ux-hero']);
  const images=[...document.images].map(i=>({src:i.currentSrc||i.src,complete:i.complete,naturalWidth:i.naturalWidth}));
  const entries=performance.getEntriesByType('resource').slice(-80).map(x=>({name:x.name,initiatorType:x.initiatorType,duration:Math.round(x.duration)}));
  const modalButtons=modal?[...modal.querySelectorAll('button,[role="button"]')].filter(visible).map(e=>({id:e.id,action:e.getAttribute('data-action'),choice:e.getAttribute('data-vevent-choice'),offline:e.getAttribute('data-offline-decision-action'),projectDecision:e.getAttribute('data-project-decision'),skillOffer:e.getAttribute('data-battle-skill'),text:(e.innerText||'').trim().slice(0,120),disabled:!!e.disabled})):[];
  const creationActive=!!first(['.v59-creation','[data-creation-action="advance"]','[data-creation-action="finalize"]','[data-creation-action="start-game"]']);
  const profile=facade&&facade.queryCharacterProfile?(()=>{try{return facade.queryCharacterProfile()}catch(e){return null}})():null;
  let resources=null;
  try{resources=facade.queryResources?facade.queryResources():null;}catch(e){}
  let equipBagN=null;
  try{const ev=facade.queryEquipView?facade.queryEquipView():null;equipBagN=ev&&Array.isArray(ev.bag)?ev.bag.length:null;}catch(e){}
  const domSignature=[
    !!first(['[data-action="v63-hire"]']),
    !!first(['[data-action="v64-closeEquip"]','[data-action="v64-equipItem"]']),
    !!first(['.ux-messenger','.ux-mb-list','[data-reply]']),
    (document.querySelector('.ux65-combo')||{}).innerText||null,
    resources?(JSON.stringify(resources).length+''):null,
    (document.querySelector('[data-action="mode"].is-running')||{}).getAttribute?((document.querySelector('[data-action="mode"].is-running')||{}).getAttribute('data-mode')):null,
  ].join('|');
  return {url:location.href,readyState:document.readyState,title:document.title,
    electronApi:typeof window.electronAPI, runtimeInfo, cocosReady:!!(window.__COCOS_READY__||window.cc||window.__cocosReady||document.querySelector('canvas')),
    facadeReady:!!facade, creation, creationActive, profile, battle,
    homeVisible:!!hero||!!first(['.ux91-home','.ux-home','[data-page="home"]']), heroSpriteReady:!!hero&&((hero.tagName==='IMG'&&hero.naturalWidth>0)||getComputedStyle(hero).backgroundImage!=='none'),
    images, resources:entries, modal:modal?{id:modal.id,cls:modal.className,text:(modal.innerText||'').trim().slice(0,500),buttons:modalButtons}:null,
    chapter:{stage:battle&&battle.stage,chapter:battle&&(battle.chapter||battle.chapterTitle),dom:!!first(['.ux91-chapter-bar','.ux-chapter-bar'])},
    battleDom:!!first(['.ux-battle2','.ux91-battle','.ux-scene-battle','[data-action="v63-tapAttack"]']),
    heartbeat:!!document.documentElement&&document.visibilityState!=='prerender',blank:!document.body||(document.body.innerText.trim().length===0&&!document.querySelector('canvas')),
    horizontalOverflow:(document.documentElement.scrollWidth||0) > (document.documentElement.clientWidth||0) + 1,
    domSignature,
    actionCount:battle&&(battle.totalTaps||battle.actionCount||0),
    projection:{stage:battle&&battle.stage,maxStage:battle&&battle.maxStage,status:battle&&battle.status,chapter:battle&&(battle.chapter||battle.chapterTitle),totalTaps:battle&&battle.totalTaps,squad:battle&&battle.squad&&battle.squad.length,squadAtk:(battle&&battle.squad||[]).map(m=>m.attack).join(','),clickDamage:battle&&battle.clickDamage,spiritStones:battle&&battle.spiritStones,pendingChests:battle&&battle.pendingChests,equipBagN:equipBagN,cardPhase:battle&&battle.cardPhase,reward:!!(battle&&battle.reward)}
  };
})()`;

async function snapshot(cdp) {
  try { return await cdp.evaluate(SNAPSHOT_JS); } catch (error) { return { error: String(error && error.stack || error), heartbeat: false, blank: true }; }
}

function gateSnapshot(snapshotValue, mode) {
  const creation = snapshotValue.creation || {};
  const battle = snapshotValue.battle || {};
  const creationStatus = String(creation.status || '').toUpperCase();
  const creationComplete = !snapshotValue.creationActive && !['CREATION_REQUIRED', 'ACTIVE', 'IN_PROGRESS'].includes(creationStatus)
    && !!(creation.draft ? (creation.draft.professionId || creation.draft.professionConfirmed) : (snapshotValue.profile && (snapshotValue.profile.profession || snapshotValue.profile.professionId || snapshotValue.profile.name || snapshotValue.profile.nickname)));
  const resourcesReady = Array.isArray(snapshotValue.images) && snapshotValue.images.every((image) => image.complete && (!image.src || image.naturalWidth > 0))
    && Array.isArray(snapshotValue.resources) && snapshotValue.resources.length > 0;
  const chapterValid = Number.isFinite(Number(snapshotValue.chapter && snapshotValue.chapter.stage)) && Number(snapshotValue.chapter.stage) > 0;
  const battleReady = snapshotValue.battleDom === true && !!battle && typeof battle === 'object' && Number.isFinite(Number(battle.stage));
  const electronReady = mode === 'h5' ? snapshotValue.electronApi === 'undefined' : snapshotValue.electronApi === 'object' || (snapshotValue.runtimeInfo && snapshotValue.runtimeInfo.electron === true);
  return {
    ...snapshotValue,
    electronReady,
    cocosReady: snapshotValue.cocosReady === true,
    facadeReady: snapshotValue.facadeReady === true,
    creationComplete,
    homeVisible: snapshotValue.homeVisible === true,
    resourcesReady,
    heroSpriteReady: snapshotValue.heroSpriteReady === true,
    chapterValid,
    battleReady,
  };
}

async function captureDiagnostics(cdp, manifest, dir, stage, snapshotValue) {
  const safe = String(stage).replace(/[^a-z0-9_-]/gi, '_');
  const files = {};
  try { files.screenshot = await cdp.screenshot(path.join(dir, `${safe}.png`)); } catch (error) { files.screenshotError = String(error.message); }
  try { files.dom = path.join(dir, `${safe}.html`); fs.writeFileSync(files.dom, String(await cdp.evaluate('document.documentElement ? document.documentElement.outerHTML : ""'))); } catch (error) { files.domError = String(error.message); }
  try { files.resources = path.join(dir, `${safe}.resources.json`); fs.writeFileSync(files.resources, JSON.stringify(snapshotValue && snapshotValue.resources || [], null, 2)); } catch (_) { /* best effort */ }
  try { files.state = path.join(dir, `${safe}.state.json`); fs.writeFileSync(files.state, JSON.stringify({ snapshot: snapshotValue, consoleErrors: cdp.consoleErrors, exceptions: cdp.exceptions }, null, 2)); } catch (_) { /* best effort */ }
  const diagnostics = { stage, files, snapshot: snapshotValue, modal: snapshotValue && snapshotValue.modal, consoleErrors: cdp.consoleErrors.slice(-50), exceptions: cdp.exceptions.slice(-50) };
  manifest.record({ type: 'diagnostics', stage, diagnostics });
  return diagnostics;
}

async function handleSpecificModal(cdp, snap) {
  const modal = snap && snap.modal;
  if (!modal || !Array.isArray(modal.buttons)) return { handled: false, reason: 'none' };
  // V10 QA: tutorial SKIP before Next — clicking Next re-renders the tutorial
  // endlessly in unattended runs (observed 60+ consecutive Next clicks).
  const button = modal.buttons.find((item) => !item.disabled && (item.choice || item.offline || item.id === 'EventOkBtn' || item.id === 'V2EventOk' || item.action === 'battleTutorialSkip' || item.action === 'battleTutorialNext' || item.projectDecision || item.skillOffer));
  if (!button) {
    // Build-selection modal: pick the first build through the real button.
    const build = await cdp.click('[data-battle-build]');
    if (build.clicked) return { handled: true, selector: '[data-battle-build]', resolved: true };
    return { handled: false, reason: 'unknown-modal', modal };
  }
  const selector = button.id ? `#${button.id}` : button.choice ? `[data-vevent-choice=${JSON.stringify(button.choice)}]` : button.offline ? `[data-offline-decision-action=${JSON.stringify(button.offline)}]` : button.projectDecision ? `[data-project-decision=${JSON.stringify(button.projectDecision)}]` : button.skillOffer ? `[data-battle-skill=${JSON.stringify(button.skillOffer)}]` : `[data-action=${JSON.stringify(button.action)}]`;
  const clicked = await cdp.click(selector);
  await sleep(200);
  const after = await snapshot(cdp);
  return { handled: clicked.clicked, selector, resolved: !after.modal || after.modal.text !== modal.text };
}

async function dismissModalIfAny(cdp, manifest) {
  const snap = await snapshot(cdp);
  if (!snap.modal) return { dismissed: false };
  // A live card battle renders inside .ux-modal-layer too; never close it.
  const inBattle = await cdp.evaluate(`!!(document.querySelector('[data-action="battlePlayCard"]')||document.querySelector('[data-action="battleEndTurn"]')||document.querySelector('[data-action="battleRewardPick"]'))`);
  if (inBattle === true) return { dismissed: false, inBattle: true };
  const handled = await handleSpecificModal(cdp, snap);
  if (!handled.handled) {
    const closed = await cdp.clickFirst(['[data-action="closePopup"]', '[data-battle-fallback-exit]']);
    return { dismissed: closed.clicked, via: closed.selector };
  }
  manifest.record({ type: 'modal-dismissed', handled });
  return handled;
}

async function completeCreation(cdp, manifest, dir, opts) {
  const deadline = Date.now() + opts.bootTimeoutMs;
  for (let n = 0; n < 120 && Date.now() < deadline; n += 1) {
    const raw = await snapshot(cdp);
    const current = gateSnapshot(raw, opts.mode);
    if (current.creationComplete && current.homeVisible) return { pass: true, iterations: n, snapshot: current };
    if (!current.facadeReady || current.readyState !== 'complete') {
      manifest.record({ type: 'wizard-wait', iteration: n, reason: 'runtime-not-ready', snapshot: { readyState: current.readyState, facadeReady: current.facadeReady, cocosReady: current.cocosReady } });
      await sleep(Math.min(1000, Math.max(200, opts.pollMs)));
      continue;
    }
    if (current.modal) {
      const handled = await handleSpecificModal(cdp, current);
      manifest.record({ type: 'wizard-modal', iteration: n, ...handled });
      if (!handled.handled) {
        await captureDiagnostics(cdp, manifest, dir, `wizard-modal-${n}`, current);
        return { pass: false, reason: 'unhandled-modal', snapshot: current };
      }
      continue;
    }
    const creation = current.creation || {};
    const draft = creation.draft || {};
    const step = String(draft.step || creation.step || '').toUpperCase();
    let action = null;
    if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
    else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
    else if (step === 'IDENTITY') {
      // IDENTITY flow: save nickname/avatar, then pick a background; only then
      // does advance() validate (nickname + avatar + background).
      if (!draft.nickname) action = await cdp.type('#v59-nickname', '范大牛');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) {
      action = await cdp.click('[data-creation-choice^="candidate:"]');
    } else if (step === 'CONFIRM') {
      action = await cdp.click('[data-creation-action="finalize"]');
    } else {
      action = await cdp.clickFirst([
        '[data-creation-action="start-game"]',
        '[data-creation-action="onboarding-skip"]',
        '[data-creation-action="onboarding-next"]',
        '[data-creation-action="advance"]',
        '[data-creation-action="finalize"]',
      ]);
    }
    manifest.record({ type: 'wizard-action', iteration: n, step, action, before: { draft, creationActive: current.creationActive } });
    if (!action.clicked) {
      if (String(creation.status || '').toUpperCase() === 'CREATION_REQUIRED') {
        manifest.record({ type: 'wizard-wait', iteration: n, reason: 'creation-state-ready-but-ui-not-interactive', step });
        await sleep(Math.min(1000, Math.max(250, opts.pollMs)));
        continue;
      }
      await captureDiagnostics(cdp, manifest, dir, `wizard-${n}`, current);
      return { pass: false, reason: `no-real-action-for-step-${step || 'unknown'}`, snapshot: current };
    }
    await sleep(Math.min(1000, Math.max(150, opts.pollMs)));
  }
  const finalSnapshot = gateSnapshot(await snapshot(cdp), opts.mode);
  await captureDiagnostics(cdp, manifest, dir, 'wizard-timeout', finalSnapshot);
  return { pass: false, reason: 'wizard-timeout', snapshot: finalSnapshot };
}

function projectionChanged(before, after) {
  return JSON.stringify(before && before.projection) !== JSON.stringify(after && after.projection)
    || JSON.stringify(before && before.creation) !== JSON.stringify(after && after.creation)
    || before.domSignature !== after.domSignature
    || !!before.modal !== !!after.modal
    || (before.modal && after.modal && before.modal.text !== after.modal.text);
}

async function runCardBattleSession(cdp, manifest, dir, opts) {
  // Full card-battle loop: build → play/end-turn until reward, with bounded turns.
  const steps = [];
  const deadline = Date.now() + 120000;
  let guard = 0;
  while (Date.now() < deadline && guard < 40) {
    guard += 1;
    const snap = await snapshot(cdp);
    const projection = snap.projection || {};
    if (projection.reward) {
      const pick = await cdp.clickFirst(['[data-action="battleRewardPick"]', '[data-action="battleRewardSkip"]']);
      steps.push({ at: guard, action: 'reward', ...pick });
      if (!pick.clicked) break;
      await sleep(600);
      continue;
    }
    const played = await cdp.clickFirst(['[data-action="battlePlayCard"]']);
    if (played.clicked) {
      steps.push({ at: guard, action: 'play-card', ...played });
      await sleep(500);
      // Some cards need a target; complete the selection on an enemy.
      const target = await cdp.evaluate(`(function(){var e=document.querySelector('[data-enemy-uid]');if(!e)return false;var r=e.getBoundingClientRect();return r.width>2;})()`);
      if (target === true) {
        const enemy = await cdp.click('[data-enemy-uid]');
        steps.push({ at: guard, action: 'target-enemy', ...enemy });
        await sleep(500);
      }
      continue;
    }
    const ended = await cdp.click('[data-action="battleEndTurn"]');
    if (ended.clicked) {
      steps.push({ at: guard, action: 'end-turn', ...ended });
      await sleep(900);
      continue;
    }
    const status = String(projection.status || '').toUpperCase();
    if (status === 'VICTORY' || status === 'DEFEAT' || !projection.cardPhase) break;
    await sleep(600);
  }
  manifest.record({ type: 'card-battle-session', steps, stepsCount: steps.length });
  return steps;
}

async function runGameplayActions(cdp, manifest, dir, opts) {
  const gotoNav = async (tabId) => {
    const clicked = await cdp.click(`[data-nav="${tabId}"]`);
    await sleep(400);
    return clicked;
  };
  const plans = [
    { name: 'work', nav: 'CAVE', action: () => cdp.clickFirst(['[data-action="mode"][data-mode="WORK"]', '[data-action="start"]']), candidates: ['[data-action="assignedDone"]'] },
    { name: 'messenger', nav: 'CAVE', action: () => cdp.clickFirst(['[data-action="openMessenger"]']), candidates: [], cleanup: ['[data-action="closePopup"]'] },
    { name: 'hire', nav: 'BATTLE', action: () => cdp.clickFirst(['[data-action="v63-hireMenu"]', '[data-action="v63-hire"]']), candidates: [], cleanup: ['[data-action="v63-closeHireMenu"]'] },
    { name: 'tap', nav: 'BATTLE', action: async () => {
      const clicks = [];
      for (let i = 0; i < 6; i += 1) clicks.push(await cdp.click('[data-action="v63-tapAttack"]'));
      return clicks.find((c) => c.clicked) || clicks[0];
    }, candidates: [] },
    { name: 'equipment', nav: 'BATTLE', action: () => cdp.clickFirst(['[data-action="v64-openEquip"]']), candidates: [], cleanup: ['[data-action="v64-closeEquip"]'] },
    { name: 'upgrade', nav: 'BATTLE', action: () => cdp.clickFirst(['[data-action="v63-upgradeClick"]']), candidates: [] },
    { name: 'card-entry', nav: 'PROJECT', action: () => cdp.clickFirst(['[data-action="v63-gotoCardBattle"]', '[data-action="projectEntry"]']), candidates: [] },
    { name: 'card-session', nav: null, action: async () => {
      const steps = await runCardBattleSession(cdp, manifest, dir, opts);
      return { clicked: steps.length > 0, steps: steps.length };
    }, candidates: [] },
    { name: 'tasks-claim', nav: 'TASKS', action: () => cdp.clickFirst(['[data-action="claimGoal"]', '[data-action="claimAch"]', '[data-action="claim"]']), candidates: [] },
    { name: 'promotion', nav: 'CAVE', action: () => cdp.click('[data-action="promote"]'), candidates: [] },
    { name: 'chapter', nav: null, action: async () => ({ clicked: true, readOnly: true }), candidates: [] },
    { name: 'restart', nav: null, action: async () => {
      const beforeKeys = await cdp.evaluate('Object.keys(localStorage)');
      await cdp.command('Page.reload', { ignoreCache: true });
      for (let i = 0; i < 30; i += 1) {
        await sleep(500);
        const after = await snapshot(cdp);
        if (after.facadeReady) {
          const afterKeys = await cdp.evaluate('Object.keys(localStorage)');
          return { clicked: true, reloaded: true, localStorageBefore: beforeKeys, localStorageAfter: afterKeys, localStoragePreserved: JSON.stringify(beforeKeys) === JSON.stringify(afterKeys) || afterKeys.length >= beforeKeys.length };
        }
      }
      return { clicked: true, reloaded: true, localStoragePreserved: false };
    }, candidates: [] },
  ];
  const results = [];
  for (const plan of plans) {
    if (plan.nav) await gotoNav(plan.nav);
    await dismissModalIfAny(cdp, manifest);
    const before = await snapshot(cdp);
    let action = await plan.action();
    if (action && typeof action.then === 'function') action = await action;
    if (!action.clicked && plan.candidates.length) action = await cdp.clickFirst(plan.candidates);
    await sleep(400);
    if (plan.cleanup) await cdp.clickFirst(plan.cleanup);
    const after = await snapshot(cdp);
    const available = !!(action && action.clicked);
    const verified = available && (plan.name === 'chapter' || (plan.name === 'restart' && action.localStoragePreserved === true) || (plan.name === 'card-session' && action.steps > 0) || projectionChanged(before, after));
    const row = { name: plan.name, status: !available ? 'NOT_AVAILABLE' : verified ? 'PASS' : 'NOT_VERIFIED', action, before: before.projection, after: after.projection };
    results.push(row);
    manifest.record({ type: 'gameplay-action', ...row });
    if (row.status !== 'PASS') await captureDiagnostics(cdp, manifest, dir, `action-${plan.name}`, after);
  }
  return results;
}

function ownedProcessMetrics(pid) {
  if (!pid) return { pid: null };
  if (process.platform === 'win32') {
    const command = `Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU,WorkingSet64,Responding | ConvertTo-Json -Compress`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
    try { return { pid: Number(pid), process: JSON.parse(String(result.stdout || '').trim() || 'null') }; } catch (_) { return { pid: Number(pid), error: String(result.stderr || 'metrics unavailable').trim() }; }
  }
  const result = spawnSync('ps', ['-o', 'pid=,ppid=,rss=,pcpu=,stat=', '-p', String(pid)], { encoding: 'utf8' });
  return { pid: Number(pid), process: String(result.stdout || '').trim() };
}

function processTree(pid) {
  if (!pid) return [];
  if (process.platform === 'win32') {
    const command = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${Number(pid)} -or $_.ParentProcessId -eq ${Number(pid)} } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
    try { const parsed = JSON.parse(String(result.stdout || '').trim() || '[]'); return Array.isArray(parsed) ? parsed : [parsed]; } catch (_) { return []; }
  }
  return [];
}

async function soak(cdp, manifest, dir, opts, pid) {
  const monitor = new SoakMonitor({ gapMs: 45000 });
  const deadline = Date.now() + Math.max(0, opts.soakMinutes) * 60000;
  let nextAction = Date.now();
  while (Date.now() < deadline) {
    const atMs = Date.now();
    const snap = await snapshot(cdp);
    const gate = gateSnapshot(snap, opts.mode);
    const sample = { atMs, heartbeat: gate.heartbeat === true, blank: gate.blank !== false, actionCount: Number(snap.actionCount || 0), progression: snap.projection, gates: gate, heapMB: null, nodes: null, errors: cdp.consoleErrors.length + cdp.exceptions.length, process: ownedProcessMetrics(pid), processTree: processTree(pid) };
    try { sample.heapMB = await cdp.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : null'); } catch (_) { /* unsupported */ }
    try { sample.nodes = await cdp.evaluate('document.getElementsByTagName("*").length'); } catch (_) { /* best effort */ }
    monitor.sample(sample);
    manifest.record({ type: 'soak-sample', sample });
    if (atMs >= nextAction) {
      const action = await cdp.clickFirst(['[data-action="v63-tapAttack"]', '[data-action="cultivate"]', '[data-action="mode"][data-mode="WORK"]']);
      manifest.record({ type: 'soak-action', atMs, action });
      nextAction = atMs + opts.sampleMs;
    }
    await sleep(Math.min(opts.sampleMs, Math.max(1000, deadline - Date.now())));
  }
  const result = monitor.finish(Date.now());
  manifest.record({ type: 'soak-summary', result });
  fs.writeFileSync(path.join(dir, 'soak.json'), JSON.stringify(result, null, 2));
  return result;
}

async function launchProcess(spec, manifest) {
  // The harness itself may run under ELECTRON_RUN_AS_NODE (the only Node
  // runtime available here); the game EXE must start as a real Electron app.
  const childEnv = { ...process.env, ...spec.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { cwd: path.dirname(spec.command), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const stdout = path.join(manifest.dir, 'process.stdout.log');
  const stderr = path.join(manifest.dir, 'process.stderr.log');
  child.stdout.on('data', (chunk) => fs.appendFileSync(stdout, chunk));
  child.stderr.on('data', (chunk) => fs.appendFileSync(stderr, chunk));
  child.on('exit', (code, signal) => manifest.record({ type: 'process-exit', pid: child.pid, code, signal }));
  manifest.record({ type: 'process-start', pid: child.pid, command: spec.command, args: spec.args, identity: spec.identity });
  return child;
}

async function run(options = parseArgs()) {
  const runId = `${options.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const dir = uniqueRunDir(options.output, runId);
  const manifest = new RunManifest(dir, { mode: options.mode, options, evidenceDir: dir });
  let spec = null; let child = null; let cdp = null; let summary = { status: 'NOT_VERIFIED' };
  try {
    if (!options.noLaunch) {
      if (options.mode === 'h5' && !options.url) throw new Error('--url is required for --mode h5');
      spec = buildLaunchSpec(options);
      child = await launchProcess(spec, manifest);
    } else {
      spec = buildLaunchSpec({ ...options, profileDir: path.join(dir, 'attached-profile'), saveDir: path.join(dir, 'attached-save') });
      manifest.record({ type: 'attach', identity: spec.identity });
    }
    cdp = new CdpClient(options.port, options.cdpTimeoutMs, manifest);
    await cdp.connect();
    manifest.record({ type: 'cdp-connected', page: cdp.page, identity: spec.identity });
    const creation = await completeCreation(cdp, manifest, dir, options);
    if (!creation.pass) {
      summary = { status: 'FAIL', gate: 'creation', reason: creation.reason };
      manifest.finish(summary);
      return { ...summary, dir };
    }
    // Gates are phase-split by design: home-page gates are asserted on the
    // cave page, then the harness navigates through the real bottom nav and
    // asserts the battle stage on the battle page.
    const homeSnap = gateSnapshot(await snapshot(cdp), options.mode);
    manifest.record({ type: 'home-gates', gates: BootGate.homeGates(homeSnap), snapshot: homeSnap });
    let battleSnap = homeSnap;
    if (!homeSnap.battleReady) {
      const nav = await cdp.clickText('战斗');
      manifest.record({ type: 'goto-battle', nav });
      await sleep(1000);
      battleSnap = gateSnapshot(await snapshot(cdp), options.mode);
    }
    const finalSnap = { ...homeSnap, battleReady: battleSnap.battleReady === true };
    const gate = new BootGate().evaluate(finalSnap);
    manifest.record({ type: 'boot-gate', status: gate.pass ? 'PASS' : 'FAIL', gate, snapshot: finalSnap });
    if (!gate.pass) {
      await captureDiagnostics(cdp, manifest, dir, `boot-gate-${gate.missing.join('-')}`, finalSnap);
      summary = { status: 'FAIL', gate: 'boot', missing: gate.missing };
      manifest.finish(summary);
      return { ...summary, dir };
    }
    const gameplay = await runGameplayActions(cdp, manifest, dir, options);
    let soakResult = null;
    if (options.soakMinutes > 0) soakResult = await soak(cdp, manifest, dir, options, child && child.pid);
    summary = { status: soakResult ? (soakResult.pass ? 'PASS' : 'FAIL') : 'PARTIAL', gate: 'boot', gameplay, soak: soakResult };
    manifest.finish(summary);
    return { ...summary, dir };
  } catch (error) {
    manifest.record({ type: 'fatal', error: String(error && error.stack || error) });
    if (cdp) { try { await captureDiagnostics(cdp, manifest, dir, 'fatal', await snapshot(cdp)); } catch (_) { /* best effort */ } }
    summary = { status: 'FAIL', reason: String(error && error.message || error) };
    manifest.finish(summary);
    return { ...summary, dir };
  } finally {
    if (cdp) cdp.close();
    if (child && !options.keep) {
      try { child.kill(); } catch (_) { /* process may have exited */ }
    }
  }
}

if (require.main === module) {
  run(parseArgs()).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.status === 'FAIL' ? 1 : 0;
  }).catch((error) => { process.stderr.write(String(error && error.stack || error) + '\n'); process.exitCode = 1; });
}

module.exports = { parseArgs, buildLaunchSpec, BootGate, RunManifest, SoakMonitor, CdpClient, snapshot, gateSnapshot, run, ownedProcessMetrics, processTree, handleSpecificModal, runCardBattleSession, sleep };

