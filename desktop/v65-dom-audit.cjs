// V6.5 DOM visual audit: extract UI structure + computed styles for diagnosis
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'v65');
  fs.mkdirSync(out, { recursive: true });
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No window');
  // Handle profession select if shown
  await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    if (btn) btn.click();
    return true;
  })()`).catch(() => {});
  await wait(6000); // extra wait for game boot + home render

  const audit = await win.webContents.executeJavaScript(`(function(){
    var result = { viewport: {}, battle: {}, squad: [], enemy: {}, actions: {}, skillbar: {}, panels: {}, issues: [], screenState: '' };

    // What screen is showing?
    var overlay = document.getElementById('UiOverlay');
    if (overlay) {
      var visible = overlay.querySelector('.ux-page:not([style*="display: none"]), .ux-page:not(.is-hidden)');
      result.screenState = 'overlay exists, pages: ' + overlay.querySelectorAll('.ux-page').length;
      // Check active tab
      var activeTab = overlay.querySelector('.ux-nav-item.is-active, .ux-bottom-nav-item.is-active');
      if (activeTab) result.screenState += ', activeTab: ' + activeTab.textContent.trim().substring(0, 10);
    } else {
      result.screenState = 'NO_OVERLAY';
    }
    // Check game facade
    result.screenState += ', facade: ' + (window.__GAME_FACADE__ ? 'yes' : 'no');

    // Viewport
    result.viewport = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio };

    // Battle area
    var area = document.getElementById('Ux63BattleArea');
    if (area) {
      var rect = area.getBoundingClientRect();
      var cs = getComputedStyle(area);
      result.battle = {
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        bg: cs.background ? cs.background.substring(0, 80) : 'none',
        border: cs.border,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        overflow: cs.overflow
      };
      // What fraction of screen?
      result.battle.screenRatio = Math.round((rect.width * rect.height) / (window.innerWidth * window.innerHeight) * 100) + '%';
    }

    // Enemy
    var enemy = document.querySelector('.ux63-enemy');
    if (enemy) {
      var er = enemy.getBoundingClientRect();
      var ecs = getComputedStyle(enemy);
      result.enemy = {
        rect: { w: Math.round(er.width), h: Math.round(er.height) },
        avatar: (enemy.querySelector('.ux63-enemy-avatar') || {}).textContent || '',
        name: (enemy.querySelector('.ux63-enemy-name') || {}).textContent || '',
        isBoss: enemy.classList.contains('ux63-enemy--boss'),
        bg: ecs.background ? ecs.background.substring(0, 60) : 'none',
        border: ecs.borderColor
      };
    }

    // Squad members
    var members = document.querySelectorAll('.ux63-member:not(.ux63-member--empty)');
    members.forEach(function(m) {
      var mr = m.getBoundingClientRect();
      var mcs = getComputedStyle(m);
      result.squad.push({
        w: Math.round(mr.width), h: Math.round(mr.height),
        avatar: (m.querySelector('.ux63-member-avatar') || {}).textContent || (m.textContent || '').substring(0, 15),
        rarityClass: Array.from(m.classList).filter(function(c) { return c.indexOf('ux64-r') === 0; }).join(','),
        bg: mcs.background ? mcs.background.substring(0, 60) : 'none',
        borderColor: mcs.borderColor
      });
    });

    // Actions
    var actions = document.querySelector('.ux63-actions');
    if (actions) {
      var ar = actions.getBoundingClientRect();
      result.actions = {
        w: Math.round(ar.width), h: Math.round(ar.height),
        buttonCount: actions.querySelectorAll('button').length,
        buttons: Array.from(actions.querySelectorAll('button')).map(function(b) {
          return { text: (b.textContent || '').trim().substring(0, 12), action: b.getAttribute('data-action') || '' };
        })
      };
    }

    // Skill bar
    var skillbar = document.querySelector('.ux64-skillbar');
    if (skillbar) {
      var sr = skillbar.getBoundingClientRect();
      result.skillbar = {
        w: Math.round(sr.width), h: Math.round(sr.height),
        skillCount: skillbar.querySelectorAll('[data-action^="v64-useSkill"]').length,
        skills: Array.from(skillbar.querySelectorAll('[data-action^="v64-useSkill"]')).map(function(b) {
          return { text: b.textContent.trim().substring(0, 10), locked: b.classList.contains('ux64-skill--locked') };
        })
      };
    }

    // Stage header
    var stageHeader = document.querySelector('.ux63-stage-header');
    if (stageHeader) {
      result.stageHeader = stageHeader.textContent.trim().substring(0, 80);
    }

    // Detect visual issues
    if (result.enemy.avatar && /^[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]+$/u.test(result.enemy.avatar.trim())) {
      result.issues.push('ENEMY_IS_EMOJI: enemy avatar is emoji, not original art');
    }
    result.squad.forEach(function(s, i) {
      if (s.avatar && /^[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]+$/u.test(s.avatar.trim())) {
        result.issues.push('SQUAD_MEMBER_IS_EMOJI: member ' + i + ' avatar is emoji');
      }
    });
    if (result.battle.screenRatio && parseInt(result.battle.screenRatio) < 40) {
      result.issues.push('BATTLE_AREA_TOO_SMALL: ' + result.battle.screenRatio + ' of screen');
    }
    if (result.actions.buttonCount > 8) {
      result.issues.push('TOO_MANY_BUTTONS: ' + result.actions.buttonCount + ' in action bar');
    }

    // Check for scene layers
    var sceneLayers = document.querySelectorAll('.ux63-scene-bg, .ux63-scene-mid, .ux63-scene-floor');
    result.sceneLayers = sceneLayers.length;
    if (sceneLayers.length === 0) result.issues.push('NO_SCENE_LAYERS: battle has no background/midground/floor layers');

    // Check damage numbers
    var dmgNums = document.querySelectorAll('.ux63-float-dmg, .ux-float-dmg, .ux63-dmg');
    result.damageNumberCount = dmgNums.length;

    // Check nav tabs
    var navTabs = document.querySelectorAll('.ux-nav-item, .ux-bottom-nav-item');
    result.navTabCount = navTabs.length;

    return result;
  })()`);

  fs.writeFileSync(path.join(out, 'v65-dom-audit.json'), JSON.stringify(audit, null, 2));
  console.log(JSON.stringify(audit, null, 2));
  console.log('\nV65_DOM_AUDIT_COMPLETE');
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });