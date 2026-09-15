import assert from 'node:assert/strict';

import { MergeBoard } from '../../assets/scripts/game/merge/merge-board';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testRealFacadeRetainsBoardDomainCapabilityOutsideCraftPresentation(): void {
  const storage = new MemoryStorageAdapter();
  const facade = new GameFacade({
    storage,
    modeSwitchCooldownMs: 0,
    board: new MergeBoard({ rows: 4, columns: 4 }),
  });

  assert.ok(facade.context.board, 'the real GameContext keeps its domain board');
  const result = facade.recruit();

  assert.equal(result.success, true);
  assert.deepEqual(facade.context.board?.toSaveData().map(({ row, column }) => ({ row, column })), [{ row: 0, column: 0 }]);
  assert.deepEqual(JSON.parse(storage.getItem('game-save') ?? '{}').workers, facade.context.board?.toSaveData());
}

testRealFacadeRetainsBoardDomainCapabilityOutsideCraftPresentation();
console.log('playable loop tests passed');
