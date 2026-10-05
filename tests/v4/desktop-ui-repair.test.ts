import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ELECTRON_CHILD_FLAG = '--desktop-ui-repair-child';

if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop', 'node_modules', 'electron')) as string;
  const result = spawnSync(electron, [__filename, ELECTRON_CHILD_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `Electron UI repair contract exited with ${result.status}`);
} else {
  void runInElectron();
}

async function runInElectron(): Promise<void> {
  const { app, BrowserWindow } = require('electron') as {
    app: { disableHardwareAcceleration(): void; whenReady(): Promise<void>; exit(code: number): void; quit(): void };
    BrowserWindow: new (options: Record<string, unknown>) => ElectronWindow;
  };
  try {
    app.disableHardwareAcceleration();
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');
    const source = process.env.UI_REPAIR_BASELINE === '1'
      ? execFileSync('git', ['show', 'HEAD:desktop/ui-overlay.js'], { encoding: 'utf8', cwd: process.cwd() })
      : readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');
    const facadeModule = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'facade', 'game-facade.js');
    const win = new BrowserWindow({
      width: 1280, height: 720, useContentSize: true, show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><div id="UiOverlay"></div></body></html>',
    )}`);
    const setup = await win.webContents.executeJavaScript(`(function () { try {
      var state = { battle: null, started: null, incident: { id: 'inc-s2', type: 'DISK_FULL', severity: 'S2', status: 'DETECTED' } };
      var realSelector = require(${JSON.stringify(facadeModule)}).GameFacade.prototype.queryNextPresentation;
      window.__UI_REPAIR__ = state;
      window.V2UI = {
        init: function (host) { this.host = host; },
        situationHtml: function () { return ''; }, promotionPageHtml: function () { return ''; },
        messengerIncidentBannerHtml: function () { return ''; },
        maybeShowV2EventModal: function () {}, maybeShowWeekendModal: function () {}, maybeShowSettlementModal: function () {}, showDefenseModal: function () {}
      };
      window.__GAME_FACADE__ = {
        snapshot: function () { return { careerLevel: 2, salary: 520, performance: 72, cultivationExp: 166, spiritStones: 42, mind: 86, maxMind: 100, workMode: 'WORK', isFishingMode: false, salaryEfficiency: 1, cultivationEfficiency: 1 }; },
        queryCareer: function () { return { name: '筑基牛马', realm: '筑基一层', requiredExp: 400 }; }, querySect: function () { return { id: 'sect', name: '摸鱼宗' }; }, queryKpi: function () { return { items: [] }; }, isProfessionSelected: function () { return true; },
        queryWorkToday: function () { return { countdownMs: 300000, standardWorkSeconds: 28500, overtimeSeconds: 0, freeOvertimeSeconds: 0, paidFishingSalary: 0, timeline: [] }; },
        queryOvertime: function () { return null; }, queryOvertimeStatus: function () { return { status: 'NONE' }; },
        queryGameClock: function () { return { hour: 16, minute: 20, weekday: 2, isWeekend: false, isWorkingHours: true }; }, queryGameDay: function () { return { dayIndex: 2, income: { salary: 520 }, settlementInputs: { paidFishingSalary: 0 } }; },
        queryCanSettleDay: function () { return false; }, queryRates: function () { return { salaryPerMin: 1.2, cultivationPerMin: 0.4, mindPerMin: 0.1 }; },
        queryTodayCapacity: function () { return { remainingWorkMinutes: 95, remainingPlanMinutes: 20, projectedOffWorkTime: '18:00', overload: true, advice: '建议砍掉一项低优先级需求' }; },
        queryCompany: function () { return { id: 'big', name: '大厂卷王', desc: '事故多，工资高', salaryMultiplier: 1.35 }; }, queryTodaySituation: function () { return { name: '需求暴涨', desc: '需求如潮', }; },
        queryDailySituation: function () { return { company: { name: '需求暴涨', description: '需求如潮' }, boss: { name: '老板盯梢', description: '在线' }, project: { name: '项目延期', description: '延期' }, personal: { name: '道心波动', description: '波动' } }; },
        queryFatigueView: function () { return { value: 72, band: 'HEAVY', bandName: '疲劳偏高', advice: '建议休息' }; }, queryBurnout: function () { return { state: 'STRESSED', score: 61, stateName: '压力上升', advice: '注意休息' }; },
        queryNowGoal: function () { return { id: 'goal-now' }; }, queryGoals: function () { return [{ action: 'none', icon: '🧭', text: '按计划推进', sub: '保持节奏', btn: '脚踏实地' }]; }, queryTomorrowHook: function () { return '明天有评审'; },
        queryIncidentState: function () { return { active: state.incident, recent: [], risk: 2 }; },
        queryOfflineDecisions: function () { return { session: null, current: null, items: [], overflowSummary: null }; }, queryV2CurrentEvent: function () { return null; }, queryCurrentEvent: function () { return null; }, queryBattle: function () { return state.battle; }, queryFinishedBattle: function () { return null; },
        queryNextPresentation: function (candidates) { return realSelector.call(this, candidates); },
        queryAssignedTasks: function () { return { top: [], all: [], openCount: 0 }; }, queryMessengerBadge: function () { return { totalUnread: 0, hasCritical: false }; }, queryConversations: function () { return []; }, queryEvidence: function () { return []; },
        queryBattleBuildOptions: function () { return [{ id: 'build_java', name: 'Java剑' }]; },
        startBattleRun: function (source, buildId, linkedTaskId, linkedIncidentId) { state.started = { source: source, buildId: buildId, linkedTaskId: linkedTaskId, linkedIncidentId: linkedIncidentId }; state.battle = { linkedIncidentId: linkedIncidentId, wave: 0, waveTotal: 3, level: 2, kills: 0 }; return state.battle; },
        queryProfessionDepth: function () { return null; }
      };
      return { ok: true };
    } catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; } })()`);
    assert.equal(setup.ok, true, setup.message);
    const loaded = await win.webContents.executeJavaScript(`(function () { try { (0, eval)(${JSON.stringify(source)}); return { ok: true }; } catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; } })()`);
    assert.equal(loaded.ok, true, loaded.message);
    await waitFor(win, `document.querySelector('.ux-topbar-pending') !== null`);
    const firstView = await win.webContents.executeJavaScript(`(function () {
      var rect = function (s) { var e = document.querySelector(s); var r = e && e.getBoundingClientRect(); return r ? { w: r.width, h: r.height, top: r.top, bottom: r.bottom } : null; };
      return {
        statusCount: document.querySelectorAll('.ux-home-status > *').length,
        scene: rect('.ux-scene'), sceneStrip: rect('.ux-scene-strip'), actions: rect('.ux-actions'), detail: rect('.ux-detail'),
        actionButtons: Array.prototype.every.call(document.querySelectorAll('.ux-action'), function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
        primary: (function () { var e = document.querySelector('.ux-detail-side .ux-btn'); return !!e && e.getBoundingClientRect().height > 0; })(),
        bodyOverflow: document.querySelector('#UiBody').scrollWidth > document.querySelector('#UiBody').clientWidth,
        journeyTag: document.querySelector('.ux-journey--static') !== null,
        hook: document.body.innerText.indexOf('明天有评审') >= 0
      };
    })()`);
    assert.equal(firstView.statusCount, 4, 'metadata is consolidated into one status row');
    assert.ok(firstView.scene && firstView.scene.h >= 140, `countdown scene remains readable (${JSON.stringify(firstView.scene)})`);
    assert.ok(firstView.scene && firstView.sceneStrip && firstView.sceneStrip.bottom <= firstView.scene.bottom + 1, `scene controls stay inside the scene (${JSON.stringify(firstView)})`);
    assert.ok(firstView.actions && firstView.actions.h >= 90, `action selectors remain intact (${JSON.stringify(firstView.actions)})`);
    assert.ok(firstView.detail && firstView.detail.h >= 120, `action detail remains usable (${JSON.stringify(firstView.detail)})`);
    assert.equal(firstView.actionButtons, true, 'all four action selectors remain clickable');
    assert.equal(firstView.primary, true, 'primary detail button remains visible');
    assert.equal(firstView.bodyOverflow, false, 'home has no horizontal overflow');
    assert.equal(firstView.journeyTag, true, 'non-action goal is rendered as a status');
    assert.equal(firstView.hook, true, 'tomorrow hook remains visible beside static goal');

    const scrollCheck = await win.webContents.executeJavaScript(`(function () {
      var host = document.querySelector('.ux-home-center');
      host.scrollTop = host.scrollHeight;
      var before = host.scrollTop;
      window.UiOverlay.refresh();
      host = document.querySelector('.ux-home-center');
      var after = host.scrollTop;
      var buttons = Array.prototype.map.call(document.querySelectorAll('.ux-detail-side .ux-btn'), function (e) { var r = e.getBoundingClientRect(); return { h: r.height, bottom: r.bottom }; });
      var hr = host.getBoundingClientRect();
      return { before: before, after: after, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight, buttons: buttons, hostBottom: hr.bottom };
    })()`);
    assert.ok(scrollCheck.before > 0, 'center column owns overflow for long home content');
    assert.ok(scrollCheck.after > 0, `center scroll position survives refresh (${JSON.stringify(scrollCheck)})`);
    assert.ok(scrollCheck.buttons.length >= 2 && scrollCheck.buttons.every((button: { h: number; bottom: number }) => button.h > 0 && button.bottom <= scrollCheck.hostBottom + 1), 'both detail actions are reachable after scrolling the center');

    await win.webContents.executeJavaScript(`document.querySelector('.ux-topbar-pending').click()`);
    await waitFor(win, `document.querySelector('.ux-dialog-actions .ux-btn') !== null`);
    const modal = await win.webContents.executeJavaScript(`({ title: document.querySelector('.ux-dialog-title').innerText, body: document.querySelector('.ux-dialog-body').innerText })`);
    assert.match(modal.title, /S2/);
    assert.match(modal.body, /磁盘写满/);
    await win.webContents.executeJavaScript(`document.querySelector('.ux-dialog-actions .ux-btn').click()`);
    await waitFor(win, `window.__UI_REPAIR__.started !== null`);
    const started = await win.webContents.executeJavaScript(`window.__UI_REPAIR__.started`);
    assert.deepEqual(started, { source: 'INCIDENT', buildId: 'build_java', linkedTaskId: null, linkedIncidentId: 'inc-s2' }, 'S2 action enters a linked incident battle');

    await win.webContents.executeJavaScript(`window.UiOverlay.goto('HOME')`);
    await waitFor(win, `document.querySelector('.ux-topbar-pending') !== null`);
    await win.webContents.executeJavaScript(`document.querySelector('.ux-topbar-pending').click()`);
    await waitFor(win, `document.querySelector('.ux-header-title') && document.querySelector('.ux-header-title').innerText === '项目攻坚'`);
    const resumedFromBadge = await win.webContents.executeJavaScript(`({ page: document.querySelector('.ux-header-title') && document.querySelector('.ux-header-title').innerText, toast: document.querySelector('#ToastBox') && document.querySelector('#ToastBox').innerText })`);
    assert.equal(resumedFromBadge.page, '项目攻坚', 'the badge resumes a matching linked incident battle');
    assert.equal(resumedFromBadge.toast.indexOf('暂无可处理') >= 0, false, 'resume does not show a misleading empty toast');

    await win.webContents.executeJavaScript(`window.UiOverlay.refresh()`);
    const resumed = await win.webContents.executeJavaScript(`({ page: document.querySelector('.ux-header-title') && document.querySelector('.ux-header-title').innerText, banner: !!document.querySelector('.ux-battle2') })`);
    assert.equal(resumed.page, '项目攻坚');
    assert.equal(resumed.banner, true, 'matching incident battle remains resumable after refresh');
    console.log('desktop UI repair contract tests passed');
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
