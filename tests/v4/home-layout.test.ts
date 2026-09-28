import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const STEP_LOG = join(process.cwd(), 'tmp', 'home-test-steps.log');
function step(msg: string): void {
  try { appendFileSync(STEP_LOG, msg + '\n'); } catch { /* noop */ }
}

/**
 * 方案 B 首页回归（§109~§120 / §169~§176）：
 *  - 1280×720 / 1600×900 / 1920×1080 单屏无纵向滚动
 *  - 动作选择器：点击哪个卡，详情立即切换（不滚动、不跳页、不弹 Modal）
 *  - 四套详情契约（work / fishing / cultivating / social）
 *  - 默认选中跟随当前工作状态；刷新后不回跳 WORK（§175/§176）
 *  - 加班询问只出现在 17:55 前后，18:00 出现结算（§103~§107）
 */

const ELECTRON_CHILD_FLAG = '--home-layout-child';

if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop', 'node_modules', 'electron')) as string;
  const result = spawnSync(electron, [__filename, ELECTRON_CHILD_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `home layout contract exited with ${result.status}`);
} else {
  void runInElectron();
}

async function runInElectron(): Promise<void> {
  const { app, BrowserWindow } = require('electron') as {
    app: { disableHardwareAcceleration(): void; whenReady(): Promise<void>; quit(): void; exit(code: number): void };
    BrowserWindow: new (options: Record<string, unknown>) => ElectronWindow;
  };
  try {
    try { rmSync(STEP_LOG, { force: true }); } catch { /* noop */ }
    step('begin');
    app.disableHardwareAcceleration();
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');
    const overlay = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');

    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    step('win created, loading');
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);

    await win.webContents.executeJavaScript(`(function () { try {
      window.__home = {
        clock: { dayNumber: 1, hour: 10, minute: 0, weekday: 1, isWeekend: false, isWorkingHours: true },
        work: { countdownMs: 8 * 3600 * 1000, standardWorkSeconds: 3600, overtimeSeconds: 0, freeOvertimeSeconds: 0, paidFishingSalary: 0, timeline: [] },
        overtime: null,
        overtimeStatus: null,
        workMode: 'WORK',
        cultivateCalls: 0,
        modeCalls: [],
        cultivateCooldown: 0,
      };
      window.V2UI = { init: function () {} };
      window.__GAME_FACADE__ = {
        snapshot: function () { return { careerLevel: 1, salary: 288, performance: 35, cultivationExp: 166, spiritStones: 42, mind: 86, maxMind: 100, workMode: window.__home.workMode, isFishingMode: false, salaryEfficiency: 1, cultivationEfficiency: 1 }; },
        queryCareer: function () { return { name: '实习牛马', realm: '炼气一层', requiredExp: 1000 }; },
        queryKpi: function () { return { items: [] }; },
        queryGameClock: function () { return Object.assign({}, window.__home.clock); },
        queryWorkToday: function () { return Object.assign({}, window.__home.work); },
        queryOvertime: function () { return window.__home.overtime ? Object.assign({}, window.__home.overtime) : null; },
        queryOvertimeStatus: function () { return window.__home.overtimeStatus ? Object.assign({}, window.__home.overtimeStatus) : null; },
        queryGameDay: function () { return { dayIndex: 1, income: { salary: 3.2 }, settlementInputs: { paidFishingSalary: window.__home.work.paidFishingSalary } }; },
        queryCanSettleDay: function () { return window.__home.clock.hour >= 18; },
        queryCultivationCooldown: function () { return window.__home.cultivateCooldown; },
        cultivate: function () { window.__home.cultivateCalls += 1; return { cultivationExp: 4, totalExp: 170, cooldownSeconds: 5, cooldownRemaining: 0, mindEfficiency: 1 }; },
        changeWorkMode: function (mode) { window.__home.modeCalls.push(mode); window.__home.workMode = mode; return { success: true }; },
        queryActiveTasks: function () { return []; },
        queryTaskConfigs: function () { return []; },
        queryEvidence: function () { return [{ type: 'GIT', label: 'Git提交记录' }]; },
        queryNpcViews: function () {
          return [
            { name: '小师妹', title: '实习生', description: '', influence: '', value: 30, stageLabel: '亲近' },
            { name: '老油条', title: '老员工', description: '', influence: '', value: 10, stageLabel: '熟络' },
          ];
        },
        queryAssignedTasks: function () {
          return { top: [{ id: 't1', title: '修复登录接口偶发报错', priority: 'P0', source: 'BOSS' }], all: [], openCount: 1 };
        },
        queryBattle: function () { return null; },
        queryIncidentState: function () { return { active: null, recent: [], risk: 0 }; },
        queryOfflineDecisions: function () { return { session: null, current: null, items: [], overflowSummary: null }; },
        queryV2CurrentEvent: function () { return null; },
        queryWeekendChosen: function () { return true; },
        queryWeekendOptions: function () { return []; },
        queryCurrentEvent: function () { return null; },
        queryFinishedBattle: function () { return null; },
        queryNextPresentation: function () { return null; },
      };
      return { ok: true };
    } catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; } })()`);
    await win.webContents.executeJavaScript(`(function () { try { (0, eval)(${JSON.stringify(overlay)}); return { ok: true }; } catch (error) { return { ok: false, message: error && error.stack ? error.stack : String(error) }; } })()`);
    step('overlay eval done');
    await waitFor(win, `document.querySelector('[data-select-action="WORK"]') !== null`);
    step('home rendered');

    /* 1. 三个分辨率单屏无滚动（§169/§170） */
    const viewports: Array<[string, number, number]> = [['1280', 1280, 720], ['1600', 1600, 900], ['1920', 1920, 1080]];
    for (const [name, width, height] of viewports) {
      step('size ' + name);
      await win.setContentSize(width, height);
      await delay(320);
      const state = await win.webContents.executeJavaScript(`({
        fits: document.querySelector('#UiBody').scrollHeight <= document.querySelector('#UiBody').clientHeight,
        metrics: [document.querySelector('#UiBody').scrollHeight, document.querySelector('#UiBody').clientHeight],
        columns: getComputedStyle(document.querySelector('.ux-home')).gridTemplateColumns.split(' ').length,
        bottomNav: document.querySelector('.ux-nav').getBoundingClientRect().bottom <= innerHeight + 1,
        detailVisible: document.querySelector('.ux-detail[data-detail-type]') !== null
      })`);
      assert.equal(state.fits, true, `${name}×${height} home must not scroll vertically (${state.metrics.join(' > ')})`);
      assert.equal(state.columns, 3, `${name}×${width} keeps left/center/right columns`);
      assert.equal(state.bottomNav, true, `${name} bottom navigation stays inside the viewport`);
      assert.equal(state.detailVisible, true, `${name} action detail panel is rendered`);
    }
    await win.setContentSize(1280, 720);
    await delay(320);

    /* 2. 动作选择器：点击切换详情（§169 一百七十一~一百七十四） */
    step('sizes done');
    for (const action of ['FISHING', 'CULTIVATION', 'SOCIAL', 'WORK'].map(fix)) {
      try {
        await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="${action}"]').click()`);
        step('clicked ' + action);
      } catch (e) { step('CLICK FAILED ' + action + ': ' + String(e)); throw e; }
      const detail = await win.webContents.executeJavaScript(`({
        type: document.querySelector('.ux-detail').getAttribute('data-detail-type'),
        selected: document.querySelector('.ux-action.is-selected').getAttribute('data-select-action')
      })`);
      step('detail ' + action + ' -> ' + JSON.stringify(detail));
      assert.equal(detail.type, action, `clicking ${action} switches the detail panel`);
      assert.equal(detail.selected, action, `clicking ${action} highlights its card`);
    }

    /* 3. WORK 详情契约（§34~§35） */
    await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="WORK"]').click()`);
    step('re-clicked WORK');
    const workDetail = await win.webContents.executeJavaScript(`({
      title: document.querySelector('.ux-detail-title').textContent,
      body: document.querySelector('.ux-detail-body').textContent,
      primary: document.querySelector('.ux-detail-side .ux-btn').textContent,
      secondary: document.querySelectorAll('.ux-detail-side .ux-btn')[1] ? document.querySelectorAll('.ux-detail-side .ux-btn')[1].textContent : ''
    })`);
    step('workDetail: ' + JSON.stringify(workDetail));
    assert.match(workDetail.title, /努力工作/);
    assert.match(workDetail.body, /修复登录接口偶发报错/, 'work detail shows the assigned task (§34)');
    assert.match(workDetail.secondary, /进入项目/, 'work detail exposes 进入项目 (§34)');

    /* 4. 空待办文案（§35） */
    step('sec4 begin');
    await win.webContents.executeJavaScript(`
      window.__GAME_FACADE__.queryAssignedTasks = function () { return { top: [], all: [], openCount: 0 }; };
      window.UiOverlay.refresh();
    `);
    step('sec4 refreshed');
    assert.match(await textOf(win, '.ux-detail-body'), /暂时没人塞活/);
    step('sec4 empty text ok');
    await win.webContents.executeJavaScript(`
      window.__GAME_FACADE__.queryAssignedTasks = function () {
        return { top: [{ id: 't1', title: '修复登录接口偶发报错', priority: 'P0', source: 'BOSS' }], all: [], openCount: 1 };
      };
      true;
    `);

    /* 5. FISHING 详情契约（§36~§38） */
    await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="FISHING"]').click()`);
    const fishingDetail = await win.webContents.executeJavaScript(`({
      desc: (document.querySelector('.ux-detail-desc') || {}).textContent || '',
      primary: document.querySelector('.ux-detail-side .ux-btn').textContent
    })`);
    assert.match(await textOf(win, '.ux-detail-title'), /带薪摸鱼/);
    assert.match(fishingDetail.desc, /公司将为本次修仙支付工资/, 'fishing detail carries the paid line (§37)');
    assert.match(fishingDetail.primary, /开始摸鱼/, 'fishing primary starts the mode');

    /* 6. CULTIVATION 详情 + 真实修炼调用 + 反馈（§31~§33） */
    step('sec6 begin');
    await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="CULTIVATING"]').click()`);
    assert.match(await textOf(win, '.ux-detail-title'), /修炼一次/);
    await win.webContents.executeJavaScript(`document.querySelector('.ux-detail-side [data-action="cultivate"]').click()`);
    step('cultivate clicked');
    const cultivateState = await win.webContents.executeJavaScript(`({
      calls: window.__home.cultivateCalls,
      fx: document.querySelector('.ux-detail-fx') !== null,
      fxText: (document.querySelector('.ux-detail-fx') || {}).textContent || ''
    })`);
    assert.equal(cultivateState.calls, 1, '开始修炼 must invoke the real facade.cultivate() (§32)');
    assert.equal(cultivateState.fx, true, 'cultivation gain chips animate in the detail panel (§140~§143)');
    assert.match(cultivateState.fxText, /修为 \+4/);

    /* 7. SOCIAL 详情契约（§39~§41） */
    await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="SOCIAL"]').click()`);
    assert.match(await textOf(win, '.ux-detail-title'), /社交划水/);
    assert.match(await textOf(win, '.ux-detail-body'), /小师妹/, 'social detail recommends NPCs (§39)');

    /* 8. 冷却中的修炼按钮要说明原因（§85） */
    await win.webContents.executeJavaScript(`
      window.__home.cultivateCooldown = 30;
      window.UiOverlay.refresh();
    `);
    await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="CULTIVATING"]').click()`);
    const cdBtn = await win.webContents.executeJavaScript(`({
      label: document.querySelector('.ux-detail-side [data-action="cultivate"], .ux-detail-side .ux-btn[disabled]').textContent,
      why: (document.querySelector('.ux-detail-why') || {}).textContent || ''
    })`);
    assert.match(cdBtn.label, /冷却中/, 'cooldown is announced on the button (§85)');
    assert.ok(cdBtn.why.length > 0, 'disabled state explains why (§85)');
    await win.webContents.executeJavaScript(`window.__home.cultivateCooldown = 0;`);

    /* 9. 默认选中跟随工作状态，刷新后不回跳（§88~§91/§175/§176） */
    const win2 = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    await win2.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);
    await win2.webContents.executeJavaScript(`(function () {
      window.__home = {
        clock: { dayNumber: 1, hour: 10, minute: 0, weekday: 1, isWeekend: false, isWorkingHours: true },
        work: { countdownMs: 8 * 3600 * 1000, standardWorkSeconds: 3600, overtimeSeconds: 0, freeOvertimeSeconds: 0, paidFishingSalary: 1.23, timeline: [] },
        overtime: null, overtimeStatus: null, workMode: 'FISHING',
        cultivateCalls: 0, modeCalls: [], cultivateCooldown: 0
      };
      window.V2UI = { init: function () {} };
      window.__GAME_FACADE__ = {
        snapshot: function () { return { careerLevel: 1, salary: 288, performance: 35, cultivationExp: 166, spiritStones: 42, mind: 86, maxMind: 100, workMode: window.__home.workMode, isFishingMode: true, salaryEfficiency: 1, cultivationEfficiency: 1 }; },
        queryCareer: function () { return { name: '实习牛马', realm: '炼气一层', requiredExp: 1000 }; },
        queryKpi: function () { return { items: [] }; },
        queryGameClock: function () { return Object.assign({}, window.__home.clock); },
        queryWorkToday: function () { return Object.assign({}, window.__home.work); },
        queryOvertime: function () { return window.__home.overtime ? Object.assign({}, window.__home.overtime) : null; },
        queryOvertimeStatus: function () { return window.__home.overtimeStatus ? Object.assign({}, window.__home.overtimeStatus) : null; },
        queryGameDay: function () { return { dayIndex: 1, income: { salary: 3.2 }, settlementInputs: { paidFishingSalary: window.__home.work.paidFishingSalary } }; },
        queryCanSettleDay: function () { return window.__home.clock.hour >= 18; },
        queryCultivationCooldown: function () { return window.__home.cultivateCooldown; },
        cultivate: function () { window.__home.cultivateCalls += 1; return { cultivationExp: 4, totalExp: 170, cooldownSeconds: 5, cooldownRemaining: 0, mindEfficiency: 1 }; },
        changeWorkMode: function (mode) { window.__home.modeCalls.push(mode); window.__home.workMode = mode; return { success: true }; },
        queryActiveTasks: function () { return []; },
        queryTaskConfigs: function () { return []; },
        queryEvidence: function () { return []; },
        queryNpcViews: function () { return []; },
        queryAssignedTasks: function () { return { top: [], all: [], openCount: 0 }; },
        queryBattle: function () { return null; },
        queryIncidentState: function () { return { active: null, recent: [], risk: 0 }; },
        queryOfflineDecisions: function () { return { session: null, current: null, items: [], overflowSummary: null }; },
        queryV2CurrentEvent: function () { return null; },
        queryWeekendChosen: function () { return true; },
        queryWeekendOptions: function () { return []; },
        queryCurrentEvent: function () { return null; },
        queryFinishedBattle: function () { return null; },
        queryNextPresentation: function () { return null; }
      };
    })()`);
    await win2.webContents.executeJavaScript(`(0, eval)(${JSON.stringify(overlay)})`);
    await waitFor(win2, `document.querySelector('[data-detail-type]') !== null`);
    assert.equal(
      await win2.webContents.executeJavaScript(`document.querySelector('.ux-detail').getAttribute('data-detail-type')`),
      'FISHING',
      'fishing state defaults the selector to FISHING (§90)',
    );
    assert.match(await textOf(win2, '.ux-detail-body'), /本次摸鱼已入账/, 'running fishing detail shows session earnings (§38)');
    assert.equal(
      await win2.webContents.executeJavaScript(`document.querySelector('.ux-action.is-running').getAttribute('data-select-action')`),
      'FISHING',
      'running card is flagged (§83)',
    );

    /* 10. 加班只在对应时段出现（§103~§107） */
    await win2.webContents.executeJavaScript(`
      window.__home.clock = { dayNumber: 1, hour: 16, minute: 0, weekday: 1, isWeekend: false, isWorkingHours: true };
      window.__home.workMode = 'WORK';
      window.UiOverlay.refresh();
    `);
    assert.equal(
      await win2.webContents.executeJavaScript(`document.querySelector('[data-action="voluntaryOvertime"]') !== null`),
      false,
      'no permanent overtime upsell before 17:30 (§103/§105)',
    );
    await win2.webContents.executeJavaScript(`
      window.__home.clock = { dayNumber: 1, hour: 17, minute: 55, weekday: 1, isWeekend: false, isWorkingHours: true };
      window.__home.overtime = { source: 'REQUESTED', free: true, plannedSeconds: 7200, elapsedSeconds: 0, mode: null, status: 'OFFERED', startedAt: null };
      window.__home.overtimeStatus = { source: 'REQUESTED', free: true, status: 'OFFERED' };
      window.__home.work.countdownMs = 300000;
      window.UiOverlay.refresh();
    `);
    const offer = await win2.webContents.executeJavaScript(`({
      accept: clickable('[data-action="acceptFreeOvertime"]'),
      decline: clickable('[data-action="declineOvertime"]')
    })`);
    assert.equal(offer.accept && offer.decline, true, '17:55 OFFERED exposes accept/decline controls');

    await win2.webContents.executeJavaScript(`
      window.__home.clock = { dayNumber: 1, hour: 18, minute: 0, weekday: 1, isWeekend: false, isWorkingHours: false };
      window.__home.overtime = null; window.__home.overtimeStatus = null;
      window.__home.work.countdownMs = 0;
      window.UiOverlay.refresh();
    `);
    const settled = await win2.webContents.executeJavaScript(`({
      settle: clickable('[data-action="doSettle"]'),
      headline: document.querySelector('.ux-scene-label').textContent
    })`);
    assert.equal(settled.settle, true, '18:00 exposes settlement control');
    assert.match(settled.headline, /工资已经停止增长/, '18:00 headline follows §20');

    console.log('home layout & action selector contract tests passed');
    win.destroy();
    win2.destroy();
    app.quit();
  } catch (error) {
    step('CAUGHT: ' + String((error as Error).stack || error));
    console.error(error);
    app.exit(1);
  }
}

/* 测试里的 CULTIVATION 选择器 id 是 CULTIVATING（工作模式枚举），这里统一 */
function fix(id: string): string {
  return id === 'CULTIVATION' ? 'CULTIVATING' : id;
}

function textOf(win: ElectronWindow, selector: string): Promise<string> {
  return win.webContents.executeJavaScript(`(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ''`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ElectronWindow {
  setContentSize(width: number, height: number): void;
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
