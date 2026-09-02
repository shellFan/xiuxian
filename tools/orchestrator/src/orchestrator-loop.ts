/**
 * Orchestrator Loop — Autonomous development loop.
 *
 * Flow: Planner → Developer → Test/Build → Review → Fix Loop → Next Task
 *
 * Stop conditions:
 * - MAX_TASKS_PER_RUN reached
 * - MAX_RUNTIME_MINUTES exceeded
 * - BLOCKER / HIGH unresolved
 * - ESCALATED
 * - SECRET_DETECTED
 * - DANGEROUS_GIT
 * - BRANCH_CHANGED
 * - MAIN_MODIFIED
 * - BUDGET_EXCEEDED
 * - PHASE_COMPLETE
 * - MANUAL_VERIFY_REQUIRED
 * - NO_TASK
 * - STOP_REQUESTED
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, files } from './config';
import { Task, TaskStatus, StopReason, RunReport, TaskReport, CheckpointState, PhaseState, PlannerContext } from './types';
import { OpenAIPlannerProvider } from './adapters/openai-planner-provider';
import { developerAdapter } from './adapters/developer-adapter';
import { reviewerAdapter } from './adapters/reviewer-adapter';
import { acquireLock, releaseLock, lockStatus } from './lock';
import { readCheckpoint, writeCheckpoint, updateCheckpointAction, clearCheckpoint } from './checkpoint';
import { readPhase, writePhase, startPhase, isPhaseCompletePending, phaseSummary, requestPhaseApproval } from './phase-gate';
import { pendingGates, isGatePassed } from './manual-gate';
import { isBudgetExceeded, readBudget, budgetSummary, resetBudget } from './budget-tracker';
import { captureBaseline, delta, pathViolation } from './git-manager';
import { gitPush, getHeadSha, getCurrentBranch } from './git-push';
import { moveTask, pendingTasks, loadTask, allTasks } from './task-loader';
import { validateTask } from './schema-validator';
import { getDefaultNotification } from './notification';
import { log } from './logger';
import { checkDiffForSecrets } from './secret-redactor';
import { redactSecrets } from './secret-redactor';
import { detectDangerousFiles } from './dangerous-diff';
import { runVerification } from './verification-runner';

let stopRequested = false;

export function requestStop(): void {
  stopRequested = true;
  log('ORCHESTRATOR', 'Stop requested');
}

export function isStopRequested(): boolean {
  return stopRequested;
}

/**
 * Run the autonomous development loop.
 */
export async function runOrchestratorLoop(options: {
  maxTasks?: number;
  once?: boolean; // Only one task
  planOnly?: boolean; // Only plan, don't execute
}): Promise<RunReport> {
  const startTime = Date.now();
  const maxTasks = options.maxTasks || config.maxTasksPerRun;
  const maxRuntimeMs = config.maxRuntimeMinutes * 60 * 1000;

  // Reset budget for new run
  resetBudget();

  const report: RunReport = {
    startedAt: new Date().toISOString(),
    tasksCompleted: 0,
    tasksFailed: 0,
    tasksEscalated: 0,
    commits: [],
    reviews: 0,
    fixRounds: 0,
    currentPhase: 0,
    manualGates: {},
    tasks: [],
  };

  try {
    // Acquire lock
    if (!acquireLock()) {
      throw new Error('Cannot acquire orchestrator lock. Another instance may be running.');
    }

    // Ensure directories
    ensureDirs();

    // Initialize phase
    const phase = startPhase();
    report.currentPhase = phase.currentPhase;
    report.manualGates = { ...phase.manualGates };

    const notification = getDefaultNotification();
    notification.notify('START', `Phase ${phase.currentPhase} | Planner: GPT-5.6 Sol | Developer: Cursor Agent | Reviewer: GPT-5.6 Sol`);

    // Initialize planner
    const planner = new OpenAIPlannerProvider();

    let tasksCompleted = 0;
    let consecutiveHighFailures = 0;

    while (!stopRequested && tasksCompleted < maxTasks) {
      // Check runtime
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxRuntimeMs) {
        report.stopReason = 'MAX_RUNTIME';
        notification.notify('STOP', `Max runtime reached: ${config.maxRuntimeMinutes} minutes`);
        break;
      }

      // Check budget
      if (isBudgetExceeded()) {
        report.stopReason = 'BUDGET_EXCEEDED';
        notification.notify('STOP', `Budget exceeded: ${budgetSummary()}`);
        break;
      }

      // Check phase
      const currentPhase = readPhase();
      if (currentPhase.status === 'COMPLETE_PENDING_APPROVAL') {
        report.stopReason = 'PHASE_COMPLETE_PENDING_APPROVAL';
        notification.notify('STOP', `Phase ${currentPhase.currentPhase} complete, pending approval`);
        break;
      }

      // Check manual gates
      const pending = pendingGates();
      if (pending.length > 0 && currentPhase.status === 'IN_PROGRESS') {
        // Non-blocking gates: continue with headless tasks
        // But if all remaining tasks need manual gates, stop
        log('ORCHESTRATOR', `Pending gates: ${pending.join(', ')}`);
      }

      // === PLANNING PHASE ===
      updateCheckpointAction('PLANNING', { phase: currentPhase.currentPhase });

      log('ORCHESTRATOR', `Planning next task... (${tasksCompleted}/${maxTasks} completed)`);

      // Build real planner context (MEDIUM-01)
      const plannerContext = await buildPlannerContextData(currentPhase, report);

      const plannerResult = await planner.planNextTask(plannerContext);

      // Handle planner stop reasons
      if (plannerResult.stopReason) {
        report.stopReason = plannerResult.stopReason as StopReason;
        if (plannerResult.stopReason === 'PHASE_COMPLETE') {
          requestPhaseApproval();
          notification.notify('PHASE_COMPLETE', `Phase ${currentPhase.currentPhase} complete`);
        } else if (plannerResult.stopReason === 'NO_TASK') {
          notification.notify('STOP', 'No tasks available');
        } else if (plannerResult.stopReason === 'MANUAL_VERIFY_REQUIRED') {
          notification.notify('STOP', 'Manual verification required');
        }
        break;
      }

      if (!plannerResult.task) {
        report.stopReason = 'NO_TASK';
        break;
      }

      const task = plannerResult.task;

      // If plan-only mode, just output the task and stop
      if (options.planOnly) {
        console.log(JSON.stringify(task, null, 2));
        report.stopReason = 'NO_TASK';
        break;
      }

      // Save the planned task
      const taskDir = path.join(dirs.tasks, 'pending');
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(path.join(taskDir, `${task.id}.json`), JSON.stringify(task, null, 2));

      log('ORCHESTRATOR', `Task planned: ${task.id} — ${task.title} [${task.priority}]`);

      // === EXECUTE ONE TASK ===
      const taskReport = await executeOneTask(task);

      report.tasks.push(taskReport);
      report.reviews += taskReport.reviewRounds;
      report.fixRounds += Math.max(0, taskReport.reviewRounds - 1);
      report.commits.push(...taskReport.commits);

      if (taskReport.status === 'DONE' || taskReport.status === 'PASS') {
        report.tasksCompleted++;
        tasksCompleted++;
        consecutiveHighFailures = 0;
      } else if (taskReport.status === 'ESCALATED') {
        report.tasksEscalated++;
        consecutiveHighFailures++;
      } else if (taskReport.status === 'FAILED') {
        report.tasksFailed++;
        consecutiveHighFailures++;
      }

      // Check stop conditions from task result
      if (taskReport.status === 'ESCALATED') {
        report.stopReason = 'ESCALATED';
        notification.notify('ESCALATED', `Task ${task.id} escalated`);
        break;
      }

      // Check for consecutive HIGH failures
      if (consecutiveHighFailures >= 2) {
        report.stopReason = 'HIGH_UNRESOLVED';
        notification.notify('STOP', 'Two consecutive tasks with unresolved HIGH findings');
        break;
      }

      // If once mode, stop after one task
      if (options.once) {
        report.stopReason = taskReport.status === 'DONE' ? 'NO_TASK' : (taskReport.status as StopReason);
        break;
      }

      // Check if auto-next-task is disabled
      if (!config.autoNextTask) {
        report.stopReason = 'NO_TASK';
        break;
      }
    }

    // Final report
    report.endedAt = new Date().toISOString();
    if (!report.stopReason) {
      report.stopReason = stopRequested ? 'STOP_REQUESTED' : 'MAX_TASKS';
    }

    // Write report
    writeReport(report);
    writeLatestReport(report);

    notification.notify('DONE', `Completed: ${report.tasksCompleted} | Failed: ${report.tasksFailed} | Escalated: ${report.tasksEscalated} | Stop: ${report.stopReason}`);

    return report;

  } finally {
    releaseLock();
    // Only clear checkpoint on normal exit (not on errors/crashes)
    // so that ai:resume can recover
    const reportStop = report.stopReason;
    const isNormalExit = reportStop && !['ERROR', 'ESCALATED', 'SECRET_DETECTED', 'DANGEROUS_GIT', 'BRANCH_CHANGED', 'MAIN_MODIFIED'].includes(reportStop);
    if (isNormalExit) {
      clearCheckpoint();
    } else {
      log('ORCHESTRATOR', `Preserving checkpoint for resume (stopReason=${reportStop})`);
    }
  }
}

/**
 * Execute a single task: Developer → Review → Fix Loop
 */
async function executeOneTask(task: Task): Promise<TaskReport> {
  const startTime = Date.now();
  const taskReport: TaskReport = {
    taskId: task.id,
    title: task.title,
    status: 'PENDING',
    reviewRounds: 0,
    commits: [],
    filesChanged: [],
    testsPassed: false,
    buildPassed: false,
    durationMs: 0,
  };

  try {
    // Capture git baseline
    const baseline = await captureBaseline();
    updateCheckpointAction('CAPTURE_BASELINE', { taskId: task.id, baseSha: baseline.head });

    // Check for pre-existing user changes
    const dirtyAllowed = baseline.dirtyFiles.filter(f =>
      task.allowedPaths.some(p => pathViolation([f], [p], []).length === 0)
    );
    if (dirtyAllowed.length > 0) {
      throw new Error(`PRE_EXISTING_CHANGES_BLOCKED: ${dirtyAllowed.join(', ')}`);
    }

    // Check branch — must be on aiBranch, NOT main/master
    const currentBranch = await getCurrentBranch(task.id);
    if (currentBranch === 'main' || currentBranch === 'master') {
      throw new Error('MAIN_MODIFIED: Cannot run on main/master branch');
    }
    if (currentBranch !== config.aiBranch) {
      throw new Error(`BRANCH_CHANGED: On branch ${currentBranch}, expected ${config.aiBranch}. Stop.`);
    }

    // Move task to RUNNING
    let currentTask = moveTask(task, 'RUNNING');
    taskReport.status = 'RUNNING';
    updateCheckpointAction('DEVELOPER_START', { taskId: task.id, round: 0 });

    // === DEVELOPER PHASE ===
    const dev = developerAdapter();
    const devResult = await dev.runTask(currentTask, buildTaskContext(currentTask, baseline.trackedDiff, []));

    if (!devResult.success) {
      taskReport.status = 'FAILED';
      taskReport.durationMs = Date.now() - startTime;
      moveTask(currentTask, 'FAILED');
      return taskReport;
    }

    if (!devResult.result || devResult.result.status === 'FAILED') {
      taskReport.status = 'FAILED';
      taskReport.durationMs = Date.now() - startTime;
      moveTask(currentTask, 'FAILED');
      return taskReport;
    }

    // Record developer result
    const devData = devResult.result;
    taskReport.filesChanged = devData.changedFiles || [];
    taskReport.commits = devData.commits || [];

    // === INDEPENDENT VERIFICATION (HIGH-02) ===
    // Never trust developer self-report — run test/build ourselves
    updateCheckpointAction('VERIFICATION_START', { taskId: task.id });
    let verification = await runVerification(currentTask);
    taskReport.testsPassed = verification.testsPassed;
    taskReport.buildPassed = verification.buildPassed;
    log(task.id, `Verification: tests=${verification.testsPassed} build=${verification.buildPassed} duration=${verification.durationMs}ms`);
    updateCheckpointAction('VERIFICATION_DONE', { taskId: task.id });

    updateCheckpointAction('DEVELOPER_DONE', { taskId: task.id, currentSha: await getHeadSha(task.id) });

    // === REVIEW PHASE ===
    currentTask = moveTask(currentTask, 'REVIEW');
    taskReport.status = 'REVIEW';

    const gitDelta = await delta(baseline);

    // Check for secrets in diff
    const secretCheck = checkDiffForSecrets(gitDelta.patch);
    if (secretCheck.hasSecret) {
      taskReport.status = 'ESCALATED';
      taskReport.durationMs = Date.now() - startTime;
      moveTask(currentTask, 'ESCALATED');
      return taskReport;
    }

    // Check for dangerous changes
    const dangerousFindings = detectDangerousFiles(gitDelta.changedFiles, gitDelta.patch);
    const blockers = dangerousFindings.filter(f => f.severity === 'BLOCKER');
    if (blockers.length > 0) {
      taskReport.status = 'ESCALATED';
      taskReport.durationMs = Date.now() - startTime;
      moveTask(currentTask, 'ESCALATED');
      return taskReport;
    }

    // Review loop
    let priorReview = '';
    const maxRounds = Math.min(task.maxReviewRounds, config.maxRounds);

    for (let round = 1; round <= maxRounds; round++) {
      taskReport.reviewRounds = round;
      updateCheckpointAction('REVIEW_START', { taskId: task.id, round });

      // === RE-SCAN before each review round (MEDIUM-05) ===
      // Refresh delta, re-check secrets and dangerous files
      const roundDelta = await delta(baseline);
      gitDelta.changedFiles = roundDelta.changedFiles;
      gitDelta.patch = roundDelta.patch;

      const roundSecretCheck = checkDiffForSecrets(gitDelta.patch);
      if (roundSecretCheck.hasSecret) {
        taskReport.status = 'ESCALATED';
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'ESCALATED');
        return taskReport;
      }

      const roundDangerous = detectDangerousFiles(gitDelta.changedFiles, gitDelta.patch);
      const roundBlockers = roundDangerous.filter(f => f.severity === 'BLOCKER');
      if (roundBlockers.length > 0) {
        taskReport.status = 'ESCALATED';
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'ESCALATED');
        return taskReport;
      }

      // Re-run verification after fix rounds (round > 1)
      if (round > 1) {
        updateCheckpointAction('RE_VERIFICATION', { taskId: task.id, round });
        verification = await runVerification(currentTask);
        taskReport.testsPassed = verification.testsPassed;
        taskReport.buildPassed = verification.buildPassed;
        log(task.id, `Re-verification round ${round}: tests=${verification.testsPassed} build=${verification.buildPassed}`);
      }

      const reviewer = reviewerAdapter();
      const reviewResult = await reviewer.review(
        currentTask,
        buildTaskContext(currentTask, gitDelta.patch, gitDelta.changedFiles, priorReview),
        round,
      );

      if (!reviewResult.success || !reviewResult.result) {
        // Review execution failed
        if (reviewResult.errorKind === 'REVIEW_INVALID_JSON' && round < maxRounds) {
          log(task.id, `Review JSON invalid, retrying...`);
          continue;
        }
        taskReport.status = 'ESCALATED';
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'ESCALATED');
        return taskReport;
      }

      const review = reviewResult.result;
      priorReview = JSON.stringify(review);

      // Check review verdict
      const verdict = review.verdict || (review.result === 'PASS' ? 'PASS' : 'REQUEST_CHANGES');

      if (verdict === 'PASS' || review.result === 'PASS') {
        // PASSED!
        taskReport.status = 'DONE';
        taskReport.findings = review.findings;
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'DONE');

        // Auto push if configured
        if (config.autoPush && devData.pushStatus !== 'pushed') {
          try {
            const pushResult = await gitPush(task.id);
            if (pushResult.success) {
              log(task.id, 'Pushed to remote');
            } else {
              log(task.id, `Push failed: ${pushResult.error}`);
            }
          } catch (e) {
            log(task.id, `Push error: ${e}`);
          }
        }

        return taskReport;
      }

      if (verdict === 'ESCALATE') {
        taskReport.status = 'ESCALATED';
        taskReport.findings = review.findings;
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'ESCALATED');
        return taskReport;
      }

      // REQUEST_CHANGES — Fix loop
      if (round < maxRounds) {
        currentTask = moveTask(currentTask, 'FIXING');
        updateCheckpointAction('FIXING_START', { taskId: task.id, round });

        // Build fix context with review findings AND verification results
        const fixContext = buildFixContext(review, verification);

        const fixDev = developerAdapter();
        const fixResult = await fixDev.runTask(currentTask, fixContext);

        if (!fixResult.success || !fixResult.result || fixResult.result.status === 'FAILED') {
          taskReport.status = 'FAILED';
          taskReport.durationMs = Date.now() - startTime;
          moveTask(currentTask, 'FAILED');
          return taskReport;
        }

        // Update delta after fix
        const newDelta = await delta(baseline);
        gitDelta.changedFiles = newDelta.changedFiles;
        gitDelta.patch = newDelta.patch;

        currentTask = moveTask(currentTask, 'REVIEW');
      } else {
        // Max rounds exceeded
        taskReport.status = 'ESCALATED';
        taskReport.findings = review.findings;
        taskReport.durationMs = Date.now() - startTime;
        moveTask(currentTask, 'ESCALATED');

        // Write escalation report
        fs.mkdirSync(dirs.reports, { recursive: true });
        fs.writeFileSync(
          path.join(dirs.reports, `${task.id}-escalation.md`),
          redactSecrets(`# ${task.id} Escalation\n\nRounds: ${round}\n\n${priorReview}\n\nChanged files: ${gitDelta.changedFiles.join(', ')}`),
        );

        return taskReport;
      }
    }

    taskReport.durationMs = Date.now() - startTime;
    return taskReport;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(task.id, `Task execution error: ${msg}`);
    taskReport.status = 'FAILED';
    taskReport.durationMs = Date.now() - startTime;
    try { moveTask(task, 'FAILED'); } catch { /* ignore */ }
    return taskReport;
  }
}

