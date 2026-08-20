# AI Automation Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在空仓库中搭建具备状态机、Git 增量保护、文件落盘结果协议、Mock Review Loop 和 CLI Adapter 的本机 AI 自动化基础设施。

**Architecture:** Node.js + TypeScript 编排器按文件目录管理任务生命周期，Adapter 隔离 Developer/Reviewer Provider，Git baseline 只计算本次执行增量。Ajv 校验任务和 Review 结果，Mock Adapter 驱动可重复的端到端自检。

**Tech Stack:** Node.js, TypeScript, Ajv, dotenv, `child_process.spawn`, npm scripts。

## Global Constraints

- 不实现游戏业务，不修改或引入 Cocos 工程。
- 状态目录固定为 `pending/running/review/fixing/done/failed/escalated`，目录与 JSON `status` 一致。
- Developer 只能修改 `allowedPaths`，禁止 `forbiddenPaths`；路径检查只针对 Agent 相对于 pre-run baseline 的增量。
- pre-existing dirty files 默认阻断；不执行 stash、checkout、restore、reset。
- Developer/Reviewer 结果优先读取 `ai/state/<TASK-ID>/...json`，stdout JSON 仅 fallback。
- `FAILED` 表示执行/基础设施错误；`ESCALATED` 只表示正常 Review Loop 超过最大整改轮次。
- 默认 `AI_AUTO_COMMIT=false`，禁止危险命令、自动 push 和自动 merge。

## File Map

- Create root config/docs: `AGENTS.md`, `package.json`, `.env.example`, `.gitignore`, `ai/README.md`.
- Create schemas/prompts/tasks: `ai/schemas/task.schema.json`, `ai/schemas/reviewer.schema.json`, `ai/prompts/developer.md`, `ai/prompts/reviewer.md`, `ai/tasks/examples/TASK-000-example.json`, all lifecycle `.gitkeep` files.
- Create orchestrator modules: `tools/orchestrator/src/index.ts`, `config.ts`, `types.ts`, `logger.ts`, `task-loader.ts`, `task-runner.ts`, `review-runner.ts`, `fix-runner.ts`, `command-runner.ts`, `git-manager.ts`, `schema-validator.ts`, `result-parser.ts`, and five adapters.
- Create orchestrator config/docs: `tools/orchestrator/tsconfig.json`, `tools/orchestrator/README.md`.
- Modify only `package.json` after creation to expose `ai:dev`, `ai:task`, `ai:review`, `ai:status`, and `ai:check`.

### Task 1: Scaffold schemas, lifecycle storage, prompts, and package configuration

**Files:** Create all root config/docs, schema, prompt, example task, `.gitkeep`, `package.json`, and TypeScript config files listed above.

- [ ] Create valid Draft 2020-12-compatible Task Schema with `TASK-数字` id, required fields, status/priority/provider enums, defaults for `assignedTo`, `reviewer`, and `maxReviewRounds`, and array/object types.
- [ ] Create Reviewer Schema requiring `PASS|REQUEST_CHANGES`, severity arrays, test result, and `outOfScopeFindings`.
- [ ] Create prompts that require file result protocol and explicitly distinguish FAILED from ESCALATED.
- [ ] Create `TASK-000-example.json` with `allowedPaths: ["ai/reports/hello-agent.md"]` and a harmless report-writing goal.
- [ ] Create npm scripts using `tsx` for runtime and `tsc --noEmit` for compile; add `ajv`, `ajv-formats`, `dotenv`, `tsx`, and TypeScript dependencies.
- [ ] Run `npm install` and verify `node_modules/.bin/tsc --noEmit` can be invoked after source scaffolding.

### Task 2: Implement shared types, configuration, logging, commands, and schema validation

**Files:** `types.ts`, `config.ts`, `logger.ts`, `command-runner.ts`, `schema-validator.ts`.

- [ ] Define `AgentExecutionResult<T>` with `success`, `exitCode`, `timedOut`, `durationMs`, `stdout`, `stderr`, and optional `result`.
- [ ] Define task status, Review result, Developer result, baseline, incremental diff, adapter interfaces, and explicit failure kinds.
- [ ] Load `.env`, resolve repository paths, provider commands, timeout, max rounds, and auto-commit flag.
- [ ] Implement `spawn`-based command execution with argument arrays, timeout kill, cancellation signal, stdout/stderr capture, exit code, duration, and log callback; reject configured dangerous commands.
- [ ] Implement Ajv compilation and readable validation errors for Task and Reviewer JSON.

