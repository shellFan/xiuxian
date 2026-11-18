'use strict';

/** One-off full-wizard draft trace — find where professionId resets. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;
const URL = 'http://127.0.0.1:8633/';

(async () => {
  const port = 29400 + Math.floor(Math.random() * 300);
  const profileDir = path.join(os.tmpdir(), `xiuxian-wiztrace-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  const dumpDraft = async (tag) => {
    const d = await cdp.evaluate(`(function(){const c=window.__GAME_FACADE__.queryCharacterCreation();const d=c&&c.draft||{};return JSON.stringify({step:d.step,professionId:d.professionId,confirmed:d.professionConfirmed,candidate:d.selectedCandidateId,background:d.background,nickname:d.nickname});})()`);
    process.stdout.write(`${tag}: ${d}\n`);
  };
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(port, 15000, { record() {} });
    await cdp.connect();
    for (let n = 0; n < 80; n += 1) {
      const raw = await runner.snapshot(cdp);
      const cur = runner.gateSnapshot(raw, 'h5');
      if (cur.creationComplete && cur.homeVisible) {
        process.stdout.write('HOME REACHED\n');
        const prof = await cdp.evaluate(`window.__GAME_FACADE__.queryProfession()`);
        const profile = await cdp.evaluate(`JSON.stringify(window.__GAME_FACADE__.queryCharacterProfile()).slice(0,400)`);
        process.stdout.write(`queryProfession()=${prof}\nprofile=${profile}\n`);
        break;
      }
      if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
      const draft = (cur.creation && cur.creation.draft) || {};
      const step = String(draft.step || '').toUpperCase();
      let action = null;
      if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
      else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
      else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click('[data-creation-choice="profession:FRONTEND"]');
      else if (step === 'IDENTITY') {
        if (!draft.nickname) action = await cdp.type('#v59-nickname', 'QA职业员');
        else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
        else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
      } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
      else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
      else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
      await dumpDraft(`iter${n} step=${step} action=${action && action.selector || (action && action.clicked)}`);
      await sleep(350);
    }
  } catch (e) {
    process.stdout.write(`ERROR: ${e.message}\n`);
  } finally {
    if (cdp) cdp.close();
    try { child.kill(); } catch (_) {}
  }
})();
