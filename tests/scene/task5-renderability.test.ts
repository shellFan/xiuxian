import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

type SceneRef = { __id__: number };
type SceneObject = {
  __type__?: string;
  _name?: string;
  _active?: boolean;
  _children?: SceneRef[];
  _components?: SceneRef[];
  [key: string]: unknown;
};

const scene = JSON.parse(fs.readFileSync('assets/scenes/Main.scene', 'utf8')) as SceneObject[];

function nodeNamed(name: string): { index: number; node: SceneObject } {
  const index = scene.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  assert.ok(index >= 0, `${name} must exist in Main.scene`);
  return { index, node: scene[index] };
}

function componentTypes(node: SceneObject): string[] {
  return (node._components ?? [])
    .map((ref) => scene[ref.__id__]?.__type__)
    .filter((type): type is string => Boolean(type));
}

function descendantObjects(index: number): SceneObject[] {
  const node = scene[index];
  return [node, ...(node._children ?? []).flatMap((ref) => descendantObjects(ref.__id__))];
}

function hasRenderableDescendant(name: string): void {
  const { index, node } = nodeNamed(name);
  const descendants = descendantObjects(index);
  assert.ok(node._children && node._children.length > 0, `${name} must have visible child layout nodes`);
  assert.ok(
    descendants.some((object) => componentTypes(object).some((type) =>
      type === 'cc.Graphics' || type === 'cc.Label' || type === 'cc.Button')),
    `${name} must have a cc.Graphics, cc.Label, or cc.Button descendant`,
  );
}

test('Task 5 key home containers are renderable at startup', () => {
  for (const name of ['Background', 'TopHeader', 'ResourceBar', 'CharacterArea', 'IdleIncomePanel']) {
    hasRenderableDescendant(name);
  }

  assert.equal(nodeNamed('HomePageContent').node._active, true, 'HomePageContent must be visible at startup');
  assert.ok(nodeNamed('HomePageContent').node._children?.length === 0, 'HomePageContent is the reserved home-page layer; home HUD lives in dedicated regions');
  assert.equal(nodeNamed('CraftPageContent').node._active, false, 'CraftPageContent must remain hidden at startup');
});

test('Task 5 home scene exposes the requested visible content contract', () => {
  for (const name of [
    'BrandLabel',
    'CultivationResourceLabel',
    'SalaryResourceLabel',
    'PerformanceResourceLabel',
    'MindResourceLabel',
    'CharacterNameLabel',
    'CharacterStatusLabel',
    'WorkStatusLabel',
    'CultivateButton',
    'WorkButton',
    'FishButton',
    'TabHome',
    'TabTasks',
    'TabCraft',
    'TabPromotion',
    'TabMore',
  ]) {
    nodeNamed(name);
  }
});

test('Task 5 craft rows remain visible recipe presentations with actions', () => {
  const list = nodeNamed('CraftRecipeList');
  assert.ok(list.node._children && list.node._children.length >= 6, 'CraftRecipeList must retain six recipe rows');
  for (let index = 0; index < 6; index += 1) {
    const row = nodeNamed(`CraftRecipeRow${index.toString().padStart(2, '0')}`);
    const types = componentTypes(row.node);
    assert.ok(types.includes('cc.Label'), `${row.node._name} must have a label`);
    assert.ok(types.includes('cc.Button'), `${row.node._name} must have a craft button`);
  }
});
