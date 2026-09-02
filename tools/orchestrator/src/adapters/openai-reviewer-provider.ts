/**
 * OpenAIReviewerProvider — Uses OpenAI API for independent code review.
 * Reads real git diff, changed files, test/build output — never trusts developer self-report.
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, root } from '../config';
import { callOpenAI, parseJSON } from '../openai-client';
import { recordCall } from '../budget-tracker';
import { buildReviewerContext } from '../context-builder';
import { validateReview } from '../schema-validator';
import { log } from '../logger';
import { redactSecrets, checkDiffForSecrets } from '../secret-redactor';
import { detectDangerousFiles, isDiffTooLarge } from '../dangerous-diff';
import {
  ReviewerAdapter, Task, AgentExecutionResult, Review,
  ReviewFinding, ReviewVerdict, FindingSeverity,
} from '../types';

const REVIEWER_PROMPT_PATH = path.join(dirs.prompts, 'openai-reviewer-system.md');

function readReviewerSystemPrompt(): string {
  if (fs.existsSync(REVIEWER_PROMPT_PATH)) {
    return fs.readFileSync(REVIEWER_PROMPT_PATH, 'utf8');
  }
  return 'You are an independent code reviewer. Review the code changes and output a structured JSON review.';
}

/**
 * Read key file contents for reviewer context.
 */
function readKeyFiles(changedFiles: string[]): Record<string, string> {
  const keyFiles: Record<string, string> = {};
  const maxFiles = 20;
  const maxChars = 5000;

  for (const file of changedFiles.slice(0, maxFiles)) {
    const fullPath = path.join(root, file);
    try {
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (stat.size > 100000) {
        keyFiles[file] = `[File too large: ${stat.size} bytes]`;
        continue;
      }
      if (stat.isDirectory()) continue;
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.length > maxChars) {
        content = content.slice(0, maxChars) + '\n... [truncated]';
      }
      keyFiles[file] = content;
    } catch { /* skip unreadable */ }
  }
  return keyFiles;
}

/**
 * Run orchestrator's own test/build verification.
 * Does not trust developer's reported results.
 */
async function runOwnVerification(task: Task): Promise<{ testOutput: string; buildOutput: string; testsPassed: boolean; buildPassed: boolean }> {
  let testOutput = '(not run)';
  let buildOutput = '(not run)';
  let testsPassed = false;
  let buildPassed = false;

  const { runCommand } = await import('../command-runner');

  // Run tests
  if (task.commands.test) {
    try {
      const testResult = await runCommand('npm', ['test'], task.id);
      testOutput = testResult.stdout.slice(0, 5000);
      testsPassed = testResult.success;
    } catch (e) {
      testOutput = `Test error: ${e}`;
    }
  }

  // Run build
  if (task.commands.build) {
    try {
      const buildResult = await runCommand('npm', ['run', 'build'], task.id);
      buildOutput = buildResult.stdout.slice(0, 5000);
      buildPassed = buildResult.success;
    } catch (e) {
      buildOutput = `Build error: ${e}`;
    }
  }

  return { testOutput, buildOutput, testsPassed, buildPassed };
}

