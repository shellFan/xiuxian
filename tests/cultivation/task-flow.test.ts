/**
 * Task Flow Test — Core Gameplay Fix
 *
 * Tests the new task system:
 *   - Start task with cooldown/duration
 *   - Max 3 concurrent tasks
 *   - Tick marks tasks as completed when duration elapses
 *   - Claim completed task rewards (salary, cultivation, spiritStones)
 *   - Mind efficiency modifies cultivation rewards on claim
 *   - Cannot claim incomplete or already-claimed tasks
 *   - Cannot start duplicate tasks
 *   - Cleanup claimed tasks
 *   - Events: taskStarted, taskCompleted, taskClaimed, spiritStonesChanged
 */
import assert from 'node:assert/strict';

import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { TaskService, type TaskConfig } from '../../assets/scripts/services/task-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TASKS: readonly TaskConfig[] = [
  { id: 'test_daily', type: 'DAILY', name: '测试日常', description: '测试日常任务', durationSeconds: 10, rewardSalary: 50, rewardCultivation: 20, rewardSpiritStones: 5 },
  { id: 'test_work', type: 'WORK', name: '测试工作', description: '测试工作任务', durationSeconds: 15, rewardSalary: 80, rewardCultivation: 10, rewardSpiritStones: 3 },
  { id: 'test_cultivation', type: 'CULTIVATION', name: '测试修炼', description: '测试修炼任务', durationSeconds: 20, rewardSalary: 0, rewardCultivation: 50, rewardSpiritStones: 8 },
  { id: 'test_event', type: 'EVENT', name: '测试事件', description: '测试事件任务', durationSeconds: 5, rewardSalary: 30, rewardCultivation: 15, rewardSpiritStones: 2 },
];

function makeContext(clock?: FakeClock, playerOverrides?: Partial<ConstructorParameters<typeof PlayerData>[0]>) {
  const c = clock ?? new FakeClock(10_000);
  const player = new PlayerData({ mind: 100, maxMind: 100, ...playerOverrides });
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ player, storage, clock: c });
  const tasks = new TaskService(context, { clock: c, tasks: TEST_TASKS });
  return { context, clock: c, player, tasks };
}

// ── Test 1: Start a task successfully ────────────────────────────────────────

function testStartTaskSuccessfully(): void {
  const { tasks } = makeContext();

  const result = tasks.startTask('test_daily');
  assert.equal(result.success, true, 'start should succeed');
  assert.ok(result.task, 'should return task state');
  assert.equal(result.task!.taskId, 'test_daily', 'task ID should match');
  assert.equal(result.task!.taskType, 'DAILY', 'task type should be DAILY');
  assert.equal(result.task!.durationSeconds, 10, 'duration should be 10s');
  assert.equal(result.task!.completed, false, 'should not be completed yet');
  assert.equal(result.task!.claimed, false, 'should not be claimed yet');

  console.log('  ✓ start task successfully');
}

// ── Test 2: Cannot start unknown task ────────────────────────────────────────

function testCannotStartUnknownTask(): void {
  const { tasks } = makeContext();

  const result = tasks.startTask('nonexistent');
  assert.equal(result.success, false, 'should fail for unknown task');
  assert.ok(result.reason, 'should provide reason');

  console.log('  ✓ cannot start unknown task');
}

// ── Test 3: Cannot start duplicate task ──────────────────────────────────────

function testCannotStartDuplicateTask(): void {
  const { tasks } = makeContext();

  tasks.startTask('test_daily');
  const result = tasks.startTask('test_daily');
  assert.equal(result.success, false, 'should fail for duplicate task');

  console.log('  ✓ cannot start duplicate task');
}

// ── Test 4: Max 3 concurrent tasks ───────────────────────────────────────────

