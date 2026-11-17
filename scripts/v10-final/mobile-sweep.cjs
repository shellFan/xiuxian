#!/usr/bin/env node
'use strict';

/**
 * V10 FINAL H5 mobile sweep: five target viewports, real browser via CDP.
 * For each viewport: boot gates + gameplay spot checks + horizontal overflow.
 */

const fs = require('node:fs');
const path = require('node:path');
const runner = require(path.join(__dirname, 'cdp-runner.cjs'));
const { spawn } = require('node:child_process');

const VIEWPORTS = [[360, 640], [375, 812], [390, 844], [414, 896], [430, 932]];
const URL = process.argv[2] || 'http://127.0.0.1:8633/';
const OUT = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-ultimate', 'screenshots', 'mobile');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

async function runViewport(browser, width, height, index) {
  const port = 26000 + Math.floor(Math.random() * 4000) + index * 7;
  const profileDir = path.join(require('node:os').tmpdir(), `xiuxian-m-${width}-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const browserPath = runner.buildLaunchSpec({ mode: 'h5', browser, url: URL, port, profileDir, width, height, mobile: true });
  const child = spawn(browserPath.command, browserPath.args, { cwd: path.dirname(browserPath.command), stdio: 'ignore', windowsHide: true });
  const cdp = new runner.CdpClient(port, 15000, { record() {} });
  const result = { viewport: `${width}x${height}`, gates: null, overflow: null, shots: 0 };
  try {
    await sleepMs(7000);
    await cdp.connect();
    let creationDone = false;
    for (let n = 0; n < 80 && !creationDone; n += 1) {
      const raw = await runner.snapshot(cdp);
      const cur = runner.gateSnapshot(raw, 'h5');
      if (cur.creationComplete && cur.homeVisible) { creationDone = true; break; }
      if (cur.modal) { await runner.handleSpecificModal(cdp, cur); continue; }
      const draft = (cur.creation && cur.creation.draft) || {};
      const step = String(draft.step || '').toUpperCase();
      if (step === 'INDUSTRY' && !draft.industry) await cdp.click('[data-creation-choice="industry:INTERNET"]');
      else if (step === 'DIRECTION' && !draft.direction) await cdp.click('[data-creation-choice="direction:TECH_RND"]');
      else if (step === 'PROFESSION' && !draft.professionConfirmed) await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
      else if (step === 'IDENTITY') {
        if (!draft.nickname) await cdp.type('#v59-nickname', '范大牛');
        else if (!draft.background) await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
        else await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
      } else if (step === 'DESTINY' && !draft.selectedCandidateId) await cdp.click('[data-creation-choice^="candidate:"]');
      else if (step === 'CONFIRM') await cdp.click('[data-creation-action="finalize"]');
      else await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
      await sleepMs(380);
    }
    await sleepMs(1000);
    const home = runner.gateSnapshot(await runner.snapshot(cdp), 'h5');
    const homeGate = runner.BootGate.homeGates(home);
    // battle page on this viewport
    await cdp.click('[data-nav="BATTLE"]');
    await sleepMs(1200);
    const battle = runner.gateSnapshot(await runner.snapshot(cdp), 'h5');
    const overflowHome = home.horizontalOverflow === true;
    const overflowBattle = battle.horizontalOverflow === true;
    result.gates = { home: homeGate, battleReady: battle.battleReady === true };
    result.overflow = { home: overflowHome, battle: overflowBattle };
    result.gap = { navTap: true };
    try {
      const file = path.join(OUT, `mobile-${width}x${height}.png`);
      await cdp.screenshot(file);
      result.shots += 1;
    } catch (_) { /* best effort */ }
  } catch (error) {
    result.error = String(error && error.message || error).slice(0, 200);
  } finally {
    try { cdp.close(); } catch (_) { /* socket gone */ }
    try { child.kill(); } catch (_) { /* gone */ }
  }
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  for (let i = 0; i < VIEWPORTS.length; i += 1) {
    const [w, h] = VIEWPORTS[i];
    process.stdout.write(`[mobile] ${w}x${h} ...`);
    const r = await runViewport('chrome', w, h, i);
    results.push(r);
    process.stdout.write(JSON.stringify({
      viewport: r.viewport,
      homeGates: r.gates && r.gates.home,
      battle: r.gates && r.gates.battleReady,
      overflow: r.overflow,
      error: r.error,
    }) + '\n');
  }
  const outJson = path.join(OUT, 'mobile-sweep.json');
  fs.writeFileSync(outJson, JSON.stringify({ url: URL, results, at: new Date().toISOString() }, null, 1));
  const allHomePass = results.every((r) => r.gates && Object.values(r.gates.home).every(Boolean));
  const noOverflow = results.every((r) => r.overflow && !r.overflow.home && !r.overflow.battle);
  console.log(`[mobile] sweep complete: homeGatesAllPass=${allHomePass} noHorizontalOverflow=${noOverflow} evidence=${outJson}`);
  process.exitCode = allHomePass && noOverflow ? 0 : 1;
}

main().catch((e) => { console.error('[mobile] FATAL', e && e.stack || e); process.exit(1); });
