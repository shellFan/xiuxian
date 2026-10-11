import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

import type {
  CharacterCreationDraft,
  CharacterCreationResult,
  CharacterCreationView,
} from '../../assets/scripts/v59/character-creation-service';
import type { CharacterStats, StatKey } from '../../assets/scripts/v59/character-rules';

class FakeEventNode {
  public active = true;
  public parent: FakeEventNode | null = null;
  public readonly children: FakeEventNode[] = [];
  public readonly components = new Map<unknown, unknown>();
  private readonly events = new Map<string, Set<() => void>>();

  public constructor(public readonly name: string) {}

  public addChild(child: FakeEventNode): void {
    child.parent = this;
    this.children.push(child);
  }

  public addComponent<T extends { node?: FakeEventNode }>(Type: new () => T): T {
    const component = new Type();
    component.node = this;
    this.components.set(Type, component);
    this.components.set(`cc.${Type.name}`, component);
    return component;
  }

  public getComponent(type: unknown): unknown {
    return this.components.get(type) ?? this.components.get(String(type)) ?? null;
  }

  public getChildByName(name: string): FakeEventNode | null {
    return this.children.find((child) => child.name === name) ?? null;
  }

  public on(event: string, callback: () => void): void {
    const callbacks = this.events.get(event) ?? new Set<() => void>();
    callbacks.add(callback);
    this.events.set(event, callbacks);
  }

  public off(event: string, callback: () => void): void {
    this.events.get(event)?.delete(callback);
  }

  public emit(event: string): void {
    for (const callback of [...(this.events.get(event) ?? [])]) callback();
  }

  public setPosition(): void {}
  public setSiblingIndex(): void {}
  public destroy(): void { this.active = false; }
}

class FakeComponent { public node!: FakeEventNode; }
class FakeUITransform { public node?: FakeEventNode; public setContentSize(): void {} }
class FakeLabel { public node?: FakeEventNode; public string = ''; }
class FakeButton { public node?: FakeEventNode; public interactable = true; }
class FakeSprite { public node?: FakeEventNode; public color?: unknown; }
class FakeWidget { public node?: FakeEventNode; public isAlignTop = false; public isAlignBottom = false; public isAlignLeft = false; public isAlignRight = false; public top = 0; public bottom = 0; public left = 0; public right = 0; }
class FakeEditBox { public node?: FakeEventNode; public string = ''; public textLabel?: FakeLabel; public placeholderLabel?: FakeLabel; }
class FakeColor { public constructor(..._channels: number[]) {} }

