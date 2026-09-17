# 可玩首页与核心合成 Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Cocos 项目从“可启动但不可玩”恢复为单首页入口，并按 Web V1 设计稿接通首页与合成页展示；保留 `GameUIController` 作为统一入口，但当前阶段不要求棋盘拖拽交互。

**Architecture:** 保留现有 `GameFacade`、`GameContext`、`MergeBoard`、`RecruitmentService`、`MergeService` 和 `SaveService`。`CocosBootstrapComponent` 是唯一业务 composition root，`GameUIController` 负责页面可见性、首页按钮和合成页入口；场景节点负责显示，业务状态只来自同一个 Facade。合成页以设计稿中的配方/材料/产物卡片和按钮为准，棋盘格只作为视觉容器，不承担拖拽玩法。`pc-patch.js` 只用于桌面兼容兜底，不生成主要界面。

**Tech Stack:** TypeScript, Cocos Creator 3.8.4, Cocos Scene JSON, Electron, Node.js test runner, TypeScript compiler.

## Global Constraints

- 启动页只显示首页，其他页面通过底部导航切换。
- 首页视觉基准使用用户提供的 Web V1 设计稿，不把设计稿图片作为运行时界面。
- 合成页展示既有业务数据，不新增棋盘拖拽交互。
- 一个 Session 只有一个 `GameContext`、`SaveService`、`Economy`、`Board` 和事件总线。
- 不引入 DI 框架，不开发广告、宗门扩展、排行榜、好友或随机事件新业务。
- 每个生产代码变更必须先有一个能正确失败的测试。
- 未能通过 Cocos Editor 人工点击验证时，最终报告必须标记 `MANUAL TEST REQUIRED`。

---

### Task 1: 锁定首页与棋盘场景契约

**Files:**
- Modify: `tests/scene/static-scene-integrity.test.ts`
- Modify: `tests/ui/main-view.test.ts`
- Modify: `tests/core/foundation.test.ts`
- Test fixture: `assets/scenes/Main.scene`

**Interfaces:**
- Consumes: current Cocos scene graph and compressed script UUIDs.
- Produces: failing tests that require `SafeAreaRoot` as the sole composition root, visible Home page nodes, a `CraftPageContent` board container, `RecruitButton`, and 16 board cells.

- [ ] **Step 1: Write failing scene assertions**

  Add assertions that `Main.scene` contains `MergeBoardRoot`, `RecruitButton`, and `BoardCell00` through `BoardCell15` under `CraftPageContent`, and that exactly one `CocosBootstrapComponent` is mounted on `SafeAreaRoot`.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run `npm test`. Expected failure: the current scene is missing the board root, recruitment button, and board cell contract.

- [ ] **Step 3: Record the scene contract without adding runtime behavior**

  Keep the assertions index-agnostic and resolve custom components through `.meta` UUIDs. Do not loosen the expected node names to make the old scene pass.

- [ ] **Step 4: Run the focused tests again**

  Run `npm test`. Expected result remains a targeted scene-contract failure until Task 2 and Task 3 create the nodes.

- [ ] **Step 5: Commit the test contract**

  ```bash
  git add tests/scene/static-scene-integrity.test.ts tests/ui/main-view.test.ts tests/core/foundation.test.ts
  git commit -m "test: define playable home and board scene contract"
  ```

### Task 2: Build the real Home/Craft scene layout

**Files:**
- Modify: `scripts/rebuild-scene.cjs`
- Modify: `assets/scenes/Main.scene`
- Modify: `assets/scenes/Main.scene.meta` only if Creator serialization changes its scene UUID metadata
- Modify: `scripts/check-web-v1-scene.cjs`

**Interfaces:**
- Consumes: Task 1 node names and existing scene builder helpers.
- Produces: a scene with one visible Home page, a navigable Craft page, a 4×4 board container, 16 named cells, and a visible recruitment button.

- [ ] **Step 1: Add the minimal failing scene-builder test**

  Add a Node test that runs `node scripts/rebuild-scene.cjs`, parses `Main.scene`, and asserts that `CraftPageContent` contains `MergeBoardRoot`, `RecruitButton`, and all 16 cells.

- [ ] **Step 2: Run the test and verify it fails**

  Run `node tests/.compiled/tests/scene/static-scene-integrity.test.js` after TypeScript compilation. Expected failure: the generated scene has no `MergeBoardRoot` or board cells.

- [ ] **Step 3: Implement the scene nodes**

  Extend `scripts/rebuild-scene.cjs` to create:

  ```text
  CraftPageContent
    ├─ CraftHeader
    ├─ RecruitButton
    └─ MergeBoardRoot
       ├─ BoardCell00 ... BoardCell15
  ```

  Each cell receives a `cc.UITransform`, a visible background component already used by the project, and a child label node. Keep `CraftPageContent` inactive at startup and `HomePageContent` active. Do not add a second bootstrap node.

- [ ] **Step 4: Regenerate and verify the scene**

  Run `node scripts/rebuild-scene.cjs`, then `npm run web-v1:check`. Expected result: static scene check passes and reports the new board contract.

- [ ] **Step 5: Commit the scene layout**

  ```bash
  git add scripts/rebuild-scene.cjs assets/scenes/Main.scene scripts/check-web-v1-scene.cjs
  git commit -m "feat: restore playable home and craft scene layout"
  ```

