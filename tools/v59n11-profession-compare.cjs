'use strict';
// V5.9-N.11 四职业差异化对照:同 seed 同流程 30 日,输出各职业成长/经济/战斗画像
process.env.TZ = 'Asia/Shanghai';
const { FakeClock } = require('../tests/.compiled/assets/scripts/core/clock');
const { GameFacade } = require('../tests/.compiled/assets/scripts/facade/game-facade');
const { PlayerData } = require('../tests/.compiled/assets/scripts/model/player-data');
const { MemoryStorageAdapter } = require('../tests/.compiled/assets/scripts/services/storage-adapter');
const { RandomService, mulberry32 } = require('../tests/.compiled/assets/scripts/v2/random-service');

const MINUTE = 60_000;
const START = Date.parse('2026-09-21T09:00:00+08:00');
const TICK_MIN = 20;
const DAYS = Number(process.argv[2] || 30);
const SEED = Number(process.argv[3] || 777);
const WORKSHARE = 0.8;

function runProfession(professionId, days, seed) {
  const clock = new FakeClock(START);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
    modeSwitchCooldownMs: 0, tickIntervalSeconds: 1800,
  });
  facade.context.saveService.save = function () {};
  facade.context.saveService.autoSave = function () {};
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession(professionId);
  facade.gameLoop.start();
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  facade.context.week.beginWorkday();
  const p = () => facade.context.player;
  const M = { profession: professionId, salaryEnd: 0, careerLevel: 1, profLevel: 1, cultivation: 0, performance: 0, materials: 0, evidence: 0, battles: 0, victories: 0, debts: 0, profActions: 0, debtMax: 0 };

  for (let day = 0; day < days; day++) {
    facade.context.gameDay.ensureStarted();
    facade.context.dailyPlanner.beginWorkday();
    facade.context.week.beginWorkday();
    for (let m = 545; m <= 1260; m += TICK_MIN) {
      clock.advance(TICK_MIN * MINUTE);
      try { facade.gameLoop.tick(TICK_MIN * 60); } catch (e) {}
      const hod = Math.floor(m / 60);
      const inWork = (hod >= 9 && hod < 12) || (hod >= 13 && hod < 18);
      const wantWork = inWork && ((m % 60) / 60) < WORKSHARE;
      try { if (p().workMode !== (wantWork ? 'WORK' : 'FISHING')) facade.context.work.setMode(wantWork ? 'WORK' : 'FISHING'); } catch (e) {}
      for (const msg of facade.context.messenger.pendingReplies().slice(0, 2)) {
        const o = msg.replyOptions || [];
        if (o.length) try { facade.replyToMessage(msg.id, o[0].id); } catch (e) {}
      }
      try {
        const evt = facade.queryV2CurrentEvent();
        if (evt) {
          const ch = facade.queryV2CurrentChoices();
          if (ch.length) facade.resolveV2Event(ch[0].id); else facade.resolveV2Event(null);
        }
      } catch (e) {}
      // 战斗:14 点开一场,选第一个选项
      try {
        if (facade.queryFinishedBattle()) facade.clearFinishedBattle();
        if (hod === 14 && m % 15 === 0 && !facade.queryBattle() && !p().activeBattleRun) {
          const builds = facade.queryBattleBuildOptions();
          if (builds.length) { facade.startBattleRun('PROJECT', builds[0].id); M.battles += 1; }
        }
        const run = facade.queryBattle();
        if (run && run.skillOffers) facade.chooseBattleSkill(run.skillOffers[0]);
      } catch (e) {}
      // 职业专属行动:每日可用即执行(每日 2 次)
      try {
        const pa = facade.context.professionAction.query();
        if (pa.available && facade.context.clockV2.isWorkingHours()) facade.context.professionAction.perform();
      } catch (e) {}
    }
    try { facade.context.daySettlement.settle(); } catch (e) {}
    const now = new Date(clock.now());
    const nx = new Date(now);
    nx.setDate(nx.getDate() + 1); nx.setHours(9, 0, 0, 0);
    clock.advance(nx.getTime() - clock.now());
  }
  const pl = p();
  M.salaryEnd = pl.salary;
  M.careerLevel = pl.careerLevel;
  M.profLevel = facade.context.professionContent.level();
  M.cultivation = pl.cultivationExp;
  M.performance = pl.performance;
  M.materials = Object.values(pl.materials).reduce((a, b) => a + b, 0);
  M.evidence = facade.context.evidence.all().length;
  const finished = facade.queryFinishedBattle();
  if (finished && finished.status === 'VICTORY') M.victories += 1;
  M.debtMax = Math.max(...Object.values(facade.context.techDebt.all()), 0);
  facade.destroy();
  return M;
}

const PROFS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'];
console.log(`=== 四职业对照 ${DAYS} 日 seed=${SEED} workShare=${WORKSHARE} ===`);
console.log('职业 | 工资终值 | 职级 | 职业级 | 修为 | 绩效 | 材料 | 证据 | 战斗 | 胜 | 债峰');
const rows = PROFS.map((prof) => runProfession(prof, DAYS, SEED));
for (const r of rows) {
  console.log(`${r.profession} | ¥${r.salaryEnd} | L${r.careerLevel} | P${r.profLevel} | ${r.cultivation} | ${r.performance} | ${r.materials} | ${r.evidence} | ${r.battles} | ${r.victories} | ${r.debtMax}`);
}
// 差异化断言摘要
const byProf = Object.fromEntries(rows.map((r) => [r.profession, r]));
const notes = [];
if (byProf.FRONTEND.performance > byProf.JAVA_BACKEND.performance) notes.push('FRONTEND 绩效领先(POLISH_UX+6/次)✓');
if (byProf.JAVA_BACKEND.materials > byProf.FRONTEND.materials) notes.push('JAVA 材料领先(REFACTOR+2/次)✓');
if (byProf.QA.evidence >= 3 && byProf.QA.evidence >= byProf.DEVOPS.evidence) notes.push('QA 证据领先(HUNT+1/次)✓');
if (byProf.JAVA_BACKEND.cultivation > byProf.QA.cultivation) notes.push('JAVA 修为领先(REFACTOR+18/次)✓');
console.log('\n差异化结论:', notes.length ? notes.join(' | ') : '(无显著差异——需检查数值)');
