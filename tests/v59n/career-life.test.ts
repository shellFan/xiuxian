import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { EVENTS } from '../../assets/scripts/v2/v2-event-service';
import { checkEventConditions, type EventWorldState } from '../../assets/scripts/v2/event-engine';

type CareerLifeApi = {
  queryCareerLife(): {
    employment: 'EMPLOYED' | 'UNEMPLOYED';
    relationships: readonly { npcId: string; affinity: number; trust: number; recognition: number; conflict: number }[];
    goals: readonly { id: string; progress: number; target: number; complete: boolean }[];
  };
  resignCareer(): { success: boolean; reason?: string };
  interactWithNpc(npcId: string, action: 'SUPPORT' | 'SOCIALIZE' | 'CHALLENGE'): { success: boolean; reason?: string };
  checkCareerPromotion(): { allowed: boolean; reason: string };
  startCareerPromotionInterview(): readonly { id: string; options: readonly { id: string; text: string }[] }[];
  submitCareerPromotionInterview(answers: readonly string[]): { passed: boolean; newLevel: number; total: number };
  claimCareerGoal(goalId: string): { success: boolean; reason?: string };
};

function create(options: { sectId?: string; salary?: number; level?: number; workday?: string } = {}) {
  const clock = new FakeClock(Date.parse(options.workday ?? '2026-10-19T10:00:00+08:00'));
  const storage = new MemoryStorageAdapter();
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage, board: null,
    player: new PlayerData({
      lastSaveTime: clock.now(), salary: options.salary ?? 1000,
      sectId: options.sectId ?? 'OUTSOURCING', careerLevel: options.level ?? 1,
      profession: 'QA', mind: 100, maxMind: 100, cultivationExp: 1000,
      performance: 150, workSeconds: 90_000, relationships: { BOSS: 10, HR: 0, CLIENT: 0 },
    }),
  });
  facade.context.gameDay.ensureStarted();
  return { clock, storage, facade, api: facade as unknown as CareerLifeApi };
}

test('career life screen reuses the authoritative employer and derives goals without a second career counter', () => {
  const { facade, api } = create();
  try {
    const view = api.queryCareerLife();
    assert.equal(view.employment, 'EMPLOYED');
    assert.ok(view.relationships.some((entry) => entry.npcId === 'BOSS' && entry.affinity === 10));
    assert.ok(view.goals.some((goal) => goal.id === 'career-level-2' && goal.progress === 1 && goal.target === 2));
    for (const id of ['senior-engineer', 'technical-expert', 'engineering-manager', 'client-transfer', 'salary-5000', 'high-risk-project', 'healthy-workdays', 'wealth-10000']) {
      assert.ok(view.goals.some((goal) => goal.id === id), `long-term goal ${id} should be visible`);
    }
    assert.equal(facade.queryCareer().level, facade.snapshot().careerLevel);
  } finally { facade.destroy(); }
});

test('one NPC interaction per game day changes affinity and persists a distinct memory-backed relationship profile', () => {
  const { facade, api } = create();
  try {
    const before = api.queryCareerLife().relationships.find((entry) => entry.npcId === 'BOSS')!;
    assert.equal(api.interactWithNpc('BOSS', 'SUPPORT').success, true);
    const after = api.queryCareerLife().relationships.find((entry) => entry.npcId === 'BOSS')!;
    assert.ok(after.affinity > before.affinity);
    assert.ok(after.trust > before.trust);
    assert.equal(api.interactWithNpc('BOSS', 'CHALLENGE').success, false, 'daily cap blocks relationship farming');
    const reloaded = new PlayerData(facade.context.saveService.load());
    assert.ok(reloaded.npcMemories.BOSS.entries.some((entry) => entry.kind === 'PLAYER_SUPPORTED_NPC'));
    assert.equal(reloaded.relationships.BOSS, after.affinity);
  } finally { facade.destroy(); }
});

test('resignation stops fixed wage while preserving wallet, level and employable job history', () => {
  const { facade, api, clock } = create();
  try {
    const walletBefore = facade.snapshot().salary;
    const levelBefore = facade.snapshot().careerLevel;
    assert.equal(api.resignCareer().success, true);
    assert.equal(api.queryCareerLife().employment, 'UNEMPLOYED');
    assert.equal(facade.querySect()?.id, undefined, 'the former employer is no longer the active contract');
    assert.equal(facade.snapshot().salary, walletBefore);
    assert.equal(facade.snapshot().careerLevel, levelBefore);
    const paidBefore = facade.context.player.salary;
    facade.context.work.tick(3600);
    assert.equal(facade.context.player.salary, paidBefore, 'ordinary work while unemployed must not create wage');
    assert.ok(facade.context.player.workSeconds > 0, 'working time and non-wage progress remain available');
    clock.set(clock.now() + 3600_000);
    assert.equal(facade.context.idle.preview('unemployed-offline').salary, 0, 'offline progress cannot create fixed wages while unemployed');
    assert.throws(() => facade.context.overtime.applyForApproval(3600), /待业/, 'unemployment cannot request paid overtime');
  } finally { facade.destroy(); }
});

