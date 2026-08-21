import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { MindService } from '../../assets/scripts/services/mind-service';

function createMind(saveService = new SaveService(new MemoryStorageAdapter())): { context: GameContext; mind: MindService; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService });
  return { context, mind: context.mind, storage };
}

function testDefaultMindAndStatus(): void {
  const { mind } = createMind();
  assert.equal(mind.current, 100);
  assert.equal(mind.max, 100);
  assert.equal(mind.status, 'NORMAL');
  assert.equal(mind.statusText, '道心稳固');
}

function testMindChangesClampAndPersist(): void {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService(storage) });
  context.mind.change(-130);
  assert.equal(context.player.mind, 0);
  assert.equal(context.mind.status, 'BREAKDOWN');
  assert.equal(context.mind.statusText, '道心崩溃');
  assert.equal(JSON.parse(storage.getItem('game-save') ?? '{}').mind, 0);
  context.mind.change(999);
  assert.equal(context.player.mind, 100);
}

function testRestRecoversBreakdown(): void {
  const { mind } = createMind();
  mind.change(-100);
  assert.equal(mind.rest(), 100);
  assert.equal(mind.current, 100);
}

function testSaveFailureRollsBackMind(): void {
  const player = new (require('../../assets/scripts/model/player-data').PlayerData)({ mind: 40 });
  const context = new GameContext({ player, saveService: new SaveService({
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  }) });
  assert.throws(() => context.mind.change(-10), /quota exceeded/);
  assert.equal(context.player.mind, 40);
}

testDefaultMindAndStatus();
testMindChangesClampAndPersist();
testRestRecoversBreakdown();
testSaveFailureRollsBackMind();
console.log('mind service tests passed');
