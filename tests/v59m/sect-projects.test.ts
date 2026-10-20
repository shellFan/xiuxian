import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

process.env.TZ = 'Asia/Shanghai';

function make(sectId = 'FREELANCE') {
  const clock = new FakeClock(Date.parse('2026-09-21T10:00:00+08:00'));
  const facade = new GameFacade({ clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), sectId, salary: 100, performance: 20, profession: 'QA' }) });
  facade.context.gameDay.ensureStarted();
  return { clock, facade };
}

type ProjectApi = {
  querySectProjectOffers(): readonly { id: string; risk: string; workMinutes: number; title: string; rewardSalary: number }[];
  acceptSectProject(id: string): { id: string; status: string };
  startSectProject(id: string, seed?: number): unknown;
};

test('daily sect contract offers derive from the active employer and survive restart', () => {
  const { facade } = make();
  try {
    const api = facade as unknown as ProjectApi;
    const offers = api.querySectProjectOffers();
    assert.equal(offers.length, 3);
    assert.deepEqual(offers.map((offer) => offer.risk), ['LOW', 'MEDIUM', 'HIGH']);
    assert.ok(offers.every((offer) => offer.workMinutes > 0 && offer.rewardSalary > 0));
    const active = api.acceptSectProject(offers[0].id);
    assert.equal(active.status, 'ACCEPTED');
    assert.equal(api.acceptSectProject(offers[1].id).id, active.id, 'one accepted contract per game day');
    assert.equal(api.querySectProjectOffers().find((offer) => offer.id === active.id)?.title, offers[0].title);
    assert.equal(new PlayerData(facade.context.saveService.load()).sectProjectContract?.id, active.id, 'accepted contract survives save/load');
  } finally { facade.destroy(); }
});
test('yesterday project contract is not exposed as the current contract after the game day advances', () => {
  const { facade } = make();
  try {
    const api = facade as unknown as ProjectApi & { querySectProject(): { id: string } | null };
    const offer = api.querySectProjectOffers()[0];
    api.acceptSectProject(offer.id);
    facade.context.player.gameDay!.dayIndex += 1;

    assert.equal(api.querySectProject(), null);
  } finally { facade.destroy(); }
});

test('normal project page binds daily contract selection and battle start to the facade', () => {
  const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
  assert.match(overlay, /querySectProjectOffers/);
  assert.match(overlay, /data-action="acceptSectProject"/);
  assert.match(overlay, /data-action="startSectProject"/);
});

test('project battle scenario dismisses the real weekly report control before asserting battle visibility', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-project-contract.json'), 'utf8')) as {
    steps: { action: string; selector?: string; optional?: boolean; ensureVisibleSelector?: string; ms?: number; method?: string; as?: string; path?: string; expected?: unknown }[];
  };
  const start = scenario.steps.findIndex((step) => step.selector === '[data-action="startSectProject"]');
  assert.ok(start >= 0);
  assert.equal(scenario.steps[start + 1]?.method, 'querySectProject');
  assert.equal(scenario.steps[start + 1]?.as, 'startedContract');
  assert.equal(scenario.steps[start + 2]?.path, '@vars.startedContract.status');
  assert.equal(scenario.steps[start + 2]?.expected, 'ACTIVE');
  assert.equal(scenario.steps[start + 3]?.method, 'queryCardBattle');
  assert.equal(scenario.steps[start + 3]?.as, 'startedBattleImmediately');
  assert.equal(scenario.steps[start + 4]?.path, '@vars.startedBattleImmediately.phase');
  assert.equal(scenario.steps[start + 4]?.expected, 'PLAYER_ACTION');
  assert.equal(scenario.steps[start + 5]?.action, 'wait');
  assert.equal(scenario.steps[start + 5]?.ms, 800);
  assert.equal(scenario.steps[start + 6]?.action, 'scroll');
  assert.equal(scenario.steps[start + 6]?.selector, '.ux-weekly-popup');
  assert.equal(scenario.steps[start + 6]?.optional, true);
  assert.equal(scenario.steps[start + 6]?.ensureVisibleSelector, '[data-v57-close-weekly]');
  assert.equal(scenario.steps[start + 7]?.action, 'clickIfPresent');
  assert.equal(scenario.steps[start + 7]?.selector, '[data-v57-close-weekly]');
  assert.equal(scenario.steps[start + 8]?.action, 'wait');
  assert.equal(scenario.steps[start + 9]?.action, 'clickIfPresent');
  assert.equal(scenario.steps[start + 9]?.selector, '[data-critical-conv]');
  assert.equal(scenario.steps[start + 10]?.action, 'clickIfPresent');
  assert.equal(scenario.steps[start + 10]?.selector, '.ux-screen:has(.ux-messenger) .ux-header [data-action="back"]',
    'leave the messenger through its visible back control without matching unrelated page headers');
  assert.equal(scenario.steps[start + 11]?.action, 'clickIfPresent');
  assert.equal(scenario.steps[start + 11]?.selector, '.ux-modal-layer [data-vevent-choice]',
    'a queued V2 event must be resolved through an actual event choice before the battle check');
  assert.equal(scenario.steps[start + 12]?.action, 'clickIfPresent');
  assert.equal(scenario.steps[start + 12]?.selector, '.ux-modal-layer #V2EventOk',
    'the actual event result must be acknowledged before checking the battle');
  const projectState = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'querySectProject' && step.as === 'active');
  const battleState = scenario.steps.findIndex((step) => step.action === 'call' && step.method === 'queryCardBattle' && step.as === 'startedBattle');
  assert.ok(projectState > start && battleState > projectState,
    'the visible start action must be confirmed by existing authoritative project and battle state');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.active.status' && step.expected === 'ACTIVE'));
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.startedBattle.phase' && step.expected === 'PLAYER_ACTION'));
  const battleWait = scenario.steps.findIndex((step) => step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="PLAYER_ACTION"]');
  assert.ok(scenario.steps.slice(start, battleWait).filter((step) => step.action === 'clickIfPresent'
    && (step.selector === '.ux-modal-layer [data-vevent-choice="__auto"]' || step.selector === '.ux-modal-layer #V2EventOk')).length >= 4,
  'the bounded recovery must process multiple real queued event modals before waiting for battle controls');
  assert.ok(battleWait > battleState);
});

