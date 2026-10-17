import assert from 'node:assert/strict';
import Module from 'node:module';

import type { CharacterCreationDraft, CharacterCreationResult, CharacterCreationView } from '../../assets/scripts/v59/character-creation-service';
import type { CharacterStats, CreationStep, StatKey } from '../../assets/scripts/v59/character-rules';
import type { SectConfig } from '../../assets/scripts/model/config-types';

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

const { buildCharacterCreationViewModel } = require('../../assets/scripts/ui/character-creation-view-model') as typeof import('../../assets/scripts/ui/character-creation-view-model');
const { CharacterCreationWizardComponent } = require('../../assets/scripts/ui/character-creation-wizard-component') as typeof import('../../assets/scripts/ui/character-creation-wizard-component');
moduleApi._load = loader;

const EMPTY: CharacterStats = { insight: 0, constitution: 0, perception: 0, fortune: 0, willpower: 0 };
const SECTS: readonly SectConfig[] = [{
  id: 'BIG_TECH',
  name: '大厂宗',
  modifiers: { salaryMultiplier: 1.5, cultivationMultiplier: 1, mindMultiplier: 1, performanceMultiplier: 1 },
}];

function draft(step: CreationStep, overrides: Partial<CharacterCreationDraft> = {}): CharacterCreationDraft {
  return {
    rulesVersion: 'v59a.1',
    mode: 'CREATE',
    seed: 123,
    step,
    professionId: 'JAVA_BACKEND',
    professionConfirmed: false,
    nickname: '青云牛马',
    avatarId: 'avatar-1',
    candidates: [
      { id: 'A', destinyId: 'LABOR_SAINT', attributes: { insight: 11, constitution: 10, perception: 10, fortune: 10, willpower: 9 } },
      { id: 'B', destinyId: 'CODE_SPIRIT', attributes: { insight: 16, constitution: 10, perception: 10, fortune: 7, willpower: 7 } },
      { id: 'C', destinyId: 'FISHING_IMMORTAL', attributes: { insight: 9, constitution: 9, perception: 8, fortune: 16, willpower: 8 } },
    ],
    candidateHistory: [],
    rerollsUsed: 0,
    allocation: { ...EMPTY },
    startedAt: 1000,
    ...overrides,
  };
}

function view(step: CreationStep, overrides: Partial<CharacterCreationDraft> = {}): CharacterCreationView {
  return { status: 'CREATION_REQUIRED', isNewCharacterCreationRequired: true, draft: draft(step, overrides), sects: SECTS };
}

function testEightStepsAndValidation(): void {
  const inputs: Array<[CreationStep, Partial<CharacterCreationDraft>, boolean]> = [
    ['INDUSTRY', {}, false],
    ['INDUSTRY', { industry: 'INTERNET' }, true],
    ['DIRECTION', {}, false],
    ['DIRECTION', { direction: 'TECH_RND' }, true],
    ['PROFESSION', {}, false],
    ['PROFESSION', { professionConfirmed: true }, true],
    ['SECT', {}, false],
    ['SECT', { sectId: 'BIG_TECH' }, true],
    ['IDENTITY', { nickname: '', background: 'ORDINARY_WORKER' }, false],
    ['IDENTITY', { nickname: '青云牛马' }, false],
    ['IDENTITY', { nickname: '青云牛马', background: 'ORDINARY_WORKER' }, true],
    ['DESTINY', {}, false],
    ['DESTINY', { selectedCandidateId: 'A' }, true],
    ['ALLOCATION', { selectedCandidateId: 'A' }, false],
    ['ALLOCATION', { selectedCandidateId: 'A', allocation: { ...EMPTY, insight: 5 } }, true],
    ['CONFIRM' as CreationStep, {
      industry: 'INTERNET',
      direction: 'TECH_RND',
      professionConfirmed: true,
      sectId: 'BIG_TECH',
      background: 'ORDINARY_WORKER',
      selectedCandidateId: 'A',
      allocation: { ...EMPTY, insight: 5 },
    }, true],
  ];

  for (const [step, overrides, enabled] of inputs) {
    const vm = buildCharacterCreationViewModel(view(step, overrides));
    assert.equal(vm.step, step);
    assert.equal(vm.canContinue, enabled, `${step} continue state`);
  }
  assert.equal(buildCharacterCreationViewModel(view('INDUSTRY')).totalSteps, 8);
}

