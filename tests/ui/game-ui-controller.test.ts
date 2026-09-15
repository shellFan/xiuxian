import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { buildCraftViewModel } from '../../assets/scripts/ui/view-models';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const root = process.cwd();
const controllerSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/game-ui-controller.ts'), 'utf8');
const controllerMetaSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/game-ui-controller.ts.meta'), 'utf8');
const sceneSource = fs.readFileSync(path.join(root, 'assets/scenes/Main.scene'), 'utf8');
type SceneObject = {
  __type__?: string;
  _name?: string;
  _parent?: { __id__?: number };
  _children?: Array<{ __id__?: number }>;
  _components?: Array<{ __id__?: number }>;
  node?: { __id__?: number };
  _contentSize?: { width?: number; height?: number };
};
const sceneObjects = JSON.parse(sceneSource) as SceneObject[];

class FakeButton {
  public interactable = true;
  private readonly handlers = new Map<string, Set<() => void>>();

  public on(event: string, callback: () => void): void {
    const callbacks = this.handlers.get(event) ?? new Set<() => void>();
    callbacks.add(callback);
    this.handlers.set(event, callbacks);
  }

  public off(event: string, callback: () => void): void {
    this.handlers.get(event)?.delete(callback);
  }

  public click(): void {
    for (const callback of this.handlers.get('click') ?? []) callback();
  }
}

class FakeNode {
  public active = true;

  public constructor(
    public readonly name: string,
    private readonly components: ReadonlyMap<string, unknown> = new Map(),
    public readonly children: readonly FakeNode[] = [],
  ) {}

  public getChildByName(name: string): FakeNode | null {
    return this.children.find((child) => child.name === name) ?? null;
  }

  public getComponent(type: unknown): unknown {
    return this.components.get(String(type)) ?? null;
  }
}

class FakeLabel {
  public string = '';
}

interface ModuleLoader {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
}

