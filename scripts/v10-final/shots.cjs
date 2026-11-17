#!/usr/bin/env node
'use strict';

/**
 * V10 FINAL E2E screenshot pass (01-boot ... 18-restart).
 *
 * Drives the packaged EXE over CDP with real input events, walking the full
 * new-player journey and saving numbered runtime screenshots. Reuses the
 * harness primitives (MiniWebSocket, snapshot JS, modal handling) so the
 * behaviour matches the acceptance runs exactly.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, 'cdp-runner.cjs'));
const sleep = runner.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

const EXE = path.resolve(__dirname, '..', '..', 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');
const OUT = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-final', 'screenshots', 'desktop');
const PORT = 25000 + Math.floor(Math.random() * 5000);

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profileDir = path.join(os.tmpdir(), `xiuxian-shots-profile-${process.pid}-${Date.now()}`);
  const saveDir = path.join(os.tmpdir(), `xiuxian-shots-save-${process.pid}-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(saveDir, { recursive: true });
  const childEnv = { ...process.env, XIUXIAN_USER_DATA: saveDir };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`],
    { cwd: path.dirname(EXE), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const cdp = new runner.CdpClient(PORT, 15000, { record: () => {}, recordType: 'shots' });
  const shots = [];
  const shot = async (name) => {
    try {
      const file = path.join(OUT, name);
      await cdp.screenshot(file);
      shots.push(name);
      process.stdout.write(`[shot] ${name}\n`);
    } catch (e) { process.stdout.write(`[shot] FAIL ${name}: ${e.message}\n`); }
  };
  try {
    await sleepMs(9000); // boot
    await cdp.connect();
    await shot('01-boot.png');

    // Character creation wizard (same step machine as the harness).
    let creationDone = false;
    for (let n = 0; n < 80 && !creationDone; n += 1) {
      const raw = await runner.snapshot(cdp);
      const cur = runner.gateSnapshot(raw, 'exe');
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
        if (!shots.some((s) => s === '02-character-creation.png')) {
          await shot('02-character-creation.png');
        }
      } else if (step === 'DESTINY' && !draft.selectedCandidateId) {
        if (!shots.some((s) => s === '02-character-creation.png')) await shot('02-character-creation.png');
        await cdp.click('[data-creation-choice^="candidate:"]');
      } else if (step === 'CONFIRM') await cdp.click('[data-creation-action="finalize"]');
      else await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
      await sleepMs(450);
    }
    if (!creationDone) process.stdout.write('[shots] creation did not complete; continuing anyway\n');
    await sleepMs(1200);
    await shot('03-cave-home.png');

    const gotoNav = async (tabId) => { await cdp.click(`[data-nav="${tabId}"]`); await sleepMs(900); };
    const dismiss = async () => {
      const snap = await runner.snapshot(cdp);
      if (!snap.modal) return;
      const inBattle = await cdp.evaluate('!!(document.querySelector(\'[data-action="battlePlayCard"]\')||document.querySelector(\'[data-action="battleEndTurn"]\'))');
      if (inBattle) return;
      await runner.handleSpecificModal(cdp, snap);
      await cdp.clickFirst(['[data-action="closePopup"]']);
      await sleepMs(300);
    };

    // 04 growth page & 05 battle page.
    await gotoNav('CAVE');
    await dismiss();
    await shot('04-growth.png');
    await gotoNav('BATTLE');
    await dismiss();
    await sleepMs(1500);
    await shot('05-battle.png');
    await shot('06-normal-enemy.png');

    // 07/08 Boss: open the project page and enter the boss fight if reachable.
    await gotoNav('PROJECT');
    await dismiss();
    let bossBtn = await cdp.clickFirst(['[data-action="v63-gotoCardBattle"]', '[data-action="projectEntry"]']);
    if (!bossBtn.clicked) bossBtn = await cdp.clickText('进入项目');
    if (!bossBtn.clicked) bossBtn = await cdp.clickText('项目');
    process.stdout.write(`[boss entry] ${JSON.stringify(bossBtn)}\n`);
    await sleepMs(1200);
    await shot('07-boss-intro.png');
    let buildPicked = await cdp.click('[data-battle-build]');
    if (!buildPicked.clicked) {
      const modalSnap = await runner.snapshot(cdp);
      if (modalSnap.modal) {
        buildPicked = await runner.handleSpecificModal(cdp, modalSnap);
        buildPicked = { clicked: buildPicked.handled };
      }
    }
    process.stdout.write(`[build pick] ${JSON.stringify(buildPicked)}\n`);
    await sleepMs(1500);
    await shot('08-boss-battle.png');

    // 09-11 card battle loop: play through waves until the reward screen.
    for (let turn = 0; turn < 240; turn += 1) {
      const played = await cdp.clickFirst(['[data-action="battlePlayCard"]']);
      if (played.clicked) {
        await sleepMs(400);
        if (turn === 0) await shot('09-card-hand.png');
        await cdp.click('[data-enemy-uid]');
        await sleepMs(500);
        if (turn === 1) await shot('10-card-selection.png');
        continue;
      }
      const ended = await cdp.click('[data-action="battleEndTurn"]');
      if (ended.clicked) { await sleepMs(900); continue; }
      const reward = await cdp.clickFirst(['[data-action="battleRewardPick"]', '[data-action="battleRewardSkip"]']);
      if (reward.clicked) {
        await sleepMs(700);
        await shot('11-card-result.png');
        break;
      }
      // Stage-gate modals (知道了 / tutorial) block the battle buttons; clear
      // them through the same handler the acceptance runs use.
      const blocked = await runner.snapshot(cdp);
      if (blocked.modal) {
        await runner.handleSpecificModal(cdp, blocked);
        await sleepMs(500);
        continue;
      }
      const proj = blocked;
      if (proj.projection && ['VICTORY', 'DEFEAT'].includes(String(proj.projection.status || '').toUpperCase())) {
        await shot('11-card-result.png');
        break;
      }
      await sleepMs(700);
    }

    // 12 equipment.
    await gotoNav('BATTLE');
    await dismiss();
    const equip = await cdp.click('[data-action="v64-openEquip"]');
    process.stdout.write(`[equip open] ${JSON.stringify(equip)}\n`);
    await sleepMs(900);
    await shot('12-equipment.png');
    await cdp.click('[data-action="v64-closeEquip"]');
    await sleepMs(300);

    // 13 employees (growth/squad page).
    await gotoNav('GROWTH');
    await dismiss();
    await sleepMs(500);
    await shot('13-employee.png');

    // 14 promotion target card (home).
    await gotoNav('CAVE');
    await dismiss();
    await sleepMs(400);
    await shot('14-promotion.png');

    // 15 messenger + 16 NPC chat.
    let messenger = await cdp.clickFirst(['[data-action="openMessenger"]']);
    if (!messenger.clicked) messenger = await cdp.clickText('飞剑');
    if (!messenger.clicked) messenger = await cdp.clickText('传书');
    process.stdout.write(`[messenger] ${JSON.stringify(messenger)}\n`);
    await sleepMs(900);
    await shot('15-messenger.png');
    let npc = await cdp.clickFirst(['[data-ai-npc="master"]', '[data-ai-npc]']);
    if (!npc.clicked) npc = await cdp.clickText('掌门');
    process.stdout.write(`[npc pick] ${JSON.stringify(npc)}\n`);
    await sleepMs(500);
    await shot('16-npc-chat.png');
    await cdp.clickFirst(['[data-action="closePopup"]']);
    await sleepMs(300);

    // 17 daily report: found in task page or end-of-day settlement.
    await gotoNav('TASKS');
    await dismiss();
    await sleepMs(400);
    await shot('17-daily-report.png');

    // 18 restart & restore.
    const facadeKeysBefore = await cdp.evaluate('Object.keys(localStorage||{})');
    await cdp.command('Page.reload', { ignoreCache: true });
    let restored = false;
    for (let i = 0; i < 40; i += 1) {
      await sleepMs(500);
      const snap = await runner.snapshot(cdp);
      if (snap.facadeReady) { restored = true; break; }
    }
    await sleepMs(1500);
    await shot('18-restart.png');
    process.stdout.write(`[restart] restored=${restored} keysBefore=${facadeKeysBefore && facadeKeysBefore.length}\n`);
    process.stdout.write('[shots] COMPLETE: ' + shots.length + ' screenshots\n');
  } finally {
    try { cdp.close(); } catch (_) { /* socket gone */ }
    try { child.kill(); } catch (_) { /* already gone */ }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[shots] FATAL', e && e.stack || e); process.exit(1); });