function testDestinyAndAllocationProjection(): void {
  const destiny = buildCharacterCreationViewModel(view('DESTINY', { selectedCandidateId: 'B', rerollsUsed: 2 }));
  assert.equal(destiny.candidates.length, 3);
  assert.equal(destiny.candidates[1].selected, true);
  assert.match(destiny.candidates[1].title, /代码/);
  assert.match(destiny.candidates[0].description, /疲劳增长降低 20%/);
  assert.match(destiny.candidates[1].description, /技术任务进度提高 10%/);
  assert.match(destiny.candidates[1].description, /技术研发方向/);
  assert.equal(destiny.canReroll, true);
  assert.equal(destiny.rerollsRemaining, 1);

  const allocation = buildCharacterCreationViewModel(view('ALLOCATION', {
    selectedCandidateId: 'A',
    allocation: { ...EMPTY, insight: 3, willpower: 2 },
  }));
  assert.equal(allocation.remainingPoints, 0);
  assert.equal(allocation.stats.find((item) => item.id === 'insight')?.value, 14);
  assert.deepEqual(allocation.stats.map((item) => item.label), ['悟性', '根骨', '神识', '机缘', '心性']);
  assert.equal((allocation.stats.find((item) => item.id === 'insight') as any)?.canDecrease, true);
  assert.equal(allocation.canFinalize, false);
  assert.equal(allocation.canContinue, true);
  assert.equal(allocation.stats.every((item) => item.canIncrease === false), true);

  const confirm = buildCharacterCreationViewModel(view('CONFIRM' as CreationStep, {
    industry: 'INTERNET',
    direction: 'TECH_RND',
    professionConfirmed: true,
    sectId: 'BIG_TECH',
    background: 'ORDINARY_WORKER',
    selectedCandidateId: 'A',
    allocation: { ...EMPTY, insight: 5 },
  }));
  assert.equal(confirm.canFinalize, true);
  assert.equal(confirm.nextLabel, '确认入职');
  assert.match(confirm.confirmationLines.join('\n'), /青云牛马/);
}

function testBackfillViewModel(): void {
  const pending = buildCharacterCreationViewModel({
    status: 'BACKFILL_REQUIRED',
    isNewCharacterCreationRequired: false,
    draft: draft('DESTINY', { mode: 'BACKFILL' }),
  });
  assert.equal(pending.isBackfill, true);
  assert.equal(pending.canBack, false);
  assert.equal(pending.canReroll, false);
  assert.equal(pending.canCompleteBackfill, false);

  const selected = buildCharacterCreationViewModel({
    status: 'BACKFILL_REQUIRED',
    isNewCharacterCreationRequired: false,
    draft: draft('DESTINY', { mode: 'BACKFILL', selectedCandidateId: 'C' }),
  });
  assert.equal(selected.canCompleteBackfill, true);
}

class FakeButton {
  public interactable = true;
  private callback?: () => void;
  public on(_event: string, callback: () => void): void { this.callback = callback; }
  public off(): void { this.callback = undefined; }
  public click(): void { if (this.interactable) this.callback?.(); }
}

class FakeInput {
  public string = '';
  private callback?: () => void;
  public on(_event: string, callback: () => void): void { this.callback = callback; }
  public off(): void { this.callback = undefined; }
  public finishEditing(): void { this.callback?.(); }
}

class FakeFacade {
  public state = view('INDUSTRY');
  public readonly calls: string[] = [];

  public queryCharacterCreation(): CharacterCreationView { return this.state; }
  public characterCreationSelectIndustry(id: string): CharacterCreationResult {
    this.calls.push(`industry:${id}`);
    this.state = view('INDUSTRY', { industry: 'INTERNET' });
    return { success: true, draft: this.state.draft };
  }
  public characterCreationSelectDirection(id: string): CharacterCreationResult { this.calls.push(`direction:${id}`); return { success: true }; }
  public characterCreationSelectProfession(id: string): CharacterCreationResult { this.calls.push(`profession:${id}`); return { success: true }; }
  public characterCreationSelectSect(id: string): CharacterCreationResult { this.calls.push(`sect:${id}`); return { success: true }; }
  public characterCreationSetIdentity(nickname: string, avatarId: string): CharacterCreationResult {
    this.calls.push(`identity:${nickname}:${avatarId}`);
    if (this.state.draft) {
      this.state = { ...this.state, draft: { ...this.state.draft, nickname, avatarId: avatarId as CharacterCreationDraft['avatarId'] } };
    }
    return { success: true };
  }
  public characterCreationSetBackground(id: string): CharacterCreationResult {
    this.calls.push(`background:${id}`);
    if (this.state.draft) {
      this.state = { ...this.state, draft: { ...this.state.draft, background: id as NonNullable<CharacterCreationDraft['background']> } };
    }
    return { success: true };
  }
  public characterCreationSelectCandidate(id: string): CharacterCreationResult { this.calls.push(`candidate:${id}`); return { success: true }; }
  public characterCreationReroll(): CharacterCreationResult { this.calls.push('reroll'); return { success: true }; }
  public characterCreationAllocate(stat: StatKey, delta: number): CharacterCreationResult { this.calls.push(`allocate:${stat}:${delta}`); return { success: true }; }
  public characterCreationResetAllocation(): CharacterCreationResult { this.calls.push('reset'); return { success: true }; }
  public characterCreationAdvance(): CharacterCreationResult {
    this.calls.push('advance');
    this.state = view('DIRECTION', { industry: 'INTERNET' });
    return { success: true, draft: this.state.draft };
  }
  public characterCreationBack(): CharacterCreationResult { this.calls.push('back'); return { success: true }; }
  public characterCreationFinalize(): CharacterCreationResult { this.calls.push('finalize'); return { success: true }; }
  public characterCreationCompleteBackfill(): CharacterCreationResult { this.calls.push('backfill'); return { success: true }; }
}

