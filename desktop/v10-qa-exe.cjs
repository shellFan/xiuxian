/**
 * V10.0 独立 QA：打包 EXE 验收（CDP attach 真实渲染进程）。
 * 用法: node desktop/v10-qa-exe.cjs <label>
 *   环境变量: V10QA_EXE (exe 路径), V10QA_EXE_PORT (CDP 端口), V10QA_EXE_SAVE (隔离存档目录)
 * 前置: EXE 由 tmp/v10qa-exe-run.ps1 以 --remote-debugging-port 启动。
 * 输出: ai/reports/v10-qa/evidence/qa-exe-<label>.json + 截图
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const LABEL = process.argv[2] || 'run';
const PORT = Number(process.env.V10QA_EXE_PORT || 9225);
const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
const SHOT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logf = (m) => { try { fs.appendFileSync(path.join(OUT, 'qa-exe-' + LABEL + '.log'), new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };
const result = { label: LABEL, startedAt: new Date().toISOString(), checks: {} };
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail };
  logf('[CHECK] ' + name + '=' + (pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(detail === undefined ? null : detail));
};

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /127\.0\.0\.1|index\.html/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) {}
    await sleep(1000);
  }
  throw new Error('DevTools endpoint never became available');
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
  });
}

(async () => {
  const page = await findPage();
  logf('attached: ' + page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m.result); }
  };
  const evalJs = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 200) };
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    try {
      const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOT, name + '.png'), Buffer.from(r.data, 'base64'));
      logf('[shot] ' + name);
    } catch (e) { logf('[shot-fail] ' + name); }
  };
  await send(ws, 'Page.enable', {});
  await send(ws, 'Runtime.enable', {});

  // 等 boot
  let facade = false;
  for (let i = 0; i < 40 && !facade; i++) { facade = await evalJs('!!window.__GAME_FACADE__'); if (!facade) await sleep(1500); }
  check('exe_facade_ready', facade === true, { url: page.url });

  // 隔离存档：清 localStorage（EXE 用文件存档，由 ps1 设 XIUXIAN_USER_DATA 指向隔离目录）
  await evalJs('try{localStorage.clear();}catch(e){} "ok"');
  await send(ws, 'Page.reload', {});
  await sleep(9000);
  for (let i = 0; i < 12; i++) { await evalJs(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`); await sleep(500); }

  // 创建角色
  let home = false;
  for (let i = 0; i < 90 && !home; i++) {
    const st = await evalJs(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux91-hero') || document.querySelector('.ux65-stage')) return {action:'home'};
      function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
      function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }
      var wiz = !!document.querySelector('.v59-creation');
      if (!wiz) { var r = primary(); return r ? {action:'primary'} : {action:'wait'}; }
      if (!d) return {action:'nodraft'};
      var s = d.step;
      if (s==='INDUSTRY'){ if(!d.industry) return {action:'ind',result:click('[data-creation-choice="industry:INTERNET"]')}; }
      else if (s==='DIRECTION'){ if(!d.direction) return {action:'dir',result:click('[data-creation-choice="direction:TECH_RND"]')}; }
      else if (s==='PROFESSION'){ if(!d.professionConfirmed) return {action:'prof',result:click('[data-creation-choice="profession:JAVA_BACKEND"]')}; }
      else if (s==='IDENTITY'){ var inp=document.querySelector('#v59-nickname');
        if(!d.background) return {action:'bg',result:click('[data-creation-choice="background:ORDINARY_WORKER"]')};
        if (inp && inp.value!=='V10QA_EXE'){ inp.value='V10QA_EXE'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V10QA_EXE') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await sleep(600);
  }
  const charV = await evalJs(`(function(){ var f=window.__GAME_FACADE__; var c=null; try{ c=f.queryCharacterProfile?f.queryCharacterProfile():null; }catch(e){} return c?{name:c.name}:null; })()`);
  check('exe_creation_completed', home === true && charV && charV.name === 'V10QA_EXE', { home: home, char: charV });
  await shot('qa-12-exe-' + LABEL + '-home');

  // 战斗 + 版本特性探针
  await evalJs(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await sleep(2500);
  const battle = await evalJs(`(function(){
    var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){}
    return { alive: !!document.getElementById('Ux66EnemySprite'), stage: ab?ab.stage:null,
      comboField: ab?('comboCount' in ab):null,
      enemyBossField: ab&&ab.enemy?('isBoss' in ab.enemy):null };
  })()`);
  check('exe_battle_renders', !!(battle.alive && battle.stage !== null), battle);
  check('exe_v92_combo_in_view', battle.comboField === true, battle.comboField);
  await shot('qa-13-exe-' + LABEL + '-battle');

  // 连击（原子式）
  let combo = null;
  for (let i = 0; i < 50 && !(combo && combo.comboCount >= 5); i++) {
    combo = await evalJs(`(function(){
      var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){ return {skip:'no-ab'}; }
      if (!ab || ab.status !== 'FIGHTING') return { skip: ab ? ab.status : 'null' };
      for(var j=0;j<20;j++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); }
      try{ ab=f.queryAutoBattle(); }catch(e){}
      return { comboCount: ab?ab.comboCount:null };
    })()`);
    await sleep(400);
  }
  check('exe_combo_works', !!(combo && combo.comboCount >= 5), combo);

  // Boss P2（等 stage5）
  let bossP2 = null, maxStage = 0;
  const dl = Date.now() + 4 * 60 * 1000;
  while (Date.now() < dl && !bossP2) {
    await sleep(1500);
    const s = await evalJs(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} if(!ab) return null;
      return { stage:ab.stage, isBoss:!!(ab.enemy&&ab.enemy.isBoss), p2:!!(ab.enemy&&ab.enemy.phase2Active), p2Dom: !!document.querySelector('.ux65-debuff--p2') }; })()`);
    if (s) { if (s.stage > maxStage) maxStage = s.stage; if (s.isBoss && (s.p2 || s.p2Dom)) bossP2 = s; if (s.stage >= 9) break; }
  }
  check('exe_boss_phase2', !!bossP2, { boss: bossP2, maxStage: maxStage });
  await shot('qa-14-exe-' + LABEL + '-boss');

  // 存档文件（隔离目录）
  const saveDir = process.env.V10QA_EXE_SAVE;
  let saveOk = false, saveDetail = null;
  if (saveDir) {
    try {
      const f = path.join(saveDir, 'xiuxian-save', 'save.json');
      const stt = fs.statSync(f);
      saveOk = stt.size > 500;
      saveDetail = { size: stt.size, mtime: stt.mtime.toISOString() };
    } catch (e) { saveDetail = { err: String(e.message).slice(0, 120) }; }
  }
  check('exe_save_file_persisted', saveOk, saveDetail);

  const names = Object.keys(result.checks);
  const failed = names.filter((n) => !result.checks[n].pass);
  result.summary = { total: names.length, passed: names.length - failed.length, failed: failed, verdict: failed.length === 0 ? 'PASS' : 'FAIL' };
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'qa-exe-' + LABEL + '.json'), JSON.stringify(result, null, 2));
  logf('VERDICT=' + result.summary.verdict + ' passed=' + result.summary.passed + '/' + result.summary.total);
  process.exit(result.summary.verdict === 'PASS' ? 0 : 2);
})().catch((e) => { logf('FATAL ' + (e && e.stack || e)); process.exit(1); });
