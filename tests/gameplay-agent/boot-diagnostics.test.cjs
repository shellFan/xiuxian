'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createRendererBootDiagnosticsScript, instrumentAssetManager, instrumentCocosApplicationBoot, readCocosLaunchGateState } = require('../../desktop/boot-diagnostics.cjs');

test('loadAny diagnostics retain safe resource identity and callback outcome', () => {
  const diagnostics = { timeline: [], assetLoads: [], pendingAssetLoads: 0 };
  const marks = [];
  const assetManager = {
    loadAny(request, callback) {
      callback(null, { loaded: true });
    },
  };

  instrumentAssetManager(assetManager, (stage, detail) => marks.push({ stage, detail }), diagnostics);
  assetManager.loadAny({ uuid: 'scene-uuid-123', bundle: 'main', type: 'SceneAsset', path: 'Main' }, () => {});

  assert.equal(diagnostics.assetLoads.length, 1);
  assert.equal(diagnostics.assetLoads[0].status, 'succeeded');
  assert.equal(diagnostics.assetLoads[0].callbackObserved, true);
  assert.equal(diagnostics.assetLoads[0].pendingAtCompletion, 0);
  assert.deepEqual(diagnostics.assetLoads[0].resources, [{
    uuid: 'scene-uuid-123', bundle: 'main', type: 'SceneAsset', path: 'Main',
  }]);
  assert.equal(marks[0].stage, 'COCOS_ASSET_LOADANY_STARTED');
  assert.equal(marks.at(-1).stage, 'COCOS_ASSET_LOADANY_COMPLETED');
  assert.equal(JSON.stringify(diagnostics).includes('save-data'), false);
});

test('loadAny diagnostics capture callback failures without losing pending request count', () => {
  const diagnostics = { timeline: [], assetLoads: [], pendingAssetLoads: 0 };
  const marks = [];
  const assetManager = {
    loadAny(uuid, callback) {
      callback(Object.assign(new Error('asset decode failed'), { code: 'ERR_ASSET' }));
    },
  };

  instrumentAssetManager(assetManager, (stage, detail) => marks.push({ stage, detail }), diagnostics);
  assetManager.loadAny('missing-scene-uuid', () => {});

  assert.equal(diagnostics.pendingAssetLoads, 0);
  assert.equal(diagnostics.assetLoads[0].status, 'failed');
  assert.match(diagnostics.assetLoads[0].error, /asset decode failed/);
  assert.equal(marks.at(-1).stage, 'COCOS_ASSET_LOADANY_FAILED');
});

test('loadAny diagnostics observe a promise-only resource request', async () => {
  const diagnostics = { timeline: [], assetLoads: [], pendingAssetLoads: 0 };
  const assetManager = { loadAny: () => Promise.resolve({ loaded: true }) };
  instrumentAssetManager(assetManager, () => {}, diagnostics);

  await assetManager.loadAny({ uuid: 'builtin-scene-uuid', type: 'SceneAsset' });
  await Promise.resolve();

  assert.equal(diagnostics.pendingAssetLoads, 0);
  assert.equal(diagnostics.assetLoads[0].status, 'succeeded');
  assert.equal(diagnostics.assetLoads[0].promiseObserved, true);
  assert.equal(diagnostics.assetLoads[0].completionSource, 'promise');
});

