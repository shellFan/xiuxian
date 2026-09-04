/**
 * NumberFormatter tests — verify consistent number formatting for UI.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatProgress, formatPercent, formatDuration, formatTimestamp } from '../../assets/scripts/ui/number-formatter';

test('formatNumber: small numbers', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(9999), '9999');
});

test('formatNumber: 万 range', () => {
  assert.equal(formatNumber(10000), '1.0万');
  assert.equal(formatNumber(153000), '15.3万');
  assert.equal(formatNumber(9999999), '1000.0万');
});

test('formatNumber: 亿 range', () => {
  assert.equal(formatNumber(100000000), '1.0亿');
  assert.equal(formatNumber(1230000000), '12.3亿');
});

test('formatNumber: edge cases', () => {
  assert.equal(formatNumber(-1), '0');
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber(Infinity), '0');
});

test('formatProgress', () => {
  assert.equal(formatProgress(2, 5), '2/5');
  assert.equal(formatProgress(0, 10), '0/10');
});

test('formatPercent', () => {
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.5), '50%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(1.5), '100%');
  assert.equal(formatPercent(-0.1), '0%');
  assert.equal(formatPercent(NaN), '0%');
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0秒');
  assert.equal(formatDuration(30), '30秒');
  assert.equal(formatDuration(90), '1分30秒');
  assert.equal(formatDuration(120), '2分');
  assert.equal(formatDuration(3600), '1小时');
  assert.equal(formatDuration(3660), '1小时1分');
  assert.equal(formatDuration(-1), '0秒');
  assert.equal(formatDuration(NaN), '0秒');
});

test('formatTimestamp', () => {
  // Jan 1, 2024 08:30 UTC
  const ts = new Date('2024-01-15T08:30:00Z').getTime();
  const result = formatTimestamp(ts);
  assert.ok(result.includes('/'));
  assert.ok(result.includes(':'));
  assert.equal(formatTimestamp(0), '-');
  assert.equal(formatTimestamp(-1), '-');
  assert.equal(formatTimestamp(NaN), '-');
});