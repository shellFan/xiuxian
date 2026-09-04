/**
 * SettingsService — persistent user settings with save/load.
 *
 * Manages audio, vibration, performance, language, and analytics consent.
 * Settings are persisted via StorageAdapter and loaded on construction.
 */

import type { StorageAdapter } from './storage-adapter';

export interface GameSettings {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  vibrationEnabled: boolean;
  performanceMode: boolean;
  language: string;
  analyticsConsent: boolean;
}

const SETTINGS_KEY = 'game-settings';

const DEFAULT_SETTINGS: GameSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  vibrationEnabled: true,
  performanceMode: false,
  language: 'zh-CN',
  analyticsConsent: false,
};

export class SettingsService {
  private settings: GameSettings;

  public constructor(private readonly storage: StorageAdapter) {
    this.settings = this.loadFromStorage();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  public get musicEnabled(): boolean { return this.settings.musicEnabled; }
  public get sfxEnabled(): boolean { return this.settings.sfxEnabled; }
  public get vibrationEnabled(): boolean { return this.settings.vibrationEnabled; }
  public get performanceMode(): boolean { return this.settings.performanceMode; }
  public get language(): string { return this.settings.language; }
  public get analyticsConsent(): boolean { return this.settings.analyticsConsent; }

  /** Get a readonly copy of all settings. */
  public getAll(): Readonly<GameSettings> { return { ...this.settings }; }

  // ── Setters (each persists immediately) ───────────────────────────────────

  public setMusicEnabled(value: boolean): void {
    this.settings.musicEnabled = value;
    this.persist();
  }

  public setSfxEnabled(value: boolean): void {
    this.settings.sfxEnabled = value;
    this.persist();
  }

  public setVibrationEnabled(value: boolean): void {
    this.settings.vibrationEnabled = value;
    this.persist();
  }

  public setPerformanceMode(value: boolean): void {
    this.settings.performanceMode = value;
    this.persist();
  }

  public setLanguage(value: string): void {
    if (typeof value !== 'string' || value.trim() === '') return;
    this.settings.language = value;
    this.persist();
  }

  public setAnalyticsConsent(value: boolean): void {
    this.settings.analyticsConsent = value;
    this.persist();
  }

  /** Reset all settings to defaults. */
  public resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.persist();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private persist(): void {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Settings persistence failure must not crash the game
    }
  }

  private loadFromStorage(): GameSettings {
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : DEFAULT_SETTINGS.musicEnabled,
        sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : DEFAULT_SETTINGS.sfxEnabled,
        vibrationEnabled: typeof parsed.vibrationEnabled === 'boolean' ? parsed.vibrationEnabled : DEFAULT_SETTINGS.vibrationEnabled,
        performanceMode: typeof parsed.performanceMode === 'boolean' ? parsed.performanceMode : DEFAULT_SETTINGS.performanceMode,
        language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_SETTINGS.language,
        analyticsConsent: typeof parsed.analyticsConsent === 'boolean' ? parsed.analyticsConsent : DEFAULT_SETTINGS.analyticsConsent,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}