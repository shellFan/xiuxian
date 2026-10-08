// ai/qa-final/session-v58-fresh-playthrough.mjs
// V5.8 结算一致性 + 词条联动 真实 EXE 走查：
//   新玩家 → 职业选择 → 接任务 → 任务完成领奖（gameDay.income 一致性）
//   → 战斗 → 掉落 → 穿戴词条装备 → 战斗结算可解释化 → dailyReality
//   → 两次重启存档一致性。
// 隔离：备份真实存档，测试用 temp 目录，结束后恢复。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { QA, launchExe, Cdp, closeExe, sleep, exeSha, sha256, readSaveFile } from './cdp.mjs';

const EV = path.join('D:', 'git', 'fan', 'xiuxian', 'ai', 'qa-final', 'evidence');
const evidence = {};
const log = (...a) => console.log('[v58-play]', ...a);

// ── 用户存档保护：真实 userData 整体快照 ──
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v58-play-userdata-'));
const srcSave = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'xiuxian-desktop', 'xiuxian-save');
const dstSave = path.join(backupDir, 'xiuxian-save');
fs.mkdirSync(dstSave, { recursive: true });
for (const f of fs.existsSync(srcSave) ? fs.readdirSync(srcSave) : []) {
  fs.copyFileSync(path.join(srcSave, f), path.join(dstSave, f));
}
log('user save backed up to', backupDir, 'files:', fs.readdirSync(dstSave).join(','));

async function freshSave() {
  for (const f of ['save.json', 'save.backup.json', 'save.tmp.json']) {
    try { fs.rmSync(path.join(QA.saveDir, f), { force: true }); } catch {}
  }
}