const moduleApi = Module as unknown as {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalLoad = moduleApi._load;

const EMPTY: CharacterStats = {
  insight: 0,
  constitution: 0,
  perception: 0,
  fortune: 0,
  willpower: 0,
};

function creationDraft(): CharacterCreationDraft {
  return {
    rulesVersion: 'v59a.1',
    mode: 'CREATE',
    seed: 59,
    step: 'INDUSTRY',
    professionId: 'JAVA_BACKEND',
    professionConfirmed: false,
    nickname: '工位剑仙',
    avatarId: 'avatar-1',
    candidates: [
      { id: 'A', destinyId: 'LABOR_SAINT', attributes: { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 } },
      { id: 'B', destinyId: 'CODE_SPIRIT', attributes: { insight: 16, constitution: 10, perception: 10, fortune: 7, willpower: 7 } },
      { id: 'C', destinyId: 'FISHING_IMMORTAL', attributes: { insight: 9, constitution: 9, perception: 8, fortune: 16, willpower: 8 } },
    ],
    candidateHistory: [],
    rerollsUsed: 0,
    allocation: { ...EMPTY },
    startedAt: 1000,
  };
}

class FakeFacade {
  public state: CharacterCreationView = {
    status: 'CREATION_REQUIRED',
    isNewCharacterCreationRequired: true,
    draft: creationDraft(),
  };
  public readonly calls: string[] = [];
  public onboarding = { step: 'COMPLETE', title: '入职剧情已完成', body: '', firstTaskTitle: '' };

  public queryCharacterCreation(): CharacterCreationView { return this.state; }
  public characterCreationSelectIndustry(id: string): CharacterCreationResult {
    this.calls.push(`industry:${id}`);
    const draft = this.state.draft!;
    this.state = { ...this.state, draft: { ...draft, industry: 'INTERNET' } };
    return { success: true, draft: this.state.draft };
  }
  public characterCreationSelectDirection(): CharacterCreationResult { return { success: true }; }
  public characterCreationSelectProfession(): CharacterCreationResult { return { success: true }; }
  public characterCreationSetIdentity(nickname: string, avatarId: string): CharacterCreationResult {
    this.calls.push(`identity:${nickname}:${avatarId}`);
    return { success: true };
  }
  public characterCreationSetBackground(): CharacterCreationResult { return { success: true }; }
  public characterCreationSelectCandidate(): CharacterCreationResult { return { success: true }; }
  public characterCreationReroll(): CharacterCreationResult { return { success: true }; }
  public characterCreationAllocate(_stat: StatKey, _delta: number): CharacterCreationResult { return { success: true }; }
  public characterCreationResetAllocation(): CharacterCreationResult { return { success: true }; }
  public characterCreationAdvance(): CharacterCreationResult { return { success: true }; }
  public characterCreationBack(): CharacterCreationResult { return { success: true }; }
  public characterCreationFinalize(): CharacterCreationResult {
    this.state = { status: 'COMPLETE', isNewCharacterCreationRequired: false };
    this.onboarding = { step: 'INTRO_1', title: '恭喜你通过牛马宗入门考核', body: '灵根已登记，工位结界正在为你开启。', firstTaskTitle: '第一张工单：排查接口异常' };
    return { success: true };
  }
  public characterCreationCompleteBackfill(): CharacterCreationResult { return { success: true }; }
  public queryCharacterOnboarding() { return this.onboarding; }
  public characterCreationAdvanceOnboarding(): CharacterCreationResult {
    this.calls.push('onboarding:advance');
    this.onboarding = { ...this.onboarding, step: 'INTRO_2', title: '工牌已发', body: '你的职业、天命与先天属性会共同影响日常成长。' };
    return { success: true };
  }
  public characterCreationSkipOnboarding(): CharacterCreationResult {
    this.calls.push('onboarding:skip');
    this.onboarding = { ...this.onboarding, step: 'COMPLETE' };
    return { success: true };
  }
  public characterCreationStartGame(): CharacterCreationResult {
    this.calls.push('onboarding:start');
    this.onboarding = { ...this.onboarding, step: 'COMPLETE' };
    return { success: true };
  }
}

function childNamed(root: FakeEventNode, name: string): FakeEventNode {
  const direct = root.getChildByName(name);
  if (direct) return direct;
  for (const child of root.children) {
    const nested = (() => {
      try { return childNamed(child, name); } catch { return null; }
    })();
    if (nested) return nested;
  }
  throw new Error(`Missing runtime node ${name}`);
}

function testControllerOwnsTheRuntimeMount(): void {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'assets/scripts/ui/game-ui-controller.ts'),
    'utf8',
  );
  assert.match(source, /mountCharacterCreationRuntimeView/);
  assert.doesNotMatch(source, /if\s*\(!creationRequired\)\s*\{[^}]*return;/s,
    'completed character creation must still let the runtime view resume unfinished onboarding');
}

