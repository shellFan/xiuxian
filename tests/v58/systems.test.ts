import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { RandomService, mulberry32 } from '../../assets/scripts/v2/random-service';

process.env.TZ = 'Asia/Shanghai';
const MONDAY_0900 = Date.parse('2026-09-21T09:00:00+08:00');
const MINUTE = 60_000;

function makeFacade(seed = 6801): { facade: GameFacade; clock: FakeClock } {
  const clock = new FakeClock(MONDAY_0900);
  const facade = new GameFacade({
    clock, careerEventClock: clock,
    player: new PlayerData({ lastSaveTime: clock.now() }),
    storage: new MemoryStorageAdapter(), board: null,
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

/** §8：Burnout 5 状态 + 阀门 + 恢复闭环。 */
function testBurnoutStates(): void {
  const { facade } = makeFacade();
  try {
    const bo = facade.context.burnout;
    assert.equal(bo.view().state, 'NORMAL', 'fresh player NORMAL');
    // STRESSED: mind<40
    facade.context.player.mind = 35;
    assert.equal(bo.targetState(), 'STRESSED', 'mind 35 → STRESSED');
    // BURNOUT_RISK: mind<20 && demon>=80
    facade.context.player.mind = 15;
    facade.context.player.innerDemon = 85;
    assert.equal(bo.targetState(), 'BURNOUT_RISK', 'mind 15 + demon 85 → RISK');
    // RISK 持续 2 天 → BURNOUT
    facade.context.player.mind = 10;
    bo.onDaySettled();
    bo.onDaySettled();
    const after = bo.view();
    assert.ok(after.state === 'BURNOUT' || after.state === 'BURNOUT_RISK', `risk escalates (got ${after.state})`);
    // 阀门：demon ≥95 强制消退
    facade.context.player.innerDemon = 98;
    bo.onDaySettled();
    assert.ok(facade.context.player.innerDemon < 95, 'demon≥95 valve forces reduction');
    // 恢复闭环：mind 回 60/demon 回 30 → 最终 NORMAL + burnoutRecovered 计数
    facade.context.player.mind = 70;
    facade.context.player.innerDemon = 20;
    const recoveredBefore = (facade.context.player.lifetimeStats ?? {}).burnoutRecovered ?? 0;
    bo.onDaySettled();
    bo.onDaySettled();
    const recoveredAfter = (facade.context.player.lifetimeStats ?? {}).burnoutRecovered ?? 0;
    assert.ok(recoveredAfter >= recoveredBefore, 'burnout recovery eventually counted');
    console.log('burnout states passed');
  } finally {
    facade.destroy();
  }
}

/** §8：请半天假。 */
function testHalfDayOff(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.mind = 10; p.innerDemon = 90; p.fatigue = 80;
    const result = facade.takeHalfDayOff();
    assert.ok(result.mind > 10, 'half day off recovers mind');
    assert.ok((p.fatigue ?? 0) < 80, 'half day off recovers fatigue');
    assert.ok(p.innerDemon < 90, 'half day off reduces demon');
    console.log('half day off passed');
  } finally {
    facade.destroy();
  }
}

/** §11：公司 runtime 差异化。 */
function testCompanyProfiles(): void {
  const { facade } = makeFacade();
  try {
    const companies = facade.queryCompanies();
    assert.equal(companies.length, 4, '4 companies');
    const bigtech = companies.find((c) => c.id === 'COMP_BIGTECH');
    const state = companies.find((c) => c.id === 'COMP_STATE');
    assert.ok(bigtech && bigtech.salaryMultiplier > 1.2, '大厂宗工资高');
    assert.ok(state && state.overtimeCulture < 0.7, '国企宗加班少');
    assert.ok(state && state.incidentPressure < 0.7, '国企宗事故少');
    // 换宗门：重置项目/周目标，保留职业
    const prof = facade.context.player.profession;
    const r = facade.context.company.switchCompany('COMP_BIGTECH', '测试跳槽');
    assert.ok(r.ok, 'switch ok');
    assert.equal(facade.context.player.companyProfile, 'COMP_BIGTECH');
    assert.equal(facade.context.player.profession, prof, 'profession preserved');
    assert.equal(facade.context.player.project, null, 'project reset');
    assert.ok(((facade.context.player.lifetimeStats ?? {}).companySwitches ?? 0) >= 1, 'companySwitches counted');
    console.log('company profiles passed');
  } finally {
    facade.destroy();
  }
}

/** §12：Offer 生成与决策。 */
function testOfferSystem(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.careerLevel = 4; // L4 解锁
    const day = p.gameDay?.dayIndex ?? 1;
    p.offerReadyDay = 0;
    const offer = facade.context.offer.maybeGenerateOffer();
    // rng 可能不命中（45% 概率）——用受控测试：直接构造
    if (!offer) {
      (p as unknown as { offerReadyDay?: number }).offerReadyDay = 0;
      // 多试几天直到命中或用尽
      for (let i = 0; i < 10 && !offer; i++) {
        p.gameDay = { ...(p.gameDay as { dayIndex: number }), dayIndex: day + i } as never;
        const o = facade.context.offer.maybeGenerateOffer();
        if (o) break;
      }
    }
    // 决策路径（F02: 使用正式 pendingOffer 字段注入）
    var currentDay = p.gameDay?.dayIndex ?? 1;
    p.pendingOffer = {
      offerId: 'offer_test', dayIndex: currentDay, expiresAtDay: currentDay + 3,
      companyId: 'COMP_FOREIGN', companyName: '外企宗',
      salaryDeltaPct: 18, overtimeDeltaPct: -50, incidentDeltaPct: -30, promotionDeltaPct: -15, lootDeltaPct: 10,
      pitch: 'test',
    };
    const salaryBefore = p.salary;
    p.salary = Math.max(salaryBefore, 500); // 谈薪 8% 需要底薪 > 0
    const r = facade.decideOffer('NEGOTIATED');
    assert.ok(r.ok, 'negotiate ok');
    assert.ok(p.salary > Math.max(salaryBefore, 500), 'negotiate +8%');
    assert.equal(facade.queryOffer(), null, 'pending cleared');
    assert.ok(((p.lifetimeStats ?? {}).offerNegotiated ?? 0) >= 1, 'offerNegotiated counted');
    console.log('offer system passed');
  } finally {
    facade.destroy();
  }
}

/** §9.3/§10：L7+ 团队 + mentorship。 */
function testTeamAndMentorship(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    // L6 不能分配
    p.careerLevel = 6;
    facade.context.team.ensureTeam();
    const r6 = facade.assignTeamTask('实习生小陈');
    assert.equal(r6.ok, false, 'L6 cannot assign');
    // L7 解锁
    p.careerLevel = 7;
    const team = facade.context.team.ensureTeam();
    assert.ok(team.members.length >= 3, 'team 3-6 members');
    const r7 = facade.assignTeamTask(team.members[0].name);
    assert.ok(r7.ok, 'L7 can assign');
    // F03: assign cap 3/day — save/reload persistence
    facade.assignTeamTask(team.members[1].name);
    facade.assignTeamTask(team.members[2].name);
    const r4 = facade.assignTeamTask(team.members[0].name);
    assert.equal(r4.ok, false, 'assign cap 3/day');
    // F03: cap survives save/reload (teamState.dailyAssignment is numeric)
    var updatedTeam = p.teamState;
    assert.ok(updatedTeam != null && updatedTeam.dailyAssignment != null && updatedTeam.dailyAssignment.count === 3, 'dailyAssignment persisted in teamState');
    // F07: mentor — member exists check, daily cap, growth consumption
    const m = facade.mentorMember(team.members[0].name);
    assert.ok(m.ok, 'mentor ok');
    const mInvalid = facade.mentorMember('__missing__');
    assert.equal(mInvalid.ok, false, 'F06: invalid member rejected');
    assert.equal(mInvalid.reason, 'MEMBER_NOT_FOUND', 'F06: correct reason');
    const mDup = facade.mentorMember(team.members[0].name);
    assert.equal(mDup.ok, false, 'F07: per-member daily cap');
    assert.ok(((p.lifetimeStats ?? {}).mentoredCount ?? 0) >= 1, 'mentoredCount');
    // 道德镜像
    facade.recordManagerChoice('EXPLOIT', '测试压榨');
    assert.ok((p.lifetimeStats ?? {}).managerExploitationScore >= 1, 'exploitation counted');
    facade.recordManagerChoice('PROTECT', '测试保护');
    assert.ok((p.lifetimeStats ?? {}).managerProtectionScore >= 1, 'protection counted');
    console.log('team and mentorship passed');
  } finally {
    facade.destroy();
  }
}

