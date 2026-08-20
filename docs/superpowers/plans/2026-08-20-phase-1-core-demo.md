# Phase 1 Core Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable Cocos Creator 3.8 TypeScript core demo with recruitment, drag/merge, salary, persistence, feedback, and automated domain tests.

**Architecture:** Preserve `UI → Game Services → Domain/Model → Config/Save`. A single `GameContext` owns services, domain state is authoritative, and every task runs serially through Luna implementation and Sol review.

**Tech Stack:** Cocos Creator 3.8 LTS, TypeScript, JSON, Node test runner, existing AI orchestrator.

## Global Constraints

- Implement only Phase 1 Lv1–Lv6 core demo features.
- Never use Mock for formal task execution.
- Run `npm run build` and `npm run test` where configured.
- Commit each DONE task before starting the dependent task so Git baseline protection remains clean.
- Cocos Editor validation must be reported as manual when no local executable is available.
- Do not implement ads, sects, idle gameplay, rankings, friends, random events, backend, login, payment, or Phase 2 systems.

---

### Task 001: 创建 Cocos Creator 项目基础骨架

**Files:** assets/**, settings/**, project.json, tsconfig.game.json, package.json, package-lock.json, tests/**

**Depends on:** Provider preflight

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 002: 实现配置驱动系统

**Files:** assets/scripts/services/config-service.ts, assets/scripts/model/config-types.ts, assets/configs/**, tests/config/**

**Depends on:** TASK-001

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 003: 实现玩家数据与本地存档系统

**Files:** assets/scripts/model/player-data.ts, assets/scripts/model/save-data.ts, assets/scripts/services/save-service.ts, assets/scripts/services/storage-adapter.ts, tests/save/**

**Depends on:** TASK-002

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 004: 实现 4×4 合成棋盘

**Files:** assets/scripts/model/worker-entity.ts, assets/scripts/game/merge/**, tests/board/**

**Depends on:** TASK-003

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 005: 实现牛马生成系统

**Files:** assets/scripts/services/recruitment-service.ts, assets/scripts/core/game-context.ts, assets/scripts/core/game-events.ts, tests/recruitment/**

**Depends on:** TASK-004

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 006: 实现拖拽系统

**Files:** assets/scripts/ui/worker-view.ts, assets/scripts/ui/merge-board-view.ts, assets/scripts/game/drag-controller.ts, tests/drag/**

**Depends on:** TASK-005

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 007: 实现合成升级核心逻辑

**Files:** assets/scripts/services/merge-service.ts, assets/scripts/game/merge/**, assets/scripts/core/game-events.ts, tests/merge/**

**Depends on:** TASK-006

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 008: 实现基础经济系统

**Files:** assets/scripts/services/economy-service.ts, assets/scripts/core/game-context.ts, assets/scripts/core/game-events.ts, tests/economy/**

**Depends on:** TASK-007

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 009: 实现第一版核心主界面

**Files:** assets/scenes/Main.scene, assets/scripts/ui/main-view.ts, assets/scripts/ui/worker-view.ts, assets/scripts/ui/merge-board-view.ts, assets/prefabs/**, tests/ui/**

**Depends on:** TASK-008

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 010: 实现基础游戏反馈

**Files:** assets/scripts/ui/toast-view.ts, assets/scripts/ui/feedback-view.ts, assets/scripts/ui/main-view.ts, assets/scenes/Main.scene, assets/prefabs/**, tests/ui/**

**Depends on:** TASK-009

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 011: 实现第一阶段稳定性测试

**Files:** tests/**, package.json, package-lock.json, tsconfig.game.json

**Depends on:** TASK-010

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Task 012: 第一阶段整体验收

**Files:** assets/**, settings/**, project.json, tsconfig.game.json, package.json, package-lock.json, tests/**, ai/reports/**

**Depends on:** TASK-011

- [ ] Validate task JSON and clean Git baseline.
- [ ] Luna writes failing tests or static contract checks first.
- [ ] Luna implements only the declared requirements and runs build/tests.
- [ ] Sol reviews the task increment for correctness, architecture, Cocos/WeChat safety, and tests.
- [ ] Luna fixes every BLOCKER/HIGH; Sol re-reviews until PASS or the task escalates.
- [ ] Confirm DONE and commit before the next task.

### Phase Final Review

- [ ] Confirm TASK-001 through TASK-012 are DONE.
- [ ] Run `npm run ai:check`, `npm run build`, and `npm run test`.
- [ ] Validate save and merge scenarios through automated tests.
- [ ] Record unavailable Cocos Editor checks as manual verification.
- [ ] Obtain Sol final review with no BLOCKER/HIGH.
- [ ] Generate `ai/reports/PHASE-1-RESULT.md` and commit without merging.

