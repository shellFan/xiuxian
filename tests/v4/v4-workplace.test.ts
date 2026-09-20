import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService, DEFAULT_SAVE_KEY } from '../../assets/scripts/services/save-service';

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

function make(): { clock: FakeClock; context: GameContext } {
  const clock = new FakeClock(at(21, 10));
  const context = new GameContext({ player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
  context.gameDay.ensureStarted();
  return { clock, context };
}

function testEvidenceGrantAndGating(): void {
  const { context } = make();
  assert.equal(context.evidence.all().length, 0);
  context.evidence.grant('GIT_LOG', '接口配置变更记录');
  context.evidence.grant('GIT_LOG', '接口配置变更记录'); // 幂等
  assert.equal(context.evidence.count('GIT_LOG'), 1);
  assert.deepEqual(context.evidence.heldTypes(), ['GIT_LOG']);
  const consumed = context.evidence.consume('GIT_LOG');
  assert.ok(consumed);
  assert.equal(context.evidence.all().length, 0);
  const missing = context.evidence.consume('GIT_LOG');
  assert.equal(missing, null);
}

function testEvidenceGatedEventChoice(): void {
  const { context } = make();
  // wp_blame_api_s0: 拿 Git 记录反击的选项只在有 GIT_LOG 时出现
  context.v2Events.forceTrigger('wp_blame_api_s0');
  const without = context.v2Events.currentChoices().map((c) => c.id);
  assert.ok(!without.includes('GIT_EVIDENCE'), 'evidence-gated choice must stay hidden without evidence');
  context.v2Events.choose('OK_LOOK'); // consumes current
  context.evidence.grant('GIT_LOG', '接口配置变更记录');
  context.v2Events.forceTrigger('wp_blame_api_s0');
  const withEvidence = context.v2Events.currentChoices().map((c) => c.id);
  assert.ok(withEvidence.includes('GIT_EVIDENCE'), 'evidence unlocks the counter choice');
}

function testBlameCaseAcceptVsClear(): void {
  const { context } = make();
  context.player.performance = 50;
  const perfBefore = context.player.performance;
  const caseAccepted = context.responsibility.openCase({
    sourceNpc: 'VETERAN', actualOwnerNpc: 'VETERAN', blamedPlayer: true, cause: '配置被改', severity: 'S3',
  });
  context.responsibility.acceptBlame(caseAccepted.id);
  assert.equal(context.responsibility.caseById(caseAccepted.id)!.status, 'PLAYER_ACCEPTED');
  assert.equal(context.player.performance, perfBefore - 3); // S3 -3
  assert.equal(context.player.eventFlags['mem:VETERAN:BLAMED_PLAYER_SUCCEEDED'], true);

  const perf2 = context.player.performance;
  const caseCleared = context.responsibility.openCase({
    sourceNpc: 'VETERAN', actualOwnerNpc: 'VETERAN', blamedPlayer: true, cause: '接口报错甩锅', severity: 'S3',
  });
  const ev = context.evidence.grant('GIT_LOG', '发布记录');
  context.responsibility.attachEvidence(caseCleared.id, ev.id);
  const outcome = context.responsibility.clearWithEvidence(caseCleared.id);
  assert.equal(outcome.status, 'PLAYER_CLEARED');
  assert.equal(context.responsibility.caseById(caseCleared.id)!.status, 'PLAYER_CLEARED');
  assert.equal(context.player.performance, perf2 + 3);
  assert.equal(context.player.eventFlags['mem:VETERAN:BLAME_FAILED'], true);
  assert.equal(context.player.lifetimeStats.blameCounters, 1);
  // 反击时证据保留（记录已公开，不算消耗性道具）
  assert.equal(context.evidence.count('GIT_LOG'), 1);
}

function testClearWithoutEvidenceFails(): void {
  const { context } = make();
  const kase = context.responsibility.openCase({ sourceNpc: 'PRODUCT', actualOwnerNpc: 'PRODUCT', cause: '需求争议', severity: 'S4' });
  const outcome = context.responsibility.clearWithEvidence(kase.id);
  assert.equal(outcome.status, 'PLAYER_ACCEPTED', 'empty rebuttal falls back to accepting the blame');
}

function testIncidentLifecycle(): void {
  const { context } = make();
  assert.equal(context.incidents.active(), null);
  const incident = context.incidents.raise({ type: 'PAYMENT_FAILURE', severity: 'S2', forcedRelease: true });
  assert.equal(context.incidents.active()!.id, incident.id);
  assert.equal(context.player.lifetimeStats.incidentCount, 1);
  // 未处置完成不能恢复
  assert.throws(() => context.incidents.recover(incident.id));
  context.incidents.mitigate(incident.id, 30 * 60);
  assert.throws(() => context.incidents.recover(incident.id), /尚未处置完成/, 'S2 needs 45min');
  context.incidents.mitigate(incident.id, 20 * 60);
  const recovered = context.incidents.recover(incident.id, '回滚配置');
  assert.equal(recovered.status, 'RECOVERED');
  assert.equal(context.incidents.active(), null);
  const closed = context.incidents.completePostmortem(incident.id, '强行上线且跳过测试');
  assert.equal(closed.status, 'CLOSED');
  // 当日时长账本记录了 incident 时段
  assert.ok((context.player.gameDay?.durations.incident ?? 0) > 0);
}

function testIncidentRiskRespondsToDebtAndFlags(): void {
  const { context } = make();
  const base = context.incidents.currentRisk();
  context.techDebt.add('PAYMENT', 60);
  context.techDebt.add('INFRA', 60);
  const withDebt = context.incidents.currentRisk();
  assert.ok(withDebt > base, 'tech debt raises incident risk');
  context.player.eventFlags['release_forced'] = true;
  const forced = context.incidents.currentRisk();
  assert.ok(forced > withDebt, 'forced release raises incident risk');
}

function testAssignedTaskFakeP0(): void {
  const { context } = make();
  const fake = context.assignedTasks.assign({ title: '按钮偏移2px', priority: 'P0', source: 'TEST', rewardSalary: 100, rewardPerformance: 5, isFakeP0: true });
  const reward = context.assignedTasks.complete(fake.id);
  assert.equal(reward.salary, 20, 'fake P0 pays 20%');
  assert.equal(reward.performance, 1);
  assert.equal(context.player.lifetimeStats.fakeP0Done, 1);

    const real = context.assignedTasks.assign({ title: '支付失败', priority: 'P0', source: 'INCIDENT', rewardSalary: 80 });
    const refused = context.assignedTasks.refuse(real.id);
    assert.equal(refused.performance, -6, 'refusing a real P0 hurts');
    assert.equal(context.player.lifetimeStats.fakeP0Refused ?? 0, 0);

  const fake2 = context.assignedTasks.assign({ title: '色彩不高级', priority: 'P0', source: 'PRODUCT', isFakeP0: true });
  context.assignedTasks.refuse(fake2.id);
  assert.equal(context.player.lifetimeStats.fakeP0Refused, 1);
}

function testAssignedTaskExpiry(): void {
  const { context } = make();
  context.assignedTasks.assign({ title: '旧活', priority: 'P3', source: 'BOSS' });
  context.player.gameDay = context.player.gameDay ? { ...context.player.gameDay, dayIndex: 5 } : null;
  const expired = context.assignedTasks.expireStale(5);
  assert.equal(expired, 1);
  assert.equal(context.assignedTasks.open().length, 0);
}

function testTechDebtRepay(): void {
  const { context } = make();
  context.techDebt.add('ORDER', 50);
  assert.equal(context.techDebt.level('ORDER'), 50);
  const reduced = context.techDebt.repay('ORDER', 30);
  assert.equal(reduced, 24, '30min repays at 0.8/min');
  assert.equal(context.techDebt.level('ORDER'), 26);
  assert.equal(context.techDebt.repay('LOGIN', 10), 0, 'nothing to repay');
}

function testOvertimeSessionSurvivesRestart(): void {
  const storage = new MemoryStorageAdapter();
  const clock = new FakeClock(at(21, 19));
  const first = new GameContext({ storage, player: new PlayerData({ lastSaveTime: clock.now() }), clock, board: null });
  first.gameDay.ensureStarted();
  first.overtime.offer('REQUESTED', true, 2 * 3600);
  first.overtime.accept('FISHING');
  first.overtime.tick(30 * 60);
  first.saveService.save(first.player);

  const restarted = new GameContext({ storage, clock, board: null });
  const session = restarted.overtime.current();
  assert.ok(session, 'active overtime session survives restart');
  assert.equal(session!.status, 'ACTIVE');
  assert.equal(session!.elapsedSeconds, 30 * 60);
  assert.equal(restarted.overtime.canSettleDay(), false);
  restarted.overtime.finish();
  assert.equal(restarted.player.overtimeStats.freeSeconds, 30 * 60);
  assert.equal(restarted.overtime.canSettleDay(), true);
}

function testPaidOvertimePaysOnceAtFinish(): void {
  const { context } = make();
  const salaryBefore = context.player.salary;
  context.overtime.startVoluntary(3600, true);
  context.overtime.tick(3600);
  context.overtime.finish();
  assert.ok(context.player.salary > salaryBefore, 'paid overtime credits salary at finish');
  // career L1: 10/h base ×1.5 = 15 for 1h
  assert.equal(context.player.salary - salaryBefore, 15);
  assert.equal(context.player.gameDay?.income.salary, 15);
  const stats = context.player.overtimeStats;
  assert.equal(stats.paidSeconds, 3600);
  // 重复 finish 不重复发薪
  context.overtime.finish();
  assert.equal(context.player.salary - salaryBefore, 15);
}

function testFreeOvertimeNeverPays(): void {
  const { context } = make();
  const salaryBefore = context.player.salary;
  context.overtime.offer('REQUESTED', true, 3600);
  context.overtime.accept('WORK');
  context.overtime.tick(3600);
  context.overtime.finish();
  assert.equal(context.player.salary, salaryBefore);
  assert.equal(context.player.gameDay?.income.salary, 0);
}

function testWorkTickRecordsIncomeAndFishingInput(): void {
  const { clock, context } = make();
  clock.set(at(21, 11));
  context.player.workMode = 'WORK';
  const before = context.player.gameDay?.income.salary ?? 0;
  context.work.tick(3600);
  const after = context.player.gameDay?.income.salary ?? 0;
  assert.ok(after > before, 'ordinary wage is booked into the day ledger');

  context.player.workMode = 'FISHING';
  const fishingBefore = context.player.gameDay?.settlementInputs.paidFishingSalary ?? 0;
  context.work.tick(3600);
  const fishingAfter = context.player.gameDay?.settlementInputs.paidFishingSalary ?? 0;
  assert.ok(fishingAfter > fishingBefore, 'fishing salary is recorded as a settlement input');
  assert.equal(context.player.lifetimeStats.paidFishingSalary, fishingAfter);
}

function testSaveV8MigrationFromV7(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({
    saveVersion: 7,
    salary: 500,
    lastSaveTime: at(21, 9),
    eventFlags: { legacy_flag: true },
  }));
  const loaded = new SaveService(storage).load();
  assert.equal(loaded.saveVersion, 8);
  assert.equal(loaded.salary, 500);
  assert.deepEqual(loaded.evidence, []);
  assert.deepEqual(loaded.responsibilityCases, []);
  assert.deepEqual(loaded.incidents, []);
  assert.deepEqual(loaded.assignedTasks, []);
  assert.deepEqual(loaded.technicalDebt, {});
  assert.equal(loaded.activeOvertimeSession, null);
  assert.equal(loaded.eventFlags?.legacy_flag, true);
  // roundtrip
  const player = new PlayerData(loaded);
  assert.deepEqual(new PlayerData(player.toSaveData()).toSaveData(), player.toSaveData());
}

function testSaveV8RejectsCorruptSession(): void {
  const storage = new MemoryStorageAdapter();
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({
    saveVersion: 8,
    activeOvertimeSession: { source: 'HACKED', plannedSeconds: -5 },
  }));
  const loaded = new SaveService(storage).load();
  assert.equal(loaded.activeOvertimeSession, null, 'corrupt session is dropped, not trusted');
}

