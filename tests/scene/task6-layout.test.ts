import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

type SceneRef = { __id__: number };
type SceneObject = {
  __type__?: string;
  _name?: string;
  _parent?: SceneRef;
  _children?: SceneRef[];
  _components?: SceneRef[];
  _lpos?: { x: number; y: number; z: number };
  [key: string]: unknown;
};

const scene = JSON.parse(fs.readFileSync('assets/scenes/Main.scene', 'utf8')) as SceneObject[];

function nodeNamed(name: string): { index: number; node: SceneObject } {
  const index = scene.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  assert.ok(index >= 0, `${name} must exist in Main.scene`);
  return { index, node: scene[index] };
}

function componentOf(node: SceneObject, type: string): SceneObject {
  const component = (node._components ?? [])
    .map((ref) => scene[ref.__id__])
    .find((object) => object?.__type__ === type);
  assert.ok(component, `${node._name} must have ${type}`);
  return component;
}

function sizeOf(node: SceneObject): { width: number; height: number } {
  const transform = componentOf(node, 'cc.UITransform');
  return transform._contentSize as { width: number; height: number };
}

function widgetOf(node: SceneObject): SceneObject {
  return componentOf(node, 'cc.Widget');
}

function verticalBand(name: string): { top: number; bottom: number } {
  const { node } = nodeNamed(name);
  const size = sizeOf(node);
  const y = node._lpos?.y ?? 0;
  return { top: 640 - y - size.height / 2, bottom: 640 - y + size.height / 2 };
}

function centerOf(index: number): number {
  const node = scene[index];
  const widget = (node._components ?? [])
    .map((ref) => scene[ref.__id__])
    .find((object) => object?.__type__ === 'cc.Widget');
  if (widget) {
    const band = verticalBand(node._name as string);
    return (band.top + band.bottom) / 2;
  }
  const parent = node._parent?.__id__;
  assert.ok(typeof parent === 'number', `${node._name} must have a parent or Widget`);
  // Cocos UI uses a bottom-up local Y axis, while verticalBand() exposes
  // screen-space coordinates measured from the top of the 1280px canvas.
  return centerOf(parent) - (node._lpos?.y ?? 0);
}

function absoluteBand(name: string): { top: number; bottom: number } {
  const { index } = nodeNamed(name);
  const size = sizeOf(scene[index]);
  const center = centerOf(index);
  return { top: center - size.height / 2, bottom: center + size.height / 2 };
}

function assertSeparated(upper: { top: number; bottom: number }, lower: { top: number; bottom: number }, gap: number, label: string): void {
  assert.ok(upper.bottom + gap <= lower.top, `${label} must have at least ${gap}px separation`);
}

test('Task 6 keeps the scene and desktop canvas on one 720x1280 portrait composition', () => {
  const canvas = scene.find((object) => object.__type__ === 'cc.Canvas');
  assert.ok(canvas, 'Main.scene must contain a Canvas');
  assert.deepEqual(canvas._designResolution, { __type__: 'cc.Size', width: 720, height: 1280 });
  assert.equal(canvas._fitWidth, false, 'portrait Canvas must not adapt the design width to the viewport');
  assert.equal(canvas._fitHeight, false, 'portrait Canvas must not adapt the design height to the viewport');

  const patcher = fs.readFileSync('desktop/patch-html.cjs', 'utf8');
  assert.match(patcher, /GAME_WIDTH\s*=\s*720/);
  assert.match(patcher, /GAME_HEIGHT\s*=\s*1280/);
  assert.match(patcher, /height="\$\{GAME_HEIGHT\}"/);
});

test('Task 6 keeps PageContainer inside the portrait page composition', () => {
  const page = nodeNamed('PageContainer').node;
  const size = sizeOf(page);
  assert.deepEqual(size, { __type__: 'cc.Size', width: 700, height: 1050 });
  assert.equal(page._lpos?.y, 0, 'PageContainer must use the explicit portrait center position');
  assert.equal((widgetOf(page)._enabled ?? true), false,
    'PageContainer Widget must be disabled when explicit portrait positioning is used');
});

test('Task 6 keeps the generator and pc copy/patch chain on 720x1280', () => {
  const rebuilder = fs.readFileSync('scripts/rebuild-scene.cjs', 'utf8');
  assert.match(rebuilder, /DESIGN_WIDTH\s*=\s*720/);
  assert.match(rebuilder, /DESIGN_HEIGHT\s*=\s*1280/);
  assert.match(rebuilder, /portraitLayout\s*\(/);

  const desktopPackage = JSON.parse(fs.readFileSync('desktop/package.json', 'utf8')) as {
    scripts?: { 'build:copy'?: string };
  };
  assert.match(desktopPackage.scripts?.['build:copy'] ?? '', /cpSync/);
  assert.match(desktopPackage.scripts?.['build:copy'] ?? '', /patch-html\.cjs/);
  assert.doesNotMatch(fs.readFileSync('desktop/patch-html.cjs', 'utf8'), /pc-patch\.js/);

  const tempBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'task6-layout-'));
  try {
    fs.writeFileSync(path.join(tempBuild, 'index.html'), '<html><head><title>old</title></head><body><div id="GameDiv"><canvas id="GameCanvas"></canvas></div></body></html>');
    fs.writeFileSync(path.join(tempBuild, 'style.css'), 'body{} #GameDiv{}');
    const patchResult = spawnSync(process.execPath, [path.resolve('desktop/patch-html.cjs'), tempBuild], {
      encoding: 'utf8',
    });
    assert.equal(patchResult.status, 0, patchResult.stderr || patchResult.stdout);
    const patchedHtml = fs.readFileSync(path.join(tempBuild, 'index.html'), 'utf8');
    assert.match(patchedHtml, /<canvas id="GameCanvas" width="720" height="1280" tabindex="99">/);
  } finally {
    fs.rmSync(tempBuild, { recursive: true, force: true });
  }
});

