'use strict';

/** Small, opt-in-by-consumer boot trace shared by the built page and GamePlay Agent. */
function createRendererBootDiagnosticsScript() {
  return `;(function () {
  var w = window;
  if (w.__XIUXIAN_BOOT_DIAGNOSTICS__) return;
  var boot = w.__XIUXIAN_BOOT_DIAGNOSTICS__ = {
    startedAt: Date.now(), currentStage: 'RENDERER_DOCUMENT_READY', gameReady: false,
    facadeRegistered: false, timeline: [], imports: [], errors: []
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

module.exports = { createRendererBootDiagnosticsScript };
