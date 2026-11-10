// V6.5 最终综合验证：截图+面板测试+DOM审计
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'v65');
  const shotDir = path.join(out, 'screenshots', 'after');
  fs.mkdirSync(shotDir, { recursive: true });
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('FAIL: No window'); app.exit(1); }

  // 处理职业选择
  await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    if (btn) btn.click();
    return true;
  })()`).catch(() => {});
  await wait(6000);

  // 等待舞台
  for (let i = 0; i < 5; i++) {
    const ok = await win.webContents.executeJavaScript(`!!document.querySelector('.ux65-stage')`).catch(() => false);
    if (ok) break;
    await wait(2000);
  }

  // 截图01：首页
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '01-home-battle.png'), img.toPNG());
    console.log('[V65] 01-home OK');
  });

  // 截图02：点击攻击（特效）
  await win.webContents.executeJavaScript(`(function(){
    var a = document.querySelector('[data-action="v63-tapAttack"]');
    if (a) a.click();
  })()`).catch(() => {});
  await wait(350);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '02-tap-attack.png'), img.toPNG());
    console.log('[V65] 02-tap OK');
  });

  // 截图03：技能释放
  await win.webContents.executeJavaScript(`(function(){
    var s = document.querySelector('.ux64-skill-btn--ready[data-skill]');
    if (s) s.click();
  })()`).catch(() => {});
  await wait(400);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '03-skill.png'), img.toPNG());
    console.log('[V65] 03-skill OK');
  });

  // 截图04：装备面板
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v64-openEquip"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(800);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '04-equip-panel.png'), img.toPNG());
    console.log('[V65] 04-equip OK');
  });
  // 关闭装备面板
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v64-closeEquip"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(500);

  // 截图05：目标面板
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v64-openGoals"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(800);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '05-goals-panel.png'), img.toPNG());
    console.log('[V65] 05-goals OK');
  });
  // 关闭目标面板
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v64-closeGoals"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(500);

  // 截图06：招募弹窗
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v63-hireMenu"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(600);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '06-hire-menu.png'), img.toPNG());
    console.log('[V65] 06-hire OK');
  });
  await win.webContents.executeJavaScript(`(function(){
    var b = document.querySelector('[data-action="v63-closeHireMenu"]');
    if (b) b.click();
  })()`).catch(() => {});
  await wait(500);

  // 最终DOM审计
  const audit = await win.webContents.executeJavaScript(`(function(){
    var stage = document.querySelector('.ux65-stage');
    var char = document.querySelector('.ux65-char');
    var scene = document.querySelector('.ux65-scene');
    var squad = document.querySelectorAll('.ux65-member');
    var vp = { w: window.innerWidth, h: window.innerHeight };
    var sr = stage ? stage.getBoundingClientRect() : null;
    return {
      viewport: vp,
      stageExists: !!stage,
      stageRect: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) } : null,
      screenRatio: sr ? Math.round(sr.width * sr.height / (vp.w * vp.h) * 100) + '%' : 'N/A',
      charExists: !!char,
      charRect: char ? { w: Math.round(char.getBoundingClientRect().width), h: Math.round(char.getBoundingClientRect().height) } : null,
      sceneExists: !!scene,
      sceneLayers: scene ? scene.children.length : 0,
      squadCount: squad.length,
      squadFirstRect: squad[0] ? { w: Math.round(squad[0].getBoundingClientRect().width), h: Math.round(squad[0].getBoundingClientRect().height) } : null,
      dmgLayerExists: !!document.getElementById('Ux65DmgLayer'),
      fxLayerExists: !!document.getElementById('Ux65FxLayer'),
      hpFillExists: !!document.getElementById('Ux63HpFill'),
      themeClass: stage ? (stage.className.match(/ux65-theme--\\S+/) || [''])[0] : '',
      charParts: char ? char.querySelectorAll('.ux65-char-head, .ux65-char-torso, .ux65-char-aura, .ux65-char-shadow, .ux65-char-arm-l, .ux65-char-arm-r, .ux65-char-eyes, .ux65-char-brow, .ux65-char-mouth').length : 0,
      actions: document.querySelectorAll('.ux65-btn').length,
      particles: document.querySelectorAll('.ux65-particle').length,
      skillBtns: document.querySelectorAll('.ux64-skill-btn').length,
      synergyBadges: document.querySelectorAll('.ux65-synergy-badge').length,
    };
  })()`).catch(e => ({ error: String(e) }));
  fs.writeFileSync(path.join(out, 'v65-after-audit.json'), JSON.stringify(audit, null, 2));
  console.log('[V65] AUDIT:', JSON.stringify(audit, null, 2));
  app.exit(0);
});