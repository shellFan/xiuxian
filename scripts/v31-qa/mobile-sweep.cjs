'use strict';

/**
 * mobile-sweep.cjs — V31 移动端专项验收（任务书§17）。
 *
 * 视口：360×640 / 375×667 / 390×844 / 393×852 / 412×915 / 430×932
 * 每视口：新档 → 逐页导航（home/craft/talents/settings/achievements/more）→
 *   截图 + 横向溢出检测（scrollWidth > clientWidth 的元素计数）+ 控制台异常计数。
 * 产物：artifacts/V31_V40/mobile/<viewport>/<page>.png + mobile-sweep-results.json
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;

const PROJECT = path.resolve(__dirname, '..', '..');
const URL = 'http://127.0.0.1:8640/';
const OUT = path.join(PROJECT, 'artifacts', 'V31_V40', 'mobile');

const VIEWPORTS = [
  { w: 360, h: 640 }, { w: 375, h: 667 }, { w: 390, h: 844 },
  { w: 393, h: 852 }, { w: 412, h: 915 }, { w: 430, h: 932 },
];

const PAGES = [
  { id: 'home', label: 'home' },
  { id: 'craft', label: 'craft', nav: ['[data-nav="CRAFT"]'] },
  { id: 'talents', label: 'talents', nav: ['[data-action="back"]', '[data-nav="MORE"]', '[data-action="goto"][data-page="talents"]'] },
  { id: 'settings', label: 'settings', nav: ['[data-action="back"]', '[data-nav="MORE"]', '[data-action="goto"][data-page="settings"]'] },
  { id: 'achievements', label: 'achievements', nav: ['[data-action="back"]', '[data-nav="MORE"]', '[data-action="goto"][data-page="achievements"]'] },
  { id: 'more', label: 'more', nav: ['[data-action="back"]', '[data-nav="MORE"]'] },
];

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
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'V31移动验收');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return false;
}

async function dismissModals(cdp) {
  for (let i = 0; i < 8; i++) {
    const domClosed = await cdp.clickFirst(['[data-v57-close-weekly]', '.ux-modal-close', '[data-action="closeModal"]']);
    if (domClosed.clicked) { await sleep(300); continue; }
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (!cur.modal) return;
    await runner.handleSpecificModal(cdp, cur);
    await sleep(300);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results = { pass: true, viewports: [], startedAt: new Date().toISOString() };

  for (const vp of VIEWPORTS) {
    const vpResult = { viewport: `${vp.w}x${vp.h}`, pass: true, pages: [] };
    const profileDir = path.join(os.tmpdir(), `xiuxian-v31-m-${vp.w}-${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });
    const cdpPort = 30600 + Math.floor(Math.random() * 100);
    const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port: cdpPort, profileDir, width: vp.w, height: vp.h, mobile: true });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
    let cdp = null;
    const shotDir = path.join(OUT, `${vp.w}x${vp.h}`);
    fs.mkdirSync(shotDir, { recursive: true });
    try {
      await sleep(7000);
      cdp = new runner.CdpClient(cdpPort, 15000);
      await cdp.connect();
      vpResult.boot = await wizardComplete(cdp);
      if (!vpResult.boot) throw new Error('wizard incomplete');
      await sleep(1200);

      for (const page of PAGES) {
        if (page.nav) {
          await dismissModals(cdp);
          for (const sel of page.nav) await cdp.clickFirst([sel]);
          await sleep(600);
        }
        await dismissModals(cdp);
        await sleep(300);
        const check = await cdp.evaluate(`(function(){
          var doc = document.documentElement;
          var overflowCount = 0;
          var all = document.querySelectorAll('.ux-root *, .ux-card, .ux-more-item, .ux-btn');
          for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var r = el.getBoundingClientRect();
            if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) overflowCount++;
          }
          return {
            horizontalOverflow: doc.scrollWidth > doc.clientWidth,
            overflowCount: overflowCount,
            errors: (window.__V31_ERR__ = window.__V31_ERR__ || []).length
          };
        })()`);
        await cdp.screenshot(path.join(shotDir, `${page.label}.png`));
        const pagePass = check.horizontalOverflow === false;
        vpResult.pages.push({ page: page.label, pass: pagePass, check });
        if (!pagePass) vpResult.pass = false;
      }
      vpResult.errors = await cdp.evaluate('(window.__V31_ERR__ || []).length');
    } catch (error) {
      vpResult.pass = false;
      vpResult.fatal = String(error && error.message ? error.message : error);
      try { if (cdp) await cdp.screenshot(path.join(shotDir, 'fatal.png')); } catch { /* ignore */ }
    } finally {
      try { if (cdp) cdp.close(); } catch { /* ignore */ }
      try { child.kill(); } catch { /* ignore */ }
      if (!vpResult.pass) results.pass = false;
      results.viewports.push(vpResult);
      process.stdout.write(`[${vp.w}x${vp.h}] pass=${vpResult.pass} pages=${vpResult.pages.length} fatal=${vpResult.fatal || 'none'}\n`);
    }
  }

  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'mobile-sweep-results.json'), JSON.stringify(results, null, 2));
  process.stdout.write(`\n[MOBILE SWEEP] pass=${results.pass}\n`);
  process.exit(results.pass ? 0 : 1);
}

main();
