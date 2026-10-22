'use strict';

/** Small, opt-in-by-consumer boot trace shared by the built page and GamePlay Agent. */
function createRendererBootDiagnosticsScript() {
  return `;(function () {
  var w = window;
  if (w.__XIUXIAN_BOOT_DIAGNOSTICS__) return;
  var boot = w.__XIUXIAN_BOOT_DIAGNOSTICS__ = {
    startedAt: Date.now(), currentStage: 'RENDERER_DOCUMENT_READY', gameReady: false,
    facadeRegistered: false, timeline: [], imports: [], errors: [], launchGateSnapshots: []
  };
  function mark(stage, detail) {
    boot.currentStage = stage;
    boot.timeline.push({ stage: stage, at: Date.now(), detail: detail || null });
    if (boot.timeline.length > 100) boot.timeline.shift();
  }
  function errorRecord(kind, message, stack, source) {
    boot.errors.push({ kind: kind, message: String(message || 'Unknown error').slice(0, 500),
      stack: String(stack || '').slice(0, 2000), source: String(source || '').slice(0, 300), at: Date.now() });
    if (boot.errors.length > 20) boot.errors.shift();
    mark(kind, String(message || 'Unknown error').slice(0, 200));
  }
  boot.mark = mark;
  mark('RENDERER_DIAGNOSTICS_INSTALLED');
  w.addEventListener('error', function (event) {
    errorRecord('RENDERER_ERROR', event.message, event.error && event.error.stack,
      (event.filename || '') + (event.lineno ? ':' + event.lineno : ''));
  });
  w.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    errorRecord('UNHANDLED_REJECTION', reason && reason.message || reason,
      reason && reason.stack, 'window.unhandledrejection');
  });
  if (w.document && typeof w.document.addEventListener === 'function') {
    ['load', 'error'].forEach(function (eventName) {
      w.document.addEventListener(eventName, function (event) {
        var target = event && event.target;
        var src = target && target.tagName === 'SCRIPT' && target.src;
        if (!src || src.indexOf('/assets/') < 0) return;
        mark(eventName === 'error' ? 'COCOS_ASSET_SCRIPT_FAILED' : 'COCOS_ASSET_SCRIPT_LOADED',
          { src: String(src).slice(0, 400) });
      }, true);
    });
  }
  var system = w.System;
  if (!system || typeof system.import !== 'function') {
    mark('SYSTEMJS_MISSING');
    return;
  }
  mark('SYSTEMJS_READY');
  var originalImport = system.import;
  system.import = function (name) {
    var item = { name: String(name || '').slice(0, 200), status: 'pending', startedAt: Date.now(), durationMs: null };
    boot.imports.push(item);
    if (boot.imports.length > 100) boot.imports.shift();
    mark('SYSTEM_IMPORT_STARTED', item.name);
    var result;
    try { result = originalImport.apply(this, arguments); }
    catch (error) {
      item.status = 'rejected'; item.durationMs = Date.now() - item.startedAt;
      item.error = String(error && error.message || error).slice(0, 500);
      item.stack = String(error && error.stack || '').slice(0, 2000);
      mark('SYSTEM_IMPORT_REJECTED', item.name);
      throw error;
    }
    return Promise.resolve(result).then(function (value) {
      item.status = 'resolved'; item.durationMs = Date.now() - item.startedAt;
      mark('SYSTEM_IMPORT_RESOLVED', item.name);
      return value;
    }, function (error) {
      item.status = 'rejected'; item.durationMs = Date.now() - item.startedAt;
      item.error = String(error && error.message || error).slice(0, 500);
      item.stack = String(error && error.stack || '').slice(0, 2000);
      mark('SYSTEM_IMPORT_REJECTED', item.name);
      throw error;
    });
  };
})();`;
}

function readCocosLaunchGateState(engine) {
  const game = engine && engine.game;
  let splash = { present: false, currentTime: null, totalTime: null, finished: null };
  try {
    const instance = engine && engine.internal && engine.internal.SplashScreen && engine.internal.SplashScreen.instance;
    if (instance) {
      const currentTime = instance.curTime;
      const totalTime = instance.settings && instance.settings.totalTime;
      splash = {
        present: true,
        currentTime: Number.isFinite(currentTime) ? currentTime : null,
        totalTime: Number.isFinite(totalTime) ? totalTime : null,
        finished: typeof instance.isFinished === 'boolean' ? instance.isFinished : null,
      };
    }
  } catch (_) {
    splash = { present: true, currentTime: null, totalTime: null, finished: null };
  }

  let sceneName = null;
  try {
    const scene = engine && engine.director && typeof engine.director.getScene === 'function'
      ? engine.director.getScene()
      : null;
    sceneName = scene && typeof scene.name === 'string' ? scene.name : null;
  } catch (_) {
    sceneName = null;
  }

  return {
    frame: game && Number.isFinite(game.frame) ? game.frame : null,
    gameInited: game && typeof game._inited === 'boolean' ? game._inited : null,
    engineInited: game && typeof game._engineInited === 'boolean' ? game._engineInited : null,
    rendererInitialized: game && typeof game._rendererInitialized === 'boolean' ? game._rendererInitialized : null,
    paused: game && typeof game._paused === 'boolean' ? game._paused : null,
    shouldLoadLaunchScene: game && typeof game._shouldLoadLaunchScene === 'boolean' ? game._shouldLoadLaunchScene : null,
    splash,
    sceneName,
  };
}

