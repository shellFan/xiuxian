import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../../..', 'desktop', 'main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.resolve(__dirname, '../../../..', 'desktop', 'preload.cjs'), 'utf8');

const setPathIndex = mainSource.indexOf("app.setPath('userData'");
const storageInitIndex = mainSource.indexOf('initStorage(');
assert.ok(setPathIndex >= 0, 'main must set Electron userData for explicit isolated runs');
assert.ok(storageInitIndex > setPathIndex, 'userData must be set before storage initialization');
assert.match(mainSource, /XIUXIAN_TEST_MODE/);
assert.match(mainSource, /absolute.*userData|path\.isAbsolute/s);
assert.match(mainSource, /app:getRuntimeInfo/);
for (const field of ['userData', 'storageRoot', 'savePath', 'renderer', 'isPackaged', 'build']) {
  assert.match(mainSource, new RegExp(`\\b${field}\\b`), `runtime info must expose ${field}`);
}

const exposed: Record<string, unknown> = {};
const context = vm.createContext({
  require: (name: string) => {
    assert.equal(name, 'electron');
    return {
      contextBridge: { exposeInMainWorld: (_name: string, api: unknown) => Object.assign(exposed, api as object) },
      ipcRenderer: { invoke: async () => undefined, on: () => undefined, removeAllListeners: () => undefined, send: () => undefined },
    };
  },
  console,
});
new vm.Script(preloadSource, { filename: 'preload.cjs' }).runInContext(context);
const appApi = exposed.app as { getRuntimeInfo?: () => unknown };
assert.equal(typeof appApi.getRuntimeInfo, 'function', 'preload must expose runtime info IPC');

console.log('v10 runtime isolation tests passed');
