import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { ConfigService } from '../../assets/scripts/services/config-service';
import worker from '../../assets/configs/worker.json';
import economy from '../../assets/configs/economy.json';
import game from '../../assets/configs/game.json';
import career from '../../assets/configs/career.json';
import sects from '../../assets/configs/sect.json';

function make(approvalPercent = 55) {
  const clock = new FakeClock(new Date(2026, 8, 21, 19).getTime());
  const storage = new MemoryStorageAdapter();
  const config = JSON.parse(JSON.stringify(sects)) as typeof sects;
  const outsourcing = config.sects.find((item) => item.id === 'OUTSOURCING')!;
  (outsourcing.employment as unknown as { overtimeApprovalPercent: number }).overtimeApprovalPercent = approvalPercent;
  const configService = ConfigService.loadFromJson(worker, economy, game, career, config);
  const context = new GameContext({
    configService, storage, clock, board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), salary: 100, sectId: 'OUTSOURCING', profession: 'QA' }),
  });
  context.gameDay.ensureStarted();
  return { clock, storage, context };
}

test('all eight configured employer sects are available to new hires', () => {
  const { context } = make();
  assert.equal(context.sect.available().length, 8);
  assert.ok(context.sect.available().some((sect) => sect.id === 'STARTUP'));
});

test('outsourcing cannot bypass client approval through the legacy paid overtime API', () => {
  const { context } = make(100);
  assert.throws(() => context.overtime.offer('REQUESTED', false, 3600), /客户审批/);
});

test('outsource approval is persisted, idempotent, profession-specific and gates paid work', () => {
  const { context, storage, clock } = make(100);
  const overtime = context.overtime as unknown as {
    applyForApproval(seconds: number): { id: string; status: string; taskId: string; approvalRoll: number };
    startApprovedOvertime(applicationId: string): { status: string; approvalId?: string };
  };
  const first = overtime.applyForApproval(3600);
  const repeated = overtime.applyForApproval(3600);
  assert.equal(first.status, 'APPROVED');
  assert.equal(repeated.id, first.id, 'retry in one game day must reuse the same decision');
  assert.equal((context.player as unknown as { overtimeApplications: unknown[] }).overtimeApplications.length, 1);
  assert.equal(first.taskId, 'qa-production-regression');
  const session = overtime.startApprovedOvertime(first.id);
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.approvalId, first.id);
  context.overtime.tick(3600);
  const salaryBeforeSettlement = context.player.salary;
  context.overtime.finish();
  const paid = context.player.salary - salaryBeforeSettlement;
  assert.ok(paid > 0);
  const savedSalary = context.player.salary;
  const restarted = new GameContext({ storage, clock, board: null });
  restarted.overtime.finish();
  assert.equal(restarted.player.salary, savedSalary, 'restarting cannot pay an overtime session twice');
  assert.equal((restarted.player as unknown as { health: number }).health, 98);
  assert.equal((restarted.player as unknown as { mood: number }).mood, 56);
  assert.equal(restarted.player.mind, 98);
});

test('rejected client approval is stable across retries and cannot start paid overtime', () => {
  const { context } = make(0);
  const overtime = context.overtime as unknown as {
    applyForApproval(seconds: number): { id: string; status: string };
    startApprovedOvertime(applicationId: string): unknown;
  };
  const rejected = overtime.applyForApproval(2 * 3600);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(overtime.applyForApproval(2 * 3600).id, rejected.id);
  assert.throws(() => overtime.startApprovedOvertime(rejected.id), /未获批准/);
  assert.equal(context.player.salary, 100);
  assert.equal(context.overtime.current(), null);
});

test('legacy saves without overtime application history migrate with an empty history', () => {
  const { storage, clock, context } = make();
  context.saveService.save(context.player);
  const loaded = new GameContext({ storage, clock, board: null });
  assert.deepEqual((loaded.player as unknown as { overtimeApplications?: unknown[] }).overtimeApplications ?? [], []);
});
