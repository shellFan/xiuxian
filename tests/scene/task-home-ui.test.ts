import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

type SceneRef = { __id__: number };
type SceneObject = {
  __type__?: string;
  _name?: string;
  _parent?: SceneRef;
  _children?: SceneRef[];
  _components?: SceneRef[];
  _lpos?: { x: number; y: number; z: number };
  _alignFlags?: number;
  _contentSize?: { width: number; height: number };
  _fillColor?: { r: number; g: number; b: number; a: number };
  _string?: string;
  [key: string]: unknown;
};

const scene = JSON.parse(fs.readFileSync('assets/scenes/Main.scene', 'utf8')) as SceneObject[];

const RESOURCE_CHIPS = [
  {
    name: 'ResourceCultivationChip',
    label: 'CultivationResourceLabel',
    text: '修为\n0/100',
    color: { r: 130, g: 174, b: 211, a: 255 },
  },
  {
    name: 'ResourceSalaryChip',
    label: 'SalaryResourceLabel',
    text: '工资\n0',
    color: { r: 224, g: 184, b: 116, a: 255 },
  },
  {
    name: 'ResourcePerformanceChip',
    label: 'PerformanceResourceLabel',
    text: '绩效\n0',
    color: { r: 142, g: 190, b: 158, a: 255 },
  },
  {
    name: 'ResourceMindChip',
    label: 'MindResourceLabel',
    text: '道心\n100/100',
    color: { r: 196, g: 151, b: 190, a: 255 },
  },
] as const;

const HOME_REGIONS = [
  'TopHeader',
  'ResourceBar',
  'CharacterArea',
  'IdleIncomePanel',
  'PrimaryActions',
  'BottomNavigation',
  'PageContainer',
] as const;

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
  return component!;
}

function labelText(name: string): string {
  const { node } = nodeNamed(name);
  return componentOf(node, 'cc.Label')._string as string;
}

