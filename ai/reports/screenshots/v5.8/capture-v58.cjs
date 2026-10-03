/* V5.8 真实运行时截图（§42 共 30 项）— Electron + 真实 GameFacade */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ud = path.join(__dirname, '.runtime-userdata-v58');
if (fs.existsSync(ud)) fs.rmSync(ud, { recursive: true, force: true });
app.setPath('userData', ud);
require('../../../../desktop/main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname;
app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 60 && !win; i++) { win = BrowserWindow.getAllWindows()[0] || null; if (!win) await wait(500); }
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.__GAME_FACADE__').catch(() => false)) break; await wait(500); }
  try { win.webContents.setBackgroundThrottling(false); } catch (e) {}
  win.setMinimumSize(1100, 650);
  win.setContentSize(1280, 720);
  await wait(2500);
  const run = (s) => win.webContents.executeJavaScript(s);
  const refreshUI = () => run("if(window.UiOverlay){window.UiOverlay.refresh();}");
  const redraw = async () => { await refreshUI(); await wait(800); };
  const shot = async (name) => { await wait(700); fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('V58_SHOT ' + name); };
  const drain = async (n) => {
    for (let i = 0; i < n; i++) {
      const has = await run("!!document.querySelector('#PopupLayer .ux-modal-layer')");
      if (!has) return;
      await run("(function(){ var b=document.getElementById('WelcomeContinueBtn')||document.getElementById('V2EventOk')||document.querySelector('.ux-event-option[data-vevent-choice]')||document.querySelector('.ux-dialog-actions .ux-btn')||document.querySelector('.ux-week-close')||document.querySelector('.ux-event-option[data-battle-skill]')||document.querySelector('[data-v58-offer]'); if(b) b.click(); })()");
      await wait(900);
    }
  };
  const goto = async (page) => { await run(`(function(){ if(window.UiOverlay){ window.UiOverlay.goto('${page}'); } })()`); await wait(600); };
  const nav = async (tab) => { await run(`(function(){ var el=document.querySelector('[data-nav="${tab}"]'); if(el) el.click(); })()`); await wait(600); };

  await drain(10);
  await run("(function(){ var b=document.querySelector('[data-choose-profession=\"JAVA_BACKEND\"]'); if(b) b.click(); })()");
  await wait(1200);
  await drain(6);
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.gameDay.ensureStarted(); f.context.dailyPlanner.beginWorkday(); f.context.week.beginWorkday(); f.context.professionContent.grantLevelUps(); })()");
  await redraw();

  /* 01 首页主目标 */
  await shot('01-home-goal');
  /* 02 工作中工资实时增长 */
  await run("(function(){ var f=window.__GAME_FACADE__; if (f.snapshot().workMode !== 'WORK') f.changeWorkMode('WORK'); })()");
  await wait(2000);
  await shot('02-work-salary-live');
  /* 03 任务运行时选择 */
  await run("(function(){ var f=window.__GAME_FACADE__; if (f.devAdvanceTime) f.devAdvanceTime(45*60000); })()");
  await wait(1200);
  await drain(4);
  await shot('03-task-runtime-choice');
  /* 04 项目技术债卡 */
  await nav('PROJECT');
  await redraw();
  await shot('04-project-debt');
  /* 05-29 同 V5.7 模式 + V5.8 新增 */
  await run("(function(){ var b=document.querySelector('[data-action=\"projectEntry\"]'); if(b) b.click(); })()");
  await wait(900);
  await shot('05-java-build-preset');
  await run("(function(){ var pl=document.getElementById('PopupLayer'); if(pl) pl.innerHTML=''; var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; var b=f.context.battle; if(r&&b){ r.enemies=[]; b.addEnemy(r,'boss_oom_lord'); r.enemies=r.enemies.filter(function(e){return e.tier==='BOSS';}); } })()");
  await wait(1500);
  await shot('06-boss-phase1');
  await run("(function(){ var f=window.__GAME_FACADE__; var r=f.context.player.activeBattleRun; if(r&&r.enemies[0]){ r.enemies[0].hp=Math.floor(r.enemies[0].maxHp*0.4); } })()");
  await wait(1500);
  await shot('07-boss-phase2');
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; p.bossPity=Object.assign({}, p.bossPity, {boss_oom_lord: 7}); var r=p.activeBattleRun; var b=f.context.battle; if(r&&b){ var boss=r.enemies[0]; if(boss){ boss.hp=0; b['onEnemyKilled'](r,boss,{healPerKill:0}); } r.enemies.forEach(function(e){e.hp=0;}); r.wave=r.waveTotal-1; } })()");
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.battle.tick(0.5); })()");
  await wait(800);
  await run("(function(){ if(window.UiOverlay) window.UiOverlay.showBattleOutcome(); })()");
  await wait(1000);
  await shot('08-legendary-drop');
  await drain(3);
  await shot('09-battle-summary');
  /* 10-11 晋升就绪/成功 */
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; p.cultivationExp=Math.max(p.cultivationExp, 500); })()");
  await nav('PROMOTION');
  await redraw();
  await shot('10-promotion-ready');
  /* 12 L4 职业阶段 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.player.careerLevel=4; f.context.team.ensureTeam(); })()");
  await goto('career');
  await redraw();
  await shot('12-career-stage-l4');
  /* 13 mentorship */
  await shot('13-mentorship');
  /* 14-15 team locked/manager */
  await run("(function(){ window.__GAME_FACADE__.context.player.careerLevel=6; })()");
  await goto('career');
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = b.scrollHeight; })()");
  await shot('14-team-locked-before-l7');
  await run("(function(){ window.__GAME_FACADE__.context.player.careerLevel=7; })()");
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = b.scrollHeight; })()");
  await shot('15-team-manager-l7');
  /* 16 管理层加班抉择（同屏） */
  await shot('16-manager-overtime-choice');
  /* 17 公司档案 */
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = 0; })()");
  await shot('17-company-profile');
  /* 18 Offer 抉择 */
  await run("(function(){ var f=window.__GAME_FACADE__; var p=f.context.player; (p).pendingOffer={offerId:'offer_cap',dayIndex:p.gameDay.dayIndex,expiresAtDay:p.gameDay.dayIndex+3,companyId:'COMP_BIGTECH',companyName:'大厂宗',salaryDeltaPct:35,overtimeDeltaPct:35,incidentDeltaPct:40,promotionDeltaPct:15,lootDeltaPct:10,pitch:'「这个项目非常有战略价值。」翻译：今晚别走。但钱是真的多。'}; })()");
  await redraw();
  await run("(function(){ if(window.UiOverlay){ var ev=new CustomEvent('x'); window.UiOverlay.showBattleOutcome && window.UiOverlay.showBattleOutcome(); } })()");
  await wait(500);
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.events.emit('offerReceived', {offerId:'offer_cap', companyName:'大厂宗', salaryDeltaPct:35}); })()");
  await wait(1200);
  await shot('18-offer-choice');
  await drain(2);
  /* 19-20 burnout 风险/恢复 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.player.mind=12; f.context.player.innerDemon=88; })()");
  await nav('HOME');
  await redraw();
  await shot('19-burnout-risk');
  await run("(function(){ var f=window.__GAME_FACADE__; f.takeHalfDayOff(); })()");
  await goto('profession');
  await redraw();
  await shot('20-burnout-recovery');
  /* 21-22 下班/17:55 */
  await nav('HOME');
  await run("(function(){ var f=window.__GAME_FACADE__; if (f.devJumpToHour) f.devJumpToHour(18,0); })()");
  await wait(1500);
  await drain(3);
  await shot('21-off-work-1800');
  await run("(function(){ var f=window.__GAME_FACADE__; if (f.devJumpToHour) f.devJumpToHour(17,55); })()");
  await wait(1200);
  await drain(3);
  await shot('22-friday-1755');
  /* 23 周报 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.events.emit('weekSettlementReady', { weekIndex: 1 }); })()");
  await wait(1500);
  await shot('23-weekly-report');
  await run("(function(){ var b=document.querySelector('[data-v57-close-weekly]'); if(b) b.click(); })()");
  /* 24 月报 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.meta.accumulateMonth({ workDays: 22, ontimeDays: 18, overtimeMinutes: 2400, salaryEarned: 3600, tasksDone: 42, projectsDone: 3, bossesKilled: 24, incidents: 4, blamesTaken: 3, blamesReturned: 2, helpsGiven: 8 }); })()");
  await goto('career');
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = 400; })()");
  await shot('24-monthly-report');
  /* 25 项目回归 */
  await run("(function(){ var f=window.__GAME_FACADE__; var pr=f.context.projectService.ensureProject(); pr.techDebt=82; f.context.projectHistory.archiveFromCurrent('延期上线'); })()");
  await nav('PROJECT');
  await redraw();
  await shot('25-project-return');
  /* 26 NPC 记忆 */
  await run("(function(){ var f=window.__GAME_FACADE__; var m=f.context.npcMemory; m.remember('TESTER','DEFENDED_ME','这次 P0 她先帮你复现了'); m.remember('VETERAN','STOLE_MY_CREDIT','他上周抢了你一次功劳'); })()");
  await goto('npc');
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = b.scrollHeight; })()");
  await shot('26-npc-memory');
  /* 27 生涯档案 */
  await goto('career');
  await redraw();
  await shot('27-career-journey');
  /* 28 图鉴 Boss */
  await goto('codex');
  await run("(function(){ var t=document.querySelector('[data-codex-tab=\"BOSS\"]'); if(t) t.click(); })()");
  await redraw();
  await shot('28-codex-boss');
  /* 29 Build Preset */
  await run("(function(){ var f=window.__GAME_FACADE__; f.saveBuildPreset(0, 'JVM爆发流'); })()");
  await goto('profession');
  await redraw();
  await run("(function(){ var b=document.getElementById('UiBody'); if(b) b.scrollTop = 600; })()");
  await shot('29-build-preset');
  /* 30 Day30 目标 */
  await run("(function(){ var f=window.__GAME_FACADE__; f.context.player.gameDay = Object.assign({}, f.context.player.gameDay, {dayIndex: 30}); f.context.meta.checkMilestones(); })()");
  await nav('HOME');
  await redraw();
  await shot('30-day30-goals');

  console.log('V58_CAPTURE_DONE');
  app.exit(0);
}).catch(e => { console.error('CAPTURE_FAILED', e && e.message); app.exit(1); });
