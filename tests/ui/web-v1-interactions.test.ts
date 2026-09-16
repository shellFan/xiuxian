import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

type SceneRef = { __id__?: number };

type SceneObject = {
  __type__?: string;
  _name?: string;
  _components?: SceneRef[];
};

const workspaceRoot = fs.existsSync(path.resolve(process.cwd(), 'assets/scenes/Main.scene'))
  ? process.cwd()
  : path.resolve(__dirname, '..', '..', '..');
const scenePath = path.resolve(workspaceRoot, 'assets/scenes/Main.scene');
const controllerPath = path.resolve(workspaceRoot, 'assets/scripts/ui/game-ui-controller.ts');
const sceneObjects = JSON.parse(fs.readFileSync(scenePath, 'utf8')) as SceneObject[];
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

function nodesNamed(name: string): Array<{ index: number; node: SceneObject }> {
  return sceneObjects
    .map((node, index) => ({ index, node }))
    .filter(({ node }) => node.__type__ === 'cc.Node' && node._name === name);
}

function hasComponent(node: SceneObject, type: string): boolean {
  return (node._components ?? []).some((ref) => sceneObjects[ref.__id__ ?? -1]?.__type__ === type);
}

test('Main.scene exposes playable task and promotion action nodes', () => {
  const startButtons = nodesNamed('StartButton');
  const promoteButtons = nodesNamed('PromoteButton');

  assert.ok(startButtons.length > 0, 'Main.scene must contain a task StartButton');
  assert.ok(promoteButtons.length > 0, 'Main.scene must contain a promotion PromoteButton');
  assert.ok(startButtons.every(({ node }) => hasComponent(node, 'cc.Button')), 'every StartButton must be a cc.Button');
  assert.ok(promoteButtons.every(({ node }) => hasComponent(node, 'cc.Button')), 'every PromoteButton must be a cc.Button');
});

test('GameUIController binds task facade commands', () => {
  const hasTaskBindings =
    ['queryTaskConfigs', 'startTask', 'claimTask'].every((name) => controllerSource.includes(name)) ||
    controllerSource.includes('tickTasks');

  assert.ok(
    hasTaskBindings,
    'GameUIController must bind queryTaskConfigs/startTask/claimTask or tickTasks',
  );
});

test('GameUIController binds promotion facade commands', () => {
  assert.ok(
    controllerSource.includes('queryPromotionOptions') && controllerSource.includes('promote'),
    'GameUIController must bind queryPromotionOptions and promote',
  );
});

test('GameUIController adds no drag or touch board interaction', () => {
  assert.doesNotMatch(
    controllerSource,
    /DragController|MergeBoardView|BoardCell|onRecruitClick|animateMerge|TOUCH_(?:START|MOVE|END)|touch-start|touch-end|pointer(?:down|move|up)/i,
  );
});