test('Task 6 keeps absolute label nodes under their intended layout parents', () => {
  const expectedParents: Record<string, string> = {
    BrandLabel: 'TopHeader',
    CareerSummaryLabel: 'TopHeader',
    ResourceSummaryLabel: 'ResourceBar',
    CharacterIconLabel: 'CharacterArea',
    CharacterNameLabel: 'CharacterArea',
    CharacterStatusLabel: 'CharacterArea',
    CharacterHintLabel: 'CharacterArea',
    WorkStatusLabel: 'IdleIncomePanel',
    IdleEfficiencyLabel: 'IdleIncomePanel',
    CultivateButtonLabel: 'CultivateButton',
    WorkButtonLabel: 'WorkButton',
    FishButtonLabel: 'FishButton',
    TabHomeLabel: 'TabHome',
    TabTasksLabel: 'TabTasks',
    TabCraftLabel: 'TabCraft',
    TabPromotionLabel: 'TabPromotion',
    TabMoreLabel: 'TabMore',
  };

  for (const [childName, parentName] of Object.entries(expectedParents)) {
    const child = nodeNamed(childName).node;
    const parentId = child._parent?.__id__;
    assert.equal(parentId, nodeNamed(parentName).index, `${childName} must be positioned under ${parentName}`);
  }
});

test('Task 6 uses non-overlapping top-to-bottom safe-area bands', () => {
  const canvas = nodeNamed('Canvas').node;
  const safeArea = nodeNamed('SafeAreaRoot').node;
  const background = nodeNamed('Background').node;
  assert.equal(widgetOf(canvas)._alignFlags, 45, 'Canvas must stretch with left/right/top/bottom');
  assert.equal(widgetOf(safeArea)._alignFlags, 45, 'SafeAreaRoot must stretch with left/right/top/bottom');
  assert.equal(widgetOf(background)._alignFlags, 45, 'Background must stretch with left/right/top/bottom');

  const header = verticalBand('TopHeader');
  const resources = verticalBand('ResourceBar');
  const character = verticalBand('CharacterArea');
  const idle = verticalBand('IdleIncomePanel');
  const page = verticalBand('PageContainer');
  const actions = verticalBand('PrimaryActions');
  const navigation = verticalBand('BottomNavigation');

  assertSeparated(header, resources, 6, 'TopHeader/ResourceBar');
  assertSeparated(resources, character, 6, 'ResourceBar/CharacterArea');
  assertSeparated(character, idle, 6, 'CharacterArea/IdleIncomePanel');
  // PageContainer is an alternate-page overlay. HomePageContent is empty and
  // controller hides home-only bands when another page is selected, so it is
  // intentionally allowed to occupy the middle band behind those panels.
  assertSeparated(actions, navigation, 8, 'PrimaryActions/BottomNavigation');

  assert.equal((widgetOf(nodeNamed('TopHeader').node)._alignFlags), 17, 'TopHeader must be top + horizontal-center');
  assert.equal((widgetOf(nodeNamed('ResourceBar').node)._alignFlags), 17, 'ResourceBar must be top + horizontal-center');
  assert.equal((widgetOf(nodeNamed('CharacterArea').node)._alignFlags), 17, 'CharacterArea must be top + horizontal-center');
  assert.equal((widgetOf(nodeNamed('IdleIncomePanel').node)._alignFlags), 17, 'IdleIncomePanel must be top + horizontal-center');
  assert.equal((widgetOf(nodeNamed('PageContainer').node)._alignFlags), 21, 'PageContainer must be top + bottom + horizontal-center');
  assert.equal((widgetOf(nodeNamed('PrimaryActions').node)._alignFlags), 20, 'PrimaryActions must be bottom + horizontal-center');
  assert.equal((widgetOf(nodeNamed('BottomNavigation').node)._alignFlags), 20, 'BottomNavigation must be bottom + horizontal-center');

  assertSeparated(absoluteBand('CharacterNameLabel'), absoluteBand('CharacterStatusLabel'), 6, 'CharacterNameLabel/CharacterStatusLabel');
  assertSeparated(absoluteBand('CharacterStatusLabel'), absoluteBand('CharacterHintLabel'), 6, 'CharacterStatusLabel/CharacterHintLabel');
  assertSeparated(absoluteBand('WorkStatusLabel'), absoluteBand('IdleEfficiencyLabel'), 6, 'WorkStatusLabel/IdleEfficiencyLabel');
});

test('Task 6 keeps Craft content inside the page band and uses direct labels', () => {
  const page = verticalBand('PageContainer');
  const craft = nodeNamed('CraftPageContent').node;
  assert.equal(craft._active, false, 'Home is the initial page');
  const row = nodeNamed('CraftRecipeRow00').node;
  const rowSize = sizeOf(row);
  const rowCenter = centerOf(nodeNamed('CraftRecipeRow00').index);
  assert.ok(rowCenter - rowSize.height / 2 >= page.top, 'Craft row must not cross page top');
  const last = nodeNamed('CraftRecipeRow05').node;
  const lastSize = sizeOf(last);
  const lastCenter = centerOf(nodeNamed('CraftRecipeRow05').index);
  assert.ok(lastCenter + lastSize.height / 2 <= page.bottom, 'Craft row must not cross page bottom');
  assert.ok((row._children ?? []).length === 0, 'Craft row must not contain stale duplicate label');
  componentOf(row, 'cc.Label');
});
