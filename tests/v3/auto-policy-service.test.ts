import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import type { AssignedTaskState, IncidentState } from '../../assets/scripts/model/save-data';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { OFFLINE_WELCOME_CONTENT, selectOfflineWelcomeLine } from '../../assets/scripts/v3/offline-welcome-content';

const NOW = 1_800_000_000_000;

class CountingSaveService extends SaveService {
  public saves = 0;

  public override save(player: PlayerData): void {
    this.saves += 1;
    super.save(player);
  }
}

function task(id: string, priority: AssignedTaskState['priority'], source: AssignedTaskState['source'] = 'BOSS'): AssignedTaskState {
  return {
    id,
    title: id,
    priority,
    source,
    createdDay: 1,
    createdAt: NOW - Number(id.replace(/\D/g, '') || 0),
    status: 'OPEN',
    rewardSalary: 10,
    rewardPerformance: 1,
    rewardCultivation: 0,
    rewardMind: 0,
    isFakeP0: false,
  };
}

function incident(id: string, status: IncidentState['status'] = 'DETECTED'): IncidentState {
  return {
    id,
    type: 'PAYMENT_FAILURE',
    severity: 'S2',
    dayIndex: 1,
    createdAt: NOW - 100,
    status,
    forcedRelease: false,
    riskConfirmed: false,
    mitigationSeconds: 0,
  };
}

function make(options: ConstructorParameters<typeof PlayerData>[0] = {}) {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(NOW);
  const saveService = new CountingSaveService(storage, DEFAULT_SAVE_KEY, clock);
  const context = new GameContext({ player: new PlayerData({ lastSaveTime: NOW - 60_000, ...options }), saveService, clock, board: null });
  return { context, saveService, storage, clock };
}

function testDefaultAndMigration(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ saveVersion: 8, salary: 12, autoPolicy: 'INVALID' }));
  const loaded = new SaveService(storage, DEFAULT_SAVE_KEY, new FakeClock(NOW)).load();
  assert.equal(loaded.autoPolicy, 'NORMAL');
  assert.deepEqual(loaded.handledWelcomeItemIds, []);
  assert.equal(new PlayerData().autoPolicy, 'NORMAL');
}

function testPolicyDecisionsAndOfflineIsolation(): void {
  const selective = make({ assignedTasks: [task('low1', 'P3'), task('incident-task', 'P3', 'INCIDENT'), task('high1', 'P1')] });
  const selectiveResult = selective.context.autoPolicy.prepareWelcome();
  assert.deepEqual(selectiveResult.autoCompletedTaskIds, []);
  assert.equal(selective.context.player.assignedTasks.every((item) => item.status === 'OPEN'), true);
  assert.equal(selective.saveService.saves, 0);

  selective.context.autoPolicy.setPolicy('SLACKER');
  const never = selective.context.autoPolicy.prepareWelcome();
  assert.deepEqual(never.autoCompletedTaskIds, []);
  assert.equal(selective.context.player.assignedTasks.every((item) => item.status === 'OPEN'), true);

  const always = make({
    salary: 0,
    lastIdleSettlementId: 'existing-offline-claim',
    assignedTasks: [task('low2', 'P2'), task('low3', 'P3', 'INCIDENT'), task('high2', 'P1')],
    incidents: [incident('prod1')],
  });
  always.context.autoPolicy.setPolicy('GRINDER');
  always.saveService.saves = 0;
  const result = always.context.autoPolicy.prepareWelcome();
  assert.deepEqual(result.autoCompletedTaskIds, ['low2']);
  assert.equal(always.context.player.assignedTasks.find((item) => item.id === 'low2')?.status, 'DONE');
  assert.equal(always.context.player.assignedTasks.find((item) => item.id === 'low3')?.status, 'OPEN');
  assert.equal(always.context.player.assignedTasks.find((item) => item.id === 'high2')?.status, 'OPEN');
  assert.equal(always.context.player.incidents[0].status, 'DETECTED');
  assert.equal(always.context.player.lastIdleSettlementId, 'existing-offline-claim');
  assert.equal(always.saveService.saves, 1);
  assert.equal(result.settlementId, `offline-${(NOW - 60_000).toString(36)}`);
  assert.deepEqual(always.context.autoPolicy.prepareWelcome().autoCompletedTaskIds, ['low2']);
  assert.equal(always.saveService.saves, 1, 'preparing twice must not repeat auto work or save');
}

function testQueueCapAndDedup(): void {
  const duplicate = task('dup', 'P2');
  const { context } = make({
    assignedTasks: [duplicate, { ...duplicate }, task('next', 'P3'), task('third', 'P1'), task('fourth', 'P0')],
    incidents: [incident('prod'), { ...incident('prod') }],
  });
  const result = context.autoPolicy.prepareWelcome();
  assert.equal(result.items.length, 3);
  assert.equal(new Set(result.items.map((item) => item.id)).size, 3);
  assert.equal(result.items[0].kind, 'INCIDENT');
}