test('outsourcing promotion adds a client-delivery requirement and reuses the existing promotion defense', () => {
  const { facade, api } = create({ sectId: 'OUTSOURCING' });
  try {
    facade.context.player.kpiProgress = { ...facade.context.player.kpiProgress, WORK_SECONDS: 100_000, CULTIVATION: 1000, TASK_DONE: 5 };
    const blocked = api.checkCareerPromotion();
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /客户|项目/);
    facade.context.player.relationships.CLIENT = 30;
    facade.context.player.projectHistory.push({
      id: 'client-delivery-1', name: '驻场交付', type: 'SECT_PROJECT', status: 'COMPLETED', ending: 'SUCCESS',
      startedDayIndex: 1, completedDayIndex: 1, delays: 0, requirementChanges: 0, bugCount: 0,
      techDebt: 0, spentMinutes: 45, decisionCount: 0, s1Count: 0, npcIds: ['CLIENT'], bossIds: [],
    });
    assert.equal(api.checkCareerPromotion().allowed, true);
    assert.equal(api.startCareerPromotionInterview().length, 3);
  } finally { facade.destroy(); }
});

test('promotion answer replay and goal reward claiming are idempotent', () => {
  const { facade, api } = create({ sectId: 'PRIVATE', level: 1 });
  try {
    facade.context.player.kpiProgress = { ...facade.context.player.kpiProgress, WORK_SECONDS: 100_000, CULTIVATION: 1000, TASK_DONE: 5 };
    assert.equal(api.startCareerPromotionInterview().length, 3);
    const questions = api.startCareerPromotionInterview();
    const result = api.submitCareerPromotionInterview(questions.map((question) => question.options[0].id));
    if (result.passed) {
      assert.throws(() => api.submitCareerPromotionInterview(questions.map((question) => question.options[0].id)));
    }
    const goals = api.queryCareerLife().goals;
    const salaryGoal = goals.find((goal) => goal.id === 'salary-5000');
    assert.ok(salaryGoal);
    facade.context.player.careerLevel = 10;
    assert.ok(api.queryCareerLife().goals.find((goal) => goal.id === 'salary-5000')?.complete);
    assert.equal(api.claimCareerGoal('salary-5000').success, true);
    const professionExp = facade.context.player.professionExp;
    assert.equal(api.claimCareerGoal('salary-5000').success, false);
    assert.equal(facade.context.player.professionExp, professionExp);
  } finally { facade.destroy(); }
});

test('old M saves default to employed and preserve existing relationship and promotion state', () => {
  const { facade, storage, clock } = create();
  try {
    const old = facade.context.player.toSaveData() as unknown as Record<string, unknown>;
    delete old['career:employment-unemployed'];
    storage.setItem('game-save', JSON.stringify(old));
    const migrated = new GameFacade({ clock, careerEventClock: clock, storage, board: null });
    try {
      const api = migrated as unknown as CareerLifeApi;
      assert.equal(api.queryCareerLife().employment, 'EMPLOYED');
      assert.equal(migrated.context.player.relationships.BOSS, 10);
      assert.equal(migrated.context.player.careerLevel, facade.context.player.careerLevel);
    } finally { migrated.destroy(); }
  } finally { facade.destroy(); }
});

test('an unemployed player can interview at the previous employer and resumes pay only when the next-day contract starts', () => {
  const { facade, clock } = create({ sectId: 'OUTSOURCING', salary: 900 });
  try {
    const api = facade as unknown as CareerLifeApi & {
      applySectJob(id: string): { id: string };
      resolveSectInterview(id: string, answer: 'DELIVERY'): { status: string };
      acceptSectOffer(id: string): { sectId: string; effectiveDayIndex: number };
    };
    assert.equal(api.resignCareer().success, true);
    const application = api.applySectJob('OUTSOURCING');
    assert.equal(api.resolveSectInterview(application.id, 'DELIVERY').status, 'OFFERED');
    const pending = api.acceptSectOffer(application.id);
    assert.equal(facade.querySect()?.id, undefined, 'job-searching remains unemployed while the signed offer is pending');
    clock.set(Date.parse('2026-10-20T09:00:00+08:00'));
    facade.context.gameDay.markSettled();
    facade.context.gameDay.ensureStarted();
    assert.equal(facade.querySect()?.id, 'OUTSOURCING');
    assert.equal(api.queryCareerLife().employment, 'EMPLOYED');
    assert.equal(pending.effectiveDayIndex, facade.queryGameDay()!.dayIndex);
  } finally { facade.destroy(); }
});

