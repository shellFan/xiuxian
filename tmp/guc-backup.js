"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const game_facade_1 = require("../../assets/scripts/facade/game-facade");
const view_models_1 = require("../../assets/scripts/ui/view-models");
const storage_adapter_1 = require("../../assets/scripts/services/storage-adapter");
const root = process.cwd();
const controllerSource = node_fs_1.default.readFileSync(node_path_1.default.join(root, 'assets/scripts/ui/game-ui-controller.ts'), 'utf8');
const controllerMetaSource = node_fs_1.default.readFileSync(node_path_1.default.join(root, 'assets/scripts/ui/game-ui-controller.ts.meta'), 'utf8');
const sceneSource = node_fs_1.default.readFileSync(node_path_1.default.join(root, 'assets/scenes/Main.scene'), 'utf8');
const sceneObjects = JSON.parse(sceneSource);
class FakeButton {
    constructor() {
        this.interactable = true;
        this.handlers = new Map();
    }
    on(event, callback) {
        const callbacks = this.handlers.get(event) ?? new Set();
        callbacks.add(callback);
        this.handlers.set(event, callbacks);
    }
    off(event, callback) {
        this.handlers.get(event)?.delete(callback);
    }
    click() {
        for (const callback of this.handlers.get('click') ?? [])
            callback();
    }
}
class FakeNode {
    constructor(name, components = new Map(), children = []) {
        this.name = name;
        this.components = components;
        this.children = children;
        this.active = true;
    }
    getChildByName(name) {
        return this.children.find((child) => child.name === name) ?? null;
    }
    getComponent(type) {
        return this.components.get(String(type)) ?? null;
    }
}
class FakeLabel {
    constructor() {
        this.string = '';
    }
}
function loadGameUiController(facade) {
    const moduleLoader = require('node:module');
    const originalLoad = moduleLoader._load;
    moduleLoader._load = (request, parent, isMain) => {
        if (request === 'cc') {
            class FakeComponent {
            }
            return {
                Component: FakeComponent,
                _decorator: { ccclass: () => (target) => target },
            };
        }
        if (request.endsWith('/cocos-bootstrap-component')) {
            return { CocosBootstrapComponent: { instance: { facade } } };
        }
        return originalLoad(request, parent, isMain);
    };
    try {
        const modulePath = require.resolve('../../assets/scripts/ui/game-ui-controller');
        delete require.cache[modulePath];
        return require(modulePath).GameUIController;
    }
    finally {
        moduleLoader._load = originalLoad;
    }
}
function createCraftScene() {
    let craftButton;
    let craftLabel;
    const recipeRows = Array.from({ length: 6 }, (_, index) => {
        const button = new FakeButton();
        const label = new FakeLabel();
        if (index === 0) {
            craftButton = button;
            craftLabel = label;
        }
        return new FakeNode(`CraftRecipeRow${index.toString().padStart(2, '0')}`, new Map([
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
function createHomeScene() {
    const labels = {};
    const labelNode = (name) => {
        const label = new FakeLabel();
        labels[name] = label;
        return new FakeNode(name, new Map([['cc.Label', label]]));
    };
    const buttonNode = (name) => new FakeNode(name, new Map([['cc.Button', new FakeButton()]]), [labelNode(`${name}Label`)]);
    const resourceChip = (name) => new FakeNode(name, new Map(), [labelNode(`${name}Label`)]);
    const resourceBar = new FakeNode('ResourceBar', new Map(), [
        labelNode('ResourceSummaryLabel'),
        resourceChip('ResourceCultivationChip'),
        resourceChip('ResourceSalaryChip'),
        resourceChip('ResourcePerformanceChip'),
        resourceChip('ResourceMindChip'),
    ]);
    const topHeader = new FakeNode('TopHeader', new Map(), [labelNode('CareerSummaryLabel')]);
    const character = new FakeNode('CharacterArea', new Map(), [labelNode('CharacterNameLabel'), labelNode('CharacterStatusLabel')]);
    const idle = new FakeNode('IdleIncomePanel', new Map(), [labelNode('WorkStatusLabel')]);
    const actions = new FakeNode('PrimaryActions', new Map(), [buttonNode('CultivateButton'), buttonNode('WorkButton'), buttonNode('FishButton')]);
    const bottom = new FakeNode('BottomNavigation', new Map(), ['TabHome', 'TabTasks', 'TabCraft', 'TabPromotion', 'TabMore'].map(buttonNode));
    const pages = ['HomePageContent', 'TasksPageContent', 'CraftPageContent', 'PromotionPageContent', 'MorePageContent']
        .map((name) => new FakeNode(name));
    const pageContainer = new FakeNode('PageContainer', new Map(), pages);
    return {
        root: new FakeNode('SafeAreaRoot', new Map(), [topHeader, resourceBar, character, idle, actions, bottom, pageContainer]),
        labels,
    };
}
function testControllerBindsTheCraftPresentationToTheRealFacade() {
    strict_1.default.match(controllerSource, /bindCraftPage\s*\(/);
    strict_1.default.match(controllerSource, /refreshCraftPage\s*\(/);
    strict_1.default.match(controllerSource, /onCraftClick\s*=/);
    strict_1.default.match(controllerSource, /facade\.craft\(/);
    strict_1.default.match(controllerSource, /材料/);
    strict_1.default.match(controllerSource, /产物/);
    strict_1.default.match(controllerSource, /bindCraftButton\s*\(/);
    strict_1.default.match(controllerSource, /button\.on\?\.\('click'/);
    strict_1.default.match(controllerSource, /CraftRecipeList/);
    strict_1.default.match(controllerSource, /CraftRecipeRow/);
    strict_1.default.doesNotMatch(controllerSource, /findChild\(this\.mergeBoardRoot/);
    strict_1.default.doesNotMatch(controllerSource, /BoardCell/);
    strict_1.default.match(controllerSource, /cultivation['"]?\s*:\s*['"]修为['"]/);
    strict_1.default.match(controllerSource, /mind['"]?\s*:\s*['"]道心['"]/);
    strict_1.default.match(controllerSource, /performance['"]?\s*:\s*['"]绩效['"]/);
    strict_1.default.doesNotMatch(controllerSource, /DragController|MergeBoardView|refreshBoard|onRecruitClick|animateMerge|touch-start|touch-end/);
}
function testControllerKeepsHomePresentationFacadeDriven() {
    for (const labelName of ['ResourceSummaryLabel', 'CharacterNameLabel', 'CharacterStatusLabel', 'WorkStatusLabel']) {
        strict_1.default.match(controllerSource, new RegExp(labelName));
    }
    strict_1.default.match(controllerSource, /facade\.snapshot\(\)/);
    strict_1.default.match(controllerSource, /灵石/);
    strict_1.default.match(controllerSource, /道心/);
    strict_1.default.match(controllerSource, /工资/);
}
function testControllerResolvesVisualCraftLayoutNodes() {
    strict_1.default.match(controllerMetaSource, /"uuid": "51652f12-07d4-4a5e-b028-59122dabc027"/);
    strict_1.default.match(sceneSource, /"__type__": "516528SB9RKXrAoWRItq8An"/);
    for (const nodeName of ['CraftPageContent', 'RecruitButton', 'MergeBoardRoot', 'CraftRecipeList']) {
        strict_1.default.match(controllerSource, new RegExp(nodeName));
        strict_1.default.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
    }
    for (let index = 0; index < 6; index += 1) {
        const nodeName = `CraftRecipeRow${index.toString().padStart(2, '0')}`;
        strict_1.default.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
    }
    const nodeNamed = (name) => {
        const entry = sceneObjects.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
        strict_1.default.ok(entry >= 0, `${name} must exist in Main.scene`);
        return [entry, sceneObjects[entry]];
    };
    const [craftIndex, craft] = nodeNamed('CraftPageContent');
    const [listIndex, list] = nodeNamed('CraftRecipeList');
    strict_1.default.deepEqual(list._parent, { __id__: craftIndex });
    strict_1.default.deepEqual(craft._children?.some((child) => child.__id__ === listIndex), true);
    for (let index = 0; index < 6; index += 1) {
        const [rowIndex, row] = nodeNamed(`CraftRecipeRow${index.toString().padStart(2, '0')}`);
        strict_1.default.deepEqual(row._parent, { __id__: listIndex });
        strict_1.default.deepEqual(list._children?.some((child) => child.__id__ === rowIndex), true);
        const transform = sceneObjects.find((object) => object.__type__ === 'cc.UITransform' && object.node?.__id__ === rowIndex);
        strict_1.default.ok(transform, `CraftRecipeRow${index.toString().padStart(2, '0')} needs a UITransform`);
        strict_1.default.ok((transform?._contentSize?.width ?? 0) >= 900, 'recipe rows must be wide enough for one readable line');
        strict_1.default.ok((transform?._contentSize?.height ?? 0) < 82, 'recipe rows must not use board-cell height');
        const rowComponentTypes = (row._components ?? [])
            .map((component) => sceneObjects[component.__id__ ?? -1]?.__type__);
        strict_1.default.ok(rowComponentTypes.includes('cc.Label'), 'recipe row must contain a label');
        strict_1.default.ok(rowComponentTypes.includes('cc.Button'), 'recipe row must contain a craft button');
    }
    for (let index = 0; index < 16; index += 1) {
        const nodeName = `BoardCell${index.toString().padStart(2, '0')}`;
        strict_1.default.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
    }
}
function testRealFacadeCraftsAndPersistsTheDisplayedRecipe() {
    const storage = new storage_adapter_1.MemoryStorageAdapter();
    const facade = new game_facade_1.GameFacade({ storage, board: null });
    const viewModel = (0, view_models_1.buildCraftViewModel)(facade);
    const recipe = viewModel.recipes.find((candidate) => candidate.canCraft) ?? viewModel.recipes[0];
    strict_1.default.ok(recipe, 'the real craft config should expose a recipe');
    facade.context.player.cultivationExp = recipe.costCultivation;
    facade.context.player.spiritStones = recipe.costSpiritStones;
    const result = facade.craft(recipe.id);
    strict_1.default.equal(result.success, true);
    strict_1.default.equal(facade.queryCraftedCount(recipe.id), 1);
    const saved = JSON.parse(storage.getItem('game-save') ?? '{}');
    strict_1.default.deepEqual(saved.craftedItemIds, [recipe.id]);
}
function testBoundCraftButtonUsesRealFacadeAndRefreshesPresentation() {
    const storage = new storage_adapter_1.MemoryStorageAdapter();
    const facade = new game_facade_1.GameFacade({ storage, board: null });
    // Web V1 设计图: 丹药页首条配方为聚气丹 (entry-level)。
    const recipe = (0, view_models_1.buildCraftViewModel)(facade).recipes.find((candidate) => candidate.id === 'pill_juqi');
    strict_1.default.ok(recipe, 'the entry-level craft recipe should be available');
    facade.context.player.cultivationExp = recipe.costCultivation;
    facade.context.player.spiritStones = recipe.costSpiritStones;
    const scene = createCraftScene();
    const GameUIController = loadGameUiController(facade);
    const controller = new GameUIController();
    controller.node = scene.root;
    controller.onLoad();
    strict_1.default.equal(scene.root.getChildByName('PageContainer')?.getChildByName('CraftPageContent')?.getChildByName('MergeBoardRoot')?.active, false);
    strict_1.default.match(scene.label.string, /聚气丹/);
    strict_1.default.match(scene.label.string, /材料:/);
    strict_1.default.match(scene.label.string, /产物: 修为\+150/);
    strict_1.default.match(scene.label.string, /\[合成\]/);
    scene.button.click();
    strict_1.default.equal(facade.queryCraftedCount(recipe.id), 1);
    const saved = JSON.parse(storage.getItem('game-save') ?? '{}');
    strict_1.default.deepEqual(saved.craftedItemIds, [recipe.id]);
    strict_1.default.match(scene.label.string, /\[修为不足\]/);
    strict_1.default.equal(scene.button.interactable, false);
}
function testHomeResourceChipsRefreshFromLiveFacadeState() {
    const facade = new game_facade_1.GameFacade({ storage: new storage_adapter_1.MemoryStorageAdapter(), board: null });
    const scene = createHomeScene();
    const GameUIController = loadGameUiController(facade);
    const controller = new GameUIController();
    controller.node = scene.root;
    controller.onLoad();
    facade.context.player.cultivationExp = 37;
    facade.context.player.salary = 128;
    facade.context.player.performance = 9;
    facade.context.player.mind = 64;
    facade.context.player.maxMind = 100;
    controller.refreshAll();
    const hud = (0, view_models_1.buildMainHUDViewModel)(facade);
    const snapshot = facade.snapshot();
    strict_1.default.equal(scene.labels.ResourceCultivationChipLabel.string, `修为\n${hud.cultivationExp}/${hud.cultivationRequired}`);
    strict_1.default.equal(scene.labels.ResourceSalaryChipLabel.string, `工资\n${snapshot.salary}`);
    strict_1.default.equal(scene.labels.ResourcePerformanceChipLabel.string, `绩效\n${snapshot.performance}`);
    strict_1.default.equal(scene.labels.ResourceMindChipLabel.string, `道心\n${snapshot.mind}/${snapshot.maxMind}`);
}
testControllerBindsTheCraftPresentationToTheRealFacade();
testControllerKeepsHomePresentationFacadeDriven();
testControllerResolvesVisualCraftLayoutNodes();
testRealFacadeCraftsAndPersistsTheDisplayedRecipe();
testBoundCraftButtonUsesRealFacadeAndRefreshesPresentation();
testHomeResourceChipsRefreshFromLiveFacadeState();
console.log('game UI controller tests passed');
