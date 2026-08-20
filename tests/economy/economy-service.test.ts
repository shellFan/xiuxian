import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';

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

function testInvalidSalaryChangesAreRejected(): void {
  const { context } = createContext();
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
    assert.throws(() => context.economy.changeSalary(amount), /salary change/);
  }
  assert.equal(context.player.salary, 0);
}

testSalaryChangeSavesAndEmitsEvent();
testMergeRewardsAreConfiguredAndGrantedOnlyOnce();
testInvalidSalaryChangesAreRejected();
console.log('economy service tests passed');
