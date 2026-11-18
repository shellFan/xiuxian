'use strict';

/**
 * V10 FULL QA — performance probe (H5, real CDP).
 *
 * Measures, with real rAF sampling inside the rendered page:
 *   - FPS: home / battle normal / sustained battle (60s window)
 *   - JS heap memory across phases + growth over sustained battle
 *   - resource load timings (main bundle, textures) & navigation timing
 *
 * NOT a load simulator: the game runs its real auto-battle while sampling.
 *
 * Usage: node scripts/v10-qa-final/perf-probe.cjs [--url http://127.0.0.1:8633/]
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const URL = urlIdx >= 0 ? args[urlIdx + 1] : 'http://127.0.0.1:8633/';
const RUN = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-qa-final', 'perf-probe');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'QA', 'screenshots');

const FPS_INSTALL = `(function(){
  if (window.__FPS_INSTALLED__) return 'already';
  window.__FPS_INSTALLED__ = true;
  window.__FPS_SAMPLES__ = [];
  let last = performance.now(), frames = 0;
  function tick(t) {
    frames++;
    if (t - last >= 1000) { window.__FPS_SAMPLES__.push({ ms: Math.round(t - last), fps: frames }); frames = 0; last = t; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return 'installed';
})()`;

async function fpsWindow(cdp, seconds, label) {
  await cdp.evaluate(FPS_INSTALL);
  const before = await cdp.evaluate('window.__FPS_SAMPLES__.length');
  await sleep(seconds * 1000);
  const samples = await cdp.evaluate(`window.__FPS_SAMPLES__.slice(${before})`);
  const heap = await cdp.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null');
  const nodes = await cdp.evaluate('document.getElementsByTagName("*").length');
  const fpsValues = samples.map((s) => s.fps);
  const summaryRow = {
    label, seconds, sampleCount: samples.length,
    avgFps: fpsValues.length ? Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length * 10) / 10 : null,
    minFps: fpsValues.length ? Math.min(...fpsValues) : null,
    p95Fps: fpsValues.length ? [...fpsValues].sort((a, b) => a - b)[Math.floor(fpsValues.length * 0.95)] || null : null,
    heapMB: heap, domNodes: nodes,
  };
  return summaryRow;
}

class M {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  record(row) { fs.appendFileSync(path.join(this.dir, 'evidence.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'); }
}

async function wizard(cdp, manifest) {
  const deadline = Date.now() + 90000;
  for (let n = 0; n < 150 && Date.now() < deadline; n += 1) {
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (cur.creationComplete && cur.homeVisible) return true;
    if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
    const draft = (cur.creation && cur.creation.draft) || {};
    const step = String(draft.step || (cur.creation && cur.creation.step) || '').toUpperCase();
    let action = null;
    if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
    else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
    else if (step === 'IDENTITY') {
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'QA性能员');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return false;
}

async function main() {
  // Disjoint CDP port band (other probes: 21300/21500).
  const port = 21700 + Math.floor(Math.random() * 100);
  const profileDir = path.join(os.tmpdir(), `xiuxian-perfqa-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const manifest = new M(path.join(RUN, `perf-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`));
  const results = { windows: [] };
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(port, 15000, manifest);
    await cdp.connect();

    // Resource & navigation timing (after boot settles)
    const timing = await cdp.evaluate(`(function(){
      const nav = performance.getEntriesByType('navigation')[0] || null;
      const res = performance.getEntriesByType('resource');
      const top = res.slice().sort((a,b)=>b.duration-a.duration).slice(0,12).map(r=>({n:r.name.split('/').pop().slice(0,50),dur:Math.round(r.duration),size:r.transferSize,type:r.initiatorType}));
      return { domContentLoaded: nav?Math.round(nav.domContentLoadedEventEnd):null, loadEvent: nav?Math.round(nav.loadEventEnd):null, resourceCount: res.length, topSlow: top, totalTransferKB: Math.round(res.reduce((a,r)=>a+(r.transferSize||0),0)/1024) };
    })()`);
    results.timing = timing;
    manifest.record({ type: 'resource-timing', ...timing });
    process.stdout.write(`[timing] ${JSON.stringify(timing)}\n`);

    const wiz = await wizard(cdp, manifest);
    results.wizard = wiz;

    // FPS @ home
    results.windows.push(await fpsWindow(cdp, 8, 'home'));
    manifest.record({ type: 'fps-window', ...results.windows[0] });
    process.stdout.write(`[fps] ${JSON.stringify(results.windows[results.windows.length - 1])}\n`);

    // FPS @ battle
    await cdp.clickText('战斗');
    await sleep(1500);
    results.windows.push(await fpsWindow(cdp, 10, 'battle-early'));
    manifest.record({ type: 'fps-window', ...results.windows[1] });
    process.stdout.write(`[fps] ${JSON.stringify(results.windows[results.windows.length - 1])}\n`);

    // Sustained battle 45s with taps (real play pressure)
    const taps = 0;
    let lastTap = 0;
    const startMs = Date.now();
    while (Date.now() - startMs < 45000) {
      if (Date.now() - lastTap > 900) { lastTap = Date.now(); await cdp.click('[data-action="v63-tapAttack"]'); }
      await sleep(300);
    }
    results.windows.push(await fpsWindow(cdp, 12, 'battle-sustained'));
    manifest.record({ type: 'fps-window', ...results.windows[2] });
    process.stdout.write(`[fps] ${JSON.stringify(results.windows[results.windows.length - 1])}\n`);

    // Heap growth check
    const heapNow = await cdp.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : null');
    results.heapSustainedMB = heapNow;
    manifest.record({ type: 'heap-after-sustained', heapMB: heapNow });

    fs.mkdirSync(OUT, { recursive: true });
    try { await cdp.screenshot(path.join(OUT, 'perf-battle.png')); } catch (_) { /* best effort */ }

    results.status = 'DONE';
    return results;
  } catch (e) {
    results.status = 'FATAL';
    results.error = String(e && e.stack || e);
    manifest.record({ type: 'fatal', error: results.error });
    return results;
  } finally {
    if (cdp) cdp.close();
    try { child.kill(); } catch (_) { /* exited */ }
    fs.writeFileSync(path.join(manifest.dir, 'results.json'), JSON.stringify(results, null, 2));
    process.stdout.write(`RUN DIR: ${manifest.dir}\nSTATUS: ${results.status}\n`);
  }
}

main().then((r) => { process.exitCode = (r && r.status === 'DONE') ? 0 : 1; }).catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exitCode = 1; });
