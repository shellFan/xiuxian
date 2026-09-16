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
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
// The shared resource strip ends at roughly 122px and the bottom chrome
// begins at 652px. Pages occupy that full middle band; home-only panels are
// toggled by GameUIController so craft/tasks never compete for the same space.
const PAGE_TOP_INSET = 140;
const PAGE_BOTTOM_INSET = 90;
const PAGE_CONTAINER_HEIGHT = DESIGN_HEIGHT - PAGE_TOP_INSET - PAGE_BOTTOM_INSET;

// Stable Cocos asset identities. The SpriteFrame UUID is the sub-asset UUID
// that belongs to the PNG's Texture2D importer record; keeping both UUIDs
// together makes every generated reference explicit and reproducible.
const HOME_ASSETS = {
  character: {
    path: 'assets/textures/ui/home/home-character.png',
    textureUuid: 'ede466c5-53d8-4083-902e-1f3f4916f98e',
    spriteFrameUuid: 'ede466c5-53d8-4083-902e-1f3f4916f98e@f9941',
  },
  background: {
    path: 'assets/textures/ui/home/home-office-background.png',
    textureUuid: '7b9fa0d8-5883-47ce-8d83-b0ddf2792796',
    spriteFrameUuid: '7b9fa0d8-5883-47ce-8d83-b0ddf2792796@f9941',
  },
};

function assetRef(uuid, expectedType) {
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new Error(`Missing UUID for ${expectedType}`);
  }
  return { __uuid__: uuid, __expectedType__: expectedType };
}

function textureRef(asset) {
  return assetRef(asset.textureUuid, 'cc.Texture2D');
}

function spriteFrameRef(asset) {
  return assetRef(asset.spriteFrameUuid, 'cc.SpriteFrame');
}

function validateHomeAssetRefs() {
  for (const asset of Object.values(HOME_ASSETS)) {
    textureRef(asset);
    spriteFrameRef(asset);
    if (!asset.path.endsWith('.png') || !fs.existsSync(path.join(__dirname, '..', asset.path))) {
      throw new Error(`Home visual asset must be a PNG: ${asset.path}`);
    }
    for (const uuid of [asset.textureUuid, asset.spriteFrameUuid]) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:@[a-z0-9]+)?$/i.test(uuid)) {
        throw new Error(`Invalid home visual asset UUID: ${uuid}`);
      }
    }
  }
}