function loadGameUiController(facade: GameFacade): { new(): unknown } {
  const moduleLoader = require('node:module') as ModuleLoader;
  const originalLoad = moduleLoader._load;
  moduleLoader._load = (request, parent, isMain) => {
    if (request === 'cc') {
      class FakeComponent {
        public node!: FakeNode;
      }
      return {
        Component: FakeComponent,
        _decorator: { ccclass: () => (target: unknown) => target },
      };
    }
    if (request.endsWith('/cocos-bootstrap-component')) {
      return { CocosBootstrapComponent: { instance: { facade } } };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require('../../assets/scripts/ui/game-ui-controller').GameUIController as { new(): unknown };
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function createCraftScene(): { root: FakeNode; button: FakeButton; label: FakeLabel } {
  let craftButton!: FakeButton;
  let craftLabel!: FakeLabel;
  const recipeRows = Array.from({ length: 6 }, (_, index) => {
    const button = new FakeButton();
    const label = new FakeLabel();
    if (index === 0) {
      craftButton = button;
      craftLabel = label;
    }
    return new FakeNode(`CraftRecipeRow${index.toString().padStart(2, '0')}`, new Map<string, unknown>([
      ['cc.Button', button],
      ['cc.Label', label],
    ]));
  });
  const craftRecipeList = new FakeNode('CraftRecipeList', new Map(), recipeRows);
  const mergeBoardRoot = new FakeNode('MergeBoardRoot');
  const craftPage = new FakeNode('CraftPageContent', new Map(), [craftRecipeList, mergeBoardRoot]);
  const pageContainer = new FakeNode('PageContainer', new Map(), [craftPage]);
  return {
    root: new FakeNode('SafeAreaRoot', new Map(), [pageContainer]),
    button: craftButton,
    label: craftLabel,
  };
}

function testControllerBindsTheCraftPresentationToTheRealFacade(): void {
  assert.match(controllerSource, /bindCraftPage\s*\(/);
  assert.match(controllerSource, /refreshCraftPage\s*\(/);
  assert.match(controllerSource, /onCraftClick\s*=/);
  assert.match(controllerSource, /facade\.craft\(/);
  assert.match(controllerSource, /材料/);
  assert.match(controllerSource, /产物/);
  assert.match(controllerSource, /bindCraftButton\s*\(/);
  assert.match(controllerSource, /button\.on\?\.\('click'/);
  assert.match(controllerSource, /CraftRecipeList/);
  assert.match(controllerSource, /CraftRecipeRow/);
  assert.doesNotMatch(controllerSource, /findChild\(this\.mergeBoardRoot/);
  assert.doesNotMatch(controllerSource, /BoardCell/);
  assert.match(controllerSource, /cultivation['"]?\s*:\s*['"]修为['"]/);
  assert.match(controllerSource, /mind['"]?\s*:\s*['"]道心['"]/);
  assert.match(controllerSource, /performance['"]?\s*:\s*['"]绩效['"]/);
  assert.doesNotMatch(controllerSource, /DragController|MergeBoardView|refreshBoard|onRecruitClick|animateMerge|touch-start|touch-end/);
}

function testControllerResolvesVisualCraftLayoutNodes(): void {
  assert.match(controllerMetaSource, /"uuid": "51652f12-07d4-4a5e-b028-59122dabc027"/);
  assert.match(sceneSource, /"__type__": "516528SB9RKXrAoWRItq8An"/);
  for (const nodeName of ['CraftPageContent', 'RecruitButton', 'MergeBoardRoot', 'CraftRecipeList']) {
    assert.match(controllerSource, new RegExp(nodeName));
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
  for (let index = 0; index < 6; index += 1) {
    const nodeName = `CraftRecipeRow${index.toString().padStart(2, '0')}`;
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
  const nodeNamed = (name: string): [number, SceneObject] => {
    const entry = sceneObjects.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
    assert.ok(entry >= 0, `${name} must exist in Main.scene`);
    return [entry, sceneObjects[entry]];
  };
  const [craftIndex, craft] = nodeNamed('CraftPageContent');
  const [listIndex, list] = nodeNamed('CraftRecipeList');
  assert.deepEqual(list._parent, { __id__: craftIndex });
  assert.deepEqual(craft._children?.some((child) => child.__id__ === listIndex), true);
  for (let index = 0; index < 6; index += 1) {
    const [rowIndex, row] = nodeNamed(`CraftRecipeRow${index.toString().padStart(2, '0')}`);
    assert.deepEqual(row._parent, { __id__: listIndex });
    assert.deepEqual(list._children?.some((child) => child.__id__ === rowIndex), true);
    const transform = sceneObjects.find((object) => object.__type__ === 'cc.UITransform' && object.node?.__id__ === rowIndex);
    assert.ok(transform, `CraftRecipeRow${index.toString().padStart(2, '0')} needs a UITransform`);
    assert.ok((transform?._contentSize?.width ?? 0) >= 900, 'recipe rows must be wide enough for one readable line');
    assert.ok((transform?._contentSize?.height ?? 0) < 82, 'recipe rows must not use board-cell height');
    const rowComponentTypes = (row._components ?? [])
      .map((component) => sceneObjects[component.__id__ ?? -1]?.__type__);
    assert.ok(rowComponentTypes.includes('cc.Label'), 'recipe row must contain a label');
    assert.ok(rowComponentTypes.includes('cc.Button'), 'recipe row must contain a craft button');
  }
  for (let index = 0; index < 16; index += 1) {
    const nodeName = `BoardCell${index.toString().padStart(2, '0')}`;
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
}

function testRealFacadeCraftsAndPersistsTheDisplayedRecipe(): void {
  const storage = new MemoryStorageAdapter();
  const facade = new GameFacade({ storage, board: null });
  const viewModel = buildCraftViewModel(facade);
  const recipe = viewModel.recipes.find((candidate) => candidate.canCraft) ?? viewModel.recipes[0];

  assert.ok(recipe, 'the real craft config should expose a recipe');
  facade.context.player.cultivationExp = recipe.costCultivation;
  facade.context.player.spiritStones = recipe.costSpiritStones;

  const result = facade.craft(recipe.id);

  assert.equal(result.success, true);
  assert.equal(facade.queryCraftedCount(recipe.id), 1);
  const saved = JSON.parse(storage.getItem('game-save') ?? '{}') as { craftedItemIds?: string[] };
  assert.deepEqual(saved.craftedItemIds, [recipe.id]);
}

function testBoundCraftButtonUsesRealFacadeAndRefreshesPresentation(): void {
  const storage = new MemoryStorageAdapter();
  const facade = new GameFacade({ storage, board: null });
  const recipe = buildCraftViewModel(facade).recipes.find((candidate) => candidate.id === 'pill_lingshen');
  assert.ok(recipe, 'the entry-level craft recipe should be available');
  facade.context.player.cultivationExp = recipe.costCultivation;
  facade.context.player.spiritStones = recipe.costSpiritStones;

  const scene = createCraftScene();
  const GameUIController = loadGameUiController(facade);
  const controller = new GameUIController() as { node: FakeNode; onLoad(): void };
  controller.node = scene.root;
  controller.onLoad();

  assert.equal(scene.root.getChildByName('PageContainer')?.getChildByName('CraftPageContent')?.getChildByName('MergeBoardRoot')?.active, false);
  assert.match(scene.label.string, /灵参丹/);
  assert.match(scene.label.string, /材料:/);
  assert.match(scene.label.string, /产物: 修为\+50/);
  assert.match(scene.label.string, /\[合成\]/);
  scene.button.click();

  assert.equal(facade.queryCraftedCount(recipe.id), 1);
  const saved = JSON.parse(storage.getItem('game-save') ?? '{}') as { craftedItemIds?: string[] };
  assert.deepEqual(saved.craftedItemIds, [recipe.id]);
  assert.match(scene.label.string, /\[修为不足\]/);
  assert.equal(scene.button.interactable, false);
}

testControllerBindsTheCraftPresentationToTheRealFacade();
testControllerResolvesVisualCraftLayoutNodes();
testRealFacadeCraftsAndPersistsTheDisplayedRecipe();
testBoundCraftButtonUsesRealFacadeAndRefreshesPresentation();
console.log('game UI controller tests passed');
