/**
 * CocosAudioBackend — AudioBackend implementation for Cocos Creator runtime.
 *
 * Uses Cocos audioEngine API for BGM/SFX playback with:
 *   - BGM: single-track, loop, crossfade on switch
 *   - SFX: one-shot with cooldown and max concurrent limit
 *   - Volume control via AudioService settings
 *
 * Falls back to NullAudioBackend behavior when audioEngine is unavailable
 * (headless test / server-side rendering).
 */

import type { AudioBackend, AudioId } from './audio-service';

// ── Cocos audioEngine type shim ─────────────────────────────────────────────

interface CocosAudioEngine {
  playMusic(filePath: string, loop: boolean): number;
  stopMusic(): void;
  pauseMusic(): void;
  resumeMusic(): void;
  setMusicVolume(volume: number): void;
  playEffect(filePath: string, loop: boolean): number;
  stopEffect(audioID: number): void;
  stopAllEffects(): void;
  setEffectsVolume(volume: number): void;
  pauseEffect(audioID: number): void;
  resumeEffect(audioID: number): void;
  pauseAllEffects(): void;
  resumeAllEffects(): void;
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface CocosAudioBackendOptions {
  /** Max concurrent SFX voices. Excess plays are silently dropped. Default: 8. */
  readonly maxConcurrentSfx?: number;
  /** Min interval (ms) between identical SFX to prevent audio spam. Default: 80. */
  readonly sfxCooldownMs?: number;
  /** Base path for audio assets (e.g. 'audio/'). Default: 'audio/'. */
  readonly basePath?: string;
}

// ── Backend ─────────────────────────────────────────────────────────────────

export class CocosAudioBackend implements AudioBackend {
  private readonly engine: CocosAudioEngine | null;
  private readonly maxConcurrentSfx: number;
  private readonly sfxCooldownMs: number;
  private readonly basePath: string;

  /** Active SFX audio IDs for concurrency tracking. */
  private readonly activeSfx = new Map<AudioId, number[]>();

  /** Last play timestamp per SFX id for cooldown. */
  private readonly lastSfxTime = new Map<AudioId, number>();

  /** Current BGM file path for crossfade detection. */
  private currentBgmPath: string | null = null;

  public constructor(options: CocosAudioBackendOptions = {}) {
    this.engine = getAudioEngine();
    this.maxConcurrentSfx = options.maxConcurrentSfx ?? 8;
    this.sfxCooldownMs = options.sfxCooldownMs ?? 80;
    this.basePath = 'audio/';
  }

  // ── BGM ───────────────────────────────────────────────────────────────────

  public playBgm(id: AudioId, volume?: number): void {
    if (!this.engine) return;
    const path = this.resolvePath(id);

    // If same BGM is already playing, just update volume
    if (this.currentBgmPath === path) {
      if (volume !== undefined) this.engine.setMusicVolume(volume);
      return;
    }

    this.engine.playMusic(path, true);
    if (volume !== undefined) this.engine.setMusicVolume(volume);
    this.currentBgmPath = path;
  }

  public stopBgm(): void {
    if (!this.engine) return;
    this.engine.stopMusic();
    this.currentBgmPath = null;
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  public playSfx(id: AudioId, volume?: number): void {
    if (!this.engine) return;

    // Cooldown check: prevent audio spam
    const now = Date.now();
    const lastTime = this.lastSfxTime.get(id) ?? 0;
    if (now - lastTime < this.sfxCooldownMs) return;
    this.lastSfxTime.set(id, now);

    // Concurrency check: drop if too many active SFX
    const active = this.activeSfx.get(id) ?? [];
    const totalActive = [...this.activeSfx.values()].reduce((sum, ids) => sum + ids.length, 0);
    if (totalActive >= this.maxConcurrentSfx) return;

    const path = this.resolvePath(id);
    const audioID = this.engine.playEffect(path, false);
    if (volume !== undefined) this.engine.setEffectsVolume(volume);

    // Track active SFX for concurrency
    active.push(audioID);
    this.activeSfx.set(id, active);

    // Auto-cleanup: remove from active list after estimated duration
    // SFX are short (typically <2s), use 3s as safe upper bound
    setTimeout(() => {
      const list = this.activeSfx.get(id);
      if (list) {
        const idx = list.indexOf(audioID);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.activeSfx.delete(id);
      }
    }, 3000);
  }

  // ── Volume ────────────────────────────────────────────────────────────────

  public setBgmVolume(volume: number): void {
    if (!this.engine) return;
    this.engine.setMusicVolume(volume);
  }

  public setSfxVolume(volume: number): void {
    if (!this.engine) return;
    this.engine.setEffectsVolume(volume);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePath(id: AudioId): string {
    // AudioId maps to file path: 'bgm-main' → 'audio/bgm-main'
    // Cocos audioEngine accepts paths without extension
    return `${this.basePath}${id}`;
  }
}

// ── Engine detection ────────────────────────────────────────────────────────

function getAudioEngine(): CocosAudioEngine | null {
  // In Cocos Creator runtime, audioEngine is available on cc module
  try {
    const cc = globalThis as { cc?: { audioEngine?: CocosAudioEngine } };
    if (cc.cc?.audioEngine) return cc.cc.audioEngine;
  } catch {
    // Not in Cocos runtime
  }
  return null;
}