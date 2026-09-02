/**
 * Manual Gate — Manages manual verification gates (e.g., Cocos runtime, Windows build).
 * Some tasks require human verification that cannot be automated.
 */
import fs from 'fs';
import { files } from './config';
import { PhaseState } from './types';
import { readPhase, writePhase } from './phase-gate';

/**
 * List all manual gates and their status.
 */
export function listGates(): Record<string, string> {
  const phase = readPhase();
  return { ...phase.manualGates };
}

/**
 * Pass a manual gate.
 */
export function passGate(gateName: string): PhaseState {
  const phase = readPhase();
  if (!(gateName in phase.manualGates)) {
    throw new Error(`Unknown gate: ${gateName}. Available: ${Object.keys(phase.manualGates).join(', ')}`);
  }
  phase.manualGates[gateName] = 'PASS';
  writePhase(phase);
  return phase;
}

/**
 * Fail a manual gate.
 */
export function failGate(gateName: string): PhaseState {
  const phase = readPhase();
  if (!(gateName in phase.manualGates)) {
    throw new Error(`Unknown gate: ${gateName}. Available: ${Object.keys(phase.manualGates).join(', ')}`);
  }
  phase.manualGates[gateName] = 'FAIL';
  writePhase(phase);
  return phase;
}

/**
 * Add a new manual gate (e.g., from a task that requires manual verification).
 */
export function addGate(gateName: string, status: 'PENDING' | 'PASS' | 'FAIL' = 'PENDING'): PhaseState {
  const phase = readPhase();
  phase.manualGates[gateName] = status;
  writePhase(phase);
  return phase;
}

/**
 * Check if all mandatory gates are passed.
 * Returns list of pending/failed gate names.
 */
export function pendingGates(): string[] {
  const phase = readPhase();
  return Object.entries(phase.manualGates)
    .filter(([, v]) => v !== 'PASS')
    .map(([k]) => k);
}

/**
 * Check if a specific gate is passed.
 */
export function isGatePassed(gateName: string): boolean {
  const phase = readPhase();
  return phase.manualGates[gateName] === 'PASS';
}