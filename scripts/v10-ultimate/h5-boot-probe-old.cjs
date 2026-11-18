'use strict';
/** 临时诊断探针 v2：页面内 console 拦截（不干扰 CDP 消息泵）。 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = 29000 + Math.floor(Math.random() * 2000);
  const profileDir = path.join(os.tmpdir(), `xiuxian-probe2-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: 'http://127.0.0.1:8644/', port, profileDir });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  const cdp = new runner.CdpClient(port, 15000, { record() {} });
  await sleep(6000);
  await cdp.connect();
  await cdp.command('Page.enable');
  await cdp.command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      window.__PROBE_LOG__ = [];
      var log = window.__PROBE_LOG__;
      ['log','warn','error','info'].forEach(function(k){
        var orig = console[k].bind(console);
        console[k] = function(){ try { log.push({t:k, m:[].slice.call(arguments).map(function(a){ return a && a.toString ? a.toString().slice(0,260) : String(a); }).join(' ').slice(0,300)}); } catch(e){} orig.apply(null, arguments); };
      });
      window.addEventListener('error', function(e){ try { log.push({t:'PAGE_ERROR', m:String(e.message).slice(0,300) + ' @ ' + String(e.filename||'').split('/').pop() + ':' + e.lineno}); } catch(e2){} }, true);
      window.addEventListener('unhandledrejection', function(e){ try { log.push({t:'UNHANDLED_REJECTION', m:String(e.reason && e.reason.stack || e.reason).slice(0,400)}); } catch(e2){} });
    })();`,
  });
  await cdp.command('Page.reload', { ignoreCache: true });
  await sleep(18000);
  const diag = await cdp.evaluate(`(function(){
    var res = performance.getEntriesByType('resource').map(function(r){ return { n: r.name.split('/').pop(), t: r.initiatorType, dur: Math.round(r.duration), size: r.transferSize }; });
    var fails = res.filter(function(r){ return r.size === 0 && r.dur === 0; });
    var scene = null;
    try { scene = (window.cc && cc.director && cc.director._scene) ? cc.director._scene.name : null; } catch(e) { scene = 'ERR:' + e.message; }
    return {
      facade: typeof window.__GAME_FACADE__,
      cocos: typeof window.cc,
      electron: typeof window.electronAPI,
      gameStarted: (window.cc && cc.game) ? !!cc.game._started : null,
      scene: scene,
      resourceCount: res.length,
      failed: fails.slice(0, 20),
      probeLog: (window.__PROBE_LOG__ || []).slice(0, 50)
    };
  })()`);
  console.log('DIAG:', JSON.stringify({ facade: diag.facade, cocos: diag.cocos, electron: diag.electron, gameStarted: diag.gameStarted, scene: diag.scene, resourceCount: diag.resourceCount }, null, 1));
  console.log('FAILED RESOURCES:', JSON.stringify(diag.failed, null, 1));
  console.log('ALL RESOURCES:', JSON.stringify(res2(diag), null, 1));
  function res2(d) { return d.failed; }
  console.log('PAGE LOG (' + (diag.probeLog || []).length + '):');
  for (const m of diag.probeLog || []) console.log(' [' + m.t + '] ' + m.m);
  cdp.close();
  try { child.kill(); } catch (_) {}
  process.exit(0);
})().catch((e) => { console.error('PROBE FATAL', e && e.stack || e); process.exit(1); });