/**
 * Add opt-in diagnostics around Cocos AssetManager requests. Keep only known
 * resource identity fields; asset data/options can contain arbitrary payloads.
 */
function instrumentAssetManager(assetManager, bootMark, diagnostics) {
  if (!assetManager || assetManager.__xiuxianAssetLoadTrace) return;
  const state = diagnostics || {};
  state.assetLoads = Array.isArray(state.assetLoads) ? state.assetLoads : [];
  state.pendingAssetLoads = Number.isFinite(state.pendingAssetLoads) ? state.pendingAssetLoads : 0;
  let nextRequestId = 1;

  function safeResource(value) {
    if (typeof value === 'string') return { uuid: value.slice(0, 160) };
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) return value.slice(0, 12).map(safeResource).filter(Boolean);
    const result = {};
    ['uuid', '_uuid', 'url', 'path', 'name', 'type', 'bundle', 'bundleName', 'ext'].forEach(function (key) {
      const field = value[key];
      if (typeof field === 'string' || typeof field === 'number') result[key] = String(field).slice(0, 160);
    });
    return Object.keys(result).length ? result : null;
  }

  ['loadBundle', 'loadAny'].forEach(function (operation) {
    if (typeof assetManager[operation] !== 'function') return;
    const original = assetManager[operation];
    assetManager[operation] = function () {
      const args = Array.prototype.slice.call(arguments);
      let callbackIndex = -1;
      for (let index = args.length - 1; index >= 0; index--) {
        if (typeof args[index] === 'function') { callbackIndex = index; break; }
      }
      const startedAt = Date.now();
      const request = {
        id: nextRequestId++, operation, resources: safeResource(args[0]) ?
          (Array.isArray(safeResource(args[0])) ? safeResource(args[0]) : [safeResource(args[0])]) : [],
        callSite: String(new Error().stack || '').split('\n').slice(2, 7).join('\n').slice(0, 1200),
        startedAt, completedAt: null, durationMs: null, status: 'pending',
        callbackObserved: false, promiseObserved: false,
      };
      state.assetLoads.push(request);
      if (state.assetLoads.length > 40) state.assetLoads.shift();
      state.pendingAssetLoads++;
      let settled = false;
      function finish(error, source) {
        if (settled) return;
        settled = true;
        request.completedAt = Date.now();
        request.durationMs = request.completedAt - startedAt;
        request.status = error ? 'failed' : 'succeeded';
        request.completionSource = source;
        if (error) {
          request.error = String(error && error.message || error).slice(0, 500);
          request.errorStack = String(error && error.stack || '').slice(0, 1600);
        }
        state.pendingAssetLoads = Math.max(0, state.pendingAssetLoads - 1);
        request.pendingAtCompletion = state.pendingAssetLoads;
        bootMark('COCOS_ASSET_' + operation.toUpperCase() + (error ? '_FAILED' : '_COMPLETED'), {
          requestId: request.id, resources: request.resources, durationMs: request.durationMs,
          pending: state.pendingAssetLoads, error: request.error || null,
        }, false);
      }

      bootMark('COCOS_ASSET_' + operation.toUpperCase() + '_STARTED', {
        requestId: request.id, resources: request.resources, pending: state.pendingAssetLoads,
        callSite: request.callSite,
      });
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex];
        args[callbackIndex] = function (error) {
          request.callbackObserved = true;
          finish(error || null, 'callback');
          return callback.apply(this, arguments);
        };
      }
      let result;
      try { result = original.apply(this, args); }
      catch (error) { finish(error, 'throw'); throw error; }
      if (result && typeof result.then === 'function') {
        request.promiseObserved = true;
        result.then(function () { finish(null, 'promise'); }, function (error) { finish(error, 'promise'); });
      } else if (callbackIndex < 0) {
        request.status = 'completion-unobservable';
      }
      return result;
    };
  });
  assetManager.__xiuxianAssetLoadTrace = true;
}

