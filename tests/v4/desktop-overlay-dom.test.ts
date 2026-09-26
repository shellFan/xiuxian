import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ELECTRON_CHILD_FLAG = '--desktop-overlay-dom-child';

if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop', 'node_modules', 'electron')) as string;
  const result = spawnSync(electron, [__filename, ELECTRON_CHILD_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `Electron DOM contract exited with ${result.status}`);
} else {
  void runInElectron();
}

async function runInElectron(): Promise<void> {
  const { app, BrowserWindow } = require('electron') as {
    app: { disableHardwareAcceleration(): void; whenReady(): Promise<void>; quit(): void; exit(code: number): void };
    BrowserWindow: new (options: Record<string, unknown>) => ElectronWindow;
  };
  try {
    app.disableHardwareAcceleration();
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');
    const overlay = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');
    const facadeModule = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'facade', 'game-facade.js');
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);
    const facadeLoad = await win.webContents.executeJavaScript(`(function () {
      try { return { ok: true, type: typeof require(${JSON.stringify(facadeModule)}).GameFacade }; }
      catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; }
    })()`);
    assert.equal(facadeLoad.ok, true, facadeLoad.message);
    assert.equal(facadeLoad.type, 'function');
    const contractSetup = await win.webContents.executeJavaScript(`(function () { try {
      window.__overlayContract = {
        clock: { hour: 17, minute: 55, weekday: 1, isWeekend: false, isWorkingHours: true },
        work: { countdownMs: 300000, standardWorkSeconds: 28500, overtimeSeconds: 0, freeOvertimeSeconds: 0, timeline: [] },
        overtime: { source: 'REQUESTED', free: true, plannedSeconds: 7200, elapsedSeconds: 0, mode: null, status: 'OFFERED', startedAt: null },
        overtimeStatus: { source: 'REQUESTED', free: true, status: 'OFFERED' },
        canSettle: true,
        offerCalls: 0,
        declineCalls: 0,
        settleCalls: 0,
        salary: 288,
        selectorCalls: 0,
        presentations: {
          s1: null,
          pending: null,
          workplace: null,
          daily: null,
          info: null
        }
      };
      var GameFacade = require(${JSON.stringify(facadeModule)}).GameFacade;
      var realSelector = GameFacade.prototype.queryNextPresentation;
      window.V2UI = {
        init: function (host) { this.host = host; },
        situationHtml: function () { return ''; },
        promotionPageHtml: function () { return ''; },
        maybeShowV2EventModal: function () { this.open('WORKPLACE'); },
        maybeShowWeekendModal: function () { this.open('DAILY'); },
        maybeShowSettlementModal: function () { this.open('DAILY'); },
        showDefenseModal: function () { this.open('PROMOTION'); },
        open: function (kind) {
          this.host.popupLayer().innerHTML = '<div class="ux-modal-layer" data-v2-stub="' + kind + '"></div>';
        }
      };
      window.__GAME_FACADE__ = {
        snapshot: function () { return { careerLevel: 1, salary: window.__overlayContract.salary, performance: 35, cultivationExp: 166, spiritStones: 42, mind: 86, maxMind: 100, workMode: 'WORK', isFishingMode: false, salaryEfficiency: 1, cultivationEfficiency: 1 }; },
        queryCareer: function () { return { name: '实习牛马', realm: '炼气一层', requiredExp: 100 }; },
        queryKpi: function () { return { items: [] }; },
        queryWorkToday: function () { return Object.assign({}, window.__overlayContract.work); },
        queryOvertime: function () { var value = window.__overlayContract.overtime; return value ? Object.assign({}, value) : null; },
        queryOvertimeStatus: function () { return Object.assign({}, window.__overlayContract.overtimeStatus); },
        queryGameClock: function () { return Object.assign({}, window.__overlayContract.clock); },
        queryGameDay: function () { return { dayIndex: 1, income: { salary: 0 }, settlementInputs: { paidFishingSalary: 0 } }; },
        queryCanSettleDay: function () { return !!window.__overlayContract.presentations.daily || window.__overlayContract.canSettle; },
        queryActiveTasks: function () { return []; },
        queryTaskConfigs: function () { return []; },
        queryEvidence: function () { return []; },
        queryNpcViews: function () { return []; },
        queryAssignedTasks: function () { return { top: [], all: [], openCount: 0 }; },
        queryRates: function () { return { salaryPerMin: 0, cultivationPerMin: 0, mindPerMin: 0 }; },
        queryNextPresentation: function (candidates) {
          window.__overlayContract.selectorCalls += 1;
          return realSelector.call(this, candidates);
        },
        queryIncidentState: function () { return { active: window.__overlayContract.presentations.s1, recent: [], risk: 0 }; },
        queryOfflineDecisions: function () {
          var pending = window.__overlayContract.presentations.pending;
          return pending ? { session: pending.session, current: pending.current, items: [pending.current], overflowSummary: null } : { session: null, current: null, items: [], overflowSummary: null };
        },
        prepareOfflineDecisions: function () { return this.queryOfflineDecisions(); },
        queryV2CurrentEvent: function () { return window.__overlayContract.presentations.workplace; },
        queryWeekendChosen: function () { return !window.__overlayContract.presentations.daily; },
        queryWeekendOptions: function () { return window.__overlayContract.presentations.daily ? [{ id: 'REST', name: '休息', description: '恢复' }] : []; },
        queryCurrentEvent: function () { return window.__overlayContract.presentations.info; },
        queryFinishedBattle: function () { return null; },
        offerOvertime: function () { window.__overlayContract.offerCalls += 1; throw new Error('declined offer must not be recreated'); },
        declineOvertime: function () {
          window.__overlayContract.declineCalls += 1;
          window.__overlayContract.overtime = null;
          window.__overlayContract.overtimeStatus = { source: 'REQUESTED', free: true, status: 'COMPLETED' };
          return { success: true };
        },
        settleDay: function () {
          window.__overlayContract.settleCalls += 1;
          window.__overlayContract.canSettle = false;
          return { title: '准时下班', rank: 'A' };
        }
      };
      return { ok: true };
      } catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; }
    })();
    `);
    assert.equal(contractSetup.ok, true, contractSetup.message);
    const loaded = await win.webContents.executeJavaScript(`(function () {
      try { (0, eval)(${JSON.stringify(overlay)}); return { ok: true }; }
      catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; }
    })()`);
    assert.equal(loaded.ok, true, loaded.message);
    await waitFor(win, `document.querySelector('[data-action="declineOvertime"]') !== null`);

    const offered = await win.webContents.executeJavaScript(`({
      accept: clickable('[data-action="acceptFreeOvertime"]'),
      decline: clickable('[data-action="declineOvertime"]'),
      homeText: document.querySelector('#UiBody').innerText,
      fits: document.querySelector('#UiBody').scrollHeight <= document.querySelector('#UiBody').clientHeight,
      metrics: [document.querySelector('#UiBody').scrollHeight, document.querySelector('#UiBody').clientHeight]
    })`, true);
    assert.equal(offered.accept, true, '17:55 OFFERED exposes a visible, clickable accept control');
    assert.equal(offered.decline, true, '17:55 OFFERED exposes a visible, clickable decline control');
    assert.match(offered.homeText, /今日待办/, 'home content remains rendered around the offer');
    assert.equal(offered.fits, true, `17:55 home must not overflow (${offered.metrics.join(' > ')})`);

    await win.webContents.executeJavaScript(`document.querySelector('[data-action="declineOvertime"]').click()`);
    const declined = await win.webContents.executeJavaScript(`({
      declineCalls: window.__overlayContract.declineCalls,
      offerCalls: window.__overlayContract.offerCalls,
      requestVisible: document.querySelector('[data-action="requestFreeOvertime"]') !== null,
      salary: window.__overlayContract.salary
    })`, true);
    assert.equal(declined.declineCalls, 1);
    assert.equal(declined.offerCalls, 0);
    assert.equal(declined.requestVisible, false, 'refresh before 18:00 must not recreate a declined offer');
    assert.equal(declined.salary, 288, 'declining free overtime grants no reward');

    const settled = await win.webContents.executeJavaScript(`
      window.__overlayContract.clock = { hour: 18, minute: 0, weekday: 1, isWeekend: false, isWorkingHours: false };
      window.__overlayContract.work.countdownMs = 0;
      window.UiOverlay.refresh();
      ({
        control: clickable('[data-action="doSettle"]'),
        fits: document.querySelector('#UiBody').scrollHeight <= document.querySelector('#UiBody').clientHeight,
        metrics: [document.querySelector('#UiBody').scrollHeight, document.querySelector('#UiBody').clientHeight]
      });
    `, true);
    assert.equal(settled.control, true, '18:00 exposes a visible, clickable settlement control');
    assert.equal(settled.fits, true, `18:00 home must not overflow (${settled.metrics.join(' > ')})`);
    await win.webContents.executeJavaScript(`document.querySelector('[data-action="doSettle"]').click()`);
    assert.equal(await win.webContents.executeJavaScript(`window.__overlayContract.settleCalls`), 1);

    const lifecycleWin = win;
    await lifecycleWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);
    const playerModule = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'model', 'player-data.js');
    const storageModule = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'services', 'storage-adapter.js');
    const clockModule = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'core', 'clock.js');
    const lifecycleSetup = await lifecycleWin.webContents.executeJavaScript(`(function () { try {
      var GameFacade = require(${JSON.stringify(facadeModule)}).GameFacade;
      var PlayerData = require(${JSON.stringify(playerModule)}).PlayerData;
      var MemoryStorageAdapter = require(${JSON.stringify(storageModule)}).MemoryStorageAdapter;
      var FakeClock = require(${JSON.stringify(clockModule)}).FakeClock;
      var player = new PlayerData({
        lastSaveTime: 1000,
        tutorialStartedAt: 1,
        pendingEvents: [{ uid: 'pending-real', eventId: 'task:p0-real', occurredAt: 900, priority: 'CRITICAL' }],
        offlineDecisionSession: {
          settlementId: 'offline-rs', pendingEventIds: ['pending-real'], cursor: 0,
          resolvedEventIds: [], status: 'PENDING'
        },
        incidents: [{
          id: 'incident-real', type: 'PAYMENT_FAILURE', severity: 'S1', dayIndex: 1, createdAt: 800,
          status: 'DETECTED', forcedRelease: false, riskConfirmed: false, mitigationSeconds: 0
        }]
      });
      var gameFacade = new GameFacade({
        player: player, clock: new FakeClock(600000), storage: new MemoryStorageAdapter(), board: null
      });
      if (!gameFacade.devForceEvent('incident_s2')) throw new Error('actual workplace event fixture unavailable');
      var selected = [];
      var realSelector = gameFacade.queryNextPresentation.bind(gameFacade);
      gameFacade.queryNextPresentation = function (candidates) {
        var result = realSelector(candidates);
        if (result) selected.push({ id: result.id, kind: result.kind });
        return result;
      };
      window.__LIFECYCLE__ = { facade: gameFacade, player: player, selected: selected };
      window.__GAME_FACADE__ = gameFacade;
      window.V2UI = {
        init: function (host) { this.host = host; },
        situationHtml: function () { return ''; },
        promotionPageHtml: function () { return ''; },
        maybeShowV2EventModal: function () {
          this.host.popupLayer().innerHTML = '<div class="ux-modal-layer"><div data-actual-workplace>workplace</div></div>';
        },
        maybeShowWeekendModal: function () {},
        maybeShowSettlementModal: function () {},
        showDefenseModal: function () {}
      };
      return {
        promotionKeys: Object.keys(gameFacade.queryPromotionCheckV2()).sort(),
        tutorialKeys: Object.keys(gameFacade.queryTutorial()).sort()
      };
    } catch (error) { return { error: error && error.stack ? error.stack : String(error) }; } })()`);
    assert.equal(lifecycleSetup.error, undefined, lifecycleSetup.error);
    assert.equal(lifecycleSetup.promotionKeys.includes('presentationPending'), false, 'actual promotion facade shape has no fabricated persistence flag');
    assert.equal(lifecycleSetup.tutorialKeys.includes('critical'), false, 'actual tutorial facade shape has no fabricated critical flag');

    const lifecycleLoaded = await lifecycleWin.webContents.executeJavaScript(`(function () {
      try { (0, eval)(${JSON.stringify(overlay)}); return { ok: true }; }
      catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; }
    })()`);
    assert.equal(lifecycleLoaded.ok, true, lifecycleLoaded.message);
    await waitFor(lifecycleWin, `document.querySelector('[data-presentation-kind="S1"]') !== null`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const startup = await lifecycleWin.webContents.executeJavaScript(`({
      kind: document.querySelector('#PopupLayer .ux-modal-layer') && document.querySelector('#PopupLayer .ux-modal-layer').getAttribute('data-presentation-kind'),
      modalCount: document.querySelectorAll('#PopupLayer .ux-modal-layer').length,
      hasWelcome: document.querySelector('#WelcomeContinueBtn') !== null,
      pendingCurrent: window.__LIFECYCLE__.facade.queryOfflineDecisions().current,
      workplaceCurrent: window.__LIFECYCLE__.facade.queryV2CurrentEvent()
    })`);
    assert.equal(startup.kind, 'S1', 'startup arbitration must keep the actual S1 above welcome and pending');
    assert.equal(startup.modalCount, 1, 'startup opens exactly one modal');
    assert.equal(startup.hasWelcome, false, 'the delayed welcome cannot overwrite an open S1');
    assert.equal(startup.pendingCurrent.id, 'pending-real', 'the canonical pending decision survives S1 presentation');
    assert.equal(startup.workplaceCurrent.id, 'incident_s2', 'the canonical workplace event survives S1 presentation');

    await lifecycleWin.webContents.executeJavaScript(`
      window.__LIFECYCLE__.player.incidents[0].status = 'RECOVERED';
      document.querySelector('.ux-dialog-actions .ux-btn').click();
    `);
    await waitFor(lifecycleWin, `document.querySelector('#WelcomeContinueBtn') !== null`);
    await lifecycleWin.webContents.executeJavaScript(`document.querySelector('#WelcomeContinueBtn').click()`);
    await waitFor(lifecycleWin, `document.querySelector('[data-offline-decision-action]') !== null`);
    await lifecycleWin.webContents.executeJavaScript(`document.querySelector('[data-offline-decision-action]').click()`);
    await waitFor(lifecycleWin, `document.querySelector('[data-actual-workplace]') !== null`);

    const lifecycleResult = await lifecycleWin.webContents.executeJavaScript(`({
      selected: window.__LIFECYCLE__.selected,
      pendingStatus: window.__LIFECYCLE__.player.offlineDecisionSession.status,
      pendingEvents: window.__LIFECYCLE__.player.pendingEvents.map(function (event) { return event.uid; }),
      modalCount: document.querySelectorAll('#PopupLayer .ux-modal-layer').length
    })`);
    assert.deepEqual(
      lifecycleResult.selected.slice(0, 4).map((entry: { id: string }) => entry.id),
      ['incident:incident-real', 'startup:welcome', 'pending:pending-real', 'workplace:incident_s2'],
      'close/continue/resolve redispatches the retained actual projections through one facade arbitration path',
    );
    assert.equal(lifecycleResult.pendingStatus, 'COMPLETED');
    assert.deepEqual(lifecycleResult.pendingEvents, []);
    assert.equal(lifecycleResult.modalCount, 1, 'each lifecycle transition keeps exactly one modal open');

    console.log('desktop overlay DOM contract tests passed');
    lifecycleWin.destroy();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}

interface ElectronWindow {
  loadURL(url: string): Promise<void>;
  destroy(): void;
  webContents: { executeJavaScript(script: string, userGesture?: boolean): Promise<any> };
}

async function waitFor(win: ElectronWindow, expression: string): Promise<void> {
  await win.webContents.executeJavaScript(`
    window.clickable = function (selector) {
      var el = document.querySelector(selector);
      if (!el || el.disabled) return false;
      var rect = el.getBoundingClientRect();
      var style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
    };
    true;
  `);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
