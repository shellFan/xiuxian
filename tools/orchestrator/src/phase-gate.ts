/**
 * Phase Gate — Manages project phases with manual approval gates.
 * Prevents automatic progression to the next phase without human approval.
 */
import fs from 'fs';
import { files } from './config';
import { PhaseState } from './types';

const DEFAULT_PHASE: PhaseState = {
  currentPhase: 3,
  status: 'IN_PROGRESS',
  manualGates: {
    cocosRuntime: 'PENDING',
    windowsBuild: 'PENDING',
    wechatPreview: 'PENDING',
  },
};

export function readPhase(): PhaseState {
  if (!fs.existsSync(files.phase)) return { ...DEFAULT_PHASE };
  try {
    return JSON.parse(fs.readFileSync(files.phase, 'utf8')) as PhaseState;
  } catch {
    return { ...DEFAULT_PHASE };
  }
}

export function writePhase(state: PhaseState): void {
  fs.mkdirSync(require('path').dirname(files.phase), { recursive: true });
  fs.writeFileSync(files.phase, JSON.stringify(state, null, 2));
}

/**
 * Check if a phase is complete and ready for approval.
 */
export function isPhaseCompletePending(state?: PhaseState): boolean {
  const s = state || readPhase();
  return s.status === 'COMPLETE_PENDING_APPROVAL';
}

/**
 * Check if a phase is fully complete (approved).
 */
export function isPhaseComplete(state?: PhaseState): boolean {
  const s = state || readPhase();
  return s.status === 'COMPLETE';
}

/**
 * Mark the current phase as complete pending approval.
 * The planner must not proceed to the next phase until approved.
 */
export function requestPhaseApproval(): PhaseState {
  const state = readPhase();
  state.status = 'COMPLETE_PENDING_APPROVAL';
  writePhase(state);
  return state;
}

/**
 * Approve the current phase and advance to the next.
 */
export function approvePhase(approvedBy: string = 'user'): PhaseState {
  const state = readPhase();
  state.status = 'COMPLETE';
  state.approvedBy = approvedBy;
  state.approvedAt = new Date().toISOString();

  // Check if all mandatory gates are passed
  const pendingGates = Object.entries(state.manualGates)
    .filter(([, v]) => v === 'PENDING')
    .map(([k]) => k);

  if (pendingGates.length > 0) {
    throw new Error(`Cannot approve phase: mandatory gates still pending: ${pendingGates.join(', ')}`);
  }

  // Advance to next phase
  state.currentPhase += 1;
  state.status = 'NOT_STARTED';
  state.approvedBy = undefined;
  state.approvedAt = undefined;

  writePhase(state);
  return state;
}

/**
 * Start the current phase (mark as IN_PROGRESS).
 */
export function startPhase(): PhaseState {
  const state = readPhase();
  if (state.status === 'IN_PROGRESS') return state;
  state.status = 'IN_PROGRESS';
  writePhase(state);
  return state;
}

/**
 * Get a summary of the current phase state.
 */
export function phaseSummary(state?: PhaseState): string {
  const s = state || readPhase();
  const gates = Object.entries(s.manualGates)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return `Phase ${s.currentPhase} [${s.status}] Gates: {${gates}}`;
}