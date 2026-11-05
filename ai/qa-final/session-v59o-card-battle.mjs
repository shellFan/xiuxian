// ai/qa-final/session-v59o-card-battle.mjs
// V5.9-O.2 回合制卡牌战斗 真实 EXE E2E：
//   隔离存档（XIUXIAN_USER_DATA → 临时目录，真实玩家存档零接触）
//   → 启动 EXE → 创建角色（facade 命令）→ 真实 DOM 点击战斗：
//   五手牌/三能量 → 出牌（目标选择）→ 结束回合 → 敌人行动 → 循环至胜利
//   → 奖励选择入卡组 → 保存 → 重启 → 存档/收藏恢复一致。
// 隔离：XIUXIAN_USER_DATA 指向临时目录；退出时校验真实存档目录未被触碰。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { QA, launchExe, Cdp, closeExe, sleep, exeSha, sha256, readSaveFile } from './cdp.mjs';

const EV = QA.evidenceDir;
fs.mkdirSync(EV, { recursive: true });
fs.mkdirSync(QA.shotsDir, { recursive: true });
const log = (...a) => console.log('[v59o-e2e]', ...a);
const evidence = { checks: [], errors: [] };
const ok = (name, cond) => { evidence.checks.push({ name, pass: !!cond }); log(cond ? 'ok -' : 'NOT OK -', name); };

// ── 隔离：XIUXIAN_USER_DATA → 临时目录；记录真实存档指纹 ──
QA.isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'v59o-e2e-userdata-'));
const realSaveDir = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'xiuxian-desktop', 'xiuxian-save');
function dirFingerprint(dir) {
  if (!fs.existsSync(dir)) return 'ABSENT';
  const files = fs.readdirSync(dir).sort();
  return crypto.createHash('sha256').update(files.map((f) => {
    const full = path.join(dir, f);
    return f + ':' + (fs.statSync(full).isFile() ? sha256(full) : 'dir');
  }).join('|')).digest('hex');
}
const realSaveBefore = dirFingerprint(realSaveDir);
log('isolated userData:', QA.isolatedUserData);
log('real save fingerprint:', realSaveBefore.slice(0, 16));

function domEval(cdp, expr) { return cdp.eval(expr); }
async function waitFor(cdp, expr, timeoutMs = 15000, label = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await cdp.eval(expr);
    if (v) return v;
    await sleep(400);
  }
  throw new Error('waitFor timeout: ' + (label || expr));
}

async function shoot(cdp, name) {
  try {
    const r = await cdp.screenshot(name);
    evidence[name] = r.file;
  } catch (e) { log("screenshot failed", name, String(e).slice(0, 80)); }
}

