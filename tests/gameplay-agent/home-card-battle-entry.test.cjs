'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const homeArena = readFileSync(path.join(root, 'desktop/ui-home-arena.js'), 'utf8');
const overlay = readFileSync(path.join(root, 'desktop/ui-overlay.js'), 'utf8');
const scenario = JSON.parse(readFileSync(path.join(root, 'ai/gameplay-agent/scenarios/home-card-battle-entry.json'), 'utf8'));

assert.match(homeArena, /data-action="homeCardBattle"/, 'the home battle button must route through the main UI action handler');
assert.doesNotMatch(homeArena, /attackHomeArena\s*\(/, 'the normal home battlefield must not bind enemy clicks to legacy direct damage');
assert.match(overlay, /case 'homeCardBattle':[\s\S]{0,800}startCardBattle\(/, 'the home action handler must start the card engine before navigating to the card battle UI');
assert.equal(scenario.id, 'home-card-battle-entry');
assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '#ArenaAttack'), 'the regression scenario must use the visible home battle entrance');
assert.ok(scenario.steps.some((step) => step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="PLAYER_ACTION"]'), 'the visible entrance must lead to the playable card UI');
assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.opening.piles.hand.length' && step.expected === 5), 'the normal battle must show the five-card opening hand');
assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterEnemyClick.enemies[0].hp' && step.check === 'equals'), 'enemy clicks must not change authoritative enemy health');

console.log('home card battle entry regression contract passed');
