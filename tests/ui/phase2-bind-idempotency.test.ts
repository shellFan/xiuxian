import assert from 'node:assert/strict';
import Module from 'node:module';

const moduleApi = Module as unknown as { _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown };
const loader = moduleApi._load;
moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
  if (request === 'cc') {
    return {
      _decorator: { ccclass: () => (target: unknown) => target, property: () => () => {} },
      Component: class {},
      CCFloat: class {},
      CCInteger: class {},
    };
  }
  return loader.call(this, request, parent, isMain);
};

const { GameContext } = require('../../assets/scripts/core/game-context') as typeof import('../../assets/scripts/core/game-context');
const { FakeClock } = require('../../assets/scripts/core/clock') as typeof import('../../assets/scripts/core/clock');
const { PlayerData } = require('../../assets/scripts/model/player-data') as typeof import('../../assets/scripts/model/player-data');
const { MemoryStorageAdapter } = require('../../assets/scripts/services/storage-adapter') as typeof import('../../assets/scripts/services/storage-adapter');
const { Phase2Root } = require('../../assets/scripts/ui/phase2/phase2-root-component') as typeof import('../../assets/scripts/ui/phase2/phase2-root-component');
const { EventPopup } = require('../../assets/scripts/ui/phase2/event-popup-component') as typeof import('../../assets/scripts/ui/phase2/event-popup-component');
const { PromotionPopup } = require('../../assets/scripts/ui/phase2/promotion-popup-component') as typeof import('../../assets/scripts/ui/phase2/promotion-popup-component');
moduleApi._load = loader;

type TestButton = {
  registrations: number;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
  click(): void;
};

function makeButton(): TestButton {
  const handlers = new Map<string, Set<() => void>>();
  return {
    get registrations() {
      return handlers.get('click')?.size ?? 0;
    },
    on(event, callback) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(callback);
    },
    off(event, callback) {
      handlers.get(event)?.delete(callback);
    },
    click() {
      handlers.get('click')?.forEach((handler) => handler());
    },
  };
}

function makeContext(player?: InstanceType<typeof PlayerData>, clock = new FakeClock(1_000)): InstanceType<typeof GameContext> {
  return new GameContext({
    player,
    storage: new MemoryStorageAdapter(),
    clock,
    careerEventClock: clock,
  });
}

function readyLevelOne(): InstanceType<typeof PlayerData> {
  return new PlayerData({
    careerLevel: 1,
    cultivationExp: 50,
    mind: 100,
    workSeconds: 300,
    kpiProgress: { MERGE_COUNT: 3, SALARY_EARNED: 0, EVENT_RESOLVED: 0 },
  });
}

function wirePhase2Root(root: InstanceType<typeof Phase2Root>): {
  workplaceTab: TestButton;
  workButton: TestButton;
} {
  const workplaceTab = makeButton();
  const workButton = makeButton();
  Object.assign(root, {
    workplaceTab,
    sectTab: makeButton(),
    mergeTab: makeButton(),
    eventTab: makeButton(),
    workButton,
    fishButton: makeButton(),
    workplaceNode: { active: true },
    sectNode: { active: false },
    mergeNode: { active: false },
    eventNode: { active: false },
  });
  return { workplaceTab, workButton };
}

function testPhase2RootBindIsIdempotent(): void {
  const root = new Phase2Root();
  const { workplaceTab, workButton } = wirePhase2Root(root);
  const context = makeContext();

  root.bind(context);
  root.bind(context);

  assert.equal(workplaceTab.registrations, 1, 'tab click handler must remain a single live registration');
  assert.equal(workButton.registrations, 1, 'work button must remain a single live registration');
  assert.equal(context.work.mode, 'FISHING');
  workButton.click();
  assert.equal(context.work.mode, 'WORK', 'single click after double bind must invoke handler once');
}

function testPhase2RootDestroyStopsCallbacks(): void {
  const root = new Phase2Root();
  const { workButton } = wirePhase2Root(root);
  const context = makeContext();
  root.bind(context);
  root.onDestroy();

  assert.equal(workButton.registrations, 0, 'destroy must unwire buttons');
  workButton.click();
  assert.equal(context.work.mode, 'FISHING', 'destroy must drop work-button callbacks');
}

function testPhase2RootRebindDetachesOldContext(): void {
  const root = new Phase2Root();
  const { workButton } = wirePhase2Root(root);
  const first = makeContext();
  const second = makeContext();

  root.bind(first);
  root.bind(second);
  workButton.click();

  assert.equal(first.work.mode, 'FISHING', 'old context must stay detached after rebind');
  assert.equal(second.work.mode, 'WORK', 'new context must receive the click');
}

function testEventPopupRenderDoesNotAccumulateHandlers(): void {
  const clock = new FakeClock(1_000);
  const context = makeContext(readyLevelOne(), clock);
  context.careerEvents.poll();
  clock.advance(9 * 60 * 1000);
  assert.ok(context.careerEvents.poll(), 'expected a pending career event for popup wiring');

  const popup = new EventPopup();
  const confirmButton = makeButton();
  const choiceButton1 = makeButton();
  Object.assign(popup, {
    confirmButton,
    choiceButton1,
    choiceButton2: makeButton(),
    choiceButton3: makeButton(),
  });
  popup.bind(context);

  popup.render();
  popup.render();
  const live = confirmButton.registrations + choiceButton1.registrations;
  assert.ok(live <= 1, 'render must keep at most one live confirm/choice handler');

  popup.onDestroy();
  assert.equal(confirmButton.registrations, 0, 'destroy must unwire event popup buttons');
  assert.equal(choiceButton1.registrations, 0, 'destroy must unwire choice buttons');
}

function testPromotionPopupRenderDoesNotAccumulateHandlers(): void {
  const popup = new PromotionPopup();
  const optionButton1 = makeButton();
  const retryButton = makeButton();
  Object.assign(popup, {
    optionButton1,
    optionButton2: makeButton(),
    optionButton3: makeButton(),
    retryButton,
  });
  popup.bind(makeContext(readyLevelOne()));

  popup.render();
  popup.render();
  assert.equal(optionButton1.registrations, 1, 'render must keep a single live option handler');

  popup.bindRetry();
  popup.bindRetry();
  assert.equal(retryButton.registrations, 1, 'bindRetry must be idempotent');

  popup.onDestroy();
  assert.equal(optionButton1.registrations, 0, 'destroy must unwire option buttons');
  assert.equal(retryButton.registrations, 0, 'destroy must unwire retry');
}

testPhase2RootBindIsIdempotent();
testPhase2RootDestroyStopsCallbacks();
testPhase2RootRebindDetachesOldContext();
testEventPopupRenderDoesNotAccumulateHandlers();
testPromotionPopupRenderDoesNotAccumulateHandlers();
console.log('phase2 bind idempotency tests passed');
