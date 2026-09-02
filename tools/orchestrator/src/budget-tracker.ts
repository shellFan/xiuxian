/**
 * Budget Tracker — Tracks OpenAI and Cursor API call counts and token usage.
 * Stops the orchestrator when budget is exceeded.
 */
import fs from 'fs';
import { files, config } from './config';
import { BudgetState, BudgetCallLog } from './types';

function defaultState(): BudgetState {
  return {
    openaiCalls: 0,
    cursorCalls: 0,
    maxOpenaiCalls: config.maxOpenaiCalls,
    maxCursorCalls: config.maxCursorCalls,
    totalTokensUsed: 0,
    callLog: [],
  };
}

export function readBudget(): BudgetState {
  if (!fs.existsSync(files.budget)) return defaultState();
  try {
    const saved = JSON.parse(fs.readFileSync(files.budget, 'utf8')) as Partial<BudgetState>;
    return { ...defaultState(), ...saved };
  } catch {
    return defaultState();
  }
}

export function writeBudget(state: BudgetState): void {
  // Keep only last 100 call log entries to prevent unbounded growth
  const trimmed: BudgetState = {
    ...state,
    callLog: state.callLog.slice(-100),
  };
  fs.mkdirSync(require('path').dirname(files.budget), { recursive: true });
  fs.writeFileSync(files.budget, JSON.stringify(trimmed, null, 2));
}

export function recordCall(type: 'openai' | 'cursor', model: string, durationMs: number, tokensUsed?: number): BudgetState {
  const state = readBudget();
  if (type === 'openai') state.openaiCalls++;
  else state.cursorCalls++;
  if (tokensUsed) state.totalTokensUsed += tokensUsed;
  state.callLog.push({ type, model, durationMs, timestamp: new Date().toISOString(), tokensUsed });
  writeBudget(state);
  return state;
}

export function isBudgetExceeded(state?: BudgetState): boolean {
  const s = state || readBudget();
  return s.openaiCalls >= s.maxOpenaiCalls || s.cursorCalls >= s.maxCursorCalls;
}

export function budgetSummary(state?: BudgetState): string {
  const s = state || readBudget();
  return `OpenAI: ${s.openaiCalls}/${s.maxOpenaiCalls} | Cursor: ${s.cursorCalls}/${s.maxCursorCalls} | Tokens: ${s.totalTokensUsed}`;
}

export function resetBudget(): void {
  writeBudget(defaultState());
}