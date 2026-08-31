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

testSceneContainsPhase2Root();
testSceneCustomComponentsResolveToMetaUuids();
testSceneHasNoDanglingReferences();
testBootstrapWiresPhase2Root();
console.log('static scene integrity tests passed');
