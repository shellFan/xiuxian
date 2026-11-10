// V6.6 Sprite验证：截图+DOM审计+动画验证
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'v66');
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
  for (let i = 0; i < 8; i++) {
    const ok = await win.webContents.executeJavaScript(`!!document.querySelector('.ux65-stage')`).catch(() => false);
    if (ok) break;
    await wait(2000);
  }

  // 等待sprite挂载
  await wait(2000);

  // ── DOM审计 ──
  const audit = await win.webContents.executeJavaScript(`(function(){
    var r = {};
    // 敌人sprite检查
    var enemySprite = document.getElementById('Ux66EnemySprite');
    r.enemySpriteExists = !!enemySprite;
    r.enemyBgImage = enemySprite ? (enemySprite.style.backgroundImage || '') : '';
    r.enemyHasImg = r.enemyBgImage.indexOf('sprites') >= 0;
    r.enemyBgPos = enemySprite ? enemySprite.style.backgroundPosition : '';
    // 场景检查
    var sceneBg = document.querySelector('.ux66-scene-bg');
    r.sceneBgExists = !!sceneBg;
    r.sceneBgImage = sceneBg ? (sceneBg.style.backgroundImage || '') : '';
    r.sceneHasImg = r.sceneBgImage.indexOf('scene_') >= 0;
    // 小队sprite检查
    var squadSprites = document.querySelectorAll('.ux66-squad-sprite');
    r.squadSpriteCount = squadSprites.length;
    var squadHasImg = 0;
    for (var i = 0; i < squadSprites.length; i++) {
      if ((squadSprites[i].style.backgroundImage || '').indexOf('sprites') >= 0) squadHasImg++;
    }
    r.squadWithImg = squadHasImg;
    // CSS角色残留检查
    var cssChar = document.querySelector('.ux65-char-body');
    r.cssCharRemains = !!cssChar;
    // 旧emoji检查
    var enemyEmoji = document.querySelector('.ux65-char-emoji');
    r.enemyEmojiRemains = !!enemyEmoji;
    var squadEmoji = document.querySelectorAll('.ux65-member-emoji');
    r.squadEmojiCount = squadEmoji.length;
    // V6.6 sprite模块
    r.v66ModuleLoaded = !!window.__V66_SPRITE__;
    // 敌人名称
    var enemyName = document.querySelector('.ux65-enemy-name');
    r.enemyName = enemyName ? enemyName.textContent.trim() : 'none';
    // 关卡
    var stageNum = document.querySelector('.ux65-stage-num');
    r.stageNum = stageNum ? stageNum.textContent.trim() : 'none';
    // 主题
    var stage = document.querySelector('.ux65-stage');
    r.themeClass = stage ? (stage.className.match(/ux65-theme--\\S+/) || ['none'])[0] : 'none';
    return r;
  })()`).catch(e => ({ error: String(e) }));

  console.log('[V66] Audit:', JSON.stringify(audit, null, 2));

  // ── 截图01：首页战斗（sprite版） ──
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '01-sprite-battle.png'), img.toPNG());
    console.log('[V66] 01-sprite-battle OK');
  });

  // ── 截图02：点击攻击（sprite受击动画） ──
  await win.webContents.executeJavaScript(`(function(){
    var a = document.querySelector('[data-action="v63-tapAttack"]');
    if (a) a.click();
  })()`).catch(() => {});
  await wait(200);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '02-sprite-hit.png'), img.toPNG());
    console.log('[V66] 02-sprite-hit OK');
  });

  // ── 截图03：技能释放 ──
  await win.webContents.executeJavaScript(`(function(){
    var s = document.querySelector('.ux64-skill-btn--ready[data-skill]');
    if (s) s.click();
  })()`).catch(() => {});
  await wait(300);
  await win.webContents.capturePage().then(img => {
    fs.writeFileSync(path.join(shotDir, '03-sprite-skill.png'), img.toPNG());
    console.log('[V66] 03-sprite-skill OK');
  });

  // ── 动画帧验证（检查background-position是否在变化） ──
  await wait(1000);
  const animCheck = await win.webContents.executeJavaScript(`(function(){
    var el = document.getElementById('Ux66EnemySprite');
    if (!el) return { error: 'no sprite element' };
    var pos1 = el.style.backgroundPosition;
    return new Promise(function(resolve) {
      setTimeout(function() {
        var pos2 = el.style.backgroundPosition;
        resolve({
          pos1: pos1,
          pos2: pos2,
          animating: pos1 !== pos2,
          bgImage: el.style.backgroundImage,
        });
      }, 500);
    });
  })()`).catch(e => ({ error: String(e) }));
  console.log('[V66] AnimCheck:', JSON.stringify(animCheck, null, 2));

  // ── 写入审计结果 ──
  const report = {
    timestamp: new Date().toISOString(),
    audit: audit,
    animCheck: animCheck,
    pass: audit.enemyHasImg && audit.sceneHasImg && audit.squadWithImg > 0 && !audit.cssCharRemains,
  };
  fs.writeFileSync(path.join(out, 'v66-sprite-audit.json'), JSON.stringify(report, null, 2));
  console.log('[V66] Report written:', path.join(out, 'v66-sprite-audit.json'));
  console.log('[V66] PASS:', report.pass);

  app.exit(report.pass ? 0 : 1);
});