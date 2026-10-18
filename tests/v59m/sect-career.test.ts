import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { PlayerData } from '../../assets/scripts/model/player-data';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';

function make(performance: number) {
  const clock = new FakeClock(Date.parse('2026-09-21T17:50:00+08:00'));
  const facade = new GameFacade({
    clock, careerEventClock: clock, storage: new MemoryStorageAdapter(), board: null,
    player: new PlayerData({ lastSaveTime: clock.now(), salary: 500, sectId: 'OUTSOURCING', profession: 'QA', performance }),
  });
  facade.context.gameDay.ensureStarted();
  return { clock, facade };
}

type SectCareerApi = {
  querySectJobs(): readonly { id: string; salaryEstimate: number; current: boolean }[];
  applySectJob(sectId: string): { id: string; status: string };
  resolveSectInterview(applicationId: string, answer: 'DELIVERY' | 'TEAMWORK' | 'RISK'): { status: string; score: number };
  acceptSectOffer(applicationId: string): { effectiveDayIndex: number; sectId: string };
  querySectApplications(): readonly { id: string; status: string }[];
};

test('sect job board compares employers and a failed interview never changes wages contract', () => {
  const { facade } = make(0);
  try {
    const api = facade as unknown as SectCareerApi;
    const jobs = api.querySectJobs();
    assert.equal(jobs.length, 8);
    assert.ok(jobs.every((job) => job.salaryEstimate >= 0));
    const application = api.applySectJob('PRIVATE');
    const result = api.resolveSectInterview(application.id, 'RISK');
    assert.equal(result.status, 'REJECTED');
    assert.equal(facade.querySect()?.id, 'OUTSOURCING');
    assert.equal(api.querySectApplications()[0].status, 'REJECTED');
  } finally { facade.destroy(); }
});

test('successful sect interview takes effect on the next workday and has a cooldown', () => {
  const { clock, facade } = make(100);
  try {
    const api = facade as unknown as SectCareerApi;
    const currentDay = facade.queryGameDay()!.dayIndex;
    const application = api.applySectJob('PRIVATE');
    assert.equal(api.resolveSectInterview(application.id, 'DELIVERY').status, 'OFFERED');
    const offer = api.acceptSectOffer(application.id);
    assert.equal(offer.effectiveDayIndex, currentDay + 1);
    assert.equal(facade.querySect()?.id, 'OUTSOURCING', 'new contract waits for the next day');
    clock.set(Date.parse('2026-09-22T09:00:00+08:00'));
    facade.context.gameDay.markSettled();
    facade.context.gameDay.ensureStarted();
    assert.equal(facade.querySect()?.id, 'PRIVATE');
    assert.throws(() => api.applySectJob('STATE'), /冷却/);
  } finally { facade.destroy(); }
});

test('normal sect page binds job applications, interview choices and next-day offer acceptance', () => {
  const overlay = fs.readFileSync(path.resolve(process.cwd(), 'desktop/ui-overlay.js'), 'utf8');
  assert.match(overlay, /querySectJobs/);
  assert.match(overlay, /data-action="sectInterview"/);
  assert.match(overlay, /data-action="acceptSectOffer"/);
  assert.match(overlay, /applySectJob/);
});

test('sect-career UI GamePlay scenario applies, interviews, and verifies the saved no-offer path', () => {
  const scenario = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'ai/gameplay-agent/scenarios/sect-career-interview.json'), 'utf8')) as {
    steps: { action: string; selector?: string; ensureVisibleSelector?: string; method?: string; as?: string; check?: string; path?: string; expected?: unknown; state?: string }[];
  };
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action="sect"][data-id="FREELANCE"]'),
    'the player must choose the employer from the rendered sect page');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.jobOffers[3].id' && step.expected === 'FREELANCE'),
    'salary projections must be associated with the canonical employer ID, not a guessed list position');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.jobOffers[3].salaryMultiplier' && step.expected === 0),
    'the freelance employer must be verified as project-paid with no fixed salary multiplier');
  const freelanceScroll = scenario.steps.findIndex((step) => step.action === 'scroll'
    && step.selector === '.ux-body'
    && step.ensureVisibleSelector === '[data-action="sect"][data-id="FREELANCE"]');
  const freelanceClickable = scenario.steps.findIndex((step) => step.action === 'assertClickable'
    && step.selector === '[data-action="sect"][data-id="FREELANCE"]');
  const freelanceVisible = scenario.steps.findIndex((step) => step.action === 'waitFor'
    && step.selector === '[data-action="sect"][data-id="FREELANCE"]' && step.state === 'visible');
  assert.ok(freelanceScroll >= 0 && freelanceVisible > freelanceScroll && freelanceClickable > freelanceVisible,
    'the scenario must scroll and confirm the below-the-fold freelance control is visibly inside the viewport before asserting it is clickable');
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '.ux-dialog-actions .ux-btn[data-idx="1"]'),
    'the interview application must be submitted through its visible confirmation button');
  assert.ok(scenario.steps.some((step) => step.action === 'click' && step.selector === '[data-action="sectInterview"][data-answer="RISK"]'),
    'the visible risk-review interview answer must match the intended rejection path');
  const interviewAnswer = scenario.steps.findIndex((step) => step.action === 'click' && step.selector === '[data-action="sectInterview"][data-answer="RISK"]');
  assert.ok(scenario.steps.slice(0, interviewAnswer).some((step) => step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer [data-vevent-choice="__auto"]'),
  'queued no-choice event results must be closed through their real acknowledgement button before the interview');
  assert.ok(scenario.steps.slice(0, interviewAnswer).some((step) => step.action === 'clickIfPresent'
    && step.selector === '.ux-modal-layer #V2EventOk'),
  'the event result layer must also be acknowledged through its real continue button');
  assert.ok(scenario.steps.slice(0, interviewAnswer).some((step) => step.action === 'waitFor' && step.selector === '.ux-modal-layer' && step.state === 'hidden'),
    'the interview must wait until the interrupting event modal is actually gone');
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.afterInterview[0].status' && step.expected === 'REJECTED'));
  assert.ok(scenario.steps.some((step) => step.action === 'assert' && step.path === '@vars.currentSect.id' && step.expected === 'OUTSOURCING'));
});
