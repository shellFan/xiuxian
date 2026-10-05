import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');

function makeFacade(seed = 9201, storage?: MemoryStorageAdapter): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: storage ?? new MemoryStorageAdapter(), board: null,
    randomV2: new RandomService(mulberry32(seed)),
    randomProvider: { next: mulberry32(seed) },
    battleRng: mulberry32(seed), autoSaveIntervalSeconds: 0,
  });
  facade.context.messenger.ensureInitialized();
  facade.chooseProfession('JAVA_BACKEND');
  facade.context.gameDay.ensureStarted();
  facade.context.dailyPlanner.beginWorkday();
  return { facade, clock };
}

/** Hardening: mentor per-member flags must be pruned — only today's survive. */
function testMentorFlagPruning(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.careerLevel = 7;
    p.fatigue = 0;
    const team = facade.context.team.ensureTeam();
    // stale flags from "day 1" plus an unrelated persistent flag
    p.managerFlags = {
      mentor_实习生小陈_1: true,
      mentor_测试仙子_1: true,
      mentor_新人小王_1: true,
      dragonSlayer: false,
    };
    (p.gameDay as { dayIndex: number }).dayIndex = 3;
    const r = facade.mentorMember(team.members[0].name);
    assert.ok(r.ok, 'mentor succeeds on fresh day');
    const flags = p.managerFlags as Record<string, boolean>;
    assert.equal(flags['mentor_实习生小陈_1'], undefined, 'stale day-1 flag pruned');
    assert.equal(flags['mentor_测试仙子_1'], undefined, 'stale day-1 flag pruned (2)');
    assert.equal(flags['mentor_新人小王_1'], undefined, 'stale day-1 flag pruned (3)');
    assert.equal('dragonSlayer' in flags, true, 'non-mentor flags preserved');
    const todayKey = 'mentor_' + team.members[0].name + '_3';
    assert.equal(flags[todayKey], true, 'today mentor flag set');
    console.log('mentor flag pruning passed');
  } finally {
    facade.destroy();
  }
}

/** Hardening: team daily caps reset on day rollover (numeric day comparison). */
function testTeamDayRollover(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.careerLevel = 7;
    const team = facade.context.team.ensureTeam();
    for (let i = 0; i < 3; i++) {
      const r = facade.assignTeamTask(team.members[0].name);
      assert.ok(r.ok, `assign ${i + 1}/3 ok`);
    }
    const capped = facade.assignTeamTask(team.members[0].name);
    assert.equal(capped.ok, false, 'cap 3/day enforced');
    // new day → cap resets
    (p.gameDay as { dayIndex: number }).dayIndex = 2;
    const nextDay = facade.assignTeamTask(team.members[0].name);
    assert.ok(nextDay.ok, 'day rollover resets assignment cap');
    const st = p.teamState!;
    assert.deepEqual(st.dailyAssignment, { day: 2, count: 1 }, 'counter re-seeded for new day');
    console.log('team day rollover passed');
  } finally {
    facade.destroy();
  }
}

/** Hardening: storage failure during hide must not propagate out of emitHide. */
function testHideSaveFailureContained(): void {
  class DiskFullAdapter extends MemoryStorageAdapter {
    public armed = false;
    public setItem(key: string, value: string): void {
      if (this.armed) throw new Error('DISK_FULL');
      super.setItem(key, value);
    }
  }
  const failing = new DiskFullAdapter();
  const { facade } = makeFacade(9203, failing);
  try {
    failing.armed = true; // fail only lifecycle-time saves, not setup
    const platform = facade.platform as unknown as { emitHide(): void; emitShow(): void };
    assert.doesNotThrow(() => platform.emitHide(), 'hide-time save failure is contained');
    assert.doesNotThrow(() => platform.emitShow(), 'show after failed hide is contained');
  } finally {
    facade.destroy();
  }
  console.log('hide save failure containment passed');
}

/** Hardening: battle DEFEAT reaches player state with terminal status + claimed rewards. */
function testBattleDefeatTerminalState(): void {
  const { facade, clock } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_jvm');
    const run = facade.context.player.activeBattleRun as { playerHp: number; status: string; rewardsClaimed?: boolean } | null;
    assert.ok(run, 'battle started');
    run!.playerHp = 1;
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      facade.context.battle.tick(1);
      const live = facade.context.player.activeBattleRun as { status: string } | null;
      if (live && live.status === 'DEFEAT') break;
    }
    const finished = facade.context.player.activeBattleRun as { status: string; rewardsClaimed?: boolean } | null;
    assert.equal(finished!.status, 'DEFEAT', 'battle reaches DEFEAT');
    assert.equal(finished!.rewardsClaimed, true, 'defeat rewards claimed (30%)');
    const view = facade.queryFinishedBattle();
    assert.ok(view, 'queryFinishedBattle exposes terminal run for the overlay modal');
    console.log('battle defeat terminal state passed');
  } finally {
    facade.destroy();
  }
}

/** Hardening: ABORT (abandon) produces the same terminal contract. */
function testBattleAbandonTerminalState(): void {
  const { facade } = makeFacade();
  try {
    facade.startBattleRun('PROJECT', 'build_jvm');
    facade.abandonBattleRun();
    const finished = facade.context.player.activeBattleRun as { status: string; rewardsClaimed?: boolean } | null;
    assert.equal(finished!.status, 'DEFEAT', 'abandon maps to DEFEAT');
    assert.equal(finished!.rewardsClaimed, true, 'abandon claims partial rewards');
    assert.ok(facade.queryFinishedBattle(), 'abandoned run surfaced to overlay');
    console.log('battle abandon terminal state passed');
  } finally {
    facade.destroy();
  }
}

testMentorFlagPruning();
testTeamDayRollover();
testHideSaveFailureContained();
testBattleDefeatTerminalState();
testBattleAbandonTerminalState();
console.log('final hardening: all tests passed');
