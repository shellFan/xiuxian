#!/usr/bin/env node
'use strict';

/**
 * Focused captures: 15-messenger (inbox), 16-npc-chat (real MNN reply),
 * 17-daily-report (task page + report panel). Run against the packaged EXE
 * with a fresh isolated save; AI server must be up on 127.0.0.1:7860.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const runner = require(path.join(__dirname, 'cdp-runner.cjs'));
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = path.resolve(__dirname, '..', '..', 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');
const OUT = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-final', 'screenshots', 'desktop');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profileDir = path.join(os.tmpdir(), `xiuxian-aishots-profile-${Date.now()}`);
  const saveDir = path.join(os.tmpdir(), `xiuxian-aishots-save-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(saveDir, { recursive: true });
  const env = { ...process.env, XIUXIAN_USER_DATA: saveDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(EXE, ['--remote-debugging-port=29500', `--user-data-dir=${profileDir}`], { env, stdio: 'ignore', windowsHide: true });
  const cdp = new runner.CdpClient(29500, 15000, { record() {} });
  const shot = async (name) => { await cdp.screenshot(path.join(OUT, name)); console.log('[shot]', name); };
  try {
    await sleepMs(9000);
    await cdp.connect();
    for (let n = 0; n < 80; n += 1) {
      const raw = await runner.snapshot(cdp);
      const cur = runner.gateSnapshot(raw, 'exe');
      if (cur.creationComplete && cur.homeVisible) break;
      if (cur.modal) { await runner.handleSpecificModal(cdp, cur); continue; }
      const d = (cur.creation && cur.creation.draft) || {};
      const s = String(d.step || '').toUpperCase();
      if (s === 'INDUSTRY' && !d.industry) await cdp.click('[data-creation-choice="industry:INTERNET"]');
      else if (s === 'DIRECTION' && !d.direction) await cdp.click('[data-creation-choice="direction:TECH_RND"]');
      else if (s === 'PROFESSION' && !d.professionConfirmed) await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
      else if (s === 'IDENTITY') {
        if (!d.nickname) await cdp.type('#v59-nickname', '范大牛');
        else if (!d.background) await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
        else await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
      } else if (s === 'DESTINY' && !d.selectedCandidateId) await cdp.click('[data-creation-choice^="candidate:"]');
      else if (s === 'CONFIRM') await cdp.click('[data-creation-action="finalize"]');
      else await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
      await sleepMs(400);
    }
    await sleepMs(1000);
    // Messenger inbox (home shortcut 飞剑).
    const open = await cdp.clickFirst(['[data-action="openMessenger"]', '[data-action="openModal"][data-modal="messenger"]']);
    console.log('[messenger open]', JSON.stringify(open));
    await sleepMs(900);
    await shot('15-messenger.png');
    // NPC chat: pick 掌门 and send a real message (MNN if running).
    const npc = await cdp.clickFirst(['[data-ai-npc="master"]', '[data-ai-npc]']);
    console.log('[npc pick]', JSON.stringify(npc));
    await sleepMs(600);
    await shot('16-npc-chat.png');
    const typed = await cdp.type('#AiChatInput', '掌门，我该如何突破当前境界？');
    console.log('[npc type]', JSON.stringify(typed));
    await sleepMs(300);
    const send = await cdp.clickFirst(['[data-ai-send]', '.ux-ai-send']);
    console.log('[npc send]', JSON.stringify(send));
    await sleepMs(1200);
    await cdp.screenshot(path.join(OUT, '16b-npc-chat-reply.png'));
    console.log('[shot] 16b-npc-chat-reply.png');
    await cdp.clickFirst(['[data-action="closePopup"]']);
    await sleepMs(500);
    // Daily report: task page has the day objective/report surfaces.
    await cdp.click('[data-nav="TASKS"]');
    await sleepMs(900);
    await shot('17-daily-report.png');
  } finally {
    try { cdp.close(); } catch (_) { /* socket gone */ }
    try { child.kill(); } catch (_) { /* gone */ }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[ai-shots] FATAL', e && e.stack || e); process.exit(1); });
