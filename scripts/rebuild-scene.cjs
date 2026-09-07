#!/usr/bin/env node
/**
 * rebuild-scene.cjs — Rebuild Main.scene for WEB V1 PLAYABLE
 *
 * Generates a complete Cocos Creator 3.8.x scene file with the
 * WEB V1 node tree, replacing the legacy Merge UI.
 *
 * Usage: node scripts/rebuild-scene.cjs
 *
 * Output: assets/scenes/Main.scene (overwritten)
 */

const fs = require('fs');
const path = require('path');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'scenes', 'Main.scene');

// ── Compressed UUIDs for custom components ─────────────────────────────────
const COMP = {
  CocosBootstrap: 'b3150HobX9BGZZPA8DLrkXL',
  HomePage:       'cda510tj3VJQoqIp4uBa8/8',
  MainHud:        '9fe67zMvipJ3bsk71s/JnC8',
  BottomNav:      'da3fcfyx6JLHYeswXCeDyes',
  CultivationPanel: '8ae9eRPyPVFhr092cMGFsVN',
  IdleStatusPanel:  '613d7WuT+pBKIO67VQl4S9O',
};

// ── Scene Builder ──────────────────────────────────────────────────────────

class SceneBuilder {
  constructor() {
    this.objects = [];
  }

  /** Push an object and return its index */
  push(obj) {
    const idx = this.objects.length;
    this.objects.push(obj);
    return idx;
  }

  /** Reference to an object by index */
  ref(idx) { return { __id__: idx }; }

  /** Create a cc.Vec3 */
  vec3(x, y, z) { return { __type__: 'cc.Vec3', x, y, z }; }

  /** Create a cc.Quat */
  quat() { return { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }; }

  /** Create a cc.Size */
  size(w, h) { return { __type__: 'cc.Size', width: w, height: h }; }

  /** Create a cc.Vec2 */
  vec2(x, y) { return { __type__: 'cc.Vec2', x, y }; }

  /** Create a cc.Rect */
  rect(x, y, w, h) { return { __type__: 'cc.Rect', x, y, width: w, height: h }; }

  /** Create a cc.Color */
  color(r, g, b, a) { return { __type__: 'cc.Color', r, g, b, a }; }

  /** Add a cc.Node with standard fields */
  addNode(name, parentId, childIds, componentIds, opts = {}) {
    const node = {
      __type__: 'cc.Node',
      _name: name,
      _objFlags: 0,
      _parent: this.ref(parentId),
      _children: childIds.map(id => this.ref(id)),
      _active: true,
      _components: componentIds.map(id => this.ref(id)),
      _lpos: opts.lpos || this.vec3(0, 0, 0),
      _lrot: this.quat(),
      _lscale: this.vec3(1, 1, 1),
      _layer: opts.layer || 33554432,
    };
    if (opts.id) node._id = opts.id;
    if (opts.prefab) node._prefab = opts.prefab;
    return this.push(node);
  }

  /** Link a component to its node's _components array */
  _linkComponent(nodeIdx, compIdx) {
    this.objects[nodeIdx]._components.push(this.ref(compIdx));
  }

