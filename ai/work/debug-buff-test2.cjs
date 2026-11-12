// Debug2: 分离 work.tick vs v2Economy 的工资贡献
const ROOT = 'd:/git/fan/xiuxian/tests/.compiled';
const { FakeClock } = require(ROOT + '/assets/scripts/core/clock');
const { SequenceRandomProvider } = require(ROOT + '/assets/scripts/core/random-provider');
const { GameContext } = require(ROOT + '/assets/scripts/core/game-context');
const { PlayerData } = require(ROOT + '/assets/scripts/model/player-data');
const { WorkerEntity } = require(ROOT + '/assets/scripts/model/worker-entity');
const { MemoryStorageAdapter } = require(ROOT + '/assets/scripts/services/storage-adapter');

function setup() {
  const clock = new FakeClock(1_000);
  const random = new SequenceRandomProvider([0.0]);
  const player = new PlayerData({ mind: 100, maxMind: 200, workMode: 'WORK' });
  const context = new GameContext({ player, storage: new MemoryStorageAdapter(), clock, careerEventClock: clock, randomProvider: random });
  context.board.place(WorkerEntity.create(1), { row: 0, column: 0 });
  return context;
}

// 实验1: 只跑 work.tick（不经过 GameLoop）
console.log('=== 实验1: 纯 work.tick × 3600 (1步=1秒) ===');
{
  const ctx = setup();
  let totalWorkSalary = 0;
  for (let i = 0; i < 3600; i++) {
    const r = ctx.work.tick(1);
    totalWorkSalary += r.salary;
  }
  console.log('work.tick 总工资:', totalWorkSalary, ' player.salary:', ctx.player.salary);
}

// 实验2: 只跑 v2Economy.tick
console.log('\n=== 实验2: 纯 v2Economy.tick × 3600 ===');
{
  const ctx = setup();
  for (let i = 0; i < 3600; i++) {
    try { ctx.v2Economy.tick(1); } catch (e) { console.log('v2Economy error at', i, e.message); break; }
  }
  console.log('v2Economy 后 player.salary:', ctx.player.salary);
}

// 实验3: GameLoop完整跑，但监听 salaryChanged 事件
console.log('\n=== 实验3: GameLoop + salaryChanged 事件追踪 ===');
{
  const ctx = setup();
  const { GameLoopService } = require(ROOT + '/assets/scripts/services/game-loop-service');
  const loop = new GameLoopService(ctx, { autoSaveIntervalSeconds: 0 });
  let workSalaryTotal = 0;
  ctx.events.on('playerChanged', (e) => {
    if (e.reason === 'workTick') workSalaryTotal++;
  });
  loop.start();
  loop.tick(3600);
  console.log('loop.tick(3600) 后 salary:', ctx.player.salary, 'workTick事件数:', workSalaryTotal);

  // 加buff再跑
  ctx.buffs.addBuff('WORK_SALARY_BOOST', 2.0, 7200);
  const before = ctx.player.salary;
  loop.tick(3600);
  console.log('第二小时增量:', ctx.player.salary - before, ' salary:', ctx.player.salary);
}