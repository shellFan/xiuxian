// 探针：EXE 内 overlay 页面状态 + 战斗 DOM 存在性。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QA, launchExe, Cdp, closeExe, sleep } from './cdp.mjs';

QA.isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'v59o-probe3-'));
const isoSave = path.join(QA.isolatedUserData, 'xiuxian-save');
fs.mkdirSync(isoSave, { recursive: true });

const boot = await launchExe({ logFile: path.join(QA.evidenceDir, 'probe3-boot.log') });
const { child } = boot;
const cdp = await Cdp.connect();
try {
  for (let i = 0; i < 30; i++) {
    if (await cdp.eval('!!(window.__GAME_FACADE__ && window.__GAME_FACADE__.context)')) break;
    await sleep(1000);
  }
  await sleep(2500);
  const setup = await cdp.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    if (f.queryCharacterCreation().status !== 'COMPLETE') {
      f.characterCreationSelectIndustry('INTERNET'); f.characterCreationAdvance();
      f.characterCreationSelectDirection('TECH_RND'); f.characterCreationAdvance();
      f.characterCreationSelectProfession('JAVA_BACKEND'); f.characterCreationAdvance();
      f.characterCreationSetIdentity('测试侠', 'avatar-1');
      f.characterCreationSetBackground('ORDINARY_WORKER'); f.characterCreationAdvance();
      var view = f.queryCharacterCreation();
      var cands = view.draft.candidates; var first = null;
      for (var k in cands) { first = cands[k]; break; }
      f.characterCreationSelectCandidate(first.id); f.characterCreationAdvance();
      for (var p = 0; p < 5; p++) f.characterCreationAllocate('insight', 1);
      f.characterCreationAdvance();
      f.characterCreationFinalize();
    }
    f.context.gameDay.ensureStarted();
    var opts = f.queryBattleBuildOptions();
    var run = f.startBattleRun('PROJECT', opts[0].id);
    return { setup: f.queryCharacterCreation().status, mode: run.mode, phase: run.card.phase, day: run.dayIndex };
  } catch(e){ return { fatal: String(e && e.message || e) }; } })()`);
  console.log('setup+start:', JSON.stringify(setup));
  await sleep(2500);
  const ui = await cdp.eval(`(function(){ try {
    return {
      overlayLen: (document.getElementById('UiOverlay') || { innerHTML: '' }).innerHTML.length,
      hasBattle2: !!document.querySelector('.ux-battle2'),
      hasCards: document.querySelectorAll('.ux-bc-card').length,
      navProject: !!document.querySelector('[data-nav="PROJECT"]'),
      activeNav: (document.querySelector('.ux-nav-item--active') || { textContent: '' }).textContent,
      wizard: !!document.querySelector('[data-creation-action]'),
      battleRunExists: !!window.__GAME_FACADE__.queryBattle(),
      cardView: !!window.__GAME_FACADE__.queryBattleCard(),
    };
  } catch(e){ return { fatal: String(e) }; } })()`);
  console.log('ui:', JSON.stringify(ui));
  const html = await cdp.eval(`(function(){ try { var el = document.getElementById('UiOverlay'); return el ? el.innerHTML.slice(0, 600) : 'NO OVERLAY'; } catch(e){ return String(e); } })()`);
  console.log('overlay html head:', html);
  // 尝试点击导航到项目页
  const nav = await cdp.eval(`(function(){ try {
    var nav = document.querySelector('[data-nav="PROJECT"]');
    if (nav) { nav.click(); return 'clicked'; }
    return 'not-found';
  } catch(e){ return String(e); } })()`);
  console.log('nav:', nav);
  await sleep(2500);
  const ui2 = await cdp.eval(`(function(){ try {
    return { hasBattle2: !!document.querySelector('.ux-battle2'), hasCards: document.querySelectorAll('.ux-bc-card').length,
      energy: document.querySelectorAll('.ux-bc-energy i').length };
  } catch(e){ return { fatal: String(e) }; } })()`);
  console.log('ui after nav:', JSON.stringify(ui2));
} finally {
  await closeExe(child);
}
process.exit(0);