function testStaleActionRejectedWithoutMutation(): void {
  const { context, saveService } = make({ assignedTasks: [task('stale', 'P2')] });
  const item = context.autoPolicy.prepareWelcome().items[0];
  context.player.assignedTasks[0] = { ...context.player.assignedTasks[0], status: 'DONE' };
  const before = context.player.toSaveData();
  const result = context.autoPolicy.performWelcomeAction(item.id, 'COMPLETE');
  assert.deepEqual(result, { success: false, reason: 'STALE' });
  assert.deepEqual(context.player.toSaveData(), before);
  assert.equal(saveService.saves, 0);
}

function testPolicyAndActionSaveExactlyOnceAndSurviveRestart(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(NOW);
  const saves = new CountingSaveService(storage, DEFAULT_SAVE_KEY, clock);
  const first = new GameContext({ player: new PlayerData({ lastSaveTime: NOW - 60_000, assignedTasks: [task('persist', 'P2')] }), saveService: saves, clock, board: null });
  assert.equal(first.autoPolicy.setPolicy('SLACKER'), true);
  assert.equal(saves.saves, 1);
  assert.equal(first.autoPolicy.setPolicy('SLACKER'), false);
  assert.equal(saves.saves, 1);

  const item = first.autoPolicy.prepareWelcome().items.find((candidate) => candidate.entityId === 'persist');
  assert.ok(item);
  assert.deepEqual(first.autoPolicy.performWelcomeAction(item!.id, 'COMPLETE'), { success: true });
  assert.equal(saves.saves, 2);

  const restarted = new GameContext({ storage, clock, board: null });
  assert.equal(restarted.player.autoPolicy, 'SLACKER');
  assert.equal(restarted.player.assignedTasks.find((candidate) => candidate.id === 'persist')?.status, 'DONE');
  assert.ok(restarted.player.handledWelcomeItemIds.includes('task:persist'));
}

function testWelcomeContentHasExactlyTwentyStableChineseWorkplaceCultivationLines(): void {
  const expectedIds = Array.from({ length: 20 }, (_, index) => `offline-welcome-${String(index + 1).padStart(2, '0')}`);
  const workplaceTerms = /(工位|上班|日报|会议|需求|老板|同事|绩效|加班|项目|代码|排期|打卡|周报|办公|职场|工资|摸鱼|任务|下班)/;
  const cultivationTerms = /(修仙|修为|道心|灵气|渡劫|闭关|飞升|功法|灵石|心魔|境界|炼丹|法器|宗门|仙途|剑|元神|真气|洞府|筑基)/;

  assert.equal(OFFLINE_WELCOME_CONTENT.length, 20);
  assert.deepEqual(OFFLINE_WELCOME_CONTENT.map((line) => line.id), expectedIds);
  assert.equal(new Set(OFFLINE_WELCOME_CONTENT.map((line) => line.id)).size, 20);
  assert.equal(new Set(OFFLINE_WELCOME_CONTENT.map((line) => line.text)).size, 20);
  for (const line of OFFLINE_WELCOME_CONTENT) {
    assert.match(line.text, /[\u3400-\u9fff]/, `${line.id} must contain Chinese copy`);
    assert.match(line.text, workplaceTerms, `${line.id} must mention workplace life`);
    assert.match(line.text, cultivationTerms, `${line.id} must mention cultivation`);
  }
  assert.deepEqual(selectOfflineWelcomeLine('offline-stable-key'), selectOfflineWelcomeLine('offline-stable-key'));
  assert.ok(OFFLINE_WELCOME_CONTENT.includes(selectOfflineWelcomeLine('offline-stable-key')));
}

function testFacadeExposesUnifiedWelcomeSummaryAndResumableDecisionActions(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(NOW);
  const saveService = new CountingSaveService(storage, DEFAULT_SAVE_KEY, clock);
  const facade = new GameFacade({
    player: new PlayerData({
      lastSaveTime: NOW - 3_600_000,
      pendingEvents: [{ uid: 'pending-review', eventId: 'task:review', occurredAt: NOW - 1_000, priority: 'IMPORTANT' }],
    }),
    saveService,
    clock,
    board: null,
  });

  const summary = facade.prepareWelcomeBackSummary();
  assert.equal(summary.simulation.effectiveSeconds, 3_600);
  assert.equal(summary.simulation.policyUsed, 'NORMAL');
  assert.ok(OFFLINE_WELCOME_CONTENT.includes(summary.welcomeLine));
  assert.equal(summary.decisions.current?.id, 'pending-review');
  assert.equal(summary.decisions.session?.cursor, 0);

  assert.deepEqual(facade.performOfflineDecision('pending-review'), { success: true, duplicate: false });
  const resumed = facade.prepareOfflineDecisions();
  assert.equal(resumed.current, null);
  assert.equal(resumed.session?.status, 'COMPLETED');
  facade.destroy();
}

const tests = [
  testDefaultAndMigration,
  testPolicyDecisionsAndOfflineIsolation,
  testQueueCapAndDedup,
  testStaleActionRejectedWithoutMutation,
  testPolicyAndActionSaveExactlyOnceAndSurviveRestart,
  testWelcomeContentHasExactlyTwentyStableChineseWorkplaceCultivationLines,
  testFacadeExposesUnifiedWelcomeSummaryAndResumableDecisionActions,
];

for (const test of tests) {
  test();
  console.log(`ok - ${test.name}`);
}

console.log('auto policy service tests passed');
