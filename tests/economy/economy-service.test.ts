import assert from 'node:assert/strict';
import fs from 'node:fs';

import { GameContext } from '../../assets/scripts/core/game-context';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MergeService } from '../../assets/scripts/services/merge-service';
import { WorkerEntity } from '../../assets/scripts/model/worker-entity';
import { ConfigService } from '../../assets/scripts/services/config-service';
import type { ConfigBundle } from '../../assets/scripts/model/config-types';

function createContext(): { context: GameContext; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  return { context: new GameContext({ saveService: new SaveService(storage) }), storage };
}

function testSalaryChangeSavesAndEmitsEvent(): void {
  const { context, storage } = createContext();
  const changes: unknown[] = [];
  context.events.on('salaryChanged', (event) => changes.push(event));

  context.economy.changeSalary(20);

  assert.equal(context.player.salary, 20);
  assert.deepEqual(changes, [{ amount: 20, total: 20 }]);
  assert.match(storage.getItem('game-save') ?? '', /"salary":20/);
}

function testMergeRewardsAreConfiguredAndGrantedOnlyOnce(): void {
  const { context } = createContext();

  assert.deepEqual(context.economy.mergeRewards, [10, 20, 40, 80, 160]);
  assert.equal(context.economy.grantMergeReward('merge-1', 1), 10);
  assert.equal(context.economy.grantMergeReward('merge-1', 1), 0);
  assert.equal(context.player.salary, 10);
}

function testMergeRewardCannotBeGrantedTwiceDuringSalaryEvent(): void {
  const { context } = createContext();
  context.events.on('salaryChanged', () => {
    context.economy.grantMergeReward('merge-reentrant', 1);
  });

  assert.equal(context.economy.grantMergeReward('merge-reentrant', 1), 10);
  assert.equal(context.player.salary, 10);
}

function testInvalidSalaryChangesAreRejected(): void {
  const { context } = createContext();
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
    assert.throws(() => context.economy.changeSalary(amount), /salary change/);
  }
  assert.equal(context.player.salary, 0);
}

function testInvalidMergeRewardsAreRejectedWithoutChangingSalary(): void {
  const { context } = createContext();
  for (const input of [
    ['', 1], ['merge-invalid', 0], ['merge-invalid', 6], ['merge-invalid', 1.5],
  ] as const) {
    assert.throws(() => context.economy.grantMergeReward(input[0], input[1]), /Invalid merge reward/);
  }
  assert.equal(context.player.salary, 0);
}

function testMergeUsesEconomyConfigurationAndService(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    saveService: new SaveService(storage),
    boardRows: 1,
    boardColumns: 3,
    economyRewards: [11, 22, 44, 88, 176],
  });
  const merge = new MergeService(context);
  const first = { row: 0, column: 0 };
  const second = { row: 0, column: 1 };
  context.board.place(WorkerEntity.create(1), first);
  context.board.place(WorkerEntity.create(1), second);

  const result = merge.merge(first, second);

  assert.equal(result.success, true);
  assert.equal(result.salaryReward, 11);
  assert.equal(context.player.salary, 11);
  assert.match(storage.getItem('game-save') ?? '', /"salary":11/);
}

testSalaryChangeSavesAndEmitsEvent();
testMergeRewardCannotBeGrantedTwiceDuringSalaryEvent();
testMergeRewardsAreConfiguredAndGrantedOnlyOnce();
testInvalidSalaryChangesAreRejected();
testInvalidMergeRewardsAreRejectedWithoutChangingSalary();
testMergeUsesEconomyConfigurationAndService();
function testGameContextUsesValidatedEconomyConfig(): void {
  const config: ConfigBundle = {
    worker: { levels: [
      { level: 1, name: '一', salary: 1 }, { level: 2, name: '二', salary: 2 },
      { level: 3, name: '三', salary: 3 }, { level: 4, name: '四', salary: 4 },
      { level: 5, name: '五', salary: 5 }, { level: 6, name: '六', salary: 6 },
    ] },
    economy: { mergeRewards: [11, 22, 44, 88, 176] },
    game: { board: { columns: 4, rows: 4 } },
  };
  const context = new GameContext({ configService: ConfigService.load(config), storage: new MemoryStorageAdapter() });
  assert.deepEqual(context.economy.mergeRewards, [11, 22, 44, 88, 176]);
}
testGameContextUsesValidatedEconomyConfig();

function testProductionContextDoesNotUseNodeDynamicRequire(): void {
  const source = fs.readFileSync('assets/scripts/core/game-context.ts', 'utf8');
  assert.doesNotMatch(source, /\brequire\s*\(/);
  const economyJson = JSON.parse(fs.readFileSync('assets/configs/economy.json', 'utf8')) as { mergeRewards: number[] };
  assert.deepEqual(createContext().context.economy.mergeRewards, economyJson.mergeRewards);
}
testProductionContextDoesNotUseNodeDynamicRequire();
console.log('economy service tests passed');
