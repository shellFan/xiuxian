# Phase 4.5 Implementation Plan

> Agentic workers: use subagent-driven-development; each bounded slice is independently reviewed. User authorizes continuous execution without another design gate.

**Goal:** 将 Phase4 候选包变成可验证、可交接的生产准备包，仍不启用运行时。

**Architecture:** JSON Schema draft-07 + Ajv 检查结构，语义检查 ID/来源/预算/跨文件引用；纯迁移函数消费源与候选，CLI 仅写 generated/phase4-integration-preview 四个文件。文档区分远程已实现 API 与拟议适配契约。无新 Service、无 DI、无游戏行为改变。

**Tech Stack:** CommonJS、Node test runner、现有 Ajv、JSON、Markdown。

## Global Constraints

- BASE b170ddd5ddfe79bfd12ce37a09e5bc0319e1c5c8；branch phase4-ui-content；初始工作区 clean，tracked diff/untracked 均为空。
- 2026-09-04 fetch 后主线 30bb6dc7ffd41ad1ec1d10c96aeac89d37d99b17；结束前再次 fetch 并固定 SHA。
- 不 merge、不改 assets/scripts、assets/scenes、assets/prefabs 或运行时配置；候选 runtimeEnabled=false。
- 不修改 Cursor 主线工作树、用户配置、Agent 路由配置；不自动 stash/reset/restore。
- 方案取舍：直接导入候选会污染运行时，故不用；仅文档不能发现配置错误，故采用可执行预览工具；不做正式运行时迁移。
- Sol 负责规范与审查；独立批量实现允许 Luna。每个子任务限定文件所有权，不提交他人改动，不创建后代。
- 结构校验不冒充 Cocos Editor、真机、平台合规或资产实测验收。

## Execution ledger

- [x] A0: 附件需求审阅、隔离工作树确认、clean baseline、fetch、npm test（43 文件）。
- [x] A1: c992534，独立Sol契约审查PASS；概率总权重0/首事件计时两处文字澄清已落实，最终Review复核。
- [x] B: 4fc6845+1162ed2；Luna交付/整改，15工具+37内容/生产测试PASS，独立Sol整包审查及整改复审PASS。
- [x] C: cfe3a89+1162ed2；49美术/25音频/15动画/464文案键，生产17测试PASS，独立Sol审查PASS。
- [x] D: 77f425f；25Prefab/15页面/10类状态与发布清单，独立Sol审查PASS。
- [x] E: 全量验证/merge-tree/合并清单/独立Sol最终Review PASS；发布前远程更新至08173b4，兼容文档重新核对并获Sol PASS；B0/H0/M0仅指候选交付包。
- [ ] F: 精确路径提交、push phase4-ui-content、远程 SHA 确认、STOP。

## Task B: validation and preview

Read docs/PHASE4.5-TOOLS-BRIEF.md. Own docs/schema/*, docs/validation/* (existing checker extended), tools/phase4-content-migration/*, generated/phase4-integration-preview/*. Consume existing immutable candidate/runtime configs. Produce validateSchemas(pack), createPreview(pack) with structured findings; no runtime writes. Test before implementation: whitespace titles, missing fields, unknown effect/reward, negative reward, duplicate IDs, source alias attacks, condition mismatches, repeatable preview and safe destination.

## Task C: candidate production data

Read docs/PHASE4.5-ASSETS-BRIEF.md. Own new manifests/localization/tutorial/daily metadata and specified production docs only. Preserve original candidates. All references resolve; hidden achievement strings are localization data, never proof they are safe for locked UI. Do not write validation tooling (Task B owns it). Tests are structural/cross-reference checks and node JSON parsing; report counts.

## Task A/D: root design and UX

Create docs/PHASE4-MAINLINE-COMPATIBILITY.md from exact remote git objects. Create EVENT-POOL-V1, EVENT-ELIGIBILITY-CONTRACT, DAILY-TASK-POOL-V1, ACHIEVEMENT-PRESENTATION-CONTRACT, CONTENT-SAFETY-REVIEW, PREFAB-IMPLEMENTATION-CHECKLIST, UI-SCREEN-ACCEPTANCE, UI-STATE-MATRIX, REWARD-UX-STATE, FIRST-10-MINUTES, FIRST-30-MINUTES, IAA-FREQUENCY-V1, CONTENT-RELEASE-CHECKLIST. Specific accepted policy: category rare 1%, egg 0.1% per eligible draw (never redistribute rare odds upward); normal cadence proposed 180–300 s; no three consecutive negative or recent repeated event. Daily choose 5, optional 6 only if eligible distinct supported types, no inflated rewards or impossible promotion. See contracts for precise edge cases.

## Verification and publication

Run npm test, npm run build, node docs/validation/phase4-content-check.cjs, node --test docs/validation/*.test.cjs and migration tests. Parse every tracked/new project JSON (exclude node_modules/git/generated test build). Run git diff --check. Capture return codes. Fetch remote again; run git merge-tree --write-tree origin/ai-automation-bootstrap HEAD without changing branch/index; record both parent SHAs and conflicts. Generate ai/reports/PHASE4-MERGE-MANIFEST.md and PHASE4-MERGE-CONFLICT-PREVIEW.md; classify exact paths, including future API adaptation. Review patch against user 30 requirements. Fix important findings and rerun covering tests. Commit only own files and force-add only explicitly requested ignored reports. Push only phase4-ui-content, no force, no mainline merge.
