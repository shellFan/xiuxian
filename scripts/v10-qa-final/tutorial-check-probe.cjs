'use strict';

/** Quick tutorial behaviour check: appears on first battle, skip persists. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;
const URL = 'http://127.0.0.1:8633/';

(async () => {
  const port = 29900 + Math.floor(Math.random() * 100);
  const profileDir = path.join(os.tmpdir(), `xiuxian-tutqa-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  const out = {};
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(port, 15000, { record() {} });
    await cdp.connect();
    // wizard
    for (let n = 0; n < 150; n += 1) {
      const cur = runner.gateSnapshot(await runner.snapshot(cdp), 'h5');
      if (cur.creationComplete && cur.homeVisible) break;
      if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
      const draft = (cur.creation && cur.creation.draft) || {};
      const step = String(draft.step || '').toUpperCase();
      let a = null;
      if (step === 'INDUSTRY' && !draft.industry) a = await cdp.click('[data-creation-choice="industry:INTERNET"]');
      else if (step === 'DIRECTION' && !draft.direction) a = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
      else if (step === 'PROFESSION' && !draft.professionConfirmed) a = await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
      else if (step === 'IDENTITY') {
        if (!draft.nickname) a = await cdp.type('#v59-nickname', 'QA教程员');
        else if (!draft.background) a = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
        else a = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
      } else if (step === 'DESTINY' && !draft.selectedCandidateId) a = await cdp.click('[data-creation-choice^="candidate:"]');
      else if (step === 'CONFIRM') a = await cdp.click('[data-creation-action="finalize"]');
      else a = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
      if (a && !a.clicked) await sleep(400); else await sleep(280);
    }
    await cdp.clickText('战斗');
    await sleep(1200);
    // Enter a CARD battle (tutorial renders inside the card battle panel):
    // PROJECT page → projectEntry → build pick.
    await cdp.clickFirst(['[data-nav="PROJECT"]']);
    await sleep(800);
    await cdp.clickFirst(['[data-action="projectEntry"]']);
    await sleep(800);
    const build = await cdp.clickFirst(['[data-battle-build]']);
    out.buildPicked = !!build.clicked;
    await sleep(1200);
    // Tutorial visible on first battle?
    out.tutVisibleFirst = await cdp.evaluate(`!!document.querySelector('.ux-bc-tutorial')`);
    // Skip it
    const skip = await cdp.click('[data-action="battleTutorialSkip"]');
    out.skipClicked = !!skip.clicked;
    await sleep(800);
    out.tutVisibleAfterSkip = await cdp.evaluate(`!!document.querySelector('.ux-bc-tutorial')`);
    // Flag persisted?
    out.flagSet = await cdp.evaluate(`(function(){try{return window.__GAME_FACADE__.queryPlayerFlag('v59o_battle_tutorial_done')===true;}catch(e){return 'ERR:'+e.message}})()`);
    // Reload → tutorial must stay hidden (re-enter card battle)
    await cdp.command('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 40; i += 1) { await sleep(700); if (await cdp.evaluate('!!window.__GAME_FACADE__')) break; }
    await cdp.clickFirst(['[data-nav="PROJECT"]']);
    await sleep(800);
    await cdp.clickFirst(['[data-action="projectEntry"]']);
    await sleep(800);
    await cdp.clickFirst(['[data-battle-build]']);
    await sleep(1200);
    out.tutVisibleAfterReload = await cdp.evaluate(`!!document.querySelector('.ux-bc-tutorial')`);
    out.pass = out.tutVisibleFirst === true && out.skipClicked === true && out.tutVisibleAfterSkip === false && out.flagSet === true && out.tutVisibleAfterReload === false;
    console.log(JSON.stringify(out));
  } catch (e) {
    out.error = String(e && e.message || e);
    console.log(JSON.stringify(out));
  } finally {
    if (cdp) cdp.close();
    try { child.kill(); } catch (_) {}
  }
})();
