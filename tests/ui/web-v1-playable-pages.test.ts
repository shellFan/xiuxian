import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

type SceneRef = { __id__?: number };

type SceneObject = {
  __type__?: string;
  _name?: string;
  _active?: boolean;
  _enabled?: boolean;
  _interactable?: boolean;
  _string?: string;
  _children?: SceneRef[];
  _components?: SceneRef[];
};

const workspaceRoot = fs.existsSync(path.resolve(process.cwd(), 'assets/scenes/Main.scene'))
  ? process.cwd()
  : path.resolve(__dirname, '..', '..', '..');
const scenePath = path.resolve(workspaceRoot, 'assets/scenes/Main.scene');
const controllerPath = path.resolve(workspaceRoot, 'assets/scripts/ui/game-ui-controller.ts');
const sceneObjects = JSON.parse(fs.readFileSync(scenePath, 'utf8')) as SceneObject[];
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

function objectAt(id: number | undefined): SceneObject | undefined {
  return id === undefined ? undefined : sceneObjects[id];
}

function nodeNamed(name: string): number {
  const index = sceneObjects.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  assert.ok(index >= 0, `${name} must exist in Main.scene`);
  return index;
}

function childNodeIds(nodeIndex: number): number[] {
  return (sceneObjects[nodeIndex]?._children ?? [])
    .map((child) => child.__id__)
    .filter((id): id is number => id !== undefined);
}

function directChildNamed(parentIndex: number, name: string): number {
  const childIndex = childNodeIds(parentIndex).find((id) => objectAt(id)?._name === name);
  assert.ok(childIndex !== undefined, `${name} must be a direct child of ${sceneObjects[parentIndex]?._name}`);
  return childIndex;
}

function componentTypes(nodeIndex: number): string[] {
  return (sceneObjects[nodeIndex]?._components ?? [])
    .map((component) => objectAt(component.__id__)?.__type__)
    .filter((type): type is string => type !== undefined);
}

function hasVisibleLabelOrButton(nodeIndex: number, isRoot = true): boolean {
  const node = sceneObjects[nodeIndex];
  if (!node || (!isRoot && node._active === false)) return false;

  for (const componentRef of node._components ?? []) {
    const component = objectAt(componentRef.__id__);
    if (!component || component._enabled === false) continue;
    if (component.__type__ === 'cc.Label' && (component._string ?? '').trim().length > 0) return true;
    if (component.__type__ === 'cc.Button' && component._interactable !== false) return true;
  }

  return childNodeIds(nodeIndex).some((childIndex) => hasVisibleLabelOrButton(childIndex, false));
}

function descendantLabelTexts(nodeIndex: number, isRoot = true): string[] {
  const node = sceneObjects[nodeIndex];
  if (!node || (!isRoot && node._active === false)) return [];

  const texts = (node._components ?? [])
    .map((componentRef) => objectAt(componentRef.__id__))
    .filter((component) => component?.__type__ === 'cc.Label')
    .map((component) => component?._string?.trim() ?? '')
    .filter((text) => text.length > 0);

  return texts.concat(...childNodeIds(nodeIndex).map((childIndex) => descendantLabelTexts(childIndex, false)));
}

function hasButton(nodeIndex: number, isRoot = true): boolean {
  const node = sceneObjects[nodeIndex];
  if (!node || (!isRoot && node._active === false)) return false;
  if (componentTypes(nodeIndex).includes('cc.Button')) return true;
  return childNodeIds(nodeIndex).some((childIndex) => hasButton(childIndex, false));
}

