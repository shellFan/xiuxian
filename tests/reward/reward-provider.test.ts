import assert from 'node:assert/strict';
import { MockRewardProvider } from '../../assets/scripts/services/reward-provider';
import { GameContext } from '../../assets/scripts/core/game-context';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testMockRewardRestoresFiftyMind(): void {
  const context = new GameContext({ saveService: new SaveService(new MemoryStorageAdapter()) });
  context.mind.change(-100);
  assert.equal(context.mind.recoverWithReward(new MockRewardProvider()), 50);
  assert.equal(context.player.mind, 50);
  assert.equal(context.mind.status, 'NORMAL');
}

testMockRewardRestoresFiftyMind();
console.log('reward provider tests passed');
