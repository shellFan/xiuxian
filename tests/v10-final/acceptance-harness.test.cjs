'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseArgs,
  buildLaunchSpec,
  BootGate,
  RunManifest,
  SoakMonitor,
} = require('../../scripts/v10-final/cdp-runner.cjs');

test('parseArgs keeps EXE and H5 modes distinct and applies the 15s CDP watchdog', () => {
  const exe = parseArgs(['--mode', 'exe', '--exe', 'C:/game/xiuxian.exe', '--port', '9342', '--output', 'out']);
  assert.equal(exe.mode, 'exe');
  assert.equal(exe.exe, require('node:path').resolve('C:/game/xiuxian.exe'));
  assert.equal(exe.port, 9342);
  assert.equal(exe.cdpTimeoutMs, 15000);

  const h5 = parseArgs(['--mode=h5', '--url=http://127.0.0.1:8630/', '--browser=edge']);
  assert.equal(h5.mode, 'h5');
  assert.equal(h5.url, 'http://127.0.0.1:8630/');
  assert.equal(h5.browser, 'edge');
  assert.equal(h5.electron, false);
});

test('buildLaunchSpec isolates both Chromium profile and game save directory', () => {
  const spec = buildLaunchSpec({
    mode: 'exe',
    exe: 'C:/game/xiuxian.exe',
    port: 9342,
    profileDir: 'C:/tmp/profile',
    saveDir: 'C:/tmp/save',
  });
  assert.deepEqual(spec.args, [
    '--remote-debugging-port=9342',
    `--user-data-dir=${require('node:path').resolve('C:/tmp/profile')}`,
  ]);
  assert.equal(spec.env.XIUXIAN_USER_DATA, require('node:path').resolve('C:/tmp/save'));
  assert.equal(spec.identity.mode, 'exe');
  assert.equal(spec.identity.cdpPort, 9342);
  assert.equal(spec.identity.exe, 'C:/game/xiuxian.exe');
});

test('BootGate requires every strict real-runtime gate and reports missing stages', () => {
  const gate = new BootGate();
  const missing = gate.evaluate({
    electronReady: true,
    cocosReady: true,
    facadeReady: true,
    creationComplete: true,
    homeVisible: true,
    resourcesReady: true,
    heroSpriteReady: false,
    chapterValid: true,
    battleReady: true,
  });
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.missing, ['heroSpriteReady']);
  assert.equal(gate.evaluate({
    electronReady: true,
    cocosReady: true,
    facadeReady: true,
    creationComplete: true,
    homeVisible: true,
    resourcesReady: true,
    heroSpriteReady: true,
    chapterValid: true,
    battleReady: true,
  }).pass, true);
});

test('RunManifest writes durable partial records and diagnostics preserve failed-stage evidence', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-harness-contract-'));
  const manifest = new RunManifest(dir, { mode: 'h5', runId: 'contract' });
  await manifest.record({ type: 'stage', stage: 'boot', status: 'FAIL', diagnostics: { modal: { id: 'incident' }, screenshot: 'boot.png' } });
  const text = fs.readFileSync(path.join(dir, 'manifest.jsonl'), 'utf8');
  assert.match(text, /"stage":"boot"/);
  assert.match(text, /"screenshot":"boot\.png"/);
  assert.equal(fs.existsSync(path.join(dir, 'run.json')), true);
});

test('SoakMonitor fails gaps over 45 seconds and records action/progression evidence', () => {
  const soak = new SoakMonitor({ gapMs: 45000 });
  soak.sample({ atMs: 1000, actionCount: 1, progression: { stage: 1 }, heartbeat: true, blank: false });
  soak.sample({ atMs: 47001, actionCount: 2, progression: { stage: 1 }, heartbeat: true, blank: false });
  const result = soak.finish(47001);
  assert.equal(result.pass, false);
  assert.equal(result.gapFailures.length, 1);
  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[1].actionCount, 2);
});

