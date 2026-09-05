#!/usr/bin/env node
/**
 * Patch Main.scene for Phase 5 Runtime mounting.
 *
 * Changes:
 *   1. Fix broken component [233] __type__ → CocosBootstrapComponent compressed UUID
 *   2. Rename GameBootstrap node → Bootstrap
 *   3. Add SafeAreaRoot node tree with SceneBindingComponent + 10 UI layers + 7 UI Components
 *   4. Update Canvas children to include SafeAreaRoot
 */

const fs = require('fs');
const path = require('path');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'scenes', 'Main.scene');

// ── Compressed UUIDs (computed via compress-uuid.cjs) ──────────────────────
const UUID = {
  CocosBootstrapComponent: 'b3150HobX9BGZZPA8DLrkXL',  // b31501e8-6d7f-4119-964f-03c0cbae45cb
  SceneBindingComponent:   '1ce57vj0mhA6Y3M3wJRHr+o',  // 1ce57be3-d268-40e9-8dcc-df02511ebfa8
  CommonModalComponent:    '2c448zAOc9CUrstBznPMacA',   // 2c448cc0-39cf-4252-bb2d-0739cf31a700
  TutorialOverlayComponent:'10d78LQNyhJqq3tI919mdAA',   // 10d782d0-3728-49aa-aded-23dd7d99d000
  MainHudComponent:        '9fe67zMvipJ3bsk71s/JnC8',   // 9fe67ccc-be2a-49dd-bb24-ef5b3f2670bc
  CareerPanelComponent:    'da1d5lXmTtCr4n3r6GYPJBE',   // da1d5957-993b-42af-89f7-afa1983c9044
  KpiPanelComponent:       '42ae6s3wpVPWbh/5Dogp3wD',   // 42ae6b37-c295-4f59-b87f-e43a20a77c03
  MergeBoardComponent:     '42e2dJzKZ9OipWJFkl1Pm91',   // 42e2d273-299f-4e8a-9589-1649753e6f75
  WorkModeToggleComponent: 'fa24aqyL21COY2RLkjSiBRt',   // fa24aab2-2f6d-4239-8d91-2e48d288146d
};

// ── Helper: create a minimal cc.Node ───────────────────────────────────────
function makeNode(name, parentId, childIds, componentIds, layer = 33554432) {
  return {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    _parent: { __id__: parentId },
    _children: childIds.map(id => ({ __id__: id })),
    _active: true,
    _components: componentIds.map(id => ({ __id__: id })),
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
    _layer: layer,
  };
}

// ── Helper: create a cc.UITransform ────────────────────────────────────────
function makeUITransform(nodeId, w = 720, h = 1280) {
  return {
    __type__: 'cc.UITransform',
    node: { __id__: nodeId },
    _contentSize: { __type__: 'cc.Size', width: w, height: h },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
  };
}

// ── Helper: create a cc.Widget (full stretch) ──────────────────────────────
function makeWidget(nodeId) {
  return {
    __type__: 'cc.Widget',
    _objFlags: 0,
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _alignFlags: 45,
    _target: null,
    _left: 0, _right: 0, _top: 0, _bottom: 0,
    _horizontalCenter: 0, _verticalCenter: 0,
    _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
    _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
    _originalWidth: 0, _originalHeight: 0,
    _alignMode: 2,
    _lockFlags: 0,
  };
}

