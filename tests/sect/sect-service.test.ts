import assert from 'node:assert/strict';
import { ConfigService } from '../../assets/scripts/services/config-service';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SectService } from '../../assets/scripts/services/sect-service';

const config = ConfigService.load({
  worker: { levels: Array.from({ length: 6 }, (_, i) => ({ level: i + 1, name: `L${i + 1}`, salary: i + 1 })) },
  economy: { mergeRewards: [1, 2, 3, 4, 5] }, game: { board: { columns: 4, rows: 4 } },
  sect: { sects: [
    { id: 'PRIVATE', name: '私企', modifiers: { salaryMultiplier: 1.2, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1 } },
    { id: 'FOREIGN', name: '外企', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1.2, mindMultiplier: 1, performanceMultiplier: 1 } },
    { id: 'STATE', name: '国企', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1, mindMultiplier: 1.2, performanceMultiplier: 1 } },
    { id: 'BIG_TECH', name: '大厂', modifiers: { salaryMultiplier: 1, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1.2 } },
  ] },
});

function testOffersFourConfiguredSects(): void {
  const service = new SectService({ configService: config, player: new PlayerData(), saveService: new SaveService(new MemoryStorageAdapter()) } as never);
  assert.deepEqual(service.available().map((sect) => sect.id), ['PRIVATE', 'FOREIGN', 'STATE', 'BIG_TECH']);
  assert.equal(service.get('PRIVATE').modifiers.salaryMultiplier, 1.2);
  assert.equal(service.get('FOREIGN').modifiers.cultivationMultiplier, 1.2);
  assert.equal(service.get('STATE').modifiers.mindMultiplier, 1.2);
  assert.equal(service.get('BIG_TECH').modifiers.performanceMultiplier, 1.2);
}

function testChoiceIsSavedAndCannotChange(): void {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData();
  const service = new SectService({ configService: config, player, saveService: new SaveService(storage) } as never);
  assert.equal(service.choose('FOREIGN').id, 'FOREIGN');
  assert.equal(player.sectId, 'FOREIGN');
  assert.equal(new PlayerData(new SaveService(storage).load()).sectId, 'FOREIGN');
  assert.throws(() => service.choose('PRIVATE'), /already chosen/);
}

function testFailedSaveDoesNotSelectSect(): void {
  const player = new PlayerData();
  const saveService = new SaveService({ getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => undefined });
  const service = new SectService({ configService: config, player, saveService } as never);
  assert.throws(() => service.choose('STATE'), /quota exceeded/);
  assert.equal(player.sectId, null);
}

testOffersFourConfiguredSects(); testChoiceIsSavedAndCannotChange(); testFailedSaveDoesNotSelectSect();
console.log('sect tests passed');
