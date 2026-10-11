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
      window.__GAME_FACADE__ = new GameFacade({ storage: window.__V59_STORAGE__, board: null, modeSwitchCooldownMs: 0 });
      return typeof window.__GAME_FACADE__.queryCharacterCreation === 'function';
    })()`);
    assert.equal(setup, true);
    const loaded = await win.webContents.executeJavaScript(`(function () {
      try { (0, eval)(${JSON.stringify(overlay)}); return true; }
      catch (error) { return error && error.stack ? error.stack : String(error); }
    })()`);
    assert.equal(loaded, true, String(loaded));
    await waitFor(win, `document.querySelector('.v59-creation .v59-stepper span') !== null`);

    const sevenSteps = await win.webContents.executeJavaScript(`document.querySelectorAll('.v59-stepper span').length`);
    assert.equal(sevenSteps, 7);
    await click(win, '[data-creation-choice="industry:INTERNET"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice="direction:TECH_RND"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice="profession:QA"]');
    await click(win, '[data-creation-action="advance"]');
    await win.webContents.executeJavaScript(`document.querySelector('#v59-nickname').value = '青云牛马'`);
    await click(win, '[data-creation-choice="avatar:avatar-2"]');
    await click(win, '[data-creation-choice="background:CULTIVATION_GRAD"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-choice^="candidate:"]');
    await click(win, '[data-creation-action="advance"]');
    await click(win, '[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]');
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
