/**
 * Doctor — Environment diagnostics for AI Development Orchestrator V2.
 *
 * Checks:
 * 1. Node.js version
 * 2. Git installed and configured
 * 3. Current branch (not main/master)
 * 4. OpenAI API key configured
 * 5. OpenAI model accessible
 * 6. Cursor CLI installed and accessible
 * 7. Working directory structure
 * 8. ai/ directory structure
 * 9. Schemas present
 * 10. Prompts present
 * 11. Lock file status
 * 12. Phase state
 * 13. Budget state
 * 14. TypeScript compilation
 * 15. npm test passes
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config, dirs, files } from './config';
import { lockStatus } from './lock';
import { readPhase } from './phase-gate';
import { readBudget } from './budget-tracker';
import { DoctorResult, DoctorCheck } from './types';
import { OpenAIPlannerProvider } from './adapters/openai-planner-provider';
import { CursorCliDeveloperProvider } from './adapters/cursor-cli-developer-provider';

interface DoctorOptions {
  verbose?: boolean;
  fix?: boolean;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: string[] = [];

  // 1. Node.js version
  checks.push(checkNodeVersion());

  // 2. Git
  checks.push(checkGit());

  // 3. Current branch
  checks.push(checkBranch());

  // 4. OpenAI API key
  checks.push(checkOpenAIKey());

  // 5. OpenAI model accessibility
  checks.push(await checkOpenAIModel(options.verbose));

  // 6. Cursor CLI
  checks.push(await checkCursorCLI());

  // 7. Working directory structure
  checks.push(checkDirectoryStructure(!!options.fix, fixes));

  // 8. ai/ directory structure
  checks.push(checkAiDirectory(!!options.fix, fixes));

  // 9. Schemas
  checks.push(checkSchemas());

  // 10. Prompts
  checks.push(checkPrompts());

  // 11. Lock file
  checks.push(checkLock());

  // 12. Phase state
  checks.push(checkPhase());

  // 13. Budget state
  checks.push(checkBudget());

  // 14. TypeScript compilation
  checks.push(checkTypeScript());

  // 15. npm test
  if (options.verbose) {
    checks.push(await checkNpmTest());
  }

  // Collect errors and warnings
  for (const check of checks) {
    if (check.status === 'FAIL') {
      errors.push(`${check.name}: ${check.message}`);
    } else if (check.status === 'WARN') {
      warnings.push(`${check.name}: ${check.message}`);
    }
  }

  const result: DoctorResult = {
    healthy: errors.length === 0,
    checks,
    errors,
    warnings,
    fixes,
  };

  // Print report
  printDoctorReport(result, !!options.verbose);

  return result;
}

function checkNodeVersion(): DoctorCheck {
  try {
    const version = process.version;
    const major = parseInt(version.replace('v', '').split('.')[0], 10);
    if (major >= 18) {
      return { name: 'Node.js', status: 'PASS', message: `v${major} (${version})` };
    }
    return { name: 'Node.js', status: 'FAIL', message: `Node.js v18+ required, got ${version}` };
  } catch {
    return { name: 'Node.js', status: 'FAIL', message: 'Cannot detect Node.js version' };
  }
}

function checkGit(): DoctorCheck {
  try {
    const version = execSync('git --version', { encoding: 'utf8' }).trim();
    const name = execSync('git config user.name', { encoding: 'utf8' }).trim();
    const email = execSync('git config user.email', { encoding: 'utf8' }).trim();
    if (!name || !email) {
      return { name: 'Git', status: 'WARN', message: `Git ${version} but user.name/email not configured` };
    }
    return { name: 'Git', status: 'PASS', message: `${version} | user: ${name} <${email}>` };
  } catch (e) {
    return { name: 'Git', status: 'FAIL', message: 'Git not found in PATH' };
  }
}

function checkBranch(): DoctorCheck {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (branch === 'main' || branch === 'master') {
      return { name: 'Branch', status: 'FAIL', message: `On ${branch} — orchestrator cannot run on main/master` };
    }
    if (branch === config.aiBranch) {
      return { name: 'Branch', status: 'PASS', message: `On ${branch} (AI branch)` };
    }
    return { name: 'Branch', status: 'WARN', message: `On ${branch}, expected AI branch ${config.aiBranch}` };
  } catch {
    return { name: 'Branch', status: 'WARN', message: 'Cannot detect current branch' };
  }
}

function checkOpenAIKey(): DoctorCheck {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { name: 'OpenAI Key', status: 'FAIL', message: 'OPENAI_API_KEY not set' };
  }
  if (key.startsWith('sk-')) {
    return { name: 'OpenAI Key', status: 'PASS', message: `Set (${key.length} chars, ${key.slice(0, 7)}...)` };
  }
  return { name: 'OpenAI Key', status: 'WARN', message: `Set but unusual format (${key.length} chars)` };
}

async function checkOpenAIModel(verbose: boolean = false): Promise<DoctorCheck> {
  if (!process.env.OPENAI_API_KEY) {
    return { name: 'OpenAI Model', status: 'SKIP', message: 'No API key, cannot test' };
  }
  if (!verbose) {
    return { name: 'OpenAI Model', status: 'PASS', message: `Configured: ${config.openaiModel} (use --verbose to test)` };
  }
  try {
    const planner = new OpenAIPlannerProvider();
    // Try a minimal call
    const result = await planner.planNextTask({
      phase: readPhase(),
      recentReports: [],
      taskStatus: [],
      gitLog: '',
      agentsMd: '',
    });
    if (result.stopReason === 'OPENAI_UNAVAILABLE') {
      return { name: 'OpenAI Model', status: 'FAIL', message: `Model ${config.openaiModel} unavailable` };
    }
    return { name: 'OpenAI Model', status: 'PASS', message: `${config.openaiModel} accessible` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('401') || msg.includes('auth')) {
      return { name: 'OpenAI Model', status: 'FAIL', message: `Auth error: ${msg.slice(0, 100)}` };
    }
    if (msg.includes('429') || msg.includes('rate')) {
      return { name: 'OpenAI Model', status: 'WARN', message: `Rate limited: ${msg.slice(0, 100)}` };
    }
    return { name: 'OpenAI Model', status: 'FAIL', message: `Error: ${msg.slice(0, 100)}` };
  }
}

async function checkCursorCLI(): Promise<DoctorCheck> {
  const available = await CursorCliDeveloperProvider.isAvailable();
  if (available) {
    return { name: 'Cursor CLI', status: 'PASS', message: `Found: ${config.cursor}` };
  }
  if (config.developerProvider === 'cursor-cli') {
    return { name: 'Cursor CLI', status: 'FAIL', message: `Not found: ${config.cursor} (required for cursor-cli developer)` };
  }
  return { name: 'Cursor CLI', status: 'WARN', message: `Not found: ${config.cursor} (optional, using ${config.developerProvider})` };
}

function checkDirectoryStructure(fix: boolean, fixes: string[]): DoctorCheck {
  const required = ['package.json', 'tsconfig.json', 'assets', 'scripts'];
  const missing = required.filter(f => !fs.existsSync(path.resolve(f)));
  if (missing.length === 0) {
    return { name: 'Project Structure', status: 'PASS', message: 'All required files/dirs present' };
  }
  if (fix) {
    // Can't auto-fix project structure
    return { name: 'Project Structure', status: 'FAIL', message: `Missing: ${missing.join(', ')} (cannot auto-fix)` };
  }
  return { name: 'Project Structure', status: 'WARN', message: `Missing: ${missing.join(', ')}` };
}

function checkAiDirectory(fix: boolean, fixes: string[]): DoctorCheck {
  const required = ['tasks', 'state', 'reports', 'reviews', 'logs', 'schemas', 'prompts'];
  const missing: string[] = [];
  const created: string[] = [];

  for (const d of required) {
    const fullPath = path.join(dirs.root, 'ai', d);
    if (!fs.existsSync(fullPath)) {
      missing.push(d);
      if (fix) {
        fs.mkdirSync(fullPath, { recursive: true });
        created.push(d);
        fixes.push(`Created ai/${d}/`);
      }
    }
  }

  // Task subdirs
  for (const sub of ['pending', 'running', 'review', 'fixing', 'done', 'failed', 'escalated']) {
    const fullPath = path.join(dirs.tasks, sub);
    if (!fs.existsSync(fullPath)) {
      if (fix) {
        fs.mkdirSync(fullPath, { recursive: true });
        fixes.push(`Created ai/tasks/${sub}/`);
      }
    }
  }

  if (missing.length === 0) {
    return { name: 'AI Directory', status: 'PASS', message: 'All ai/ subdirs present' };
  }
  if (created.length > 0) {
    return { name: 'AI Directory', status: 'PASS', message: `Created: ${created.join(', ')}` };
  }
  return { name: 'AI Directory', status: 'WARN', message: `Missing: ${missing.join(', ')} (use --fix to create)` };
}

function checkSchemas(): DoctorCheck {
  const required = ['task.schema.json', 'developer.schema.json', 'reviewer.schema.json'];
  const missing = required.filter(f => !fs.existsSync(path.join(dirs.schemas, f)));
  if (missing.length === 0) {
    return { name: 'Schemas', status: 'PASS', message: 'All schemas present' };
  }
  return { name: 'Schemas', status: 'WARN', message: `Missing: ${missing.join(', ')}` };
}

function checkPrompts(): DoctorCheck {
  const required = ['planner-system.md', 'cursor-developer-system.md', 'openai-reviewer-system.md'];
  const missing = required.filter(f => !fs.existsSync(path.join(dirs.prompts, f)));
  if (missing.length === 0) {
    return { name: 'Prompts', status: 'PASS', message: 'All system prompts present' };
  }
  return { name: 'Prompts', status: 'FAIL', message: `Missing: ${missing.join(', ')}` };
}

function checkLock(): DoctorCheck {
  const status = lockStatus();
  if (!status.exists) {
    return { name: 'Lock', status: 'PASS', message: 'No lock file (idle)' };
  }
  if (status.stale) {
    return { name: 'Lock', status: 'WARN', message: `Stale lock from PID ${status.pid} (use resume or clear manually)` };
  }
  return { name: 'Lock', status: 'WARN', message: `Active lock: PID ${status.pid} on ${status.hostname}` };
}

function checkPhase(): DoctorCheck {
  try {
    const phase = readPhase();
    return { name: 'Phase', status: 'PASS', message: `Phase ${phase.currentPhase} (${phase.status})` };
  } catch {
    return { name: 'Phase', status: 'WARN', message: 'No phase state (will initialize on first run)' };
  }
}

function checkBudget(): DoctorCheck {
  try {
    const budget = readBudget();
    return { name: 'Budget', status: 'PASS', message: `OpenAI: ${budget.openaiCalls}/${config.maxOpenaiCalls} | Cursor: ${budget.cursorCalls}/${config.maxCursorCalls}` };
  } catch {
    return { name: 'Budget', status: 'PASS', message: 'No budget state (fresh)' };
  }
}

function checkTypeScript(): DoctorCheck {
  try {
    execSync('npx tsc --noEmit --project tsconfig.game.json 2>&1', {
      encoding: 'utf8',
      timeout: 60000,
      cwd: dirs.root,
    });
    return { name: 'TypeScript', status: 'PASS', message: 'No compilation errors' };
  } catch (e: any) {
    const output = e.stdout || e.message || '';
    const errorCount = (output.match(/error TS/g) || []).length;
    if (errorCount > 0) {
      return { name: 'TypeScript', status: 'WARN', message: `${errorCount} compilation error(s)` };
    }
    return { name: 'TypeScript', status: 'WARN', message: 'Cannot check (tsc not available or timeout)' };
  }
}

async function checkNpmTest(): Promise<DoctorCheck> {
  try {
    execSync('npm test 2>&1', {
      encoding: 'utf8',
      timeout: 120000,
      cwd: dirs.root,
    });
    return { name: 'npm test', status: 'PASS', message: 'All tests pass' };
  } catch (e: any) {
    const output = e.stdout || e.message || '';
    const failMatch = output.match(/(\d+) failing/);
    if (failMatch) {
      return { name: 'npm test', status: 'WARN', message: `${failMatch[1]} test(s) failing` };
    }
    return { name: 'npm test', status: 'WARN', message: 'Tests not passing or not available' };
  }
}

function printDoctorReport(result: DoctorResult, verbose: boolean): void {
  console.log('\n=== AI Development Orchestrator V2 — Doctor ===\n');

  for (const check of result.checks) {
    const icon = check.status === 'PASS' ? '✓' : check.status === 'FAIL' ? '✗' : check.status === 'WARN' ? '⚠' : '—';
    const label = check.status === 'PASS' ? 'PASS' : check.status === 'FAIL' ? 'FAIL' : check.status === 'WARN' ? 'WARN' : 'SKIP';
    console.log(`  ${icon} [${label}] ${check.name}: ${check.message}`);
  }

  if (result.fixes.length > 0) {
    console.log('\n  Fixes applied:');
    for (const fix of result.fixes) {
      console.log(`    + ${fix}`);
    }
  }

  console.log('');
  if (result.healthy) {
    console.log('  ✓ Environment is healthy. Ready to run ai:start.');
  } else {
    console.log('  ✗ Environment has errors. Fix them before running ai:start.');
    for (const err of result.errors) {
      console.log(`    ✗ ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n  Warnings:');
    for (const w of result.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  console.log('');
}