/**
 * NumberFormatter — consistent number formatting for Phase 5 UI.
 *
 * Rules (from NUMBER-FORMAT.md):
 *   - < 10,000: display as-is (e.g., 9999)
 *   - >= 10,000 and < 100,000,000: display as "X.X万" (e.g., 1.2万, 15.3万)
 *   - >= 100,000,000: display as "X.X亿" (e.g., 1.2亿)
 *   - Decimals: 1 digit for 万/亿, no decimals for raw numbers
 *   - Zero/negative: display as "0"
 *
 * This is a pure utility with no dependencies — safe for headless tests.
 */

/** Format a number for display in the UI. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value >= 1e8) {
    return `${(value / 1e8).toFixed(1)}亿`;
  }
  if (value >= 1e4) {
    return `${(value / 1e4).toFixed(1)}万`;
  }
  return Math.floor(value).toString();
}

/** Format a number with a slash separator (e.g., "2/5" for progress). */
export function formatProgress(current: number, total: number): string {
  return `${current}/${total}`;
}

/** Format a percentage (0.0-1.0 → "0%"-"100%"). */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0%';
  const percent = Math.min(Math.max(ratio, 0), 1) * 100;
  return `${Math.round(percent)}%`;
}

/** Format a duration in seconds to a human-readable string. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0秒';
  if (seconds < 60) return `${Math.floor(seconds)}秒`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
}

/** Format a timestamp (ms since epoch) to a short date string. */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const date = new Date(ms);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}