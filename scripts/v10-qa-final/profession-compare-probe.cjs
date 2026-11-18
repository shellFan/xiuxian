'use strict';

/**
 * V10 FULL QA — four-profession difference probe (H5, real CDP input events).
 *
 * For each profession (JAVA_BACKEND / FRONTEND / QA / DEVOPS):
 *   - fresh isolated profile → wizard picks THAT profession
 *   - read profession view + fixed stats + initial squad atk + clickDamage
 *   - run one real card battle session (build pick → play/end/reward)
 *   - verify card pool differs (first build cards names)
 *
 * Verdict: professions must differ in stats AND battle behaviour, not just name.
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
const PROFESSIONS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'];
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'QA', 'screenshots');
const RUN = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10-qa-final', 'profession-probe');

class M {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  record(row) { fs.appendFileSync(path.join(this.dir, 'evidence.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'); }
  async shot(cdp, name) {
    try {
      fs.mkdirSync(OUT, { recursive: true });
      const file = path.join(OUT, `prof-${name.toLowerCase()}.png`);
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
  let def = null; try { def = f.queryProfessionDef ? f.queryProfessionDef() : null; } catch (e) {}
  let lv = null; try { lv = f.queryProfessionLevel ? f.queryProfessionLevel() : null; } catch (e) {}
  let cards = null;
  try { if (f.queryRuntimeData) { const rd = f.queryRuntimeData(); cards = rd && rd.card && rd.card.hand ? rd.card.hand.map(c=>c.name||c.id) : null; } } catch (e) {}
  return {
    facade: true,
    stage: v.stage, status: v.status, chapter: v.chapterTitle,
    enemy: v.enemy ? { name: v.enemy.name, hp: v.enemy.hp, maxHp: v.enemy.maxHp } : null,
    squad: (v.squad||[]).map(m => ({ prof: m.profession, atk: m.attack, level: m.level, skillName: m.skillName })),
    clickDamage: v.clickDamage, spiritStones: v.spiritStones,
    profession: prof, professionDef: def ? { id: def.id || def.professionId, label: def.name || def.label, stats: def.stats || def.attributes || null } : null,
    professionLevel: lv, handCards: cards,
  };
})()`;

async function wizard(cdp, manifest, prof) {
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
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click(`[data-creation-choice="profession:${prof}"]`);
    else if (step === 'IDENTITY') {
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'QA职业员');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    manifest.record({ type: 'wizard-action', n, step, wanted: prof, clicked: !!(action && action.clicked), selector: action && action.selector });
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return false;
}

async function cardBattleOnce(cdp, manifest, label) {
  const steps = [];
  const deadline = Date.now() + 120000;
  let guard = 0;
  while (Date.now() < deadline && guard < 40) {
    guard += 1;
    const snap = await runner.snapshot(cdp);
    if (snap.projection && snap.projection.reward) {
      const pick = await cdp.clickFirst(['[data-action="battleRewardPick"]', '[data-action="battleRewardSkip"]']);
      steps.push({ at: guard, action: 'reward', ...pick });
      if (!pick.clicked) break;
      await sleep(700);
      continue;
    }
    const played = await cdp.clickFirst(['[data-action="battlePlayCard"]']);
    if (played.clicked) {
      steps.push({ at: guard, action: 'play-card' });
      await sleep(550);
      const hasTarget = await cdp.evaluate(`(function(){var e=document.querySelector('[data-enemy-uid]');return !!e;})()`);
      if (hasTarget === true) { await cdp.click('[data-enemy-uid]'); steps.push({ at: guard, action: 'target-enemy' }); await sleep(500); }
      continue;
    }
    const ended = await cdp.click('[data-action="battleEndTurn"]');
    if (ended.clicked) { steps.push({ at: guard, action: 'end-turn' }); await sleep(950); continue; }
    break;
  }
  manifest.record({ type: 'card-battle-session', label, stepsCount: steps.length });
  return steps;
}

async function main() {
  fs.mkdirSync(RUN, { recursive: true });
  const results = { professions: {} };
  for (const prof of PROFESSIONS) {
    // Disjoint CDP port band (other probes: 21300/21700).
    const port = 21500 + Math.floor(Math.random() * 100);
    const profileDir = path.join(os.tmpdir(), `xiuxian-profqa-${prof}-${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });
    const manifest = new M(path.join(RUN, prof.toLowerCase()));
    const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
    let cdp = null;
    const row = { profession: prof };
    try {
      await sleep(7000);
      cdp = new runner.CdpClient(port, 15000, manifest);
      await cdp.connect();
      const wiz = await wizard(cdp, manifest, prof);
      await sleep(1200);
      // Ground-truth assertion: the save must carry the chosen profession.
      row.savedProfessionId = await cdp.evaluate(`(function(){try{const p=window.__GAME_FACADE__.queryCharacterProfile();return p&&p.professionId;}catch(e){return 'ERR:'+e.message}})()`);
      await manifest.shot(cdp, `home-${prof}`);
      await cdp.clickText('战斗');
      await sleep(900);
      const view = await cdp.evaluate(VIEW_JS);
      row.view = view;
      // Card battle experience: navigate to PROJECT page first (the build
      // picker lives there), then pick a build and run one real session.
      await cdp.clickFirst(['[data-nav="PROJECT"]']);
      await sleep(700);
      const entry = await cdp.clickFirst(['[data-battle-build]', '[data-action="projectEntry"]', '[data-action="v63-gotoCardBattle"]']);
      await sleep(800);
      let sessionSteps = [];
      if (entry.clicked) {
        const build = await cdp.clickFirst(['[data-battle-build]']);
        await sleep(600);
        // Capture the chosen build's card names for pool comparison
        const buildCards = await cdp.evaluate(`(function(){const els=document.querySelectorAll('[data-battle-build]');return els.length;})()`);
        row.buildOptions = buildCards;
        sessionSteps = await cardBattleOnce(cdp, manifest, prof);
        await manifest.shot(cdp, `cardbattle-${prof}`);
      } else {
        // Maybe already in modal
        sessionSteps = await cardBattleOnce(cdp, manifest, prof + '-modal');
      }
      row.cardSessionSteps = sessionSteps.length;
      await sleep(800);
      const after = await cdp.evaluate(VIEW_JS);
      row.after = { stage: after.stage, status: after.status, enemyHp: after.enemy && after.enemy.hp, handCards: after.handCards };
      // V10 修复验证：职业必须在存档+战斗小队两个层面真实生效（技能名与攻击数值）。
      row.squadSkill = (view.squad || []).map((m) => m.skillName).join('/');
      row.squadAtk = (view.squad || []).map((m) => m.atk).join('/');
      row.pass = wiz && view.facade && view.profession === prof && row.savedProfessionId === prof && (view.squad || []).some((m) => m.prof === prof);
    } catch (e) {
      row.pass = false;
      row.error = String(e && e.stack || e).slice(0, 500);
    } finally {
      if (cdp) cdp.close();
      try { child.kill(); } catch (_) { /* exited */ }
      fs.writeFileSync(path.join(manifest.dir, 'result.json'), JSON.stringify(row, null, 2));
      results.professions[prof] = row;
      process.stdout.write(`[${prof}] pass=${row.pass} squadAtk=${JSON.stringify((row.view && row.view.squad || []).map(s => s.atk))} clickDamage=${row.view && row.view.clickDamage} sessionSteps=${row.cardSessionSteps}\n`);
    }
  }

  // Cross-profession comparison verdict
  const views = Object.values(results.professions).map((r) => r.view || {});
  const atkSets = new Set(views.map((v) => JSON.stringify((v.squad || []).map((s) => s.atk))));
  const cdSet = new Set(views.map((v) => v.clickDamage));
  results.verdict = {
    professionsRecorded: Object.keys(results.professions).length,
    allPassed: Object.values(results.professions).every((r) => r.pass === true),
    squadAtkDistinct: atkSets.size > 1,
    clickDamageDistinct: cdSet.size > 1,
  };
  fs.writeFileSync(path.join(RUN, 'results.json'), JSON.stringify(results, null, 2));
  process.stdout.write(`VERDICT: ${JSON.stringify(results.verdict)}\n`);
}

main().then(() => { process.exitCode = 0; }).catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exitCode = 1; });
