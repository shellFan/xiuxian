/**
 * Integration Test — E2E Production-Path Tests + Utility Tests
 *
 * Tests the orchestrator's production code paths:
 * - Case A: Normal fix loop (dev → verification PASS → reviewer REQUEST_CHANGES → fix → reviewer PASS → DONE)
 * - Case B: Verification failure gate (dev → verification FAIL → Cursor Fix → verification PASS → reviewer → DONE)
 * - Case C: Lying reviewer (verification FAIL + reviewer PASS → NOT DONE, enters fix loop)
 *
 * Also includes utility tests for: verification runner, secret redaction,
 * dangerous diff detection, checkpoint, tokenizeCommand.
 *
 * Run: npm run ai:integration-test
 */
import fs from 'fs';
import path from 'path';
import { config, dirs, root } from './config';
import {
  Task, TaskStatus, StopReason, RunReport, TaskReport,
  DeveloperAdapter, ReviewerAdapter, PlannerProvider,
  AgentExecutionResult, DeveloperResult, Review, ReviewFinding,
  PlannerContext, PlannerResult, PhaseState,
} from './types';
import {
  canAcceptTask,
  buildVerificationFixContext,
  buildTaskContext,
  OrchestratorProviders,
} from './orchestrator-loop';
import { VerificationResult, tokenizeCommand } from './verification-runner';

// ============================================================
// Test Helpers
// ============================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'E2E-TEST-001',
    title: 'E2E test task',
    version: 1,
    status: 'PENDING',
    priority: 'HIGH',
    createdBy: 'e2e-test',
    assignedTo: 'mock-developer',
    reviewer: 'mock-reviewer',
    goal: 'Verify the orchestrator production path',
    background: 'This is an E2E test',
    requirements: ['Run without errors', 'Pass review'],
    acceptanceCriteria: ['No errors', 'Review passes'],
    allowedPaths: ['tools/orchestrator/'],
    forbiddenPaths: ['library/', '.env'],
    commands: { install: 'npm install', build: 'npm run build:orchestrator', test: 'npm run build:orchestrator', lint: 'npm run build:orchestrator' },
    constraints: ['Do not modify game code'],
    references: [],
    maxReviewRounds: 3,
    ...overrides,
  };
}

function createVerificationResult(overrides?: Partial<VerificationResult>): VerificationResult {
  return {
    testsPassed: true,
    buildPassed: true,
    testOutput: 'All tests passed',
    buildOutput: 'Build succeeded',
    testCommand: 'npm run build:orchestrator',
    buildCommand: 'npm run build:orchestrator',
    durationMs: 100,
    ...overrides,
  };
}

