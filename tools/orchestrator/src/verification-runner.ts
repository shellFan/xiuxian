/**
 * VerificationRunner — Runs test and build commands independently.
 * Never trusts developer self-report; always verifies from scratch.
 *
 * Safety: Rejects dangerous commands (rm -rf, git reset --hard, etc.).
 */
import { runCommand } from './command-runner';
import { config } from './config';
import { log } from './logger';
import { redactSecrets } from './secret-redactor';

export interface VerificationResult {
  testsPassed: boolean;
  buildPassed: boolean;
  testOutput: string;
  buildOutput: string;
  testCommand: string;
  buildCommand: string;
  durationMs: number;
}

/** Allowed command prefixes for safety — only npm/node/npx/tsc */
const ALLOWED_PREFIXES = ['npm', 'node', 'npx', 'tsc', 'yarn', 'pnpm'];

/**
 * Tokenize a command string properly, handling quoted arguments.
 * "npm run build:orchestrator" → ["npm", "run", "build:orchestrator"]
 * 'node "C:/Program Files/app.js"' → ["node", "C:/Program Files/app.js"]
 */
export function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function isCommandSafe(cmd: string): boolean {
  const tokens = tokenizeCommand(cmd);
  const base = (tokens[0] || '').toLowerCase();
  // Check allowed prefixes
  if (ALLOWED_PREFIXES.some(p => base === p || base.endsWith(`/${p}`) || base.endsWith(`\\${p}`))) {
    return true;
  }
  // Also allow full paths like C:\...\npm.cmd
  if (/\b(npm|node|npx|tsc|yarn|pnpm)(\.cmd|\.exe)?$/i.test(base)) {
    return true;
  }
  return false;
}

/**
 * Run independent test and build verification for a task.
 * Returns results with redacted output (no secrets in logs).
 */
export async function runVerification(
  task: { id: string; commands: { test: string; build: string } },
  signal?: AbortSignal,
): Promise<VerificationResult> {
  const startTime = Date.now();
  const taskId = task.id;

  let testsPassed = false;
  let buildPassed = false;
  let testOutput = '(not run)';
  let buildOutput = '(not run)';
  let testCommand = task.commands.test || '';
  let buildCommand = task.commands.build || '';

  // Run tests
  if (testCommand) {
    if (!isCommandSafe(testCommand)) {
      testOutput = `VERIFICATION_SKIPPED: Test command not in allowed list: ${testCommand}`;
      log(taskId, `Verification: test command rejected as unsafe: ${testCommand}`);
    } else {
      try {
        log(taskId, `Verification: running tests: ${testCommand}`);
        const parts = tokenizeCommand(testCommand);
        const cmd = parts[0];
        const args = parts.slice(1);
        const result = await runCommand(cmd, args, taskId, signal);
        testOutput = redactSecrets(result.stdout.slice(0, 10000));
        testsPassed = result.success;
        if (!testsPassed) {
          testOutput += `\n--- STDERR ---\n${redactSecrets(result.stderr.slice(0, 5000))}`;
        }
        log(taskId, `Verification: tests ${testsPassed ? 'PASS' : 'FAIL'}`);
      } catch (e) {
        testOutput = `Test error: ${e instanceof Error ? e.message : String(e)}`;
        log(taskId, `Verification: test error: ${testOutput}`);
      }
    }
  } else {
    testOutput = '(no test command configured)';
    testsPassed = true; // No test command = vacuously true
  }

  // Run build
  if (buildCommand) {
    if (!isCommandSafe(buildCommand)) {
      buildOutput = `VERIFICATION_SKIPPED: Build command not in allowed list: ${buildCommand}`;
      log(taskId, `Verification: build command rejected as unsafe: ${buildCommand}`);
    } else {
      try {
        log(taskId, `Verification: running build: ${buildCommand}`);
        const parts = tokenizeCommand(buildCommand);
        const cmd = parts[0];
        const args = parts.slice(1);
        const result = await runCommand(cmd, args, taskId, signal);
        buildOutput = redactSecrets(result.stdout.slice(0, 10000));
        buildPassed = result.success;
        if (!buildPassed) {
          buildOutput += `\n--- STDERR ---\n${redactSecrets(result.stderr.slice(0, 5000))}`;
        }
        log(taskId, `Verification: build ${buildPassed ? 'PASS' : 'FAIL'}`);
      } catch (e) {
        buildOutput = `Build error: ${e instanceof Error ? e.message : String(e)}`;
        log(taskId, `Verification: build error: ${buildOutput}`);
      }
    }
  } else {
    buildOutput = '(no build command configured)';
    buildPassed = true; // No build command = vacuously true
  }

  return {
    testsPassed,
    buildPassed,
    testOutput,
    buildOutput,
    testCommand,
    buildCommand,
    durationMs: Date.now() - startTime,
  };
}