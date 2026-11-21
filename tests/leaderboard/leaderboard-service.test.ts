import assert from 'node:assert/strict';

import { GameContext } from '../../assets/scripts/core/game-context';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { SaveService } from '../../assets/scripts/services/save-service';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { FakeClock } from '../../assets/scripts/core/clock';
import { SequenceRandomProvider } from '../../assets/scripts/core/random-provider';
import {
  LeaderboardService,
  LocalMockProvider,
  LEADERBOARD_METRICS,
  type LeaderboardMetric,
} from '../../assets/scripts/services/leaderboard-service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function createContext(playerOverrides: Record<string, unknown> = {}): GameContext {
  return new GameContext({
    player: new PlayerData(playerOverrides),
    saveService: new SaveService(new MemoryStorageAdapter()),
  });
}

/** 确定性构造：固定随机序列 + 固定时钟（项目确定性测试约定）。 */
function createService(ctx: GameContext, clock: FakeClock, random: SequenceRandomProvider): LeaderboardService {
  return new LeaderboardService(ctx, {
    clock,
    random,
    provider: new LocalMockProvider({ npcCount: 20 }, random),
  });
}

const PLAYER_FIXTURE = {
  careerLevel: 5,
  cultivationExp: 3000,
  spiritStones: 800,
  unlockedAchievementIds: ['a1', 'a2', 'a3'],
};

// ── Tests ───────────────────────────────────────────────────────────────────

function testDeterministicBoardWithSameSeed(): void {
  const clock = new FakeClock(1_000_000);
  const a = createService(createContext(PLAYER_FIXTURE), clock, new SequenceRandomProvider([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05]));
  const b = createService(createContext(PLAYER_FIXTURE), clock, new SequenceRandomProvider([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05]));
  const viewA = a.getLeaderboard('career');
  const viewB = b.getLeaderboard('career');
  assert.deepEqual(viewA.entries.map((e) => [e.name, e.score, e.careerLevel]), viewB.entries.map((e) => [e.name, e.score, e.careerLevel]));
  assert.equal(viewA.playerRank, viewB.playerRank);
  console.log('✔ Leaderboard: same seed → identical board (deterministic)');
}

function testBoardSortedByScoreDescAndRanksAssigned(): void {
  const service = createService(createContext(PLAYER_FIXTURE), new FakeClock(0), new SequenceRandomProvider([0.3, 0.6, 0.9]));
  const view = service.getLeaderboard('career');
  for (let i = 1; i < view.entries.length; i++) {
    const prev = view.entries[i - 1];
    const cur = view.entries[i];
    assert.ok(prev.score >= cur.score, `rank order violated at ${i}: ${prev.score} < ${cur.score}`);
    assert.equal(prev.rank, i, `rank sequence broken at ${i}`);
  }
  assert.equal(view.entries[view.entries.length - 1].rank, view.entries.length);
  console.log('✔ Leaderboard: entries sorted by score desc with sequential ranks');
}

function testPlayerEntryPresentOnceWithCorrectMetrics(): void {
  const service = createService(createContext(PLAYER_FIXTURE), new FakeClock(0), new SequenceRandomProvider([0.2, 0.5, 0.8]));
  const players = service.getLeaderboard('career').entries.filter((e) => e.isPlayer);
  assert.equal(players.length, 1);
  const p = players[0];
  assert.equal(p.score, 5); // career = careerLevel
  assert.equal(p.careerLevel, 5);
  assert.equal(p.cultivationExp, 3000);
  console.log('✔ Leaderboard: exactly one player entry carrying correct metrics');
}

function testFourMetricsReturnDifferentPlayerScores(): void {
  const service = createService(createContext(PLAYER_FIXTURE), new FakeClock(0), new SequenceRandomProvider([0.2, 0.5, 0.8]));
  assert.equal(service.getPlayerScore('career'), 5);
  assert.equal(service.getPlayerScore('cultivation'), 3000);
  assert.equal(service.getPlayerScore('wealth'), 800);
  assert.equal(service.getPlayerScore('achievement'), 3);
  const metas = service.getMetrics();
  assert.equal(metas.length, 4);
  assert.deepEqual(metas.map((m) => m.metric), LEADERBOARD_METRICS.map((m) => m.metric));
  console.log('✔ Leaderboard: four metrics with per-metric player scores');
}

function testNegativePlayerValuesClampedToZero(): void {
  const ctx = createContext({ spiritStones: -50, unlockedAchievementIds: undefined });
  const service = createService(ctx, new FakeClock(0), new SequenceRandomProvider([0.4]));
  assert.equal(service.getPlayerScore('wealth'), 0);
  assert.equal(service.getPlayerScore('achievement'), 0);
  console.log('✔ Leaderboard: negative/undefined player values clamped to 0');
}

function testUnknownMetricThrows(): void {
  const service = createService(createContext(), new FakeClock(0), new SequenceRandomProvider([0.4]));
  assert.throws(() => service.getLeaderboard('bogus' as LeaderboardMetric), /Unknown leaderboard metric/);
  console.log('✔ Leaderboard: unknown metric throws');
}

