import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import type { GameEffect } from '../../assets/scripts/model/game-effect';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter, type StorageAdapter } from '../../assets/scripts/services/storage-adapter';

function createContext(player = new PlayerData()): GameContext {
  return new GameContext({ player, saveService: new SaveService(new MemoryStorageAdapter()) });
}

function testAppliesAllCoreResourceDeltasAsOneEffect(): void {
  const context = createContext(new PlayerData({ salary: 10, cultivationExp: 3, performance: 4, mind: 50 }));
  const effect: GameEffect = { salary: 7, cultivation: 5, performance: 2, mind: -8 };

  context.effects.apply(effect);

  assert.deepEqual(
    { salary: context.player.salary, cultivation: context.player.cultivationExp, performance: context.player.performance, mind: context.player.mind },
    { salary: 17, cultivation: 8, performance: 6, mind: 42 },
  );
}

function testRollsBackEveryResourceWhenPersistenceFails(): void {
  class FailingStorage implements StorageAdapter {
    public getItem(): string | null { return null; }
    public setItem(): void { throw new Error('quota exceeded'); }
    public removeItem(): void {}
  }
  const player = new PlayerData({ salary: 10, cultivationExp: 3, performance: 4, mind: 50 });
  const context = new GameContext({ player, saveService: new SaveService(new FailingStorage()) });

  assert.throws(() => context.effects.apply({ salary: 7, cultivation: 5, performance: 2, mind: -8 }), /quota exceeded/);
  assert.deepEqual(
    { salary: player.salary, cultivation: player.cultivationExp, performance: player.performance, mind: player.mind },
    { salary: 10, cultivation: 3, performance: 4, mind: 50 },
  );
}

function testRejectsInvalidEffectsWithoutTouchingPlayer(): void {
  const player = new PlayerData({ salary: 10 });
  const context = createContext(player);

  assert.throws(() => context.effects.apply({ salary: 1.5 }), /Invalid salary effect/);
  assert.equal(player.salary, 10);
}

testAppliesAllCoreResourceDeltasAsOneEffect();
testRollsBackEveryResourceWhenPersistenceFails();
testRejectsInvalidEffectsWithoutTouchingPlayer();
console.log('effect service tests passed');
