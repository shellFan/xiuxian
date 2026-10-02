/* V5.7 真实运行时截图（§150 共 28 项）— Electron + 真实 GameFacade */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ud = path.join(__dirname, '.runtime-userdata-v57');
if (fs.existsSync(ud)) fs.rmSync(ud, { recursive: true, force: true });
app.setPath('userData', ud);
require('../../../../desktop/main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname;
app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 60 && !win; i++) { win = BrowserWindow.getAllWindows()[0] || null; if (!win) await wait(500); }
  for (let i = 0; i < 120; i++) {
    if (await win.webContents.executeJavaScript('!!window.__GAME_FACADE__').catch(() => false)) break;
    await wait(500);
  }
  try { win.webContents.setBackgroundThrottling(false); } catch (e) {}
  win.setMinimumSize(1100, 650);
  win.setContentSize(1280, 720);
  await wait(2500);
  const run = (s) => win.webContents.executeJavaScript(s);
  const refreshUI = () => run("if(window.UiOverlay){window.UiOverlay.refresh();}");
  const redraw = async () => { await refreshUI(); await wait(900); };
  const shot = async (name) => { await wait(700); fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('V57_SHOT ' + name); };
  const drain = async (n) => {
    for (let i = 0; i < n; i++) {
      const has = await run("!!document.querySelector('#PopupLayer .ux-modal-layer')");
      if (!has) return;
      await run("(function(){ var b=document.getElementById('WelcomeContinueBtn')||document.getElementById('V2EventOk')||document.querySelector('.ux-event-option[data-vevent-choice]')||document.querySelector('.ux-dialog-actions .ux-btn')||document.querySelector('.ux-week-close')||document.querySelector('.ux-event-option[data-battle-skill]'); if(b) b.click(); })()");
      await wait(900);
    }
  };
  const goto = async (page) => { await run(`(function(){ if(window.UiOverlay){ window.UiOverlay.goto('${page}'); } })()`); await wait(600); };
  const nav = async (tab) => { await run(`(function(){ var el=document.querySelector('[data-nav="${tab}"]'); if(el) el.click(); })()`); await wait(600); };
  const setProf = async (pid) => { await run(`(function(){ window.__GAME_FACADE__.context.player.profession='${pid}'; })()`); await refreshUI(); await wait(250); };

  await drain(10);
  await run("(function(){ var b=document.querySelector('[data-choose-profession=\"JAVA_BACKEND\"]'); if(b) b.click(); })()");
  await wait(1200);
  await drain(6);
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.gameDay.ensureStarted(); f.context.dailyPlanner.beginWorkday(); f.context.week.beginWorkday(); })()");
  await redraw();

  /* 01-04 职业页 ×4 */
  for (const [idx, pid] of [['01', 'JAVA_BACKEND'], ['02', 'FRONTEND'], ['03', 'QA'], ['04', 'DEVOPS']]) {
    await setProf(pid);
    await goto('profession');
    await redraw();
    await shot(idx + '-' + pid.toLowerCase().replace('_', '-') + '-profession');
  }
  await setProf('JAVA_BACKEND');

  /* 05-06 Build 选择弹窗 */
  await nav('PROJECT');
  await redraw();
  await run("(function(){ var b=document.querySelector('[data-action=\"projectEntry\"]'); if(b) b.click(); })()");
  await wait(900);
  await shot('05-java-build');
  await drain(2);
  await setProf('FRONTEND');
  await run("(function(){ var b=document.querySelector('[data-action=\"projectEntry\"]'); if(b) b.click(); })()");
  await wait(900);
  await shot('06-frontend-build');
  await drain(2);
  await setProf('JAVA_BACKEND');

  /* 07 技能进化二选一：强制 GC Lv2 → prepareSkillOffers → dispatch（重试） */
  await run("(function(){ var f=window.__GAME_FACADE__; var builds=f.queryBattleBuildOptions(); var b=builds.filter(function(x){return x.id==='build_jvm';})[0]||builds[0]; f.startBattleRun('PROJECT', b.id); var r=f.context.player.activeBattleRun; if(r){ r.skillLevels=Object.assign({}, r.skillLevels); r.skillLevels['skill_gc']=2; try { f.context.battle['prepareSkillOffers'](r); } catch(e){} } })()");
  await nav('PROJECT');
  let gotEvo = false;
  for (let i = 0; i < 6 && !gotEvo; i++) {
    await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; if(r&&!(r.skillOffers&&r.skillOffers.length)){ try { f.context.battle['prepareSkillOffers'](r); } catch(e){} } })()");
    await refreshUI();
    await run("(function(){ if(window.UiOverlay) window.UiOverlay.dispatchNextModal(); })()");
    await wait(800);
    gotEvo = await run("(function(){ var m=document.querySelector('#PopupLayer .ux-modal-layer'); return !!(m && m.querySelector('.ux-event-option[data-battle-skill]')); })()");
  }
  if (gotEvo) { await wait(400); await shot('07-skill-evolution'); await run("(function(){ var b=document.querySelector('.ux-event-option[data-battle-skill]'); if(b) b.click(); })()"); }
  else console.log('MANUAL_REQUIRED 07-skill-evolution');
  await drain(2);

  /* 08 道法共鸣激活（战斗页 chip） */
  await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; var b=f.context.battle; if(r&&b){ if(r.skills.indexOf('skill_thread_pool')<0) r.skills.push('skill_thread_pool'); try { b['evaluateSynergies'](r); } catch(e){} } })()");
  await redraw();
  await shot('08-synergy-active');

  /* 09-11 Boss 战 + 预警 */
  await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; var b=f.context.battle; if(r&&b){ r.enemies=[]; b.addEnemy(r,'boss_oom_lord'); r.log.push('⚠️ 堆内存即将耗尽……'); } })()");
  await redraw();
  await shot('09-java-boss');
  await setProf('FRONTEND');
  await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; var b=f.context.battle; if(r&&b){ r.enemies=[]; b.addEnemy(r,'boss_white_screen'); r.log.push('⚠️ 页面即将白屏！'); } })()");
  await redraw();
  await shot('10-frontend-boss');
  await setProf('JAVA_BACKEND');
  await shot('11-boss-warning');

  /* 12 Boss 专属掉落（保底）→ 胜利结算 → 13 对比 */
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; var r=p.activeBattleRun; var b=f.context.battle; if(r&&b){ r.enemies=[]; b.addEnemy(r,'boss_oom_lord'); r.enemies=r.enemies.filter(function(e){return e.tier==='BOSS';}); p.bossPity=Object.assign({}, p.bossPity, {boss_oom_lord: 7}); var boss=r.enemies[0]; if(boss){ boss.hp=0; b['onEnemyKilled'](r,boss,{healPerKill:0}); } } })()");
  await wait(800);
  const hasDrop = await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; return !!(r && r.bossDrops && r.bossDrops.length); })()");
  if (hasDrop) {
    await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; if(r){ r.enemies.forEach(function(e){e.hp=0;}); r.wave=r.waveTotal-1; } })()");
    await run("(function(){ var f=window.__GAME_FACADE__; f.context.battle.tick(0.5); })()");
    await redraw();
    await run("(function(){ if(window.UiOverlay) window.UiOverlay.dispatchNextModal(); })()");
    await wait(1000);
    await shot('12-boss-loot');
    await drain(3);
    await shot('13-equipment-compare');
    await drain(4);
  } else {
    console.log('MANUAL_REQUIRED 12-boss-loot / 13-equipment-compare');
    await drain(4);
  }

  /* 14 套装 + 15 图鉴 */
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; ['eq_jvm_tome','eq_gc_chronicle','eq_concurrent_bracer','eq_heap_amulet'].forEach(function(id){ if(p.ownedEquipment.indexOf(id)<0) p.ownedEquipment.push(id); }); })()");
  await goto('codex');
  await run("(function(){ var t=document.querySelector('[data-codex-tab=\"EQUIPMENT\"]'); if(t) t.click(); })()");
  await redraw();
  await shot('14-equipment-set');
  await run("(function(){ var t=document.querySelector('[data-codex-tab=\"BOSS\"]'); if(t) t.click(); })()");
  await redraw();
  await shot('15-codex');

  /* 16 NPC 记忆 */
  await run("(function(){ var f=window.__GAME_FACADE__; var m=f.context.npcMemory; m.remember('VETERAN','HELPED_ME','你周二帮他解决了线上问题'); m.remember('VETERAN','STOLE_MY_CREDIT','他周三抢了你一次功劳'); })()");
  await goto('npc');
  await redraw();
  await shot('16-npc-memory');

  /* 17-21 第一周剧情（注册池事件按 id 投递） */
  const weekShot = async (stepId, shotName, conv) => {
    await run(`(function(){ var f=window.__GAME_FACADE__; f.devDeliverMessengerEvent('fw57_${stepId}'); })()`);
    await wait(600);
    await run(`(function(){ window.UiOverlay.openMessenger('${conv}'); })()`);
    await wait(900);
    await shot(shotName);
    await nav('HOME');
  };
  await weekShot('w1m_intro', '17-monday-story', 'conv_boss');
  await weekShot('w1w_req', '18-wednesday-requirement', 'conv_product');
  await weekShot('w1th_alarm', '19-thursday-incident', 'conv_incident');
  await run("(function(){ var f=window.__GAME_FACADE__; if (f.devJumpToHour) f.devJumpToHour(17,55); })()");
  await wait(1500);
  await drain(4);
  await weekShot('w1f_typing', '20-friday-1755', 'conv_boss');
  await weekShot('w1sa_call', '21-weekend-message', 'conv_boss');

  /* 22 周结算 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.events.emit('weekSettlementReady', { weekIndex: 1 }); })()");
  await wait(1600);
  await shot('22-weekly-settlement');
  await run("(function(){ var b=document.querySelector('[data-v57-close-weekly]'); if(b) b.click(); })()");
  await wait(400);

  /* 23-24 项目历史（两份档案，24 含祖传回归） */
  await run("(function(){ var f=window.__GAME_FACADE__; var pr=f.context.projectService.ensureProject(); pr.techDebt=82; pr.requirementChanges=3; f.context.projectHistory.archiveFromCurrent('正常上线'); })()");
  await nav('PROJECT');
  await redraw();
  await shot('23-project-history');
  await run("(function(){ var f=window.__GAME_FACADE__; var h=f.context.player.projectHistory||[]; if(h.length){ var clone=JSON.parse(JSON.stringify(h[h.length-1])); clone.id=clone.id+'_legacy'; clone.name='祖传后台系统'; clone.techDebt=95; clone.ending='延期上线'; h.push(clone); f.context.player.projectHistory=h; } })()");
  await redraw();
  await shot('24-returning-project');

  /* 25 隐藏事件 */
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; p.lifetimeStats=Object.assign({}, p.lifetimeStats, {ontimeStreak: 5}); f.context.week.checkSecretEvents(Date.now()); })()");
  await goto('codex');
  await run("(function(){ var t=document.querySelector('[data-codex-tab=\"EVENT\"]'); if(t) t.click(); })()");
  await redraw();
  await shot('25-secret-event');

  /* 26 疲劳 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.player.fatigue=85; })()");
  await nav('HOME');
  await redraw();
  await shot('26-fatigue');

  /* 27 周目标 */
  await goto('profession');
  await redraw();
  await shot('27-weekly-goal');

  /* 28 明日钩子 */
  await nav('HOME');
  await redraw();
  await shot('28-day2-hook');

  console.log('V57_CAPTURE_DONE');
  app.exit(0);
}).catch(e => { console.error('CAPTURE_FAILED', e && e.message); app.exit(1); });
