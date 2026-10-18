import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

test('normal home facade exposes persisted overtime request and approved start actions', () => {
  const clock = new FakeClock(Date.parse('2026-09-21T18:00:00+08:00'));
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), sectId: 'OUTSOURCING', profession: 'QA', salary: 120 }),
  });
  try {
    const api = facade as unknown as {
      applyOvertimeApproval(seconds: number): { id: string; status: string; taskId: string };
      queryOvertimeApplications(): readonly { id: string; status: string }[];
      startApprovedOvertime(id: string): { status: string; approvalId?: string };
    };
    const application = api.applyOvertimeApproval(3600);
    assert.equal(application.taskId, 'qa-production-regression');
    assert.equal(api.queryOvertimeApplications()[0].id, application.id);
    if (application.status === 'APPROVED') {
      const session = api.startApprovedOvertime(application.id);
      assert.equal(session.approvalId, application.id);
      assert.equal(session.status, 'ACTIVE');
    }
  } finally { facade.destroy(); }
});

test('home overlay offers a separate approval request and approved-start action', () => {
  const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
  assert.match(overlay, /data-action="applyOvertimeApproval"/);
  assert.match(overlay, /data-action="startApprovedOvertime"/);
  assert.match(overlay, /queryOvertimeApplications/);
});

test('time-sensitive home work actions stay available while the home arena replaces the center scene', () => {
  const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
  const renderHome = overlay.slice(overlay.indexOf('function renderHome()'), overlay.indexOf('function homeTopbarHtml('));
  assert.match(renderHome, /window\.__HOME_ARENA__/);
  assert.match(renderHome, /homeTimedActionsHtml\(hud\)/,
    'the home shell must retain wage settlement and overtime actions outside the replaceable arena center');
  assert.match(overlay, /function homeTimedActionsHtml\(hud\)/,
    'one shared renderer should serve both the normal home scene and the arena home shell');
});

test('daily settlement UI exposes wallet expenses and net cash change', () => {
  const settlement = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay-v2.js'), 'utf8');
  assert.match(settlement, /生活支出/);
  assert.match(settlement, /view\.expenses/);
  assert.match(settlement, /净现金变化/);
  assert.match(settlement, /view\.netCashChange/);
  const settlementPage = settlement.slice(settlement.indexOf('function renderSettlementPage()'), settlement.indexOf('/* ── DEV 面板'));
  assert.match(settlementPage, /day\.settled/,
    'the daily settlement page must show a saved wage slip after the automatic end-of-day transaction');
  assert.match(settlementPage, /queryDailySettlementHistory/);
  assert.match(settlementPage, /ux-settlement-history/);
});

test('daily settlement facade exposes immutable wage slips after the idempotent day close', () => {
  const clock = new FakeClock(Date.parse('2026-09-21T09:00:00+08:00'));
  const facade = new GameFacade({ clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), salary: 100, sectId: 'OUTSOURCING' }) });
  try {
    facade.context.gameDay.ensureStarted();
    facade.context.gameDay.addIncome('salary', 42);
    const day = facade.context.gameDay.current()!;
    facade.context.player.gameDay = { ...day, lifeExpenses: 18 };
    facade.devJumpToHour(18, 0);
    facade.settleDay();
    const api = facade as unknown as { queryDailySettlementHistory(): readonly { salary: number; expenses?: number; netCashChange?: number }[] };
    const history = api.queryDailySettlementHistory();
    const lastSlip = history[history.length - 1];
    assert.equal(lastSlip?.salary, 42);
    assert.equal(lastSlip?.expenses, 18);
    assert.equal(lastSlip?.netCashChange, 24);
    assert.ok(Object.isFrozen(history) && Object.isFrozen(lastSlip), 'the facade exposes immutable copies, not mutable save objects');
    assert.throws(() => { (history as unknown[]).push({}); }, /extensible|read only|object is not extensible/i);
  } finally { facade.destroy(); }
});

test('the normal new-hire GamePlay scenario opens and captures the twelve-choice after-work life menu', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-character-creation.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; as?: string; path?: string; expected?: unknown; check?: string; from?: string; name?: string }[];
  };
  assert.ok(scenario.steps.some((step) => step.method === 'queryHomeLifeOptions'));
  assert.ok(scenario.steps.some((step) => step.path === '@vars.lifeOptions.length' && step.expected === 12));
  assert.ok(scenario.steps.some((step) => step.selector === '[data-action="openLifeMenu"]'));
  assert.ok(scenario.steps.some((step) => step.selector === '.ux-life-menu [data-life="HOT_SPRING"]'));
  assert.ok(scenario.steps.some((step) => step.action === 'screenshot' && step.name === 'sect-after-work-life-menu'));
});

test('economy GamePlay scenario buys coffee through the menu after earning enough canonical wages', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/economy.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; as?: string; path?: string; expected?: unknown; check?: string; from?: string }[];
  };
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action="lifeConsume"][data-kind="COFFEE"]'),
    'coffee must be purchased through the visible control in the scenario that first earns enough money');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.check === 'change'
    && step.path === '@vars.afterCoffee.salary' && step.from === '@vars.afterWork.salary' && step.expected === -18),
  'the real purchase must debit exactly ¥18 from the existing salary wallet');
});

test('daily wage GamePlay scenario settles from the visible home action and confirms the saved daily ledger', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/time-save.json'), 'utf8')) as {
    steps: { action: string; selector?: string; method?: string; args?: unknown[]; as?: string; path?: string; expected?: unknown; state?: string }[];
  };
  const evening = scenario.steps.findIndex((step) => step.method === 'devJumpToHour' && JSON.stringify(step.args) === JSON.stringify([18, 0]));
  const settlement = scenario.steps.findIndex((step) => step.method === 'queryGameDay' && step.as === 'settledOne');
  const reportClick = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action="goto"][data-page="settlement"]');
  const reportVisible = scenario.steps.findIndex((step) => step.action === 'waitFor'
    && step.selector === '.ux-settlement-history' && (step.state === undefined || step.state === 'visible'));
  const historyRead = scenario.steps.findIndex((step) => step.method === 'queryDailySettlementHistory' && step.as === 'dailySlipOne');
  assert.ok(evening >= 0 && settlement > evening && reportClick > settlement && reportVisible > reportClick && historyRead > reportVisible,
    'after the automatic idempotent day close, the normal More → Settlement UI must show the persisted wage slip');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.settlementHistoryOne[0].dayIndex'
    && step.expected === '@vars.workdayOne.dayIndex'), 'settlement must be read from durable history after the day rollover');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.dailySlipOne[0].netCashChange'));
});

test('time-save verifies completed wage slips after the live game day rolls over', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/time-save.json'), 'utf8')) as {
    steps: { action: string; method?: string; as?: string; path?: string; expected?: unknown; check?: string }[];
  };
  const settlementHistory = scenario.steps.findIndex((step) => step.action === 'call'
    && step.method === 'queryDailySettlementHistory' && step.as === 'settlementHistoryOne');
  const settlementRecorded = scenario.steps.findIndex((step) => step.action === 'assert'
    && step.path === '@vars.settlementHistoryOne[0].dayIndex'
    && step.expected === '@vars.workdayOne.dayIndex');
  assert.ok(settlementHistory >= 0 && settlementRecorded > settlementHistory,
    'after rollover, a persisted wage slip must prove the prior day settled');
  assert.ok(!scenario.steps.some((step) => step.action === 'assert'
    && step.path === '@vars.settledOne.settled' && step.expected === true),
    'the new live day is unsettled by definition and must not be mistaken for the prior day close');
  assert.ok(scenario.steps.some((step) => step.action === 'assert'
    && step.path === '@vars.settlementHistoryTwo[2].dayIndex' && step.expected === '@vars.settlementTwo.dayIndex'),
    'later day-close assertions must match the latest persisted slip to the authoritative settled day');
  assert.ok(scenario.steps.some((step) => step.action === 'assert'
    && step.path === '@vars.settlementHistoryThree.length' && step.check === 'gte' && step.expected === 3),
    'the three-workday scenario must prove three durable settlements, not infer them from local display time');
});

test('the overtime GamePlay scenario applies through the home UI and verifies the saved approval after restart', () => {
  const scenarioPath = path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-overtime-approval.json');
  assert.ok(fs.existsSync(scenarioPath), 'approval must be covered by a persistent JSON UI scenario');
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as {
    steps: { action: string; check?: string; state?: string; selector?: string; ensureVisibleSelector?: string; method?: string; args?: unknown[]; as?: string; path?: string; expected?: unknown; timeoutMs?: number }[];
  };
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryWorkToday' && step.as === 'workToday'),
    'the pre-off-work window must be confirmed from the authoritative work service');
  assert.ok(!scenario.steps.some((step) => step.action === 'scroll' && step.selector === '.ux-home-center'),
    'approval should not depend on a replaceable center scene being scrollable');
  assert.ok(scenario.steps.some((step) => step.action === 'waitFor' && step.state === 'clickable'
    && step.selector === '[data-action="applyOvertimeApproval"][data-seconds="3600"]' && step.timeoutMs === 4000),
  'the UI test must wait for the periodic render after the authoritative clock jump');
  assert.ok(scenario.steps.some((step) => step.action === 'assertClickable'
    && step.selector === '[data-action="applyOvertimeApproval"][data-seconds="3600"]'),
  'the approval action must be physically reachable through the home shell');
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action="applyOvertimeApproval"][data-seconds="3600"]'));
  assert.ok(scenario.steps.some((step) => step.action === 'call' && step.method === 'queryOvertimeApplications' && step.as === 'approvalBeforeRestart'));
  assert.ok(scenario.steps.some((step) => step.action === 'restartGame'));
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.check === 'equals' && step.expected === '@vars.approvalBeforeRestart[0].status'));
  const scripts = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.match(scripts.scripts['gameplay-agent:overtime'] ?? '', /sect-overtime-approval/);
});
