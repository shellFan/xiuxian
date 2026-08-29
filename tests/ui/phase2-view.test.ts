import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { mindStatusText, buildCareerViewModel, buildPromotionViewModel, buildEventViewModel } from '../../assets/scripts/ui/phase2/view-models';

function makeContext(player: PlayerData, clock = new FakeClock(1_000)): GameContext {
  const storage = new MemoryStorageAdapter();
  return new GameContext({ player, storage, clock });
}

function readyLevelOne(): PlayerData {
  return new PlayerData({
    careerLevel: 1,
    cultivationExp: 50,
    mind: 100,
    workSeconds: 300,
    kpiProgress: { MERGE_COUNT: 3, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
  });
}

function testMindStatusTiers(): void {
  assert.equal(mindStatusText(0, 100), '彻底破防');
  assert.equal(mindStatusText(15, 100), '濒临破防');
  assert.equal(mindStatusText(40, 100), '心态不稳');
  assert.equal(mindStatusText(65, 100), '正常牛马');
  assert.equal(mindStatusText(100, 100), '精神饱满');
  // Ratio-based: a quarter of maxMind reads as 濒临破防.
  assert.equal(mindStatusText(50, 200), '濒临破防');
  // Two thirds of maxMind reads as 正常牛马.
  assert.equal(mindStatusText(200, 300), '正常牛马');
}

function testCareerViewModel(): void {
  const context = makeContext(readyLevelOne());
  const view = buildCareerViewModel(context);
  assert.equal(view.careerLevel, 1);
  assert.equal(view.careerName, '练气职员');
  assert.equal(view.realm, '练气境');
  assert.equal(view.cultivation, 50);
  assert.equal(view.cultivationRequired, 0);
  assert.equal(view.mindStatusText, '精神饱满');
  assert.equal(view.officeName, '共享工位');
  assert.equal(view.workMode, 'FISHING');
  assert.equal(view.canPromote, true);
  assert.equal(view.promotionReason, 'READY');
}

function testPromotionViewModel(): void {
  const context = makeContext(readyLevelOne());
  const view = buildPromotionViewModel(context);
  assert.equal(view.allowed, true);
  assert.equal(view.probability, 80);
  assert.equal(view.options.length, 3);
  assert.deepEqual(view.options.map((option) => option.id), ['PPT', 'DATA', 'BLAME']);
}

function testEventViewModelNoPending(): void {
  const context = makeContext(readyLevelOne(), new FakeClock(1_000));
  const view = buildEventViewModel(context);
  assert.equal(view.pending, false);
}

function testEventViewModelPending(): void {
  const clock = new FakeClock(1_000);
  const context = makeContext(readyLevelOne(), clock);
  context.careerEvents.poll(); // establishes the next-event schedule
  clock.advance(9 * 60 * 1000);
  const event = context.careerEvents.poll();
  assert.ok(event);
  const view = buildEventViewModel(context);
  assert.equal(view.pending, true);
  assert.equal(view.id, event!.id);
  assert.equal(view.title, event!.title);
}

testMindStatusTiers();
testCareerViewModel();
testPromotionViewModel();
testEventViewModelNoPending();
testEventViewModelPending();
console.log('phase 2 view model tests passed');
