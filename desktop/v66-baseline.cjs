// V6.6 基线截图：采集V6.5当前画面
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const shotDir = path.join(__dirname, '..', 'ai', 'reports', 'v66', 'before');
  fs.mkdirSync(shotDir, { recursive: true });
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('FAIL: No window'); app.exit(1); }

  // 处理职业选择
  await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    if (btn) btn.click();
  })()`).catch(() => {});
  await wait(6000);

  // 等待舞台
  for (let i = 0; i < 5; i++) {
    const ok = await win.webContents.executeJavaScript(`!!document.querySelector('.ux65-stage')`).catch(() => false);
    if (ok) break;
    await wait(2000);
  }

  const shots = [
    ['01-home-battle', null],
    ['02-tap-attack', '[data-action="v63-tapAttack"]'],
    ['03-skill-1', '.ux64-skill-btn--ready[data-skill]'],
    ['04-equip-panel', '[data-action="v64-openEquip"]'],
    ['05-goals-panel', '[data-action="v64-openGoals"]'],
    ['06-hire-menu', '[data-action="v63-hireMenu"]'],
  ];

  for (const [name, selector] of shots) {
    if (selector) {
      await win.webContents.executeJavaScript(`(function(){
        var el = document.querySelector('${selector}');
        if (el) el.click();
      })()`).catch(() => {});
      await wait(600);
    }
    await win.webContents.capturePage().then(img => {
      fs.writeFileSync(path.join(shotDir, name + '.png'), img.toPNG());
      console.log('[V66-BASE] ' + name + ' OK');
    });
    // 关闭面板
    if (selector && selector.includes('openEquip')) {
      await win.webContents.executeJavaScript(`(function(){ var b=document.querySelector('[data-action="v64-closeEquip"]'); if(b)b.click(); })()`).catch(() => {});
      await wait(400);
    }
    if (selector && selector.includes('openGoals')) {
      await win.webContents.executeJavaScript(`(function(){ var b=document.querySelector('[data-action="v64-closeGoals"]'); if(b)b.click(); })()`).catch(() => {});
      await wait(400);
    }
    if (selector && selector.includes('hireMenu')) {
      await win.webContents.executeJavaScript(`(function(){ var b=document.querySelector('[data-action="v63-closeHireMenu"]'); if(b)b.click(); })()`).catch(() => {});
      await wait(400);
    }
  }

  // 审计当前CSS角色状态
  const audit = await win.webContents.executeJavaScript(`(function(){
    var char = document.querySelector('.ux65-char');
    var scene = document.querySelector('.ux65-scene');
    return {
      charIsCSS: !!char,
      charHasImg: char ? !!char.querySelector('img') : false,
      charBgImage: char ? getComputedStyle(char).backgroundImage : 'none',
      sceneLayers: scene ? scene.children.length : 0,
      sceneHasImg: scene ? !!scene.querySelector('img') : false,
      enemyEmoji: (function(){ var e=document.querySelector('.ux65-char-emoji'); return e ? e.textContent : 'none'; })(),
      squadEmojis: Array.from(document.querySelectorAll('.ux65-member-emoji')).map(function(e){ return e.textContent; }),
    };
  })()`).catch(e => ({ error: String(e) }));
  console.log('[V66-BASE] AUDIT:', JSON.stringify(audit, null, 2));
  app.exit(0);
});