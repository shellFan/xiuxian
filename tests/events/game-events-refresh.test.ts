import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PHASE2_REFRESH_EVENTS } from '../../assets/scripts/core/game-events';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function testPhase2RefreshEventListIsExplicit(): void {
  const expected = [
    'mergeCompleted',
    'salaryChanged',
    'idleSettled',
    'phase2Refresh',
    'playerChanged',
    'careerChanged',
    'kpiChanged',
    'mindChanged',
    'workModeChanged',
    'eventChanged',
    'promotionChanged',
    'offlineRewardChanged',
    'achievementUnlocked',
    'buffAdded',
    'buffExpired',
    'dailyTaskProgress',
    'dailyTaskCompleted',
    'dailyTaskClaimed',
    'tutorialStepChanged',
  ];
  assert.deepEqual([...PHASE2_REFRESH_EVENTS].sort(), [...expected].sort());
}

function testWorkModeChangeEmitsDomainEvent(): void {
  const context = new GameContext({ player: new PlayerData(), storage: new MemoryStorageAdapter() });
  const modes: string[] = [];
  context.events.on('workModeChanged', (event) => { modes.push(event.mode); });
  context.work.setMode('WORK');
  assert.deepEqual(modes, ['WORK']);
}

function testMindChangeEmitsDomainEvent(): void {
  const context = new GameContext({ player: new PlayerData({ mind: 40 }), storage: new MemoryStorageAdapter() });
  const totals: number[] = [];
  context.events.on('mindChanged', (event) => { totals.push(event.total); });
  context.mind.change(10);
  assert.equal(totals[0], 50);
}

testPhase2RefreshEventListIsExplicit();
testWorkModeChangeEmitsDomainEvent();
testMindChangeEmitsDomainEvent();
console.log('game events refresh tests passed');