export class OpenAIReviewerProvider implements ReviewerAdapter {
  async review(
    task: Task,
    context: string,
    round: number,
    signal?: AbortSignal,
  ): Promise<AgentExecutionResult<Review>> {
    const taskId = task.id;
    const started = Date.now();

    log(taskId, `Starting OpenAI Reviewer round ${round}`);

    // Get real git diff
    let diff = '';
    let changedFiles: string[] = [];
    let baseSha = '';
    let headSha = '';

    try {
      const { runCommand } = await import('../command-runner');
      const headResult = await runCommand('git', ['rev-parse', 'HEAD'], taskId);
      headSha = headResult.success ? headResult.stdout.trim() : 'unknown';

      const diffResult = await runCommand('git', ['diff', '--stat'], taskId);
      if (diffResult.success) {
        // Get file list
        const statLines = diffResult.stdout.trim().split('\n');
        changedFiles = statLines
          .filter(l => l.includes('|'))
          .map(l => l.split('|')[0].trim())
          .filter(f => f && !f.startsWith('ai/'));

        // Get actual diff
        const patchResult = await runCommand('git', ['diff', `--unified=${config.reviewContextLines}`], taskId);
        diff = patchResult.success ? patchResult.stdout : '(diff unavailable)';
      }
    } catch (e) {
      log(taskId, `Git diff error: ${e}`);
      diff = '(diff unavailable)';
    }

    // Pre-review safety checks
    // 1. Secret detection
    const secretCheck = checkDiffForSecrets(diff);
    if (secretCheck.hasSecret) {
      log(taskId, `BLOCKER: Secrets detected in diff: ${secretCheck.findings.join(', ')}`);
      const review: Review = {
        taskId, result: 'REQUEST_CHANGES', summary: 'Secrets detected in code changes',
        blocker: [`Secret patterns detected: ${secretCheck.findings.join(', ')}`],
        high: [], medium: [], low: [], requiredFixes: ['Remove all secrets from code'],
        tests: { passed: false, details: 'Blocked by secret detection' },
        architecture: 'N/A', performance: 'N/A', security: 'CRITICAL: Secrets in code',
        outOfScopeFindings: [],
        verdict: 'ESCALATE',
        findings: secretCheck.findings.map(f => ({
          severity: 'BLOCKER' as FindingSeverity, file: '*', line: 0,
          title: 'Secret detected', detail: f, requiredFix: 'Remove secret',
        })),
        acceptance: [], nextAction: 'ESCALATE',
      };
      return { success: true, exitCode: 0, timedOut: false, durationMs: Date.now() - started, stdout: JSON.stringify(review), stderr: '', result: review };
    }

    // 2. Dangerous diff detection
    const dangerousFindings = detectDangerousFiles(changedFiles, diff);
    const blockerFindings = dangerousFindings.filter(f => f.severity === 'BLOCKER');
    if (blockerFindings.length > 0) {
      log(taskId, `BLOCKER: Dangerous changes detected`);
      const review: Review = {
        taskId, result: 'REQUEST_CHANGES', summary: 'Dangerous changes detected',
        blocker: blockerFindings.map(f => `${f.title}: ${f.detail}`),
        high: [], medium: [], low: [], requiredFixes: blockerFindings.map(f => `Revert ${f.file}`),
        tests: { passed: false, details: 'Blocked by dangerous diff' },
        architecture: 'N/A', performance: 'N/A', security: 'N/A',
        outOfScopeFindings: [],
        verdict: 'ESCALATE',
        findings: blockerFindings.map(f => ({
          severity: f.severity, file: f.file, line: 0,
          title: f.title, detail: f.detail, requiredFix: `Revert ${f.file}`,
        })),
        acceptance: [], nextAction: 'ESCALATE',
      };
      return { success: true, exitCode: 0, timedOut: false, durationMs: Date.now() - started, stdout: JSON.stringify(review), stderr: '', result: review };
    }

    // 3. Diff too large check
    if (isDiffTooLarge(changedFiles, diff)) {
      log(taskId, `REVIEW_TOO_LARGE: ${changedFiles.length} files, diff too large`);
      return {
        success: false, exitCode: 1, timedOut: false, durationMs: Date.now() - started,
        stdout: '', stderr: `Review too large: ${changedFiles.length} files`,
        errorKind: 'REVIEW_TOO_LARGE',
      };
    }

    // Read key files for context
    const keyFiles = readKeyFiles(changedFiles);

    // Run own verification
    const verification = await runOwnVerification(task);

    // Build reviewer context
    const reviewerContext = buildReviewerContext(
      { id: task.id, title: task.title, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria },
      diff, changedFiles,
      verification.testOutput, verification.buildOutput,
      { summary: '(from developer, not trusted)', knownIssues: [] },
      keyFiles,
    );

    // Add prior review context if provided
    const fullContext = context ? `${reviewerContext}\n\n---\n\n# Prior Context\n${context}` : reviewerContext;

    // Call OpenAI
    const systemPrompt = readReviewerSystemPrompt();

    try {
      const result = await callOpenAI({
        model: config.openaiModel,
        systemPrompt,
        userPrompt: fullContext,
        maxTokens: 4096,
        temperature: 0.1, // Low temperature for consistent reviews
        responseFormat: 'json_object',
        taskId,
        timeoutMs: config.reviewerTimeoutMs,
      });

      recordCall('openai', config.openaiModel, result.durationMs, result.tokensUsed);

      // Parse review
      let review: Review;
      try {
        review = parseJSON<Review>(result.content, taskId);
      } catch (parseError) {
        // Retry once with a simpler prompt
        log(taskId, `Review JSON parse failed, retrying...`);
        const retryResult = await callOpenAI({
          model: config.openaiModel,
          systemPrompt: 'Output ONLY valid JSON matching the reviewer schema.',
          userPrompt: `Parse this as a review JSON:\n\n${result.content.slice(0, 3000)}`,
          maxTokens: 2048,
          temperature: 0,
          responseFormat: 'json_object',
          taskId,
          timeoutMs: 60000,
        });
        recordCall('openai', config.openaiModel, retryResult.durationMs, retryResult.tokensUsed);
        try {
          review = parseJSON<Review>(retryResult.content, taskId);
        } catch {
          return {
            success: false, exitCode: 1, timedOut: false, durationMs: Date.now() - started,
            stdout: result.content.slice(0, 2000), stderr: 'REVIEW_INVALID_JSON',
            errorKind: 'REVIEW_INVALID_JSON',
          };
        }
      }

      // Validate review schema
      try {
        validateReview(review as unknown as Record<string, unknown>);
      } catch (e) {
        log(taskId, `Review schema validation failed: ${e}`);
        // Try to fix common issues
        if (!review.verdict) {
          review.verdict = review.result === 'PASS' ? 'PASS' : 'REQUEST_CHANGES';
        }
        if (!review.findings) {
          review.findings = [
            ...review.blocker.map(b => ({ severity: 'BLOCKER' as FindingSeverity, file: '', line: 0, title: b, detail: b, requiredFix: b })),
            ...review.high.map(h => ({ severity: 'HIGH' as FindingSeverity, file: '', line: 0, title: h, detail: h, requiredFix: h })),
          ];
        }
        if (!review.acceptance) review.acceptance = [];
        if (!review.nextAction) review.nextAction = review.verdict === 'PASS' ? 'Next task' : 'Fix required';
      }

      // Override with orchestrator verification results
      review.tests = { passed: verification.testsPassed, details: verification.testOutput.slice(0, 500) };

      // Persist review
      const stateDir = path.join(dirs.state, taskId);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, `review-result-round-${String(round).padStart(2, '0')}.json`),
        JSON.stringify(review, null, 2),
      );
      fs.mkdirSync(dirs.reviews, { recursive: true });
      fs.writeFileSync(
        path.join(dirs.reviews, `${taskId}-review-${String(round).padStart(2, '0')}.json`),
        JSON.stringify(review, null, 2),
      );

      log(taskId, `Review complete: verdict=${review.verdict || review.result} blocker=${review.blocker.length} high=${review.high.length}`);

      return {
        success: true, exitCode: 0, timedOut: false, durationMs: Date.now() - started,
        stdout: JSON.stringify(review), stderr: '', result: review,
      };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(taskId, `Reviewer error: ${msg}`);
      return {
        success: false, exitCode: 1, timedOut: false, durationMs: Date.now() - started,
        stdout: '', stderr: msg,
        errorKind: msg.includes('OPENAI_MODEL_UNAVAILABLE') ? 'OPENAI_MODEL_UNAVAILABLE' : 'NONZERO_EXIT',
      };
    }
  }
}