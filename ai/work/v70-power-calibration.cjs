/**
 * V7.0 power-curve calibration — sample actual powerScore when reaching each
 * stage, compare with current recommendedPower formula (500×1.13^(s-1)).
 * Uses the same compiled service layer as the game (tests/.compiled).
 */
'use strict';
const { GameContext } = require('../../tests/.compiled/assets/scripts/core/game-context');
const { PlayerData } = require('../../tests/.compiled/assets/scripts/model/player-data');
const { FakeClock } = require('../../tests/.compiled/assets/scripts/core/clock');
const { MemoryStorageAdapter } = require('../../tests/.compiled/assets/scripts/services/storage-adapter');

function rec(s) { return Math.round(50 * Math.pow(1.13, s - 1) * 10); }

const clock = new FakeClock(Date.parse('2026-11-12T09:00:00+08:00'));
const player = new PlayerData({ lastSaveTime: clock.now() });
player.spiritStones = 100;
const ctx = new GameContext({ clock, player, storage: new MemoryStorageAdapter(), board: null, battleRng: () => 0.5 });
ctx.gameDay.ensureStarted();
ctx.autoBattle.ensureStarted();

// natural hiring: spend stones when affordable (simulates engaged player)
let lastStage = 1;
const samples = [];
for (let t = 0; t <= 3600 * 8; t++) {
  clock.advance(1000);
  ctx.autoBattle.tick(1);
  const v = ctx.autoBattle.view();
  // hire when affordable (leave 30 stones buffer) up to 4 members
  if (v.squad.length < 4 && player.spiritStones >= 30) {
    const profs = ['FRONTEND', 'QA', 'DEVOPS'];
    try { ctx.autoBattle.hireMember(profs[(v.squad.length - 1) % 3]); } catch (e) {}
  }
  if (v.pendingChests > 0) { try { ctx.autoBattle.openChest(); } catch (e) {} }
  if (v.stage !== lastStage) {
    samples.push({ stage: v.stage, t, power: ctx.autoBattle.computePowerScore(), rec: rec(v.stage), dps: Math.round(v.dps) });
    lastStage = v.stage;
  }
  if (samples.length >= 40) break;
}
console.log('stage | time(min) | powerScore | recommended | ratio(power/rec) | dps');
for (const s of samples) {
  console.log(String(s.stage).padStart(5), '|', (s.t / 60).toFixed(1).padStart(9), '|', String(Math.round(s.power)).padStart(10), '|', String(s.rec).padStart(11), '|', (s.power / s.rec).toFixed(2).padStart(8), '|', String(s.dps).padStart(6));
}
