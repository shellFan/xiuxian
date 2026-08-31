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

// --- Cocos Creator 3.8.4 compressUuid / decompressUuid (verified against editor output) ---
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX_MAP: Record<string, number> = {};
for (let i = 0; i < 16; i++) HEX_MAP[i.toString(16)] = i;
const BASE64_VALUES = new Array(128).fill(64);
for (let i = 0; i < 64; i++) BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;

function compressUuid(fullUuid: string): string {
  const uuid = fullUuid.split('@')[0];
  if (uuid.length !== 36) return fullUuid;
  const zip: string[] = [uuid[0], uuid[1], uuid[2], uuid[3], uuid[4]];
  const clean = uuid.replace(/-/g, '');
  for (let i = 5, j = 5; i < 32; i += 3) {
    const left = HEX_MAP[clean[i]];
    const mid = HEX_MAP[clean[i + 1]];
    const right = HEX_MAP[clean[i + 2]];
    zip[j++] = BASE64_KEYS[(left << 2) + (mid >> 2)];
    zip[j++] = BASE64_KEYS[((mid & 3) << 4) + right];
  }
  return zip.join('');
}

function decompressUuid(compressed: string): string {
  const u = compressed.split('@')[0];
  if (u.length !== 23) throw new Error('not a 3.8.4 compressed uuid: ' + compressed);
  let hex = u.slice(0, 5);
  const rest = u.slice(5);
  for (let i = 0; i < rest.length; i += 2) {
    const c1 = BASE64_VALUES[rest.charCodeAt(i)];
    const c2 = BASE64_VALUES[rest.charCodeAt(i + 1)];
    const left = c1 >> 2;
    const mid = ((c1 & 3) << 2) | (c2 >> 4);
    const right = c2 & 0xf;
    hex += left.toString(16) + mid.toString(16) + right.toString(16);
  }
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
}

interface SceneObject {
  __type__?: string;
  _name?: string;
  _parent?: { __id__: number };
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

/** Collects every script asset uuid declared in assets/scripts/**\/*.ts.meta. */
function collectMetaUuids(root: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts.meta')) {
        try {
          const meta = JSON.parse(fs.readFileSync(full, 'utf8'));
          if (meta && typeof meta.uuid === 'string') out.add(meta.uuid);
        } catch { /* ignore malformed meta */ }
      }
    }
  };
  walk(path.join(root, 'assets', 'scripts'));
  return out;
}

/** Maps each @ccclass name to its compressed asset uuid (from the sibling .ts.meta). */
function buildClassToCompressed(root: string): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const metaPath = full + '.meta';
        if (!fs.existsSync(metaPath)) continue;
        const src = fs.readFileSync(full, 'utf8');
        const m = src.match(/@ccclass\(\s*['"]([^'"]+)['"]\s*\)/);
        if (!m) continue;
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta && typeof meta.uuid === 'string') map.set(m[1], compressUuid(meta.uuid));
      }
    }
  };
  walk(path.join(root, 'assets', 'scripts'));
  return map;
}

function findNodeByName(scene: SceneObject[], name: string): SceneObject | undefined {
  return scene.find((o) => o && o.__type__ === 'cc.Node' && o._name === name);
}

function componentOnNode(scene: SceneObject[], node: SceneObject): SceneObject | undefined {
  if (!node._components || node._components.length === 0) return undefined;
  return scene[node._components[node._components.length - 1].__id__];
}