/**
 * Build real planner context data with actual task status, git log, etc.
 */
async function buildPlannerContextData(phase: PhaseState, report: RunReport): Promise<PlannerContext> {
  // Task status summaries
  const taskStatus = allTasks().map(t => ({
    id: t.id,
    status: t.status,
    priority: t.priority,
    title: t.title,
  }));

  // Recent reports
  const reportsDir = path.join(dirs.reports, 'tasks');
  let recentReports: string[] = [];
  try {
    if (fs.existsSync(reportsDir)) {
      recentReports = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .slice(-5);
    }
  } catch { /* ignore */ }

  // Git log
  let gitLog = '';
  try {
    const { runCommand } = await import('./command-runner');
    const result = await runCommand('git', ['log', '--oneline', '-20'], 'PLANNER');
    gitLog = result.success ? result.stdout.trim() : '';
  } catch { /* ignore */ }

  // AGENTS.md
  let agentsMd = '';
  try {
    const agentsPath = path.join(dirs.root, 'AGENTS.md');
    if (fs.existsSync(agentsPath)) {
      agentsMd = fs.readFileSync(agentsPath, 'utf8').slice(0, 5000);
    }
  } catch { /* ignore */ }

  // Last review from current run
  const lastTask = report.tasks[report.tasks.length - 1];
  const lastReview = lastTask && lastTask.findings && lastTask.findings.length > 0
    ? JSON.stringify(lastTask.findings)
    : undefined;

  return {
    phase,
    recentReports,
    taskStatus,
    gitLog,
    agentsMd,
    lastReview,
  };
}

