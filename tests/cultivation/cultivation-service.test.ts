import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { CultivationService } from '../../assets/scripts/services/cultivation-service';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testMergeCultivationRewardsAreConfigurationDriven(): void {
  const context = new GameContext({
    player: new PlayerData(),
    saveService: new SaveService(new MemoryStorageAdapter()),
    cultivationRewards: [5, 10, 20, 40, 80],
  });
  const cultivation = new CultivationService(context);

  for (let level = 1; level <= 5; level += 1) {
    assert.equal(cultivation.grantMergeReward(`merge-${level}`, level), [5, 10, 20, 40, 80][level - 1]);
  }
  assert.equal(context.player.cultivationExp, 155);
}

function testCultivationSaveFailureRollsBackExperience(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({
    player: new PlayerData({ cultivationExp: 7 }),
    saveService: new SaveService({
      getItem: (key) => storage.getItem(key),
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: (key) => storage.removeItem(key),
    }),
    cultivationRewards: [5, 10, 20, 40, 80],
  });
  const cultivation = new CultivationService(context);

  assert.throws(() => cultivation.grantMergeReward('failed-merge', 1), /quota exceeded/);
  assert.equal(context.player.cultivationExp, 7);
}

testMergeCultivationRewardsAreConfigurationDriven();
testCultivationSaveFailureRollsBackExperience();
console.log('cultivation service tests passed');
