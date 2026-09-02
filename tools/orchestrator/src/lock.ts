/**
 * Lock mechanism — Prevents concurrent orchestrator instances.
 * Uses a file-based lock with PID and hostname.
 */
import fs from 'fs';
import os from 'os';
import { files } from './config';
import { OrchestratorLock } from './types';

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}

function readLock(): OrchestratorLock | null {
  if (!fs.existsSync(files.lock)) return null;
  try {
    return JSON.parse(fs.readFileSync(files.lock, 'utf8')) as OrchestratorLock;
  } catch {
    return null;
  }
}

/**
 * Acquire the orchestrator lock. Returns true if acquired, false if another instance is running.
 * Stale locks (dead PID) are automatically cleaned up.
 */
export function acquireLock(): boolean {
  const existing = readLock();
  if (existing) {
    if (isProcessRunning(existing.pid)) {
      console.error(`Orchestrator already running: PID ${existing.pid} on ${existing.hostname}, started ${existing.startedAt}`);
      return false;
    }
    // Stale lock — clean up
    console.log(`Removing stale lock from PID ${existing.pid} (process dead)`);
    releaseLock();
  }

  const lock: OrchestratorLock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname(),
  };

  fs.mkdirSync(require('path').dirname(files.lock), { recursive: true });
  fs.writeFileSync(files.lock, JSON.stringify(lock, null, 2));
  return true;
}

/**
 * Release the orchestrator lock.
 */
export function releaseLock(): void {
  if (fs.existsSync(files.lock)) {
    const existing = readLock();
    // Only release our own lock
    if (existing && existing.pid === process.pid) {
      fs.unlinkSync(files.lock);
    } else if (existing && !isProcessRunning(existing.pid)) {
      // Stale lock — safe to remove
      fs.unlinkSync(files.lock);
    }
  }
}

/**
 * Check lock status without acquiring.
 */
export function lockStatus(): { exists: boolean; stale: boolean; pid?: number; hostname?: string; startedAt?: string } {
  const existing = readLock();
  if (!existing) return { exists: false, stale: false };
  if (!isProcessRunning(existing.pid)) return { exists: true, stale: true };
  return { exists: true, stale: false, pid: existing.pid, hostname: existing.hostname, startedAt: existing.startedAt };
}