function testComponentRoutesControlsThroughFacade(): void {
  const facade = new FakeFacade();
  const component = new CharacterCreationWizardComponent();
  const industry = new FakeButton();
  const next = new FakeButton();
  component.optionButtons = [industry];
  component.nextButton = next;
  component.nicknameInput = { string: '青云牛马' };
  component.bindFacade(facade);

  assert.equal(next.interactable, false);
  industry.click();
  assert.deepEqual(facade.calls, ['industry:INTERNET']);
  assert.equal(next.interactable, true);
  next.click();
  assert.deepEqual(facade.calls, ['industry:INTERNET', 'advance']);
  assert.equal(component.currentViewModel?.step, 'DIRECTION');
  component.unbindFacade();
}

function testComponentSurfacesFacadeFailure(): void {
  const facade = new FakeFacade();
  facade.characterCreationSelectIndustry = () => ({ success: false, reason: '草稿保存失败' });
  const component = new CharacterCreationWizardComponent();
  const industry = new FakeButton();
  component.optionButtons = [industry];
  component.errorLabel = { string: '' };
  component.bindFacade(facade);
  industry.click();
  assert.equal(component.errorLabel.string, '草稿保存失败');
}

function testEveryDisplayedActionHasAFacadeRoute(): void {
  const facade = new FakeFacade();
  const component = new CharacterCreationWizardComponent();
  const optionButtons = [new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton()];
  const avatarButtons = [new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton()];
  const backgroundButtons = [new FakeButton(), new FakeButton(), new FakeButton()];
  const candidateButtons = [new FakeButton(), new FakeButton(), new FakeButton()];
  const statButtons = [new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton()];
  const statDecreaseButtons = [new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton(), new FakeButton()];
  const back = new FakeButton();
  const next = new FakeButton();
  const reroll = new FakeButton();
  const reset = new FakeButton();
  const nickname = new FakeInput();
  component.optionButtons = optionButtons;
  component.avatarButtons = avatarButtons;
  component.backgroundButtons = backgroundButtons;
  component.candidateButtons = candidateButtons;
  component.statIncreaseButtons = statButtons;
  component.statDecreaseButtons = statDecreaseButtons;
  component.backButton = back;
  component.nextButton = next;
  component.rerollButton = reroll;
  component.resetAllocationButton = reset;
  component.nicknameInput = nickname;
  component.bindFacade(facade);

  optionButtons[1].click();
  assert.deepEqual(facade.calls, [], 'locked industry option stays inert');

  facade.state = view('DIRECTION');
  component.refresh();
  optionButtons[0].click();
  facade.state = view('PROFESSION');
  component.refresh();
  optionButtons[2].click();

  facade.state = view('SECT');
  component.refresh();
  optionButtons[0].click();

  facade.state = view('IDENTITY', { background: 'ORDINARY_WORKER' });
  nickname.string = '工位剑仙';
  component.refresh();
  nickname.string = '工位剑仙';
  avatarButtons[1].click();
  backgroundButtons[2].click();
  nickname.finishEditing();

  facade.state = view('DESTINY', { selectedCandidateId: 'A' });
  component.refresh();
  candidateButtons[2].click();
  reroll.click();
  back.click();

  facade.state = view('ALLOCATION', { selectedCandidateId: 'A' });
  component.refresh();
  statButtons[0].click();
  facade.state = view('ALLOCATION', { selectedCandidateId: 'A', allocation: { ...EMPTY, insight: 1 } });
  component.refresh();
  statDecreaseButtons[0].click();
  reset.click();

  facade.state = view('CONFIRM' as CreationStep, {
    industry: 'INTERNET',
    direction: 'TECH_RND',
    professionConfirmed: true,
    sectId: 'BIG_TECH',
    background: 'ORDINARY_WORKER',
    selectedCandidateId: 'A',
    allocation: { ...EMPTY, insight: 5 },
  });
  component.refresh();
  next.click();

  facade.state = {
    status: 'BACKFILL_REQUIRED',
    isNewCharacterCreationRequired: false,
    draft: draft('DESTINY', { mode: 'BACKFILL', selectedCandidateId: 'B' }),
  };
  component.refresh();
  next.click();

  assert.deepEqual(facade.calls, [
    'direction:TECH_RND',
    'profession:QA',
    'sect:BIG_TECH',
    'identity:工位剑仙:avatar-2',
    'background:CAREER_CHANGER',
    'identity:工位剑仙:avatar-2',
    'candidate:C',
    'reroll',
    'back',
    'allocate:insight:1',
    'allocate:insight:-1',
    'reset',
    'finalize',
    'backfill',
  ]);
  component.unbindFacade();
}

testEightStepsAndValidation();
testDestinyAndAllocationProjection();
testBackfillViewModel();
testComponentRoutesControlsThroughFacade();
testComponentSurfacesFacadeFailure();
testEveryDisplayedActionHasAFacadeRoute();
console.log('V5.9-A/M character creation UI tests passed');
