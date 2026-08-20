import assert from 'node:assert/strict';

import { ConfigService, ConfigValidationError } from '../../assets/scripts/services/config-service';
import type { ConfigBundle } from '../../assets/scripts/model/config-types';

const validConfig: ConfigBundle = {
  worker: { levels: [
    { level: 1, name: '实习牛马', salary: 10 }, { level: 2, name: '普通牛马', salary: 20 },
    { level: 3, name: '高级牛马', salary: 40 }, { level: 4, name: '资深牛马', salary: 80 },
    { level: 5, name: '牛马主管', salary: 160 }, { level: 6, name: '牛马总监', salary: 320 },
  ] },
  economy: { mergeRewards: [10, 20, 40, 80, 160] },
  game: { board: { columns: 4, rows: 4 } },
};

function testLoadsValidatedConfig(): void {
  const service = ConfigService.load(validConfig);
  assert.deepEqual(service.worker.levels, validConfig.worker.levels);
  assert.deepEqual(service.economy.mergeRewards, [10, 20, 40, 80, 160]);
  assert.deepEqual(service.game.board, { columns: 4, rows: 4 });
}
function testRejectsMissingConfig(): void {
  assert.throws(() => ConfigService.load({ ...validConfig, economy: undefined as never }),
    (error: unknown) => error instanceof ConfigValidationError && error.message.includes('economy'));
}
function testRejectsMissingField(): void {
  const worker = { levels: validConfig.worker.levels.map(({ name, ...level }) => level) };
  assert.throws(() => ConfigService.load({ ...validConfig, worker: worker as never }),
    (error: unknown) => error instanceof ConfigValidationError && error.message.includes('worker.levels[0].name'));
}
function testRejectsDuplicateAndIllegalLevels(): void {
  const duplicate = { ...validConfig.worker, levels: [...validConfig.worker.levels, validConfig.worker.levels[0]] };
  assert.throws(() => ConfigService.load({ ...validConfig, worker: duplicate }),
    (error: unknown) => error instanceof ConfigValidationError && error.message.includes('duplicate level 1'));
  const illegal = { ...validConfig.worker, levels: validConfig.worker.levels.map((item) => ({ ...item, level: item.level === 6 ? 7 : item.level })) };
  assert.throws(() => ConfigService.load({ ...validConfig, worker: illegal }),
    (error: unknown) => error instanceof ConfigValidationError && error.message.includes('level must be between 1 and 6'));
}
function testRejectsIncompleteMergeRewards(): void {
  for (const mergeRewards of [[], [10]]) {
    assert.throws(() => ConfigService.load({ ...validConfig, economy: { mergeRewards } }),
      (error: unknown) => error instanceof ConfigValidationError && error.message.includes('5 rewards'));
  }
}
testLoadsValidatedConfig(); testRejectsMissingConfig(); testRejectsMissingField(); testRejectsDuplicateAndIllegalLevels(); testRejectsIncompleteMergeRewards();
console.log('config tests passed');