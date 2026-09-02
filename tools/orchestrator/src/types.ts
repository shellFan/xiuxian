// ============================================================
// AI Development Orchestrator V2 — Core Types
// ============================================================

// --- Task Lifecycle States ---
export type TaskStatus =
  | 'PENDING' | 'PLANNING' | 'RUNNING' | 'DEVELOPER_DONE'
  | 'REVIEW' | 'FIXING' | 'PASS' | 'DONE'
  | 'FAILED' | 'ESCALATED' | 'MANUAL_GATE';

export type ReviewResult = 'PASS' | 'REQUEST_CHANGES';
export type ReviewVerdict = 'PASS' | 'REQUEST_CHANGES' | 'ESCALATE';
export type FindingSeverity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW';
export type StopReason =
  | 'MAX_TASKS' | 'MAX_RUNTIME' | 'PHASE_COMPLETE' | 'PHASE_COMPLETE_PENDING_APPROVAL'
  | 'NO_TASK' | 'MANUAL_VERIFY_REQUIRED' | 'BUDGET_EXCEEDED'
  | 'BLOCKER' | 'HIGH_UNRESOLVED' | 'ESCALATED'
  | 'SECRET_DETECTED' | 'DANGEROUS_GIT' | 'BRANCH_CHANGED'
  | 'MAIN_MODIFIED' | 'REVIEW_ROUNDS_EXCEEDED'
  | 'OPENAI_UNAVAILABLE' | 'CURSOR_UNAVAILABLE'
  | 'STOP_REQUESTED' | 'ERROR';

// --- Existing Types (backward-compatible) ---
export interface Commands { install: string; build: string; test: string; lint: string }

export interface Task {
  id: string; title: string; version: number; status: TaskStatus;
  priority: string; createdBy: string; assignedTo: string; reviewer: string;
  goal: string; background: string; requirements: string[];
  acceptanceCriteria: string[]; allowedPaths: string[]; forbiddenPaths: string[];
  commands: Commands; constraints: string[]; references: string[];
  maxReviewRounds: number;
  // V2 extensions (optional for backward compat)
  phase?: number;
  goalMinutes?: number;
  stopConditions?: string[];
  gitPolicy?: { autoCommit?: boolean; autoPush?: boolean; requireCleanTree?: boolean };
  [key: string]: unknown;
}

export interface DeveloperResult {
  taskId: string; status: 'DONE' | 'FAILED' | 'READY_FOR_REVIEW';
  summary: string; changedFiles: string[]; createdFiles: string[]; deletedFiles: string[];
  tests: string[]; build: { passed: boolean; details: string };
  knownIssues: string[]; outOfScopeFindings: string[];
  // V2 extensions
  commits?: string[]; gitStatus?: string; pushStatus?: string;
}

export interface Review {
  taskId: string; result: ReviewResult; summary: string;
  blocker: string[]; high: string[]; medium: string[]; low: string[];
  requiredFixes: string[];
  tests: { passed: boolean; details: string };
  architecture: string; performance: string; security: string;
  outOfScopeFindings: string[];
  // V2 extensions
  verdict?: ReviewVerdict;
  findings?: ReviewFinding[];
  acceptance?: string[];
  nextAction?: string;
}

export interface ReviewFinding {
  severity: FindingSeverity;
  file: string; line: number; title: string; detail: string; requiredFix: string;
}

export interface AgentExecutionResult<T> {
  success: boolean; exitCode: number | null; timedOut: boolean;
  durationMs: number; stdout: string; stderr: string;
  result?: T; errorKind?: 'CLI_NOT_FOUND' | 'TIMEOUT' | 'CANCELLED'
    | 'NONZERO_EXIT' | 'INVALID_RESULT' | 'IO_ERROR'
    | 'OPENAI_MODEL_UNAVAILABLE' | 'REVIEW_INVALID_JSON'
    | 'DEVELOPER_INVALID_RESULT' | 'DEVELOPER_TIMEOUT'
    | 'PUSH_PENDING' | 'REVIEW_TOO_LARGE' | 'STOP_BUDGET';
}

export interface GitBaseline {
  head: string; branch: string; status: string;
  trackedDiff: string; untracked: string[]; dirtyFiles: string[];
}

export interface GitDelta { changedFiles: string[]; patch: string }

// --- V2 Provider Interfaces ---
export interface PlannerProvider {
  planNextTask(context: PlannerContext, signal?: AbortSignal): Promise<PlannerResult>;
}

export interface DeveloperAdapter {
  runTask(task: Task, context: string, signal?: AbortSignal): Promise<AgentExecutionResult<DeveloperResult>>;
}

export interface ReviewerAdapter {
  review(task: Task, context: string, round: number, signal?: AbortSignal): Promise<AgentExecutionResult<Review>>;
}

export interface NotificationProvider {
  notify(event: string, detail: string): void;
}

// --- V2 Context Types ---
export interface PlannerContext {
  phase: PhaseState;
  recentReports: string[];
  taskStatus: TaskStatusSummary[];
  gitLog: string;
  agentsMd: string;
  lastReview?: string;
  fileTree?: string;
}

export interface TaskStatusSummary {
  id: string; status: TaskStatus; priority: string; title: string;
}

export interface PlannerResult {
  task: Task | null;
  reason: string;
  stopReason?: StopReason;
}

export interface ReviewerContext {
  task: Task;
  baseSha: string; headSha: string;
  diff: string; changedFiles: string[];
  testOutput: string; buildOutput: string;
  developerResult: DeveloperResult;
  keyFiles: Record<string, string>;
}

// --- V2 State Types ---
export interface PhaseState {
  currentPhase: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE_PENDING_APPROVAL' | 'COMPLETE';
  manualGates: Record<string, 'PENDING' | 'PASS' | 'FAIL'>;
  approvedBy?: string;
  approvedAt?: string;
}

export interface CheckpointState {
  taskId: string;
  baseSha: string;
  currentSha: string;
  round: number;
  phase: number;
  startedAt: string;
  lastAction: string;
  lastActionAt: string;
  reviewRounds: number;
  openaiCalls: number;
  cursorCalls: number;
}

export interface OrchestratorLock {
  pid: number;
  startedAt: string;
  hostname: string;
}

export interface BudgetState {
  openaiCalls: number;
  cursorCalls: number;
  maxOpenaiCalls: number;
  maxCursorCalls: number;
  totalTokensUsed: number;
  callLog: BudgetCallLog[];
}

export interface BudgetCallLog {
  type: 'openai' | 'cursor';
  model: string;
  durationMs: number;
  timestamp: string;
  tokensUsed?: number;
}

export interface RunReport {
  startedAt: string;
  endedAt?: string;
  tasksCompleted: number;
  tasksFailed: number;
  tasksEscalated: number;
  commits: string[];
  reviews: number;
  fixRounds: number;
  currentPhase: number;
  manualGates: Record<string, string>;
  stopReason?: StopReason;
  tasks: TaskReport[];
}

export interface TaskReport {
  taskId: string;
  title: string;
  status: TaskStatus;
  reviewRounds: number;
  commits: string[];
  filesChanged: string[];
  testsPassed: boolean;
  buildPassed: boolean;
  durationMs: number;
  findings?: ReviewFinding[];
}

export interface DoctorCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  message: string;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DoctorCheck[];
  errors: string[];
  warnings: string[];
  fixes: string[];
}