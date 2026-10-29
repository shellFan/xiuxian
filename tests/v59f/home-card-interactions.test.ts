import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Exercise the shipped DOM handlers against real services and an isolated save.
if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop/node_modules/electron')) as string;
  const result = spawnSync(electron, [__filename], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, TZ: 'Asia/Shanghai', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, 'home card interaction regressions');
} else {
  void run();
}

async function run(): Promise<void> {
  const { app, BrowserWindow } = require('electron');
  try {
    app.disableHardwareAcceleration();
    app.setPath('userData', require('node:fs').mkdtempSync(join(require('node:os').tmpdir(), 'xiuxian-home-cards-')));
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop/ui-overlay.css'), 'utf8');
    const win = new BrowserWindow({ width: 1280, height: 720, show: false, useContentSize: true,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true } });
    const evaluate = (code: string): Promise<any> => win.webContents.executeJavaScript(code);
    const click = async (selector: string): Promise<void> => {
      assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), true, `control exists: ${selector}`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };
    const text = (selector: string): Promise<string> => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent || ''`);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><style>${css}</style><div id="UiOverlay"></div>`));
    const root = join(process.cwd(), 'tests/.compiled/assets/scripts');
    await evaluate(`(() => {
      const { GameFacade } = require(${JSON.stringify(join(root, 'facade/game-facade.js'))});
      const { FakeClock } = require(${JSON.stringify(join(root, 'core/clock.js'))});
      const { PlayerData } = require(${JSON.stringify(join(root, 'model/player-data.js'))});
      const { MemoryStorageAdapter } = require(${JSON.stringify(join(root, 'services/storage-adapter.js'))});
      const { MergeBoard } = require(${JSON.stringify(join(root, 'game/merge/merge-board.js'))});
      window.testClock = new FakeClock(Date.parse('2026-09-21T09:00:00+08:00'));
      window.__GAME_FACADE__ = new GameFacade({clock: testClock, careerEventClock: testClock,
        player: new PlayerData({lastSaveTime: testClock.now(), salary: 500, fatigue: 60, mind: 20, characterSetupStatus: 'COMPLETE'}),
        storage: new MemoryStorageAdapter(), board: new MergeBoard(), modeSwitchCooldownMs: 0, autoSaveIntervalSeconds: 0});
      window.testFacade = window.__GAME_FACADE__;
      testFacade.chooseProfession('JAVA_BACKEND');
      testFacade.context.gameDay.ensureStarted();
      testFacade.context.messenger.ensureInitialized();
      testFacade.queryNextPresentation = () => null;
    })()`);
    for (const file of ['ui-v59f-home.js', 'ui-merge-home.js', 'ui-overlay-v2.js', 'ui-overlay.js']) {
      await evaluate(`(0,eval)(${JSON.stringify(readFileSync(join(process.cwd(), 'desktop', file), 'utf8'))})`);
    }
    assert.equal(await evaluate(`!!document.querySelector('.ux-hero')`), true);
    assert.equal(await evaluate(`document.querySelectorAll('.ux-hero-action').length`), 4);

    // All four action cards really switch mode and update their detail panel.
    for (const mode of ['FISHING', 'CULTIVATING', 'SOCIAL', 'WORK']) {
      await click(`.ux-hero-action[data-mode="${mode}"]`);
      assert.equal(await evaluate(`testFacade.snapshot().workMode`), mode);
      assert.equal(await evaluate(`document.querySelector('.ux-detail').dataset.detailType`), mode);
      assert.equal(await evaluate(`document.querySelector('.ux-hero-action.is-running').disabled`), true);
    }
    const beforeCultivation = await evaluate('testFacade.snapshot().cultivationExp');
    const mindBeforeCultivation = await evaluate('testFacade.snapshot().mind');
    await click('.ux-hero-cultivate');
    assert.ok(await evaluate('testFacade.snapshot().cultivationExp') > beforeCultivation);
    assert.equal(await evaluate('testFacade.snapshot().mind'), mindBeforeCultivation, 'cultivation does not grant unadvertised mind');
    assert.doesNotMatch(await text('.ux-detail-fx'), /道心/, 'feedback only reports resources actually granted');
    assert.equal(await evaluate(`document.querySelector('.ux-hero-cultivate').disabled`), true);
    await click('[data-action="claimGoal"][data-kind="GROWTH"]');
    assert.equal(await evaluate(`testFacade.queryHomeGoals().find(g => g.kind === 'GROWTH').claimed`), true);
    assert.equal(await evaluate(`testFacade.claimHomeGoal('GROWTH').ok`), false, 'goal cannot pay twice');

    // Recruit, select, cancel, merge: exact real board counts and rewards.
    const count = await evaluate('testFacade.queryBoard().occupiedCount');
    await click('[data-action="mergeRecruit"]');
    await click('[data-action="mergeRecruit"]');
    assert.equal(await evaluate('testFacade.queryBoard().occupiedCount'), count + 2);
    const cells = await evaluate(`Array.from(document.querySelectorAll('.ux-mcell--occ.lv1')).map(e => '[data-action="mergeCell"][data-row="' + e.dataset.row + '"][data-col="' + e.dataset.col + '"]')`);
    assert.ok(cells.length >= 2);
    await click(cells[0]);
    assert.equal(await evaluate(`document.querySelectorAll('.ux-mcell.is-selected').length`), 1);
    await click(cells[0]);
    assert.equal(await evaluate(`document.querySelectorAll('.ux-mcell.is-selected').length`), 0);
    const salaryBeforeMerge = await evaluate('testFacade.snapshot().salary');
    await click(cells[0]);
    await click(cells[1]);
    assert.equal(await evaluate('testFacade.queryBoard().occupiedCount'), count + 1);
    assert.ok(await evaluate('testFacade.snapshot().salary') > salaryBeforeMerge);
    assert.match(await text('.ux-merge-fx'), /升阶/);

    // Every life action uses its advertised price/effects and stops at its limit.
    await evaluate(`testFacade.context.player.salary = 500; testFacade.context.player.fatigue = 60; testFacade.context.player.mind = 20; UiOverlay.refresh()`);
    assert.equal(await evaluate(`document.querySelectorAll('.ux-life [data-action="life"]').length`), 5);
    assert.equal(await evaluate(`document.querySelector('[data-life="DINNER"]').disabled`), true);
    for (const [kind, price] of [['COFFEE', 18], ['MILK_TEA', 16], ['LUNCH', 25], ['SNACK', 8]] as const) {
      const before = await evaluate('testFacade.snapshot().salary');
      await click(`[data-action="life"][data-life="${kind}"]`);
      assert.equal(await evaluate('testFacade.snapshot().salary'), before - price, `${kind} cash debit`);
      assert.match(await text('#ToastBox'), new RegExp('-¥' + price));
      assert.ok(await evaluate(`testFacade.queryRuntimeData().life.some(i => i.kind === '${kind}')`));
    }
    assert.equal(await evaluate('testFacade.context.player.fatigue'), 40, 'coffee and lunch both restore fatigue');
    assert.equal(await evaluate('testFacade.context.player.mind'), 36, 'tea, lunch and snack restore mind');
    assert.equal(await evaluate(`document.querySelector('[data-life="LUNCH"]').disabled`), true);
    await click('[data-action="life"][data-life="COFFEE"]');
    await click('[data-action="life"][data-life="COFFEE"]');
    const exhaustedSalary = await evaluate('testFacade.snapshot().salary');
    await click('[data-action="life"][data-life="COFFEE"]');
    assert.equal(await evaluate('testFacade.snapshot().salary'), exhaustedSalary, 'disabled action cannot spend');
    await evaluate(`testFacade.context.player.salary = 0; UiOverlay.refresh()`);
    assert.equal(await evaluate(`document.querySelector('[data-life="SNACK"]').disabled`), true);
    assert.match(await text('.ux-life'), /余额不足/);
    await click('[data-action="claimGoal"][data-kind="LIFE"]');
    assert.equal(await evaluate(`testFacade.queryHomeGoals().find(g => g.kind === 'LIFE').claimed`), true);

    // Preview and full activity use the same feed; all dialogs close correctly.
    await click('[data-modal="timeline"]');
    assert.match(await text('#PopupLayer'), /喝咖啡/);
    assert.match(await text('#PopupLayer'), /喝奶茶/);
    await click('[data-action="closePopup"]');
    for (const modal of ['agenda', 'evidence']) {
      await click(`[data-modal="${modal}"]`);
      assert.ok((await text('#PopupLayer')).length > 0);
      await click('[data-action="closePopup"]');
      assert.equal((await text('#PopupLayer')).length, 0);
    }

    // The compact work card claims the actual task and advances the work goal.
    await evaluate(`window.testTask = testFacade.queryTaskConfigsByType('DAILY')[0]; testFacade.startTask(testTask.id); UiOverlay.refresh()`);
    assert.match(await text('.ux59f-lite-task'), /进行中/);
    await evaluate(`testClock.advance((testTask.durationSeconds + 1) * 1000); testFacade.tickTasks(); UiOverlay.refresh()`);
    const salaryBeforeClaim = await evaluate('testFacade.snapshot().salary');
    await click('.ux59f-lite-task [data-action="claim"]');
    assert.ok(await evaluate('testFacade.snapshot().salary') > salaryBeforeClaim);
    await click('[data-action="claimGoal"][data-kind="WORK"]');
    assert.equal(await evaluate(`testFacade.queryHomeGoals().find(g => g.kind === 'WORK').claimed`), true);

    // Recovery recommendation performs its command instead of reloading home.
    await evaluate(`testFacade.context.player.fatigue = 75; UiOverlay.refresh()`);
    await click('.ux59f-action[data-mode="FISHING"]');
    assert.equal(await evaluate('testFacade.snapshot().workMode'), 'FISHING');
    assert.match(await text('.ux59f-action--static'), /恢复中/);

    // All home shortcut destinations and return navigation remain usable.
    for (const selector of ['.ux-hero-link[data-page="sect"]', '.ux-hero-link[data-page="techniques"]',
      '.ux-topbar-shortcuts [data-nav="TASKS"]', '.ux-topbar-shortcuts [data-nav="PROJECT"]',
      '.ux-topbar-shortcuts [data-page="npc"]', '.ux-topbar-shortcuts [data-nav="CRAFT"]',
      '.ux-topbar-shortcuts [data-action="settings"]', '.ux-messenger-widget [data-action="openMessenger"]']) {
      await click(selector);
      assert.equal(await evaluate(`!!document.querySelector('.ux-home')`), false, `navigated: ${selector}`);
      assert.ok((await text('#UiBody')).length > 0);
      await click('[data-nav="HOME"]');
      assert.equal(await evaluate(`!!document.querySelector('.ux-home')`), true);
    }

    await evaluate(`testFacade.devAdvanceTime(9*60*60*1000); testFacade.context.player.salary = 500; UiOverlay.refresh()`);
    await click('[data-action="life"][data-life="DINNER"]');
    assert.equal(await evaluate('testFacade.snapshot().salary'), 432, 'after-work dinner debits its real price');
    assert.equal(await evaluate(`document.querySelector('[data-life="DINNER"]').disabled`), true);

    // Portrait scrolling reaches the final card without horizontal clipping.
    win.setContentSize(390, 844);
    await evaluate(`UiOverlay.refresh(); document.querySelector('.ux-life').scrollIntoView({block:'end'})`);
    const layout = await evaluate(`(() => { const body = document.querySelector('#UiBody'); const r = document.querySelector('.ux-life').getBoundingClientRect(); return {width:body.scrollWidth,client:body.clientWidth,bottom:r.bottom,nav:document.querySelector('.ux-nav').getBoundingClientRect().top,overflow:Array.from(body.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0,12).map(e=>[e.className,Math.round(e.getBoundingClientRect().width)])}; })()`);
    assert.ok(layout.width <= layout.client + 1, 'portrait has no horizontal overflow: ' + JSON.stringify(layout));
    assert.ok(layout.bottom <= layout.nav + 1, 'last card can scroll above navigation');
    await evaluate('testFacade.destroy()');
    win.destroy();
    console.log('Home cards: modes, cultivation, merge, goals, all life actions, dialogs, shortcuts and portrait layout passed');
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