function testEventEffectsDriveV4Systems(): void {
  const { context } = make();
  context.v2Events.forceTrigger('wp_blame_api_s0');
  const r = context.v2Events.choose('OK_LOOK');
  assert.ok(r.effectsApplied.assignTask, 'choice creates an assigned task');
  assert.equal(context.assignedTasks.open().length, 1);
  assert.equal(context.assignedTasks.open()[0].priority, 'P0');
  assert.equal(context.assignedTasks.open()[0].source, 'COLLEAGUE');
  // 链推进：当前事件变成下一阶段
  assert.ok(context.v2Events.currentEvent(), 'chain advances to the next stage');
}

const tests = [
  testEvidenceGrantAndGating,
  testEvidenceGatedEventChoice,
  testBlameCaseAcceptVsClear,
  testClearWithoutEvidenceFails,
  testIncidentLifecycle,
  testIncidentRiskRespondsToDebtAndFlags,
  testAssignedTaskFakeP0,
  testAssignedTaskExpiry,
  testTechDebtRepay,
  testOvertimeSessionSurvivesRestart,
  testPaidOvertimePaysOnceAtFinish,
  testFreeOvertimeNeverPays,
  testWorkTickRecordsIncomeAndFishingInput,
  testSaveV8MigrationFromV7,
  testSaveV8RejectsCorruptSession,
  testEventEffectsDriveV4Systems,
];

let failures = 0;
for (const test of tests) {
  try {
    test();
    console.log('ok - ' + test.name);
  } catch (error) {
    failures += 1;
    console.error('not ok - ' + test.name);
    console.error(error);
  }
}
if (failures > 0) {
  console.error(`${failures} v4 workplace tests failed`);
  process.exit(1);
}
console.log('v4 workplace tests passed');