function buildTaskContext(task: Task, patch: string, files: string[], prior = ''): string {
  const lifecycle = `ai/tasks/${task.status.toLowerCase()}/${task.id}.json`;
  return `AGENTS.md\nTask:\n${JSON.stringify(task, null, 2)}\nOrchestrator lifecycle note:\n${lifecycle} and deletion of the prior status file are orchestrator-owned expected changes, not pre-existing user changes. Do not block on or modify these lifecycle files.\nChanged files:\n${files.join('\n')}\nPatch:\n${patch}\nPrior review:\n${prior}`;
}

function buildFixContext(review: { blocker: string[]; high: string[]; medium: string[]; low: string[]; requiredFixes: string[]; findings?: { severity: string; file: string; line: number; title: string; detail: string; requiredFix: string }[]; summary?: string }, verification?: { testsPassed: boolean; buildPassed: boolean; testOutput: string; buildOutput: string }): string {
  const parts: string[] = [];

  // Summary
  if (review.summary) parts.push(`Review Summary: ${review.summary}`);

  // Required fixes (blocker + high + requiredFixes)
  const allRequired = [...review.blocker, ...review.high, ...review.requiredFixes];
  if (allRequired.length > 0) {
    parts.push(`# Required Fixes (MUST address all before re-review)`);
    parts.push(allRequired.map(x => `- ${x}`).join('\n'));
  }

  // Medium findings
  if (review.medium.length > 0) {
    parts.push(`# Medium Findings (should address)`);
    parts.push(review.medium.map(x => `- ${x}`).join('\n'));
  }

  // Structured findings
  if (review.findings && review.findings.length > 0) {
    parts.push(`# Detailed Findings`);
    for (const f of review.findings) {
      parts.push(`- [${f.severity}] ${f.file}:${f.line} — ${f.title}\n  Detail: ${f.detail}\n  Fix: ${f.requiredFix}`);
    }
  }

  // Verification results
  if (verification) {
    parts.push(`# Verification Results (independent, NOT from developer self-report)`);
    parts.push(`Tests: ${verification.testsPassed ? 'PASS' : 'FAIL'}`);
    parts.push(`Build: ${verification.buildPassed ? 'PASS' : 'FAIL'}`);
    if (!verification.testsPassed) parts.push(`Test Output:\n${verification.testOutput.slice(0, 3000)}`);
    if (!verification.buildPassed) parts.push(`Build Output:\n${verification.buildOutput.slice(0, 3000)}`);
  }

  return parts.join('\n\n');
}

