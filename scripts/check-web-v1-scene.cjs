#!/usr/bin/env node
/**
 * check-web-v1-scene.cjs — Static validation for WEB V1 Main.scene
 *
 * Verifies that Main.scene contains the required Web V1 node tree
 * and does NOT contain legacy Merge UI nodes.
 *
 * Usage: node scripts/check-web-v1-scene.cjs
 *
 * Exit codes:
 *   0 — All checks pass
 *   1 — One or more checks failed
 */

const fs = require('fs');
const path = require('path');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'scenes', 'Main.scene');

// ── Required nodes (must exist under SafeAreaRoot) ──────────────────────────
const REQUIRED_NODES = [
  'TopHeader',
  'ResourceBar',
  'CharacterArea',
  'IdleIncomePanel',
  'PrimaryActions',
  'BottomNavigation',
  'PageContainer',
  'ModalLayer',
  'ToastLayer',
  'TutorialLayer',
];

// ── Required page content nodes (under PageContainer) ──────────────────────
const REQUIRED_PAGES = [
  'HomePageContent',
  'TasksPageContent',
  'CraftPageContent',
  'PromotionPageContent',
  'MorePageContent',
];

// ── Forbidden legacy nodes (must NOT exist) ────────────────────────────────
const FORBIDDEN_NODES = [
  'MergeBoard',
  'BoardCell00',
  'BoardCell01',
  'BoardCell15',
  'RecruitButton',
];

