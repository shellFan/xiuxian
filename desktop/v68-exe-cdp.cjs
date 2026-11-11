/**
 * V6.8 packaged-EXE acceptance + soak test via Chrome DevTools Protocol.
 *
 * The EXE is launched separately with --remote-debugging-port=9223 and an
 * isolated XIUXIAN_USER_DATA. This script attaches to the REAL renderer of the
 * PACKAGED app, drives the real character-creation flow, captures real
 * screenshots, and samples stability for V68_SOAK_MINUTES (default 20).
 *
 * No user desktop input is simulated; only CDP Runtime/Page commands are used.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v68');
const SHOT = path.join(OUT, 'screenshots', 'after');
const PORT = Number(process.env.V68_CDP_PORT || 9223);
const MINUTES = Number(process.env.V68_SOAK_MINUTES || 20);
const DURATION_MS = MINUTES * 60 * 1000;
const SAMPLE_MS = 30 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  startedAt: new Date().toISOString(),
  plannedMinutes: MINUTES,
  target: 'dist/牛马修仙传-win32-x64/牛马修仙传.exe (packaged, CDP)',
  samples: [],
  exceptions: [],
  consoleErrors: [],
  screenshots: [],
  httpErrors: {},
  httpErrorTotal: 0,
  spriteResponses: {},
  spriteResponseTotal: 0,
  rendererCrashed: false,
};

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /127\.0\.0\.1|index\.html/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) { /* devtools not up yet */ }
    await sleep(1000);
  }
  throw new Error('DevTools endpoint never became available');
}

function connect(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 0;
    let closed = false;

    // V6.8: a crashed renderer silently stops answering CDP commands. Without
    // timeouts the soak hangs forever and produces NO report at all. Fail loud.
    const failAll = (err) => {
      closed = true;
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); }
      pending.clear();
    };

    const api = {
      cmd(method, params = {}) {
        return new Promise((res, rej) => {
          if (closed) return rej(new Error('CDP websocket already closed'));
          const id = ++nextId;
          const timer = setTimeout(() => {
            pending.delete(id);
            rej(new Error('CDP timeout after 15s: ' + method));
          }, 15000);
          pending.set(id, { resolve: res, reject: rej, timer });
          try { ws.send(JSON.stringify({ id, method, params })); }
          catch (e) { clearTimeout(timer); pending.delete(id); rej(e); }
        });
      },
      async evaluate(expression) {
        const r = await api.cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.text };
        return r.result && r.result.result ? r.result.result.value : null;
      },
      async screenshot(name) {
        const r = await api.cmd('Page.captureScreenshot', { format: 'png' });
        if (!r.result || !r.result.data) return false;
        fs.mkdirSync(SHOT, { recursive: true });
        fs.writeFileSync(path.join(SHOT, name + '.png'), Buffer.from(r.result.data, 'base64'));
        report.screenshots.push(name + '.png');
        return true;
      },
      close() { try { ws.close(); } catch (_) {} },
    };

    ws.onopen = () => resolve(api);
    ws.onerror = (e) => {
      const err = new Error('WebSocket error: ' + (e.message || 'unknown'));
      failAll(err); reject(err);
    };
    ws.onclose = () => failAll(new Error('CDP websocket closed by target (renderer crash?)'));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(p.timer);
        p.resolve(msg);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        report.exceptions.push({ at: new Date().toISOString(), text: d.text, description: (d.exception && d.exception.description || '').slice(0, 300) });
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        report.consoleErrors.push({ at: new Date().toISOString(), text: (msg.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 250) });
      }
      if (msg.method === 'Inspector.targetCrashed') {
        report.rendererCrashed = true;
        report.crashedAt = new Date().toISOString();
      }
      if (msg.method === 'Network.responseReceived') {
        const r = msg.params.response || {};
        const u = r.url || '';
        if (r.status >= 400) {
          report.httpErrorTotal++;
          report.httpErrors[u] = (report.httpErrors[u] || 0) + 1;
        } else if (u.includes('/assets/sprites/sheets/')) {
          report.spriteResponseTotal++;
          const name = u.split('/').pop();
          report.spriteResponses[name] = (report.spriteResponses[name] || 0) + 1;
        }
      }
    };
  });
}

