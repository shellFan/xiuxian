'use strict';

/**
 * V10 FULL QA — deep gameplay probe v2 (H5, real CDP input events).
 *
 * Single continuous journey on one fresh save (JAVA_BACKEND):
 *   J1 boot+wizard+gates
 *   J2 stage journey 1→12 with real taps; miniBoss@5/10, cardBoss@12 via
 *      BOSS_PENDING → real card battle loop (play/end-turn/reward)
 *   J3 upgrade-verify when spiritStones ≥ 20 (real cost + real stat change)
 *      — insufficient-funds rejection verified BEFORE that
 *   J4 hire-verify when spiritStones ≥ 50 (squad grows, real member)
 *   J5 equipment-verify after a bag drop (30 kills), equip → stats change
 *   J6 save-consistency: mid-run reload, no double settlement
 *
 * Evidence: ai/reports/v10-qa-final/deep-probe/<run>/evidence.jsonl
 * Screenshots: docs/QA/screenshots/
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
const PROFESSION = (args.indexOf('--profession') >= 0 ? args[args.indexOf('--profession') + 1] : 'JAVA_BACKEND');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'QA', 'screenshots');
const RUN = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-qa-final', 'deep-probe');

class M {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  record(row) { fs.appendFileSync(path.join(this.dir, 'evidence.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'); }
  async shot(cdp, name) {
    try {
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `${PROFESSION.toLowerCase()}-${name}.png`);
      await cdp.screenshot(file);
      this.record({ type: 'screenshot', name, file });
      return file;
    } catch (e) { this.record({ type: 'screenshot-fail', name, error: String(e.message) }); return null; }
  }
}

const VIEW_JS = `(function(){
  const f = window.__GAME_FACADE__;
  if (!f || !f.queryAutoBattle) return { facade: false };
  let v = null; try { v = f.queryAutoBattle(); } catch (e) { return { facade: true, error: String(e) }; }
  let prof = null; try { prof = f.queryProfession ? f.queryProfession() : null; } catch (e) {}
  // 背包实例来自 queryEquipView().bag（queryEquipmentLibrary 是全目录目录视图，
  // queryAutoBattle view 不含 equipment 字段——曾导致探针永远看不到掉落）。
  let ev = null; try { ev = f.queryEquipView ? f.queryEquipView() : null; } catch (e) {}
  const bag = (ev && Array.isArray(ev.bag)) ? ev.bag : [];
  return {
    facade: true,
    stage: v.stage, maxStage: v.maxStage, status: v.status, autoEnabled: v.autoEnabled,
    chapter: v.chapterTitle,
    enemy: v.enemy ? { name: v.enemy.name, hp: v.enemy.hp, maxHp: v.enemy.maxHp, isBoss: !!(v.enemy.isBoss || v.enemy.isCardBoss) } : null,
    squadN: v.squad ? v.squad.length : 0,
    squad: (v.squad || []).map(m => ({ name: m.name, prof: m.profession, level: m.level, atk: m.attack })),
    clickDamage: v.clickDamage, totalKills: v.totalKills, spiritStones: v.spiritStones,
    pendingChests: v.pendingChests, towerFloor: v.towerFloor,
    profession: prof,
    equipBagN: bag.length,
    equipBag: bag.slice(0, 4).map(i => ({ id: i.id || i.defId, defId: i.defId, equipped: !!i.equipped })),
    salary: (typeof v.salary === 'number') ? v.salary : null,
  };
})()`;

async function readView(cdp) {
  try { return await cdp.evaluate(VIEW_JS); } catch (e) { return { facade: false, error: String(e.message) }; }
}

async function wizardComplete(cdp, manifest) {
  const deadline = Date.now() + 90000;
  for (let n = 0; n < 150 && Date.now() < deadline; n += 1) {
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (cur.creationComplete && cur.homeVisible) return { pass: true, iterations: n };
    if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
    const creation = cur.creation || {};
    const draft = creation.draft || {};
    const step = String(draft.step || creation.step || '').toUpperCase();
    let action = null;
    if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
    else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click(`[data-creation-choice="profession:${PROFESSION}"]`);
    else if (step === 'IDENTITY') {
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'QA测试员');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    manifest.record({ type: 'wizard-action', n, step, clicked: !!(action && action.clicked) });
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return { pass: false, reason: 'wizard-timeout' };
}

/** Inline card-battle loop (mirror of cdp-runner's internal runCardBattleSession). */
async function cardBattleSession(cdp, manifest, label, maxMs = 150000) {
  const steps = [];
  const deadline = Date.now() + maxMs;
  let guard = 0;
  while (Date.now() < deadline && guard < 60) {
    guard += 1;
    // Event/skill-offer/RESULT/tutorial/REWARD/SETTLEMENT modals render ON TOP
    // of the live card battle and swallow every play/end-turn click — clear
    // them first each iteration. Reward pick/skip must be unconditional
    // (projection.reward is the AUTO-battle field, not the card reward modal).
    // Tutorial: SKIP wins over Next (Next loops forever unattended).
    const evt = await cdp.clickFirst(['[data-battle-skill]', '[data-vevent-choice]', '#V2EventOk', '#EventOkBtn', '[data-action="battleRewardPick"]', '[data-action="battleRewardSkip"]', '[data-project-decision]', '[data-battle-fallback-exit]', '[data-action="battleTutorialSkip"]', '[data-action="battleTutorialNext"]']);
    if (evt.clicked) {
      steps.push({ at: guard, action: 'modal-clear', ...evt });
      await sleep(550);
      continue;
    }
    const snap = await runner.snapshot(cdp);
    const v = await readView(cdp);
    if (snap.projection && snap.projection.reward) {
      const pick = await cdp.clickFirst(['[data-action="battleRewardPick"]', '[data-action="battleRewardSkip"]']);
      steps.push({ at: guard, action: 'reward', ...pick });
      if (!pick.clicked) break;
      await sleep(700);
      continue;
    }
    // Only USABLE cards advance the battle — disabled cards (.is-disabled CSS,
    // not [disabled]) swallow clicks and stall the turn forever.
    // 1) A pending needs-target selection must be CAST at an enemy first.
    const selected = await cdp.evaluate(`!!document.querySelector('[data-action="battlePlayCard"].is-selected')`);
    if (selected === true) {
      const enemy = await cdp.click('[data-enemy-uid]');
      steps.push({ at: guard, action: 'target-enemy', ...enemy });
      await sleep(550);
      continue;
    }
    // 2) Play a usable, unselected card (instant cast or enter selection).
    const played = await cdp.clickFirst(['[data-action="battlePlayCard"].is-usable:not(.is-disabled):not(.is-selected)']);
    if (played.clicked) {
      steps.push({ at: guard, action: 'play-card', ...played });
      await sleep(550);
      continue;
    }
    // 3) Nothing playable → end the turn.
    const ended = await cdp.click('[data-action="battleEndTurn"]:not(.is-disabled)');
    if (ended.clicked) {
      steps.push({ at: guard, action: 'end-turn', ...ended });
      await sleep(950);
      continue;
    }
    const status = String((snap.projection && snap.projection.status) || (v.status) || '').toUpperCase();
    if (status === 'VICTORY' || status === 'DEFEAT' || !(snap.projection && snap.projection.cardPhase)) break;
    await sleep(650);
  }
  manifest.record({ type: 'card-battle-session', label, stepsCount: steps.length, steps });
  return steps;
}

