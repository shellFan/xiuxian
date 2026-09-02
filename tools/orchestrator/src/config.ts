import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export const root = path.resolve(__dirname, '../../..');

// --- Cursor CLI command resolution (Windows support) ---
const configuredCursor = process.env.CURSOR_COMMAND || 'agent';
const cursor = process.platform === 'win32' && !process.env.CURSOR_COMMAND
  ? 'agent.cmd' : configuredCursor;

const configuredCodex = process.env.CODEX_COMMAND || 'codex';
const codex = process.platform === 'win32' && configuredCodex === 'codex'
  ? 'codex.cmd' : configuredCodex;

function envBool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  return v.toLowerCase() === 'true';
}
function envNum(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function envStr(key: string, def: string): string {
  return process.env[key] || def;
}

export const config = {
  root,

  // --- Provider selection ---
  plannerProvider: envStr('AI_PLANNER_PROVIDER', 'openai'),
  developerProvider: envStr('AI_DEVELOPER_PROVIDER', 'cursor-cli'),
  reviewerProvider: envStr('AI_REVIEWER_PROVIDER', 'openai'),

  // --- Models ---
  openaiModel: envStr('OPENAI_MODEL', 'gpt-5.6-sol'),
  cursorModel: envStr('CURSOR_MODEL', 'auto'),

  // --- Legacy codex compat ---
  developerModel: envStr('AI_DEVELOPER_MODEL', 'gpt-5.6-luna'),
  reviewerModel: envStr('AI_REVIEWER_MODEL', 'gpt-5.6-sol'),
  codexDeveloperSandbox: envStr('AI_CODEX_DEVELOPER_SANDBOX', 'workspace-write'),

  // --- Mock modes (testing only) ---
  developerMode: envStr('MOCK_DEVELOPER_MODE', 'pass'),
  reviewerMode: envStr('MOCK_REVIEW_MODE', 'pass'),

  // --- Timeouts ---
  timeoutMs: envNum('AI_COMMAND_TIMEOUT_MS', 1800000),
  plannerTimeoutMs: envNum('AI_PLANNER_TIMEOUT_MS', 300000),
  reviewerTimeoutMs: envNum('AI_REVIEWER_TIMEOUT_MS', 600000),
  developerTimeoutMs: envNum('AI_DEVELOPER_TIMEOUT_MS', 3600000),

  // --- Loop control ---
  maxRounds: envNum('AI_MAX_REVIEW_ROUNDS', 3),
  maxTasksPerRun: envNum('AI_MAX_TASKS_PER_RUN', 10),
  maxRuntimeMinutes: envNum('AI_MAX_RUNTIME_MINUTES', 480),

  // --- Auto actions ---
  autoCommit: envBool('AI_AUTO_COMMIT', false),
  autoPush: envBool('AI_AUTO_PUSH', false),
  autoNextTask: envBool('AI_AUTO_NEXT_TASK', true),

  // --- Stop policy ---
  stopOnMedium: envBool('AI_STOP_ON_MEDIUM', false),
  stopOnHigh: envBool('AI_STOP_ON_HIGH', true),
  stopOnBlocker: envBool('AI_STOP_ON_BLOCKER', true),

  // --- Budget ---
  maxOpenaiCalls: envNum('AI_MAX_OPENAI_CALLS', 50),
  maxCursorCalls: envNum('AI_MAX_CURSOR_CALLS', 50),

  // --- Branch ---
  aiBranch: envStr('AI_BRANCH', 'ai-automation-bootstrap'),

  // --- Workspace ---
  workspace: envStr('AI_WORKSPACE', root),

  // --- Review context ---
  reviewContextLines: envNum('AI_REVIEW_CONTEXT_LINES', 200),

  // --- Worktree ---
  useWorktree: envBool('AI_USE_WORKTREE', false),

  // --- Git TLS ---
  gitSchannelRetry: envBool('AI_GIT_SCHANNEL_RETRY', true),

  // --- Commands ---
  codex,
  cursor,
  codebuddy: envStr('CODEBUDDY_COMMAND', 'codebuddy'),
};

export const dirs = {
  root,
  tasks: path.join(root, 'ai/tasks'),
  state: path.join(root, 'ai/state'),
  reviews: path.join(root, 'ai/reviews'),
  reports: path.join(root, 'ai/reports'),
  logs: path.join(root, 'ai/logs'),
  schemas: path.join(root, 'ai/schemas'),
  prompts: path.join(root, 'ai/prompts'),
  worktrees: path.join(root, '.ai-worktrees'),
};

export const files = {
  lock: path.join(root, 'ai/state/orchestrator.lock'),
  checkpoint: path.join(root, 'ai/state/checkpoint.json'),
  phase: path.join(root, 'ai/state/phase.json'),
  latestReport: path.join(root, 'ai/reports/LATEST.md'),
  budget: path.join(root, 'ai/state/budget.json'),
};