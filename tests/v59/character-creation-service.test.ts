import assert from 'node:assert/strict';
import { GameContext } from '../../assets/scripts/core/game-context';
import { FakeClock } from '../../assets/scripts/core/clock';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { CHARACTER_CREATION_DRAFT_KEY } from '../../assets/scripts/v59/character-creation-service';

class FailOnceGameSaveStorage extends MemoryStorageAdapter {
  public failGameSave = true;
  public successfulGameSaves = 0;

  public override setItem(key: string, value: string): void {
    if (key === 'game-save' && this.failGameSave) throw new Error('simulated disk failure');
    if (key === 'game-save') this.successfulGameSaves += 1;
    super.setItem(key, value);
  }
}

const NOW = 1_800_000_000_000;

function createContext(storage: MemoryStorageAdapter, seed = 42): GameContext {
  return new GameContext({
    storage,
    clock: new FakeClock(NOW),
    board: null,
    characterSeedProvider: () => seed,
  } as never);
}

function advanceToDestiny(context: GameContext): void {
  const service = (context as any).characterCreation;
  assert.equal(service.query().draft.step, 'INDUSTRY');
  assert.equal(service.selectIndustry('INTERNET').success, true);
  assert.equal(service.advance().draft.step, 'DIRECTION');
  assert.equal(service.selectDirection('TECH_RND').success, true);
  assert.equal(service.advance().draft.step, 'PROFESSION');
  assert.equal(service.selectProfession('QA').success, true);
  assert.equal(service.advance().draft.step, 'IDENTITY');
  assert.equal(service.setIdentity('测试剑修', 'avatar-2').success, true);
  assert.equal(service.setBackground('CULTIVATION_GRAD').success, true);
  assert.equal(service.advance().draft.step, 'DESTINY');
}