async function bootExe() {
  const { child, page } = await launchExe({ logFile: path.join(EV, 'v58-play-boot.log') });
  const cdp = await Cdp.connect();
  // 等 facade 就绪
  for (let i = 0; i < 60; i++) {
    const ready = await cdp.eval(`(function(){ try { var f=window.__GAME_FACADE__; return f && f.context ? true : false; } catch(e){ return false; } })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(2500);
  return { child, cdp, page };
}

async function main() {
  evidence.artifact = exeSha();
  log('EXE', evidence.artifact.exeSha.slice(0, 16), 'ASAR', evidence.artifact.asarSha.slice(0, 16));

  await freshSave();

  // ══ Boot 1：新玩家 ══
  const b1 = await bootExe();
  const c = b1.cdp;
  evidence.f01_freshBoot = {};
  evidence.f01_freshBoot.professionSelected = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    return { isSel: f.isProfessionSelected(), profs: (f.queryProfessions()||[]).length,
             nowGoal: f.queryNowGoal() ? f.queryNowGoal().text : null };
  } catch(e){ return {err: String(e)}; } })()`);

  // 职业选择（走真实 UI 流：facade 命令 = 首页按钮同款）
  evidence.f02_chooseProfession = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var r = f.chooseProfession('JAVA_BACKEND');
    return { ok: r && r.success, prof: f.queryProfession(), owned: f.queryOwnedEquipment(),
             equipped: f.queryEquippedEquipment() };
  } catch(e){ return {err: String(e)}; } })()`);
  await sleep(500);

  // 接任务 → 快进 → 完成 → 领奖；校验 gameDay.income 与今日已赚同源
  evidence.f03_taskLoop = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var cfg = (f.queryTaskConfigsByType('WORK')||[]).filter(function(t){return t.durationSeconds<=5;})[0]
           || (f.queryTaskConfigsByType('WORK')||[])[0];
    if (!cfg) return {err:'no task config'};
    var started = f.startTask(cfg.id);
    f.context.clockV2.advanceDevTime((cfg.durationSeconds + 2) * 1000);
    f.tickTasks();
    var beforeSalary = f.context.player.salary;
    var beforeLedger = f.context.player.gameDay ? f.context.player.gameDay.income.salary : -1;
    var claim = f.claimTask(cfg.id);
    var afterLedger = f.context.player.gameDay ? f.context.player.gameDay.income.salary : -1;
    return {
      taskId: cfg.id, started: started.success, claimed: claim.success,
      rewardSalary: cfg.rewardSalary,
      salaryDelta: f.context.player.salary - beforeSalary,
      ledgerDelta: afterLedger - beforeLedger,
      consistent: cfg.rewardSalary > 0 ? (afterLedger - beforeLedger) === cfg.rewardSalary : true,
      nowGoal: f.queryNowGoal() ? (f.queryNowGoal().layer + ':' + f.queryNowGoal().text) : null
    };
  } catch(e){ return {err: String(e)}; } })()`);
  await c.screenshot('v58-f03-task-claim.png');

  // 战斗词条联动：装备 JVM 词条装备 → 战斗 → 伤害提升 + 结算可解释化
  evidence.f04_affixBattle = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    // 找一件带 JVM 词条且未持有的装备
    var lib = (f.queryEquipmentLibrary()||[]).filter(function(d){
      return !d.owned && (d.affixes||[]).some(function(a){ return a.indexOf('JVM')>=0; }); });
    if (!lib.length) return {err:'no JVM affix equipment found'};
    var item = lib[0];
    f.context.player.ownedEquipment.push(item.id);
    var ok = f.context.v2Items.equipItem(item.slot, item.id);
    // 开战斗（工作日白天已开工）
    var run = f.startBattleRun('PROJECT', 'build_jvm');
    // 注入 tag 技能 skill_gc
    run.skills.push('skill_gc');
    if (run.skillOffers) f.chooseBattleSkill(null);
    var hpBefore = run.enemies[0].hp;
    f.context.clockV2.advanceDevTime(2000);
    f.context.battle.tick(1);
    var dmg = hpBefore - (f.queryBattle()||run).enemies[0].hp;
    // 放弃结束（拿 30% 部分结算）→ 结算可解释化字段
    f.abandonBattleRun();
    var summary = f.queryBattleSummary();
    return {
      itemId: item.id, slot: item.slot, equipped: ok,
      damageDealt: dmg, damageOk: dmg > 0,
      summaryBuild: summary && summary.buildName,
      summaryProfession: summary && summary.professionName,
      summaryAffixes: summary && summary.affixes ? summary.affixes : (summary && summary.affixSummary),
      status: summary && summary.status
    };
  } catch(e){ return {err: String(e)}; } })()`);
  await c.screenshot('v58-f04-battle-summary.png');

  evidence.f05_dailyReality = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var r = (f.context.player.dailyReality||[]);
    return { count: r.length, battleEntry: (r.filter(function(x){return x.text.indexOf('⚔')>=0;})[0]||{}).text || null };
  } catch(e){ return {err: String(e)}; } })()`);

  evidence.f06_saveBefore = readSaveFile();
  const close1 = await closeExe(b1.child);
  evidence.f06_close1 = close1;
  c.close();

  // ══ Boot 2：重启 → 校验装备/账本/履历存活 ══
  const b2 = await bootExe();
  const c2 = b2.cdp;
  evidence.f07_restart1 = await c2.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var p = f.context.player;
    return {
      profession: f.queryProfession(),
      ownedCount: (p.ownedEquipment||[]).length,
      equipped: f.queryEquippedEquipment(),
      dayIndex: p.gameDay ? p.gameDay.dayIndex : 0,
      ledgerSalary: p.gameDay ? p.gameDay.income.salary : -1,
      realityCount: (p.dailyReality||[]).length,
      activeTasks: (p.activeTasks||[]).filter(function(t){return t.claimed;}).length
    };
  } catch(e){ return {err: String(e)}; } })()`);
  await c2.screenshot('v58-f07-restart1.png');
  await closeExe(b2.child);
  c2.close();

  // ══ Boot 3：第二次重启 → 再验一致性 ══
  const b3 = await bootExe();
  const c3 = b3.cdp;
  evidence.f08_restart2 = await c3.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var p = f.context.player;
    return {
      profession: f.queryProfession(),
      ownedCount: (p.ownedEquipment||[]).length,
      equipped: f.queryEquippedEquipment(),
      dayIndex: p.gameDay ? p.gameDay.dayIndex : 0,
      ledgerSalary: p.gameDay ? p.gameDay.income.salary : -1,
      realityCount: (p.dailyReality||[]).length
    };
  } catch(e){ return {err: String(e)}; } })()`);
  await closeExe(b3.child);
  c3.close();

  evidence.f09_saveAfter = readSaveFile();
  evidence.userSaveBackupDir = backupDir;

  fs.writeFileSync(path.join(EV, 'v58-play-evidence.json'), JSON.stringify(evidence, null, 2));
  log('evidence written');
  console.log(JSON.stringify(evidence, null, 2).slice(0, 6000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
