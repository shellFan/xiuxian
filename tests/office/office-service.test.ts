import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData, type PlayerDataOptions } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FixedRandomProvider } from '../../assets/scripts/core/random-provider';
import { ConfigService } from '../../assets/scripts/services/config-service';
import { ConfigValidationError } from '../../assets/scripts/services/config-service';

function makeContext(options: PlayerDataOptions, random?: FixedRandomProvider): { context: GameContext; player: PlayerData } {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData(options);
  const context = new GameContext({ player, storage, randomProvider: random });
  return { context, player };
}

function testCareerOneIsSharedDesk(): void {
  const { context } = makeContext({ careerLevel: 1 });
  assert.equal(context.office.getOfficeLevel(), 1);
  assert.equal(context.office.getOfficeName(), '共享工位');
}

function testCareerTwoIsSharedDesk(): void {
  const { context } = makeContext({ careerLevel: 2 });
  assert.equal(context.office.getOfficeLevel(), 1);
  assert.equal(context.office.getOfficeName(), '共享工位');
}

function testCareerThreeIsStandardDesk(): void {
  const { context } = makeContext({ careerLevel: 3 });
  assert.equal(context.office.getOfficeLevel(), 2);
  assert.equal(context.office.getOfficeName(), '普通工位');
}

function testCareerFiveIsPartition(): void {
  const { context } = makeContext({ careerLevel: 5 });
  assert.equal(context.office.getOfficeLevel(), 3);
  assert.equal(context.office.getOfficeName(), '隔断工位');
}

function testCareerSevenIsSupervisorOffice(): void {
  const { context } = makeContext({ careerLevel: 7 });
  assert.equal(context.office.getOfficeLevel(), 4);
  assert.equal(context.office.getOfficeName(), '主管办公室');
}

function testCareerNineIsManagerOffice(): void {
  const { context } = makeContext({ careerLevel: 9 });
  assert.equal(context.office.getOfficeLevel(), 5);
  assert.equal(context.office.getOfficeName(), '经理办公室');
}

function testCareerTenIsManagerOffice(): void {
  const { context } = makeContext({ careerLevel: 10 });
  assert.equal(context.office.getOfficeLevel(), 5);
  assert.equal(context.office.getOfficeName(), '经理办公室');
}

function testNextOfficeProgression(): void {
  const { context } = makeContext({ careerLevel: 1 });
  assert.equal(context.office.getNextOffice()?.name, '普通工位');
  const top = makeContext({ careerLevel: 9 }).context;
  assert.equal(top.office.getNextOffice(), undefined);
}

function testInvalidOfficeConfigRejected(): void {
  const base = {
    worker: { levels: Array.from({ length: 6 }, (_, i) => ({ level: i + 1, name: `w${i + 1}`, salary: i })) },
    economy: { mergeRewards: [1, 2, 3, 4, 5] },
    game: { board: { columns: 4, rows: 4 } },
  };
  // Only three offices and a coverage gap: must be rejected.
  const bad = { ...base, office: { offices: [
    { level: 1, name: 'A', minCareerLevel: 1, maxCareerLevel: 2 },
    { level: 2, name: 'B', minCareerLevel: 3, maxCareerLevel: 4 },
    { level: 3, name: 'C', minCareerLevel: 6, maxCareerLevel: 7 },
  ] } };
  assert.throws(() => ConfigService.load(bad), ConfigValidationError);
}

function testPromotionChangesOffice(): void {
  // Lv2 sits in office 1 (共享工位, careers 1~2); promoting to Lv3 moves to office 2 (普通工位).
  const { context, player } = makeContext({
    careerLevel: 2,
    cultivationExp: 150,
    mind: 100,
    workSeconds: 600,
    kpiProgress: { MERGE_COUNT: 5, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
  }, new FixedRandomProvider(0.5));
  assert.equal(context.office.getOfficeName(), '共享工位');
  context.promotion.promote('PPT');
  assert.equal(player.careerLevel, 3);
  assert.equal(context.office.getOfficeName(), '普通工位');
  assert.equal(player.officeLevel, 2);
}

function testReloadKeepsOfficeConsistent(): void {
  const storage = new MemoryStorageAdapter();
  const player = new PlayerData({ careerLevel: 5, officeLevel: 3 });
  const context = new GameContext({ player, storage });
  context.saveService.save(player);
  // Reload from the same storage with no player provided.
  const reloaded = new GameContext({ storage });
  assert.equal(reloaded.player.careerLevel, 5);
  assert.equal(reloaded.office.getOfficeName(), '隔断工位');
  assert.equal(reloaded.player.officeLevel, 3);
}

testCareerOneIsSharedDesk();
testCareerTwoIsSharedDesk();
testCareerThreeIsStandardDesk();
testCareerFiveIsPartition();
testCareerSevenIsSupervisorOffice();
testCareerNineIsManagerOffice();
testCareerTenIsManagerOffice();
testNextOfficeProgression();
testInvalidOfficeConfigRejected();
function testOfficeDerivesFromCareerNotMirror(): void {
  // careerLevel is authoritative; a stale persisted officeLevel mirror must be ignored.
  const { context, player } = makeContext({ careerLevel: 7, officeLevel: 1 });
  assert.equal(player.officeLevel, 1, 'mirror left stale on purpose');
  assert.equal(context.office.getOfficeLevel(), 4, 'office derives from careerLevel (7 -> 4), not the mirror');
  assert.equal(context.office.getOfficeName(), '主管办公室');
}

testPromotionChangesOffice();
testReloadKeepsOfficeConsistent();
testOfficeDerivesFromCareerNotMirror();
console.log('office service tests passed');