function graphicsFillColor(name: string): { r: number; g: number; b: number; a: number } {
  const { r, g, b, a } = componentOf(nodeNamed(name).node, 'cc.Graphics')._fillColor as {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  return { r, g, b, a };
}

function assertDirectChild(parentName: string, childName: string): void {
  const parent = nodeNamed(parentName);
  const child = nodeNamed(childName);
  assert.deepEqual(child.node._parent, { __id__: parent.index }, `${childName} must be a direct child of ${parentName}`);
  assert.ok(
    (parent.node._children ?? []).some((ref) => ref.__id__ === child.index),
    `${parentName} must list ${childName} as a child`,
  );
}

function verticalBand(name: string): { top: number; bottom: number } {
  const { node } = nodeNamed(name);
  const widget = componentOf(node, 'cc.Widget');
  const size = componentOf(node, 'cc.UITransform')._contentSize as { width: number; height: number };
  const flags = widget._alignFlags as number;
  const top = widget._top as number;
  const bottom = widget._bottom as number;

  if ((flags & 1) !== 0 && (flags & 4) === 0) {
    return { top, bottom: top + size.height };
  }
  if ((flags & 4) !== 0 && (flags & 1) === 0) {
    return { top: 720 - bottom - size.height, bottom: 720 - bottom };
  }
  throw new Error(`${name} must declare one vertical anchor direction`);
}

test('home UI has the branded header, four independent resource chips, and character card', () => {
  assertDirectChild('TopHeader', 'BrandLabel');
  assertDirectChild('TopHeader', 'BrandTaglineLabel');
  assert.equal(labelText('BrandLabel'), '牛马修仙传');
  assert.equal(labelText('BrandTaglineLabel'), '上班也是渡劫');

  for (const { name, label, text, color } of RESOURCE_CHIPS) {
    assertDirectChild('ResourceBar', name);
    assertDirectChild(name, label);
    assert.equal(labelText(label), text);
    assert.deepEqual(graphicsFillColor(name), color, `${name} must use its design color`);
    componentOf(nodeNamed(name).node, '9d3c5ajahRK77mt3Dp3Hysh');
  }

  const chipColors = RESOURCE_CHIPS.map(({ name }) => JSON.stringify(graphicsFillColor(name)));
  assert.equal(new Set(chipColors).size, RESOURCE_CHIPS.length, 'resource chips must use four distinct colors');

  for (const name of ['CharacterIconLabel', 'CharacterNameLabel', 'CharacterStatusLabel', 'CharacterHintLabel']) {
    assertDirectChild('CharacterArea', name);
  }
  componentOf(nodeNamed('CharacterArea').node, 'cc.UITransform');
  componentOf(nodeNamed('CharacterArea').node, 'cc.Graphics');
  componentOf(nodeNamed('CharacterArea').node, '9d3c5ajahRK77mt3Dp3Hysh');
  assert.equal(labelText('CharacterIconLabel'), '🐮');
  assert.equal(labelText('CharacterNameLabel'), '练气职员 · 初入修仙职场');
  assert.equal(labelText('CharacterStatusLabel'), '散修 · 未觉醒天赋 · 灵石与修为正在积累');
  assert.equal(labelText('CharacterHintLabel'), '今日也要稳住道心');

  for (const [button, label] of [
    ['CultivateButton', 'CultivateButtonLabel'],
    ['WorkButton', 'WorkButtonLabel'],
    ['FishButton', 'FishButtonLabel'],
  ] as const) {
    assertDirectChild('PrimaryActions', button);
    assertDirectChild(button, label);
    componentOf(nodeNamed(button).node, 'cc.Button');
  }
  assert.equal(labelText('CultivateButtonLabel'), '修炼一次');
  assert.equal(labelText('WorkButtonLabel'), '努力工作');
  assert.equal(labelText('FishButtonLabel'), '摸鱼恢复');
});

test('home UI keeps the five navigation tabs and all visible labels in their regions', () => {
  const expectedTabs = [
    ['TabHome', 'TabHomeLabel', '首页'],
    ['TabTasks', 'TabTasksLabel', '任务'],
    ['TabCraft', 'TabCraftLabel', '合成'],
    ['TabPromotion', 'TabPromotionLabel', '晋升'],
    ['TabMore', 'TabMoreLabel', '更多'],
  ] as const;
  const tabNames = (nodeNamed('BottomNavigation').node._children ?? [])
    .map((ref) => scene[ref.__id__]?._name);
  assert.deepEqual(tabNames, expectedTabs.map(([tab]) => tab), 'BottomNavigation must keep five tabs in order');

  for (const [tab, label, expectedText] of expectedTabs) {
    assertDirectChild('BottomNavigation', tab);
    assertDirectChild(tab, label);
    componentOf(nodeNamed(tab).node, 'cc.Button');
    assert.equal(labelText(label), expectedText);
  }

  for (const name of [
    'BrandLabel', 'BrandTaglineLabel', 'CareerSummaryLabel',
    'CultivationResourceLabel', 'SalaryResourceLabel', 'PerformanceResourceLabel', 'MindResourceLabel',
    'CharacterNameLabel', 'CharacterStatusLabel', 'CharacterHintLabel',
    'CultivateButtonLabel', 'WorkButtonLabel', 'FishButtonLabel',
  ]) {
    assert.ok(labelText(name).length > 0, `${name} must be a visible Label with text`);
  }
});

test('home UI binds each resource chip to the live HUD view model', () => {
  const controllerSource = fs.readFileSync('assets/scripts/ui/game-ui-controller.ts', 'utf8');
  for (const field of [
    'cultivationResourceLabel',
    'salaryResourceLabel',
    'performanceResourceLabel',
    'mindResourceLabel',
  ]) {
    assert.match(controllerSource, new RegExp(`setText\\(\\s*this\\.${field}`));
  }
  assert.match(controllerSource, /cultivationExp.*cultivationRequired/);
  assert.match(controllerSource, /hudVm\.salary/);
  assert.match(controllerSource, /hudVm\.performance/);
  assert.match(controllerSource, /hudVm\.mind.*hudVm\.maxMind/);
});

test('home UI preserves the designed parent-child regions', () => {
  for (const child of ['BrandLabel', 'BrandTaglineLabel', 'CareerSummaryLabel']) {
    assertDirectChild('TopHeader', child);
  }

  for (const child of HOME_REGIONS) {
    assertDirectChild('SafeAreaRoot', child);
  }

  for (const page of [
    'HomePageContent', 'TasksPageContent', 'CraftPageContent',
    'PromotionPageContent', 'MorePageContent',
  ]) {
    assertDirectChild('PageContainer', page);
  }
});

test('home UI uses non-overlapping 1280x720 vertical bands', () => {
  const orderedBands = [
    ['TopHeader', 'ResourceBar'],
    ['ResourceBar', 'CharacterArea'],
    ['CharacterArea', 'IdleIncomePanel'],
    ['IdleIncomePanel', 'PrimaryActions'],
    ['PrimaryActions', 'BottomNavigation'],
  ] as const;

  for (const [upperName, lowerName] of orderedBands) {
    const upper = verticalBand(upperName);
    const lower = verticalBand(lowerName);
    assert.ok(upper.bottom + 6 <= lower.top, `${upperName} and ${lowerName} must have at least 6px separation`);
  }
});
