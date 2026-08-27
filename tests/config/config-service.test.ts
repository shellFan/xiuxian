import assert from 'node:assert/strict';

import { ConfigService, ConfigValidationError } from '../../assets/scripts/services/config-service';
import type { ConfigBundle } from '../../assets/scripts/model/config-types';
import careerEvents from '../../assets/configs/career-events.json';

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
function testValidatesTalentConfiguration(): void {
  const talent = { talents: [
    { id: 'A', name: '甲', description: '甲' }, { id: 'B', name: '乙', description: '乙' },
    { id: 'C', name: '丙', description: '丙' }, { id: 'D', name: '丁', description: '丁' },
    { id: 'E', name: '戊', description: '戊' }, { id: 'F', name: '己', description: '己' },
  ] };
  const service = ConfigService.load({ ...validConfig, talent });
  assert.equal(service.talent.talents.length, 6);
  assert.throws(() => ConfigService.load({ ...validConfig, talent: { talents: talent.talents.slice(0, 5) } }), /at least 6/);
  assert.throws(() => ConfigService.load({ ...validConfig, talent: { talents: [...talent.talents.slice(0, 5), { ...talent.talents[0], id: 'B' }] } }), /duplicate id B/);
}
function testValidatesCareerEventsBundle(): void {
  const service = ConfigService.loadFromJson(
    { levels: Array.from({ length: 6 }, (_, index) => ({ level: index + 1, name: `L${index + 1}`, salary: 1 })) },
    { mergeRewards: [1, 2, 3, 4, 5] },
    { board: { columns: 4, rows: 4 } },
    undefined, undefined, undefined, careerEvents,
  );
  assert.equal(service.careerEvents.events.length, 30);
  assert.ok(service.careerEvents.events.every((event) =>
    ['POSITIVE', 'NEGATIVE', 'CHOICE', 'RARE', 'EASTER_EGG'].includes(event.type)));
  assert.equal(new Set(service.careerEvents.events.map((event) => event.id)).size, 30);
}
testLoadsValidatedConfig(); testRejectsMissingConfig(); testRejectsMissingField(); testRejectsDuplicateAndIllegalLevels(); testRejectsIncompleteMergeRewards(); testValidatesTalentConfiguration(); testValidatesCareerEventsBundle();
console.log('config tests passed');
