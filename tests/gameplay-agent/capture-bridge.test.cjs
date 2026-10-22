'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isIsolatedGameplayAgentRun, registerGameplayAgentCaptureHandler } = require('../../desktop/gameplay-agent-capture.cjs');

test('Electron screenshot bridge is enabled only for the isolated seeded CDP test launch', () => {
  const tempDir = path.resolve('C:/temp');
  const userDataDir = path.join(tempDir, 'xiuxian-gameplay-agent-case');
  const base = {
    argv: ['--remote-debugging-port=9333', '--gameplay-agent-test=5911'],
    userDataDir,
    tempDir,
  };

  assert.equal(isIsolatedGameplayAgentRun(base), true, 'the capture bridge gate must match the Runner launch arguments');
  assert.equal(isIsolatedGameplayAgentRun({ ...base, argv: base.argv.filter((arg) => !arg.startsWith('--remote-debugging-port=')) }), false);
  assert.equal(isIsolatedGameplayAgentRun({ ...base, argv: base.argv.filter((arg) => !arg.startsWith('--gameplay-agent-test=')) }), false);
  assert.equal(isIsolatedGameplayAgentRun({ ...base, userDataDir: path.resolve('C:/Users/Fan/AppData/Roaming/xiuxian') }), false);
});

test('capture IPC accepts only the current main frame of the game window', async () => {
  const handlers = new Map();
  const image = { toPNG: () => Buffer.from('valid PNG bytes') };
  const webContents = {
    mainFrame: { url: 'http://127.0.0.1:34123/index.html' },
    capturePage: async () => image,
  };
  const window = { webContents, isDestroyed: () => false };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const registered = registerGameplayAgentCaptureHandler({ ipcMain, getWindow: () => window, enabled: true });

  assert.equal(registered, true);
  const handler = handlers.get('gameplay-agent:capture-page');
  const result = await handler({ sender: webContents, senderFrame: webContents.mainFrame });
  assert.equal(result, image.toPNG().toString('base64'));

  await assert.rejects(handler({ sender: {}, senderFrame: webContents.mainFrame }), /unauthorized/);
  await assert.rejects(handler({ sender: webContents, senderFrame: { url: webContents.mainFrame.url } }), /unauthorized/);
  window.isDestroyed = () => true;
  await assert.rejects(handler({ sender: webContents, senderFrame: webContents.mainFrame }), /unavailable/);
});

test('capture IPC does not register in a normal player build', () => {
  let registered = false;
  const ipcMain = { handle: () => { registered = true; } };
  assert.equal(registerGameplayAgentCaptureHandler({ ipcMain, getWindow: () => null, enabled: false }), false);
  assert.equal(registered, false);
});

test('preload exposes Electron capture only when the main process supplies the test-only marker', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../desktop/preload.cjs'), 'utf8');
  const exposed = new Map();
  const calls = [];
  const ipcRenderer = { invoke: async (...args) => { calls.push(args); return 'encoded-image'; }, on() {}, removeAllListeners() {}, send() {} };
  const contextBridge = { exposeInMainWorld: (name, value) => exposed.set(name, value) };
  const electron = { contextBridge, ipcRenderer };
  const run = (argv) => {
    exposed.clear();
    vm.runInNewContext(source, { require: (name) => { assert.equal(name, 'electron'); return electron; }, process: { argv } });
    return exposed;
  };

  run(['electron', '--xiuxian-test-seed=5911']);
  assert.equal(exposed.has('__XIUXIAN_GAMEPLAY_CAPTURE__'), false);
  run(['electron', '--xiuxian-test-seed=5911', '--xiuxian-gameplay-agent-capture']);
  assert.equal(await exposed.get('__XIUXIAN_GAMEPLAY_CAPTURE__')(), 'encoded-image');
  assert.deepEqual(calls, [['gameplay-agent:capture-page']]);
});
