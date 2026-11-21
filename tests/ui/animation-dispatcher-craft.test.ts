import assert from 'node:assert/strict';

import {
  AnimationDispatcher,
  DEFAULT_ANIMATION_TRIGGERS,
} from '../../assets/scripts/ui/animation-dispatcher';
import type { AudioService, AudioId } from '../../assets/scripts/services/audio-service';
import type { GameFacade } from '../../assets/scripts/facade/game-facade';
import type { UiEventCategory } from '../../assets/scripts/facade/ui-event-types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** 录音后端替身：记录 playSfx 调用序列。 */
class RecordingAudio {
  public readonly played: AudioId[] = [];
  public playSfx(id: AudioId): void { this.played.push(id); }
  public playBgm(): void { /* not under test */ }
  public stopBgm(): void { /* not under test */ }
  public setBgmVolume(): void { /* not under test */ }
  public setSfxVolume(): void { /* not under test */ }
}

/** 最小 facade 替身：按分类捕获 onUiEvent 订阅（真实 facade 每类只收到自己分类的事件）。 */
function createFacadeStub(): { facade: GameFacade; emit: (source: string, detail: unknown, category?: UiEventCategory) => void } {
  const byCategory = new Map<UiEventCategory, Array<(event: { source: string; detail?: unknown }) => void>>();
  const facade = {
    onUiEvent(category: UiEventCategory, handler: (event: { source: string; detail?: unknown }) => void) {
      const list = byCategory.get(category) ?? [];
      list.push(handler);
      byCategory.set(category, list);
      return () => { /* unsub no-op */ };
    },
  } as unknown as GameFacade;
  return {
    facade,
    emit: (source: string, detail: unknown, category: UiEventCategory = 'STATE_CHANGED') => {
      for (const handler of byCategory.get(category) ?? []) handler({ source, detail });
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testDefaultTriggersIncludeCraftAudio(): void {
  const success = DEFAULT_ANIMATION_TRIGGERS.find((t) => t.id === 'craft_success');
  const failed = DEFAULT_ANIMATION_TRIGGERS.find((t) => t.id === 'craft_failed');
  assert.ok(success, 'craft_success trigger must exist (V11-S2 itemCrafted)');
  assert.equal(success.sourceEvent, 'itemCrafted');
  assert.equal(success.audioId, 'ui_success');
  assert.ok(failed, 'craft_failed trigger must exist (V11-S2 itemCraftFailed)');
  assert.equal(failed.sourceEvent, 'itemCraftFailed');
  assert.equal(failed.audioId, 'ui_fail');
  console.log('✔ AnimationDispatcher: craft success/fail triggers wired to audio');
}

function testDispatchPlaysCraftSfx(): void {
  const { facade, emit } = createFacadeStub();
  const audio = new RecordingAudio();
  const dispatcher = new AnimationDispatcher(facade, audio as unknown as AudioService);
  dispatcher.loadTriggers(DEFAULT_ANIMATION_TRIGGERS);
  dispatcher.start();

  emit('craft-page', { type: 'itemCrafted' });
  emit('craft-page', { type: 'itemCraftFailed' });
  assert.deepEqual(audio.played, ['ui_success', 'ui_fail']);
  console.log('✔ AnimationDispatcher: itemCrafted/itemCraftFailed events play craft SFX');
}

function testReducedMotionStillPlaysAudio(): void {
  const { facade, emit } = createFacadeStub();
  const audio = new RecordingAudio();
  const dispatcher = new AnimationDispatcher(facade, audio as unknown as AudioService);
  dispatcher.loadTriggers(DEFAULT_ANIMATION_TRIGGERS);
  dispatcher.start();
  dispatcher.setReducedMotion(true);

  let callbackFired = 0;
  dispatcher.registerCallback('craft recipe list', () => { callbackFired += 1; });
  emit('craft-page', { type: 'itemCrafted' });
  assert.deepEqual(audio.played, ['ui_success'], 'audio must play in reduced-motion mode');
  assert.equal(callbackFired, 0, 'visual callbacks must be skipped in reduced-motion mode');
  console.log('✔ AnimationDispatcher: reduced-motion skips visuals but keeps audio');
}

function testDisposeStopsPlayback(): void {
  const { facade, emit } = createFacadeStub();
  const audio = new RecordingAudio();
  const dispatcher = new AnimationDispatcher(facade, audio as unknown as AudioService);
  dispatcher.loadTriggers(DEFAULT_ANIMATION_TRIGGERS);
  dispatcher.start();
  dispatcher.dispose();
  emit('craft-page', { type: 'itemCrafted' });
  assert.deepEqual(audio.played, []);
  console.log('✔ AnimationDispatcher: dispose stops all dispatching');
}

// ── Run ─────────────────────────────────────────────────────────────────────

const tests: Array<() => void> = [
  testDefaultTriggersIncludeCraftAudio,
  testDispatchPlaysCraftSfx,
  testReducedMotionStillPlaysAudio,
  testDisposeStopsPlayback,
];

for (const test of tests) test();
console.log(`\nAnimationDispatcher craft audio: ${tests.length}/${tests.length} tests passed`);