  /** Add cc.UITransform */
  addUITransform(nodeIdx, w, h) {
    const idx = this.push({
      __type__: 'cc.UITransform',
      node: this.ref(nodeIdx),
      _contentSize: this.size(w, h),
      _anchorPoint: this.vec2(0.5, 0.5),
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Widget with full stretch */
  addWidgetStretch(nodeIdx, alignFlags = 45) {
    const idx = this.push({
      __type__: 'cc.Widget',
      _objFlags: 0,
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _alignFlags: alignFlags,
      _target: null,
      _left: 0, _right: 0, _top: 0, _bottom: 0,
      _horizontalCenter: 0, _verticalCenter: 0,
      _isAbsLeft: true, _isAbsRight: true,
      _isAbsTop: true, _isAbsBottom: true,
      _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
      _originalWidth: 0, _originalHeight: 0,
      _alignMode: 2, _lockFlags: 0,
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Widget with specific alignment */
  addWidget(nodeIdx, opts = {}) {
    const alignFlags = opts.alignFlags || 0;
    const idx = this.push({
      __type__: 'cc.Widget',
      _objFlags: 0,
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _alignFlags: alignFlags,
      _target: null,
      _left: opts.left || 0, _right: opts.right || 0,
      _top: opts.top || 0, _bottom: opts.bottom || 0,
      _horizontalCenter: opts.horizontalCenter || 0,
      _verticalCenter: opts.verticalCenter || 0,
      _isAbsLeft: true, _isAbsRight: true,
      _isAbsTop: true, _isAbsBottom: true,
      _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
      _originalWidth: 0, _originalHeight: 0,
      _alignMode: 2, _lockFlags: 0,
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add custom component by compressed UUID */
  addCustomComponent(nodeIdx, compType) {
    const idx = this.push({
      __type__: compType,
      node: this.ref(nodeIdx),
      _enabled: true,
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Label */
  addLabel(nodeIdx, text, fontSize = 24, opts = {}) {
    const idx = this.push({
      __type__: 'cc.Label',
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _string: text,
      _horizontalAlign: 1, // CENTER
      _verticalAlign: 1,   // CENTER
      _actualFontSize: fontSize,
      _fontSize: fontSize,
      _fontFamily: 'Arial',
      _lineHeight: fontSize + 4,
      _overflow: 0, // NONE
      _enableWrapText: true,
      _font: null,
      _isSystemFontUsed: true,
      _spacingX: 0,
      _isItalic: false,
      _isBold: false,
      _isUnderline: false,
      _underlineHeight: 2,
      _cacheMode: 0,
      _color: opts.color || this.color(255, 255, 255, 255),
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Button */
  addButton(nodeIdx, opts = {}) {
    const idx = this.push({
      __type__: 'cc.Button',
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      clickEvents: [],
      _interactable: true,
      _transition: 2, // COLOR
      _normalColor: this.color(214, 214, 214, 255),
      _hoverColor: this.color(211, 211, 211, 255),
      _pressedColor: this.color(255, 255, 255, 255),
      _disabledColor: this.color(124, 124, 124, 255),
      _duration: 0.1,
      _zoomScale: 1.2,
      _target: null,
      _id: '',
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Camera */
  addCamera(nodeIdx) {
    const idx = this.push({
      __type__: 'cc.Camera',
      _name: '',
      _objFlags: 0,
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _projection: 0,
      _priority: 1073741824,
      _fov: 45,
      _fovAxis: 0,
      _orthoHeight: 10,
      _near: 1,
      _far: 2000,
      _color: this.color(0, 0, 0, 255),
      _depth: 1,
      _stencil: 0,
      _clearFlags: 6,
      _rect: this.rect(0, 0, 1, 1),
      _aperture: 19,
      _shutter: 7,
      _iso: 0,
      _screenScale: 1,
      _visibility: 42467328,
      _id: '22bO4kMAlFMKE5m2Vco3Ob',
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.Canvas */
  addCanvas(nodeIdx, cameraIdx) {
    const idx = this.push({
      __type__: 'cc.Canvas',
      node: this.ref(nodeIdx),
      _enabled: true,
      _designResolution: this.size(720, 1280),
      _fitHeight: true,
      _fitWidth: false,
      _cameraComponent: this.ref(cameraIdx),
      _alignCanvasWithScreen: true,
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add cc.PrefabInfo */
  addPrefabInfo() {
    return this.push({ __type__: 'cc.PrefabInfo' });
  }

  /** Build the final JSON */
  build() {
    return this.objects;
  }
}

// ── Build the scene ────────────────────────────────────────────────────────

function buildScene() {
  const b = new SceneBuilder();

  // ── 0: cc.SceneAsset ──────────────────────────────────────────────────
  // Will set scene ref after we know scene index
  const sceneAssetIdx = b.push({
    __type__: 'cc.SceneAsset',
    _name: 'Main',
    _objFlags: 0,
    _native: '',
    scene: null, // will fix later
  });

  // ── 1: cc.Scene ───────────────────────────────────────────────────────
  // Will set children and prefab after we know canvas index
  const sceneIdx = b.push({
    __type__: 'cc.Scene',
    _name: 'Main',
    _objFlags: 0,
    _children: [], // will fix later
    _active: true,
    _components: [],
    autoReleaseAssets: false,
    _prefab: null, // will fix later
    _id: 'e1194371-c4a8-4e5a-a88c-1a780e7ef218',
  });

  // ── Build SafeAreaRoot subtree first (bottom-up) ─────────────────────

  // --- Background node ---
  const bgIdx = b.addNode('Background', -1, [], [], { lpos: b.vec3(0, 0, 0) });
  const bgUtIdx = b.addUITransform(bgIdx, 720, 1280);
  const bgWidgetIdx = b.addWidgetStretch(bgIdx);

  // --- TopHeader node (with MainHudComponent) ---
  const topHeaderIdx = b.addNode('TopHeader', -1, [], []);
  const topHeaderHudIdx = b.addCustomComponent(topHeaderIdx, COMP.MainHud);
  const topHeaderUtIdx = b.addUITransform(topHeaderIdx, 720, 100);
  const topHeaderWidgetIdx = b.addWidget(topHeaderIdx, { alignFlags: 9, top: 0, horizontalCenter: 0 }); // top + h-center

  // --- ResourceBar node ---
  const resBarIdx = b.addNode('ResourceBar', -1, [], []);
  const resBarUtIdx = b.addUITransform(resBarIdx, 720, 50);
  const resBarWidgetIdx = b.addWidget(resBarIdx, { alignFlags: 9, top: 100, horizontalCenter: 0 });

  // --- CharacterArea node ---
  const charAreaIdx = b.addNode('CharacterArea', -1, [], []);
  const charAreaUtIdx = b.addUITransform(charAreaIdx, 720, 300);

  // --- IdleIncomePanel node (with IdleStatusPanelComponent) ---
  const idleIdx = b.addNode('IdleIncomePanel', -1, [], []);
  const idleCompIdx = b.addCustomComponent(idleIdx, COMP.IdleStatusPanel);
  const idleUtIdx = b.addUITransform(idleIdx, 720, 120);

  // --- PrimaryActions node with 3 buttons ---
  // CultivateButton
  const cultBtnIdx = b.addNode('CultivateButton', -1, [], []);
  const cultBtnUtIdx = b.addUITransform(cultBtnIdx, 200, 60);
  const cultBtnBtnIdx = b.addButton(cultBtnIdx);
  const cultBtnLabelIdx = b.addLabel(cultBtnIdx, '修炼', 28);

  // WorkButton
  const workBtnIdx = b.addNode('WorkButton', -1, [], []);
  const workBtnUtIdx = b.addUITransform(workBtnIdx, 200, 60);
  const workBtnBtnIdx = b.addButton(workBtnIdx);
  const workBtnLabelIdx = b.addLabel(workBtnIdx, '打工', 28);

  // FishButton
  const fishBtnIdx = b.addNode('FishButton', -1, [], []);
  const fishBtnUtIdx = b.addUITransform(fishBtnIdx, 200, 60);
  const fishBtnBtnIdx = b.addButton(fishBtnIdx);
  const fishBtnLabelIdx = b.addLabel(fishBtnIdx, '摸鱼', 28);

  // PrimaryActions parent
  const actionsIdx = b.addNode('PrimaryActions', -1,
    [cultBtnIdx, workBtnIdx, fishBtnIdx],
    []);
  const actionsUtIdx = b.addUITransform(actionsIdx, 660, 80);
  const actionsWidgetIdx = b.addWidget(actionsIdx, { alignFlags: 12, bottom: 180, horizontalCenter: 0 }); // bottom + h-center

  // --- BottomNavigation node with 5 tabs ---
  const tabDefs = [
    { name: 'TabHome', label: '首页' },
    { name: 'TabTasks', label: '任务' },
    { name: 'TabCraft', label: '合成' },
    { name: 'TabPromotion', label: '晋升' },
    { name: 'TabMore', label: '更多' },
  ];

  const tabNodeIds = [];
  for (const tab of tabDefs) {
    const tabIdx = b.addNode(tab.name, -1, [], []);
    b.addUITransform(tabIdx, 120, 60);
    b.addButton(tabIdx);
    b.addLabel(tabIdx, tab.label, 22);
    tabNodeIds.push(tabIdx);
  }

  const bottomNavIdx = b.addNode('BottomNavigation', -1, tabNodeIds, []);
  const bottomNavCompIdx = b.addCustomComponent(bottomNavIdx, COMP.BottomNav);
  const bottomNavUtIdx = b.addUITransform(bottomNavIdx, 720, 80);
  const bottomNavWidgetIdx = b.addWidget(bottomNavIdx, { alignFlags: 12, bottom: 0, horizontalCenter: 0 }); // bottom + h-center

  // --- PageContainer node with 5 pages ---
  const pageDefs = [
    'HomePageContent',
    'TasksPageContent',
    'CraftPageContent',
    'PromotionPageContent',
    'MorePageContent',
  ];

  const pageNodeIds = [];
  for (const pageName of pageDefs) {
    const pageIdx = b.addNode(pageName, -1, [], []);
    b.addUITransform(pageIdx, 720, 800);
    pageNodeIds.push(pageIdx);
  }

  const pageContIdx = b.addNode('PageContainer', -1, pageNodeIds, []);
  const pageContUtIdx = b.addUITransform(pageContIdx, 720, 800);
  const pageContWidgetIdx = b.addWidget(pageContIdx, { alignFlags: 12, bottom: 80, top: 470, horizontalCenter: 0 });

  // --- ModalLayer node ---
  const modalIdx = b.addNode('ModalLayer', -1, [], []);
  const modalUtIdx = b.addUITransform(modalIdx, 750, 1334);
  const modalWidgetIdx = b.addWidgetStretch(modalIdx);

  // --- ToastLayer node ---
  const toastIdx = b.addNode('ToastLayer', -1, [], []);
  const toastUtIdx = b.addUITransform(toastIdx, 720, 200);
  const toastWidgetIdx = b.addWidget(toastIdx, { alignFlags: 8, bottom: 100, horizontalCenter: 0 }); // bottom + h-center

  // --- TutorialLayer node ---
  const tutorIdx = b.addNode('TutorialLayer', -1, [], []);
  const tutorUtIdx = b.addUITransform(tutorIdx, 750, 1334);
  const tutorWidgetIdx = b.addWidgetStretch(tutorIdx);

  // ── SafeAreaRoot node ─────────────────────────────────────────────────
  const safeAreaIdx = b.addNode('SafeAreaRoot', -1,
    [bgIdx, topHeaderIdx, resBarIdx, charAreaIdx, idleIdx, actionsIdx, bottomNavIdx, pageContIdx, modalIdx, toastIdx, tutorIdx],
    []);
  const safeAreaBootIdx = b.addCustomComponent(safeAreaIdx, COMP.CocosBootstrap);
  const safeAreaUtIdx = b.addUITransform(safeAreaIdx, 720, 1280);
  const safeAreaWidgetIdx = b.addWidgetStretch(safeAreaIdx);
  const safeAreaHomeIdx = b.addCustomComponent(safeAreaIdx, COMP.HomePage);

  // ── Bootstrap node (required by test contract) ───────────────────────
  const bootstrapIdx = b.addNode('Bootstrap', -1, [], []);
  const bootstrapCompIdx = b.addCustomComponent(bootstrapIdx, COMP.CocosBootstrap);
  const bootstrapUtIdx = b.addUITransform(bootstrapIdx, 720, 1280);
  const bootstrapWidgetIdx = b.addWidgetStretch(bootstrapIdx);

  // ── UICamera_Canvas node ──────────────────────────────────────────────
  const uiCamIdx = b.addNode('UICamera_Canvas', -1, [], [], { layer: 524288, id: '2dPXj+bLtNnLNQh3db5lcx' });
  const uiCamCompIdx = b.addCamera(uiCamIdx);

  // ── Canvas node ───────────────────────────────────────────────────────
  const canvasIdx = b.addNode('Canvas', -1,
    [bootstrapIdx, safeAreaIdx, uiCamIdx],
    [], { layer: 524288 });
  const canvasCompIdx = b.addCanvas(canvasIdx, uiCamCompIdx);
  const canvasUtIdx = b.addUITransform(canvasIdx, 720, 1280);
  const canvasWidgetIdx = b.addWidgetStretch(canvasIdx);

  // ── PrefabInfo ────────────────────────────────────────────────────────
  const prefabIdx = b.addPrefabInfo();

  // ── Fix forward references ────────────────────────────────────────────

  // SceneAsset.scene -> Scene
  b.objects[sceneAssetIdx].scene = b.ref(sceneIdx);

  // Scene._children -> [Canvas]
  b.objects[sceneIdx]._children = [b.ref(canvasIdx)];

  // Scene._prefab -> PrefabInfo
  b.objects[sceneIdx]._prefab = b.ref(prefabIdx);

  // Canvas._parent -> Scene
  b.objects[canvasIdx]._parent = b.ref(sceneIdx);

  // Bootstrap._parent -> Canvas
  b.objects[bootstrapIdx]._parent = b.ref(canvasIdx);

  // SafeAreaRoot._parent -> Canvas
  b.objects[safeAreaIdx]._parent = b.ref(canvasIdx);

  // UICamera_Canvas._parent -> Canvas
  b.objects[uiCamIdx]._parent = b.ref(canvasIdx);

  // Fix all child node parents
  const childParentFixes = [
    [bgIdx, safeAreaIdx],
    [topHeaderIdx, safeAreaIdx],
    [resBarIdx, safeAreaIdx],
    [charAreaIdx, safeAreaIdx],
    [idleIdx, safeAreaIdx],
    [actionsIdx, safeAreaIdx],
    [bottomNavIdx, safeAreaIdx],
    [pageContIdx, safeAreaIdx],
    [modalIdx, safeAreaIdx],
    [toastIdx, safeAreaIdx],
    [tutorIdx, safeAreaIdx],
    [cultBtnIdx, actionsIdx],
    [workBtnIdx, actionsIdx],
    [fishBtnIdx, actionsIdx],
  ];
  for (const [childIdx, parentIdx] of childParentFixes) {
    b.objects[childIdx]._parent = b.ref(parentIdx);
  }

  // Fix tab node parents
  for (const tabIdx of tabNodeIds) {
    b.objects[tabIdx]._parent = b.ref(bottomNavIdx);
  }

  // Fix page node parents
  for (const pageIdx of pageNodeIds) {
    b.objects[pageIdx]._parent = b.ref(pageContIdx);
  }

  return b.build();
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  WEB V1 Scene Rebuilder');
  console.log('═══════════════════════════════════════════\n');

  const scene = buildScene();

  // Write scene file
  const json = JSON.stringify(scene, null, 2);
  fs.writeFileSync(SCENE_PATH, json, 'utf-8');

  console.log(`✅ Scene written to ${SCENE_PATH}`);
  console.log(`   Total objects: ${scene.length}`);

  // Verify basic structure
  const nodeCount = scene.filter(o => o.__type__ === 'cc.Node').length;
  const compCount = scene.filter(o => o.__type__ !== 'cc.Node' && o.__type__ !== 'cc.SceneAsset' && o.__type__ !== 'cc.Scene' && o.__type__ !== 'cc.PrefabInfo').length;
  console.log(`   Nodes: ${nodeCount}, Components: ${compCount}`);

  // Verify required nodes exist
  const nodeNames = scene.filter(o => o.__type__ === 'cc.Node').map(o => o._name);
  const required = ['Bootstrap', 'SafeAreaRoot', 'TopHeader', 'ResourceBar', 'CharacterArea', 'IdleIncomePanel',
    'PrimaryActions', 'BottomNavigation', 'PageContainer', 'ModalLayer', 'ToastLayer', 'TutorialLayer'];
  const missing = required.filter(n => !nodeNames.includes(n));
  if (missing.length > 0) {
    console.error(`❌ Missing required nodes: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ All ${required.length} required nodes present`);

  // Verify no forbidden nodes
  const forbidden = ['MergeBoard', 'BoardCell00', 'BoardCell01', 'BoardCell15', 'RecruitButton'];
  const found = forbidden.filter(n => nodeNames.includes(n));
  if (found.length > 0) {
    console.error(`❌ Forbidden nodes found: ${found.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ No forbidden legacy nodes');
}

main();