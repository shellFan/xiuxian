import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controllerSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/game-ui-controller.ts'), 'utf8');
const sceneSource = fs.readFileSync(path.join(root, 'assets/scenes/Main.scene'), 'utf8');

function testControllerExposesCraftBindingAndBoardRefresh(): void {
  assert.match(controllerSource, /bindCraftPage\s*\(/);
  assert.match(controllerSource, /refreshBoard\s*\(/);
  assert.match(controllerSource, /onRecruitClick\s*=/);
}

function testControllerResolvesTheRealCraftSceneNodes(): void {
  for (const nodeName of ['CraftPageContent', 'RecruitButton', 'MergeBoardRoot']) {
    assert.match(controllerSource, new RegExp(nodeName));
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
  for (let index = 0; index < 16; index += 1) {
    const nodeName = `BoardCell${index.toString().padStart(2, '0')}`;
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
}

testControllerExposesCraftBindingAndBoardRefresh();
testControllerResolvesTheRealCraftSceneNodes();
console.log('game UI controller tests passed');