### Task 3: Connect the designed pages without drag interaction

**Files:**
- Modify: `assets/scripts/ui/game-ui-controller.ts`
- Modify: `assets/scripts/ui/merge-board-view.ts`
- Modify: `assets/scripts/ui/worker-view.ts`
- Modify: `assets/scripts/core/game-facade.ts` only if the existing public API lacks recruitment or merge forwarding
- Test: `tests/ui/game-ui-controller.test.ts`
- Test: `tests/ui/merge-board-view.test.ts`
- Test: `tests/gameplay/playable-loop.test.ts`

**Interfaces:**
- Consumes: `GameFacade.recruit()`, `GameFacade.merge()` or existing service methods, `MergeBoardView`, `WorkerView`, and the 16 scene cell nodes.
- Produces: `GameUIController` methods for page binding, craft-page rendering, and existing home actions; the craft page is visual and button-driven, with no required board drag/drop.

- [ ] **Step 1: Write failing gameplay tests**

  Add tests for:

  ```ts
  it('recruit places a worker in the first empty cell and persists it');
  it('craft page renders recipe cards and merge buttons');
  it('home actions remain wired to the real facade and persist');
  ```

  Use real `GameContext` and `MemoryStorageAdapter`; do not mock the board service.

- [ ] **Step 2: Run the tests and verify they fail for missing scene wiring**

  Run `npm test`. Expected failure: the controller has no craft binding and the playable loop cannot find board cell views.

- [ ] **Step 3: Implement minimal controller wiring**

  Resolve `CraftPageContent`, recipe/card nodes, and existing action buttons by name. Keep the single `GameUIController` and real Facade/Context wiring. Do not add or require drag/drop. Existing board and merge services remain domain capabilities for later tasks, but this task only renders the designed craft page and preserves already-supported button flows.

- [ ] **Step 4: Implement craft-page rendering**

  Render the designed recipe rows with materials, result, and merge button affordances. A board container may remain as a visual layout contract, but it must not be presented as a required drag interaction.

- [ ] **Step 5: Run gameplay tests and the full suite**

  Run `npm test`. Expected result: all gameplay tests and existing tests pass.

- [ ] **Step 6: Commit the gameplay wiring**

  ```bash
  git add assets/scripts/ui/game-ui-controller.ts assets/scripts/ui/merge-board-view.ts assets/scripts/ui/worker-view.ts assets/scripts/core/game-facade.ts tests/ui/game-ui-controller.test.ts tests/ui/merge-board-view.test.ts tests/gameplay/playable-loop.test.ts
  git commit -m "feat: connect real board gameplay to Cocos UI"
  ```

### Task 4: Build, launch, and verify the playable desktop package

**Files:**
- Modify: `scripts/cocos-cli.cjs` only if build-path normalization regresses
- Modify: `desktop/patch-html.cjs` only for compatibility wiring required by the final scene
- Modify: `scripts/check-web-v1-build.cjs`
- Create or update: `ai/reports/playable-home-result.md`

**Interfaces:**
- Consumes: completed scene and gameplay wiring from Tasks 1–3.
- Produces: current desktop bundle, launch evidence, and a report that distinguishes automated verification from manual Cocos Editor verification.

- [ ] **Step 1: Add a build freshness assertion for the board component UUIDs**

  Extend `scripts/check-web-v1-build.cjs` so it verifies the current scene custom component registrations and the board controller registration are present in `desktop/build/web-desktop/assets/main/index.js`.

- [ ] **Step 2: Run the new check before rebuilding**

  Run `npm run pc:check`. Expected failure if the desktop bundle is stale.

- [ ] **Step 3: Build and copy the Cocos package**

  Run `npm run pc:build`, then `npm run pc:copy`. The generated artifact must be `build/web-desktop`, not `build/web-desktop/web-desktop`; `npm run pc:check` must pass.

- [ ] **Step 4: Launch without DevTools**

  Run `npm run pc:start` and verify logs include `GAME_READY`, `Facade resolved`, node resolution for the home actions, board root, recruitment button, and 16 cells. Stop the process after verification.

- [ ] **Step 5: Run final automated checks**

  Run `npm test`, `npm run build:game`, `npm run web-v1:check`, and `npm run pc:check`.

- [ ] **Step 6: Write the result report and commit**

  Record exact command results, whether Cocos Editor manual clicks were possible, and any `MANUAL TEST REQUIRED` items in `ai/reports/playable-home-result.md`, then commit only the task files:

  ```bash
  git add scripts/check-web-v1-build.cjs ai/reports/playable-home-result.md
  git commit -m "test: verify playable home desktop package"
  ```

## Final Acceptance

- Starting `npm run pc:start` displays the Home page only, without DevTools.
- Home action buttons visibly update state and persist through restart.
- Craft navigation displays a 4×4 board and recruitment button.
- Recruitment creates a Worker in the first empty cell.
- Dragging to an empty cell moves the Worker.
- Merging equal Workers clears `from` and leaves the upgraded Worker at `to`.
- `npm test`, `npm run build:game`, `npm run web-v1:check`, and `npm run pc:check` pass.
- Any unverified Cocos Editor interaction is explicitly reported as `MANUAL TEST REQUIRED`.
