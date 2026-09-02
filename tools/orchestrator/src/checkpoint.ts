/**
 * Checkpoint — Crash recovery state persistence.
 * Each step writes checkpoint.json; on resume, orchestrator reads it.
 */
import fs from 'fs';
import { files } from './config';
import { CheckpointState } from './types';

export function readCheckpoint(): CheckpointState | null {
  if (!fs.existsSync(files.checkpoint)) return null;
  try {
    return JSON.parse(fs.readFileSync(files.checkpoint, 'utf8')) as CheckpointState;
  } catch {
    return null;
  }
}

export function writeCheckpoint(state: Partial<CheckpointState>): void {
  const existing = readCheckpoint();
  const merged: CheckpointState = {
    taskId: state.taskId ?? existing?.taskId ?? '',
    baseSha: state.baseSha ?? existing?.baseSha ?? '',
    currentSha: state.currentSha ?? existing?.currentSha ?? '',
    round: state.round ?? existing?.round ?? 0,
    phase: state.phase ?? existing?.phase ?? 1,
    startedAt: state.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
    lastAction: state.lastAction ?? existing?.lastAction ?? '',
    lastActionAt: state.lastActionAt ?? new Date().toISOString(),
    reviewRounds: state.reviewRounds ?? existing?.reviewRounds ?? 0,
    openaiCalls: state.openaiCalls ?? existing?.openaiCalls ?? 0,
    cursorCalls: state.cursorCalls ?? existing?.cursorCalls ?? 0,
  };
  fs.mkdirSync(require('path').dirname(files.checkpoint), { recursive: true });
  fs.writeFileSync(files.checkpoint, JSON.stringify(merged, null, 2));
}

export function clearCheckpoint(): void {
  if (fs.existsSync(files.checkpoint)) {
    fs.unlinkSync(files.checkpoint);
  }
}

export function updateCheckpointAction(action: string, extra?: Partial<CheckpointState>): void {
  writeCheckpoint({
    lastAction: action,
    lastActionAt: new Date().toISOString(),
    ...extra,
  });
}