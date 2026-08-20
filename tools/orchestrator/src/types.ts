export type TaskStatus = 'PENDING'|'RUNNING'|'REVIEW'|'FIXING'|'DONE'|'FAILED'|'ESCALATED';
export type ReviewResult = 'PASS'|'REQUEST_CHANGES';
export interface Commands { install:string; build:string; test:string; lint:string }
export interface Task { id:string; title:string; version:number; status:TaskStatus; priority:string; createdBy:string; assignedTo:string; reviewer:string; goal:string; background:string; requirements:string[]; acceptanceCriteria:string[]; allowedPaths:string[]; forbiddenPaths:string[]; commands:Commands; constraints:string[]; references:string[]; maxReviewRounds:number; [key:string]: unknown }
export interface DeveloperResult { taskId:string; status:'DONE'|'FAILED'; summary:string; changedFiles:string[]; createdFiles:string[]; deletedFiles:string[]; tests:string[]; build:{passed:boolean;details:string}; knownIssues:string[]; outOfScopeFindings:string[] }
export interface Review { taskId:string; result:ReviewResult; summary:string; blocker:string[]; high:string[]; medium:string[]; low:string[]; requiredFixes:string[]; tests:{passed:boolean;details:string}; architecture:string; performance:string; security:string; outOfScopeFindings:string[] }
export interface AgentExecutionResult<T> { success:boolean; exitCode:number|null; timedOut:boolean; durationMs:number; stdout:string; stderr:string; result?:T; errorKind?:'CLI_NOT_FOUND'|'TIMEOUT'|'CANCELLED'|'NONZERO_EXIT'|'INVALID_RESULT'|'IO_ERROR' }
export interface GitBaseline { head:string; branch:string; status:string; trackedDiff:string; untracked:string[]; dirtyFiles:string[] }
export interface GitDelta { changedFiles:string[]; patch:string }
export interface DeveloperAdapter { runTask(task:Task, context:string, signal?:AbortSignal):Promise<AgentExecutionResult<DeveloperResult>> }
export interface ReviewerAdapter { review(task:Task, context:string, round:number, signal?:AbortSignal):Promise<AgentExecutionResult<Review>> }
