// Isolated UI repair capture. It loads only the overlay source and an in-memory facade.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.join(__dirname, '..');
const out = path.join(root, 'ai', 'reports', 'screenshots', 'ui-repair');
const css = fs.readFileSync(path.join(__dirname, 'ui-overlay.css'), 'utf8');
const overlay = fs.readFileSync(path.join(__dirname, 'ui-overlay.js'), 'utf8');

const facadeScript = `window.V2UI={init:function(h){this.h=h;},situationHtml:function(){return '';},promotionPageHtml:function(){return '';},messengerIncidentBannerHtml:function(){return '';},maybeShowV2EventModal:function(){},maybeShowWeekendModal:function(){},maybeShowSettlementModal:function(){},showDefenseModal:function(){}};
window.__GAME_FACADE__={
 snapshot:function(){return {careerLevel:2,salary:520,performance:72,cultivationExp:166,spiritStones:42,mind:86,maxMind:100,workMode:'WORK',isFishingMode:false,salaryEfficiency:1,cultivationEfficiency:1};},
 queryCareer:function(){return {name:'筑基牛马',realm:'筑基一层',requiredExp:400};},querySect:function(){return {id:'sect',name:'摸鱼宗'};},queryKpi:function(){return {items:[]};},isProfessionSelected:function(){return true;},
 queryWorkToday:function(){return {countdownMs:300000,standardWorkSeconds:28500,overtimeSeconds:0,freeOvertimeSeconds:0,paidFishingSalary:0,timeline:[]};},queryOvertime:function(){return null;},queryOvertimeStatus:function(){return {status:'NONE'};},
 queryGameClock:function(){return {hour:16,minute:20,weekday:2,isWeekend:false,isWorkingHours:true};},queryGameDay:function(){return {dayIndex:2,income:{salary:520},settlementInputs:{paidFishingSalary:0}};},queryCanSettleDay:function(){return false;},queryRates:function(){return {salaryPerMin:1.2,cultivationPerMin:.4,mindPerMin:.1};},
 queryTodayCapacity:function(){return {remainingWorkMinutes:95,remainingPlanMinutes:20,projectedOffWorkTime:'18:00',overload:true,advice:'建议砍掉一项低优先级需求'};},queryCompany:function(){return {id:'big',name:'大厂卷王',desc:'事故多，工资高',salaryMultiplier:1.35};},queryTodaySituation:function(){return {name:'需求暴涨',desc:'需求如潮'};},queryDailySituation:function(){return {company:{name:'需求暴涨',description:'需求如潮'},boss:{name:'老板盯梢',description:'在线'},project:{name:'项目延期',description:'延期'},personal:{name:'道心波动',description:'波动'}};},
 queryFatigueView:function(){return {value:72,band:'HEAVY',bandName:'疲劳偏高',advice:'建议休息'};},queryBurnout:function(){return {state:'STRESSED',score:61,stateName:'压力上升',advice:'注意休息'};},queryNowGoal:function(){return {id:'goal-now'};},queryGoals:function(){return [{action:'none',icon:'🧭',text:'按计划推进',sub:'保持节奏',btn:'脚踏实地'}];},queryTomorrowHook:function(){return '明天有评审';},
 queryIncidentState:function(){return {active:null,recent:[],risk:0};},queryOfflineDecisions:function(){return {session:null,current:null,items:[],overflowSummary:null};},queryV2CurrentEvent:function(){return null;},queryCurrentEvent:function(){return null;},queryBattle:function(){return null;},queryFinishedBattle:function(){return null;},queryNextPresentation:function(){return null;},queryAssignedTasks:function(){return {top:[],all:[],openCount:0};},queryMessengerBadge:function(){return {totalUnread:0,hasCritical:false};},queryConversations:function(){return [];}
};`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const specs = [{ name: '1280x720', width: 1280, height: 720 }, { name: '1600x900', width: 1600, height: 900 }, { name: '1600x480', width: 1600, height: 480 }];
  for (const spec of specs) {
    const win = new BrowserWindow({ width: spec.width, height: spec.height, useContentSize: true, show: false, webPreferences: { contextIsolation: false, sandbox: false, nodeIntegration: true } });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body><div id="UiOverlay"></div><script>' + facadeScript + '</script></body></html>')}`);
    await win.webContents.executeJavaScript(`(0,eval)(${JSON.stringify(overlay)})`);
    await wait(650);
    fs.writeFileSync(path.join(out, spec.name + '.png'), (await win.webContents.capturePage()).toPNG());
    console.log('captured ' + spec.name);
    win.destroy();
    await wait(250);
  }
  app.exit(0);
}).catch((error) => { console.error('UI_REPAIR_CAPTURE_FAILED ' + (error && error.stack || error)); app.exit(1); });