// ── Helper: create a custom component ──────────────────────────────────────
function makeComponent(typeUuid, nodeId, enabled = true, extra = {}) {
  return {
    __type__: typeUuid,
    node: { __id__: nodeId },
    _enabled: enabled,
    ...extra,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const sceneRaw = fs.readFileSync(SCENE_PATH, 'utf-8');
  const scene = JSON.parse(sceneRaw);

  // 1. Fix broken component [233] → CocosBootstrapComponent
  const brokenIdx = scene.findIndex((e, i) => 
    e.__type__ === '00000AAAAAAAAAAAAAAAAAD' || 
    (e.__type__ && e.__type__.startsWith('00000'))
  );
  
  if (brokenIdx >= 0) {
    console.log(`Fixing broken component at [${brokenIdx}]: "${scene[brokenIdx].__type__}" → "${UUID.CocosBootstrapComponent}"`);
    scene[brokenIdx].__type__ = UUID.CocosBootstrapComponent;
    // Ensure it has proper fields
    if (!scene[brokenIdx]._enabled) scene[brokenIdx]._enabled = true;
  } else {
    console.log('No broken component found (already fixed or different structure).');
  }

  // 2. Rename GameBootstrap → Bootstrap
  const bootstrapNodeIdx = scene.findIndex(e => e.__type__ === 'cc.Node' && e._name === 'GameBootstrap');
  if (bootstrapNodeIdx >= 0) {
    console.log(`Renaming node [${bootstrapNodeIdx}]: "GameBootstrap" → "Bootstrap"`);
    scene[bootstrapNodeIdx]._name = 'Bootstrap';
  }

  // 3. Add SafeAreaRoot node tree
  const canvasIdx = scene.findIndex(e => e.__type__ === 'cc.Node' && e._name === 'Canvas');
  if (canvasIdx < 0) {
    console.error('Canvas node not found!');
    process.exit(1);
  }

  // Check if SafeAreaRoot already exists
  const existingSafeArea = scene.findIndex(e => e.__type__ === 'cc.Node' && e._name === 'SafeAreaRoot');
  if (existingSafeArea >= 0) {
    console.log('SafeAreaRoot already exists, skipping addition.');
  } else {
    const baseIdx = scene.length; // Start appending from current end

    // 10 UI layer definitions: [name, componentUuid, w, h]
    const uiLayers = [
      ['HUD',          UUID.MainHudComponent,         720, 1280],
      ['OfficeStage',  null,                           720, 1280],
      ['Board',        UUID.MergeBoardComponent,       720, 1280],
      ['Actions',      UUID.WorkModeToggleComponent,   720, 1280],
      ['Navigation',   null,                           720, 1280],
      ['CareerPanel',  UUID.CareerPanelComponent,      720, 1280],
      ['KpiPanel',     UUID.KpiPanelComponent,         720, 1280],
      ['ModalHost',    UUID.CommonModalComponent,      750, 1334],
      ['TutorialHost', UUID.TutorialOverlayComponent,  750, 1334],
      ['ToastHost',    null,                           720, 200],
    ];

    // SafeAreaRoot: node at baseIdx, components at baseIdx+1..baseIdx+3
    // Each UI layer: node + components (variable count)
    let idx = baseIdx;

    // SafeAreaRoot components: SceneBindingComponent, UITransform, Widget
    const safeAreaIdx = idx++;
    const sceneBindingCompIdx = idx++;
    const safeAreaUITransformIdx = idx++;
    const safeAreaWidgetIdx = idx++;

    // UI layer nodes and components
    const uiLayerNodeIds = [];
    const newEntries = [];

    for (const [name, compUuid, w, h] of uiLayers) {
      const nodeIdx = idx++;
      const compIdx = compUuid ? idx++ : null;
      const uiTransformIdx = idx++;

      uiLayerNodeIds.push(nodeIdx);

      // Create node
      newEntries.push(makeNode(name, safeAreaIdx, [], compUuid ? [compIdx, uiTransformIdx] : [uiTransformIdx], 33554432));

      // Create component (if any)
      if (compUuid) {
        newEntries.push(makeComponent(compUuid, nodeIdx));
      }

      // Create UITransform
      newEntries.push(makeUITransform(nodeIdx, w, h));
    }

    // Now create SafeAreaRoot node (we know all child IDs now)
    const safeAreaNode = makeNode('SafeAreaRoot', canvasIdx, uiLayerNodeIds, [sceneBindingCompIdx, safeAreaUITransformIdx, safeAreaWidgetIdx], 33554432);

    // Create SafeAreaRoot components
    const sceneBindingComp = makeComponent(UUID.SceneBindingComponent, safeAreaIdx);
    const safeAreaUITransform = makeUITransform(safeAreaIdx, 720, 1280);
    const safeAreaWidget = makeWidget(safeAreaIdx);

    // Insert in order: SafeAreaRoot node, then its components, then UI layer entries
    scene.push(safeAreaNode);        // [baseIdx]
    scene.push(sceneBindingComp);    // [baseIdx+1]
    scene.push(safeAreaUITransform); // [baseIdx+2]
    scene.push(safeAreaWidget);      // [baseIdx+3]
    for (const entry of newEntries) {
      scene.push(entry);
    }

    // 4. Update Canvas children to include SafeAreaRoot
    // Current: [3] GameBootstrap, [234] UICamera_Canvas
    // New: [3] Bootstrap, [safeAreaIdx] SafeAreaRoot, [234] UICamera_Canvas
    const canvasChildren = scene[canvasIdx]._children;
    const uiCameraIdx = canvasChildren.find(c => {
      const childNode = scene[c.__id__];
      return childNode._name === 'UICamera_Canvas' || childNode.__type__ === 'cc.Node' && childNode._children?.length === 0;
    });
    
    // Insert SafeAreaRoot before UICamera
    scene[canvasIdx]._children = [
      { __id__: bootstrapNodeIdx >= 0 ? bootstrapNodeIdx : 3 },
      { __id__: safeAreaIdx },
      { __id__: 234 }, // UICamera_Canvas
    ];

    console.log(`Added SafeAreaRoot at [${safeAreaIdx}] with ${uiLayers.length} UI layers`);
    console.log(`Canvas children updated: [${scene[canvasIdx]._children.map(c => c.__id__).join(', ')}]`);
  }

  // Write updated scene
  const output = JSON.stringify(scene, null, 2);
  fs.writeFileSync(SCENE_PATH, output, 'utf-8');
  console.log(`\nMain.scene updated successfully (${output.length} bytes)`);
}

main();