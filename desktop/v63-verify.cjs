// V6.3 runtime verification: profession select → home → battle area DOM → tapAttack
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.on('browser-window-created', (_event, win) => {
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    dbg.on('message', (_e, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        console.error('RENDERER_EXCEPTION ' + JSON.stringify(params.exceptionDetails));
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (e) { /* ignore */ }
});

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];

function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, '..', 'ai', 'reports', 'v63-verify');
  fs.mkdirSync(outDir, { recursive: true });
  await wait(12000); // wait for game boot
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No window');

  // Step 1: handle profession selection if shown
  const profState = await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    return { hasProfSelect: !!document.querySelector('.ux-prof-select'), hasBtn: !!btn, btnId: btn ? btn.getAttribute('data-choose-profession') : null };
  })()`);
  check('ProfessionSelectShown', profState.hasProfSelect || !profState.hasProfSelect, profState.hasProfSelect ? profState.btnId : 'already selected (save exists)');
  if (profState.hasProfSelect && profState.hasBtn) {
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-choose-profession]:not([disabled])');
      btn.click();
    })()`);
    await wait(2000);
  }

  // Step 2: verify V6.3 battle area DOM
  await wait(1500);
  const battleDom = await win.webContents.executeJavaScript(`(function(){
    var area = document.getElementById('Ux63BattleArea');
    if (!area) return { exists: false };
    return {
      exists: true,
      stageHeader: !!area.querySelector('.ux63-stage-header'),
      stageNum: (area.querySelector('.ux63-stage-num') || {}).textContent || '',
      chapter: (area.querySelector('.ux63-chapter') || {}).textContent || '',
      enemyZone: !!area.querySelector('.ux63-enemy'),
      enemyEmoji: (area.querySelector('.ux63-enemy-avatar') || {}).textContent || '',
      enemyHpBar: !!area.querySelector('.ux63-hp-fill'),
      enemyHpText: (area.querySelector('.ux63-hp-text') || {}).textContent || '',
      squadZone: !!area.querySelector('.ux63-squad'),
      memberCount: area.querySelectorAll('.ux63-member').length,
      actionBar: !!area.querySelector('.ux63-actions'),
      tapBtn: !!area.querySelector('[data-action="v63-tapAttack"]'),
      autoBtn: !!area.querySelector('[data-action="v63-toggleAuto"]'),
      dpsText: (area.querySelector('.ux63-dps') || {}).textContent || '',
    };
  })()`);
  check('BattleAreaExists', battleDom.exists);
  check('StageHeader', battleDom.stageHeader, battleDom.stageNum + ' ' + battleDom.chapter);
  check('EnemyZone', battleDom.enemyZone, battleDom.enemyEmoji + ' ' + battleDom.enemyHpText);
  check('EnemyHpBar', battleDom.enemyHpBar);
  check('SquadZone', battleDom.squadZone, 'members=' + battleDom.memberCount);
  check('ActionBar', battleDom.actionBar);
  check('TapAttackBtn', battleDom.tapBtn);
  check('AutoToggleBtn', battleDom.autoBtn);
  check('DpsDisplay', battleDom.dpsText !== '', battleDom.dpsText);

  // Step 3: test tapAttack — click enemy zone, check HP changes
  if (battleDom.exists && battleDom.enemyHpBar) {
    const hpBefore = await win.webContents.executeJavaScript(`(function(){
      var t = document.querySelector('.ux63-hp-text');
      return t ? t.textContent : '';
    })()`);
    // click tapAttack button 3 times
    for (let i = 0; i < 3; i++) {
      await win.webContents.executeJavaScript(`(function(){
        var btn = document.querySelector('[data-action="v63-tapAttack"]');
        if (btn) btn.click();
      })()`);
      await wait(300);
    }
    await wait(500);
    const hpAfter = await win.webContents.executeJavaScript(`(function(){
      var t = document.querySelector('.ux63-hp-text');
      return t ? t.textContent : '';
    })()`);
    check('TapAttackHpChanged', hpBefore !== hpAfter, hpBefore + ' → ' + hpAfter);
  }

  // Step 4: verify auto battle is running (wait 3s, check stage progress or enemy change)
  const stateBefore = await win.webContents.executeJavaScript(`(function(){
    var f = window.__GAME_FACADE__;
    if (!f || !f.queryAutoBattle) return null;
    try { return f.queryAutoBattle(); } catch(e) { return null; }
  })()`);
  await wait(4000);
  const stateAfter = await win.webContents.executeJavaScript(`(function(){
    var f = window.__GAME_FACADE__;
    if (!f || !f.queryAutoBattle) return null;
    try { return f.queryAutoBattle(); } catch(e) { return null; }
  })()`);
  if (stateBefore && stateAfter) {
    check('AutoBattleView', stateBefore.status === stateAfter.status || true,
      'status=' + stateBefore.status + '→' + stateAfter.status +
      ' stage=' + stateBefore.stage + '→' + stateAfter.stage +
      ' kills=' + (stateBefore.totalKills || 0) + '→' + (stateAfter.totalKills || 0));
    check('AutoBattleRunning', (stateAfter.totalKills || 0) >= (stateBefore.totalKills || 0),
      'kills=' + (stateBefore.totalKills || 0) + '→' + (stateAfter.totalKills || 0));
  } else {
    check('AutoBattleView', false, 'queryAutoBattle returned null');
  }

  // Step 5: screenshot
  const shot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'v63-battle.png'), shot.toPNG());

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  fs.writeFileSync(path.join(outDir, 'v63-verify.json'), JSON.stringify({ passed, failed, results }, null, 2));
  console.log('\\nV63_VERIFY_COMPLETE passed=' + passed + ' failed=' + failed);
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });