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
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
// The shared resource strip ends at roughly 122px and the bottom chrome
// begins at 652px. Pages occupy that full middle band; home-only panels are
// toggled by GameUIController so craft/tasks never compete for the same space.
const PAGE_TOP_INSET = 140;
const PAGE_BOTTOM_INSET = 90;
const PAGE_CONTAINER_HEIGHT = DESIGN_HEIGHT - PAGE_TOP_INSET - PAGE_BOTTOM_INSET;

// ── Compressed UUIDs for custom components ─────────────────────────────────
const COMP = {
  CocosBootstrap: 'b3150HobX9BGZZPA8DLrkXL',
  HomePage:       'cda510tj3VJQoqIp4uBa8/8',
  MainHud:        '9fe67zMvipJ3bsk71s/JnC8',
  BottomNav:      'da3fcfyx6JLHYeswXCeDyes',
  CultivationPanel: '8ae9eRPyPVFhr092cMGFsVN',
  IdleStatusPanel:  '613d7WuT+pBKIO67VQl4S9O',
  GameUIController: '516528SB9RKXrAoWRItq8An',
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
  // Cocos Creator 3.x AlignFlags: LEFT=1, RIGHT=2, H_CENTER=4,
  // TOP=8, BOTTOM=16, V_CENTER=32.
  addWidgetStretch(nodeIdx, alignFlags = 27) {
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

  const chrome = b.color(38, 57, 65, 255);
  const chromeSoft = b.color(58, 78, 82, 255);
  const paper = b.color(244, 237, 220, 255);
  const paperSoft = b.color(233, 224, 204, 255);
  const ink = b.color(40, 40, 40, 255);
  const white = b.color(255, 255, 255, 255);

  // --- Background node ---
  const paperIdx = b.addNode('PaperContent', -1, [], [], { lpos: b.vec3(0, -8, 0) });
  b.addPanel(paperIdx, 1220, 650, { fillColor: paper, strokeColor: b.color(205, 190, 161, 255) });
  const bgIdx = b.addNode('Background', -1, [paperIdx], []);
  b.addPanel(bgIdx, 1280, 720, { fillColor: chrome, strokeColor: chrome });
  const bgWidgetIdx = b.addWidgetStretch(bgIdx);

  // --- TopHeader node (with MainHudComponent) ---
  const brandLabelIdx = b.addTextNode('BrandLabel', '牛马修仙传', 300, 50, {
    lpos: b.vec3(-430, 0, 0), fontSize: 28, color: white,
  });
  const careerSummaryIdx = b.addTextNode('CareerSummaryLabel', '练气境 · 练气职员', 360, 42, {
    lpos: b.vec3(330, 0, 0), fontSize: 20, color: white,
  });
  const topHeaderIdx = b.addNode('TopHeader', -1, [brandLabelIdx, careerSummaryIdx], []);
  const topHeaderHudIdx = b.addCustomComponent(topHeaderIdx, COMP.MainHud);
  b.addGraphicsBackground(topHeaderIdx, { fillColor: chrome, strokeColor: chromeSoft });
  b.addUITransform(topHeaderIdx, 1220, 58);
  const topHeaderWidgetIdx = b.addWidget(topHeaderIdx, { alignFlags: 12, top: 0, horizontalCenter: 0 }); // top + h-center

  // --- ResourceBar node ---
  const resourceSummaryIdx = b.addTextNode('ResourceSummaryLabel', '工资 0  ·  灵石 0  ·  修为 0/100  ·  道心 100/100', 1080, 42, {
    fontSize: 20, color: ink,
  });
  const resBarIdx = b.addNode('ResourceBar', -1, [resourceSummaryIdx], []);
  b.addPanel(resBarIdx, 1140, 58, { fillColor: paperSoft, strokeColor: b.color(194, 172, 137, 255) });
  const resBarWidgetIdx = b.addWidget(resBarIdx, { alignFlags: 12, top: 64, horizontalCenter: 0 });

  // --- CharacterArea node ---
  const characterIconIdx = b.addTextNode('CharacterIconLabel', '🐮', 100, 110, {
    lpos: b.vec3(-480, 0, 0), fontSize: 56, color: ink,
  });
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
  const charAreaWidgetIdx = b.addWidget(charAreaIdx, { alignFlags: 12, top: 130, horizontalCenter: 0 });

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
  const idleWidgetIdx = b.addWidget(idleIdx, { alignFlags: 12, top: 298, horizontalCenter: 0 });

  // --- PrimaryActions node with 3 buttons ---
  // CultivateButton
  const cultBtnIdx = b.addNode('CultivateButton', -1, [], [], { lpos: b.vec3(-300, 0, 0) });
  b.addPanel(cultBtnIdx, 220, 64, { fillColor: b.color(176, 130, 77, 255), strokeColor: b.color(124, 88, 49, 255) });
  const cultBtnBtnIdx = b.addButton(cultBtnIdx);
  const cultBtnLabelIdx = b.addTextNode('CultivateButtonLabel', '修炼', 220, 64, { fontSize: 28, color: white });
  b.objects[cultBtnIdx]._children = [b.ref(cultBtnLabelIdx)];

  // WorkButton
  const workBtnIdx = b.addNode('WorkButton', -1, [], [], { lpos: b.vec3(0, 0, 0) });
  b.addPanel(workBtnIdx, 220, 64, { fillColor: chromeSoft, strokeColor: chrome });
  const workBtnBtnIdx = b.addButton(workBtnIdx);
  const workBtnLabelIdx = b.addTextNode('WorkButtonLabel', '打工', 220, 64, { fontSize: 28, color: white });
  b.objects[workBtnIdx]._children = [b.ref(workBtnLabelIdx)];

  // FishButton
  const fishBtnIdx = b.addNode('FishButton', -1, [], [], { lpos: b.vec3(300, 0, 0) });
  b.addPanel(fishBtnIdx, 220, 64, { fillColor: chromeSoft, strokeColor: chrome });
  const fishBtnBtnIdx = b.addButton(fishBtnIdx);
  const fishBtnLabelIdx = b.addTextNode('FishButtonLabel', '摸鱼', 220, 64, { fontSize: 28, color: white });
  b.objects[fishBtnIdx]._children = [b.ref(fishBtnLabelIdx)];

  // PrimaryActions parent
  const actionsIdx = b.addNode('PrimaryActions', -1,
    [cultBtnIdx, workBtnIdx, fishBtnIdx],
    []);
  b.addPanel(actionsIdx, 1140, 82, { fillColor: chrome, strokeColor: chromeSoft });
  const actionsWidgetIdx = b.addWidget(actionsIdx, { alignFlags: 20, bottom: 112, horizontalCenter: 0 }); // bottom + h-center

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
      const pageTitle = pageName.replace('PageContent', '');
      const pageTitleIdx = b.addTextNode(`${pageName}TitleLabel`, pageTitle, 600, 48, {
        lpos: b.vec3(0, 120, 0), fontSize: 28, color: ink,
      });
      pageChildren.push(pageTitleIdx);
    }

    const pageIdx = b.addNode(pageName, -1, pageChildren, [], {
      active: pageName === 'HomePageContent',
    });
    b.addUITransform(pageIdx, 1180, 500);
    pageNodeIds.push(pageIdx);
    if (pageName === 'CraftPageContent') craftNodeIds.push(pageIdx);
  }

  const pageContIdx = b.addNode('PageContainer', -1, pageNodeIds, []);
  const pageContUtIdx = b.addUITransform(pageContIdx, DESIGN_WIDTH, PAGE_CONTAINER_HEIGHT);
  const pageContWidgetIdx = b.addWidget(pageContIdx, {
    alignFlags: 28,
    bottom: PAGE_BOTTOM_INSET,
    top: PAGE_TOP_INSET,
    horizontalCenter: 0,
  });

  // --- ModalLayer node ---
  const modalIdx = b.addNode('ModalLayer', -1, [], []);
  const modalUtIdx = b.addUITransform(modalIdx, 1280, 720);
  const modalWidgetIdx = b.addWidgetStretch(modalIdx);

  // --- ToastLayer node ---
  const toastIdx = b.addNode('ToastLayer', -1, [], []);
  const toastUtIdx = b.addUITransform(toastIdx, 720, 200);
  const toastWidgetIdx = b.addWidget(toastIdx, { alignFlags: 20, bottom: 100, horizontalCenter: 0 }); // bottom + h-center

  // --- TutorialLayer node ---
  const tutorIdx = b.addNode('TutorialLayer', -1, [], []);
  const tutorUtIdx = b.addUITransform(tutorIdx, 1280, 720);
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
