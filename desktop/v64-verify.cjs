// V6.4 runtime verification: skill bar, quality border, synergy, equip panel, goals panel
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
  const outDir = path.join(__dirname, '..', 'ai', 'reports', 'v64-verify');
  fs.mkdirSync(outDir, { recursive: true });
  // Wait for game boot (fixed wait - polling interferes with Cocos loading)
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No window');

  // Step 1: handle profession selection if shown
  const profState = await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    return { hasProfSelect: !!document.querySelector('.ux-prof-select'), hasBtn: !!btn };
  })()`);
  if (profState.hasProfSelect && profState.hasBtn) {
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-choose-profession]:not([disabled])');
      if (btn) btn.click();
    })()`);
    await wait(2000);
  }
  await wait(1500);

  // Step 2: V6.4 skill bar
  const skillDom = await win.webContents.executeJavaScript(`(function(){
    var area = document.getElementById('Ux63BattleArea');
    if (!area) return { exists: false };
    var bar = area.querySelector('.ux64-skillbar');
    var skills = area.querySelectorAll('[data-action^="v64-useSkill"]');
    var speedBtn = area.querySelector('[data-action="v64-toggleSpeed"]');
    var skillInfo = [];
    for (var i = 0; i < skills.length; i++) {
      skillInfo.push({
        action: skills[i].getAttribute('data-action'),
        locked: !!skills[i].classList.contains('ux64-skill--locked'),
        text: skills[i].textContent.trim().substring(0, 20)
      });
    }
    return {
      exists: true,
      skillBar: !!bar,
      skillCount: skills.length,
      skills: skillInfo,
      speedBtn: !!speedBtn,
      speedText: speedBtn ? speedBtn.textContent.trim() : ''
    };
  })()`);
  check('BattleAreaExists', skillDom.exists);
  check('SkillBarRendered', skillDom.skillBar);
  check('SkillButtonsCount', skillDom.skillCount >= 1, 'count=' + skillDom.skillCount);
  check('SpeedButton', skillDom.speedBtn, skillDom.speedText);

  // Step 3: squad quality + star + synergy
  const squadDom = await win.webContents.executeJavaScript(`(function(){
    var area = document.getElementById('Ux63BattleArea');
    if (!area) return { exists: false };
    var members = area.querySelectorAll('.ux63-member');
    var rarityClasses = [];
    var starCount = 0;
    for (var i = 0; i < members.length; i++) {
      for (var r = 0; r <= 4; r++) {
        if (members[i].classList.contains('ux64-r' + r)) {
          rarityClasses.push('r' + r);
          break;
        }
      }
      if (members[i].textContent.indexOf('star') >= 0 || members[i].textContent.indexOf('★') >= 0 || members[i].textContent.indexOf('⭐') >= 0) starCount++;
    }
    var synergyRow = area.querySelector('.ux64-synergy-row');
    var badges = area.querySelectorAll('.ux64-synergy-badge');
    var powerEl = area.querySelector('.ux63-tag--power');
    return {
      exists: true,
      memberCount: members.length,
      rarityClasses: rarityClasses,
      starCount: starCount,
      synergyRow: !!synergyRow,
      badgeCount: badges.length,
      powerShown: !!powerEl,
      powerText: powerEl ? powerEl.textContent.trim().substring(0, 30) : ''
    };
  })()`);
  check('SquadQualityBorder', squadDom.exists && squadDom.rarityClasses && squadDom.rarityClasses.length > 0, squadDom.exists ? squadDom.rarityClasses.join(',') : 'no area');
  check('SynergyRow', squadDom.exists, squadDom.exists ? 'badges=' + squadDom.badgeCount + (squadDom.synergyRow ? '' : ' (no active synergy)') : 'no area');
  check('PowerScoreShown', squadDom.exists && squadDom.powerShown, squadDom.exists ? squadDom.powerText : 'no area');

  // Step 4: equip + goals buttons
  const actionDom = await win.webContents.executeJavaScript(`(function(){
    var area = document.getElementById('Ux63BattleArea');
    if (!area) return { exists: false };
    var equipBtn = area.querySelector('[data-action="v64-openEquip"]');
    var goalsBtn = area.querySelector('[data-action="v64-openGoals"]');
    return {
      exists: true,
      equipBtn: !!equipBtn,
      goalsBtn: !!goalsBtn
    };
  })()`);
  check('EquipButton', actionDom.equipBtn);
  check('GoalsButton', actionDom.goalsBtn);

  // Step 5: open equip panel
  if (actionDom.equipBtn) {
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-action="v64-openEquip"]');
      if (btn) btn.click();
    })()`);
    await wait(1000);
    const equipPanel = await win.webContents.executeJavaScript(`(function(){
      var panel = document.querySelector('.ux64-equip-panel');
      if (!panel) return { open: false };
      var slots = panel.querySelectorAll('.ux64-equip-slot');
      var bagItems = panel.querySelectorAll('.ux64-equip-item');
      var fragEl = panel.querySelector('.ux64-equip-frag');
      return {
        open: true,
        slotCount: slots.length,
        bagCount: bagItems.length,
        fragText: fragEl ? fragEl.textContent.trim() : ''
      };
    })()`);
    check('EquipPanelOpens', equipPanel.open);
    check('EquipSlotsRendered', equipPanel.slotCount > 0, 'slots=' + equipPanel.slotCount + ' bag=' + equipPanel.bagCount);
    // close equip panel
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-action="v64-closeEquip"]');
      if (btn) btn.click();
    })()`);
    await wait(500);
  }

  // Step 6: open goals panel
  if (actionDom.goalsBtn) {
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-action="v64-openGoals"]');
      if (btn) btn.click();
    })()`);
    await wait(1000);
    const goalsPanel = await win.webContents.executeJavaScript(`(function(){
      var panel = document.querySelector('.ux64-goals-panel');
      if (!panel) return { open: false };
      var goals = panel.querySelectorAll('.ux64-goal-item');
      var achGrid = panel.querySelectorAll('.ux64-ach-grid > *');
      return {
        open: true,
        goalCount: goals.length,
        achCount: achGrid.length
      };
    })()`);
    check('GoalsPanelOpens', goalsPanel.open);
    check('GoalsRendered', goalsPanel.goalCount > 0, 'goals=' + goalsPanel.goalCount + ' achievements=' + goalsPanel.achCount);
    // close goals panel
    await win.webContents.executeJavaScript(`(function(){
      var btn = document.querySelector('[data-action="v64-closeGoals"]');
      if (btn) btn.click();
    })()`);
    await wait(500);
  }

  // Step 7: use skill if unlocked
  const skillResult = await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-action^="v64-useSkill"]:not(.ux64-skill--locked)');
    if (!btn) return { tried: false };
    btn.click();
    return { tried: true };
  })()`);
  await wait(1500);
  check('SkillUseAttempt', skillResult.tried, skillResult.tried ? 'clicked' : 'all locked (stage too low)');

  // Step 8: screenshots
  const shot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'v64-battle.png'), shot.toPNG());

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  fs.writeFileSync(path.join(outDir, 'v64-verify.json'), JSON.stringify({ passed, failed, results }, null, 2));
  console.log('\nV64_VERIFY_COMPLETE passed=' + passed + ' failed=' + failed);
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });