// ai/qa-final/session-v59o-soak-20min.mjs
// V5.9-O.2 20 分钟稳定性 soak（§50）：
//   隔离存档（XIUXIAN_USER_DATA）→ 启动 EXE → 角色创建 → 持续循环：
//   工作/摸鱼/进战斗/出牌/结束回合/领奖/回主页 —— 20 分钟墙钟。
//   记录：墙钟、操作数、未处理异常、Renderer 崩溃、内存（Performance.getMetrics）、
//   CDP 连接健康、游戏状态一致性、存档恢复。
//   物理输入：CDP 合成事件 → PHYSICAL_INPUT=NOT_VERIFIED（如实标注）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { QA, launchExe, Cdp, closeExe, sleep, exeSha, sha256, readSaveFile } from './cdp.mjs';

const EV = QA.evidenceDir;
fs.mkdirSync(EV, { recursive: true });
fs.mkdirSync(QA.shotsDir, { recursive: true });
const log = (...a) => console.log('[v59o-soak]', ...a);

const DURATION_MS = 20 * 60 * 1000;
const evidence = { actions: 0, consoleErrors: 0, pageErrors: 0, crashed: false, samples: [], restartChecks: {} };

QA.isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'v59o-soak-userdata-'));
const realSaveDir = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'xiuxian-desktop', 'xiuxian-save');
function dirFingerprint(dir) {
  if (!fs.existsSync(dir)) return 'ABSENT';
  return crypto.createHash('sha256').update(fs.readdirSync(dir).sort().map((f) => {
    const full = path.join(dir, f);
    return f + ':' + (fs.statSync(full).isFile() ? sha256(full) : 'dir');
  }).join('|')).digest('hex');
}
const realBefore = dirFingerprint(realSaveDir);

const isoSave = path.join(QA.isolatedUserData, 'xiuxian-save');
fs.mkdirSync(isoSave, { recursive: true });
for (const f of ['save.json', 'save.backup.json', 'save.tmp.json']) {
  try { fs.rmSync(path.join(isoSave, f), { force: true }); } catch {}
}

async function ensureCharacter(cdp) {
  for (let i = 0; i < 30; i++) {
    const ready = await cdp.eval(`(function(){ try { return !!(window.__GAME_FACADE__ && window.__GAME_FACADE__.context); } catch(e){ return false; } })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(2500);
  await cdp.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    if (f.context.player.characterSetupStatus !== 'COMPLETE') {
      f.characterCreationSelectIndustry('INTERNET');
      f.characterCreationSelectDirection('TECH');
      f.characterCreationSelectProfession('JAVA_BACKEND');
      f.characterCreationSetIdentity('Soak侠', 'AVATAR_A');
      f.characterCreationSetBackground('BG_FRESH');
      var cands = f.characterCreationCandidates ? f.characterCreationCandidates() : null;
      if (cands && cands[0]) f.characterCreationSelectCandidate(cands[0].id);
      f.characterCreationFinalize();
    }
    return true;
  } catch(e){ return String(e); } })()`);
}

/** 一次行动（DOM 优先，页面不在战斗则做经营动作）。 */
const ACTION = `(function(){ try {
  var f = window.__GAME_FACADE__;
  var finished = f.queryFinishedBattle();
  if (finished) { f.clearFinishedBattle(); return 'cleared'; }
  var run = f.queryBattle();
  if (run && run.skillOffers) { f.chooseBattleSkill(run.skillOffers[0]); return 'skill'; }
  var c = f.queryBattleCard();
  if (c) {
    if (c.reward) { f.claimBattleCardReward(c.reward.candidates[0] || null); return 'reward'; }
    if (c.phase !== 'PLAYER_TURN') return 'wait';
    var usable = document.querySelectorAll('.ux-bc-card.is-usable');
    var picked = null;
    for (var k = 0; k < usable.length; k++) { if (usable[k].className.indexOf('is-attack') >= 0) { picked = usable[k]; break; } }
    if (!picked) picked = usable[0];
    if (picked) {
      picked.click();
      if (window.__BATTLE_CARD__.isSelecting()) {
        var en = document.querySelector('.ux-bt-enemy[data-enemy-uid]');
        if (en) en.click();
      }
      return 'play';
    }
    var btn = document.querySelector('[data-action="battleEndTurn"]');
    if (btn) { btn.click(); return 'endturn'; }
    return 'wait';
  }
  // 非战斗：随机经营（工作/摸鱼/切换 + 偶尔开战斗）
  var roll = Math.random();
  if (roll < 0.12 && f.battle && f.battle.canStart()) {
    var opts = f.queryBattleBuildOptions();
    f.startBattleRun('PROJECT', opts[0].id);
    return 'battle';
  }
  if (roll < 0.45) { f.changeWorkMode('WORK'); return 'work'; }
  if (roll < 0.7) { f.changeWorkMode('FISHING'); return 'fish'; }
  return 'idle';
} catch(e){ return 'ERR:' + String(e).slice(0, 100); } })()`;

async function metrics(cdp) {
  try {
    const m = await cdp.send('Performance.getMetrics');
    const pick = {};
    for (const { name, value } of m.metrics) {
      if (['JSHeapUsedSize', 'Documents', 'Nodes', 'JSEventListeners'].includes(name)) pick[name] = value;
    }
    return pick;
  } catch { return null; }
}

async function main() {
  const artifact = exeSha();
  log('EXE', artifact.exeSha.slice(0, 16));
  const started = Date.now();
  const deadline = started + DURATION_MS;

  const { child, cdp } = await launchExe({ logFile: path.join(EV, 'v59o-soak-boot.log') });
  let cdpAlive = true;
  cdp.ws.onclose = () => { cdpAlive = false; };
  cdp._onmsgOriginal = null;
  // console 错误统计
  const origOnmsg = cdp.ws.onmessage;
  cdp.ws.onmessage = (t) => {
    try {
      const msg = JSON.parse(t);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') evidence.consoleErrors += 1;
      if (msg.method === 'Runtime.exceptionThrown') evidence.pageErrors += 1;
    } catch { /* ignore */ }
    origOnmsg(t);
  };

  try {
    await ensureCharacter(cdp);
    let lastSample = Date.now();
    let lastActionLog = '';
    while (Date.now() < deadline) {
      if (!cdpAlive) { evidence.crashed = true; log('CDP closed — renderer crash suspected'); break; }
      try {
        const r = await cdp.eval(ACTION);
        evidence.actions += 1;
        if (typeof r === 'string' && r.startsWith('ERR:') && r !== lastActionLog) {
          log('action error:', r);
          lastActionLog = r;
          evidence.pageErrors += 1;
        }
      } catch (e) {
        evidence.pageErrors += 1;
        log('eval failed:', String(e).slice(0, 120));
        await sleep(2000);
      }
      if (Date.now() - lastSample > 60_000) {
        lastSample = Date.now();
        const m = await metrics(cdp);
        const state = await cdp.eval(`(function(){ try { var f=window.__GAME_FACADE__; var c=f.queryBattleCard(); return { day: f.context.player.gameDay ? f.context.player.gameDay.dayIndex : 0, level: f.context.player.careerLevel, battle: c ? c.phase : null, stones: f.context.player.spiritStones }; } catch(e){ return { err: String(e).slice(0,80) }; } })()`);
        evidence.samples.push({ t: Math.round((Date.now() - started) / 1000), mem: m, state });
        log('sample', Math.round((Date.now() - started) / 1000) + 's', JSON.stringify(m), JSON.stringify(state));
      }
      await sleep(500);
    }
    // 结束前保存 + 一致性快照
    await cdp.eval(`(function(){ try { window.__GAME_FACADE__.context.saveService.save(window.__GAME_FACADE__.context.player); return true; } catch(e){ return false; } })()`);
    await sleep(1000);
    const pre = await cdp.eval(`(function(){ try { var f=window.__GAME_FACADE__; return JSON.stringify({ day: f.context.player.gameDay ? f.context.player.gameDay.dayIndex : 0, level: f.context.player.careerLevel, stones: f.context.player.spiritStones, collection: f.context.player.cardCollection || {} }); } catch(e){ return '{}'; } })()`);
    evidence.restartChecks.pre = JSON.parse(pre || '{}');
    const saveBefore = readSaveFile();
    evidence.restartChecks.saveBytes = saveBefore ? saveBefore.bytes.length : 0;
    const closeResult = await closeExe(child);
    evidence.restartChecks.gracefulClose = !!closeResult.graceful;

    // 重启恢复校验
    const boot2 = await launchExe({ logFile: path.join(EV, 'v59o-soak-reboot.log') });
    const cdp2 = await Cdp.connect();
    try {
      await ensureCharacter(cdp2);
      const post = await cdp2.eval(`(function(){ try { var f=window.__GAME_FACADE__; return JSON.stringify({ day: f.context.player.gameDay ? f.context.player.gameDay.dayIndex : 0, level: f.context.player.careerLevel, stones: f.context.player.spiritStones, collection: f.context.player.cardCollection || {} }); } catch(e){ return '{}'; } })()`);
      evidence.restartChecks.post = JSON.parse(post || '{}');
      evidence.restartChecks.consistent =
        evidence.restartChecks.pre.day === evidence.restartChecks.post.day
        && evidence.restartChecks.pre.level === evidence.restartChecks.post.level
        && evidence.restartChecks.pre.stones === evidence.restartChecks.post.stones;
      log('restart consistent:', evidence.restartChecks.consistent);
    } finally {
      await closeExe(boot2.child);
    }
  } catch (e) {
    evidence.crashed = true;
    evidence.fatal = String(e && e.stack || e);
    log('FATAL:', String(e && e.message || e));
    try { await closeExe(child); } catch {}
  }

  const realAfter = dirFingerprint(realSaveDir);
  evidence.wallClockSeconds = Math.round((Date.now() - started) / 1000);
  evidence.realSaveUntouched = realAfter === realBefore;
  evidence.physicalInput = 'NOT_VERIFIED'; // CDP 合成事件，物理输入未验证（如实标注）
  fs.writeFileSync(path.join(EV, 'v59o-soak-report.json'), JSON.stringify(evidence, null, 2));
  console.log('=== V59O SOAK SUMMARY ===');
  console.log('wallClock:', evidence.wallClockSeconds, 's  actions:', evidence.actions);
  console.log('consoleErrors:', evidence.consoleErrors, 'pageErrors:', evidence.pageErrors, 'crashed:', evidence.crashed);
  console.log('restartConsistent:', evidence.restartChecks.consistent, 'gracefulClose:', evidence.restartChecks.gracefulClose);
  console.log('realSaveUntouched:', evidence.realSaveUntouched, 'physicalInput:', evidence.physicalInput);
  const failed = !evidence.restartChecks.consistent || evidence.crashed || !evidence.realSaveUntouched || evidence.pageErrors > 20;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
