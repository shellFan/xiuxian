/**
 * CursorCliDeveloperProvider — Uses Cursor CLI `agent -p` for development tasks.
 * This is the primary developer provider for production use.
 *
 * Cursor CLI supports:
 *   agent -p "prompt"           — non-interactive agent mode
 *   --output-format json        — structured JSON output
 *   --continue                  — continue recent conversation
 *   --resume=<thread-id>        — resume specific conversation
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, root } from '../config';
import { runProcess, commandExists, findCommand } from '../process-runner';
import { recordCall } from '../budget-tracker';
import { buildDeveloperContext } from '../context-builder';
import { log } from '../logger';
import {
  DeveloperAdapter, Task, AgentExecutionResult, DeveloperResult,
} from '../types';

const CURSOR_DEVELOPER_PROMPT_PATH = path.join(dirs.prompts, 'cursor-developer-system.md');

function readDeveloperSystemPrompt(): string {
  if (fs.existsSync(CURSOR_DEVELOPER_PROMPT_PATH)) {
    return fs.readFileSync(CURSOR_DEVELOPER_PROMPT_PATH, 'utf8');
  }
  return 'You are a developer agent. Complete the task and output structured JSON result.';
}

/**
 * Resolve the Cursor CLI command.
 * On Windows, prefer agent.cmd; on Unix, just 'agent'.
 */
function resolveCursorCommand(): string {
  if (process.platform === 'win32') {
    // Check if agent.cmd exists
    const found = findCommand('agent.cmd');
    if (found) return 'agent.cmd';
    // Fallback to agent
    const foundAgent = findCommand('agent');
    if (foundAgent) return foundAgent;
    return 'agent.cmd'; // default, will error gracefully
  }
  return 'agent';
}

/**
 * Build the full prompt for Cursor CLI agent.
 */
function buildCursorPrompt(task: Task, priorReview?: string): string {
  const systemPrompt = readDeveloperSystemPrompt();
  const taskContext = buildDeveloperContext(task, priorReview);

  return `${systemPrompt}\n\n---\n\n${taskContext}\n\n---\n\nIMPORTANT: Output your final result as a JSON object matching the developer schema. The JSON must include: taskId, status, summary, commits, filesChanged, tests, build, knownIssues, gitStatus, pushStatus.`;
}

/**
 * Parse Cursor CLI JSON output robustly.
 * Cursor may output extra text before/after the JSON.
 */
function parseCursorOutput(stdout: string, taskId: string): DeveloperResult {
  // Strip ANSI escape codes
  const clean = stdout.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

  // Try 1: Full JSON parse
  try {
    return JSON.parse(clean) as DeveloperResult;
  } catch { /* continue */ }

  // Try 2: Find JSON object in output
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1)) as DeveloperResult;
    } catch { /* continue */ }
  }

  // Try 3: Look for developer-result.json file
  const resultFile = path.join(dirs.state, taskId, 'developer-result.json');
  if (fs.existsSync(resultFile)) {
    try {
      return JSON.parse(fs.readFileSync(resultFile, 'utf8')) as DeveloperResult;
    } catch { /* continue */ }
  }

  throw new Error(`DEVELOPER_INVALID_RESULT: Could not parse Cursor CLI output for ${taskId}. Raw length: ${stdout.length}`);
}

export class CursorCliDeveloperProvider implements DeveloperAdapter {
  private cursorCommand: string;

  constructor() {
    this.cursorCommand = resolveCursorCommand();
  }

  async runTask(task: Task, context: string, signal?: AbortSignal): Promise<AgentExecutionResult<DeveloperResult>> {
    const taskId = task.id;
    const started = Date.now();

    log(taskId, `Starting Cursor CLI Developer for task: ${task.title}`);

    // Build the prompt
    const prompt = buildCursorPrompt(task);

    // Ensure log directory exists
    const cursorLogDir = path.join(dirs.logs, 'cursor');
    fs.mkdirSync(cursorLogDir, { recursive: true });

    // Ensure state directory exists
    const stateDir = path.join(dirs.state, taskId);
    fs.mkdirSync(stateDir, { recursive: true });

    // Run Cursor CLI: agent -p "<prompt>" --output-format json
    const args = ['-p', prompt, '--output-format', 'json'];

    log(taskId, `Running: ${this.cursorCommand} agent -p ... --output-format json`);

    try {
      const result = await runProcess(this.cursorCommand, args, {
        taskId,
        timeoutMs: config.developerTimeoutMs,
        signal,
        cwd: config.workspace,
      });

      const durationMs = Date.now() - started;
      recordCall('cursor', config.cursorModel, durationMs);

      // Log stdout and stderr
      try {
        fs.writeFileSync(
          path.join(cursorLogDir, `${taskId}.stdout.log`),
          result.stdout.slice(0, 50000), // Limit log size
        );
        fs.writeFileSync(
          path.join(cursorLogDir, `${taskId}.stderr.log`),
          result.stderr.slice(0, 10000),
        );
      } catch { /* log write failure non-critical */ }

      if (!result.success) {
        log(taskId, `Cursor CLI failed: ${result.errorKind || 'exit=' + result.exitCode}`);
        return {
          ...result,
          errorKind: result.timedOut ? 'DEVELOPER_TIMEOUT' : (result.errorKind || 'NONZERO_EXIT'),
        } as AgentExecutionResult<DeveloperResult>;
      }

      // Parse the result
      try {
        const developerResult = parseCursorOutput(result.stdout, taskId);

        // Validate basic structure
        if (!developerResult.taskId || !developerResult.status) {
          log(taskId, `Cursor output missing required fields`);
          return {
            ...result,
            success: false,
            errorKind: 'DEVELOPER_INVALID_RESULT',
            stderr: `Missing required fields in developer result: ${result.stdout.slice(0, 500)}`,
          } as AgentExecutionResult<DeveloperResult>;
        }

        // Save result to state directory
        fs.writeFileSync(
          path.join(stateDir, 'developer-result.json'),
          JSON.stringify(developerResult, null, 2),
        );

        // Save result metadata
        fs.writeFileSync(
          path.join(cursorLogDir, `${taskId}.result.json`),
          JSON.stringify({
            taskId,
            exitCode: result.exitCode,
            durationMs,
            status: developerResult.status,
            filesChanged: developerResult.changedFiles?.length || 0,
            testsPassed: developerResult.build?.passed || false,
          }, null, 2),
        );

        log(taskId, `Cursor CLI completed: status=${developerResult.status} duration=${durationMs}ms`);

        return {
          ...result,
          result: developerResult,
        } as AgentExecutionResult<DeveloperResult>;

      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : String(parseError);
        log(taskId, `Failed to parse Cursor output: ${msg}`);
        return {
          ...result,
          success: false,
          errorKind: 'DEVELOPER_INVALID_RESULT',
          stderr: `${msg}\n${result.stdout.slice(0, 1000)}`,
        } as AgentExecutionResult<DeveloperResult>;
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(taskId, `Cursor CLI execution error: ${msg}`);
      return {
        success: false,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - started,
        stdout: '',
        stderr: msg,
        errorKind: 'CLI_NOT_FOUND',
      };
    }
  }

  /**
   * Check if Cursor CLI is available.
   */
  static async isAvailable(): Promise<boolean> {
    return commandExists('agent') || commandExists('agent.cmd');
  }
}