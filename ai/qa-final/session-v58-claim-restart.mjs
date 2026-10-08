// ai/qa-final/session-v58-claim-restart.mjs
// V5.8 P0 聚焦复验：任务领奖 → gameDay.income 一致性 → 两次重启后账本/装备一致。
// fixture 操作仅回拨 startedAt（模拟真实流逝），领奖/入账/保存全部走真实代码路径。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QA, launchExe, Cdp, closeExe, sleep, exeSha, readSaveFile } from './cdp.mjs';

const EV = path.join('D:', 'git', 'fan', 'xiuxian', 'ai', 'qa-final', 'evidence');
const evidence = {};
const log = (...a) => console.log('[v58-claim]', ...a);

async function bootExe() {
  const { child } = await launchExe({ logFile: path.join(EV, 'v58-claim-boot.log') });
  const cdp = await Cdp.connect();
  for (let i = 0; i < 60; i++) {
    const ready = await cdp.eval(`(function(){ try { var f=window.__GAME_FACADE__; return f && f.context ? true : false; } catch(e){ return false; } })()`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(2500);
  return { child, cdp };
}

async function main() {
  evidence.artifact = exeSha();

  const b1 = await bootExe();
  const c = b1.cdp;
  // 复用上一会话已存在的存档（ profession=JAVA_BACKEND, 装备 eq_jvm_tome 已穿戴 ）
  evidence.s1_state = await c.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var p = f.context.player;
    if (!p.profession) return { err: 'no profession — rerun fresh playthrough first' };
    // 接 QUICK 日常任务（daily_checkin 5 游戏分钟 = 真实 5 分钟；fixture 回拨模拟流逝）
    var started = f.startTask('daily_checkin');
    if (!started.success) return { err: 'start failed: ' + (started.reason || '?') };
    var task = p.activeTasks.find(function(t){ return t.taskId === 'daily_checkin' && !t.claimed; });
    if (!task) return { err: 'task not found' };
    task.startedAt -= (task.durationSeconds + 5) * 1000; // fixture: 模拟任务时长流逝
    f.tickTasks();
    var salaryBefore = p.salary;
    var ledgerBefore = p.gameDay ? p.gameDay.income.salary : -1;
    var claim = f.claimTask('daily_checkin');
    var salaryAfter = p.salary;
    var ledgerAfter = p.gameDay ? p.gameDay.income.salary : -1;
    return {
      started: true, claimed: claim.success, reason: claim.reason || null,
      rewardSalary: task.rewardSalary,
      salaryDelta: salaryAfter - salaryBefore,
      ledgerDelta: ledgerAfter - ledgerBefore,
      consistent: (salaryAfter - salaryBefore) === (ledgerAfter - ledgerBefore) && (ledgerAfter - ledgerBefore) === task.rewardSalary,
      ledgerTotal: ledgerAfter
    };
  } catch(e){ return { err: String(e) }; } })()`);
  log('s1', JSON.stringify(evidence.s1_state));
  await c.screenshot('v58-c1-claim.png');
  evidence.saveBeforeRestart = readSaveFile().sha;
  const cl1 = await closeExe(b1.child);
  evidence.close1 = cl1;
  c.close();

  // 重启 1
  const b2 = await bootExe();
  const c2 = b2.cdp;
  evidence.s2_restart1 = await c2.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var p = f.context.player;
    return {
      profession: f.queryProfession(),
      ledgerSalary: p.gameDay ? p.gameDay.income.salary : -1,
      salary: p.salary,
      claimedTasks: (p.activeTasks||[]).filter(function(t){return t.claimed;}).map(function(t){return t.taskId;}),
      owned: p.ownedEquipment,
      equipped: p.equippedEquipment,
      reality: (p.dailyReality||[]).map(function(r){return r.text;})
    };
  } catch(e){ return { err: String(e) }; } })()`);
  log('s2', JSON.stringify(evidence.s2_restart1));
  await closeExe(b2.child);
  c2.close();

  // 重启 2
  const b3 = await bootExe();
  const c3 = b3.cdp;
  evidence.s3_restart2 = await c3.eval(`(function(){ try {
    var f = window.__GAME_FACADE__;
    var p = f.context.player;
    return {
      profession: f.queryProfession(),
      ledgerSalary: p.gameDay ? p.gameDay.income.salary : -1,
      salary: p.salary,
      claimedTasks: (p.activeTasks||[]).filter(function(t){return t.claimed;}).map(function(t){return t.taskId;}),
      owned: p.ownedEquipment,
      equipped: p.equippedEquipment,
      reality: (p.dailyReality||[]).map(function(r){return r.text;})
    };
  } catch(e){ return { err: String(e) }; } })()`);
  log('s3', JSON.stringify(evidence.s3_restart2));
  await c3.screenshot('v58-c3-restart2.png');
  const cl3 = await closeExe(b3.child);
  evidence.close3 = cl3;
  c3.close();

  evidence.saveAfterRestart2 = readSaveFile().sha;
  // 一致性断言
  evidence.verdict = {
    claimConsistent: evidence.s1_state.consistent === true,
    restart1EqualsRestart2: JSON.stringify(evidence.s2_restart1) === JSON.stringify(evidence.s3_restart2),
    ledgerSurvivedRestart: evidence.s2_restart1.ledgerSalary === evidence.s1_state.ledgerTotal,
    closesGraceful: cl1.graceful && cl3.graceful,
  };

  fs.writeFileSync(path.join(EV, 'v58-claim-evidence.json'), JSON.stringify(evidence, null, 2));
  log('verdict', JSON.stringify(evidence.verdict));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
