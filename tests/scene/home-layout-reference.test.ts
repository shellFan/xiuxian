import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

type SceneRef = { __id__: number };
type SceneObject = {
  __type__?: string;
  _name?: string;
  _parent?: SceneRef;
  _children?: SceneRef[];
  _components?: SceneRef[];
  _alignFlags?: number;
  _contentSize?: { width: number; height: number };
  [key: string]: unknown;
};

type Band = { top: number; bottom: number };
type Color = { r: number; g: number; b: number; a: number };

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
function findProjectRoot(start: string): string {
  let directory = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(directory, 'assets/scenes/Main.scene'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Could not locate project root for Main.scene');
    directory = parent;
  }
}

const projectRoot = findProjectRoot(__dirname);
const scene = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'assets/scenes/Main.scene'), 'utf8'),
) as SceneObject[];

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
  return componentOf(node, 'cc.UITransform')._contentSize as { width: number; height: number };
}

function childNamed(parent: SceneObject, name: string): SceneObject {
  const child = (parent._children ?? [])
    .map((ref) => scene[ref.__id__])
    .find((object) => object?.__type__ === 'cc.Node' && object._name === name);
  assert.ok(child, `${parent._name} must contain child node ${name}`);
  return child;
}

function verticalBand(name: string): Band {
  const { node } = nodeNamed(name);
  const size = sizeOf(node);
  const y = (node._lpos as { y: number }).y;
  const top = DESIGN_HEIGHT / 2 - y - size.height / 2;
  return { top, bottom: top + size.height };
}

function labelText(node: SceneObject): string {
  return componentOf(node, 'cc.Label')._string as string;
}

test('home layout follows the 720x1280 portrait reference bands', () => {
  const canvas = scene.find((object) => object.__type__ === 'cc.Canvas');
  assert.ok(canvas, 'Main.scene must contain a Canvas');
  assert.deepEqual(canvas._designResolution, {
    __type__: 'cc.Size',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  });

  const expectedBands: Array<[string, Band]> = [
    ['TopHeader', { top: 45, bottom: 139 }],
    ['ResourceBar', { top: 154, bottom: 266 }],
    ['CharacterArea', { top: 290, bottom: 690 }],
    ['IdleIncomePanel', { top: 706, bottom: 834 }],
    ['PrimaryActions', { top: 867, bottom: 1043 }],
    ['BottomNavigation', { top: 1152, bottom: 1260 }],
  ];

  let previous: Band | undefined;
  for (const [name, expected] of expectedBands) {
    const { node } = nodeNamed(name);
    assert.equal(scene[node._parent?.__id__ ?? -1]?._name, 'SafeAreaRoot', `${name} must be under SafeAreaRoot`);
    const actual = verticalBand(name);
    assert.deepEqual(actual, expected, `${name} must match its portrait reference boundary`);
    assert.ok(actual.top >= 0 && actual.bottom <= DESIGN_HEIGHT, `${name} must stay inside the design canvas`);
    if (previous) {
      assert.ok(previous.bottom < actual.top, `${name} must follow the previous home region without overlap`);
    }
    previous = actual;
  }
});

test('home resource chips keep their reference colors and text nodes', () => {
  const resources: Array<[string, string, Color, string]> = [
    ['ResourceCultivationChip', 'CultivationResourceLabel', { r: 130, g: 174, b: 211, a: 255 }, '修为\n0/100'],
    ['ResourceSalaryChip', 'SalaryResourceLabel', { r: 224, g: 184, b: 116, a: 255 }, '工资\n0'],
    ['ResourcePerformanceChip', 'PerformanceResourceLabel', { r: 142, g: 190, b: 158, a: 255 }, '绩效\n0'],
    ['ResourceMindChip', 'MindResourceLabel', { r: 196, g: 151, b: 190, a: 255 }, '道心\n100/100'],
  ];

  const resourceBar = nodeNamed('ResourceBar').node;
  for (const [chipName, labelName, color, text] of resources) {
    const chip = childNamed(resourceBar, chipName);
    const fillColor = componentOf(chip, 'cc.Graphics')._fillColor as Color;
    assert.deepEqual(
      { r: fillColor.r, g: fillColor.g, b: fillColor.b, a: fillColor.a },
      color,
      `${chipName} must keep its reference fill color`,
    );
    const label = childNamed(chip, labelName);
    assert.equal(labelText(label), text, `${labelName} must keep its reference text`);
  }
});

test('home primary actions expose the three reference button labels', () => {
  const actions = nodeNamed('PrimaryActions').node;
  const expectedLabels: Array<[string, string]> = [
    ['CultivateButton', '修炼一次'],
    ['WorkButton', '努力工作'],
    ['FishButton', '摸鱼恢复'],
  ];

  for (const [buttonName, expectedText] of expectedLabels) {
    const button = childNamed(actions, buttonName);
    componentOf(button, 'cc.Button');
    assert.equal(labelText(childNamed(button, `${buttonName}Label`)), expectedText);
  }
});

test('primary actions directly follow idle income and stay separate from bottom navigation', () => {
  const idle = verticalBand('IdleIncomePanel');
  const actions = verticalBand('PrimaryActions');
  const navigation = verticalBand('BottomNavigation');

  assert.equal(actions.top - idle.bottom, 33, 'PrimaryActions must directly follow IdleIncomePanel');
  assert.ok(actions.bottom < navigation.top, 'PrimaryActions must not touch or overlap BottomNavigation');
  assert.ok(navigation.top - actions.bottom >= 32, 'PrimaryActions must remain visibly separated from BottomNavigation');
});