function testRuntimeViewMountsRoutesAndRestores(): void {
  moduleApi._load = function (request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === 'cc') {
      return {
        _decorator: { ccclass: () => (target: unknown) => target, property: () => () => {} },
        Component: FakeComponent,
        Node: FakeEventNode,
        UITransform: FakeUITransform,
        Label: FakeLabel,
        Button: FakeButton,
        Sprite: FakeSprite,
        Widget: FakeWidget,
        EditBox: FakeEditBox,
        Color: FakeColor,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../../assets/scripts/ui/character-creation-runtime-view');
    delete require.cache[modulePath];
    const { mountCharacterCreationRuntimeView } = require(modulePath) as {
      mountCharacterCreationRuntimeView(
        parent: unknown,
        facade: FakeFacade,
        onVisibilityChanged: (visible: boolean) => void,
      ): {
        root: FakeEventNode;
        controller: { refresh(): void };
        destroy(): void;
      } | null;
    };
    const parent = new FakeEventNode('SafeAreaRoot');
    const facade = new FakeFacade();
    const visibility: boolean[] = [];

    const mounted = mountCharacterCreationRuntimeView(
      parent as never,
      facade,
      (visible: boolean) => visibility.push(visible),
    );

    assert.ok(mounted, 'creation-required state mounts a runtime Cocos view');
    assert.equal(parent.children[0]?.name, 'V59CharacterCreationWizard');
    assert.equal(mounted.root.active, true);
    assert.deepEqual(visibility, [true]);

    childNamed(parent, 'CreationOptionButton0').emit('click');
    assert.deepEqual(facade.calls, ['industry:INTERNET']);

    facade.state = {
      status: 'CREATION_REQUIRED',
      isNewCharacterCreationRequired: true,
      draft: {
        ...creationDraft(),
        step: 'IDENTITY',
        industry: 'INTERNET',
        direction: 'TECH_RND',
        background: 'ORDINARY_WORKER',
      },
    };
    mounted.controller.refresh();
    const nicknameNode = childNamed(parent, 'CreationNicknameInput');
    const nicknameInput = nicknameNode.components.get(FakeEditBox) as FakeEditBox;
    nicknameInput.string = '新晋剑仙';
    nicknameNode.emit('editing-did-ended');
    assert.deepEqual(facade.calls, ['industry:INTERNET', 'identity:新晋剑仙:avatar-1']);

    facade.state = { status: 'COMPLETE', isNewCharacterCreationRequired: false };
    facade.onboarding = { step: 'INTRO_1', title: '恭喜你通过牛马宗入门考核', body: '灵根已登记，工位结界正在为你开启。', firstTaskTitle: '第一张工单：排查接口异常' };
    mounted.controller.refresh();
    assert.equal(mounted.root.active, false);
    assert.equal(childNamed(parent, 'CharacterOnboardingRoot').active, true);
    assert.deepEqual(visibility, [true]);
    facade.characterCreationAdvanceOnboarding = () => ({ success: false, reason: '剧情保存失败' });
    childNamed(parent, 'CharacterOnboardingNextButton').emit('click');
    assert.equal((childNamed(parent, 'CharacterOnboardingError').components.get(FakeLabel) as FakeLabel).string, '剧情保存失败');
    facade.characterCreationAdvanceOnboarding = FakeFacade.prototype.characterCreationAdvanceOnboarding.bind(facade);
    childNamed(parent, 'CharacterOnboardingNextButton').emit('click');
    assert.deepEqual(facade.calls.slice(-1), ['onboarding:advance']);
    childNamed(parent, 'CharacterOnboardingSkipButton').emit('click');
    assert.equal(childNamed(parent, 'CharacterOnboardingRoot').active, false);
    assert.deepEqual(visibility, [true, false]);

    mounted.destroy();

    const resumedFacade = new FakeFacade();
    resumedFacade.state = { status: 'COMPLETE', isNewCharacterCreationRequired: false };
    resumedFacade.onboarding = { step: 'INTRO_3', title: '宗门规矩第一条', body: '需求可以改，工资不能问。', firstTaskTitle: '第一张工单：排查接口异常' };
    const resumedParent = new FakeEventNode('SafeAreaRoot');
    const resumed = mountCharacterCreationRuntimeView(resumedParent as never, resumedFacade, (visible) => visibility.push(visible));
    assert.ok(resumed, 'unfinished onboarding is restored after restarting');
    assert.equal(childNamed(resumedParent, 'CharacterOnboardingRoot').active, true);
    assert.equal((childNamed(resumedParent, 'CharacterOnboardingTitle').components.get(FakeLabel) as FakeLabel | undefined)?.string, '宗门规矩第一条');
    resumed.destroy();
  } finally {
    moduleApi._load = originalLoad;
  }
}

testControllerOwnsTheRuntimeMount();
testRuntimeViewMountsRoutesAndRestores();
console.log('V5.9-A Cocos character creation runtime tests passed');
