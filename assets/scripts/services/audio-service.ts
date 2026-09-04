/**
 * AudioService — platform-agnostic audio control.
 *
 * Provides a unified API for BGM and SFX playback that works across
 * Mock, Web, Desktop, and WeChat platforms. The actual audio backend
 * is injected via the AudioBackend interface.
 *
 * Audio state (enabled/disabled, volume) is driven by SettingsService.
 */

/** Audio clip identifier (maps to Cocos AudioClip or platform sound ID). */
export type AudioId = string;

/** Platform-specific audio backend. Implementations handle actual playback. */
export interface AudioBackend {
  playBgm(id: AudioId, volume?: number): void;
  stopBgm(): void;
  playSfx(id: AudioId, volume?: number): void;
  setBgmVolume(volume: number): void;
  setSfxVolume(volume: number): void;
}

/** No-op audio backend for headless/test environments. */
export class NullAudioBackend implements AudioBackend {
  public playBgm(): void { /* no-op */ }
  public stopBgm(): void { /* no-op */ }
  public playSfx(): void { /* no-op */ }
  public setBgmVolume(): void { /* no-op */ }
  public setSfxVolume(): void { /* no-op */ }
}

export interface AudioServiceOptions {
  readonly backend?: AudioBackend;
  readonly musicEnabled?: boolean;
  readonly sfxEnabled?: boolean;
  readonly bgmVolume?: number;
  readonly sfxVolume?: number;
}

export class AudioService {
  private readonly backend: AudioBackend;
  private musicEnabled: boolean;
  private sfxEnabled: boolean;
  private bgmVolume: number;
  private sfxVolume: number;
  private currentBgmId: AudioId | null = null;
  private disposed = false;

  public constructor(options: AudioServiceOptions = {}) {
    this.backend = options.backend ?? new NullAudioBackend();
    this.musicEnabled = options.musicEnabled ?? true;
    this.sfxEnabled = options.sfxEnabled ?? true;
    this.bgmVolume = options.bgmVolume ?? 1.0;
    this.sfxVolume = options.sfxVolume ?? 1.0;
  }

  // ── BGM ───────────────────────────────────────────────────────────────────

  /** Play a background music track. Replaces any currently playing BGM. */
  public playBgm(id: AudioId): void {
    if (this.disposed) return;
    this.currentBgmId = id;
    if (this.musicEnabled) {
      this.backend.playBgm(id, this.bgmVolume);
    }
  }

  /** Stop background music. */
  public stopBgm(): void {
    if (this.disposed) return;
    this.currentBgmId = null;
    this.backend.stopBgm();
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  /** Play a one-shot sound effect. */
  public playSfx(id: AudioId): void {
    if (this.disposed) return;
    if (this.sfxEnabled) {
      this.backend.playSfx(id, this.sfxVolume);
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  /** Enable or disable background music. */
  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.backend.stopBgm();
    } else if (this.currentBgmId) {
      this.backend.playBgm(this.currentBgmId, this.bgmVolume);
    }
  }

  /** Enable or disable sound effects. */
  public setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
  }

  /** Set BGM volume (0.0 to 1.0). */
  public setBgmVolume(volume: number): void {
    this.bgmVolume = clampVolume(volume);
    this.backend.setBgmVolume(this.bgmVolume);
  }

  /** Set SFX volume (0.0 to 1.0). */
  public setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
    this.backend.setSfxVolume(this.sfxVolume);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  public isMusicEnabled(): boolean { return this.musicEnabled; }
  public isSfxEnabled(): boolean { return this.sfxEnabled; }
  public getBgmVolume(): number { return this.bgmVolume; }
  public getSfxVolume(): number { return this.sfxVolume; }
  public getCurrentBgmId(): AudioId | null { return this.currentBgmId; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Dispose the audio service and release resources. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.backend.stopBgm();
    this.currentBgmId = null;
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.min(Math.max(value, 0), 1);
}