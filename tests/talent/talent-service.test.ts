import assert from 'node:assert/strict';

import { ConfigService } from '../../assets/scripts/services/config-service';
import { FixedRandomProvider, SequenceRandomProvider, type RandomProvider } from '../../assets/scripts/core/random-provider';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { TalentService } from '../../assets/scripts/services/talent-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const config = ConfigService.load({
  worker: { levels: [
    { level: 1, name: '一', salary: 1 }, { level: 2, name: '二', salary: 2 },
    { level: 3, name: '三', salary: 3 }, { level: 4, name: '四', salary: 4 },
    { level: 5, name: '五', salary: 5 }, { level: 6, name: '六', salary: 6 },
  ] },
  economy: { mergeRewards: [1, 2, 3, 4, 5] },
  game: { board: { columns: 4, rows: 4 } },
  talent: { talents: [
    { id: 'A', name: '甲', description: '甲' }, { id: 'B', name: '乙', description: '乙' },
    { id: 'C', name: '丙', description: '丙' }, { id: 'D', name: '丁', description: '丁' },
    { id: 'E', name: '戊', description: '戊' }, { id: 'F', name: '己', description: '己' },
  ] },
});

function createService(player = new PlayerData(), storage = new MemoryStorageAdapter(), random: RandomProvider = new FixedRandomProvider(0)): TalentService {
  return new TalentService({ configService: config, player, saveService: new SaveService(storage) }, random);
}

function testGeneratesThreeUniqueTalentsDeterministically(): void {
  const service = createService(undefined, undefined, new SequenceRandomProvider([0, 0.5, 0.99]));
  assert.deepEqual(service.firstChoices().map((talent: { id: string }) => talent.id), ['A', 'D', 'F']);
  assert.deepEqual(service.firstChoices().map((talent: { id: string }) => talent.id), ['A', 'D', 'F']);
}

function testChoosingTalentSavesAndCannotChooseAgain(): void {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData();
  const service = createService(player, storage);
  assert.equal(service.choose('A').id, 'A');
  assert.equal(player.talentId, 'A');
  assert.equal(JSON.parse(storage.getItem('game-save') ?? '{}').talentId, 'A');
  assert.throws(() => service.choose('B'), /already chosen/);
}

function testFailedSaveDoesNotLeaveTalentInMemory(): void {
  const player = new PlayerData();
  const saveService = new SaveService({ getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => undefined });
  const service = new TalentService({ configService: config, player, saveService }, new FixedRandomProvider(0));
  assert.throws(() => service.choose('A'), /quota exceeded/);
  assert.equal(player.talentId, null);
}

testGeneratesThreeUniqueTalentsDeterministically();
testChoosingTalentSavesAndCannotChooseAgain();
testFailedSaveDoesNotLeaveTalentInMemory();
console.log('talent tests passed');
