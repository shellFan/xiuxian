// Debug: testBuffInCoreCalculationChain 中间值打印
const ROOT = 'd:/git/fan/xiuxian/tests/.compiled';
const { FakeClock } = require(ROOT + '/assets/scripts/core/clock');
const { SequenceRandomProvider } = require(ROOT + '/assets/scripts/core/random-provider');
const { GameContext } = require(ROOT + '/assets/scripts/core/game-context');
const { PlayerData } = require(ROOT + '/assets/scripts/model/player-data');
const { WorkerEntity } = require(ROOT + '/assets/scripts/model/worker-entity');
const { MemoryStorageAdapter } = require(ROOT + '/assets/scripts/services/storage-adapter');
const { GameLoopService } = require(ROOT + '/assets/scripts/services/game-loop-service');

const clock = new FakeClock(1_000);
const random = new SequenceRandomProvider([0.0]);
const player = new PlayerData({ mind: 100, maxMind: 200, workMode: 'WORK' });
const storage = new MemoryStorageAdapter();
const context = new GameContext({ player, storage, clock, careerEventClock: clock, randomProvider: random });
context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
const loop = new GameLoopService(context, { autoSaveIntervalSeconds: 0 });

console.log('=== 初始状态 ===');
console.log('salary:', player.salary, 'mind:', player.mind, 'careerLevel:', player.careerLevel);
console.log('salaryPerHour rates:', context.work.salaryPerHour || '(private)');

loop.start();

// 第一个 tick(3600)
loop.tick(3600);
const baselineSalary = player.salary;
console.log('\n=== 第一个 tick(3600) 后 ===');
console.log('baselineSalary:', baselineSalary);
console.log('mind:', player.mind);
console.log('salaryRemainder:', player.salaryRemainder);
console.log('buffs.gameSeconds:', context.buffs.getGameSeconds());

// 加 buff
const buffId = context.buffs.addBuff('WORK_SALARY_BOOST', 2.0, 7200);
console.log('\n=== addBuff 后 ===');
console.log('buffId:', buffId, 'multiplier:', context.buffs.getMultiplier('WORK_SALARY_BOOST'));

// 第二个 tick(3600)
loop.tick(3600);
const buffedSalary = player.salary;
console.log('\n=== 第二个 tick(3600) 后 ===');
console.log('buffedSalary:', buffedSalary);
console.log('增量:', buffedSalary - baselineSalary);
console.log('mind:', player.mind);
console.log('salaryRemainder:', player.salaryRemainder);
console.log('buffs.gameSeconds:', context.buffs.getGameSeconds());
console.log('buff still active?', context.buffs.hasBuff('WORK_SALARY_BOOST'));
console.log('activeBuffs:', JSON.stringify(context.buffs.getActiveBuffs()));

console.log('\n断言: buffed(' + buffedSalary + ') > baseline(' + baselineSalary + ') * 1.5 =', baselineSalary * 1.5, '→', buffedSalary > baselineSalary * 1.5);