const tests: Array<[string, () => void]> = [
  ['all four supported professions finalize through their existing starter kits', () => {
    for (const professionId of ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'] as const) {
      const context = createContext(new MemoryStorageAdapter(), 42);
      const service = (context as any).characterCreation;
      service.selectIndustry('INTERNET'); service.advance();
      service.selectDirection('TECH_RND'); service.advance();
      assert.equal(service.selectProfession(professionId).success, true);
      service.advance();
      service.setIdentity('青云牛马', 'avatar-1');
      service.setBackground('ORDINARY_WORKER');
      service.advance();
      service.selectCandidate('B'); service.advance(); service.advance();
      assert.equal(service.finalize().success, true, `${professionId} finalizes`);
      assert.equal(context.player.profession, professionId);
      assert.ok(context.professionContent.activeSkills().length > 0, `${professionId} has its existing profession skill`);
      assert.ok(context.player.ownedEquipment.length > 0, `${professionId} receives starter equipment`);
    }
  }],
  ['new character draft persists through context restart without formal mutation', () => {
    const storage = new MemoryStorageAdapter();
    const first = createContext(storage, 42);
    const before = first.player.toSaveData();
    const firstDraft = (first as any).characterCreation.query().draft;
    assert.equal(firstDraft.step, 'INDUSTRY');
    assert.equal(firstDraft.rerollsUsed, 0);
    assert.equal(first.player.profession, undefined);
    assert.equal(first.player.ownedTechniques.length, 0);
    assert.equal(first.player.ownedEquipment.length, 0);
    assert.equal(first.player.salary, before.salary);

    const resumed = createContext(storage, 999);
    const resumedDraft = (resumed as any).characterCreation.query().draft;
    assert.deepEqual(resumedDraft, firstDraft);
    assert.equal(resumed.player.profession, undefined);
    assert.equal(resumed.player.ownedTechniques.length, 0);
  }],
  ['seven-step navigation validates fields and back navigation preserves draft values', () => {
    const context = createContext(new MemoryStorageAdapter());
    const service = (context as any).characterCreation;
    assert.equal(service.advance().success, false);
    assert.equal(service.selectIndustry('OTHER').success, false);
    assert.equal(service.selectIndustry('INTERNET').success, true);
    assert.equal(service.advance().draft.step, 'DIRECTION');
    assert.equal(service.selectDirection('TECH_RND').success, true);
    assert.equal(service.advance().draft.step, 'PROFESSION');
    assert.equal(service.selectProfession('QA').success, true);
    assert.equal(service.advance().draft.step, 'IDENTITY');
    assert.equal(service.setIdentity('青云牛马', 'avatar-1').success, true);
    assert.equal(service.setBackground('ORDINARY_WORKER').success, true);
    assert.equal(service.advance().draft.step, 'DESTINY');
    assert.equal(service.selectCandidate('B').success, true);
    assert.equal(service.advance().draft.step, 'ALLOCATION');
    assert.equal(service.back().draft.step, 'DESTINY');
    assert.equal(service.back().draft.step, 'IDENTITY');
    assert.equal(service.back().draft.step, 'PROFESSION');
    const draft = service.query().draft;
    assert.equal(draft.industry, 'INTERNET');
    assert.equal(draft.direction, 'TECH_RND');
    assert.equal(draft.professionId, 'QA');
    assert.equal(draft.nickname, '青云牛马');
    assert.equal(draft.background, 'ORDINARY_WORKER');
    assert.equal(draft.selectedCandidateId, 'B');
  }],
  ['profession step requires an explicit choice instead of silently accepting its default', () => {
    const context = createContext(new MemoryStorageAdapter());
    const service = (context as any).characterCreation;
    service.selectIndustry('INTERNET'); service.advance();
    service.selectDirection('TECH_RND'); service.advance();
    const result = service.advance();
    assert.equal(result.success, false);
    assert.equal(result.reason, '请选择已开放职业');
  }],
  ['three rerolls persist and a fourth reroll is rejected after restart', () => {
    const storage = new MemoryStorageAdapter();
    let context = createContext(storage, 42);
    advanceToDestiny(context);
    const service = (context as any).characterCreation;
    const history = new Set<string>();
    for (let count = 1; count <= 3; count += 1) {
      const before = service.query().draft;
      const beforeKey = JSON.stringify(before.candidates);
      assert.equal(service.reroll().success, true);
      const after = service.query().draft;
      assert.equal(after.rerollsUsed, count);
      assert.notEqual(JSON.stringify(after.candidates), beforeKey);
      history.add(JSON.stringify(after.candidates));
      context = createContext(storage, 999);
      assert.equal((context as any).characterCreation.query().draft.rerollsUsed, count);
    }
    assert.equal(history.size, 3);
    assert.equal((context as any).characterCreation.reroll().success, false);
  }],
  ['finalize writes destiny, chosen candidate, unspent potential, profession and starter kit once', () => {
    const context = createContext(new MemoryStorageAdapter());
    const service = (context as any).characterCreation;
    advanceToDestiny(context);
    assert.equal(service.selectCandidate('A').success, true);
    assert.equal(service.advance().draft.step, 'ALLOCATION');
    assert.equal(service.advance().draft.step, 'CONFIRM');
    assert.equal(service.finalize().success, true);
    const save = context.player.toSaveData();
    assert.equal(save.characterSetupStatus, 'COMPLETE');
    assert.equal(save.profession, 'QA');
    assert.equal(save.characterName, '测试剑修');
    assert.equal(save.characterAvatarId, 'avatar-2');
    assert.equal(save.characterIndustry, 'INTERNET');
    assert.equal(save.characterDirection, 'TECH_RND');
    assert.equal(save.characterBackground, 'CULTIVATION_GRAD');
    assert.equal(save.earnedAttributeDelta && save.earnedAttributeDelta.insight, 1);
    assert.equal(save.innateAttributes && Object.values(save.innateAttributes).reduce((sum, value) => sum + value, 0), 50);
    assert.equal(save.unspentPotential, 5);
    assert.ok(save.characterCreationReceipt);
    assert.ok(context.professionContent.activeSkills().includes(context.profession.def().initialSkill));
    assert.ok(context.player.ownedEquipment.length > 0);
    assert.equal(context.player.materials.cons_coffee, 2);
    const techniques = [...context.player.ownedTechniques];
    const equipment = [...context.player.ownedEquipment];
    assert.equal(service.finalize().success, true);
    assert.deepEqual(context.player.ownedTechniques, techniques);
    assert.deepEqual(context.player.ownedEquipment, equipment);
  }],
  ['starter kit direct profession selection cannot bypass the new-character authority', () => {
    const context = createContext(new MemoryStorageAdapter());
    const result = context.profession.choose('QA');
    assert.equal(result.success, false);
    assert.equal(context.player.profession, undefined);
    assert.equal(context.player.ownedTechniques.length, 0);
    assert.equal(context.player.materials.cons_coffee, undefined);
    const rechoose = context.profession.rechooseOnce('QA');
    assert.equal(rechoose.success, false);
    assert.equal(context.player.profession, undefined);
  }],
  ['failed finalize write restores formal state and allows one-save retry after restart', () => {
    const storage = new FailOnceGameSaveStorage();
    let context = createContext(storage);
    advanceToDestiny(context);
    const service = (context as any).characterCreation;
    assert.equal(service.selectCandidate('A').success, true);
    assert.equal(service.advance().success, true);
    assert.equal(service.advance().success, true);
    const draftBefore = service.query().draft;
    const failed = service.finalize();
    assert.equal(failed.success, false);
    assert.equal(context.player.characterSetupStatus, 'CREATION_REQUIRED');
    assert.equal(context.player.profession, undefined);
    assert.equal(context.player.ownedEquipment.length, 0);
    assert.equal(storage.getItem(CHARACTER_CREATION_DRAFT_KEY) !== null, true);
    assert.deepEqual(service.query().draft, draftBefore);

    storage.failGameSave = false;
    context = createContext(storage, 9001);
    assert.equal((context as any).characterCreation.finalize().success, true);
    assert.equal(storage.successfulGameSaves, 1);
    assert.equal(context.player.characterSetupStatus, 'COMPLETE');
    assert.ok(context.player.characterCreationReceipt);
  }],
  ['onboarding can be skipped into a profession task once and resumes after restart', () => {
    const storage = new MemoryStorageAdapter();
    let context = createContext(storage);
    advanceToDestiny(context);
    const service = (context as any).characterCreation;
    service.selectCandidate('B'); service.advance(); service.advance();
    assert.equal(service.finalize().success, true);
    assert.equal(service.queryOnboarding().step, 'INTRO_1');
    assert.equal(service.skipOnboarding().success, true);
    assert.equal(context.player.characterOnboardingStep, 'COMPLETE');
    assert.equal(context.player.assignedTasks.length, 1);
    assert.match(context.player.assignedTasks[0].title, /无法复现的 Bug/);
    const receipt = context.player.characterOnboardingTaskReceipt;
    assert.ok(receipt);
    assert.equal(service.skipOnboarding().success, true);
    assert.equal(context.player.assignedTasks.length, 1);

    context = createContext(storage, 987);
    assert.equal((context as any).characterCreation.queryOnboarding().step, 'COMPLETE');
    assert.equal((context as any).characterCreation.startOnboardingGame().success, true);
    assert.equal(context.player.characterOnboardingTaskReceipt, receipt);
    assert.equal(context.player.assignedTasks.length, 1);
  }],
  ['established role-less v13 save can backfill without blocking home or granting a starter kit', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('game-save', JSON.stringify({
      saveVersion: 13, salary: 1234, careerLevel: 4, cultivationExp: 900, profession: undefined,
      ownedTechniques: ['old-tech'], ownedEquipment: ['old-eq'], materials: { cons_coffee: 7 },
    }));
    const context = createContext(storage, 42);
    const service = (context as any).characterCreation;
    assert.equal(service.isNewCharacterCreationRequired(), false);
    assert.equal(context.player.salary, 1234);
    assert.equal(context.player.profession, undefined);
    assert.equal(service.query().draft.mode, 'BACKFILL');
    assert.equal(service.selectCandidate(service.query().draft.candidates[1].id).success, true);
    assert.equal(service.completeBackfill().success, true);
    assert.equal(context.player.characterSetupStatus, 'COMPLETE');
    assert.equal(context.player.salary, 1234);
    assert.equal(context.player.careerLevel, 4);
    assert.equal(context.player.profession, undefined);
    assert.deepEqual(context.player.ownedTechniques, ['old-tech']);
    assert.deepEqual(context.player.ownedEquipment, ['old-eq']);
    assert.equal(context.player.materials.cons_coffee, 7);
    assert.equal(context.player.characterCreationReceipt, undefined);
    assert.ok(context.player.characterBackfillReceipt);
  }],
];

for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

console.log('V5.9-A character creation service tests passed');