test('Cocos boot instrumentation exposes init and run stages without forcing readiness', () => {
  const application = `System.register([], function (_export, _context) {
  var cc, Application;
  return { execute: function () {
    Application = function Application() {};
    Application = _createClass(Application, [{
      key: "init",
      value: function init(engine) {
        cc = engine;
        cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this));
        cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this));
      }
    }, {
      key: "start",
      value: function start() {
        return cc.game.init({ debugMode: false }).then(function () {
          return cc.game.run();
        });
      }
    }]);
  }};
});`;
  const instrumented = instrumentCocosApplicationBoot(application);

  assert.match(instrumented, /COCOS_APPLICATION_INIT_STARTED/);
  assert.match(instrumented, /COCOS_GAME_INIT_STARTED/);
  assert.match(instrumented, /COCOS_GAME_INIT_RESOLVED/);
  assert.match(instrumented, /COCOS_GAME_RUN_STARTED/);
  assert.match(instrumented, /COCOS_GAME_INIT_REJECTED/);
  assert.match(instrumented, /COCOS_GAME_RUN_REJECTED/);
  assert.match(instrumented, /COCOS_FIRST_FRAME/);
  assert.match(instrumented, /COCOS_LAUNCH_GATE_SNAPSHOT/);
  assert.match(instrumented, /COCOS_LAUNCH_SCENE_REQUESTED/);
  assert.match(instrumented, /COCOS_LAUNCH_SCENE_FAILED/);
  assert.match(instrumented, /var readCocosLaunchGateState = function readCocosLaunchGateState\(engine\)/);
  assert.match(instrumented, /COCOS_PRE_SUBSYSTEM_INIT/);
  assert.match(instrumented, /COCOS_POST_SUBSYSTEM_INIT/);
  assert.match(instrumented, /COCOS_PRE_PROJECT_INIT/);
  assert.match(instrumented, /COCOS_POST_PROJECT_INIT/);
  assert.match(instrumented, /COCOS_DIRECTOR_INIT_STARTED/);
  assert.match(instrumented, /COCOS_DIRECTOR_INIT_RESOLVED/);
  assert.match(instrumented, /COCOS_BUILTIN_ASSETS_LOAD_STARTED/);
  assert.match(instrumented, /COCOS_BUILTIN_ASSETS_LOAD_RESOLVED/);
  assert.match(instrumented, /COCOS_BUILTIN_ASSETS_LOAD_REJECTED/);
  assert.match(instrumented, /COCOS_ASSET_' \+ operation\.toUpperCase\(\)/);
  assert.match(instrumented, /pendingAssetLoads/);
  assert.match(instrumented, /callbackObserved/);
  assert.match(instrumented, /resources: request\.resources/);
  assert.doesNotMatch(instrumented, /gameReady\s*=\s*true/);
  assert.equal(instrumentCocosApplicationBoot(instrumented), instrumented, 'build copying can reapply the patch safely');
});

test('renderer diagnostics record SystemJS import stages and rejected module stacks', async () => {
  const context = {
    window: {
      addEventListener() {},
      System: {
        import: (name) => name === './index.js'
          ? Promise.resolve({})
          : Promise.reject(Object.assign(new Error('module failed'), { code: 'ERR_MODULE' })),
      },
    },
    document: { addEventListener() {}, querySelector() { return null; } },
    console: { error() {}, warn() {} },
    Date,
    Error,
    Promise,
  };
  vm.runInNewContext(createRendererBootDiagnosticsScript(), context);
  await context.window.System.import('./index.js');
  await assert.rejects(context.window.System.import('cc'), /module failed/);

  const diagnostic = JSON.parse(JSON.stringify(context.window.__XIUXIAN_BOOT_DIAGNOSTICS__));
  assert.equal(diagnostic.currentStage, 'SYSTEM_IMPORT_REJECTED');
  assert.deepEqual(diagnostic.imports.map((item) => item.name), ['./index.js', 'cc']);
  assert.equal(diagnostic.imports[0].status, 'resolved');
  assert.equal(diagnostic.imports[1].status, 'rejected');
  assert.match(diagnostic.imports[1].stack, /module failed/);
  assert.equal(JSON.stringify(diagnostic).includes('save'), false);
});

test('renderer diagnostics capture uncaught errors without changing boot readiness', () => {
  const listeners = {};
  const context = {
    window: {
      addEventListener(name, listener) { listeners[name] = listener; },
      System: { import: () => Promise.resolve({}) },
    },
    document: { addEventListener() {}, querySelector() { return null; } },
    console: { error() {}, warn() {} },
    Date,
    Error,
    Promise,
  };
  vm.runInNewContext(createRendererBootDiagnosticsScript(), context);
  listeners.error({ message: 'renderer exploded', filename: 'index.js', lineno: 9, error: new Error('renderer exploded') });

  const diagnostic = JSON.parse(JSON.stringify(context.window.__XIUXIAN_BOOT_DIAGNOSTICS__));
  assert.equal(diagnostic.currentStage, 'RENDERER_ERROR');
  assert.equal(diagnostic.errors[0].message, 'renderer exploded');
  assert.equal(diagnostic.gameReady, false);
});

test('renderer diagnostics distinguish loaded and failed dynamic Cocos asset scripts', () => {
  const listeners = {};
  const context = {
    window: {
      addEventListener() {},
      System: { import: () => Promise.resolve({}) },
    },
    document: { addEventListener(name, listener) { listeners[name] = listener; } },
    console: { error() {}, warn() {} },
    Date,
    Error,
    Promise,
  };
  context.window.document = context.document;
  vm.runInNewContext(createRendererBootDiagnosticsScript(), context);
  listeners.load({ target: { tagName: 'SCRIPT', src: 'http://127.0.0.1/assets/internal/index.js' } });

  const diagnostic = JSON.parse(JSON.stringify(context.window.__XIUXIAN_BOOT_DIAGNOSTICS__));
  assert.equal(diagnostic.currentStage, 'COCOS_ASSET_SCRIPT_LOADED');
  assert.deepEqual(diagnostic.timeline.at(-1).detail, { src: 'http://127.0.0.1/assets/internal/index.js' });
  assert.equal(diagnostic.gameReady, false);
});

test('Cocos launch gate diagnostics capture splash progress and scene gate without save data', () => {
  const engine = {
    game: {
      _inited: true,
      _engineInited: true,
      _rendererInitialized: true,
      _paused: false,
      _shouldLoadLaunchScene: true,
      frame: 120,
    },
    internal: {
      SplashScreen: {
        instance: { curTime: 940, settings: { totalTime: 2000 }, isFinished: false },
      },
    },
    director: { getScene: () => null },
  };

  assert.deepEqual(readCocosLaunchGateState(engine), {
    frame: 120,
    gameInited: true,
    engineInited: true,
    rendererInitialized: true,
    paused: false,
    shouldLoadLaunchScene: true,
    splash: { present: true, currentTime: 940, totalTime: 2000, finished: false },
    sceneName: null,
  });
  assert.equal(JSON.stringify(readCocosLaunchGateState(engine)).includes('save'), false);
  assert.deepEqual(readCocosLaunchGateState({ game: {}, director: {} }).splash, {
    present: false, currentTime: null, totalTime: null, finished: null,
  });
});
