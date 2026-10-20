'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createRendererBootDiagnosticsScript } = require('../../desktop/boot-diagnostics.cjs');

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