// ---------------------------------------------------------------------------
// Scene integrity: Phase 2 HUD must be real nodes in the Cocos scene graph,
// and every custom script component must resolve to a real .meta asset uuid.
// ---------------------------------------------------------------------------
function testSceneContainsPhase2Root(): void {
  const { scene, root } = loadScene();
  const classToCompressed = buildClassToCompressed(root);
  const expect = (cls: string): string => {
    const c = classToCompressed.get(cls);
    assert.ok(c, `class ${cls} must have a generated .meta uuid`);
    return c!;
  };

  const mainView = findNodeByName(scene, 'MainView');
  assert.ok(mainView, 'MainView node must exist');
  assert.ok(mainView!._children, 'MainView must have children');
  const phase2Ref = (mainView!._children ?? []).find((c) => scene[c.__id__] && scene[c.__id__]._name === 'Phase2Root');
  assert.ok(phase2Ref, 'MainView must contain a Phase2Root child node');
  const phase2Node = scene[phase2Ref!.__id__];
  assert.equal(phase2Node._name, 'Phase2Root');

  const phase2Comp = componentOnNode(scene, phase2Node);
  assert.ok(phase2Comp, 'Phase2Root node must carry a component');
  assert.equal(phase2Comp!.__type__, expect('Phase2Root'), 'component must be the Phase2Root script (uuid)');

  for (const key of ['careerPanel', 'kpiPanel', 'eventPopup', 'promotionPopup'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    const panelComp = scene[ref!.__id__];
    assert.ok(panelComp, `Phase2Root.${key} must resolve to an object`);
    const expected = key === 'careerPanel' ? 'CareerPanel' : key === 'kpiPanel' ? 'KpiPanel'
      : key === 'eventPopup' ? 'EventPopup' : 'PromotionPopup';
    assert.equal(panelComp.__type__, expect(expected), `Phase2Root.${key} must be ${expected} (uuid)`);
  }

  for (const key of ['workplaceTab', 'sectTab', 'mergeTab', 'eventTab', 'workButton', 'fishButton'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    assert.equal(scene[ref!.__id__].__type__, 'cc.Button', `Phase2Root.${key} must be a Button`);
  }

  for (const key of ['workplaceNode', 'sectNode', 'mergeNode', 'eventNode'] as const) {
    const ref = phase2Comp![key] as { __id__: number } | undefined;
    assert.ok(ref, `Phase2Root.${key} must be wired`);
    assert.equal(scene[ref!.__id__].__type__, 'cc.Node', `Phase2Root.${key} must be a Node`);
  }
}

// Every custom (non-cc.*) component __type__ in the scene must decompress to a real
// assets/scripts .meta uuid — proving the Asset DB can resolve every script binding.
function testSceneCustomComponentsResolveToMetaUuids(): void {
  const { scene, root } = loadScene();
  const metaUuids = collectMetaUuids(root);
  assert.ok(metaUuids.size > 0, 'project must declare script .meta uuids');
  let customCount = 0;
  for (const o of scene) {
    if (!o || !o.__type__) continue;
    if (o.__type__.startsWith('cc.')) continue; // built-in components are not uuid-addressed
    customCount += 1;
    const decoded = decompressUuid(o.__type__);
    assert.ok(metaUuids.has(decoded), `custom component __type__ ${o.__type__} must resolve to a real .meta uuid (${decoded})`);
  }
  assert.ok(customCount >= 11, `scene must bind at least the 11 known Phase 2 scripts (found ${customCount})`);
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
  assert.ok(/bind\([^)]*context\)/.test(src), 'GameBootstrapComponent must bind the shared context into Phase2Root');
}

// ---------------------------------------------------------------------------
// STEP 8 (Phase 2 Runtime Acceptance): the scene must be a loadable Cocos 3.8.4
// SceneAsset, not just a JSON file with class-name refs. These checks run WITHOUT
// a running Editor, so they catch the "asset visible but won't open" class of bugs.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadSceneMeta(): { importer: string; uuid: string; ver: string } {
  const root = findRepoRoot(__dirname);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'scenes', 'Main.scene.meta'), 'utf8'));
  return { importer: meta.importer, uuid: meta.uuid, ver: meta.ver };
}

// 1) Main.scene.meta must declare itself as a scene importer with a valid uuid,
//    otherwise Creator treats it as a plain asset and double-click does nothing.
function testSceneMetaIsSceneAsset(): void {
  const meta = loadSceneMeta();
  assert.equal(meta.importer, 'scene', 'Main.scene.meta importer must be "scene" so Creator opens it in the Scene Editor');
  assert.ok(UUID_RE.test(meta.uuid), `Main.scene.meta uuid must be a valid uuid (got ${meta.uuid})`);
}

