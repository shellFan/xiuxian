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
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: { contextIsolation: false, sandbox: false },
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);
    await win.webContents.executeJavaScript(`
      window.__overlayContract = {
        clock: { hour: 17, minute: 55, weekday: 1, isWeekend: false, isWorkingHours: true },
        work: { countdownMs: 300000, standardWorkSeconds: 28500, overtimeSeconds: 0, freeOvertimeSeconds: 0, timeline: [] },
        overtime: { source: 'REQUESTED', free: true, plannedSeconds: 7200, elapsedSeconds: 0, mode: null, status: 'OFFERED', startedAt: null },
        overtimeStatus: { source: 'REQUESTED', free: true, status: 'OFFERED' },
        canSettle: true,
        offerCalls: 0,
        declineCalls: 0,
        settleCalls: 0,
        salary: 288
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
        queryCanSettleDay: function () { return window.__overlayContract.canSettle; },
        queryActiveTasks: function () { return []; },
        queryTaskConfigs: function () { return []; },
        queryEvidence: function () { return []; },
        queryNpcViews: function () { return []; },
        queryAssignedTasks: function () { return { top: [], all: [], openCount: 0 }; },
        queryRates: function () { return { salaryPerMin: 0, cultivationPerMin: 0, mindPerMin: 0 }; },
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
      true;
    `);
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

    console.log('desktop overlay DOM contract tests passed');
    win.destroy();
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