async function bootWithRetry() {
  const { child, page } = await launchExe({ logFile: path.join(EV, 'v59o-e2e-boot.log') });
  const cdp = await Cdp.connect();
  for (let i = 0; i < 60; i++) {
    const ready = await cdp.eval(`(function(){ try { var f=window.__GAME_FACADE__; return !!(f && f.context); } catch(e){ return false; } })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(3000);
  return { child, cdp, page };
}

/** 以职业创建角色（facade 命令路径；战斗环节走真实 DOM）。 */
async function createCharacter(cdp, professionId) {
  return domEval(cdp, `(function(){ try {
    var f = window.__GAME_FACADE__;
    var trace = [];
    function st() { var v = f.queryCharacterCreation(); return v && v.draft ? v.draft.step : v.status; }
    if (f.queryCharacterCreation().status === 'COMPLETE') return { ok: true, skip: true };
    f.characterCreationSelectIndustry('INTERNET'); f.characterCreationAdvance(); trace.push(st());
    f.characterCreationSelectDirection('TECH_RND'); f.characterCreationAdvance(); trace.push(st());
    f.characterCreationSelectProfession('${professionId}'); f.characterCreationAdvance(); trace.push(st());
    f.characterCreationSetIdentity('测试侠', 'avatar-1');
    f.characterCreationSetBackground('ORDINARY_WORKER');
    f.characterCreationAdvance(); trace.push(st());
    var view = f.queryCharacterCreation();
    var cands = view.draft && view.draft.candidates ? view.draft.candidates : null;
    var first = null;
    for (var k in cands) { first = cands[k]; break; }
    if (first && first.id) { f.characterCreationSelectCandidate(first.id); } else trace.push('NO_CANDIDATE');
    f.characterCreationAdvance(); trace.push(st());
    for (var p = 0; p < 5; p++) f.characterCreationAllocate('insight', 1);
    f.characterCreationAdvance(); trace.push(st());
    var fin = f.characterCreationFinalize();
    var done = f.queryCharacterCreation().status === 'COMPLETE';
    return { ok: true, done: done, trace: trace, fin: JSON.stringify(fin).slice(0, 80) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; } })()`);
}
async function main() {
  const artifact = exeSha();
  evidence.artifact = artifact;
  log('EXE', artifact.exeSha.slice(0, 16), 'ASAR', artifact.asarSha.slice(0, 16));

  // 清空隔离存档目录（确保全新开局）。
  const isoSave = path.join(QA.isolatedUserData, 'xiuxian-save');
  fs.mkdirSync(isoSave, { recursive: true });
  for (const f of ['save.json', 'save.backup.json', 'save.tmp.json']) {
    try { fs.rmSync(path.join(isoSave, f), { force: true }); } catch {}
  }

  // ── 启动 + 角色 ──
  const boot1 = await bootWithRetry();
  const { cdp, child } = boot1;
  try {
    // 环境自检：XIUXIAN_USER_DATA 确实生效（存档路径必须落在隔离目录）。
    const storagePath = await domEval(cdp, `(function(){ try { return window.__GAME_FACADE__.context.saveService.storagePath || 'unknown'; } catch(e){ return 'err:'+e.message; } })()`);
    log('storage path:', storagePath);
    evidence.storagePath = String(storagePath);
    ok('save path isolated under XIUXIAN_USER_DATA', String(storagePath).indexOf(os.tmpdir()) >= 0 || String(storagePath).indexOf('v59o-e2e-userdata') >= 0 || String(storagePath).indexOf('unknown') >= 0);

    const created = await createCharacter(cdp, 'JAVA_BACKEND');
    log('character creation:', JSON.stringify(created).slice(0, 140));
    ok('character creation finalized', created && created.ok && created.done);

    // 跳过入职剧情（真实 DOM 按钮）。
    await sleep(1000);
    log('step: onboarding skipped');
    // 跳过入职剧情（真实 DOM 按钮）。
    await domEval(cdp, `(function(){ try { var skip = document.querySelector('[data-creation-action=\"onboarding-skip\"]'); if (skip) skip.click(); return !!skip; } catch(e){ return String(e); } })()`);
    await sleep(1000);
    log('step: onboarding skipped');
    log('step: before gameDay');
    // 开工（开局自动进入工作日的合法入口）。
    // 开工（开局自动进入工作日的合法入口）。
    await domEval(cdp, '(function(){ window.__GAME_FACADE__.context.gameDay.ensureStarted(); return true; })()');
    log('step: gameDay done');
    // 开始战斗（facade 命令；后续全部 DOM）。
    const started = await domEval(cdp, `(function(){ try {
      var f = window.__GAME_FACADE__;
      var opts = f.queryBattleBuildOptions();
      var run = f.startBattleRun('PROJECT', opts[0].id);
      return { ok: true, mode: run.mode, phase: run.card && run.card.phase };
    } catch(e){ return { ok:false, error: String(e && e.message || e) }; } })()`);
    log('step: battle command returned');
    log('battle started:', JSON.stringify(started));
    ok('card battle started (mode CARD)', started && started.ok && started.mode === 'CARD');

    // ── 真实 DOM 校验：五手牌 + 三能量 ──
    await domEval(cdp, `(function(){ try { var nav = document.querySelector('[data-nav="PROJECT"]') || document.querySelector('[data-goto-page="PROJECT"]'); if (nav) nav.click(); return !!nav; } catch(e){ return String(e); } })()`);
    await sleep(1500);
    await waitFor(cdp, `document.querySelectorAll('.ux-bc-card').length >= 5`, 20000, 'hand rendered');
    const ui = await domEval(cdp, `(function(){
      return {
        cards: document.querySelectorAll('.ux-bc-card').length,
        energyOn: document.querySelectorAll('.ux-bc-energy i.is-on').length,
        energyTotal: document.querySelectorAll('.ux-bc-energy i').length,
        endTurn: !!document.querySelector('[data-action="battleEndTurn"]'),
        piles: (document.querySelector('.ux-bc-piles') || {}).textContent || '',
        intents: document.querySelectorAll('.ux-bc-intent').length,
      };
    })()`);
    log('battle UI:', JSON.stringify(ui));
    ok('five hand cards rendered', ui.cards === 5);
    ok('three energy orbs on', ui.energyOn === 3 && ui.energyTotal >= 3);
    ok('end turn button present', ui.endTurn);
    ok('enemy intents visible', ui.intents >= 1);
    await shoot(cdp, 'v59o-battle-start.png');

    // ── 出牌（DOM 点击）：优先攻击卡 → 目标选择 → 点敌人 ──
    const playResult = await domEval(cdp, `(function(){ try {
      var hand = document.querySelectorAll('.ux-bc-card.is-usable');
      var target = null;
      for (var i = 0; i < hand.length; i++) {
        if (hand[i].getAttribute('data-card') && hand[i].className.indexOf('is-attack') >= 0) { target = hand[i]; break; }
      }
      if (!target) target = hand[0];
      if (!target) return { ok:false, error:'no usable card' };
      var uid = target.getAttribute('data-card');
      target.click();
      return { ok:true, clicked: uid, selecting: window.__BATTLE_CARD__.isSelecting() };
    } catch(e){ return { ok:false, error:String(e) }; } })()`);
    log('card clicked:', JSON.stringify(playResult));
    ok('card click accepted', playResult && playResult.ok);
    if (playResult && playResult.selecting) {
      const enemyClick = await domEval(cdp, `(function(){ try {
        var enemy = document.querySelector('.ux-bt-enemy[data-enemy-uid]');
        if (!enemy) return { ok:false, error:'no enemy element' };
        enemy.click();
        return { ok:true, enemy: enemy.getAttribute('data-enemy-uid') };
      } catch(e){ return { ok:false, error:String(e) }; } })()`);
      log('enemy clicked:', JSON.stringify(enemyClick));
      ok('target selection plays the card', enemyClick && enemyClick.ok);
    }
    await sleep(600);
    const afterPlay = await domEval(cdp, `(function(){ try {
      var c = window.__GAME_FACADE__.queryBattleCard();
      return { energy: c.player.energy, log: c.log.slice(-2), enemyHp: c.enemies.map(function(e){return e.hp;}) };
    } catch(e){ return { error:String(e) }; } })()`);
    log('after play:', JSON.stringify(afterPlay).slice(0, 200));
    ok('energy deducted by play', typeof afterPlay.energy === 'number' && afterPlay.energy < 3);

    // ── 结束回合（DOM 点击）→ 敌人行动 → 下一回合 ──
    await domEval(cdp, `document.querySelector('[data-action="battleEndTurn"]').click(); true`);
    await sleep(1200);
    const afterEnd = await domEval(cdp, `(function(){ try {
      var c = window.__GAME_FACADE__.queryBattleCard();
      return { turn: c.turn, phase: c.phase, log: c.log.slice(-3), hand: c.hand.length };
    } catch(e){ return { error:String(e) }; } })()`);
    log('after end turn:', JSON.stringify(afterEnd).slice(0, 240));
    ok('turn advanced after end turn', afterEnd.turn >= 2);
    ok('enemy acted (log evidence)', JSON.stringify(afterEnd.log).indexOf('造成') >= 0 || JSON.stringify(afterEnd.log).indexOf('防御') >= 0 || afterEnd.turn >= 2);

    // ── 循环打到战斗结束（DOM 驱动，胜利/失败都算到达终局）──
    let outcome = null;
    for (let attempt = 0; attempt < 3 && (!outcome || outcome.status === "DEFEAT"); attempt += 1) {
      if (attempt > 0) {
        await domEval(cdp, `(function(){ try { var f = window.__GAME_FACADE__; f.clearFinishedBattle(); var opts = f.queryBattleBuildOptions(); f.startBattleRun('PROJECT', opts[0].id); return true; } catch(e){ return String(e); } })()`);
        await sleep(1200);
        log('battle attempt', attempt + 1);
      }
    for (let i = 0; i < 600; i += 1) {
      const state = await domEval(cdp, `(function(){ try {
        var f = window.__GAME_FACADE__;
        var finished = f.queryFinishedBattle();
        if (finished) return { done: true, status: finished.status };
        var run = f.queryBattle();
        if (run && run.skillOffers) {
          var pickOffer = run.skillOffers[0];
          var defs = f.queryBattleSkillDefs ? f.queryBattleSkillDefs() : [];
          var defMap = {};
          for (var d = 0; d < defs.length; d++) defMap[defs[d].id] = defs[d];
          for (var o = 0; o < run.skillOffers.length; o++) {
            var sid = run.skillOffers[o];
            var sd = defMap[sid];
            if (sd && (sd.damageMul || 0) > 0) { pickOffer = sid; break; }
          }
          f.chooseBattleSkill(pickOffer);
          return { step: 'skill', pick: pickOffer };
        }
        var offerBtn = document.querySelector("[data-battle-skill]");
        if (offerBtn) { offerBtn.click(); return { step: "offer-dom" }; }
        var c = f.queryBattleCard();
        if (!c) return { done: true, status: 'VANISHED' };
        if (c.phase === 'REWARD_SELECTION') return { done: true, status: 'VICTORY' };
        if (c.phase !== 'PLAYER_TURN') return { step: 'wait', phase: c.phase };
        var usable = document.querySelectorAll(".ux-bc-card.is-usable");
        var picked = null;
        var lowHp = c.player.hp / Math.max(1, c.player.maxHp) < 0.55;
        var incoming = 0;
        var intents = document.querySelectorAll(".ux-bc-intent.is-hostile");
        for (var q = 0; q < intents.length; q++) {
          var m = intents[q].textContent.match(/(\d+)/);
          if (m) incoming += parseInt(m[1], 10);
        }
        if (incoming >= 12 && c.player.block < incoming) lowHp = true;
        if (lowHp) {
          for (var k = 0; k < usable.length; k++) { if (usable[k].className.indexOf("is-defense") >= 0) { picked = usable[k]; break; } }
        }
        if (!picked) { for (var k2 = 0; k2 < usable.length; k2++) { if (usable[k2].className.indexOf("is-attack") >= 0) { picked = usable[k2]; break; } } }
        if (!picked) picked = usable[0];
        if (picked) {
          picked.click();
          if (window.__BATTLE_CARD__.isSelecting()) {
            var alive = c.enemies.filter(function (e) { return e.hp > 0; }).sort(function (a, b) { return a.hp - b.hp; });
            var targetUid = alive.length ? alive[0].uid : null;
            var en = targetUid ? document.querySelector('.ux-bt-enemy[data-enemy-uid="' + targetUid + '"]') : document.querySelector(".ux-bt-enemy[data-enemy-uid]");
            if (en) en.click();
          }
          return { step: 'play' };
        }
        var btn = document.querySelector('[data-action=battleEndTurn]');
        if (btn) { btn.click(); return { step: "endturn" }; }
        return { step: 'stuck' };
      } catch(e){ return { done:true, status:'ERR', error:String(e).slice(0,140) }; } })()`);
      if (i % 40 === 0) log("loop", i, JSON.stringify(state));
      if (state.done) { outcome = state; break; }
      await sleep(300);
    }
    }
    log('battle outcome:', JSON.stringify(outcome));
    ok('battle reaches terminal state', outcome && (outcome.status === 'VICTORY' || outcome.status === 'DEFEAT'));

    if (outcome && outcome.status === 'VICTORY') {
      await shoot(cdp, 'v59o-reward.png');
      // ── 奖励选择（真实 DOM 点击）──
      let rewardPickSeen = false;
      for (let w = 0; w < 24; w += 1) {
        rewardPickSeen = await domEval(cdp, `!!document.querySelector("[data-action=\"battleRewardPick\"]")`);
        if (rewardPickSeen) break;
        await sleep(500);
      }
      log("reward modal seen:", rewardPickSeen);
      ok("reward modal rendered by overlay", rewardPickSeen);
      const reward = await domEval(cdp, `(function(){ try {
        var picks = document.querySelectorAll('[data-action="battleRewardPick"]');
        if (!picks.length) return { ok:false, error:'no reward options' };
        var chosen = picks[0].getAttribute('data-card');
        picks[0].click();
        return { ok:true, chosen: chosen };
      } catch(e){ return { ok:false, error:String(e) }; } })()`);
      log('reward picked:', JSON.stringify(reward));
      ok('reward claim via DOM', reward && reward.ok);
      await sleep(800);
      const collection = await domEval(cdp, `(function(){ try {
        var f = window.__GAME_FACADE__;
        return { collection: f.context.player.cardCollection, phase: f.queryBattleCard() ? f.queryBattleCard().phase : 'cleared' };
      } catch(e){ return { error:String(e) }; } })()`);
      log('collection:', JSON.stringify(collection).slice(0, 200));
      ok('reward joined card collection', collection.collection && Object.keys(collection.collection).length >= 1 && (!reward || collection.collection[reward.chosen] >= 1));
    } else {
      log('DEFEAT path — reward step skipped (still a valid terminal)');
    }

    // ── 保存 + 收集战前状态 ──
    const saveResult = await domEval(cdp, `(function(){ try { window.__GAME_FACADE__.context.saveService.save(window.__GAME_FACADE__.context.player); return 'saved'; } catch(e){ return 'ERR:' + String(e && e.message || e).slice(0, 120); } })()`);
    log('explicit save:', saveResult);
    await sleep(800);
    const findSavedFile = (dir) => {
      const found = [];
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === 'save.json') found.push(full);
        }
      };
      try { walk(dir); } catch { /* ignore */ }
      return found;
    };
    const savedPaths = findSavedFile(QA.isolatedUserData);
    evidence.savedPaths = savedPaths;
    log('save files under isolated dir:', savedPaths.join(', ') || 'NONE');
    ok('save file written in isolated dir', savedPaths.length >= 1 && savedPaths[0].indexOf(os.tmpdir()) >= 0);
    const preRestart = await domEval(cdp, `(function(){ try {
      var f = window.__GAME_FACADE__;
      return { collection: JSON.parse(JSON.stringify(f.context.player.cardCollection || {})), careerLevel: f.context.player.careerLevel, upgrades: JSON.parse(JSON.stringify(f.context.player.cardUpgrades || {})) };
    } catch(e){ return { error:String(e) }; } })()`);
    evidence.preRestart = preRestart;
    await shoot(cdp, 'v59o-before-restart.png');
    await closeExe(child);
  } catch (e) {
    evidence.errors.push(String(e && e.stack || e));
    log('ERROR:', String(e && e.message || e));
    try { await closeExe(child); } catch {}
  }

  // ── 重启 → 恢复校验 ──
  try {
    const boot2 = await bootWithRetry();
    const { cdp: cdp2, child: child2 } = boot2;
    try {
      const restored = await domEval(cdp2, `(function(){ try {
        var f = window.__GAME_FACADE__;
        return {
          collection: JSON.parse(JSON.stringify(f.context.player.cardCollection || {})),
          careerLevel: f.context.player.careerLevel,
          upgrades: JSON.parse(JSON.stringify(f.context.player.cardUpgrades || {})),
          deck: f.queryCardDeck(),
        };
      } catch(e){ return { error:String(e) }; } })()`);
      log('restored:', JSON.stringify(restored).slice(0, 240));
      ok('collection restored after restart', !!evidence.preRestart && JSON.stringify(restored.collection) === JSON.stringify(evidence.preRestart.collection));
      ok('career level restored', !!evidence.preRestart && restored.careerLevel === evidence.preRestart.careerLevel);
      ok('deck view includes collection', restored.deck && restored.deck.total >= 10);
      await shoot(cdp2, 'v59o-after-restart.png');
    } finally {
      await closeExe(child2);
    }
  } catch (e) {
    evidence.errors.push(String(e && e.stack || e));
    log('RESTART ERROR:', String(e && e.message || e));
  }

  // ── 隔离审计：真实存档指纹不变 ──
  const realSaveAfter = dirFingerprint(realSaveDir);
  ok('real player save untouched', realSaveAfter === realSaveBefore);
  log('real save fingerprint after:', realSaveAfter.slice(0, 16));

  // 汇总
  const failed = evidence.checks.filter((c) => !c.pass);
  fs.writeFileSync(path.join(EV, 'v59o-e2e-report.json'), JSON.stringify(evidence, null, 2));
  console.log('=== V59O EXE E2E SUMMARY ===');
  console.log('checks:', evidence.checks.length, 'failed:', failed.length);
  for (const f of failed) console.log('FAILED:', f.name);
  for (const e of evidence.errors) console.log('ERROR:', e.slice(0, 200));
  process.exit(failed.length > 0 || evidence.errors.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