/* One real DOM click per round, same logic as the source-tree playthrough. */
const CREATION_STEP = `(function(){
  var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn');
  if (modal) { modal.click(); return {action:'dismiss-modal'}; }
  var f = window.__GAME_FACADE__, q = null;
  try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
  var d = q && q.draft ? q.draft : null;
  var wiz = !!document.querySelector('.v59-creation');
  if (document.querySelector('.ux65-stage') || document.querySelector('[data-action="v63-tapAttack"]')) return {action:'home-reached'};
  function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
  function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }
  if (!wiz) { var r = primary(); return r ? {action:'nonwizard-primary', result:r} : {action:'wait'}; }
  if (!d) return {action:'wait-no-draft'};
  var s = d.step;
  if (s === 'INDUSTRY') { if (!d.industry) return {action:'choose-industry', result:click('[data-creation-choice="industry:INTERNET"]'), step:s}; }
  else if (s === 'DIRECTION') { if (!d.direction) return {action:'choose-direction', result:click('[data-creation-choice="direction:TECH_RND"]'), step:s}; }
  else if (s === 'PROFESSION') { if (!d.professionConfirmed) return {action:'choose-profession', result:click('[data-creation-choice="profession:JAVA_BACKEND"]'), step:s}; }
  else if (s === 'IDENTITY') {
    var inp = document.querySelector('#v59-nickname');
    if (!d.background) return {action:'choose-background', result:click('[data-creation-choice="background:ORDINARY_WORKER"]'), step:s};
    if (inp && inp.value !== 'V68EXE') { inp.value='V68EXE'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'fill-nickname', step:s}; }
  }
  else if (s === 'DESTINY') { if (!d.selectedCandidateId) { var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click();return {action:'choose-destiny',step:s};} } }
  else if (s === 'ALLOCATION') { var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus && (!d.allocation || !d.allocation.insight)){plus.click();return {action:'allocate',step:s};} }
  else if (s === 'CONFIRM') return {action:'finalize', result:click('[data-creation-action="finalize"]'), step:s};
  return {action:'advance', step:s, result:primary()};
})()`;

const SAMPLE_JS = `(function(){
  function t(sel){var e=document.querySelector(sel);return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60):null;}
  var body=document.querySelector('#UiBody');
  var skill=document.querySelector('[data-action="v64-useSkill"]');
  var sr=skill?skill.getBoundingClientRect():null;
  return {
    stage:t('.ux65-stage-num'), enemy:t('.ux65-enemy-name'),
    hp:t('.ux65-enemy-hp'), power:t('.ux63-power-score'),
    domNodes:document.querySelectorAll('*').length,
    skillButtons:document.querySelectorAll('.ux64-skill-btn').length,
    skillY:sr?Math.round(sr.top):null,
    bodyLimit:body?Math.round(body.getBoundingClientRect().height):null,
    sprite:!!document.getElementById('Ux66EnemySprite'),
    canvas:!!document.querySelector('canvas'),
    modal:!!document.querySelector('.ux-modal-layer'),
    facade:!!window.__GAME_FACADE__,
    bodyTail:(document.body.innerText||'').replace(/\\s+/g,' ').slice(-220)
  };
})()`;