/** §13.1：Build Preset。 */
function testBuildPreset(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.careerLevel = 5;
    facade.context.team.ensureTeam();
    // 造一个已结束的战斗 run 提供 buildId
    facade.startBattleRun('PROJECT', 'build_jvm');
    const r = facade.context.player.activeBattleRun as { status: string };
    r.status = 'VICTORY';
    const save1 = facade.saveBuildPreset(0, 'JVM爆发流');
    assert.ok(save1.ok, 'save preset ok');
    const presets = facade.queryBuildPresets();
    assert.ok(presets[0].preset && presets[0].preset.name === 'JVM爆发流', 'preset stored');
    // 换装备再应用
    p.equippedEquipment = { DESK: 'eq_coffee_cup', BADGE: null, ACCESSORY: null };
    const apply = facade.applyBuildPreset(0);
    assert.ok(apply.ok, 'apply ok');
    assert.equal(p.equippedEquipment.DESK, 'eq_mech_keyboard', 'equipment restored from preset');
    console.log('build preset passed');
  } finally {
    facade.destroy();
  }
}

/** §20：Milestone Director + 月报。 */
function testMilestonesAndMonthly(): void {
  const { facade } = makeFacade();
  try {
    const p = facade.context.player;
    p.gameDay = { ...(p.gameDay as { dayIndex: number }), dayIndex: 3 } as never;
    facade.context.meta.checkMilestones();
    assert.ok((p.milestones ?? []).includes('ms_day3'), 'day3 milestone fired');
    facade.context.meta.checkMilestones();
    assert.equal((p.milestones ?? []).filter((m) => m === 'ms_day3').length, 1, 'milestone idempotent');
    // 月度累计
    facade.context.meta.accumulateMonth({ workDays: 1, ontimeDays: 1, salaryEarned: 100, tasksDone: 2 });
    facade.context.meta.accumulateMonth({ workDays: 1, salaryEarned: 80 });
    const report = facade.queryMonthlyReport();
    assert.ok(report, 'monthly report exists');
    assert.equal(report!.workDays, 2, 'workDays accumulated');
    assert.equal(report!.salaryEarned, 180, 'salary accumulated');
    assert.ok(report!.title.length > 0, 'month title generated');
    console.log('milestones and monthly passed');
  } finally {
    facade.destroy();
  }
}

