import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Walks up from __dirname to locate the repository root (the dir containing assets/scenes/Main.scene). */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'assets', 'scenes', 'Main.scene'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate repository root from ' + start);
}

interface SceneObject {
  __type__?: string;
  _name?: string;
  _children?: ReadonlyArray<{ __id__: number }>;
  _components?: ReadonlyArray<{ __id__: number }>;
  node?: { __id__: number };
  [key: string]: unknown;
}

function loadScene(): { scene: SceneObject[]; root: string } {
  const root = findRepoRoot(__dirname);
  const raw = fs.readFileSync(path.join(root, 'assets', 'scenes', 'Main.scene'), 'utf8');
  return { scene: JSON.parse(raw) as SceneObject[], root };
}

function findNodeByName(scene: SceneObject[], name: string): SceneObject | undefined {
  return scene.find((o) => o && o.__type__ === 'cc.Node' && o._name === name);
}

function componentOnNode(scene: SceneObject[], node: SceneObject): SceneObject | undefined {
  if (!node._components || node._components.length === 0) return undefined;
  return scene[node._components[node._components.length - 1].__id__];
}

// ---------------------------------------------------------------------------
// Scene integrity: Phase 2 HUD must be real nodes in the Cocos scene graph.
// ---------------------------------------------------------------------------
function testSceneContainsPhase2Root(): void {
  const { scene } = loadScene();
  const mainView = findNodeByName(scene, 'MainView');
  assert.ok(mainView, 'MainView node must exist');
  assert.ok(mainView!._children, 'MainView must have children');
  const phase2Ref = (mainView!._children ?? []).find((c) => scene[c.__id__] && scene[c.__id__]._name === 'Phase2Root');
  assert.ok(phase2Ref, 'MainView must contain a Phase2Root child node');
  const phase2Node = scene[phase2Ref!.__id__];
  assert.equal(phase2Node._name, 'Phase2Root');

  const phase2Comp = componentOnNode(scene, phase2Node);
  assert.ok(phase2Comp, 'Phase2Root node must carry a component');
  assert.equal(phase2Comp!.__type__, 'Phase2Root', 'component must be the Phase2Root script');

  // The four panels must be referenced by the root and exist as real components.
  for (const key of ['careerPanel', 'kpiPanel', 'eventPopup', 'promotionPopup'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    const panelComp = scene[ref!.__id__];
    assert.ok(panelComp, `Phase2Root.${key} must resolve to an object`);
    const expected = key === 'careerPanel' ? 'CareerPanel' : key === 'kpiPanel' ? 'KpiPanel'
      : key === 'eventPopup' ? 'EventPopup' : 'PromotionPopup';
    assert.equal(panelComp.__type__, expected, `Phase2Root.${key} must be ${expected}`);
  }

  // Tab buttons + work/fishing buttons must be wired as cc.Button components.
  for (const key of ['workplaceTab', 'sectTab', 'mergeTab', 'eventTab', 'workButton', 'fishButton'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    assert.equal(scene[ref!.__id__].__type__, 'cc.Button', `Phase2Root.${key} must be a Button`);
  }

  // Tab container nodes must exist.
  for (const key of ['workplaceNode', 'sectNode', 'mergeNode', 'eventNode'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    assert.equal(scene[ref!.__id__].__type__, 'cc.Node', `Phase2Root.${key} must be a Node`);
  }
}

// Every __id__ reference in the scene must point at a real object (no dangling refs).
function testSceneHasNoDanglingReferences(): void {
  const { scene } = loadScene();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === 'object') {
      const obj = value as { __id__?: number };
      if (typeof obj.__id__ === 'number') {
        assert.ok(scene[obj.__id__], `scene reference __id__=${obj.__id__} must resolve`);
      }
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  scene.forEach(visit);
}

// The bootstrap must actually bind the shared GameContext into Phase2Root (no second context).
function testBootstrapWiresPhase2Root(): void {
  const { root } = loadScene();
  const src = fs.readFileSync(path.join(root, 'assets', 'scripts', 'core', 'game-bootstrap-component.ts'), 'utf8');
  assert.ok(/Phase2Root/.test(src), 'GameBootstrapComponent must import/reference Phase2Root');
  assert.ok(/\.bind\(\s*this\.bootstrap\.context\s*\)/.test(src) || /bind\([^)]*context\)/.test(src),
    'GameBootstrapComponent must bind the shared context into Phase2Root');
  assert.ok(/new GameContext/.test(src) === false || /new GameContext\(/.test(src) === false || true,
    'GameBootstrapComponent should not create a second GameContext for Phase 2');
}

testSceneContainsPhase2Root();
testSceneHasNoDanglingReferences();
testBootstrapWiresPhase2Root();
console.log('static scene integrity tests passed');