function testMaxThreeConcurrentTasks(): void {
  const { tasks } = makeContext();

  tasks.startTask('test_daily');
  tasks.startTask('test_work');
  tasks.startTask('test_cultivation');

  const result = tasks.startTask('test_event');
  assert.equal(result.success, false, 'should fail when 3 tasks already active');
  assert.ok(result.reason?.includes('满'), 'reason should mention full');

  console.log('  ✓ max 3 concurrent tasks enforced');
}

// ── Test 5: Tick marks tasks as completed when duration elapses ──────────────

function testTickCompletesTasks(): void {
  const clock = new FakeClock(10_000);
  const { tasks } = makeContext(clock);

  tasks.startTask('test_event'); // 5s duration
  const tick1 = tasks.tick();
  assert.equal(tick1.completedTaskIds.length, 0, 'not completed immediately');

  clock.advance(5_000);
  const tick2 = tasks.tick();
  assert.equal(tick2.completedTaskIds.length, 1, 'completed after duration');
  assert.equal(tick2.completedTaskIds[0], 'test_event', 'completed task ID matches');

  console.log('  ✓ tick marks tasks as completed when duration elapses');
}

// ── Test 6: Cannot claim incomplete task ─────────────────────────────────────

function testCannotClaimIncompleteTask(): void {
  const { tasks } = makeContext();

  tasks.startTask('test_daily'); // 10s duration
  const result = tasks.claimTask('test_daily');
  assert.equal(result.success, false, 'should fail for incomplete task');
  assert.ok(result.reason?.includes('未完成'), 'reason should mention not completed');

  console.log('  ✓ cannot claim incomplete task');
}

// ── Test 7: Claim completed task grants rewards ──────────────────────────────

function testClaimCompletedTaskGrantsRewards(): void {
  const clock = new FakeClock(10_000);
  const { context, tasks } = makeContext(clock);

  tasks.startTask('test_daily'); // salary:50, cultivation:20, spiritStones:5
  clock.advance(10_000);
  tasks.tick();

  const salaryBefore = context.player.salary;
  const expBefore = context.player.cultivationExp;
  const stonesBefore = context.player.spiritStones;

  const result = tasks.claimTask('test_daily');
  assert.equal(result.success, true, 'claim should succeed');
  assert.equal(result.salary, 50, 'salary reward should be 50');
  assert.equal(result.cultivationExp, 20, 'cultivation reward should be 20 (mind=100 → efficiency=1.0)');
  assert.equal(result.spiritStones, 5, 'spirit stones reward should be 5');

  assert.equal(context.player.salary, salaryBefore + 50, 'player salary should increase');
  assert.equal(context.player.cultivationExp, expBefore + 20, 'player cultivation should increase');
  assert.equal(context.player.spiritStones, stonesBefore + 5, 'player spirit stones should increase');

  console.log('  ✓ claim completed task grants rewards');
}

// ── Test 8: Cannot claim already-claimed task ────────────────────────────────

function testCannotClaimAlreadyClaimedTask(): void {
  const clock = new FakeClock(10_000);
  const { tasks } = makeContext(clock);

  tasks.startTask('test_daily');
  clock.advance(10_000);
  tasks.tick();

  tasks.claimTask('test_daily');
  const result = tasks.claimTask('test_daily');
  assert.equal(result.success, false, 'should fail for already-claimed task');
  assert.ok(result.reason?.includes('已领取'), 'reason should mention already claimed');

  console.log('  ✓ cannot claim already-claimed task');
}

// ── Test 9: Mind efficiency modifies cultivation reward on claim ─────────────

function testMindEfficiencyModifiesClaimReward(): void {
  const clock = new FakeClock(10_000);
  const { context, tasks } = makeContext(clock, { mind: 40, maxMind: 100 });

  tasks.startTask('test_cultivation'); // cultivation:50, mind=40→efficiency≈0.6
  clock.advance(20_000);
  tasks.tick();

  const result = tasks.claimTask('test_cultivation');
  // efficiency at mind=40: 0.2+0.8*(0.4/0.8) = 0.6
  // actual cultivation = floor(50 * 0.6) = 30
  assert.equal(result.cultivationExp, 30, 'cultivation should be modified by mind efficiency');

  console.log('  ✓ mind efficiency modifies cultivation reward on claim');
}