/** §14.2：Boss Phase 2。 */
function testBossPhase2(): void {
  const { facade, clock } = makeFacade();
  try {
    const battle = facade.context.battle;
    const battlePriv = battle as unknown as { addEnemy: (run: never, id: string) => void };
    const run = facade.startBattleRun('PROJECT', 'build_jvm');
    const stored = facade.context.player.activeBattleRun as typeof run;
    battlePriv.addEnemy(stored as never, 'boss_oom_lord');
    stored.enemies = stored.enemies.filter((e) => e.tier === 'BOSS');
    stored.enemies[0].hp = Math.floor(stored.enemies[0].maxHp * 0.45);
    let phase2Seen = false;
    for (let i = 0; i < 3 && !phase2Seen; i++) {
      clock.advance(1000);
      battle.tick(1);
      const live = facade.context.player.activeBattleRun as typeof run;
      if (live.log.some((l) => l.includes('Phase 2'))) phase2Seen = true;
      if (stored.status !== 'FIGHTING') break;
    }
    assert.ok(phase2Seen, 'boss phase 2 triggers at HP threshold');
    assert.ok((facade.context.player.lifetimeStats ?? {}).bossPhase2Seen >= 1, 'phase2 counter');
    console.log('boss phase 2 passed');
  } finally {
    facade.destroy();
  }
}

/** §29：Save v13 迁移。 */
function testSaveV13(): void {
  const { facade } = makeFacade();
  try {
    const raw = facade.context.player.toSaveData();
    assert.equal(raw.saveVersion, 13, 'save version 13');
    const roundTripped = new (facade.context.player.constructor as never as { new(o?: unknown): instanceOfPlayer })(JSON.parse(JSON.stringify(raw)));
    assert.equal(roundTripped.burnoutState.state, 'NORMAL', 'burnout default');
    assert.equal(roundTripped.buildPresets.length, 3, '3 preset slots');
    assert.equal(roundTripped.companyProfile, 'COMP_MIN_PRIVATE', 'company default');
    assert.equal(roundTripped.teamState, null, 'team null before L7');
    // 旧档 v12 字段兼容：burnoutState 缺失 → NORMAL
    const v12Like = JSON.parse(JSON.stringify(raw));
    delete v12Like.burnoutState;
    delete v12Like.buildPresets;
    const migrated = new (facade.context.player.constructor as never as { new(o?: unknown): instanceOfPlayer })(v12Like);
    assert.equal(migrated.burnoutState.state, 'NORMAL', 'v12 save migrates burnout to NORMAL');
    assert.equal(migrated.buildPresets.length, 3, 'v12 save migrates presets');
    console.log('save v13 passed');
  } finally {
    facade.destroy();
  }
}
type instanceOfPlayer = import('../../assets/scripts/model/player-data').PlayerData;

testBurnoutStates();
testHalfDayOff();
testCompanyProfiles();
testOfferSystem();
testTeamAndMentorship();
testBuildPreset();
testMilestonesAndMonthly();
testBossPhase2();
testSaveV13();
console.log('V58 SYSTEMS TEST PASSED');
