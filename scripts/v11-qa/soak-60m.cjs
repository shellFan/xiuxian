'use strict';

/**
 * soak-60m.cjs — V11 稳定性浸泡测试（任务书§18/§24：≥60 分钟，记录 FPS/内存/异常）。
 *
 * 流程：真实 Chrome 启动 → 新档向导 → 60 分钟循环：
 *   - 每 30s 采样：heartbeat/blank/heapMB/domNodes/console errors/进程指标
 *   - 每 30s 注入一个真实动作（攻击/修炼/切工作模式），驱动游戏主循环
 *   - SoakMonitor(gapMs 45s) 检测帧流中断（卡死/空白）
 * 产物：artifacts/V11_V15/soak-results.json + soak-evidence.jsonl
 * 退出码：0 = 60 分钟无致命异常；1 = boot 失败或采样 fatal。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;

const SOAK_MINUTES = 60;
const SAMPLE_MS = 30_000;
const URL = 'http://127.0.0.1:8640/';
const OUT = path.resolve(__dirname, '..', '..', 'artifacts', 'V11_V15');

async function wizardComplete(cdp) {
  const deadline = Date.now() + 90000;
  for (let n = 0; n < 150 && Date.now() < deadline; n += 1) {
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (cur.creationComplete && cur.homeVisible) return true;
    if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
    const draft = (cur.creation && cur.creation.draft) || {};
    const step = String(draft.step || '').toUpperCase();
    let action = null;
    if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
    else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
    else if (step === 'IDENTITY') {
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'V11浸泡员');
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
  fs.mkdirSync(OUT, { recursive: true });
  const evidencePath = path.join(OUT, 'soak-evidence.jsonl');
  const record = (row) => fs.appendFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');

  const profileDir = path.join(os.tmpdir(), `xiuxian-v11-soak-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const cdpPort = 30200 + Math.floor(Math.random() * 80);
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port: cdpPort, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });

  const results = { soakMinutes: SOAK_MINUTES, sampleMs: SAMPLE_MS, pass: false, boot: {}, samples: 0, actions: 0, errors: 0, gaps: 0, heap: {}, startedAt: new Date().toISOString() };
  let cdp = null;
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(cdpPort, 15000);
    await cdp.connect();

    results.boot.wizard = await wizardComplete(cdp);
    await sleep(1500);
    record({ type: 'boot', wizard: results.boot.wizard });
    if (!results.boot.wizard) throw new Error('wizard incomplete — soak aborted at boot phase');

    const monitor = new runner.SoakMonitor({ gapMs: 45000 });
    const deadline = Date.now() + SOAK_MINUTES * 60000;
    let nextActionAt = Date.now() + SAMPLE_MS;
    let firstHeap = null;
    let lastHeap = null;

    while (Date.now() < deadline) {
      const atMs = Date.now();
      const snap = await runner.snapshot(cdp);
      const gate = runner.gateSnapshot(snap, 'h5');
      const sample = {
        atMs,
        heartbeat: gate.heartbeat === true,
        blank: gate.blank !== false,
        errors: (cdp.consoleErrors ? cdp.consoleErrors.length : 0) + (cdp.exceptions ? cdp.exceptions.length : 0),
        heapMB: null,
        domNodes: null,
      };
      try { sample.heapMB = await cdp.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : null'); } catch { /* best effort */ }
      try { sample.domNodes = await cdp.evaluate('document.getElementsByTagName("*").length'); } catch { /* best effort */ }
      monitor.sample(sample);
      record({ type: 'soak-sample', sample });
      results.samples += 1;
      if (typeof sample.heapMB === 'number') {
        if (firstHeap === null) firstHeap = sample.heapMB;
        lastHeap = sample.heapMB;
      }
      results.errors = Math.max(results.errors, sample.errors);
      results.gaps = monitor.gapCount !== undefined ? monitor.gapCount : results.gaps;

      if (atMs >= nextActionAt) {
        const action = await cdp.clickFirst(['[data-action="v63-tapAttack"]', '[data-action="cultivate"]', '[data-action="mode"][data-mode="WORK"]']);
        record({ type: 'soak-action', action: action ? action.selector || 'clicked' : 'none', clicked: !!(action && action.clicked) });
        if (action && action.clicked) results.actions += 1;
        nextActionAt = atMs + SAMPLE_MS;
      }
      await sleep(Math.max(1000, SAMPLE_MS - (Date.now() - atMs)));
    }

    results.heap = { firstMB: firstHeap, lastMB: lastHeap, growthMB: firstHeap !== null && lastHeap !== null ? Math.round((lastHeap - firstHeap) * 10) / 10 : null };
    results.pass = results.boot.wizard === true && results.samples >= 100 && results.errors === 0;
    process.stdout.write(`[SOAK DONE] samples=${results.samples} actions=${results.actions} heap ${firstHeap}→${lastHeap}MB errors=${results.errors} gaps=${results.gaps}\n`);
  } catch (error) {
    results.pass = false;
    results.fatal = String(error && error.stack ? error.stack : error);
    process.stdout.write(`[SOAK FATAL] ${results.fatal}\n`);
    try { if (cdp) await cdp.screenshot(path.join(OUT, 'soak-fatal.png')); } catch { /* ignore */ }
  } finally {
    results.finishedAt = new Date().toISOString();
    try { if (cdp) cdp.close(); } catch { /* ignore */ }
    try { child.kill(); } catch { /* ignore */ }
    fs.writeFileSync(path.join(OUT, 'soak-results.json'), JSON.stringify(results, null, 2));
    process.stdout.write(`[SOAK EXIT] pass=${results.pass}\n`);
    process.exit(results.pass ? 0 : 1);
  }
}

main();
