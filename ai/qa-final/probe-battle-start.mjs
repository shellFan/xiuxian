// 探针：EXE 内战斗开局为何 0 敌人（dump 各内容表长度）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QA, launchExe, Cdp, closeExe, sleep } from './cdp.mjs';

QA.isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'v59o-probe2-'));

const boot = await launchExe({ logFile: path.join(QA.evidenceDir, 'probe2-boot.log') });
const { child } = boot;
const cdp = await Cdp.connect();
try {
  for (let i = 0; i < 30; i++) {
    if (await cdp.eval('!!(window.__GAME_FACADE__ && window.__GAME_FACADE__.context)')) break;
    await sleep(1000);
  }
  await sleep(2000);
  const dump = await cdp.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var out = {};
    try { out.content = f.queryContentStats(); } catch(e) { out.content = 'ERR:' + e.message; }
    try { out.dbDebug = f.queryDatabaseDebug(); } catch(e) { out.dbDebug = 'ERR:' + e.message; }
    out.skills = f.queryBattleSkillDefs ? f.queryBattleSkillDefs().length : -1;
    out.builds = f.queryBattleBuildOptions().map(function(b){ return b.id; });
    try { out.catalog = f.queryCardCatalog().length; } catch(e) { out.catalog = 'ERR:' + e.message; }
    out.profession = f.context.profession ? f.context.profession.currentId() : null;
    try { out.profPool = f.context.professionContent ? f.context.professionContent.monsterPool().length : 'no-svc'; } catch(e) { out.profPool = 'ERR:' + e.message; }
    out.gameDay = f.context.gameDay.ensureStarted() ? 'started' : 'noop';
    out.dayIndex = f.context.player.gameDay ? f.context.player.gameDay.dayIndex : null;
    try {
      var run = f.startBattleRun('PROJECT', f.queryBattleBuildOptions()[0].id);
      out.startOk = true; out.mode = run.mode; out.enemies = run.enemies.length; out.wave = run.wave;
    } catch (e) { out.startOk = false; out.startErr = String(e && e.message || e); }
    return out;
  } catch(e){ return { fatal: String(e && e.message || e) }; } })()`);
  console.log(JSON.stringify(dump, null, 2));
} finally {
  await closeExe(child);
}
process.exit(0);