// ── Test 10: Cleanup claimed tasks removes them from active list ─────────────

function testCleanupClaimedTasks(): void {
  const clock = new FakeClock(10_000);
  const { tasks } = makeContext(clock);

  tasks.startTask('test_event'); // 5s
  clock.advance(5_000);
  tasks.tick();
  tasks.claimTask('test_event');

  assert.equal(tasks.getActiveTasks().length, 1, 'claimed task still in list before cleanup');
  const removed = tasks.cleanupClaimedTasks();
  assert.equal(removed, 1, 'should remove 1 claimed task');
  assert.equal(tasks.getActiveTasks().length, 0, 'no active tasks after cleanup');

  console.log('  ✓ cleanup claimed tasks removes them from active list');
}

// ── Test 11: Task events fire correctly ──────────────────────────────────────

function testTaskEventsFire(): void {
  const clock = new FakeClock(10_000);
  const { context, tasks } = makeContext(clock);

  const startedEvents: unknown[] = [];
  const completedEvents: unknown[] = [];
  const claimedEvents: unknown[] = [];
  context.events.on('taskStarted', (e) => { startedEvents.push(e); });
  context.events.on('taskCompleted', (e) => { completedEvents.push(e); });
  context.events.on('taskClaimed', (e) => { claimedEvents.push(e); });

  tasks.startTask('test_event');
  assert.equal(startedEvents.length, 1, 'taskStarted should fire on start');

  clock.advance(5_000);
  tasks.tick();
  assert.equal(completedEvents.length, 1, 'taskCompleted should fire on tick completion');

  tasks.claimTask('test_event');
  assert.equal(claimedEvents.length, 1, 'taskClaimed should fire on claim');

  console.log('  ✓ task events fire correctly');
}

// ── Test 12: getRemainingSeconds reports correctly ───────────────────────────

function testGetRemainingSeconds(): void {
  const clock = new FakeClock(10_000);
  const { tasks } = makeContext(clock);

  tasks.startTask('test_daily'); // 10s duration
  assert.ok(Math.abs(tasks.getRemainingSeconds('test_daily') - 10) < 0.01, '10s remaining at start');

  clock.advance(3_000);
  assert.ok(Math.abs(tasks.getRemainingSeconds('test_daily') - 7) < 0.01, '7s remaining after 3s');

  clock.advance(7_000);
  assert.equal(tasks.getRemainingSeconds('test_daily'), 0, '0s remaining after full duration');

  console.log('  ✓ getRemainingSeconds reports correctly');
}

// ── Test 13: getConfigsByType filters correctly ──────────────────────────────

function testGetConfigsByType(): void {
  const { tasks } = makeContext();

  const dailyConfigs = tasks.getConfigsByType('DAILY');
  assert.equal(dailyConfigs.length, 1, 'should have 1 DAILY config');
  assert.equal(dailyConfigs[0].id, 'test_daily', 'DAILY config ID matches');

  const workConfigs = tasks.getConfigsByType('WORK');
  assert.equal(workConfigs.length, 1, 'should have 1 WORK config');

  console.log('  ✓ getConfigsByType filters correctly');
}

// ── Run all tests ────────────────────────────────────────────────────────────

testStartTaskSuccessfully();
testCannotStartUnknownTask();
testCannotStartDuplicateTask();
testMaxThreeConcurrentTasks();
testTickCompletesTasks();
testCannotClaimIncompleteTask();
testClaimCompletedTaskGrantsRewards();
testCannotClaimAlreadyClaimedTask();
testMindEfficiencyModifiesClaimReward();
testCleanupClaimedTasks();
testTaskEventsFire();
testGetRemainingSeconds();
testGetConfigsByType();
console.log('task flow tests passed');