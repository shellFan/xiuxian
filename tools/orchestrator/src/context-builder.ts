/**
 * ContextBuilder — Builds smart, size-limited context for OpenAI Planner and Reviewer prompts.
 * Avoids sending the entire repo; only sends relevant context.
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, root } from './config';
import { redactSecrets } from './secret-redactor';

const MAX_CONTEXT_CHARS = 80000; // ~20k tokens
const MAX_DIFF_CHARS = 30000;
const MAX_FILE_CHARS = 5000;

function truncate(text: string, max: number, label: string): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... [${label} truncated: ${text.length} -> ${max} chars]`;
}

function readFileSafe(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    if (stat.size > 100000) return `[File too large: ${stat.size} bytes]`;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Build context for the Planner.
 * Includes: AGENTS.md, phase state, recent reports, git log, task status, file tree.
 */
export function buildPlannerContext(phase: { currentPhase: number; status: string }, recentReports: string[], taskStatus: { id: string; status: string; priority: string; title: string }[]): string {
  const parts: string[] = [];

  // AGENTS.md
  const agentsMd = readFileSafe(path.join(root, 'AGENTS.md'));
  if (agentsMd) parts.push(`# AGENTS.md\n${truncate(agentsMd, 5000, 'AGENTS.md')}`);

  // Phase state
  parts.push(`# Current Phase\nPhase: ${phase.currentPhase}\nStatus: ${phase.status}`);

  // Recent reports (last 3)
  for (const report of recentReports.slice(-3)) {
    parts.push(`# Report: ${report}\n${truncate(readFileSafe(path.join(dirs.reports, report)), 3000, 'report')}`);
  }

  // Task status summary
  const statusLines = taskStatus.map(t => `  ${t.id} [${t.priority}] ${t.status}: ${t.title}`);
  parts.push(`# Task Status\n${statusLines.join('\n')}`);

  // File tree (top 2 levels, limited)
  parts.push(`# File Tree (top-level)\n${getFileTree()}`);

  return redactSecrets(truncate(parts.join('\n\n---\n\n'), MAX_CONTEXT_CHARS, 'Planner context'));
}

/**
 * Build context for the Reviewer.
 * Includes: task, diff, changed files content, test/build results, developer result.
 */
export function buildReviewerContext(
  task: { id: string; title: string; goal: string; acceptanceCriteria: string[] },
  diff: string,
  changedFiles: string[],
  testOutput: string,
  buildOutput: string,
  developerResult: { summary: string; knownIssues: string[] },
  keyFiles?: Record<string, string>,
): string {
  const parts: string[] = [];

  // Task
  parts.push(`# Task: ${task.id} — ${task.title}\nGoal: ${task.goal}\nAcceptance Criteria:\n${task.acceptanceCriteria.map(a => `- ${a}`).join('\n')}`);

  // Diff
  parts.push(`# Git Diff\n${truncate(redactSecrets(diff), MAX_DIFF_CHARS, 'diff')}`);

  // Changed files content (limited)
  const fileContents = changedFiles.slice(0, 20).map(f => {
    const fullPath = path.join(root, f);
    const content = readFileSafe(fullPath);
    if (!content) return '';
    return `## ${f}\n${truncate(redactSecrets(content), MAX_FILE_CHARS, f)}`;
  }).filter(Boolean);
  if (fileContents.length) parts.push(`# Changed Files\n${fileContents.join('\n\n')}`);

  // Key files from developer
  if (keyFiles) {
    const keyContent = Object.entries(keyFiles).slice(0, 10).map(([name, content]) =>
      `## ${name}\n${truncate(redactSecrets(content), MAX_FILE_CHARS, name)}`
    ).join('\n\n');
    if (keyContent) parts.push(`# Key Files\n${keyContent}`);
  }

  // Test & Build output
  if (testOutput) parts.push(`# Test Output\n${truncate(testOutput, 5000, 'test output')}`);
  if (buildOutput) parts.push(`# Build Output\n${truncate(buildOutput, 5000, 'build output')}`);

  // Developer result
  parts.push(`# Developer Result\nSummary: ${developerResult.summary}\nKnown Issues: ${developerResult.knownIssues.join('; ') || 'none'}`);

  return redactSecrets(truncate(parts.join('\n\n---\n\n'), MAX_CONTEXT_CHARS, 'Reviewer context'));
}

/**
 * Build developer prompt context for Cursor CLI.
 * Optionally accepts orchestrator context (fix findings, verification results).
 */
export function buildDeveloperContext(
  task: { id: string; title: string; goal: string; requirements: string[]; acceptanceCriteria: string[]; allowedPaths: string[]; forbiddenPaths: string[]; commands: { install: string; build: string; test: string; lint: string } },
  priorReview?: string,
  orchestratorContext?: string,
): string {
  const parts: string[] = [];

  parts.push(`# Task: ${task.id} — ${task.title}`);
  parts.push(`Goal: ${task.goal}`);
  parts.push(`Requirements:\n${task.requirements.map(r => `- ${r}`).join('\n')}`);
  parts.push(`Acceptance Criteria:\n${task.acceptanceCriteria.map(a => `- ${a}`).join('\n')}`);
  parts.push(`Allowed Paths: ${task.allowedPaths.join(', ')}`);
  parts.push(`Forbidden Paths: ${task.forbiddenPaths.join(', ')}`);
  parts.push(`Commands: install=${task.commands.install} build=${task.commands.build} test=${task.commands.test} lint=${task.commands.lint}`);

  // AGENTS.md (abbreviated)
  const agentsMd = readFileSafe(path.join(root, 'AGENTS.md'));
  if (agentsMd) parts.push(`# AGENTS.md (abbreviated)\n${truncate(agentsMd, 3000, 'AGENTS.md')}`);

  if (priorReview) parts.push(`# Prior Review Findings (fix these)\n${truncate(priorReview, 5000, 'review')}`);

  // Orchestrator context (fix context, verification results, etc.)
  if (orchestratorContext) parts.push(`# Orchestrator Instructions (MUST follow)\n${truncate(orchestratorContext, 10000, 'orchestrator context')}`);

  return redactSecrets(parts.join('\n\n'));
}

function getFileTree(): string {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && d.name !== 'node_modules' && d.name !== 'library' && d.name !== 'temp')
      .map(d => d.isDirectory() ? `${d.name}/` : d.name);
    return entries.slice(0, 50).join('\n');
  } catch {
    return '(unable to read file tree)';
  }
}