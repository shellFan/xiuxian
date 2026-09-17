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

  // Header and character area are full-page visual composition parents. Their
  // children provide the actual reference bands and may extend across the
  // paper background without clipping.
  assert.deepEqual(verticalBand('TopHeader'), { top: 0, bottom: 1280 });
  assert.deepEqual(verticalBand('CharacterArea'), { top: 0, bottom: 1280 });
  const expectedBands: Array<[string, Band]> = [
    ['ResourceBar', { top: 328, bottom: 416 }],
    ['IdleIncomePanel', { top: 852, bottom: 1004 }],
    ['PrimaryActions', { top: 974, bottom: 1186 }],
    ['BottomNavigation', { top: 1194, bottom: 1280 }],
  ];

  for (const [name, expected] of expectedBands) {
    const { node } = nodeNamed(name);
    assert.equal(scene[node._parent?.__id__ ?? -1]?._name, 'SafeAreaRoot', `${name} must be under SafeAreaRoot`);
    const actual = verticalBand(name);
    assert.deepEqual(actual, expected, `${name} must match its portrait reference boundary`);
    assert.ok(actual.top >= 0 && actual.bottom <= DESIGN_HEIGHT, `${name} must stay inside the design canvas`);
  }
  assert.ok(verticalBand('PrimaryActions').bottom < verticalBand('BottomNavigation').top);
});

test('home resource chips keep their reference colors and text nodes', () => {
  const resources: Array<[string, string, Color, string]> = [
    ['ResourceCultivationChip', 'CultivationResourceLabel', { r: 39, g: 137, b: 157, a: 255 }, '修为\n0/100'],
    ['ResourceSalaryChip', 'SalaryResourceLabel', { r: 39, g: 137, b: 157, a: 255 }, '工资\n0'],
    ['ResourcePerformanceChip', 'PerformanceResourceLabel', { r: 39, g: 137, b: 157, a: 255 }, '绩效\n0'],
    ['ResourceMindChip', 'MindResourceLabel', { r: 39, g: 137, b: 157, a: 255 }, '道心\n100/100'],
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

  assert.equal(actions.top - idle.bottom, -30, 'PrimaryActions must overlap the income panel by the reference amount');
  assert.ok(actions.bottom < navigation.top, 'PrimaryActions must not touch or overlap BottomNavigation');
  assert.ok(navigation.top - actions.bottom >= 2, 'PrimaryActions must remain visibly separated from BottomNavigation');
});