function testCacheWithinIntervalAndRefreshAfterClockAdvance(): void {
  const clock = new FakeClock(0);
  const service = createService(createContext(PLAYER_FIXTURE), clock, new SequenceRandomProvider([0.3, 0.7]));
  const first = service.getLeaderboard('career');
  clock.advance(30_000); // < 60s → cached
  const second = service.getLeaderboard('career');
  assert.equal(second.lastUpdated, first.lastUpdated);
  clock.advance(61_000); // 累计 91s，越过 60s → 重新生成
  const third = service.getLeaderboard('career');
  assert.equal(third.lastUpdated, 91_000);
  console.log('✔ Leaderboard: 60s cache via injected clock, refresh after advance');
}

function testTopNAroundPlayerAndValidation(): void {
  const service = createService(createContext(PLAYER_FIXTURE), new FakeClock(0), new SequenceRandomProvider([0.3, 0.7]));
  const top3 = service.getTopN(3, 'cultivation');
  assert.equal(top3.length, 3);
  assert.ok(top3.every((e) => e.rank <= 3));
  assert.equal(service.getTopN(-1).length, 0);
  assert.equal(service.getAroundPlayer(-2).length, 0);
  const around = service.getAroundPlayer(2, 'career');
  assert.ok(around.length >= 1 && around.length <= 5);
  assert.ok(around.some((e) => e.isPlayer), 'player window must contain player');
  console.log('✔ Leaderboard: topN/aroundPlayer windows + argument validation');
}

function testNpcCountValidation(): void {
  assert.throws(() => new LocalMockProvider({ npcCount: -1 }), /npcCount/);
  assert.throws(() => new LocalMockProvider({ npcCount: 999 }), /npcCount/);
  const provider = new LocalMockProvider({ npcCount: 5 }, new SequenceRandomProvider([0.5]));
  assert.equal(provider.getNpcEntries('career', 5).length, 5);
  console.log('✔ Leaderboard: npcCount bounds validated');
}

function testNpcCareerBandScalesWithPlayer(): void {
  // 玩家 15 级时 NPC 职级应落在 ±4 带内（clamp 1..20），不出现 Lv1-6 恒被碾压
  const service = createService(createContext({ ...PLAYER_FIXTURE, careerLevel: 15, cultivationExp: 90_000, spiritStones: 60_000, unlockedAchievementIds: [] }), new FakeClock(0), new SequenceRandomProvider([0.0, 0.25, 0.5, 0.75, 1 - 1e-9]));
  const board = service.getLeaderboard('career').entries.filter((e) => !e.isPlayer);
  assert.ok(board.length > 0);
  assert.ok(board.every((e) => e.careerLevel >= 11 && e.careerLevel <= 20), `band violated: ${board.map((e) => e.careerLevel).join(',')}`);
  console.log('✔ Leaderboard: NPC career band scales with player level (no constant crush)');
}

function testWealthAndAchievementBoardsScaleWithPlayer(): void {
  const service = createService(createContext({ ...PLAYER_FIXTURE, spiritStones: 50_000, unlockedAchievementIds: new Array(10).fill('x') }), new FakeClock(0), new SequenceRandomProvider([0.0, 0.5, 0.99]));
  const wealth = service.getLeaderboard('wealth').entries.filter((e) => !e.isPlayer);
  assert.ok(wealth.every((e) => e.score <= 75_000), 'wealth NPC must scale with player wealth band (max 1.5x)');
  const ach = service.getLeaderboard('achievement').entries.filter((e) => !e.isPlayer);
  assert.ok(ach.every((e) => e.score >= 0), 'achievement scores non-negative');
  console.log('✔ Leaderboard: wealth/achievement NPC bands scale with player');
}

function testMetricLabelInViewModel(): void {
  const service = createService(createContext(PLAYER_FIXTURE), new FakeClock(0), new SequenceRandomProvider([0.5]));
  assert.equal(service.getLeaderboard('wealth').metricLabel, '财富榜');
  assert.equal(service.getLeaderboard('achievement').metricLabel, '成就榜');
  console.log('✔ Leaderboard: view carries metric label (UI 本地模拟标记依赖)');
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testDeterministicBoardWithSameSeed,
  testBoardSortedByScoreDescAndRanksAssigned,
  testPlayerEntryPresentOnceWithCorrectMetrics,
  testFourMetricsReturnDifferentPlayerScores,
  testNegativePlayerValuesClampedToZero,
  testUnknownMetricThrows,
  testCacheWithinIntervalAndRefreshAfterClockAdvance,
  testTopNAroundPlayerAndValidation,
  testNpcCountValidation,
  testNpcCareerBandScalesWithPlayer,
  testWealthAndAchievementBoardsScaleWithPlayer,
  testMetricLabelInViewModel,
];

for (const test of tests) test();
console.log(`\nLeaderboardService: ${tests.length}/${tests.length} tests passed`);
