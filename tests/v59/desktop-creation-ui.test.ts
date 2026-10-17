import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHILD_FLAG = '--v59-creation-ui-child';
const overlayContract = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');
assert.match(overlayContract, /疲劳增长降低 20%/);
assert.match(overlayContract, /职业技能成长提高 20%/);
assert.match(overlayContract, /摸鱼奇遇权重效果尚未接入/);
assert.match(overlayContract, /成功化解责任事件后，绩效成长提高 50%/);
assert.match(overlayContract, /技术任务进度提高 10%/);
assert.match(overlayContract, /正向关系成长提高 25%/);

if (!process.versions.electron) {
  const electron = require(join(process.cwd(), 'desktop', 'node_modules', 'electron')) as string;
  const result = spawnSync(electron, [__filename, CHILD_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `V5.9 creation UI exited with ${result.status}`);
} else {
  void runInElectron();
}

async function runInElectron(): Promise<void> {
  const { app, BrowserWindow } = require('electron') as {
    app: { disableHardwareAcceleration(): void; whenReady(): Promise<void>; exit(code: number): void };
    BrowserWindow: new (options: Record<string, unknown>) => TestWindow;
  };
  try {
    app.disableHardwareAcceleration();
    await app.whenReady();
    const css = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.css'), 'utf8');
    const overlay = readFileSync(join(process.cwd(), 'desktop', 'ui-overlay.js'), 'utf8');
    const facadePath = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'facade', 'game-facade.js');
    const storagePath = join(process.cwd(), 'tests', '.compiled', 'assets', 'scripts', 'services', 'storage-adapter.js');
    const win = new BrowserWindow({
      width: 1280, height: 720, useContentSize: true, show: false,
      webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true },
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="UiOverlay"></div></body></html>`,
    )}`);
    const setup = await win.webContents.executeJavaScript(`(function () {
      var GameFacade = require(${JSON.stringify(facadePath)}).GameFacade;
      var MemoryStorageAdapter = require(${JSON.stringify(storagePath)}).MemoryStorageAdapter;
      window.__V59_STORAGE__ = new MemoryStorageAdapter();
      window.__GAME_FACADE__ = new GameFacade({
        storage: window.__V59_STORAGE__, board: null, modeSwitchCooldownMs: 0,
        characterSeedProvider: () => 2
      });
      return typeof window.__GAME_FACADE__.queryCharacterCreation === 'function';
    })()`);
    assert.equal(setup, true);
    const loaded = await win.webContents.executeJavaScript(`(function () {
      try { (0, eval)(${JSON.stringify(overlay)}); return true; }
      catch (error) { return error && error.stack ? error.stack : String(error); }
    })()`);
    assert.equal(loaded, true, String(loaded));
    await win.webContents.executeJavaScript(readFileSync(join(process.cwd(), 'desktop', 'ui-home-arena.js'), 'utf8'));
    await waitFor(win, `document.querySelector('.v59-creation .v59-stepper span') !== null`);

    const sevenSteps = await win.webContents.executeJavaScript(`document.querySelectorAll('.v59-stepper span').length`);
    assert.equal(sevenSteps, 7);
    const creationArbitration = await win.webContents.executeJavaScript(`(() => {
      const f = window.__GAME_FACADE__, original = f.queryMessengerBadge;
      f.queryMessengerBadge = () => ({hasCritical:true,criticalUnread:1});
      window.UiOverlay.dispatchNextModal();
      f.queryMessengerBadge = original;
      return !!document.querySelector('#PopupLayer .ux-modal-layer');
    })()`);
    assert.equal(creationArbitration, false, 'pending messages cannot obscure unfinished character creation');
    await click(win, '[data-creation-choice="industry:INTERNET"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice="direction:TECH_RND"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice="profession:QA"]');
    await click(win, '[data-creation-action="advance"]');
    await win.webContents.executeJavaScript(`document.querySelector('#v59-nickname').value = '青云牛马'`);
    await click(win, '[data-creation-choice="avatar:avatar-2"]');
    const identityScrollBefore = await win.webContents.executeJavaScript(`(function () {
      var content = document.querySelector('.v59-step-content');
      content.scrollTop = content.scrollHeight;
      return { top: content.scrollTop, height: content.scrollHeight, client: content.clientHeight };
    })()`);
    assert.ok(identityScrollBefore.top > 0, 'identity form has a real scroll position before selecting a background');
    await click(win, '[data-creation-choice="background:CULTIVATION_GRAD"]');
    const identityScrollAfter = await win.webContents.executeJavaScript(`({
      top: document.querySelector('.v59-step-content').scrollTop,
      selected: document.querySelector('[data-creation-choice="background:CULTIVATION_GRAD"]').classList.contains('is-selected'),
      authoritative: window.__GAME_FACADE__.queryCharacterCreation().draft.background
    })`);
    assert.ok(identityScrollAfter.top > 0, 'selecting a background preserves the visible identity form scroll position');
    assert.equal(identityScrollAfter.selected, true, 'background selection is reflected by the UI');
    assert.equal(identityScrollAfter.authoritative, 'CULTIVATION_GRAD', 'background selection updates the authoritative creation draft');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice^="candidate:"]');
    await click(win, '[data-creation-action="advance"]');
    const initialAllocationControls = await win.webContents.executeJavaScript(`(() => {
      const button = (stat, delta) => document.querySelector('[data-creation-action="allocate"][data-stat="' + stat + '"][data-delta="' + delta + '"]');
      const insightPlus = button('insight', 5), insightMinus = button('insight', -1), willpowerPlus = button('willpower', 5);
      return {
        insightBase: window.__GAME_FACADE__.queryCharacterCreation().draft.candidates[0].attributes.insight,
        insightPlusExists: !!insightPlus,
        insightPlusDisabled: insightPlus ? insightPlus.disabled : null,
        insightMinusDisabled: insightMinus ? insightMinus.disabled : null,
        insightMinusReason: insightMinus ? insightMinus.title : '',
        willpowerBase: window.__GAME_FACADE__.queryCharacterCreation().draft.candidates[0].attributes.willpower,
        willpowerPlusDisabled: willpowerPlus ? willpowerPlus.disabled : null,
        willpowerPlusReason: willpowerPlus ? willpowerPlus.title : ''
      };
    })()`);
    assert.deepEqual(initialAllocationControls, {
      insightBase: 50,
      insightPlusExists: true,
      insightPlusDisabled: false,
      insightMinusDisabled: true,
      insightMinusReason: '尚未分配该属性，不能降低基础值',
      willpowerBase: 84,
      willpowerPlusDisabled: true,
      willpowerPlusReason: '增加 5 点将超过属性上限 88',
    });
    await click(win, '[data-creation-action="allocate"][data-stat="insight"][data-delta="5"]');
    const afterPlus = await win.webContents.executeJavaScript(`(() => {
      const draft = window.__GAME_FACADE__.queryCharacterCreation().draft;
      const row = document.querySelector('[data-creation-action="allocate"][data-stat="insight"]').closest('.v59-alloc-row');
      const blocked = document.querySelector('[data-creation-action="allocate"][data-stat="perception"][data-delta="5"]');
      const minus = document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="-1"]');
      return {allocated:draft.allocation.insight, rowText:row.textContent, blocked:blocked.disabled, reason:blocked.title, minusDisabled:minus.disabled};
    })()`);
    assert.equal(afterPlus.allocated, 5);
    assert.match(afterPlus.rowText, /\+5/, 'allocation refreshes the visible row immediately');
    assert.equal(afterPlus.blocked, true);
    assert.equal(afterPlus.reason, '剩余潜力不足 5 点');
    assert.equal(afterPlus.minusDisabled, false);
    for (let index = 0; index < 5; index += 1) {
      await click(win, '[data-creation-action="allocate"][data-stat="insight"][data-delta="-1"]');
    }
    const restored = await win.webContents.executeJavaScript(`(() => {
      const draft = window.__GAME_FACADE__.queryCharacterCreation().draft;
      const minus = document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="-1"]');
      return {allocated:draft.allocation.insight, minusDisabled:minus.disabled, reason:minus.title};
    })()`);
    assert.deepEqual(restored, { allocated: 0, minusDisabled: true, reason: '尚未分配该属性，不能降低基础值' });
    await click(win, '[data-creation-action="allocate"][data-stat="insight"][data-delta="5"]');
    await click(win, '[data-creation-action="advance"]');
    const confirmVisible = await win.webContents.executeJavaScript(`document.querySelector('.v59-confirm-card') !== null`);
    assert.equal(confirmVisible, true, 'step 7 displays a formal character confirmation card');
    await click(win, '[data-creation-action="finalize"]');
    const intro = await win.webContents.executeJavaScript(`window.__GAME_FACADE__.queryCharacterOnboarding().step`);
    assert.equal(intro, 'INTRO_1', 'finalization enters the persisted onboarding story');
    await click(win, '[data-creation-action="onboarding-skip"]');
    const result = await win.webContents.executeJavaScript(`({
      step: window.__GAME_FACADE__.queryCharacterOnboarding().step,
      status: window.__GAME_FACADE__.queryCharacterProfile().setupStatus,
      profession: window.__GAME_FACADE__.queryCharacterProfile().professionId,
      assigned: window.__GAME_FACADE__.context.player.assignedTasks.map(function (task) { return task.title; }),
      receipt: window.__GAME_FACADE__.context.player.characterOnboardingTaskReceipt
    })`);
    assert.equal(result.step, 'COMPLETE');
    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.profession, 'QA');
    assert.equal(result.assigned.length, 1);
    assert.match(result.assigned[0], /无法复现的 Bug/);
    assert.ok(result.receipt);
    await click(win, '[data-nav="HOME"]');
    await waitFor(win, `document.querySelector('.ux-home-col.ux-home-right') !== null`);
    await click(win, '[data-action="openMessenger"]');
    const messengerPage = await win.webContents.executeJavaScript(`({
      messenger: document.querySelector('.ux-messenger') !== null,
      home: document.querySelector('.ux-home-col.ux-home-right') !== null
    })`);
    assert.equal(messengerPage.messenger, true, 'opening messenger enters its subpage');
    assert.equal(messengerPage.home, false, 'messenger subpage replaces the home columns');
    await click(win, '[data-nav="HOME"]');
    const homeRestored = await win.webContents.executeJavaScript(`document.querySelector('.ux-home-col.ux-home-right') !== null`);
    assert.equal(homeRestored, true, 'selecting HOME from a HOME subpage restores the home columns');
    const retained = await win.webContents.executeJavaScript(`(() => {
      window.UiOverlay.refresh();
      const arena = document.querySelector('#HomeArena'), center = arena.parentElement;
      window.UiOverlay.refresh();
      return {sameArena:arena === document.querySelector('#HomeArena'), sameParent:center === arena.parentElement};
    })()`);
    assert.deepEqual(retained, {sameArena:true,sameParent:true}, 'HUD refresh must never detach the pressed battlefield or its parent');
    await win.webContents.executeJavaScript(`window.__GAME_FACADE__.destroy()`);
    win.destroy();
    console.log('V5.9 Electron DOM creation flow passed');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}

async function click(win: TestWindow, selector: string): Promise<void> {
  const clicked = await win.webContents.executeJavaScript(`(function () {
    var element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.click(); return true;
  })()`);
  assert.equal(clicked, true, `Expected enabled control ${selector}`);
}

async function waitFor(win: TestWindow, expression: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

interface TestWindow {
  loadURL(url: string): Promise<void>;
  destroy(): void;
  webContents: { executeJavaScript(code: string): Promise<any> };
}