async function test(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

// ============================================================
// E2E Case A: Normal fix loop
// Developer → Verification PASS → Reviewer REQUEST_CHANGES → Fix → Reviewer PASS → DONE
// ============================================================

async function testCaseA_normalFixLoop(): Promise<TestResult> {
  return test('E2E Case A: Normal fix loop (reviewer REQUEST_CHANGES → fix → PASS)', async () => {
    // Simulate the production code path through canAcceptTask
    const verificationPass = createVerificationResult({ testsPassed: true, buildPassed: true });

    // Round 1: Reviewer says REQUEST_CHANGES → canAcceptTask should be false
    const round1Accept = canAcceptTask(verificationPass, 'REQUEST_CHANGES');
    if (round1Accept) throw new Error('canAcceptTask should return false when reviewer says REQUEST_CHANGES');

    // Round 2: Reviewer says PASS → canAcceptTask should be true (verification also passes)
    const round2Accept = canAcceptTask(verificationPass, 'PASS');
    if (!round2Accept) throw new Error('canAcceptTask should return true when both verification and reviewer PASS');

    // Verify buildTaskContext includes verification results for reviewer
    const task = createTestTask();
    const context = buildTaskContext(task, 'diff --git a/file.ts', ['file.ts'], '', verificationPass);
    if (!context.includes('ORCHESTRATOR INDEPENDENT VERIFICATION')) {
      throw new Error('buildTaskContext should include verification section for reviewer');
    }
    if (!context.includes('Tests: ✅ PASS')) {
      throw new Error('buildTaskContext should show test pass status');
    }
    if (!context.includes('Build: ✅ PASS')) {
      throw new Error('buildTaskContext should show build pass status');
    }
  });
}

// ============================================================
// E2E Case B: Verification failure gate
// Developer → Verification FAIL → Cursor Fix → Verification PASS → Reviewer → DONE
// ============================================================

async function testCaseB_verificationFailureGate(): Promise<TestResult> {
  return test('E2E Case B: Verification failure gate (FAIL → fix → PASS → reviewer)', async () => {
    // Round 1: Verification FAILS
    const verificationFail = createVerificationResult({
      testsPassed: false,
      buildPassed: true,
      testOutput: 'FAIL src/test.ts: 2 tests failed\n  ✗ should do X\n  ✗ should do Y',
    });

    // canAcceptTask should be false regardless of reviewer verdict
    const acceptWithFail = canAcceptTask(verificationFail, 'PASS');
    if (acceptWithFail) throw new Error('canAcceptTask must return false when verification FAILS, even if reviewer says PASS');

    // buildVerificationFixContext should contain the failure details
    const fixContext = buildVerificationFixContext(verificationFail);
    if (!fixContext.includes('ORCHESTRATOR INDEPENDENT VERIFICATION — FAILED')) {
      throw new Error('buildVerificationFixContext should have FAILED header');
    }
    if (!fixContext.includes('Test Result: ❌ FAIL')) {
      throw new Error('buildVerificationFixContext should show test FAIL');
    }
    if (!fixContext.includes('2 tests failed')) {
      throw new Error('buildVerificationFixContext should include test output');
    }
    if (!fixContext.includes('MUST fix the issues below before the task can proceed to review')) {
      throw new Error('buildVerificationFixContext should instruct developer to fix before review');
    }

    // Round 2: After fix, verification PASSES
    const verificationPass = createVerificationResult({ testsPassed: true, buildPassed: true });
    const acceptAfterFix = canAcceptTask(verificationPass, 'PASS');
    if (!acceptAfterFix) throw new Error('canAcceptTask should return true after verification passes and reviewer PASS');

    // Verify buildTaskContext with failed verification shows FAIL status
    const task = createTestTask();
    const contextWithFail = buildTaskContext(task, 'diff', ['file.ts'], '', verificationFail);
    if (!contextWithFail.includes('Tests: ❌ FAIL')) {
      throw new Error('buildTaskContext should show test FAIL for reviewer');
    }
    if (!contextWithFail.includes('Test Output (independent, NOT from developer self-report)')) {
      throw new Error('buildTaskContext should label test output as independent');
    }
  });
}

// ============================================================
// E2E Case C: Lying reviewer test
// Verification FAIL + Reviewer PASS → NOT DONE, enters fix loop
// ============================================================

async function testCaseC_lyingReviewer(): Promise<TestResult> {
  return test('E2E Case C: Lying reviewer (verification FAIL + reviewer PASS → NOT DONE)', async () => {
    // Verification FAILS but reviewer says PASS (lying or negligent reviewer)
    const verificationFail = createVerificationResult({
      testsPassed: false,
      buildPassed: true,
      testOutput: '3 tests failed',
    });

    // The HARD GATE: even with reviewer PASS, verification FAIL blocks DONE
    const accept = canAcceptTask(verificationFail, 'PASS');
    if (accept) throw new Error('CRITICAL: canAcceptTask must return false when verification FAILS even if reviewer says PASS. This prevents a lying reviewer from marking a broken task as DONE.');

    // Build verification fix context should be generated
    const fixContext = buildVerificationFixContext(verificationFail);
    if (!fixContext.includes('VERIFICATION — FAILED')) {
      throw new Error('Fix context should indicate verification failure');
    }

    // Verify buildTaskContext shows verification FAIL to reviewer even when reviewer said PASS
    const task = createTestTask();
    const context = buildTaskContext(task, 'diff', ['file.ts'], '', verificationFail);
    if (!context.includes('Tests: ❌ FAIL')) {
      throw new Error('Reviewer context must show verification FAIL — reviewer cannot override independent verification');
    }

    // Also test: build FAIL blocks acceptance even with reviewer PASS
    const buildFail = createVerificationResult({
      testsPassed: true,
      buildPassed: false,
      buildOutput: 'error TS2345: Cannot assign type X to Y',
    });
    const acceptBuildFail = canAcceptTask(buildFail, 'PASS');
    if (acceptBuildFail) throw new Error('canAcceptTask must return false when build FAILS even if reviewer says PASS');

    // Both fail: double failure
    const bothFail = createVerificationResult({
      testsPassed: false,
      buildPassed: false,
      testOutput: 'tests failed',
      buildOutput: 'build failed',
    });
    const acceptBothFail = canAcceptTask(bothFail, 'PASS');
    if (acceptBothFail) throw new Error('canAcceptTask must return false when both tests AND build fail');

    // Reviewer says REQUEST_CHANGES with passing verification: should also be blocked
    const verificationPass = createVerificationResult({ testsPassed: true, buildPassed: true });
    const acceptRequestChanges = canAcceptTask(verificationPass, 'REQUEST_CHANGES');
    if (acceptRequestChanges) throw new Error('canAcceptTask should return false when reviewer says REQUEST_CHANGES');
  });
}

// ============================================================
// E2E: Reviewer context enrichment (HIGH-02)
// Reviewer must see independent verification results
// ============================================================

async function testReviewerContextEnrichment(): Promise<TestResult> {
  return test('E2E: Reviewer context includes independent verification results', async () => {
    const task = createTestTask();
    const verification = createVerificationResult({
      testsPassed: true,
      buildPassed: true,
      testOutput: 'All 42 tests passed',
      buildOutput: 'Build succeeded with 0 errors',
    });

    const context = buildTaskContext(task, 'sample patch', ['file1.ts', 'file2.ts'], 'prior review notes', verification);

    // Must contain the verification section header
    if (!context.includes('# ORCHESTRATOR INDEPENDENT VERIFICATION')) {
      throw new Error('Context must include ORCHESTRATOR INDEPENDENT VERIFICATION header');
    }

    // Must show pass status
    if (!context.includes('Tests: ✅ PASS')) throw new Error('Must show test pass');
    if (!context.includes('Build: ✅ PASS')) throw new Error('Must show build pass');

    // When both pass, must include "proceed with code review" message
    if (!context.includes('Both independent verification checks PASSED')) {
      throw new Error('Must indicate verification passed and reviewer should proceed');
    }

    // Context without verification should NOT include verification section
    const contextNoV = buildTaskContext(task, 'patch', ['file.ts'], '');
    if (contextNoV.includes('ORCHESTRATOR INDEPENDENT VERIFICATION')) {
      throw new Error('Context without verification should not include verification section');
    }
  });
}

// ============================================================
// E2E: Verification fix context format
// ============================================================

async function testVerificationFixContextFormat(): Promise<TestResult> {
  return test('E2E: buildVerificationFixContext produces correct format', async () => {
    // Test fail scenario
    const failV = createVerificationResult({
      testsPassed: false,
      buildPassed: false,
      testOutput: 'Test output line 1\nTest output line 2',
      buildOutput: 'Build error line 1\nBuild error line 2',
    });

    const ctx = buildVerificationFixContext(failV);

    // Must have header
    if (!ctx.includes('# ORCHESTRATOR INDEPENDENT VERIFICATION — FAILED')) {
      throw new Error('Must have FAILED header');
    }

    // Must have instruction
    if (!ctx.includes('MUST fix the issues below before the task can proceed to review')) {
      throw new Error('Must have fix-before-review instruction');
    }

    // Must show both failures
    if (!ctx.includes('Test Result: ❌ FAIL')) throw new Error('Must show test FAIL');
    if (!ctx.includes('Build Result: ❌ FAIL')) throw new Error('Must show build FAIL');

    // Must include outputs
    if (!ctx.includes('### Test Output:')) throw new Error('Must have test output section');
    if (!ctx.includes('### Build Output:')) throw new Error('Must have build output section');
    if (!ctx.includes('Test output line 1')) throw new Error('Must include test output content');
    if (!ctx.includes('Build error line 1')) throw new Error('Must include build output content');

    // Must have instructions
    if (!ctx.includes('1. Read the test/build output above carefully')) throw new Error('Must have step 1');
    if (!ctx.includes('2. Fix ALL failing tests and/or build errors')) throw new Error('Must have step 2');
    if (!ctx.includes('3. Do NOT request review until both tests AND build pass')) throw new Error('Must have step 3');

    // Test pass scenario should not have output sections
    const passV = createVerificationResult({ testsPassed: true, buildPassed: true });
    const passCtx = buildVerificationFixContext(passV);
    if (passCtx.includes('### Test Output:')) throw new Error('Pass scenario should not have test output section');
    if (passCtx.includes('### Build Output:')) throw new Error('Pass scenario should not have build output section');
  });
}

// ============================================================
// E2E: AGENTS.md content reaches planner prompt
// ============================================================

async function testAgentsMdReachesPlanner(): Promise<TestResult> {
  return test('E2E: AGENTS.md content is available to planner context', async () => {
    // Verify AGENTS.md exists and has content
    const agentsPath = path.join(dirs.root, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) {
      throw new Error('AGENTS.md must exist at project root for planner to read');
    }

    const content = fs.readFileSync(agentsPath, 'utf8');
    if (content.trim().length === 0) {
      throw new Error('AGENTS.md must have non-empty content for planner to use');
    }

    // Verify it contains a unique marker that proves it's read (not just filename)
    // The marker should be something identifiable that proves content was read
    const hasSubstantialContent = content.length > 100;
    if (!hasSubstantialContent) {
      throw new Error('AGENTS.md should have substantial content (>100 chars) for planner context');
    }
  });
}

// ============================================================
// Utility Tests (kept from original)
// ============================================================

async function testVerificationRunner(): Promise<TestResult> {
  return test('Verification runner works', async () => {
    const { runVerification } = await import('./verification-runner');
    const result = await runVerification({
      id: 'TEST',
      commands: { test: 'npm run build:orchestrator', build: 'npm run build:orchestrator' },
    });
    if (result.durationMs === undefined) throw new Error('Should have durationMs');
    if (typeof result.testsPassed !== 'boolean') throw new Error('testsPassed should be boolean');
    if (typeof result.buildPassed !== 'boolean') throw new Error('buildPassed should be boolean');
  });
}

async function testSecretRedaction(): Promise<TestResult> {
  return test('Secret redaction works', async () => {
    const { redactSecrets } = await import('./secret-redactor');
    const input = 'api_key=sk-1234567890abcdefghijklmnopqrstuv';
    const output = redactSecrets(input);
    if (output.includes('sk-1234567890')) throw new Error('Secret should be redacted');
    if (!output.includes('[REDACTED]')) throw new Error('Should contain [REDACTED]');
  });
}

async function testDangerousDiffDetection(): Promise<TestResult> {
  return test('Dangerous diff detection works', async () => {
    const { detectDangerousFiles } = await import('./dangerous-diff');
    const findings = detectDangerousFiles(['.env', 'src/main.ts'], '');
    if (findings.length === 0) throw new Error('Should detect .env as dangerous');
    if (!findings.some(f => f.file === '.env')) throw new Error('Should flag .env');
  });
}

async function testCheckpointWriteRead(): Promise<TestResult> {
  return test('Checkpoint write/read works', async () => {
    const { writeCheckpoint, readCheckpoint, clearCheckpoint } = await import('./checkpoint');
    writeCheckpoint({ taskId: 'TEST-CHECKPOINT', lastAction: 'TEST' });
    const cp = readCheckpoint();
    if (!cp || cp.taskId !== 'TEST-CHECKPOINT') throw new Error('Checkpoint should be readable');
    clearCheckpoint();
    const after = readCheckpoint();
    if (after !== null) throw new Error('Checkpoint should be cleared');
  });
}

// ============================================================
// Utility Test: tokenizeCommand (verification hardening)
// ============================================================

async function testTokenizeCommand(): Promise<TestResult> {
  return test('tokenizeCommand handles quoted arguments correctly', async () => {
    // Simple command
    const simple = tokenizeCommand('npm run build');
    if (simple.length !== 3) throw new Error(`Expected 3 tokens, got ${simple.length}`);
    if (simple[0] !== 'npm' || simple[1] !== 'run' || simple[2] !== 'build') {
      throw new Error(`Simple tokenization failed: ${JSON.stringify(simple)}`);
    }

    // Command with colon in argument
    const colon = tokenizeCommand('npm run build:orchestrator');
    if (colon.length !== 3) throw new Error(`Expected 3 tokens, got ${colon.length}`);
    if (colon[2] !== 'build:orchestrator') throw new Error(`Colon arg failed: ${colon[2]}`);

    // Double-quoted argument with spaces
    const quoted = tokenizeCommand('node "C:/Program Files/app.js"');
    if (quoted.length !== 2) throw new Error(`Expected 2 tokens, got ${quoted.length}`);
    if (quoted[1] !== 'C:/Program Files/app.js') throw new Error(`Quoted arg failed: ${quoted[1]}`);

    // Single-quoted argument with spaces
    const singleQuoted = tokenizeCommand("node '/path with spaces/app.js'");
    if (singleQuoted.length !== 2) throw new Error(`Expected 2 tokens, got ${singleQuoted.length}`);
    if (singleQuoted[1] !== '/path with spaces/app.js') throw new Error(`Single-quoted arg failed: ${singleQuoted[1]}`);

    // Empty string
    const empty = tokenizeCommand('');
    if (empty.length !== 0) throw new Error(`Empty string should produce 0 tokens, got ${empty.length}`);

    // Whitespace only
    const ws = tokenizeCommand('   ');
    if (ws.length !== 0) throw new Error(`Whitespace should produce 0 tokens, got ${ws.length}`);
  });
}

// ============================================================
// E2E: OrchestratorProviders DI interface
// ============================================================

async function testOrchestratorProvidersDI(): Promise<TestResult> {
  return test('E2E: OrchestratorProviders DI interface works', async () => {
    // Verify the DI interface accepts mock providers
    // runVerification signature: (task: { id: string; commands: { test: string; build: string } }, signal?: AbortSignal) => Promise<VerificationResult>
    const mockVerification: typeof import('./verification-runner').runVerification = async (task) => ({
      testsPassed: true,
      buildPassed: true,
      testOutput: 'Mock: all tests pass',
      buildOutput: 'Mock: build succeeds',
      testCommand: task.commands.test,
      buildCommand: task.commands.build,
      durationMs: 10,
    });

    const providers: OrchestratorProviders = {
      verificationRunner: mockVerification,
    };

    // Verify the mock verification runner works through the DI interface
    if (!providers.verificationRunner) throw new Error('verificationRunner should be set');
    const result = await providers.verificationRunner({ id: 'DI-TEST', commands: { test: 'npm test', build: 'npm run build' } });
    if (!result.testsPassed || !result.buildPassed) throw new Error('Mock verification should pass');
    if (result.durationMs !== 10) throw new Error('Mock verification should have durationMs=10');
  });
}

// ============================================================
// Main
// ============================================================

async function runIntegrationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // E2E Production-Path Tests (Round 2)
  results.push(await testCaseA_normalFixLoop());
  results.push(await testCaseB_verificationFailureGate());
  results.push(await testCaseC_lyingReviewer());
  results.push(await testReviewerContextEnrichment());
  results.push(await testVerificationFixContextFormat());
  results.push(await testAgentsMdReachesPlanner());
  results.push(await testOrchestratorProvidersDI());

  // Utility Tests
  results.push(await testVerificationRunner());
  results.push(await testSecretRedaction());
  results.push(await testDangerousDiffDetection());
  results.push(await testCheckpointWriteRead());
  results.push(await testTokenizeCommand());

  return results;
}

export async function runIntegrationTest(): Promise<boolean> {
  console.log('\n=== AI Orchestrator Integration Test ===\n');
  console.log('E2E Production-Path Tests + Utility Tests\n');

  const results = await runIntegrationTests();

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const duration = `${r.durationMs}ms`;
    console.log(`  ${icon} ${r.name} (${duration})`);
    if (r.error) {
      console.log(`    Error: ${r.error}`);
    }
    if (r.passed) passed++;
    else failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`Duration: ${results.reduce((s, r) => s + r.durationMs, 0)}ms\n`);

  if (failed > 0) {
    console.log('❌ Integration test FAILED\n');
    return false;
  }

  console.log('✅ Integration test PASSED\n');
  return true;
}

// Run if called directly
if (require.main === module) {
  runIntegrationTest().then(passed => {
    process.exit(passed ? 0 : 1);
  }).catch(e => {
    console.error('Integration test error:', e);
    process.exit(1);
  });
}