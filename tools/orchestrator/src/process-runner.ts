import { spawn, execSync } from 'child_process';
import { AgentExecutionResult } from './types';
import { config } from './config';
import { log } from './logger';

/**
 * Find the full path to a CLI command on Windows (where) or Unix (which).
 */
export function findCommand(command: string): string | null {
  try {
    const result = execSync(
      process.platform === 'win32' ? `where ${command} 2>nul` : `which ${command} 2>/dev/null`,
      { encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const lines = result.trim().split(/\r?\n/);
    return lines[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check if a CLI command is available.
 */
export function commandExists(command: string): boolean {
  return findCommand(command) !== null;
}

/**
 * Windows-safe quote for arguments.
 */
function windowsQuote(value: string): string {
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value;
}

/**
 * Run an external process with proper Windows support.
 * - Uses shell:false by default (security)
 * - Handles .cmd/.bat/.ps1 on Windows via cmd.exe /d /s /c
 * - Captures stdout, stderr, exit code, duration
 * - Supports timeout and abort signal
 * - Kills process tree on Windows with taskkill if needed
 */
export function runProcess(
  command: string,
  args: string[] = [],
  options: {
    taskId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    input?: string;
    cwd?: string;
  } = {}
): Promise<AgentExecutionResult<never>> {
  const { taskId = 'PROCESS', timeoutMs, signal, input, cwd } = options;
  const timeout = timeoutMs || config.developerTimeoutMs;
  const workDir = cwd || config.root;

  return new Promise(resolve => {
    const started = Date.now();
    let out = '';
    let err = '';
    let timedOut = false;
    let done = false;

    const useCmd = process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(command);
    const child = useCmd
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].map(windowsQuote).join(' ')], {
          cwd: workDir, shell: false, windowsHide: true,
        })
      : spawn(command, args, {
          cwd: workDir, shell: false, windowsHide: true,
        });

    const finish = (r: AgentExecutionResult<never>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };

    child.stdout.on('data', (d: Buffer) => { out += d; });
    child.stderr.on('data', (d: Buffer) => { err += d; });

    child.on('error', (e: Error) => {
      finish({
        success: false, exitCode: null, timedOut: false,
        durationMs: Date.now() - started, stdout: out,
        stderr: String(e), errorKind: 'CLI_NOT_FOUND',
      });
    });

    child.on('close', (code: number | null) => {
      finish({
        success: code === 0 && !timedOut, exitCode: code, timedOut,
        durationMs: Date.now() - started, stdout: out, stderr: err,
        errorKind: code === 0 && !timedOut ? undefined : (timedOut ? 'TIMEOUT' : 'NONZERO_EXIT'),
      });
    });

    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid, taskId);
      finish({
        success: false, exitCode: null, timedOut: true,
        durationMs: Date.now() - started, stdout: out,
        stderr: 'Process timed out', errorKind: 'TIMEOUT',
      });
    }, timeout);

    signal?.addEventListener('abort', () => {
      killProcessTree(child.pid, taskId);
      finish({
        success: false, exitCode: null, timedOut: false,
        durationMs: Date.now() - started, stdout: out,
        stderr: 'Cancelled', errorKind: 'CANCELLED',
      });
    }, { once: true });

    child.on('close', () => {
      log(taskId, `process=${command} exit=${child.exitCode} duration=${Date.now() - started}ms`);
    });
  });
}

/**
 * Kill a process tree on Windows using taskkill, or just kill on Unix.
 */
function killProcessTree(pid: number | undefined, taskId: string): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { windowsHide: true, stdio: 'pipe' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (e) {
    log(taskId, `Failed to kill process tree pid=${pid}: ${e}`);
  }
}