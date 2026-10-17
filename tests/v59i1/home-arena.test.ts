import assert from 'node:assert/strict';
import { FakeClock } from '../../assets/scripts/core/clock';
import { GameFacade } from '../../assets/scripts/facade/game-facade';
import { MemoryStorageAdapter } from '../../assets/scripts/services/storage-adapter';
import { HOME_STAGES } from '../../assets/scripts/v59i1/home-arena-service';
import { SaveService } from '../../assets/scripts/services/save-service';

const epoch = Date.parse('2026-09-21T09:00:00+08:00');
class FailingStorage extends MemoryStorageAdapter {
  fail = false;
  override setItem(key: string, value: string): void { if (this.fail && key === 'game-save') throw new Error('DISK_FULL'); super.setItem(key, value); }
}
function make(storage = new MemoryStorageAdapter()) {
  const clock = new FakeClock(epoch);
  const f = new GameFacade({ clock, storage, board: null, characterSeedProvider: () => 5911, homeArenaSeed: 5911 });
  if (f.queryCharacterCreation().isNewCharacterCreationRequired) {
    f.characterCreationSelectIndustry('INTERNET'); f.characterCreationAdvance();
    f.characterCreationSelectDirection('TECH_RND'); f.characterCreationAdvance();
    f.characterCreationSelectProfession('JAVA_BACKEND'); f.characterCreationAdvance();
    f.characterCreationSelectSect('BIG_TECH'); f.characterCreationAdvance();
    f.characterCreationSetIdentity('点击剑修', 'avatar-1'); f.characterCreationSetBackground('ORDINARY_WORKER'); f.characterCreationAdvance();
    f.characterCreationSelectCandidate('A'); f.characterCreationAdvance(); f.characterCreationAdvance();
    assert.equal(f.characterCreationFinalize().success, true);
    f.characterCreationSkipOnboarding();
  }
  f.setHomeArenaActive(true);
  return { f, clock, storage };
}
const made = make();
const { f, clock, storage } = made;
let v = f.queryHomeArena();
assert.equal(v.stage, 1); assert.equal(v.enemy.hp, 30);
const initialSalary = f.snapshot().salary;
let seq = 0;
function click() {
  clock.advance(400);
  const view = f.queryHomeArena();
  return f.attackHomeArena(view.enemy.id, 'test-' + (++seq));
}
const first = click();
assert.ok(first.ok && first.hit!.damage >= 10);
const hp = f.queryHomeArena().enemy.hp;
assert.equal(f.attackHomeArena(first.hit!.enemyId, 'test-1').ok, false, 'duplicate requests cannot deal damage twice');
assert.equal(f.queryHomeArena().enemy.hp, hp);
const durations: number[] = [];
for (let stage = 1; stage <= 5; stage++) {
  const started = clock.now();
  let guard = 0;
  while (!f.queryHomeArena().complete && f.queryHomeArena().stage === stage && guard++ < 1000) {
    click();
    f.context.homeArena.tick(0.4);
    const view = f.queryHomeArena();
    if (view.skillUnlocked && view.skillRemainingMs === 0) {
      const skill = f.castHomeArenaStorm('skill-' + seq);
      assert.ok(skill.ok);
      assert.equal(f.castHomeArenaStorm('duplicate-skill-' + seq).ok, false, 'cooldown blocks repeated skill casts');
    }
  }
  assert.ok(guard < 1000, 'stage must be reachable');
  durations.push((clock.now() - started) / 1000);
  const current = f.queryHomeArena();
  assert.equal(current.clearedStages[stage - 1], true);
  if (stage === 2) assert.equal(current.autoUnlocked, true);
  if (stage === 3) assert.equal(current.skillUnlocked, true);
  if (stage === 3) {
    if (current.skillRemainingMs === 0) {
      const cast = f.castHomeArenaStorm('restart-cooldown'); assert.ok(cast.ok);
      assert.ok(cast.hits!.every(h => h.damage > 0 && h.damage <= current.attack));
    }
    const mirror = new GameFacade({ clock, storage, board: null }); mirror.setHomeArenaActive(true);
    assert.ok(mirror.queryHomeArena().skillRemainingMs > 0, 'cooldown persists through restart');
    assert.equal(mirror.castHomeArenaStorm('restart-bypass').ok, false);
    assert.deepEqual(mirror.queryHomeArena().rewards, f.queryHomeArena().rewards);
    mirror.destroy();
  }
}
v = f.queryHomeArena();
assert.equal(HOME_STAGES.length, 5);
assert.equal(v.complete, true);
assert.ok(v.metrics.crits > 0 && v.metrics.maxCombo >= 5 && v.metrics.autoAttacks > 0 && v.metrics.skillUses > 0);
assert.ok(f.context.player.materials.mat_bug_crystal >= 3, 'elite drops a real usable material');
assert.equal(f.snapshot().salary, initialSalary, 'combat never generates wage money');
assert.ok(durations[0] >= 15 && durations[0] <= 25, JSON.stringify(durations));
f.save();
const before = f.queryHomeArena();
f.destroy();
const loaded = make(storage);
assert.equal(loaded.f.queryHomeArena().complete, true);
assert.deepEqual(loaded.f.queryHomeArena().rewards, before.rewards);
assert.equal(loaded.f.queryHomeArena().metrics.skillUses, before.metrics.skillUses);
const rewards = JSON.stringify(loaded.f.queryHomeArena().rewards);
loaded.f.replayHomeArena();
const beforeCatchup = loaded.f.queryHomeArena().metrics.autoAttacks;
loaded.clock.advance(3600000);
for (let i = 0; i < 3600; i++) loaded.f.context.homeArena.tick(1);
assert.ok(loaded.f.queryHomeArena().metrics.autoAttacks - beforeCatchup <= 1, 'loop catch-up cannot turn one resumed frame into offline combat farming');
for (let i = 0; i < 4; i++) { loaded.clock.advance(400); const target = loaded.f.queryHomeArena().enemy.id; loaded.f.attackHomeArena(target, 'replay-' + i); }
assert.equal(JSON.stringify(loaded.f.queryHomeArena().rewards), rewards, 'replaying first kills cannot duplicate drops');
loaded.f.setHomeArenaActive(false);
const pausedHp = loaded.f.queryHomeArena().enemy.hp;
loaded.f.context.homeArena.tick(1000);
assert.equal(loaded.f.queryHomeArena().enemy.hp, pausedHp, 'inactive arenas do not farm offline');
assert.equal(JSON.stringify(loaded.f.queryHomeArena().rewards), rewards);
loaded.f.destroy();
const failedStorage = new FailingStorage();
const failureCase = make(failedStorage);
for (let i = 0; i < 2; i++) { failureCase.clock.advance(400); failureCase.f.attackHomeArena(failureCase.f.queryHomeArena().enemy.id, 'pre-fail-' + i); }
const beforeFailure = failureCase.f.queryHomeArena();
const beforeExp = failureCase.f.snapshot().cultivationExp;
failedStorage.fail = true; failureCase.clock.advance(400);
assert.throws(() => failureCase.f.attackHomeArena(beforeFailure.enemy.id, 'failed-kill'), /DISK_FULL/);
assert.equal(failureCase.f.queryHomeArena().enemy.hp, beforeFailure.enemy.hp);
assert.deepEqual(failureCase.f.queryHomeArena().rewards, beforeFailure.rewards);
assert.equal(failureCase.f.snapshot().cultivationExp, beforeExp);
failedStorage.fail = false;
assert.equal(failureCase.f.attackHomeArena(beforeFailure.enemy.id, 'failed-kill').ok, true, 'same input can retry a rolled-back transaction');
const stale = failureCase.f.attackHomeArena(beforeFailure.enemy.id, 'stale-target');
assert.equal(stale.ok, false, 'a late callback cannot hit the next spawned enemy');
failureCase.f.destroy();
const corrupted = JSON.parse(storage.getItem('game-save')!);
corrupted.homeArena.hp = -1;
const brokenStorage = new MemoryStorageAdapter();
brokenStorage.setItem('game-save', JSON.stringify(corrupted));
assert.throws(() => new SaveService(brokenStorage).load(), /SAVE_LOAD_FAILED/, 'invalid campaign must fail closed instead of resetting reward receipts');
console.log('V59I1 home arena passed; stage seconds:', durations);