### Task 3: Implement Git baseline and incremental path protection

**Files:** `git-manager.ts`, `task-loader.ts`.

- [ ] Capture pre-run HEAD SHA, branch, `git status --porcelain`, tracked patch, and untracked files.
- [ ] Detect pre-existing dirty files before Agent execution; if any intersect allowed paths, return a blocking baseline error and preserve the workspace untouched.
- [ ] After Agent execution, compute changed paths relative to the captured baseline using tracked diff plus new untracked files, excluding baseline-existing changes.
- [ ] Generate only the task patch for Reviewer and validate changed paths against allowed/forbidden glob rules.
- [ ] Add tests for clean baseline, unrelated pre-existing dirty file, allowed-path pre-existing dirty file, new file, and path violation.

### Task 4: Implement file-first result parsing and adapters

**Files:** `result-parser.ts`, `adapters/developer-adapter.ts`, `reviewer-adapter.ts`, `mock-adapter.ts`, `codebuddy-adapter.ts`, `codex-adapter.ts`.

- [ ] Read and Schema-validate Developer results from `ai/state/<id>/developer-result.json`; fallback to sanitized stdout JSON only when the file is absent.
- [ ] Read and validate Review results from `review-result-round-XX.json`; fallback to stdout only when needed.
- [ ] Implement Mock modes for PASS, REQUEST_CHANGES, timeout, and invalid JSON, controlled by environment variables and deterministic task metadata.
- [ ] Implement CodeBuddy/Codex wrappers using configured command and fixed argument configuration, returning the unified execution result without embedding credentials.
- [ ] Ensure CLI missing, timeout, cancellation, nonzero exit, missing result file, and invalid JSON are distinct failures.

### Task 5: Implement task state machine and Review Loop

**Files:** `task-runner.ts`, `review-runner.ts`, `fix-runner.ts`, `index.ts`.

- [ ] Atomically move task JSON between lifecycle directories while synchronizing its `status`.
- [ ] Execute `PENDING → RUNNING → REVIEW → DONE` in Mock PASS mode.
- [ ] Execute `REVIEW → FIXING → REVIEW` for REQUEST_CHANGES and stop with `FAILED` for execution/schema/path/IO errors.
- [ ] Stop with `ESCALATED` only after Developer and Reviewer complete normally for `maxReviewRounds` without PASS; write an escalation report containing all Review files, task patch, and build/test results.
- [ ] Pass prior Review findings and only the task incremental patch to the next Developer round.
- [ ] Respect task command configuration for install/build/test/lint, and never report DONE when required checks fail.
- [ ] Implement `ai:task`, `ai:dev`, `ai:review`, and `ai:status` CLI entry points.

### Task 6: Add self-checks and documentation

**Files:** `index.ts`, `ai/README.md`, `tools/orchestrator/README.md`, plus optional self-check helper under `tools/orchestrator/src/`.

- [ ] Make `ai:check` validate schemas, reject an invalid Task fixture, test path protection, run Mock PASS, run Mock REQUEST_CHANGES, run Mock timeout, and run Mock invalid JSON.
- [ ] Assert the PASS fixture ends in `ai/tasks/done` and its JSON says `DONE`; assert failure fixtures end in `failed`, and repeated normal Review failures end in `escalated`.
- [ ] Assert logs and state result files are generated and no `.env` or secret-looking values are tracked.
- [ ] Document install/configuration on macOS/Linux and Windows, all commands, lifecycle directories, baseline protection, result-file protocol, Provider extension, and debugging.

### Task 7: Verify, self-review, and commit

- [ ] Run `npm install`.
- [ ] Run `npm run ai:check` and capture actual output.
- [ ] Run `npm run ai:status` and inspect lifecycle counts.
- [ ] Inspect `git diff --check`, `git status`, and the complete diff for secrets, unrelated files, unsafe commands, and status-directory mismatches.
- [ ] Fix all findings, rerun `npm run ai:check`, and create a local commit; do not push or merge.
