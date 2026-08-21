import assert from 'node:assert/strict';
import { CareerService } from '../../assets/scripts/services/career-service';
import { ConfigService } from '../../assets/scripts/services/config-service';
import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const worker = { levels: Array.from({ length: 6 }, (_, index) => ({ level: index + 1, name: `worker-${index + 1}`, salary: index })) };
const career = { levels: Array.from({ length: 10 }, (_, index) => ({ level: index + 1, name: `career-${index + 1}`, realm: `realm-${index + 1}`, requiredExp: index * 100 })) };
const config = ConfigService.load({ career, worker, economy: { mergeRewards: [1, 2, 3, 4, 5] }, game: { board: { columns: 4, rows: 4 } } });

function testConfigExposesTenCareerLevels(): void {
  assert.equal(config.career.levels.length, 10);
  assert.deepEqual(config.career.levels[9], { level: 10, name: 'career-10', realm: 'realm-10', requiredExp: 900 });
}
function testConfigRejectsNonTenCareerLevels(): void {
  assert.throws(() => ConfigService.load({ career: { levels: career.levels.slice(0, 9) }, worker, economy: { mergeRewards: [1, 2, 3, 4, 5] }, game: { board: { columns: 4, rows: 4 } } }), /exactly 10 levels/);
}
function testCareerDoesNotReuseWorkerLevel(): void {
  const player = new PlayerData({ careerLevel: 2, performance: 200, maxWorkerLevel: 6 });
  const context = new GameContext({ player, configService: config, storage: new MemoryStorageAdapter() });
  const careerService = new CareerService(context);
  assert.equal(careerService.current().level, 2);
  assert.equal(careerService.promote(), true);
  assert.equal(player.careerLevel, 3);
  assert.equal(player.maxWorkerLevel, 6);
  assert.equal(context.board.maxWorkerLevel, 6);
}
function testCareerPromotionRequiresConfiguredExp(): void {
  const player = new PlayerData({ careerLevel: 1, performance: 99 });
  const context = new GameContext({ player, configService: config, storage: new MemoryStorageAdapter() });
  const careerService = new CareerService(context);
  assert.equal(careerService.canPromote(), false);
  assert.equal(careerService.promote(), false);
  assert.equal(player.careerLevel, 1);
}
testConfigExposesTenCareerLevels(); testConfigRejectsNonTenCareerLevels(); testCareerDoesNotReuseWorkerLevel(); testCareerPromotionRequiresConfiguredExp();
console.log('career tests passed');
