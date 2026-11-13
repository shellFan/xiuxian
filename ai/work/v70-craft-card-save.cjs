/**
 * V7.0 card-battle E2E: craft an isolated save sitting right before the
 * stage-12 cardBoss handoff (BOSS_PENDING), using the game's own compiled
 * service layer — same classes the real game runs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PlayerData } = require('../../tests/.compiled/assets/scripts/model/player-data');
const { FakeClock } = require('../../tests/.compiled/assets/scripts/core/clock');
const { GameContext } = require('../../tests/.compiled/assets/scripts/core/game-context');
const { MemoryStorageAdapter } = require('../../tests/.compiled/assets/scripts/services/storage-adapter');

const outDir = process.argv[2] || path.join(__dirname, '..', '..', 'tmp', 'v70-card-save');
const saveDir = path.join(outDir, 'xiuxian-save');
fs.mkdirSync(saveDir, { recursive: true });

const clock = new FakeClock(Date.parse('2026-11-13T09:00:00+08:00'));
const p = new PlayerData({ lastSaveTime: clock.now() });
const ctx = new GameContext({ clock, player: p, storage: new MemoryStorageAdapter(), board: null, battleRng: () => 0.5 });
p.spiritStones = 800;
p.characterSetupStatus = 'COMPLETE';
p.characterName = '卡牌测试';
p.characterAvatarId = 'avatar_default';
p.characterIndustry = 'INTERNET';
p.characterDirection = 'TECH_RND';
p.characterBackground = 'ORDINARY_WORKER';
p.characterOnboardingStep = 'COMPLETE';
p.destinyId = 'CODE_SPIRIT';
p.characterCreationReceipt = 'V59A_CREATE_V1:1234:cand_A';
p.innateAttributes = { insight: 10, constitution: 10, perception: 10, fortune: 10, willpower: 10 };
p.profession = 'JAVA_BACKEND';

// battle state: stage-12 cardBoss with 1 hp → dies on first tick → BOSS_PENDING
ctx.autoBattle.ensureStarted();
const b = p.v63AutoBattle;
b.stage = 12;
b.maxStage = 11;
b.status = 'IDLE';
ctx.autoBattle.ensureStarted(); // spawns the stage-12 cardBoss enemy
if (!b.enemy || !b.enemy.isCardBoss) throw new Error('stage-12 enemy did not spawn as cardBoss: ' + JSON.stringify(b.enemy || {}));
b.enemy.hp = 1;
// V8.0：强化测试小队使第 12 关 Boss 战可胜（推荐 1056）
try {
  ctx.autoBattle.hireMember('FRONTEND');
  ctx.autoBattle.hireMember('QA');
  ctx.autoBattle.hireMember('DEVOPS');
} catch (e) { console.log('[craft] hire warn: ' + e.message); }
try { ctx.autoBattle.upgradeClick(); ctx.autoBattle.upgradeClick(); ctx.autoBattle.upgradeClick(); } catch (e) {}

b.squad = b.squad || [];
(b.squad.members || []).forEach(function (m) { m.level = 8; m.exp = 0; });
const squadState = p.v63Squad;
if (squadState && squadState.members) {
  squadState.members.forEach(function (m) { m.level = 8; m.exp = 0; });
}
console.log('[craft] enemy=' + b.enemy.name + ' isCardBoss=' + b.enemy.isCardBoss + ' hp=' + b.enemy.hp);

const data = p.toSaveData();
// 真实存档格式：ElectronStorageAdapter 以顶层 'game-save' 键缓存 JSON 字符串
fs.writeFileSync(path.join(saveDir, 'save.json'), JSON.stringify({ 'game-save': JSON.stringify(data) }), 'utf-8');
console.log('[craft] save written: ' + path.join(saveDir, 'save.json'));
console.log('[craft] stage=' + b.stage + ' status=' + b.status + ' enemyHp=' + (b.enemy && b.enemy.hp));