test('100-day career loop survives employment changes, relationship actions, and unemployed pay suppression', () => {
  const { facade, clock } = create({ sectId: 'OUTSOURCING', salary: 1000 });
  const api = facade as unknown as CareerLifeApi & {
    applySectJob(id: string): { id: string };
    resolveSectInterview(id: string, answer: 'DELIVERY'): { status: string };
    acceptSectOffer(id: string): { effectiveDayIndex: number };
  };
  try {
    let transitions = 0;
    for (let day = 1; day <= 100; day += 1) {
      facade.context.gameDay.ensureStarted();
      if (day === 20 || day === 60) {
        assert.equal(api.resignCareer().success, true);
        const application = api.applySectJob(day === 20 ? 'OUTSOURCING' : 'PRIVATE');
        assert.equal(api.resolveSectInterview(application.id, 'DELIVERY').status, 'OFFERED');
        const offer = api.acceptSectOffer(application.id);
        assert.equal(api.queryCareerLife().employment, 'UNEMPLOYED');
        assert.equal(facade.context.player.sectId, null);
        if (transitions > 0) assert.ok(offer.effectiveDayIndex > 0);
        transitions += 1;
      }
      api.interactWithNpc('TESTER', 'SUPPORT');
      const before = facade.context.player.salary;
      facade.context.work.tick(3600);
      if (api.queryCareerLife().employment === 'UNEMPLOYED') {
        assert.equal(facade.context.player.salary, before, `day ${day}: unemployment must suppress hourly fixed pay`);
      }
      assert.ok(Number.isFinite(facade.context.player.salary) && facade.context.player.salary >= 0);
      assert.ok(Number.isFinite(facade.context.player.mind) && facade.context.player.mind >= 0);
      facade.context.gameDay.markSettled();
      if (day < 100) clock.set(clock.now() + 24 * 60 * 60 * 1000);
    }
    assert.equal(transitions, 2);
    assert.equal(api.queryCareerLife().employment, 'EMPLOYED');
    assert.ok(facade.context.player.sectCareerHistory.length >= 3);
    assert.ok(api.queryCareerLife().relationships.find((entry) => entry.npcId === 'TESTER')!.trust > 50);
  } finally { facade.destroy(); }
});

test('career crisis content is part of Fate, has distinct choices, and is gated while unemployed', () => {
  const events = EVENTS.filter((event) => event.id.startsWith('career_life_'));
  assert.equal(events.length, 24);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  for (const event of events) {
    assert.equal(event.requiresEmployment, true, `${event.id} must not target unemployed players`);
    assert.ok((event.choices?.length ?? 0) >= 2, `${event.id} should offer meaningful choices`);
    const [first, second] = event.choices!;
    assert.notDeepEqual(first.successEffects, second.successEffects, `${event.id} choices must have different outcomes`);
  }
  const sample = events[0];
  const world = {
    careerLevel: 1, workMode: 'NORMAL', mind: 50, innerDemon: 0, salary: 1000, cultivation: 0,
    weekday: 1, hour: 10, situationIds: [], sectId: 'OUTSOURCING', relationships: {}, materials: {},
    ownedTechniques: [], ownedEquipment: [], eventFlags: {}, employed: false,
  } satisfies EventWorldState;
  assert.equal(checkEventConditions(sample, world), false);
  assert.equal(checkEventConditions(sample, { ...world, employed: true }), true);
  const { facade } = create();
  try {
    facade.context.player.eventFlags['career:unemployed'] = true;
    facade.context.player.pendingEvents.push({ uid: 'pending-career-crisis', eventId: sample.id, occurredAt: 0, priority: 'NORMAL' });
    assert.equal(facade.context.v2Events.currentEvent(), null, 'resignation must not surface an already queued workplace crisis');
    facade.context.player.eventFlags['career:unemployed'] = false;
    assert.equal(facade.context.v2Events.currentEvent()?.id, sample.id, 'pending evidence is retained for re-employment');
  } finally { facade.destroy(); }
});