test('project battle scenario snapshots authoritative state immediately after the visible start click', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-project-contract.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; as?: string; path?: string; expected?: unknown }[];
  };
  const start = scenario.steps.findIndex((step) => step.selector === '[data-action="startSectProject"]');
  assert.ok(start >= 0);
  assert.deepEqual(scenario.steps.slice(start + 1, start + 5).map((step) => [step.action, step.method, step.as, step.path, step.expected]), [
    ['call', 'querySectProject', 'startedContract', undefined, undefined],
    ['assert', undefined, undefined, '@vars.startedContract.status', 'ACTIVE'],
    ['call', 'queryCardBattle', 'startedBattleImmediately', undefined, undefined],
    ['assert', undefined, undefined, '@vars.startedBattleImmediately.phase', 'PLAYER_ACTION'],
  ], 'capture whether the button started the contract battle before popup recovery can navigate elsewhere');
});

test('project battle scenario returns from a critical message to the active project page', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-project-contract.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; as?: string }[];
  };
  const start = scenario.steps.findIndex((step) => step.selector === '[data-action="startSectProject"]');
  const backFromMessenger = scenario.steps.findIndex((step, index) => index > start && step.action === 'clickIfPresent'
    && step.selector === '.ux-screen:has(.ux-messenger) .ux-header [data-action="back"]');
  const returnToProject = scenario.steps.findIndex((step, index) => index > start && step.action === 'click' && step.selector === '[data-nav="PROJECT"]');
  const battleWait = scenario.steps.findIndex((step, index) => index > start && step.action === 'waitFor' && step.selector === '.ux-cardbattle[data-card-phase="PLAYER_ACTION"]');
  assert.ok(backFromMessenger > start && backFromMessenger < returnToProject && returnToProject < battleWait,
    'leave the critical message detail through its visible back control, then return to the project tab before asserting the active battle is visible');
});

test('M acceptance scenarios advance the authoritative work clock and scroll to the life action before clicking', () => {
  const economy = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/economy.json'), 'utf8')) as {
    steps: { action: string; args?: unknown[]; description?: string; method?: string; as?: string; path?: string; expected?: unknown }[];
  };
  const jumpToWork = economy.steps.findIndex((step) => step.action === 'call' && step.description?.includes('start of its work window'));
  const advanceWorkClock = economy.steps.findIndex((step) => step.action === 'call' && step.args?.[0] === 30 * 60 * 1000);
  const tickWork = economy.steps.findIndex((step) => step.action === 'call' && step.description?.includes('Process the thirty elapsed work minutes'));
  assert.ok(jumpToWork >= 0 && advanceWorkClock > jumpToWork && tickWork > advanceWorkClock,
    'wage acceptance must advance the existing clock before ticking work');
  assert.deepEqual(economy.steps[advanceWorkClock].args, [30 * 60 * 1000]);
  assert.ok(economy.steps.some((step) => step.action === 'call' && step.method === 'queryGameClock' && step.as === 'beforeWorkClock'),
    'wage acceptance must capture the authoritative clock at the start of work');
  assert.ok(economy.steps.some((step) => step.action === 'call' && step.method === 'queryGameDay' && step.as === 'afterWorkDay'),
    'wage acceptance must capture the authoritative daily income ledger after work');

  const sectCreation = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-character-creation.json'), 'utf8')) as {
    steps: { action: string; selector?: string; ensureVisibleSelector?: string; deltaY?: number }[];
  };
  const lifeMenu = sectCreation.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action="openLifeMenu"]');
  assert.ok(lifeMenu > 0);
  const scroll = sectCreation.steps.slice(0, lifeMenu).find((step) => step.action === 'scroll' && step.ensureVisibleSelector === '[data-action="openLifeMenu"]');
  assert.ok(scroll, 'life menu must be brought into view through normal user scrolling');
  assert.equal(scroll.selector, '.ux-home-col.ux-home-right');
  assert.ok((scroll.deltaY ?? 0) >= 2475, 'scroll must cover the measured content height minus viewport (2475px)');
  assert.ok(sectCreation.steps.slice(0, lifeMenu).some((step) => step.action === 'assertClickable' && step.selector === '[data-action="openLifeMenu"]'),
    'scenario must verify the life action is actually clickable before proceeding');
  const lifeMenuVisible = sectCreation.steps.findIndex((step) => step.action === 'assertVisible' && step.selector === '.ux-life-menu [data-life="HOT_SPRING"]');
  assert.ok(lifeMenuVisible > lifeMenu);
  const modalScroll = sectCreation.steps.slice(lifeMenu + 1, lifeMenuVisible).find((step) => step.action === 'scroll' && step.ensureVisibleSelector === '.ux-life-menu [data-life="HOT_SPRING"]');
  assert.ok(modalScroll, 'long-form life activities must be reached through the menu’s real scroll container');
  assert.equal(modalScroll.selector, '.ux-popup-card--scroll');
  assert.ok((modalScroll.deltaY ?? 0) >= 600);
});

test('new-player setup retries a direction choice until the authoritative creation draft records it', () => {
  const setup = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/_new-player.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; path?: string; from?: string; expected?: unknown; maxAttempts?: number }[];
  };
  const selectDirection = setup.steps.findIndex((step) => step.selector === '[data-creation-choice="direction:TECH_RND"]');
  assert.ok(selectDirection >= 0);
  assert.deepEqual(
    [setup.steps[selectDirection]?.action, setup.steps[selectDirection]?.method, setup.steps[selectDirection]?.path,
      setup.steps[selectDirection]?.from, setup.steps[selectDirection]?.expected, setup.steps[selectDirection]?.maxAttempts],
    ['clickUntilState', 'queryCharacterCreation', 'draft.direction', null, 'TECH_RND', 3],
  );
  assert.equal(setup.steps[selectDirection + 1]?.action, 'clickUntilState');
});

test('contract battle risk changes encounter and settlement applies time and income exactly once', () => {
  const { facade } = make();
  try {
    const api = facade as unknown as ProjectApi;
    const high = api.querySectProjectOffers().find((offer) => offer.risk === 'HIGH')!;
    api.acceptSectProject(high.id);
    const beforeTime = facade.context.clockV2.now();
    const state = api.startSectProject(high.id, 321) as { phase?: string; enemies?: { kind: string }[] };
    assert.equal(state.enemies?.[0]?.kind, 'MUTANT_BUG_KING');
    assert.equal(facade.context.sectProjects.resolve(high.id, true).status, 'COMPLETED');
    const afterFirst = facade.context.player.salary;
    assert.equal(facade.context.sectProjects.resolve(high.id, true).salary, 0, 'replay cannot pay twice');
    assert.equal(facade.context.player.salary, afterFirst);
    assert.ok(facade.context.clockV2.now() - beforeTime >= high.workMinutes * 60_000);
  } finally { facade.destroy(); }
});

test('a failed contract battle costs time and performance but awards no project salary', () => {
  const { facade } = make();
  try {
    const api = facade as unknown as ProjectApi;
    const contract = api.querySectProjectOffers().find((offer) => offer.risk === 'MEDIUM')!;
    api.acceptSectProject(contract.id);
    const salary = facade.context.player.salary;
    const performance = facade.context.player.performance;
    api.startSectProject(contract.id, 321);
    assert.equal(facade.context.sectProjects.resolve(contract.id, false).salary, 0);
    assert.equal(facade.context.player.salary, salary);
    assert.ok(facade.context.player.performance < performance);
  } finally { facade.destroy(); }
});

test('a paid work interval after the canonical next-day clock jump increases salary and the daily ledger', () => {
  const clock = new FakeClock(Date.parse('2026-09-21T17:00:00+08:00'));
  const facade = new GameFacade({ clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), sectId: 'OUTSOURCING', salary: 60, profession: 'QA' }) });
  try {
    facade.context.gameDay.ensureStarted();
    facade.gameLoop.start();
    facade.tick(1);
    facade.devJumpToHour(9, 0);
    assert.equal(facade.queryGameClock().hour, 9);
    facade.changeWorkMode('WORK');
    const balanceBefore = facade.context.player.salary;
    const earnedBefore = facade.queryGameDay()!.income.salary;

    facade.devAdvanceTime(30 * 60_000);
    facade.tick(1800);

    assert.equal(facade.snapshot().workSeconds, 1800, 'work time must be observed by the existing game loop');
    assert.ok(facade.context.player.salary > balanceBefore, `wallet salary must increase (${balanceBefore} -> ${facade.context.player.salary})`);
    assert.ok(facade.queryGameDay()!.income.salary > earnedBefore, 'the current day ledger must record ordinary work wages');
  } finally { facade.destroy(); }
});
