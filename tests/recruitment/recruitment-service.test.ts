import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { RecruitmentService } from '../../assets/scripts/services/recruitment-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { SaveService } from '../../assets/scripts/services/save-service';

function createRecruitment(): { context: GameContext; recruitment: RecruitmentService; storage: MemoryStorageAdapter } {
  const storage = new MemoryStorageAdapter();
  const context = new GameContext({ saveService: new SaveService(storage), boardRows: 1, boardColumns: 2 });
  return { context, recruitment: new RecruitmentService(context), storage };
}

function testRecruitmentPlacesLevelOneWorkersInFirstEmptyCells(): void {
  const { context, recruitment } = createRecruitment();
  const first = recruitment.recruit();
  const second = recruitment.recruit();

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(context.board.getWorker({ row: 0, column: 0 })?.level, 1);
  assert.equal(context.board.getWorker({ row: 0, column: 1 })?.level, 1);
  assert.notEqual(first.worker?.id, second.worker?.id);
}

function testSuccessfulRecruitmentSavesAndEmitsModelEvent(): void {
  const { context, recruitment, storage } = createRecruitment();
  const events: string[] = [];
  context.events.on('workerRecruited', () => events.push('workerRecruited'));
  context.events.on('gameSaved', () => events.push('gameSaved'));

  recruitment.recruit();

  assert.deepEqual(events, ['workerRecruited', 'gameSaved']);
  assert.match(storage.getItem('game-save') ?? '', /worker-\d+/);
}

function testFullBoardDoesNotChangeDataOrSave(): void {
  const { context, recruitment, storage } = createRecruitment();
  recruitment.recruit();
  recruitment.recruit();
  const before = context.board.toSaveData();
  const savedBefore = storage.getItem('game-save');

  const result = recruitment.recruit();

  assert.deepEqual(result, { success: false, message: '工位满了' });
  assert.deepEqual(context.board.toSaveData(), before);
  assert.equal(storage.getItem('game-save'), savedBefore);
}

testRecruitmentPlacesLevelOneWorkersInFirstEmptyCells();
testSuccessfulRecruitmentSavesAndEmitsModelEvent();
testFullBoardDoesNotChangeDataOrSave();
console.log('recruitment tests passed');