// 2/3) Top-level object must be cc.SceneAsset, and SceneAsset.scene must point at a cc.Scene.
function testSceneAssetEnvelope(): void {
  const { scene } = loadScene();
  assert.ok(scene[0] && scene[0].__type__ === 'cc.SceneAsset', 'Main.scene top object must be cc.SceneAsset');
  const sceneRef = scene[0].scene as { __id__: number } | undefined;
  assert.ok(sceneRef && typeof sceneRef.__id__ === 'number', 'SceneAsset.scene must reference the cc.Scene');
  const sc = scene[sceneRef!.__id__];
  assert.ok(sc && sc.__type__ === 'cc.Scene', 'SceneAsset.scene must point to a cc.Scene');
}

// 4) every __id__ reference must lie in [0, array.length); 6) every component.node -> cc.Node.
function testSceneReferenceGraphConsistent(): void {
  const { scene } = loadScene();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === 'object') {
      const obj = value as { __id__?: number };
      if (typeof obj.__id__ === 'number') {
        assert.ok(Number.isInteger(obj.__id__) && obj.__id__ >= 0 && obj.__id__ < scene.length,
          `scene reference __id__=${obj.__id__} must be in [0, ${scene.length})`);
      }
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  scene.forEach(visit);

  for (const o of scene) {
    if (!o || !o.__type__ || typeof o.__type__ !== 'string') continue;
    if (o.__type__ === 'cc.SceneAsset' || o.__type__ === 'cc.Scene' || o.__type__ === 'cc.Node') continue;
    const nodeRef = o.node as { __id__?: number } | undefined;
    if (nodeRef && typeof nodeRef.__id__ === 'number') {
      const nd = scene[nodeRef.__id__];
      assert.ok(nd && nd.__type__ === 'cc.Node', `component ${o.__type__} node must reference a cc.Node (idx ${nodeRef.__id__})`);
    }
  }

  // 7) node _parent / _children bidirectional consistency
  for (let i = 0; i < scene.length; i++) {
    const o = scene[i];
    if (!o || o.__type__ !== 'cc.Node') continue;
    if (o._parent && typeof o._parent.__id__ === 'number') {
      const p = scene[o._parent.__id__];
      assert.ok(p, `node ${i} (${o._name}) parent idx ${o._parent.__id__} must exist`);
      assert.ok(p.__type__ === 'cc.Node' || p.__type__ === 'cc.Scene', `node ${i} parent must be cc.Node/cc.Scene`);
      if (p._children) assert.ok(p._children.some((c) => c.__id__ === i), `node ${i} (${o._name}) must appear in parent children`);
    }
    (o._children ?? []).forEach((c) => {
      const ch = scene[c.__id__];
      assert.ok(ch, `node ${i} child idx ${c.__id__} must exist`);
      assert.ok(ch._parent && ch._parent.__id__ === i, `node ${i} child idx ${c.__id__} parent must be ${i}`);
    });
  }
}

// STEP 7: every required Phase 2 node must survive any scene rebuild.
function testKeyPhase2NodesPreserved(): void {
  const { scene } = loadScene();
  const names = new Set(scene.filter((o) => o && o.__type__ === 'cc.Node').map((o) => o._name as string));
  const required = [
    'Canvas', 'GameBootstrap', 'MainView', 'MergeBoard', 'RecruitButton', 'Toast', 'Feedback',
    'Phase2Root', 'CareerPanel', 'KpiPanel', 'EventPopup', 'PromotionPopup',
    'WorkplaceNode', 'SectNode', 'MergeNode', 'EventNode', 'WorkButton', 'FishButton',
  ];
  for (const n of required) {
    assert.ok(names.has(n), `required Phase 2 node "${n}" must be present in Main.scene`);
  }
  for (const tab of ['Tab_work', 'Tab_sect', 'Tab_merge', 'Tab_event']) {
    assert.ok(names.has(tab), `bottom tab "${tab}" must be present in Main.scene`);
  }
}

testSceneMetaIsSceneAsset();
testSceneAssetEnvelope();
testSceneContainsPhase2Root();
testSceneCustomComponentsResolveToMetaUuids();
testSceneHasNoDanglingReferences();
testSceneReferenceGraphConsistent();
testKeyPhase2NodesPreserved();
testBootstrapWiresPhase2Root();
console.log('static scene integrity tests passed');