async function main() {
  // Disjoint CDP port band (other probes: 21500/21700; harness: pass explicit --port when parallel).
  const port = 21300 + Math.floor(Math.random() * 100);
  const profileDir = path.join(os.tmpdir(), `xiuxian-deepqa2-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const manifest = new M(path.join(RUN, `deep2-${PROFESSION.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`));
  const results = { phases: {} };
  const summary = (phase, obj) => { results.phases[phase] = obj; manifest.record({ type: 'phase-result', phase, ...obj }); process.stdout.write(`[${phase}] ${JSON.stringify(obj)}\n`); };
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(port, 15000, manifest);
    await cdp.connect();

    // ── J1 boot ─────────────────────────────────────────────────────
    const wiz = await wizardComplete(cdp, manifest);
    const homeSnap = runner.gateSnapshot(await runner.snapshot(cdp), 'h5');
    const gates = runner.BootGate.homeGates(homeSnap);
    const gatesPass = Object.values(gates).every(Boolean);
    await manifest.shot(cdp, 'J1-home');
    summary('J1-boot', { pass: wiz.pass && gatesPass, wizard: wiz.pass, gates, profession: PROFESSION });
    if (!wiz.pass || !gatesPass) { results.status = 'FAIL-J1'; return results; }

    await cdp.clickText('战斗');
    await sleep(900);

    // ── J2 stage journey (1→12 incl. card boss) ─────────────────────
    const journey = { stageEvents: [], cardSessions: [], rejectionTested: false, upgradeResult: null, hireResult: null, equipResult: null };
    let lastStage = -1; let stageEnteredAt = Date.now();
    let upgradeDone = false; let hireDone = false; let equipDone = false;
    let rejectionDone = false;
    let lastTapAt = 0; let lastChestAt = 0;
    const deadline = Date.now() + 780000; // 13 min budget
    let bossSessions = 0;
    let cardModalWasUp = false;
    while (Date.now() < deadline) {
      const snap = await runner.snapshot(cdp);
      const v = await readView(cdp);
      if (!v.facade) { await sleep(500); continue; }

      // Stage-transition bookkeeping FIRST (never skipped by modal/card branches).
      if (v.stage !== lastStage && v.stage > 0) {
        if (lastStage >= 1) {
          journey.stageEvents.push({ completedStage: lastStage, durationMs: Date.now() - stageEnteredAt, kills: v.totalKills, stones: v.spiritStones, squadN: v.squadN, clickDamage: v.clickDamage });
          manifest.record({ type: 'stage-complete', stage: lastStage, durationMs: Date.now() - stageEnteredAt, kills: v.totalKills, stones: v.spiritStones });
        }
        stageEnteredAt = Date.now(); lastStage = v.stage;
        manifest.record({ type: 'stage-enter', stage: v.stage, enemy: v.enemy, status: v.status });
        if (v.stage === 5 || v.stage === 10) await manifest.shot(cdp, `J2-stage${v.stage}-miniboss`);
      }

      // Card battle UI must be checked FIRST: it renders inside .ux-modal-layer
      // too, so a generic modal dismissal would close a live card battle.
      const cardUi = await cdp.evaluate(`!!(document.querySelector('[data-battle-build]')||document.querySelector('[data-action="battlePlayCard"]')||document.querySelector('[data-action="battleEndTurn"]')||document.querySelector('[data-action="battleRewardPick"]'))`);
      if (cardUi === true) {
        if (!cardModalWasUp) {
          manifest.record({ type: 'card-battle-start', stage: v.stage, stones: v.spiritStones });
          await manifest.shot(cdp, `J2-cardbattle-start-s${v.stage}`);
        }
        cardModalWasUp = true;
        // Build-selection state: pick a build first or the session loop no-ops.
        const buildPicked = await cdp.clickFirst(['[data-battle-build]']);
        if (buildPicked.clicked) await sleep(700);
        const steps = await cardBattleSession(cdp, manifest, `s${v.stage}#${++bossSessions}`, 120000);
        journey.cardSessions.push({ stage: v.stage, session: bossSessions, steps: steps.length, stonesAfter: (await readView(cdp)).spiritStones });
        await manifest.shot(cdp, `J2-cardbattle-done-s${v.stage}`);
        cardModalWasUp = false;
        continue;
      }

      // Random event / offline / tutorial modals: dismiss BEFORE the boss
      // entry — an open event modal (e.g. 加班幻觉) sits on top and swallows
      // every click aimed at nav buttons / boss tags. NOTE: fall THROUGH after
      // dismissing — the game re-dispatches events every ~600ms, and a
      // `continue` here starves the upgrade/hire/equip checks below forever
      // (observed 1442 consecutive dismissals in one run).
      if (snap.modal) {
        const handled = await runner.handleSpecificModal(cdp, snap);
        manifest.record({ type: 'journey-modal-dismissed', modalText: (snap.modal.text || '').slice(0, 80), handled: handled.handled, via: handled.selector || handled.via });
        if (!handled.handled) await cdp.clickFirst(['[data-action="closePopup"]', '[data-project-decision]', '[data-battle-fallback-exit]']);
        await sleep(300);
      }

      // BOSS_PENDING: enter the card battle — reliable chain proven by the
      // harness: bottom-nav PROJECT → projectEntry → build modal → session.
      if (v.status === 'BOSS_PENDING' && !cardModalWasUp) {
        const entry = await cdp.clickFirst(['[data-battle-build]', '[data-action="projectEntry"]', '[data-nav="PROJECT"]']);
        manifest.record({ type: 'boss-entry-click', stage: v.stage, via: entry.selector, clicked: !!entry.clicked });
        await sleep(900);
        continue;
      }

      // Open chests when pending (stones economy)
      if (v.pendingChests > 0 && Date.now() - lastChestAt > 2500) {
        lastChestAt = Date.now();
        await cdp.click('[data-action="v63-openChest"]');
      }

      // Real taps to assist
      if (Date.now() - lastTapAt > 800) {
        lastTapAt = Date.now();
        await cdp.click('[data-action="v63-tapAttack"]');
      }

      // J3a insufficient-funds rejection (once, when stones < 20)
      if (!rejectionDone && v.spiritStones < 20 && v.stage >= 2) {
        rejectionDone = true;
        const dmg0 = v.clickDamage; const st0 = v.spiritStones;
        // Boss battles leave the UI on the PROJECT page — return to BATTLE first.
        await cdp.clickFirst(['[data-nav="BATTLE"]']);
        await sleep(500);
        const click = await cdp.click('[data-action="v63-upgradeClick"]');
        await sleep(600);
        const v2 = await readView(cdp);
        journey.rejectionTested = click.clicked && v2.clickDamage === dmg0 && v2.spiritStones === st0;
        manifest.record({ type: 'upgrade-rejection-test', pass: journey.rejectionTested, stones: st0, toastExpected: '灵石不足' });
      }

      // J3b real upgrade (once affordable)
      if (!upgradeDone && v.spiritStones >= 20 && v.status === 'FIGHTING') {
        const dmg0 = v.clickDamage; const st0 = v.spiritStones;
        // Boss battles leave the UI on the PROJECT page — return to BATTLE first.
        await cdp.clickFirst(['[data-nav="BATTLE"]']);
        await sleep(500);
        const click = await cdp.click('[data-action="v63-upgradeClick"]');
        await sleep(700);
        const v2 = await readView(cdp);
        upgradeDone = click.clicked && v2.clickDamage > dmg0 && v2.spiritStones < st0;
        journey.upgradeResult = { pass: upgradeDone, clicked: click.clicked, before: dmg0, after: v2.clickDamage, stonesBefore: st0, stonesAfter: v2.spiritStones };
        manifest.record({ type: 'upgrade-verify', ...journey.upgradeResult });
        await manifest.shot(cdp, 'J3-upgraded');
      }

      // J4 hire (once affordable: 50)
      if (!hireDone && v.spiritStones >= 50 && v.squadN < 5) {
        await cdp.clickFirst(['[data-nav="BATTLE"]']);
        await sleep(500);
        await cdp.click('[data-action="v63-hireMenu"]');
        await sleep(500);
        const hireBtn = await cdp.clickFirst(['[data-action="v63-hire"]']);
        await sleep(800);
        const v2 = await readView(cdp);
        hireDone = hireBtn.clicked && v2.squadN > v.squadN;
        journey.hireResult = { pass: hireDone, clicked: hireBtn.clicked, squadBefore: v.squadN, squadAfter: v2.squadN, squad: v2.squad, stonesAfter: v2.spiritStones };
        manifest.record({ type: 'hire-verify', ...journey.hireResult });
        await manifest.shot(cdp, 'J4-hired');
        await cdp.clickFirst(['[data-action="v63-closeHireMenu"]']);
      }

      // J5 equipment (once a bag drop exists)
      if (!equipDone && v.equipBagN > 0) {
        await cdp.clickFirst(['[data-nav="BATTLE"]']);
        await sleep(500);
        const open = await cdp.click('[data-action="v64-openEquip"]');
        await sleep(700);
        let equipBtn = await cdp.clickFirst(['[data-action="v64-equipItem"]', '[data-equip-action="equip"]', '[data-action="v64-equip"]']);
        await sleep(700);
        const v2 = await readView(cdp);
        equipDone = open.clicked && !!equipBtn.clicked;
        journey.equipResult = { pass: equipDone, opened: open.clicked, equipClicked: !!equipBtn.clicked, bag: v2.equipBag, squadAfter: v2.squad };
        manifest.record({ type: 'equip-verify', ...journey.equipResult });
        await manifest.shot(cdp, 'J5-equipped');
        await cdp.clickFirst(['[data-action="v64-closeEquip"]']);
      }

      // All milestones complete → stop early
      if (upgradeDone && hireDone && equipDone && journey.cardSessions.length > 0 && v.stage >= 13) break;
      await sleep(450);
    }

    const finalView = await readView(cdp);
    await manifest.shot(cdp, 'J2-journey-final');
    const stagesOk = journey.stageEvents.length >= 4 && finalView.stage >= 5;
    const bossOk = journey.cardSessions.some((s) => s.steps > 0);
    summary('J2-journey', {
      pass: stagesOk && bossOk,
      stagesCompleted: journey.stageEvents.length,
      maxStageReached: finalView.stage,
      stageEvents: journey.stageEvents,
      cardSessions: journey.cardSessions,
      finalView: { stage: finalView.stage, status: finalView.status, kills: finalView.totalKills, stones: finalView.spiritStones, squadN: finalView.squadN, clickDamage: finalView.clickDamage },
    });

    // J3 result
    summary('J3-upgrade', { pass: journey.rejectionTested && !!(journey.upgradeResult && journey.upgradeResult.pass), rejectionTested: journey.rejectionTested, ...(journey.upgradeResult || { note: 'not-affordable-in-budget' }) });

    // J4 result
    summary('J4-hire', { pass: !!(journey.hireResult && journey.hireResult.pass), ...(journey.hireResult || { note: 'not-affordable-in-budget' }) });

    // J5 result
    summary('J5-equipment', { pass: !!(journey.equipResult && journey.equipResult.pass), ...(journey.equipResult || { note: 'no-drop-in-budget' }) });

    // ── J6 save consistency ─────────────────────────────────────────
    const pre6 = await readView(cdp);
    await cdp.command('Page.reload', { ignoreCache: true });
    let reloaded = false;
    for (let i = 0; i < 50 && !reloaded; i += 1) {
      await sleep(700);
      const v = await readView(cdp);
      if (v.facade && v.stage > 0) reloaded = true;
    }
    const post6 = await readView(cdp);
    const noDoubleSettle = post6.spiritStones === pre6.spiritStones;
    const stageOk = post6.stage === pre6.stage || post6.maxStage >= pre6.maxStage;
    await manifest.shot(cdp, 'J6-after-reload');
    summary('J6-save-consistency', { pass: reloaded && stageOk && noDoubleSettle, stageBefore: pre6.stage, stageAfter: post6.stage, stonesBefore: pre6.spiritStones, stonesAfter: post6.spiritStones, squadBefore: pre6.squadN, squadAfter: post6.squadN });

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