// ── Compressed UUIDs for custom components ─────────────────────────────────
const COMP = {
  CocosBootstrap: 'b3150HobX9BGZZPA8DLrkXL',
  HomePage:       'cda510tj3VJQoqIp4uBa8/8',
  MainHud:        '9fe67zMvipJ3bsk71s/JnC8',
  BottomNav:      'da3fcfyx6JLHYeswXCeDyes',
  CultivationPanel: '8ae9eRPyPVFhr092cMGFsVN',
  IdleStatusPanel:  '613d7WuT+pBKIO67VQl4S9O',
  GameUIController: '516528SB9RKXrAoWRItq8An',
  MorePage:      'bc234ncQzZHW6kJFWun4xdA',
  BoardCellRenderer: 'a1b2cPU5fZHqJGyw9Tl9qe4',
  WebV1PanelRenderer: '9d3c5ajahRK77mt3Dp3Hysh',
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
      _active: opts.active !== undefined ? opts.active : true,
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

  /** Add cc.Widget with full stretch (left + right + top + bottom). */
  // Cocos Creator 3.8 AlignFlags: TOP=1, MID=2, BOT=4, LEFT=8,
  // CENTER=16, RIGHT=32.
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
      _target: Number.isInteger(opts.target) ? this.ref(opts.target) : null,
      _id: '',
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add a Cocos 3.8 cc.Sprite with an explicitly typed SpriteFrame asset. */
  addSprite(nodeIdx, spriteFrame, opts = {}) {
    const idx = this.push({
      __type__: 'cc.Sprite',
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _materials: [],
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: opts.color || this.color(255, 255, 255, 255),
      _spriteFrame: spriteFrame,
      _type: 0,
      _fillType: 0,
      _fillCenter: this.vec2(0, 0),
      _fillStart: 0,
      _fillRange: 1,
      _isTrimmedMode: false,
      _useGrayscale: false,
      _atlas: null,
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add a cc.Graphics renderer with a filled cell background. */
  addGraphicsBackground(nodeIdx, opts = {}) {
    const idx = this.push({
      __type__: 'cc.Graphics',
      node: this.ref(nodeIdx),
      _enabled: true,
      __prefab: null,
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: this.color(255, 255, 255, 255),
      _lineWidth: opts.lineWidth || 2,
      _lineJoin: 2,
      _lineCap: 0,
      _miterLimit: 10,
      _strokeColor: opts.strokeColor || this.color(120, 120, 120, 255),
      _fillColor: opts.fillColor || this.color(235, 235, 235, 255),
    });
    this._linkComponent(nodeIdx, idx);
    return idx;
  }

  /** Add an asset-free visible panel with a serialized Graphics renderer. */
  addPanel(nodeIdx, width, height, opts = {}) {
    this.addUITransform(nodeIdx, width, height);
    this.addGraphicsBackground(nodeIdx, {
      fillColor: opts.fillColor || this.color(244, 237, 220, 255),
      strokeColor: opts.strokeColor || this.color(184, 165, 132, 255),
      lineWidth: opts.lineWidth || 2,
    });
    this.addCustomComponent(nodeIdx, COMP.WebV1PanelRenderer);
  }

  /** Add a stable, asset-free label node. */
  addTextNode(name, text, width, height, opts = {}) {
    const idx = this.addNode(name, -1, [], [], { lpos: opts.lpos || this.vec3(0, 0, 0) });
    this.addUITransform(idx, width, height);
    this.addLabel(idx, text, opts.fontSize || 22, { color: opts.color || this.color(40, 40, 40, 255) });
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
      _designResolution: this.size(DESIGN_WIDTH, DESIGN_HEIGHT),
      _fitHeight: false,
      _fitWidth: true,
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
  validateHomeAssetRefs();
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

  const chrome = b.color(27, 48, 82, 255);
  const chromeSoft = b.color(48, 75, 116, 255);
  const chromeHighlight = b.color(72, 101, 148, 255);
  const paper = b.color(244, 237, 220, 255);
  const paperSoft = b.color(233, 224, 204, 255);
  const ink = b.color(40, 40, 40, 255);
  const white = b.color(255, 255, 255, 255);
  const mutedInk = b.color(92, 86, 75, 255);
  const accent = b.color(176, 130, 77, 255);
  const accentStroke = b.color(124, 88, 49, 255);
  const success = b.color(142, 190, 158, 255);
  const successStroke = b.color(83, 133, 101, 255);
  const progress = b.color(130, 174, 211, 255);
  const progressStroke = b.color(77, 122, 163, 255);

  // Page-only helpers keep every visual child asset-free while preserving
  // the node names expected by the runtime page components.
  const attachChild = (parentIdx, childIdx) => {
    if (parentIdx < 0) return childIdx;
    b.objects[parentIdx]._children.push(b.ref(childIdx));
    b.objects[childIdx]._parent = b.ref(parentIdx);
    return childIdx;
  };

  const addPageText = (parentIdx, name, text, width, height, opts = {}) => {
    const textIdx = b.addTextNode(name, text, width, height, opts);
    return attachChild(parentIdx, textIdx);
  };

  const addPageCard = (parentIdx, name, width, height, lpos, opts = {}) => {
    const cardIdx = b.addNode(name, -1, [], [], { lpos });
    b.addPanel(cardIdx, width, height, {
      fillColor: opts.fillColor || paper,
      strokeColor: opts.strokeColor || b.color(194, 172, 137, 255),
      lineWidth: opts.lineWidth || 2,
    });
    return attachChild(parentIdx, cardIdx);
  };

  const addPageButton = (parentIdx, name, label, width, height, lpos, opts = {}) => {
    const buttonIdx = b.addNode(name, -1, [], [], { lpos });
    b.addPanel(buttonIdx, width, height, {
      fillColor: opts.fillColor || chromeSoft,
      strokeColor: opts.strokeColor || chrome,
      lineWidth: 2,
    });
    b.addButton(buttonIdx);
    addPageText(buttonIdx, `${name}Label`, label, width, height, {
      fontSize: opts.fontSize || 20,
      color: opts.textColor || white,
    });
    return attachChild(parentIdx, buttonIdx);
  };

  // --- Background node ---
  const paperIdx = b.addNode('PaperContent', -1, [], [], { lpos: b.vec3(0, -8, 0) });
  b.addPanel(paperIdx, 1220, 650, { fillColor: paper, strokeColor: b.color(205, 190, 161, 255) });
  b.addSprite(paperIdx, spriteFrameRef(HOME_ASSETS.background));
  const bgIdx = b.addNode('Background', -1, [paperIdx], []);
  b.addPanel(bgIdx, DESIGN_WIDTH, DESIGN_HEIGHT, { fillColor: chrome, strokeColor: chrome });
  const bgWidgetIdx = b.addWidgetStretch(bgIdx);

  // --- TopHeader node (with MainHudComponent) ---
  const brandLabelIdx = b.addTextNode('BrandLabel', '牛马修仙传', 300, 50, {
    lpos: b.vec3(-430, 14, 0), fontSize: 28, color: white,
  });
  const brandTaglineIdx = b.addTextNode('BrandTaglineLabel', '上班也是渡劫', 300, 24, {
    lpos: b.vec3(-430, -26, 0), fontSize: 16, color: b.color(195, 211, 235, 255),
  });
  const careerSummaryIdx = b.addTextNode('CareerSummaryLabel', '练气境 · 练气职员', 360, 42, {
    lpos: b.vec3(330, 0, 0), fontSize: 20, color: white,
  });
  const topHeaderIdx = b.addNode('TopHeader', -1, [brandLabelIdx, brandTaglineIdx, careerSummaryIdx], []);
  const topHeaderHudIdx = b.addCustomComponent(topHeaderIdx, COMP.MainHud);
  b.addGraphicsBackground(topHeaderIdx, { fillColor: chrome, strokeColor: chromeHighlight });
  b.addUITransform(topHeaderIdx, 1220, 76);
  const topHeaderWidgetIdx = b.addWidget(topHeaderIdx, { alignFlags: 17, top: 0, horizontalCenter: 0 }); // top + h-center

  // --- ResourceBar node with four independently readable resource chips ---
  // Keep the old summary slot for controller and scene compatibility. The
  // visible values are rendered by the four named chips below.
  const resourceSummaryIdx = b.addTextNode('ResourceSummaryLabel', '资源概览', 1080, 20, {
    lpos: b.vec3(0, -30, 0), fontSize: 14, color: b.color(92, 86, 75, 255),
  });
  b.objects[resourceSummaryIdx]._active = false;
  const resourceDefs = [
    { name: 'ResourceCultivationChip', label: 'CultivationResourceLabel', text: '修为\n0/100', x: -405, fill: b.color(130, 174, 211, 255), stroke: b.color(77, 122, 163, 255) },
    { name: 'ResourceSalaryChip', label: 'SalaryResourceLabel', text: '工资\n0', x: -135, fill: b.color(224, 184, 116, 255), stroke: b.color(175, 127, 66, 255) },
    { name: 'ResourcePerformanceChip', label: 'PerformanceResourceLabel', text: '绩效\n0', x: 135, fill: b.color(142, 190, 158, 255), stroke: b.color(83, 133, 101, 255) },
    { name: 'ResourceMindChip', label: 'MindResourceLabel', text: '道心\n100/100', x: 405, fill: b.color(196, 151, 190, 255), stroke: b.color(145, 101, 139, 255) },
  ];
  const resourceChipIds = resourceDefs.map((resource) => {
    const labelIdx = b.addTextNode(resource.label, resource.text, 248, 58, {
      lpos: b.vec3(0, 0, 0), fontSize: 19, color: white,
    });
    const chipIdx = b.addNode(resource.name, -1, [labelIdx], [], { lpos: b.vec3(resource.x, 0, 0) });
    b.addPanel(chipIdx, 248, 58, { fillColor: resource.fill, strokeColor: resource.stroke, lineWidth: 2 });
    return chipIdx;
  });
  const resBarIdx = b.addNode('ResourceBar', -1, [resourceSummaryIdx, ...resourceChipIds], []);
  b.addPanel(resBarIdx, 1140, 76, { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255) });
  const resBarWidgetIdx = b.addWidget(resBarIdx, { alignFlags: 17, top: 84, horizontalCenter: 0 });

  // --- CharacterArea node ---
  const characterIconIdx = b.addNode('CharacterIconLabel', -1, [], [], {
    lpos: b.vec3(-480, 0, 0),
  });
  b.addUITransform(characterIconIdx, 190, 156);
  b.addSprite(characterIconIdx, spriteFrameRef(HOME_ASSETS.character));
  const characterNameIdx = b.addTextNode('CharacterNameLabel', '练气职员 · 初入修仙职场', 620, 44, {
    lpos: b.vec3(80, 30, 0), fontSize: 28, color: ink,
  });
  const characterStatusIdx = b.addTextNode('CharacterStatusLabel', '散修 · 未觉醒天赋 · 灵石与修为正在积累', 700, 40, {
    lpos: b.vec3(80, -18, 0), fontSize: 19, color: b.color(92, 86, 75, 255),
  });
  const characterHintIdx = b.addTextNode('CharacterHintLabel', '今日也要稳住道心', 420, 36, {
    lpos: b.vec3(80, -64, 0), fontSize: 18, color: b.color(130, 93, 52, 255),
  });
  const charAreaIdx = b.addNode('CharacterArea', -1, [characterIconIdx, characterNameIdx, characterStatusIdx, characterHintIdx], []);
  b.addPanel(charAreaIdx, 1120, 160, { fillColor: paper, strokeColor: b.color(194, 172, 137, 255) });
  const charAreaWidgetIdx = b.addWidget(charAreaIdx, { alignFlags: 17, top: 166, horizontalCenter: 0 });

  // --- IdleIncomePanel node (with IdleStatusPanelComponent) ---
  const workStatusIdx = b.addTextNode('WorkStatusLabel', '带薪摸鱼  ·  工资 ×0.6  ·  绩效 ×0.7  ·  道心恢复 ×3.0', 1000, 38, {
    lpos: b.vec3(0, 20, 0), fontSize: 20, color: ink,
  });
  const idleEfficiencyIdx = b.addTextNode('IdleEfficiencyLabel', '综合效率 76%  ·  状态：精神饱满', 700, 32, {
    lpos: b.vec3(0, -23, 0), fontSize: 17, color: b.color(92, 86, 75, 255),
  });
  const idleIdx = b.addNode('IdleIncomePanel', -1, [workStatusIdx, idleEfficiencyIdx], []);
  const idleCompIdx = b.addCustomComponent(idleIdx, COMP.IdleStatusPanel);
  b.addPanel(idleIdx, 1080, 78, { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255) });
  const idleWidgetIdx = b.addWidget(idleIdx, { alignFlags: 17, top: 334, horizontalCenter: 0 });

  // --- PrimaryActions node with 3 buttons ---
  // CultivateButton
  const cultBtnIdx = b.addNode('CultivateButton', -1, [], [], { lpos: b.vec3(-300, 0, 0) });
  b.addPanel(cultBtnIdx, 220, 64, { fillColor: b.color(176, 130, 77, 255), strokeColor: b.color(124, 88, 49, 255) });
  const cultBtnBtnIdx = b.addButton(cultBtnIdx);
  const cultBtnLabelIdx = b.addTextNode('CultivateButtonLabel', '修炼一次', 220, 64, { fontSize: 25, color: white });
  b.objects[cultBtnIdx]._children = [b.ref(cultBtnLabelIdx)];

  // WorkButton
  const workBtnIdx = b.addNode('WorkButton', -1, [], [], { lpos: b.vec3(0, 0, 0) });
  b.addPanel(workBtnIdx, 220, 64, { fillColor: chromeSoft, strokeColor: chrome });
  const workBtnBtnIdx = b.addButton(workBtnIdx);
  const workBtnLabelIdx = b.addTextNode('WorkButtonLabel', '努力工作', 220, 64, { fontSize: 25, color: white });
  b.objects[workBtnIdx]._children = [b.ref(workBtnLabelIdx)];

  // FishButton
  const fishBtnIdx = b.addNode('FishButton', -1, [], [], { lpos: b.vec3(300, 0, 0) });
  b.addPanel(fishBtnIdx, 220, 64, { fillColor: chromeSoft, strokeColor: chrome });
  const fishBtnBtnIdx = b.addButton(fishBtnIdx);
  const fishBtnLabelIdx = b.addTextNode('FishButtonLabel', '摸鱼恢复', 220, 64, { fontSize: 25, color: white });
  b.objects[fishBtnIdx]._children = [b.ref(fishBtnLabelIdx)];

  // PrimaryActions parent
  const actionsIdx = b.addNode('PrimaryActions', -1,
    [cultBtnIdx, workBtnIdx, fishBtnIdx],
    []);
  b.addPanel(actionsIdx, 1140, 82, { fillColor: chrome, strokeColor: chromeSoft });
  const actionsWidgetIdx = b.addWidget(actionsIdx, { alignFlags: 20, bottom: 220, horizontalCenter: 0 }); // bottom + h-center

  // --- BottomNavigation node with 5 tabs ---
  const tabDefs = [
    { name: 'TabHome', label: '首页' },
    { name: 'TabTasks', label: '任务' },
    { name: 'TabCraft', label: '合成' },
    { name: 'TabPromotion', label: '晋升' },
    { name: 'TabMore', label: '更多' },
  ];

  const tabNodeIds = [];
  for (let tabIndex = 0; tabIndex < tabDefs.length; tabIndex += 1) {
    const tab = tabDefs[tabIndex];
    const tabIdx = b.addNode(tab.name, -1, [], [], { lpos: b.vec3((tabIndex - 2) * 210, 0, 0) });
    b.addPanel(tabIdx, 180, 58, { fillColor: chromeSoft, strokeColor: chrome });
    b.addButton(tabIdx);
    const tabLabelIdx = b.addTextNode(`${tab.name}Label`, tab.label, 180, 58, { fontSize: 22, color: white });
    b.objects[tabIdx]._children = [b.ref(tabLabelIdx)];
    tabNodeIds.push(tabIdx);
  }

  const bottomNavIdx = b.addNode('BottomNavigation', -1, tabNodeIds, []);
  const bottomNavCompIdx = b.addCustomComponent(bottomNavIdx, COMP.BottomNav);
  b.addPanel(bottomNavIdx, 1220, 68, { fillColor: chrome, strokeColor: chromeSoft });
  const bottomNavWidgetIdx = b.addWidget(bottomNavIdx, { alignFlags: 20, bottom: 0, horizontalCenter: 0 }); // bottom + h-center

  // --- PageContainer node with 5 pages ---
  const pageDefs = [
    'HomePageContent',
    'TasksPageContent',
    'CraftPageContent',
    'PromotionPageContent',
    'MorePageContent',
  ];

  const pageNodeIds = [];
  const craftNodeIds = [];
  const craftBoardCellIds = [];
  for (const pageName of pageDefs) {
    const pageChildren = [];
    if (pageName === 'CraftPageContent') {
      // CraftHeader
      const craftHeaderIdx = b.addNode('CraftHeader', -1, [], [], { lpos: b.vec3(0, 210, 0) });
      b.addUITransform(craftHeaderIdx, 1280, 60);
      b.addLabel(craftHeaderIdx, '合成工坊', 30, { color: b.color(40, 40, 40, 255) });
      pageChildren.push(craftHeaderIdx);
      craftNodeIds.push(craftHeaderIdx);

      // RecruitButton
      const recruitButtonIdx = b.addNode('RecruitButton', -1, [], [], { lpos: b.vec3(470, 210, 0) });
      b.addPanel(recruitButtonIdx, 180, 56, { fillColor: b.color(176, 130, 77, 255), strokeColor: b.color(124, 88, 49, 255) });
      b.addButton(recruitButtonIdx);
      b.addLabel(recruitButtonIdx, '招聘', 24, { color: white });
      pageChildren.push(recruitButtonIdx);
      craftNodeIds.push(recruitButtonIdx);

      // Board cells are built before their parent so the parent can reference
      // the complete 4×4 child list in one pass.
      for (let cell = 0; cell < 16; cell += 1) {
        const row = Math.floor(cell / 4);
        const column = cell % 4;
        const cellName = `BoardCell${cell.toString().padStart(2, '0')}`;
        const cellIdx = b.addNode(cellName, -1, [], [], {
          lpos: b.vec3((column - 1.5) * 124, (1.5 - row) * 94, 0),
        });
        b.addUITransform(cellIdx, 112, 82);
        b.addGraphicsBackground(cellIdx);
        b.addButton(cellIdx, { target: cellIdx });
        b.addCustomComponent(cellIdx, COMP.BoardCellRenderer);

        const labelNodeIdx = b.addNode(`${cellName}Label`, -1, [], [], { lpos: b.vec3(0, 0, 0) });
        b.addUITransform(labelNodeIdx, 112, 82);
        b.addLabel(labelNodeIdx, '空', 22, { color: b.color(80, 80, 80, 255) });

        b.objects[cellIdx]._children = [b.ref(labelNodeIdx)];
        craftBoardCellIds.push(cellIdx);
        craftNodeIds.push(cellIdx, labelNodeIdx);
      }

      const boardIdx = b.addNode('MergeBoardRoot', -1, craftBoardCellIds, [], { lpos: b.vec3(0, -20, 0) });
      b.addUITransform(boardIdx, 520, 400);
      pageChildren.push(boardIdx);
      craftNodeIds.push(boardIdx);

      // Recipe rows are the PC V1 craft presentation. The board contract is
      // retained for compatibility but GameUIController hides it at runtime.
      const recipeRowIds = [];
      for (let recipe = 0; recipe < 6; recipe += 1) {
        const rowName = `CraftRecipeRow${recipe.toString().padStart(2, '0')}`;
        const rowIdx = b.addNode(rowName, -1, [], [], {
          lpos: b.vec3(0, 135 - recipe * 58, 0),
        });
        b.addPanel(rowIdx, 1000, 52, { fillColor: paper, strokeColor: b.color(194, 172, 137, 255) });
        b.addButton(rowIdx);
        // Keep the visible label on the row itself. GameUIController resolves
        // and updates this exact Label; do not add a stale placeholder child.
        b.addLabel(rowIdx, '配方 · 材料 · 产物 · 合成', 20, { color: ink });
        recipeRowIds.push(rowIdx);
        craftNodeIds.push(rowIdx);
      }
      const recipeListIdx = b.addNode('CraftRecipeList', -1, recipeRowIds, [], { lpos: b.vec3(0, -44, 0) });
      b.addUITransform(recipeListIdx, 1040, 360);
      pageChildren.push(recipeListIdx);
      craftNodeIds.push(recipeListIdx);
    }

    if (pageName !== 'HomePageContent' && pageName !== 'CraftPageContent') {
      const pageTitles = {
        TasksPageContent: '任务',
        PromotionPageContent: '晋升',
        MorePageContent: '更多',
      };
      const pageTitle = pageTitles[pageName] || pageName.replace('PageContent', '');
      const pageTitleIdx = b.addTextNode(`${pageName}TitleLabel`, pageTitle, 600, 48, {
        lpos: b.vec3(0, 190, 0), fontSize: 30, color: ink,
      });
      pageChildren.push(pageTitleIdx);
    }

    if (pageName === 'TasksPageContent') {
      const summaryIdx = b.addNode('TasksSummaryBar', -1, [], [], { lpos: b.vec3(0, 146, 0) });
      b.addPanel(summaryIdx, 1040, 34, { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255) });
      addPageText(summaryIdx, 'TasksSlotLabel', '今日任务 · 0/3 进行中', 980, 30, {
        fontSize: 17, color: mutedInk,
      });
      pageChildren.push(summaryIdx);

      const tasksContainerIdx = b.addNode('TasksAvailableContainer', -1, [], [], { lpos: b.vec3(0, 6, 0) });
      b.addUITransform(tasksContainerIdx, 1120, 290);
      const taskCards = [
        { name: '每日签到', reward: '奖励  💎灵石 +10  ·  ⚡修为 +5', time: '10 秒 · 日常任务' },
        { name: '修炼日常', reward: '奖励  ⚡修为 +30  ·  道心 +5', time: '15 秒 · 修炼任务' },
        { name: '日报周报', reward: '奖励  💰工资 +20  ·  💎灵石 +5', time: '20 秒 · 工作任务' },
        { name: '部门会议', reward: '奖励  💰工资 +35  ·  绩效 +10', time: '15 秒 · 工作任务' },
      ];
      taskCards.forEach((task, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const cardIdx = addPageCard(
          tasksContainerIdx,
          `AvailableTask_${index}`,
          520,
          112,
          b.vec3((column - 0.5) * 570, 65 - row * 138, 0),
          { fillColor: index % 2 === 0 ? paper : paperSoft },
        );
        addPageText(cardIdx, 'NameLabel', task.name, 320, 30, {
          lpos: b.vec3(-72, 27, 0), fontSize: 22, color: ink,
        });
        addPageText(cardIdx, 'DescLabel', `${task.time}\n${task.reward}`, 350, 48, {
          lpos: b.vec3(-58, -18, 0), fontSize: 16, color: mutedInk,
        });
        addPageButton(cardIdx, 'StartButton', '开始', 126, 48, b.vec3(184, 0, 0), {
          fillColor: accent, strokeColor: accentStroke, fontSize: 19,
        });
      });
      pageChildren.push(tasksContainerIdx);
    }

    if (pageName === 'PromotionPageContent') {
      const statusCardIdx = addPageCard(
        -1,
        'PromotionStatusCard',
        1000,
        150,
        b.vec3(0, 50, 0),
        { fillColor: paper, strokeColor: b.color(194, 172, 137, 255) },
      );
      addPageText(statusCardIdx, 'CurrentRankLabel', '当前职级\nLv.1 · 练气职员', 270, 54, {
        lpos: b.vec3(-315, 44, 0), fontSize: 21, color: ink,
      });
      addPageText(statusCardIdx, 'RankArrowLabel', '→', 80, 48, {
        lpos: b.vec3(0, 44, 0), fontSize: 32, color: accent,
      });
      addPageText(statusCardIdx, 'NextRankLabel', '下一职级\nLv.2 · 筑基职员', 270, 54, {
        lpos: b.vec3(315, 44, 0), fontSize: 21, color: ink,
      });

      const progressTrackIdx = b.addNode('PromotionProgressTrack', -1, [], [], { lpos: b.vec3(0, 3, 0) });
      b.addPanel(progressTrackIdx, 760, 18, { fillColor: paperSoft, strokeColor: progressStroke, lineWidth: 1 });
      const progressFillIdx = b.addNode('PromotionProgressFill', -1, [], [], { lpos: b.vec3(-140, 0, 0) });
      b.addPanel(progressFillIdx, 460, 12, { fillColor: progress, strokeColor: progress, lineWidth: 1 });
      attachChild(progressTrackIdx, progressFillIdx);
      attachChild(statusCardIdx, progressTrackIdx);
      addPageText(statusCardIdx, 'PromotionProgressLabel', '晋升进度 35/100  ·  35%', 700, 28, {
        lpos: b.vec3(0, -24, 0), fontSize: 17, color: progressStroke,
      });
      addPageText(statusCardIdx, 'PromotionConditionLabel', '条件：修为达到 100  ·  完成本阶 KPI  ·  道心 ≥ 60', 900, 26, {
        lpos: b.vec3(0, -52, 0), fontSize: 16, color: mutedInk,
      });
      pageChildren.push(statusCardIdx);

      const optionIdx = addPageCard(
        -1,
        'PromotionOption_0',
        1000,
        110,
        b.vec3(0, -125, 0),
        { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255) },
      );
      addPageText(optionIdx, 'NameLabel', '稳健渡劫', 350, 30, {
        lpos: b.vec3(-215, 27, 0), fontSize: 22, color: ink,
      });
      addPageText(optionIdx, 'DescLabel', '成功率 45%  ·  消耗道心 10  ·  达成条件后开放', 520, 30, {
        lpos: b.vec3(-150, -17, 0), fontSize: 16, color: mutedInk,
      });
      addPageButton(optionIdx, 'PromoteButton', '开始晋升', 156, 48, b.vec3(372, 0, 0), {
        fillColor: success, strokeColor: successStroke, fontSize: 18,
      });
      pageChildren.push(optionIdx);
    }

    if (pageName === 'MorePageContent') {
      // More is a real PC V1 workspace. The six sections stay in one page
      // container so the scene can be wired by MorePageComponent without
      // reintroducing the old "coming soon" entry cards.
      const sectionNavIdx = b.addNode('MoreSectionTabs', -1, [], [], { lpos: b.vec3(0, 137, 0) });
      b.addPanel(sectionNavIdx, 1120, 52, { fillColor: chrome, strokeColor: chromeSoft });
      const sectionTabs = [
        { name: 'MoreTabSect', label: '宗门' },
        { name: 'MoreTabLeaderboard', label: '排行榜' },
        { name: 'MoreTabFriends', label: '好友' },
        { name: 'MoreTabAchievements', label: '成就' },
        { name: 'MoreTabDaily', label: '每日任务' },
        { name: 'MoreTabSettings', label: '设置' },
      ];
      sectionTabs.forEach((tab, index) => {
        const tabIdx = addPageButton(
          sectionNavIdx,
          tab.name,
          tab.label,
          164,
          40,
          b.vec3((index - 2.5) * 180, 0, 0),
          { fillColor: index === 3 ? accent : chromeSoft, strokeColor: index === 3 ? accentStroke : chrome, fontSize: 16 },
        );
        b.objects[tabIdx]._active = true;
      });
      pageChildren.push(sectionNavIdx);

      const addSection = (name, title, lpos, opts = {}) => {
        const sectionIdx = b.addNode(name, -1, [], [], {
          lpos,
          active: opts.active !== undefined ? opts.active : false,
        });
        b.addPanel(sectionIdx, 1120, 252, {
          fillColor: opts.fillColor || paper,
          strokeColor: opts.strokeColor || b.color(194, 172, 137, 255),
        });
        addPageText(sectionIdx, 'SectionTitleLabel', title, 980, 32, {
          lpos: b.vec3(0, 101, 0), fontSize: 22, color: ink,
        });
        pageChildren.push(sectionIdx);
        return sectionIdx;
      };

      // Sect / company section. Cards are Buttons so a future scene binding
      // can select a company without changing this generated node contract.
      const sectIdx = addSection('SectContainer', '宗门 · 公司选择', b.vec3(0, -25, 0), { active: false });
      addPageText(sectIdx, 'CurrentSectLabel', '当前宗门：散修 · 未加入公司', 460, 28, {
        lpos: b.vec3(-300, 68, 0), fontSize: 18, color: ink,
      });
      addPageText(sectIdx, 'CooldownLabel', '切换冷却：可用', 320, 28, {
        lpos: b.vec3(320, 68, 0), fontSize: 17, color: mutedInk,
      });
      const sectDefs = [
        { name: '民企', bonus: '工资 +20%' },
        { name: '外企', bonus: '修为 +15%' },
        { name: '国企', bonus: '道心 +10%' },
        { name: '大厂', bonus: '绩效 +25%' },
      ];
      sectDefs.forEach((sect, index) => {
        const cardIdx = addPageCard(sectIdx, `SectCard_${index}`, 220, 86,
          b.vec3((index - 1.5) * 250, -4, 0), {
            fillColor: index % 2 === 0 ? paperSoft : paper,
          });
        b.addButton(cardIdx, { target: cardIdx });
        addPageText(cardIdx, 'NameLabel', sect.name, 190, 26, {
          lpos: b.vec3(0, 20, 0), fontSize: 20, color: ink,
        });
        addPageText(cardIdx, 'BonusLabel', sect.bonus, 190, 24, {
          lpos: b.vec3(0, -20, 0), fontSize: 17, color: accentStroke,
        });
      });
      addPageButton(sectIdx, 'JoinButton', '选择公司', 150, 42, b.vec3(0, -93, 0), {
        fillColor: success, strokeColor: successStroke, fontSize: 17,
      });

      // Leaderboard section: local/NPC data is readable even before a
      // remote ranking service is introduced.
      const leaderboardIdx = addSection('LeaderboardContainer', '排行榜 · 修为榜', b.vec3(0, -25, 0), { active: false, fillColor: paperSoft });
      addPageText(leaderboardIdx, 'PlayerRankLabel', '我的排名：第 12 名 · 修为 3,280', 700, 28, {
        lpos: b.vec3(-150, 68, 0), fontSize: 18, color: ink,
      });
      addPageButton(leaderboardIdx, 'RefreshButton', '刷新榜单', 126, 38, b.vec3(450, 68, 0), {
        fillColor: chromeSoft, strokeColor: chrome, fontSize: 15,
      });
      const leaderboardRows = [
        ['#1', '加班渡劫者', '修为 12,480'],
        ['#2', '摸鱼大师', '修为 10,360'],
        ['#3', '稳健修行人', '修为 8,920'],
        ['#12', '我 · 练气职员', '修为 3,280'],
      ];
      leaderboardRows.forEach((row, index) => {
        const rowIdx = addPageCard(leaderboardIdx, `EntryRow_${index}`, 1000, 34,
          b.vec3(0, 34 - index * 38, 0), { fillColor: index === 3 ? b.color(218, 232, 226, 255) : paper });
        addPageText(rowIdx, 'RankLabel', row[0], 110, 26, { lpos: b.vec3(-410, 0, 0), fontSize: 16, color: accentStroke });
        addPageText(rowIdx, 'NameLabel', row[1], 520, 26, { lpos: b.vec3(-80, 0, 0), fontSize: 16, color: ink });
        addPageText(rowIdx, 'ScoreLabel', row[2], 260, 26, { lpos: b.vec3(350, 0, 0), fontSize: 16, color: mutedInk });
      });

      // Friends section.
      const friendsIdx = addSection('FriendsContainer', '好友 · 道友互助', b.vec3(0, -25, 0), { active: false });
      addPageText(friendsIdx, 'PendingGiftsLabel', '3 位好友 · 1 个待领取礼物', 620, 28, {
        lpos: b.vec3(-220, 68, 0), fontSize: 18, color: ink,
      });
      addPageButton(friendsIdx, 'ClaimAllButton', '领取全部', 126, 38, b.vec3(450, 68, 0), {
        fillColor: accent, strokeColor: accentStroke, fontSize: 15,
      });
      const friendRows = [
        ['道友·小周', 'Lv.3', '🎁 待领取'],
        ['道友·阿琳', 'Lv.2', '可送礼'],
        ['道友·老王', 'Lv.4', '已送礼'],
      ];
      friendRows.forEach((friend, index) => {
        const rowIdx = addPageCard(friendsIdx, `FriendRow_${index}`, 1000, 42,
          b.vec3(0, 35 - index * 48, 0), { fillColor: index % 2 === 0 ? paper : paperSoft });
        addPageText(rowIdx, 'NameLabel', friend[0], 330, 28, { lpos: b.vec3(-290, 0, 0), fontSize: 17, color: ink });
        addPageText(rowIdx, 'LevelLabel', friend[1], 130, 28, { lpos: b.vec3(-30, 0, 0), fontSize: 16, color: mutedInk });
        addPageText(rowIdx, 'GiftStatusLabel', friend[2], 220, 28, { lpos: b.vec3(170, 0, 0), fontSize: 16, color: accentStroke });
        addPageButton(rowIdx, 'SendGiftButton', '送礼', 88, 32, b.vec3(395, 0, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 14 });
        addPageButton(rowIdx, 'ClaimGiftButton', '领取', 88, 32, b.vec3(490, 0, 0), { fillColor: success, strokeColor: successStroke, fontSize: 14 });
      });

      // Achievements section. This is the default MorePageComponent tab and
      // follows its Achievement_i/NameLabel/DescLabel/ClaimButton lookup.
      const achievementsIdx = addSection('AchievementsContainer', '成就 · 修行里程碑', b.vec3(0, -25, 0), { active: true, fillColor: paperSoft });
      addPageText(achievementsIdx, 'ProgressLabel', '已解锁：0/12 · 还有传说等你发现', 760, 28, {
        lpos: b.vec3(-150, 68, 0), fontSize: 18, color: ink,
      });
      const achievements = [
        ['初入职场', '完成第一次修炼', '进度 0/1'],
        ['稳定输出', '累计获得 1,000 工资', '进度 0/1,000'],
        ['道心如铁', '道心保持在 80 以上', '进度 0/80'],
        ['隐藏传说', '??? · 还有传说没被发现', '🔒 未解锁'],
      ];
      achievements.forEach((achievement, index) => {
        const cardIdx = addPageCard(achievementsIdx, `Achievement_${index}`, 500, 58,
          b.vec3((index % 2 === 0 ? -0.5 : 0.5) * 540, 27 - Math.floor(index / 2) * 70, 0), {
            fillColor: index === 3 ? b.color(226, 219, 204, 255) : paper,
          });
        addPageText(cardIdx, 'NameLabel', achievement[0], 240, 22, { lpos: b.vec3(-100, 18, 0), fontSize: 17, color: ink });
        addPageText(cardIdx, 'DescLabel', achievement[1], 260, 20, { lpos: b.vec3(-88, -7, 0), fontSize: 14, color: mutedInk });
        addPageText(cardIdx, 'ProgressLabel', achievement[2], 140, 20, { lpos: b.vec3(160, 18, 0), fontSize: 14, color: accentStroke });
        addPageButton(cardIdx, 'ClaimButton', '领取', 76, 30, b.vec3(190, -14, 0), { fillColor: success, strokeColor: successStroke, fontSize: 13 });
      });

      // Daily tasks section.
      const dailyIdx = addSection('DailyContainer', '每日任务 · 今日清单', b.vec3(0, -25, 0), { active: false });
      addPageText(dailyIdx, 'DailyCountLabel', '今日任务：0/4 · 刷新倒计时 08:32:10', 760, 28, {
        lpos: b.vec3(-150, 68, 0), fontSize: 18, color: ink,
      });
      const dailyTasks = [
        ['每日签到', '登录并领取今日签到奖励', '0/1'],
        ['修炼日常', '点击修炼一次', '0/1'],
        ['上班打卡', '累计工作 30 秒', '0/30 秒'],
        ['稳住道心', '保持道心高于 60', '0/60'],
      ];
      dailyTasks.forEach((task, index) => {
        const taskIdx = addPageCard(dailyIdx, `DailyTask_${index}`, 500, 58,
          b.vec3((index % 2 === 0 ? -0.5 : 0.5) * 540, 27 - Math.floor(index / 2) * 70, 0), {
            fillColor: index % 2 === 0 ? paper : paperSoft,
          });
        addPageText(taskIdx, 'NameLabel', task[0], 250, 22, { lpos: b.vec3(-110, 16, 0), fontSize: 17, color: ink });
        addPageText(taskIdx, 'DescLabel', task[1], 290, 20, { lpos: b.vec3(-88, -10, 0), fontSize: 14, color: mutedInk });
        addPageText(taskIdx, 'ProgressLabel', task[2], 120, 20, { lpos: b.vec3(155, 16, 0), fontSize: 14, color: progressStroke });
        addPageButton(taskIdx, 'ClaimButton', '领取', 76, 30, b.vec3(190, -14, 0), { fillColor: success, strokeColor: successStroke, fontSize: 13 });
      });

      // Settings section. Buttons and data labels use the names exposed by
      // SettingsPageComponent; dangerous clear-save UI remains absent.
      const settingsIdx = addSection('SettingsContainer', '设置 · 游戏偏好', b.vec3(0, -25, 0), { active: false, fillColor: paperSoft });
      addPageText(settingsIdx, 'BgmStatusLabel', 'BGM：开', 250, 28, { lpos: b.vec3(-410, 56, 0), fontSize: 17, color: ink });
      addPageButton(settingsIdx, 'BgmToggle', '切换', 88, 34, b.vec3(-260, 56, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 14 });
      addPageText(settingsIdx, 'SfxStatusLabel', '音效：开', 250, 28, { lpos: b.vec3(20, 56, 0), fontSize: 17, color: ink });
      addPageButton(settingsIdx, 'SfxToggle', '切换', 88, 34, b.vec3(170, 56, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 14 });
      addPageText(settingsIdx, 'BgmVolumeSlider', 'BGM 音量　━━━━━━●━　80%', 430, 28, { lpos: b.vec3(-305, 12, 0), fontSize: 16, color: mutedInk });
      addPageText(settingsIdx, 'SfxVolumeSlider', '音效音量　━━━━●━━　60%', 430, 28, { lpos: b.vec3(305, 12, 0), fontSize: 16, color: mutedInk });
      addPageText(settingsIdx, 'VersionLabel', '版本：PC V1 · 存档状态：本地可用', 540, 26, { lpos: b.vec3(-250, -34, 0), fontSize: 16, color: ink });
      addPageButton(settingsIdx, 'FullscreenToggle', '全屏', 96, 36, b.vec3(360, -34, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 14 });
      addPageButton(settingsIdx, 'SaveButton', '保存设置', 126, 38, b.vec3(-100, -88, 0), { fillColor: success, strokeColor: successStroke, fontSize: 15 });
      addPageButton(settingsIdx, 'QuitButton', '退出游戏', 126, 38, b.vec3(100, -88, 0), { fillColor: b.color(145, 81, 70, 255), strokeColor: b.color(105, 55, 47, 255), fontSize: 15 });

    }

    const pageIdx = b.addNode(pageName, -1, pageChildren, [], {
      active: pageName === 'HomePageContent',
    });
    b.addUITransform(pageIdx, 1180, 500);
    if (pageName === 'MorePageContent') b.addCustomComponent(pageIdx, COMP.MorePage);
    pageNodeIds.push(pageIdx);
    if (pageName === 'CraftPageContent') craftNodeIds.push(pageIdx);
  }

  const pageContIdx = b.addNode('PageContainer', -1, pageNodeIds, []);
  const pageContUtIdx = b.addUITransform(pageContIdx, DESIGN_WIDTH, PAGE_CONTAINER_HEIGHT);
  const pageContWidgetIdx = b.addWidget(pageContIdx, {
    alignFlags: 21,
    bottom: PAGE_BOTTOM_INSET,
    top: PAGE_TOP_INSET,
    horizontalCenter: 0,
  });

  // --- ModalLayer node ---
  // These panels are intentionally present but hidden. SceneBindingComponent
  // owns modal state; keeping readable content in the scene prevents a black
  // or empty overlay while leaving all transaction logic in the existing
  // modal manager.
  const addModalPanel = (name, title, body, primary, secondary, status) => {
    const modalRootIdx = b.addNode(name, -1, [], [], { active: false });
    const maskIdx = b.addNode('Mask', -1, [], [], { active: true });
    b.addPanel(maskIdx, DESIGN_WIDTH, DESIGN_HEIGHT, {
      fillColor: b.color(20, 27, 40, 178), strokeColor: b.color(20, 27, 40, 178), lineWidth: 0,
    });
    const panelIdx = b.addNode('Panel', -1, [], [], { lpos: b.vec3(0, 0, 0) });
    b.addPanel(panelIdx, 700, 390, { fillColor: paper, strokeColor: b.color(194, 172, 137, 255), lineWidth: 3 });

    const headerIdx = b.addNode('Header', -1, [], [], { lpos: b.vec3(0, 145, 0) });
    b.addUITransform(headerIdx, 640, 54);
    addPageText(headerIdx, 'Title', title, 500, 42, { lpos: b.vec3(-50, 0, 0), fontSize: 26, color: ink });
    addPageButton(headerIdx, 'Close', '×', 44, 44, b.vec3(286, 0, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 25 });

    const bodyScrollIdx = b.addNode('BodyScroll', -1, [], [], { lpos: b.vec3(0, 18, 0) });
    b.addPanel(bodyScrollIdx, 620, 180, { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255), lineWidth: 1 });
    addPageText(bodyScrollIdx, 'Content', body, 570, 150, { fontSize: 20, color: ink });
    const statusIdx = addPageText(panelIdx, 'StatusLabel', status, 580, 26, {
      lpos: b.vec3(0, -93, 0), fontSize: 16, color: mutedInk,
    });

    const actionsIdx = b.addNode('Actions', -1, [], [], { lpos: b.vec3(0, -145, 0) });
    b.addUITransform(actionsIdx, 620, 56);
    addPageButton(actionsIdx, 'Secondary', secondary, 170, 48, b.vec3(-120, 0, 0), { fillColor: chromeSoft, strokeColor: chrome, fontSize: 17 });
    addPageButton(actionsIdx, 'Primary', primary, 190, 48, b.vec3(120, 0, 0), { fillColor: accent, strokeColor: accentStroke, fontSize: 17 });

    b.objects[headerIdx]._parent = b.ref(panelIdx);
    b.objects[bodyScrollIdx]._parent = b.ref(panelIdx);
    b.objects[actionsIdx]._parent = b.ref(panelIdx);
    b.objects[panelIdx]._children = [b.ref(headerIdx), b.ref(bodyScrollIdx), b.ref(statusIdx), b.ref(actionsIdx)];
    b.objects[maskIdx]._parent = b.ref(modalRootIdx);
    b.objects[panelIdx]._parent = b.ref(modalRootIdx);
    b.objects[modalRootIdx]._children = [b.ref(maskIdx), b.ref(panelIdx)];
    return modalRootIdx;
  };
  const eventModalIdx = addModalPanel(
    'OfficeEventModal', '职场事件', '事件：临时会议\n选择一项处理方式，收益与代价会立即结算。',
    '选择处理', '稍后处理', '状态：待选择 · 事件不会丢失',
  );
  const adModalIdx = addModalPanel(
    'RewardAdModal', '奖励广告', '观看广告可获得明确的额外奖励。\n当前奖励：招募资源 ×2。',
    '观看广告', '不用了', '状态：READY · 取消始终可用',
  );
  const offlineModalIdx = addModalPanel(
    'OfflineRewardModal', '离线收益', '离线 2小时18分钟\n工资 +240　·　修为 +120\n看广告 ×2：工资 +480　·　修为 +240',
    '收下', '看广告 ×2', '状态：未结算 · 1倍与2倍互斥',
  );
  const modalIdx = b.addNode('ModalLayer', -1, [eventModalIdx, adModalIdx, offlineModalIdx], []);
  const modalUtIdx = b.addUITransform(modalIdx, DESIGN_WIDTH, DESIGN_HEIGHT);
  const modalWidgetIdx = b.addWidgetStretch(modalIdx);

  // --- ToastLayer node ---
  const toastIdx = b.addNode('ToastLayer', -1, [], []);
  const toastUtIdx = b.addUITransform(toastIdx, 720, 200);
  const toastWidgetIdx = b.addWidget(toastIdx, { alignFlags: 20, bottom: 100, horizontalCenter: 0 }); // bottom + h-center

  // --- TutorialLayer node ---
  const tutorIdx = b.addNode('TutorialLayer', -1, [], []);
  const tutorUtIdx = b.addUITransform(tutorIdx, DESIGN_WIDTH, DESIGN_HEIGHT);
  const tutorWidgetIdx = b.addWidgetStretch(tutorIdx);

  // ── SafeAreaRoot node ─────────────────────────────────────────────────
  const safeAreaIdx = b.addNode('SafeAreaRoot', -1,
    [bgIdx, topHeaderIdx, resBarIdx, charAreaIdx, idleIdx, actionsIdx, bottomNavIdx, pageContIdx, modalIdx, toastIdx, tutorIdx],
    []);
  const safeAreaBootIdx = b.addCustomComponent(safeAreaIdx, COMP.CocosBootstrap);
  const safeAreaUtIdx = b.addUITransform(safeAreaIdx, DESIGN_WIDTH, DESIGN_HEIGHT);
  const safeAreaWidgetIdx = b.addWidgetStretch(safeAreaIdx);
  const safeAreaHomeIdx = b.addCustomComponent(safeAreaIdx, COMP.GameUIController);

  // ── UICamera_Canvas node ──────────────────────────────────────────────
  const uiCamIdx = b.addNode('UICamera_Canvas', -1, [], [], { layer: 524288, id: '2dPXj+bLtNnLNQh3db5lcx' });
  const uiCamCompIdx = b.addCamera(uiCamIdx);

  // ── Canvas node ───────────────────────────────────────────────────────
  const canvasIdx = b.addNode('Canvas', -1,
    [safeAreaIdx, uiCamIdx],
    [], { layer: 524288 });
  const canvasCompIdx = b.addCanvas(canvasIdx, uiCamCompIdx);
  const canvasUtIdx = b.addUITransform(canvasIdx, DESIGN_WIDTH, DESIGN_HEIGHT);
  const canvasWidgetIdx = b.addWidgetStretch(canvasIdx);

  // ── Portrait PC home composition ───────────────────────────────────────
  // The product reference is a 9:16 single-page card. Keep the existing
  // business bindings and node names, but explicitly place the home bands in
  // portrait coordinates so desktop renders the same composition as mobile.
  const portraitNode = (name) => b.objects.findIndex((o) => o.__type__ === 'cc.Node' && o._name === name);
  const portraitLayout = (name, x, y, width, height) => {
    const nodeIdx = portraitNode(name);
    if (nodeIdx < 0) return;
    const node = b.objects[nodeIdx];
    node._lpos = b.vec3(x, y, 0);
    const transformIdx = node._components?.map((r) => r.__id__).find((id) => b.objects[id]?.__type__ === 'cc.UITransform');
    if (transformIdx !== undefined) b.objects[transformIdx]._contentSize = b.size(width, height);
    const widgetIdx = node._components?.map((r) => r.__id__).find((id) => b.objects[id]?.__type__ === 'cc.Widget');
    if (widgetIdx !== undefined) b.objects[widgetIdx]._enabled = false;
  };
  portraitLayout('Background', 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  portraitLayout('PaperContent', 0, 0, 680, 1160);
  portraitLayout('TopHeader', 0, 548, 680, 94);
  portraitLayout('ResourceBar', 0, 430, 660, 112);
  portraitLayout('CharacterArea', 0, 150, 660, 400);
  portraitLayout('IdleIncomePanel', 0, -130, 630, 128);
  portraitLayout('PrimaryActions', 0, -315, 660, 176);
  portraitLayout('BottomNavigation', 0, -566, 680, 108);
  portraitLayout('PageContainer', 0, 0, 700, 1050);
  portraitLayout('BrandLabel', -150, 20, 380, 54);
  portraitLayout('BrandTaglineLabel', -150, -28, 300, 28);
  portraitLayout('CareerSummaryLabel', 170, 0, 300, 44);
  portraitLayout('ResourceCultivationChip', -240, 0, 145, 76);
  portraitLayout('ResourceSalaryChip', -80, 0, 145, 76);
  portraitLayout('ResourcePerformanceChip', 80, 0, 145, 76);
  portraitLayout('ResourceMindChip', 240, 0, 145, 76);
  portraitLayout('CharacterIconLabel', -220, 72, 210, 220);
  portraitLayout('CharacterNameLabel', 95, 100, 390, 44);
  portraitLayout('CharacterStatusLabel', 95, 48, 420, 42);
  portraitLayout('CharacterHintLabel', 95, 0, 360, 36);
  portraitLayout('CultivateButton', -220, 0, 190, 78);
  portraitLayout('WorkButton', 0, 0, 190, 78);
  portraitLayout('FishButton', 220, 0, 190, 78);
  ['TabHome', 'TabTasks', 'TabCraft', 'TabPromotion', 'TabMore'].forEach((name, index) =>
    portraitLayout(name, (index - 2) * 135, 0, 116, 76));

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

  // Fix Craft page subtree parents
  const craftPageIdx = pageNodeIds[pageDefs.indexOf('CraftPageContent')];
  const craftHeaderIdx = craftNodeIds.find(id => b.objects[id]._name === 'CraftHeader');
  const recruitButtonIdx = craftNodeIds.find(id => b.objects[id]._name === 'RecruitButton');
  const boardIdx = craftNodeIds.find(id => b.objects[id]._name === 'MergeBoardRoot');
  if (craftHeaderIdx !== undefined) b.objects[craftHeaderIdx]._parent = b.ref(craftPageIdx);
  if (recruitButtonIdx !== undefined) b.objects[recruitButtonIdx]._parent = b.ref(craftPageIdx);
  if (boardIdx !== undefined) {
    b.objects[boardIdx]._parent = b.ref(craftPageIdx);
    for (const cellIdx of craftBoardCellIds) {
      b.objects[cellIdx]._parent = b.ref(boardIdx);
      const labelIdx = b.objects[cellIdx]._children[0].__id__;
      b.objects[labelIdx]._parent = b.ref(cellIdx);
    }
  }

  // Keep every generated child/back-reference pair consistent, including the
  // asset-free visible labels and panels added above.
  for (let parentIdx = 0; parentIdx < b.objects.length; parentIdx += 1) {
    const parent = b.objects[parentIdx];
    if (parent.__type__ !== 'cc.Node') continue;
    for (const childRef of parent._children || []) {
      if (b.objects[childRef.__id__]?.__type__ === 'cc.Node') {
        b.objects[childRef.__id__]._parent = b.ref(parentIdx);
      }
    }
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
  const required = ['SafeAreaRoot', 'TopHeader', 'ResourceBar', 'CharacterArea', 'IdleIncomePanel',
    'PrimaryActions', 'BottomNavigation', 'PageContainer', 'ModalLayer', 'ToastLayer', 'TutorialLayer',
    'CraftHeader', 'RecruitButton', 'MergeBoardRoot', ...Array.from({ length: 16 }, (_, i) => `BoardCell${i.toString().padStart(2, '0')}`)];
  const missing = required.filter(n => !nodeNames.includes(n));
  if (missing.length > 0) {
    console.error(`❌ Missing required nodes: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ All ${required.length} required nodes present`);

  // Verify no forbidden nodes
  const forbidden = ['MergeBoard'];
  const found = forbidden.filter(n => nodeNames.includes(n));
  if (found.length > 0) {
    console.error(`❌ Forbidden nodes found: ${found.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ No forbidden legacy nodes');
}

main();
