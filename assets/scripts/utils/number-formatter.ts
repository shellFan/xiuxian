/**
 * NumberFormatter — locale-aware number formatting for UI display.
 *
 * Supports both Western (K/M/B) and Chinese (万/亿) conventions.
 * The locale is determined by SettingsService.language.
 */

export type NumberFormatLocale = 'zh-CN' | 'en-US' | 'ja-JP';

export interface NumberFormatterOptions {
  readonly locale?: NumberFormatLocale;
  readonly maxDecimals?: number;
}

export class NumberFormatter {
  private readonly locale: NumberFormatLocale;
  private readonly maxDecimals: number;

  public constructor(options: NumberFormatterOptions = {}) {
    this.locale = options.locale ?? 'zh-CN';
    this.maxDecimals = options.maxDecimals ?? 2;
  }

  /**
   * Format a number with locale-appropriate abbreviations.
   * zh-CN: 万 (10^4), 亿 (10^8)
   * en-US: K (10^3), M (10^6), B (10^9)
   * ja-JP: 万 (10^4), 億 (10^8)
   */
  public formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (value < 0) return '-' + this.formatNumber(-value);

    switch (this.locale) {
      case 'zh-CN':
      case 'ja-JP':
        return this.formatChinese(value);
      case 'en-US':
        return this.formatWestern(value);
      default:
        return this.formatChinese(value);
    }
  }

  /** Format as percentage (0-100). */
  public formatPercent(value: number): string {
    if (!Number.isFinite(value)) return '0%';
    const percent = Math.min(Math.max(value, 0), 100);
    return `${this.trimDecimals(percent)}%`;
  }

  /** Format a duration in seconds to human-readable string. */
  public formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0秒';
    if (seconds < 60) return `${Math.floor(seconds)}秒`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}时${minutes}分` : `${hours}时`;
  }

  /** Format salary with currency symbol. */
  public formatSalary(salary: number): string {
    return `¥${this.formatNumber(salary)}`;
  }

  /** Format cultivation experience. */
  public formatCultivation(exp: number): string {
    return this.formatNumber(exp);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private formatChinese(value: number): string {
    const yi = 1e8;   // 亿
    const wan = 1e4;  // 万

    if (value >= yi) {
      return this.trimDecimals(value / yi) + '亿';
    }
    if (value >= wan) {
      return this.trimDecimals(value / wan) + '万';
    }
    return this.trimDecimals(value);
  }

  private formatWestern(value: number): string {
    const b = 1e9;
    const m = 1e6;
    const k = 1e3;

    if (value >= b) {
      return this.trimDecimals(value / b) + 'B';
    }
    if (value >= m) {
      return this.trimDecimals(value / m) + 'M';
    }
    if (value >= k) {
      return this.trimDecimals(value / k) + 'K';
    }
    return this.trimDecimals(value);
  }

  private trimDecimals(value: number): string {
    const fixed = value.toFixed(this.maxDecimals);
    // Remove trailing zeros after decimal point
    return fixed.replace(/\.?0+$/, '');
  }
}

/** Singleton default formatter (zh-CN). */
export const defaultFormatter = new NumberFormatter();

/** Convenience function using the default formatter. */
export function formatNumber(value: number): string {
  return defaultFormatter.formatNumber(value);
}

export function formatPercent(value: number): string {
  return defaultFormatter.formatPercent(value);
}

export function formatDuration(seconds: number): string {
  return defaultFormatter.formatDuration(seconds);
}

export function formatSalary(salary: number): string {
  return defaultFormatter.formatSalary(salary);
}