function processMemory() {
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 10000 });
    const lines = out.split(/\r?\n/).filter((l) => /牛马|xiuxian/i.test(l));
    return lines.length ? lines.map((l) => l.trim()).slice(0, 3) : null;
  } catch (_) { return null; }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const page = await findPage();
  report.devtoolsTarget = { title: page.title, url: page.url };
  const api = await connect(page);
  await api.cmd('Runtime.enable');
  await api.cmd('Page.enable');
  await api.cmd('Log.enable');
  await api.cmd('Network.enable');
  await api.cmd('Inspector.enable');
  await api.cmd('Performance.enable');
  console.log('[EXE-CDP] attached to packaged renderer: ' + page.url);

  // The devtools target exists before the Cocos bundle finishes booting.
  // Wait for the real overlay instead of auditing an empty document.
  let bootReady = false;
  for (let i = 0; i < 60; i++) {
    const s = await api.evaluate(`(function(){return {
      canvas:!!document.querySelector('canvas'),
      overlay:!!document.getElementById('UiOverlay'),
      textLen:(document.body.innerText||'').length,
      title:document.title
    };})()`);
    if (s && s.overlay && s.textLen > 50) { bootReady = true; report.bootReadyAfterSeconds = i; break; }
    await sleep(1000);
  }
  report.bootReady = bootReady;
  console.log('[EXE-CDP] bootReady=' + bootReady + ' after=' + report.bootReadyAfterSeconds + 's');
  if (!bootReady) throw new Error('Packaged renderer never finished booting');

  const firstScreen = await api.evaluate(`(function(){
    return {title:document.title, canvas:!!document.querySelector('canvas'),
      creation:!!document.querySelector('.v59-creation'),
      modal:!!document.querySelector('.ux-modal-layer'),
      industryCard:!!document.querySelector('[data-creation-choice="industry:INTERNET"]')};
  })()`);
  report.firstScreen = firstScreen;
  console.log('[EXE-CDP] firstScreen=' + JSON.stringify(firstScreen));
  await api.screenshot('exe-01-boot');

  report.creationSteps = [];
  let home = false;
  for (let i = 0; i < 40; i++) {
    const step = await api.evaluate(CREATION_STEP);
    report.creationSteps.push({ round: i, ...(step || {}) });
    if (step && step.action === 'home-reached') { home = true; break; }
    await sleep(650);
  }
  report.homeReached = home;
  console.log('[EXE-CDP] homeReached=' + home);
  await sleep(2000);
  await api.screenshot('exe-02-home');

  report.exeReachability = await api.evaluate(`(function(){
    var body=document.querySelector('#UiBody'); var limit=body?Math.round(body.getBoundingClientRect().height):innerHeight;
    var keys=['v64-useSkill','v64-toggleSpeed','v63-toggleAuto','v63-upgradeClick','v63-enterTower','v64-openEquip','v64-openGoals'];
    var out={}; for(var i=0;i<keys.length;i++){var e=document.querySelector('[data-action="'+keys[i]+'"]');if(!e){out[keys[i]]=null;continue;}var r=e.getBoundingClientRect();out[keys[i]]={y:Math.round(r.top),bottom:Math.round(r.bottom),inFirstScreen:r.bottom<=limit};}
    return {limit:limit,controls:out,firstScreenCount:Object.keys(out).filter(function(k){return out[k]&&out[k].inFirstScreen;}).length,total:keys.length};
  })()`);
  console.log('[EXE-CDP] reachability=' + JSON.stringify(report.exeReachability));

  // V6.8 P0 acceptance: prove the V6.6 sprite sheets are really shipped in the
  // packaged app. Before fix, all four URLs returned 404 and the server log was
  // flooded with repeated sprite 404s during every overlay refresh.
  report.spriteCheck = await api.evaluate(`(async function(){
    var names=['scene_office.png','javabackend_idle.png','bug_idle.png','kpiLord_idle.png'];
    var out={};
    for (var i=0;i<names.length;i++){
      try { var r=await fetch('assets/sprites/sheets/'+names[i], {cache:'no-store'}); out[names[i]]=r.status; }
      catch(e){ out[names[i]]='ERR '+(e && e.message); }
    }
    var el=document.querySelector('.ux66-sprite');
    out.__spriteDomCount=document.querySelectorAll('.ux66-sprite').length;
    out.__spriteBg=el?getComputedStyle(el).backgroundImage.slice(0,160):null;
    return out;
  })()`);
  console.log('[EXE-CDP] spriteCheck=' + JSON.stringify(report.spriteCheck));

  const deadline = Date.now() + DURATION_MS;
  let idx = 0;
  let lastScreenshotAt = Date.now();
  while (Date.now() < deadline) {
    idx++;
    const metrics = await api.cmd('Performance.getMetrics');
    const mm = {};
    if (metrics.result && metrics.result.metrics) {
      for (const m of metrics.result.metrics) {
        if (['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'LayoutCount', 'RecalcStyleCount'].includes(m.name)) mm[m.name] = m.value;
      }
    }
    const state = await api.evaluate(SAMPLE_JS);
    const sample = {
      index: idx,
      at: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - (deadline - DURATION_MS)) / 1000),
      metrics: mm,
      state,
      process: processMemory(),
      alive: true,
    };
    report.samples.push(sample);
    console.log(`[soak] #${idx} ${sample.elapsedSeconds}s stage=${state && state.stage} nodes=${state && state.domNodes} heap=${mm.JSHeapUsedSize} exceptions=${report.exceptions.length} http4xx=${report.httpErrorTotal} sprite2xx=${report.spriteResponseTotal}`);
    if (report.rendererCrashed) throw new Error('Inspector.targetCrashed: packaged renderer crashed');
    if (Date.now() - lastScreenshotAt >= 5 * 60 * 1000) {
      await api.screenshot('exe-soak-' + String(idx).padStart(3, '0'));
      lastScreenshotAt = Date.now();
    }
    await sleep(Math.min(SAMPLE_MS, Math.max(1000, deadline - Date.now())));
  }

  await api.screenshot('exe-03-final');
  report.endedAt = new Date().toISOString();
  report.actualMinutes = (Date.now() - (deadline - DURATION_MS)) / 60000;
  report.completed = true;
  finalizeReport();
  console.log('[EXE-CDP] SOAK_DONE minutes=' + report.actualMinutes.toFixed(2) + ' samples=' + report.sampleCount + ' exceptions=' + report.exceptionCount + ' rendererCrashed=' + report.rendererCrashed);
  api.close();
  process.exit(0);
})().catch((e) => {
  report.completed = false;
  report.fatal = String(e && e.stack || e);
  report.endedAt = new Date().toISOString();
  finalizeReport();
  console.error('[EXE-CDP] FATAL ' + report.fatal);
  process.exit(1);
});

function finalizeReport() {
  report.sampleCount = report.samples.length;
  report.exceptionCount = report.exceptions.length;
  report.consoleErrorCount = report.consoleErrors.length;
  report.spriteHttpErrors = Object.entries(report.httpErrors)
    .filter(([u]) => u.includes('/assets/sprites/sheets/'))
    .map(([u, n]) => ({ url: u, count: n }));
  report.spriteHttpErrorTotal = report.spriteHttpErrors.reduce((s, x) => s + x.count, 0);
  try {
    fs.writeFileSync(path.join(OUT, 'v68-exe-soak.json'), JSON.stringify(report, null, 2));
  } catch (e) {
    console.error('[EXE-CDP] could not write soak report: ' + e.message);
  }
}
