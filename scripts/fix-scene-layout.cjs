/**
 * Fix Main.scene layout for PC Desktop 1280×720 horizontal layout
 * Adjusts Widget alignment flags and offsets
 */
const fs = require('fs');
const path = require('path');

const scenePath = path.join(__dirname, '..', 'assets', 'scenes', 'Main.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

// Widget AlignFlags in Cocos Creator 3.x:
// TOP = 1, VCENTER = 2, BOT = 4, LEFT = 8, HCENTER = 16, RIGHT = 32
const TOP = 1, BOT = 4, LEFT = 8, RIGHT = 32;

// Widget updates for 1280×720 horizontal layout
const widgetUpdates = {
  'Background': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
  'TopHeader': { flags: TOP + LEFT + RIGHT, top: 0, left: 0, right: 0 },
  'ResourceBar': { flags: TOP + LEFT + RIGHT, top: 50, left: 0, right: 0 },
  'PrimaryActions': { flags: BOT + LEFT + RIGHT, bottom: 60, left: 0, right: 0 },
  'BottomNavigation': { flags: BOT + LEFT + RIGHT, bottom: 0, left: 0, right: 0 },
  'PageContainer': { flags: TOP + BOT + LEFT + RIGHT, top: 90, bottom: 60, left: 0, right: 0 },
  'ModalLayer': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
  'ToastLayer': { flags: RIGHT, right: 0 },
  'TutorialLayer': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
  'SafeAreaRoot': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
  'Bootstrap': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
  'Canvas': { flags: TOP + BOT + LEFT + RIGHT, top: 0, bottom: 0, left: 0, right: 0 },
};

let updated = 0;
scene.forEach((entry, idx) => {
  if (entry.__type__ === 'cc.Widget') {
    const nodeRef = entry.node;
    const node = scene[nodeRef.__id__];
    const name = node._name;
    if (widgetUpdates[name]) {
      const update = widgetUpdates[name];
      entry._alignFlags = update.flags;
      if (update.top !== undefined) entry._top = update.top;
      if (update.bottom !== undefined) entry._bottom = update.bottom;
      if (update.left !== undefined) entry._left = update.left;
      if (update.right !== undefined) entry._right = update.right;
      updated++;
      console.log(`Updated Widget for ${name}: flags=${update.flags}, top=${update.top ?? entry._top}, bottom=${update.bottom ?? entry._bottom}, left=${update.left ?? entry._left}, right=${update.right ?? entry._right}`);
    }
  }
});

// Also update UITransform sizes for key nodes
const sizeUpdates = {
  'TopHeader': { width: 1280, height: 50 },
  'ResourceBar': { width: 1280, height: 40 },
  'BottomNavigation': { width: 1280, height: 60 },
  'PrimaryActions': { width: 1280, height: 60 },
};

scene.forEach((entry, idx) => {
  if (entry.__type__ === 'cc.UITransform') {
    const nodeRef = entry.node;
    const node = scene[nodeRef.__id__];
    const name = node._name;
    if (sizeUpdates[name]) {
      const update = sizeUpdates[name];
      entry._contentSize.width = update.width;
      entry._contentSize.height = update.height;
      console.log(`Updated UITransform for ${name}: ${update.width}×${update.height}`);
    }
  }
});

fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), 'utf8');
console.log(`\nDone! Updated ${updated} Widget components and size updates.`);