function ensureDirs(): void {
  for (const d of ['pending', 'running', 'review', 'fixing', 'done', 'failed', 'escalated']) {
    fs.mkdirSync(path.join(dirs.tasks, d), { recursive: true });
  }
  fs.mkdirSync(dirs.state, { recursive: true });
  fs.mkdirSync(dirs.reports, { recursive: true });
  fs.mkdirSync(dirs.reviews, { recursive: true });
  fs.mkdirSync(dirs.logs, { recursive: true });
  fs.mkdirSync(path.join(dirs.logs, 'orchestrator'), { recursive: true });
  fs.mkdirSync(path.join(dirs.logs, 'cursor'), { recursive: true });
  fs.mkdirSync(path.join(dirs.logs, 'openai'), { recursive: true });
  fs.mkdirSync(path.join(dirs.logs, 'git'), { recursive: true });
}

function writeReport(report: RunReport): void {
  const reportFile = path.join(dirs.reports, `tasks`, `${report.startedAt.replace(/[:.]/g, '-')}.md`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, redactSecrets(formatReport(report)));
}

function writeLatestReport(report: RunReport): void {
  fs.writeFileSync(files.latestReport, redactSecrets(formatReport(report)));
}

function formatReport(report: RunReport): string {
  const lines: string[] = [
    '# AUTONOMOUS RUN REPORT',
    '',
    `**Started:** ${report.startedAt}`,
    `**Ended:** ${report.endedAt || 'N/A'}`,
    '',
    `**Tasks Completed:** ${report.tasksCompleted}`,
    `**Tasks Failed:** ${report.tasksFailed}`,
    `**Tasks Escalated:** ${report.tasksEscalated}`,
    '',
    `**Commits:** ${report.commits.length}`,
    `**Reviews:** ${report.reviews}`,
    `**Fix Rounds:** ${report.fixRounds}`,
    '',
    `**Phase:** ${report.currentPhase}`,
    `**Stop Reason:** ${report.stopReason}`,
    '',
    '## Task Details',
    '',
  ];

  for (const task of report.tasks) {
    lines.push(`### ${task.taskId}: ${task.title}`);
    lines.push(`- Status: ${task.status}`);
    lines.push(`- Review Rounds: ${task.reviewRounds}`);
    lines.push(`- Files Changed: ${task.filesChanged.length}`);
    lines.push(`- Tests: ${task.testsPassed ? 'PASS' : 'FAIL'}`);
    lines.push(`- Build: ${task.buildPassed ? 'PASS' : 'FAIL'}`);
    lines.push(`- Duration: ${(task.durationMs / 1000 / 60).toFixed(1)} min`);
    if (task.findings && task.findings.length > 0) {
      lines.push(`- Findings: ${task.findings.length}`);
      for (const f of task.findings.slice(0, 5)) {
        lines.push(`  - [${f.severity}] ${f.title} (${f.file})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}