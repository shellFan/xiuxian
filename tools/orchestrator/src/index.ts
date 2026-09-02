/**
 * AI Development Orchestrator V2 — CLI Entry Point
 *
 * Commands:
 *   start          Start autonomous loop (runs until stop condition)
 *   once           Run exactly one task (plan → develop → review → fix)
 *   plan           Plan only (output next task JSON, don't execute)
 *   status         Show current task/phase/budget status
 *   doctor         Run environment diagnostics
 *   resume         Resume from checkpoint after crash
 *   stop           Request graceful stop of running orchestrator
 *   gate           List pending manual gates
 *   gate --pass G  Pass a manual gate
 *   gate --fail G  Fail a manual gate
 *   approve-phase  Approve current phase completion
 *   check          Run self-check with mock providers
 *   provider-check Check provider availability
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, files } from './config';
import { runOrchestratorLoop, requestStop, isStopRequested } from './orchestrator-loop';
import { runDoctor } from './doctor';
import { readCheckpoint, writeCheckpoint, clearCheckpoint } from './checkpoint';
import { readPhase, writePhase, startPhase, requestPhaseApproval, phaseSummary } from './phase-gate';
import { pendingGates, passGate, failGate } from './manual-gate';
import { readBudget, budgetSummary, resetBudget } from './budget-tracker';
import { lockStatus, releaseLock } from './lock';
import { pendingTasks, allTasks, loadTask, taskStatusSummary } from './task-loader';
import { closeLog } from './logger';

function ensureDirs() {
  for (const d of ['pending', 'running', 'review', 'fixing', 'done', 'failed', 'escalated']) {
    fs.mkdirSync(path.join(dirs.tasks, d), { recursive: true });
  }
  fs.mkdirSync(dirs.state, { recursive: true });
  fs.mkdirSync(dirs.reports, { recursive: true });
  fs.mkdirSync(dirs.reviews, { recursive: true });
  fs.mkdirSync(dirs.logs, { recursive: true });
}

function printUsage() {
  console.log(`
AI Development Orchestrator V2

Commands:
  start              Start autonomous loop (runs until stop condition)
  once               Run exactly one task
  plan               Plan only (output next task JSON)
  status             Show current task/phase/budget status
  doctor [--verbose] [--fix]  Run environment diagnostics
  resume             Resume from checkpoint after crash
  stop               Request graceful stop
  gate               List pending manual gates
  gate --pass GATE   Pass a manual gate
  gate --fail GATE   Fail a manual gate
  approve-phase      Approve current phase completion
  check              Run self-check with mock providers
  provider-check     Check provider availability

Environment:
  AI_PLANNER_PROVIDER   = openai (default)
  AI_DEVELOPER_PROVIDER = cursor-cli (default)
  AI_REVIEWER_PROVIDER  = openai (default)
  OPENAI_API_KEY        = required for OpenAI providers
  OPENAI_MODEL          = gpt-5.6-sol (default)
`);
}

async function cmdStart(once: boolean = false, planOnly: boolean = false) {
  ensureDirs();

  // Check for existing lock
  const lock = lockStatus();
  if (lock.exists && !lock.stale) {
    console.error(`Orchestrator already running (PID ${lock.pid} on ${lock.hostname})`);
    console.error('Use "ai:stop" to request stop, or "ai:resume" if crashed.');
    process.exit(1);
  }
  if (lock.stale) {
    console.warn(`Stale lock detected (PID ${lock.pid}). Clearing...`);
    releaseLock();
  }

  // Check for checkpoint (resume scenario)
  const checkpoint = readCheckpoint();
  if (checkpoint) {
    console.warn(`Checkpoint found: task ${checkpoint.taskId} at ${checkpoint.lastAction}`);
    console.warn('Use "ai:resume" to continue, or the checkpoint will be cleared on new start.');
    clearCheckpoint();
  }

  try {
    const report = await runOrchestratorLoop({
      maxTasks: once ? 1 : config.maxTasksPerRun,
      once,
      planOnly,
    });

    console.log('\n=== Run Complete ===');
    console.log(`Tasks: ${report.tasksCompleted} completed, ${report.tasksFailed} failed, ${report.tasksEscalated} escalated`);
    console.log(`Stop reason: ${report.stopReason}`);
    console.log(`Duration: ${report.endedAt ? new Date(report.endedAt).getTime() - new Date(report.startedAt).getTime() : 0}ms`);
    console.log(`Report: ${files.latestReport}`);
  } catch (e) {
    console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    closeLog();
  }
}

async function cmdStatus() {
  ensureDirs();

  // Lock status
  const lock = lockStatus();
  console.log(`\nLock: ${lock.exists ? `PID ${lock.pid} on ${lock.hostname}${lock.stale ? ' (STALE)' : ''}` : 'none'}`);

  // Checkpoint
  const checkpoint = readCheckpoint();
  console.log(`Checkpoint: ${checkpoint ? `task ${checkpoint.taskId} @ ${checkpoint.lastAction}` : 'none'}`);

  // Phase
  try {
    const phase = readPhase();
    console.log(`Phase: ${phase.currentPhase} (${phase.status})`);
    const gates = Object.entries(phase.manualGates);
    if (gates.length > 0) {
      console.log(`  Gates: ${gates.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
  } catch {
    console.log('Phase: not initialized');
  }

  // Budget
  try {
    const budget = readBudget();
    console.log(`Budget: OpenAI ${budget.openaiCalls}/${config.maxOpenaiCalls}, Cursor ${budget.cursorCalls}/${config.maxCursorCalls}`);
  } catch {
    console.log('Budget: fresh');
  }

  // Tasks
  const all = allTasks();
  const byStatus: Record<string, number> = {};
  for (const t of all) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  console.log(`\nTasks (${all.length} total):`);
  for (const [status, count] of Object.entries(byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }

  // Pending tasks detail
  const pending = pendingTasks();
  if (pending.length > 0) {
    console.log(`\nNext tasks:`);
    for (const t of pending.slice(0, 5)) {
      console.log(`  ${t.id}: ${t.title} [${t.priority}]`);
    }
  }
}

async function cmdResume() {
  ensureDirs();

  const checkpoint = readCheckpoint();
  if (!checkpoint) {
    console.error('No checkpoint found. Use "ai:start" for a fresh run.');
    process.exit(1);
  }

  console.log(`Resuming from checkpoint: task ${checkpoint.taskId} at ${checkpoint.lastAction}`);

  // Clear stale lock if any
  const lock = lockStatus();
  if (lock.stale) {
    console.warn('Clearing stale lock...');
    releaseLock();
  }

  // For now, resume = start a new run (checkpoint context is advisory)
  // A full resume would need to restore the exact task and round
  try {
    const report = await runOrchestratorLoop({ maxTasks: config.maxTasksPerRun });
    console.log('\n=== Resume Run Complete ===');
    console.log(`Tasks: ${report.tasksCompleted} completed, ${report.tasksFailed} failed, ${report.tasksEscalated} escalated`);
    console.log(`Stop reason: ${report.stopReason}`);
  } catch (e) {
    console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    closeLog();
  }
}

async function cmdStop() {
  requestStop();
  console.log('Stop requested. Orchestrator will finish current task and stop.');
}

async function cmdGate(args: string[]) {
  ensureDirs();

  if (args.includes('--pass')) {
    const gateName = args[args.indexOf('--pass') + 1];
    if (!gateName) {
      console.error('Usage: gate --pass GATE_NAME');
      process.exit(1);
    }
    passGate(gateName);
    console.log(`Gate "${gateName}" passed.`);
    return;
  }

  if (args.includes('--fail')) {
    const gateName = args[args.indexOf('--fail') + 1];
    if (!gateName) {
      console.error('Usage: gate --fail GATE_NAME');
      process.exit(1);
    }
    failGate(gateName);
    console.log(`Gate "${gateName}" failed.`);
    return;
  }

  // List gates
  const pending = pendingGates();
  if (pending.length === 0) {
    console.log('No pending manual gates.');
  } else {
    console.log('Pending manual gates:');
    for (const g of pending) {
      console.log(`  - ${g}`);
    }
  }
}

async function cmdApprovePhase() {
  ensureDirs();
  const phase = readPhase();
  if (phase.status !== 'COMPLETE_PENDING_APPROVAL') {
    console.log(`Current phase ${phase.currentPhase} is ${phase.status}, not pending approval.`);
    return;
  }
  writePhase({
    ...phase,
    status: 'COMPLETE',
    approvedBy: process.env.USER || process.env.USERNAME || 'cli',
    approvedAt: new Date().toISOString(),
  });
  console.log(`Phase ${phase.currentPhase} approved. Starting phase ${phase.currentPhase + 1}...`);
  startPhase();
}

async function main() {
  ensureDirs();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      await cmdStart();
      break;
    case 'once':
      await cmdStart(true);
      break;
    case 'plan':
      await cmdStart(false, true);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'doctor':
      await runDoctor({ verbose: args.includes('--verbose'), fix: args.includes('--fix') });
      break;
    case 'resume':
      await cmdResume();
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'gate':
      await cmdGate(args.slice(1));
      break;
    case 'approve-phase':
      await cmdApprovePhase();
      break;
    case 'check':
      console.log('Self-check not yet implemented for V2. Use "ai:doctor" instead.');
      break;
    case 'provider-check':
      console.log('Provider check integrated into "ai:doctor --verbose".');
      break;
    case undefined:
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch(e => {
  console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
  closeLog();
});