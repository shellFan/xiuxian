/**
 * Git Push with TLS fallback for Windows.
 * On Windows, git push can fail with SSL_ERROR_SYSCALL.
 * Retry once with GIT_SSL_BACKEND=schannel if TLS error detected.
 */
import { runCommand } from './command-runner';
import { config } from './config';
import { log } from './logger';

const TLS_ERROR_PATTERNS = [
  /SSL_ERROR_SYSCALL/i,
  /OpenSSL.*error/i,
  /TLS.*error/i,
  /schannel.*error/i,
  /certificate.*error/i,
  /security.*channel/i,
];

function isTlsError(stderr: string): boolean {
  return TLS_ERROR_PATTERNS.some(p => p.test(stderr));
}

export interface GitPushResult {
  success: boolean;
  pushed: boolean;
  localReviewOnly: boolean;
  error?: string;
  method?: 'direct' | 'schannel' | 'failed';
}

/**
 * Push current branch to remote with TLS fallback.
 * NEVER uses sslVerify=false or hardcoded tokens.
 */
export async function gitPush(taskId: string, remote: string = 'origin', branch?: string): Promise<GitPushResult> {
  // Get current branch if not specified
  const branchResult = await runCommand('git', ['branch', '--show-current'], taskId);
  const currentBranch = branch || (branchResult.success ? branchResult.stdout.trim() : '');
  if (!currentBranch) {
    return { success: false, pushed: false, localReviewOnly: true, error: 'Cannot determine current branch', method: 'failed' };
  }

  // First attempt: normal push
  log(taskId, `git push ${remote} ${currentBranch} (attempt 1)`);
  const result1 = await runCommand('git', ['push', remote, currentBranch], taskId);
  if (result1.success) {
    return { success: true, pushed: true, localReviewOnly: false, method: 'direct' };
  }

  // Check if TLS error
  const stderr = result1.stderr || '';
  if (config.gitSchannelRetry && isTlsError(stderr)) {
    log(taskId, `TLS error detected, retrying with schannel backend`);
    // Retry with schannel on Windows
    const env = { ...process.env, GIT_SSL_BACKEND: 'schannel' };
    const result2 = await runCommand('git', ['push', remote, currentBranch], taskId);
    // Note: runCommand doesn't support custom env yet; we use a workaround
    // For now, we set the env var and retry
    try {
      process.env.GIT_SSL_BACKEND = 'schannel';
      const result3 = await runCommand('git', ['push', remote, currentBranch], taskId);
      delete process.env.GIT_SSL_BACKEND;
      if (result3.success) {
        return { success: true, pushed: true, localReviewOnly: false, method: 'schannel' };
      }
      delete process.env.GIT_SSL_BACKEND;
    } catch {
      delete process.env.GIT_SSL_BACKEND;
    }

    return {
      success: false, pushed: false, localReviewOnly: true,
      error: `Push failed after TLS retry: ${stderr}`,
      method: 'failed',
    };
  }

  // Non-TLS error
  return {
    success: false, pushed: false, localReviewOnly: true,
    error: `Push failed: ${stderr}`,
    method: 'failed',
  };
}

/**
 * Get current git HEAD SHA.
 */
export async function getHeadSha(taskId: string = 'GIT'): Promise<string> {
  const result = await runCommand('git', ['rev-parse', 'HEAD'], taskId);
  if (!result.success) throw new Error(`Failed to get HEAD SHA: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Get current branch name.
 */
export async function getCurrentBranch(taskId: string = 'GIT'): Promise<string> {
  const result = await runCommand('git', ['branch', '--show-current'], taskId);
  if (!result.success) throw new Error(`Failed to get branch: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Check if working tree is clean.
 */
export async function isWorkingTreeClean(taskId: string = 'GIT'): Promise<boolean> {
  const result = await runCommand('git', ['status', '--porcelain'], taskId);
  return result.success && result.stdout.trim() === '';
}