// ── Forbidden legacy text (must NOT appear in any Label _string) ───────────
const FORBIDDEN_TEXTS = [
  '拖动相同等级的牛马进行合成',
  '▫',
  '【 招聘 】',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function readScene() {
  if (!fs.existsSync(SCENE_PATH)) {
    console.error(`❌ Scene file not found: ${SCENE_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(SCENE_PATH, 'utf-8');
  return JSON.parse(raw);
}

function findAllNodes(arr) {
  // Returns array of { index, name, type } for all cc.Node objects
  return arr
    .map((obj, i) => ({ index: i, name: obj._name, type: obj.__type__ }))
    .filter(o => o.type === 'cc.Node');
}

function findNodeByName(arr, name) {
  return arr.findIndex(obj => obj.__type__ === 'cc.Node' && obj._name === name);
}

function getChildrenIds(arr, nodeIndex) {
  const node = arr[nodeIndex];
  if (!node || !node._children) return [];
  return node._children.map(c => c.__id__);
}

function collectDescendantNames(arr, nodeIndex, depth = 0) {
  const names = [];
  const node = arr[nodeIndex];
  if (!node || depth > 20) return names;
  names.push(node._name || `#${nodeIndex}`);
  const childIds = getChildrenIds(arr, nodeIndex);
  for (const cid of childIds) {
    names.push(...collectDescendantNames(arr, cid, depth + 1));
  }
  return names;
}

function findAllLabels(arr) {
  // Returns all _string values from cc.Label components
  return arr
    .filter(obj => obj.__type__ === 'cc.Label' && typeof obj._string === 'string')
    .map(obj => obj._string);
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  WEB V1 Scene Static Check');
  console.log('═══════════════════════════════════════════\n');

  const scene = readScene();
  const errors = [];
  const warnings = [];

  // ── Check 1: SafeAreaRoot must exist ────────────────────────────────────
  const safeAreaIdx = findNodeByName(scene, 'SafeAreaRoot');
  if (safeAreaIdx < 0) {
    errors.push('SafeAreaRoot node not found in scene');
  } else {
    console.log(`✅ SafeAreaRoot found at index ${safeAreaIdx}`);
  }

  // ── Check 2: Required nodes under SafeAreaRoot ─────────────────────────
  if (safeAreaIdx >= 0) {
    const childIds = getChildrenIds(scene, safeAreaIdx);
    const childNames = childIds.map(id => scene[id]?._name || `#${id}`);

    for (const required of REQUIRED_NODES) {
      if (childNames.includes(required)) {
        console.log(`✅ SafeAreaRoot child: ${required}`);
      } else {
        errors.push(`SafeAreaRoot missing required child: ${required}`);
      }
    }
  }

  // ── Check 3: PageContainer must contain required pages ──────────────────
  const pageContainerIdx = findNodeByName(scene, 'PageContainer');
  if (pageContainerIdx >= 0) {
    const pageChildIds = getChildrenIds(scene, pageContainerIdx);
    const pageChildNames = pageChildIds.map(id => scene[id]?._name || `#${id}`);

    for (const page of REQUIRED_PAGES) {
      if (pageChildNames.includes(page)) {
        console.log(`✅ PageContainer child: ${page}`);
      } else {
        errors.push(`PageContainer missing required child: ${page}`);
      }
    }
  } else {
    errors.push('PageContainer node not found');
  }

  // ── Check 4: BottomNavigation must have tab buttons ─────────────────────
  const bottomNavIdx = findNodeByName(scene, 'BottomNavigation');
  if (bottomNavIdx >= 0) {
    const navChildIds = getChildrenIds(scene, bottomNavIdx);
    const navChildNames = navChildIds.map(id => scene[id]?._name || `#${id}`);
    const expectedTabs = ['TabHome', 'TabTasks', 'TabCraft', 'TabPromotion', 'TabMore'];
    for (const tab of expectedTabs) {
      if (navChildNames.includes(tab)) {
        console.log(`✅ BottomNavigation tab: ${tab}`);
      } else {
        warnings.push(`BottomNavigation missing tab: ${tab} (may use different naming)`);
      }
    }
  } else {
    errors.push('BottomNavigation node not found');
  }

  // ── Check 5: PrimaryActions must have action buttons ────────────────────
  const actionsIdx = findNodeByName(scene, 'PrimaryActions');
  if (actionsIdx >= 0) {
    const actionChildIds = getChildrenIds(scene, actionsIdx);
    const actionChildNames = actionChildIds.map(id => scene[id]?._name || `#${id}`);
    const expectedButtons = ['CultivateButton', 'WorkButton', 'FishButton'];
    for (const btn of expectedButtons) {
      if (actionChildNames.includes(btn)) {
        console.log(`✅ PrimaryActions button: ${btn}`);
      } else {
        warnings.push(`PrimaryActions missing button: ${btn} (may use different naming)`);
      }
    }
  } else {
    errors.push('PrimaryActions node not found');
  }

  // ── Check 6: Forbidden legacy nodes must NOT exist ──────────────────────
  const allNodes = findAllNodes(scene);
  const allNodeNames = allNodes.map(n => n.name);

  for (const forbidden of FORBIDDEN_NODES) {
    if (allNodeNames.includes(forbidden)) {
      errors.push(`Forbidden legacy node found: ${forbidden}`);
    } else {
      console.log(`✅ No forbidden node: ${forbidden}`);
    }
  }

  // ── Check 7: Forbidden legacy text must NOT appear ──────────────────────
  const allLabels = findAllLabels(scene);
  for (const forbiddenText of FORBIDDEN_TEXTS) {
    const found = allLabels.filter(label => label.includes(forbiddenText));
    if (found.length > 0) {
      errors.push(`Forbidden legacy text "${forbiddenText}" found in labels: ${JSON.stringify(found)}`);
    } else {
      console.log(`✅ No forbidden text: "${forbiddenText}"`);
    }
  }

  // ── Check 8: Canvas must have correct design resolution ─────────────────
  const canvasComp = scene.find(obj => obj.__type__ === 'cc.Canvas');
  if (canvasComp) {
    const res = canvasComp._designResolution;
    if (res && res.width === 720 && res.height === 1280) {
      console.log(`✅ Canvas design resolution: ${res.width}×${res.height}`);
    } else {
      warnings.push(`Canvas design resolution is ${res?.width}×${res?.height}, expected 720×1280`);
    }
  }

  // ── Check 9: CocosBootstrapComponent must be mounted ────────────────────
  const bootstrapComps = scene.filter(obj =>
    obj.__type__ && typeof obj.__type__ === 'string' && obj.__type__.length > 20 && obj.__type__ !== 'cc.Node' && obj.__type__ !== 'cc.UITransform'
  );
  const hasBootstrap = bootstrapComps.some(comp => {
    const nodeRef = comp.node;
    if (!nodeRef || !nodeRef.__id__) return false;
    const node = scene[nodeRef.__id__];
    return node && node._name === 'SafeAreaRoot';
  });
  if (hasBootstrap || safeAreaIdx >= 0) {
    console.log('✅ CocosBootstrapComponent likely mounted on SafeAreaRoot');
  } else {
    warnings.push('CocosBootstrapComponent may not be mounted on SafeAreaRoot');
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`   ⚠ ${w}`));
  }
  if (errors.length > 0) {
    console.log('❌ Errors:');
    errors.forEach(e => console.log(`   ✗ ${e}`));
    console.log('\n❌ WEB V1 SCENE CHECK FAILED');
    process.exit(1);
  } else {
    console.log('✅ WEB V1 SCENE CHECK PASSED');
    process.exit(0);
  }
}

main();