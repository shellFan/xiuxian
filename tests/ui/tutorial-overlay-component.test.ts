import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

const moduleApi = Module as unknown as { _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown };
const loader = moduleApi._load;
moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
  if (request === 'cc') {
    return {
      _decorator: { ccclass: () => (target: unknown) => target, property: () => () => {} },
      Component: class {},
    };
  }
  return loader.call(this, request, parent, isMain);
};

const { SceneBindingComponent } = require('../../assets/scripts/ui/scene-binding-component') as typeof import('../../assets/scripts/ui/scene-binding-component');
const { TutorialOverlayComponent } = require('../../assets/scripts/ui/tutorial-overlay-component') as typeof import('../../assets/scripts/ui/tutorial-overlay-component');
const { CocosBootstrapComponent } = require('../../assets/scripts/core/cocos-bootstrap-component') as typeof import('../../assets/scripts/core/cocos-bootstrap-component');
moduleApi._load = loader;

type SceneBindingInternals = {
  onLoad(): void;
  onDestroy(): void;
};

type TutorialOverlayInternals = {
  facade: { queryTutorial(): unknown; advanceTutorial(): void; skipTutorial(): void };
  disposed: boolean;
  onSkip(): void;
};

function tutorialState(step = 'FIRST_WORK') {
  return {
    currentStep: step,
    isCompleted: false,
    stepIndex: 1,
    steps: ['WELCOME', 'FIRST_WORK', 'FIRST_FISH', 'FIRST_CULTIVATE', 'FIRST_TASK'],
  };
}

function testUnfinishedV2TutorialDoesNotEnqueueBlockingModal(): void {
  const binding = new SceneBindingComponent();
  const internals = binding as unknown as SceneBindingInternals;
  const facade = {
    queryTutorial: () => tutorialState(),
    onUiEvent: () => () => undefined,
    lifecycle: { onShow: () => () => undefined },
  };
  (CocosBootstrapComponent as unknown as { _instance: unknown })._instance = { facade, audioService: null };

  internals.onLoad();

  assert.equal(binding.modalManager.getActive(), null);
  assert.equal(binding.modalManager.getQueueSize(), 0);
  internals.onDestroy();
  (CocosBootstrapComponent as unknown as { _instance: unknown })._instance = null;
}

function testOverlayUsesConcreteSoftGuidance(): void {
  const overlay = new TutorialOverlayComponent();
  const title = { string: '' };
  const hint = { string: '' };
  overlay.titleLabel = title;
  overlay.hintLabel = hint;
  (overlay as unknown as TutorialOverlayInternals).facade = {
    queryTutorial: () => tutorialState(),
    advanceTutorial: () => undefined,
    skipTutorial: () => undefined,
  };

  overlay.refresh();

  assert.match(title.string, /上.*班/);
  assert.match(hint.string, /工资/);
  assert.match(hint.string, /绩效/);
}

function testSkipDoesNotCreateConfirmationOrInputCapture(): void {
  const overlay = new TutorialOverlayComponent();
  const node = { active: true };
  overlay.overlayNode = node;
  let skipped = 0;
  let modalRequests = 0;
  let toasts = 0;
  (overlay as unknown as TutorialOverlayInternals).facade = {
    queryTutorial: () => tutorialState(),
    advanceTutorial: () => undefined,
    skipTutorial: () => { skipped += 1; },
  };
  (SceneBindingComponent as unknown as { _instance: unknown })._instance = {
    showModal: () => { modalRequests += 1; },
    showToast: () => { toasts += 1; },
  };

  (overlay as unknown as TutorialOverlayInternals).onSkip();

  assert.equal(skipped, 1);
  assert.equal(modalRequests, 0);
  assert.equal(toasts, 1);
  assert.equal(node.active, false);
  assert.equal((SceneBindingComponent.instance as unknown as { modalManager?: unknown }).modalManager, undefined);
  (SceneBindingComponent as unknown as { _instance: unknown })._instance = null;
}

function testCommonModalHasNoObsoleteTutorialHandlers(): void {
  const source = fs.readFileSync(path.join(process.cwd(), 'assets/scripts/ui/common-modal-component.ts'), 'utf8');
  assert.doesNotMatch(source, /case\s+['"]TUTORIAL['"]/);
  assert.doesNotMatch(source, /renderTutorialModal/);
}

testUnfinishedV2TutorialDoesNotEnqueueBlockingModal();
testOverlayUsesConcreteSoftGuidance();
testSkipDoesNotCreateConfirmationOrInputCapture();
testCommonModalHasNoObsoleteTutorialHandlers();

console.log('tutorial overlay component tests passed');