test('WEB V1 scene exposes five page contracts with visible labels or buttons', () => {
  const pageContainer = nodeNamed('PageContainer');
  const pages = ['HomePageContent', 'TasksPageContent', 'CraftPageContent', 'PromotionPageContent', 'MorePageContent'];

  for (const pageName of pages) {
    const page = directChildNamed(pageContainer, pageName);
    assert.equal(sceneObjects[page]?._active, pageName === 'HomePageContent', `${pageName} startup visibility`);
    if (pageName !== 'HomePageContent') {
      assert.equal(hasVisibleLabelOrButton(page), true, `${pageName} needs a visible label or button in its content`);
    }
  }

  // HomePageContent is the page marker; the playable home presentation is its sibling chrome.
  const safeAreaRoot = nodeNamed('SafeAreaRoot');
  for (const homeRootName of ['TopHeader', 'ResourceBar', 'CharacterArea', 'IdleIncomePanel', 'PrimaryActions']) {
    const homeRoot = directChildNamed(safeAreaRoot, homeRootName);
    assert.equal(sceneObjects[homeRoot]?._active, true, `${homeRootName} must be visible for the home loop`);
    assert.equal(hasVisibleLabelOrButton(homeRoot), true, `${homeRootName} needs a visible label or button`);
  }

  const primaryActions = directChildNamed(safeAreaRoot, 'PrimaryActions');
  for (const buttonName of ['CultivateButton', 'WorkButton', 'FishButton']) {
    const button = directChildNamed(primaryActions, buttonName);
    assert.ok(componentTypes(button).includes('cc.Button'), `${buttonName} must be a Button`);
    assert.ok(descendantLabelTexts(button).length > 0, `${buttonName} must have a non-empty label`);
  }
});

test('WEB V1 scene exposes all five playable Tab buttons with visible labels', () => {
  const bottomNavigation = nodeNamed('BottomNavigation');
  const tabs: Array<[string, string]> = [
    ['TabHome', '首页'],
    ['TabTasks', '任务'],
    ['TabCraft', '合成'],
    ['TabPromotion', '晋升'],
    ['TabMore', '更多'],
  ];

  for (const [tabName, expectedLabel] of tabs) {
    const tab = directChildNamed(bottomNavigation, tabName);
    assert.equal(sceneObjects[tab]?._active, true, `${tabName} must be visible`);
    assert.ok(componentTypes(tab).includes('cc.Button'), `${tabName} must have a cc.Button`);
    assert.ok(descendantLabelTexts(tab).includes(expectedLabel), `${tabName} must show ${expectedLabel}`);
  }
});

test('GameUIController binds the V1 facade commands, Tab clicks, and page visibility', () => {
  assert.match(controllerSource, /const PC_TABS:\s*readonly PcTab\[\]\s*=\s*\['HOME', 'TASKS', 'CRAFT', 'PROMOTION', 'MORE'\]/);
  assert.match(controllerSource, /this\.cultivateButton\?\.on\?\.\('click', this\.onCultivateClick/);
  assert.match(controllerSource, /this\.workButton\?\.on\?\.\('click', this\.onWorkClick/);
  assert.match(controllerSource, /this\.fishButton\?\.on\?\.\('click', this\.onFishClick/);
  assert.match(controllerSource, /this\.facade\.cultivate\(\)/);
  assert.match(controllerSource, /this\.facade\.changeWorkMode\('WORK'\)/);
  assert.match(controllerSource, /this\.facade\.changeWorkMode\('FISHING'\)/);
  assert.match(controllerSource, /this\.facade\.craft\(recipeId\)/);
  assert.match(controllerSource, /(?:const handler = )?\(\) => this\.onTabClick\(tab\)/);
  assert.match(controllerSource, /btn\.on\?\.\('click', (?:handler|\(\) => this\.onTabClick\(tab\))/);
  assert.match(controllerSource, /this\.currentTab = tab;/);
  assert.match(controllerSource, /node\.active = tab === this\.currentTab;/);
  assert.match(controllerSource, /if \(this\.characterArea\) this\.characterArea\.active = home;/);
  assert.match(controllerSource, /if \(this\.idleIncomePanel\) this\.idleIncomePanel\.active = home;/);
  assert.match(controllerSource, /if \(this\.primaryActions\) this\.primaryActions\.active = home;/);
});

test('PC V1 keeps the board out of the interaction loop and adds no drag binding', () => {
  assert.doesNotMatch(
    controllerSource,
    /DragController|MergeBoardView|BoardCell|onRecruitClick|animateMerge|TOUCH_(?:START|MOVE|END)|touch-start|touch-end|pointerdown|pointermove|pointerup/i,
  );
  assert.match(controllerSource, /this\.mergeBoardRoot = this\.findChild\(this\.craftPageContent, 'MergeBoardRoot'\)/);
  assert.match(controllerSource, /if \(this\.mergeBoardRoot\) this\.mergeBoardRoot\.active = false;/);
});
