import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { buildCraftViewModel } from '../../assets/scripts/ui/view-models';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

const root = process.cwd();
const controllerSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/game-ui-controller.ts'), 'utf8');
const sceneSource = fs.readFileSync(path.join(root, 'assets/scenes/Main.scene'), 'utf8');

function testControllerBindsTheCraftPresentationToTheRealFacade(): void {
  assert.match(controllerSource, /bindCraftPage\s*\(/);
  assert.match(controllerSource, /refreshCraftPage\s*\(/);
  assert.match(controllerSource, /onCraftClick\s*=/);
  assert.match(controllerSource, /facade\.craft\(/);
  assert.match(controllerSource, /材料/);
  assert.match(controllerSource, /产物/);
  assert.match(controllerSource, /bindCraftButton\s*\(/);
  assert.match(controllerSource, /button\.on\?\.\('click'/);
  assert.doesNotMatch(controllerSource, /DragController|MergeBoardView|refreshBoard|onRecruitClick|animateMerge|touch-start|touch-end/);
}

function testControllerResolvesVisualCraftLayoutNodes(): void {
  for (const nodeName of ['CraftPageContent', 'RecruitButton', 'MergeBoardRoot']) {
    assert.match(controllerSource, new RegExp(nodeName));
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
  for (let index = 0; index < 16; index += 1) {
    const nodeName = `BoardCell${index.toString().padStart(2, '0')}`;
    assert.match(sceneSource, new RegExp(`"_name": "${nodeName}"`));
  }
}

function testRealFacadeCraftsAndPersistsTheDisplayedRecipe(): void {
  const storage = new MemoryStorageAdapter();
  const facade = new GameFacade({ storage, board: null });
  const viewModel = buildCraftViewModel(facade);
  const recipe = viewModel.recipes.find((candidate) => candidate.canCraft) ?? viewModel.recipes[0];

  assert.ok(recipe, 'the real craft config should expose a recipe');
  facade.context.player.cultivationExp = recipe.costCultivation;
  facade.context.player.spiritStones = recipe.costSpiritStones;

  const result = facade.craft(recipe.id);

  assert.equal(result.success, true);
  assert.equal(facade.queryCraftedCount(recipe.id), 1);
  const saved = JSON.parse(storage.getItem('game-save') ?? '{}') as { craftedItemIds?: string[] };
  assert.deepEqual(saved.craftedItemIds, [recipe.id]);
}

testControllerBindsTheCraftPresentationToTheRealFacade();
testControllerResolvesVisualCraftLayoutNodes();
testRealFacadeCraftsAndPersistsTheDisplayedRecipe();
console.log('game UI controller tests passed');