/**
 * Add phase markers to Creator's generated Application module. SystemJS only
 * reports that the engine module imported; without these markers a pending
 * cc.game.init() looks identical to a ready renderer that never bootstrapped.
 * This wrapper preserves the original promise/rejection behavior and never
 * sets either renderer or Electron readiness.
 */
function instrumentCocosApplicationBoot(source) {
  if (typeof source === 'string' && source.includes("bootMark('COCOS_GAME_INIT_STARTED')")) return source;
  if (typeof source !== 'string' || !source.includes('value: function init(engine)') || !source.includes('return cc.game.init({')) {
    throw new Error('Unsupported Cocos Application bootstrap shape; startup diagnostics were not installed');
  }

  let output = source;
  const variableMarker = 'var cc, Application;';
  if (!output.includes(variableMarker)) throw new Error('Cocos Application module variables were not found');
  const launchGateReaderSource = `var readCocosLaunchGateState = ${readCocosLaunchGateState.toString()};`;
  const assetManagerReaderSource = `var instrumentAssetManager = ${instrumentAssetManager.toString()};`;
  output = output.replace(variableMarker, `${variableMarker}
  ${launchGateReaderSource}
  ${assetManagerReaderSource}
  function bootMark(stage, detail, isError) {
    var diagnostics = typeof window !== 'undefined' && window.__XIUXIAN_BOOT_DIAGNOSTICS__;
    if (!diagnostics || typeof diagnostics.mark !== 'function') return;
    var safeDetail = detail || null;
    if (isError && detail) safeDetail = { message: String(detail && detail.message || detail).slice(0, 500), stack: String(detail && detail.stack || '').slice(0, 2000) };
    diagnostics.mark(stage, safeDetail);
  }
  function instrumentEngineBoot(engine) {
    var game = engine && engine.game;
    if (game && typeof game.on === 'function' && !game.__xiuxianInitStageTrace) {
      var initStages = [
        ['pre_base_init', 'COCOS_PRE_BASE_INIT'],
        ['post_base_init', 'COCOS_POST_BASE_INIT'],
        ['pre_infrastructure_init', 'COCOS_PRE_INFRASTRUCTURE_INIT'],
        ['post_infrastructure_init', 'COCOS_POST_INFRASTRUCTURE_INIT'],
        ['pre_subsystem_init', 'COCOS_PRE_SUBSYSTEM_INIT'],
        ['post_subsystem_init', 'COCOS_POST_SUBSYSTEM_INIT'],
        ['pre_project_init', 'COCOS_PRE_PROJECT_INIT'],
        ['post_project_init', 'COCOS_POST_PROJECT_INIT'],
        ['game_inited', 'COCOS_GAME_INITED'],
      ];
      for (var stageIndex = 0; stageIndex < initStages.length; stageIndex++) {
        (function (stage) {
          try { game.on(stage[0], function () { bootMark(stage[1]); }); }
          catch (error) { bootMark('COCOS_INIT_STAGE_TRACE_FAILED', error, true); }
        })(initStages[stageIndex]);
      }
      game.__xiuxianInitStageTrace = true;
    }
    var director = engine && engine.director;
    var launchSceneRequested = false;
    if (director && typeof director.init === 'function' && !director.__xiuxianInitTrace) {
      var initDirector = director.init;
      director.init = function () {
        bootMark('COCOS_DIRECTOR_INIT_STARTED');
        try {
          var result = initDirector.apply(this, arguments);
          bootMark('COCOS_DIRECTOR_INIT_RESOLVED');
          return result;
        } catch (error) {
          bootMark('COCOS_DIRECTOR_INIT_REJECTED', error, true);
          throw error;
        }
      };
      director.__xiuxianInitTrace = true;
    }
    var builtinResMgr = engine && engine.builtinResMgr;
    if (builtinResMgr && typeof builtinResMgr.loadBuiltinAssets === 'function' && !builtinResMgr.__xiuxianLoadTrace) {
      var loadBuiltinAssets = builtinResMgr.loadBuiltinAssets;
      builtinResMgr.loadBuiltinAssets = function () {
        bootMark('COCOS_BUILTIN_ASSETS_LOAD_STARTED');
        var result;
        try { result = loadBuiltinAssets.apply(this, arguments); }
        catch (error) {
          bootMark('COCOS_BUILTIN_ASSETS_LOAD_REJECTED', error, true);
          throw error;
        }
        if (result && typeof result.then === 'function') {
          result.then(function () {
            bootMark('COCOS_BUILTIN_ASSETS_LOAD_RESOLVED');
          }, function (error) {
            bootMark('COCOS_BUILTIN_ASSETS_LOAD_REJECTED', error, true);
          });
        } else {
          bootMark('COCOS_BUILTIN_ASSETS_LOAD_RESOLVED');
        }
        return result;
      };
      builtinResMgr.__xiuxianLoadTrace = true;
    }
    var assetManager = engine && engine.assetManager;
    if (assetManager && !assetManager.__xiuxianAssetLoadTrace) {
      instrumentAssetManager(assetManager, bootMark, typeof window !== 'undefined' && window.__XIUXIAN_BOOT_DIAGNOSTICS__);
    }
    if (game && typeof game._updateCallback === 'function' && !game.__xiuxianBootTrace) {
      var update = game._updateCallback;
      var firstFrame = true;
      var updateFrameCount = 0;
      var launchGateSnapshotCount = 0;
      game._updateCallback = function () {
        updateFrameCount++;
        if (firstFrame) { firstFrame = false; bootMark('COCOS_FIRST_FRAME'); }
        if (!launchSceneRequested && (updateFrameCount === 1 || updateFrameCount % 60 === 0) && launchGateSnapshotCount < 12) {
          launchGateSnapshotCount++;
          var gateState = readCocosLaunchGateState(engine);
          var diagnostics = typeof window !== 'undefined' && window.__XIUXIAN_BOOT_DIAGNOSTICS__;
          if (diagnostics) {
            diagnostics.launchGateSnapshots = diagnostics.launchGateSnapshots || [];
            diagnostics.launchGateSnapshots.push(gateState);
            if (diagnostics.launchGateSnapshots.length > 12) diagnostics.launchGateSnapshots.shift();
          }
          bootMark('COCOS_LAUNCH_GATE_SNAPSHOT', gateState);
        }
        return update.apply(this, arguments);
      };
      game.__xiuxianBootTrace = true;
    }
    if (director && typeof director.loadScene === 'function' && !director.__xiuxianBootTrace) {
      var loadScene = director.loadScene;
      director.loadScene = function (sceneName) {
        launchSceneRequested = true;
        var args = Array.prototype.slice.call(arguments);
        bootMark('COCOS_LAUNCH_SCENE_REQUESTED', { scene: String(sceneName || '').slice(0, 200) });
        if (typeof args[1] === 'function') {
          var onLoaded = args[1];
          args[1] = function (error) {
            bootMark(error ? 'COCOS_LAUNCH_SCENE_FAILED' : 'COCOS_LAUNCH_SCENE_LOADED', error || null, !!error);
            return onLoaded.apply(this, arguments);
          };
        }
        var accepted = loadScene.apply(this, args);
        if (accepted === false) bootMark('COCOS_LAUNCH_SCENE_REJECTED');
        return accepted;
      };
      director.__xiuxianBootTrace = true;
    }
  }`);

  output = output.replace('value: function init(engine) {', `value: function init(engine) {
            bootMark('COCOS_APPLICATION_INIT_STARTED');`);
  const engineMarker = 'cc = engine;';
  if (!output.includes(engineMarker)) throw new Error('Cocos engine assignment was not found');
  output = output.replace(engineMarker, `${engineMarker}
            instrumentEngineBoot(engine);`);
  const delegateMarker = 'cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this));';
  if (!output.includes(delegateMarker)) throw new Error('Cocos Application init delegates were not found');
  output = output.replace(delegateMarker, `${delegateMarker}
            bootMark('COCOS_APPLICATION_INIT_COMPLETED');`);

  output = output.replace('value: function start() {', `value: function start() {
            bootMark('COCOS_GAME_INIT_STARTED');`);
  const runChain = /\}\)\.then\(function \(\) \{\s*return cc\.game\.run\(\);\s*\}\);/;
  if (!runChain.test(output)) throw new Error('Cocos game init/run chain was not found');
  output = output.replace(runChain, `}).then(function () {
              bootMark('COCOS_GAME_INIT_RESOLVED');
              bootMark('COCOS_GAME_RUN_STARTED');
              return Promise.resolve(cc.game.run()).then(function (result) {
                bootMark('COCOS_GAME_RUN_RESOLVED');
                return result;
              }, function (error) {
                bootMark('COCOS_GAME_RUN_REJECTED', error, true);
                throw error;
              });
            }, function (error) {
              bootMark('COCOS_GAME_INIT_REJECTED', error, true);
              throw error;
            });`);
  if (!output.includes("bootMark('COCOS_GAME_INIT_RESOLVED')") || !output.includes("bootMark('COCOS_GAME_RUN_STARTED')")) {
    throw new Error('Cocos startup phase markers could not be installed');
  }
  return output;
}

module.exports = { createRendererBootDiagnosticsScript, instrumentAssetManager, instrumentCocosApplicationBoot, readCocosLaunchGateState };
