# 决策日志（DECISION LOG / ADR）

> 记录技能体系建设与项目标准相关的关键决策。格式：编号 | 日期 | 决策 | 理由 | 影响/备选。

## D-001 | 2026-11-19（V10.1 确立，2026-11-21 复核维持） | 只安装 11 个引擎无关技能

上游 79 个技能中，引擎专属 50 个（godot 16 / other-engines 12 / unity 9 / unreal 6 / web-engines 6 / ebitengine 1）全部不装；学科/流派/工作流中仅安装与本项目任务面相关的 11 个。
理由：本项目引擎是 Cocos Creator 3.8.4，上游无 Cocos 技能；装引擎技能=引入错误 API 诱因。
备选：全量安装 → 否决（污染上下文、诱发不兼容代码）。

## D-002 | 2026-11-21 | 发现目录采用三副本（.agents / .zcode / .claude）

`.agents/skills/` 为 skills CLI 安装源（锁文件管理），`.zcode/skills/`、`.claude/skills/` 为发现副本。更新只走 `npx skills add`，禁止手改 SKILL.md；`scripts/check-gamedev-skills.cjs` 校验三处一致。
影响：~340KB×3 仓库体积，换取多 Agent 开箱可用。

## D-003 | 2026-11-21 | 官方不存在的技能不编造，用项目规范兜底

任务书提及 Game Economy / Narrative Design / Mobile Game Optimization / Game Testing / Game Architecture / Animation 等能力，上游实测目录（disciplines 15 / genres 9 / workflows 5）中不存在这些独立技能。对应职责分配：经济→`rpg`+GAME_ECONOMY_GUIDELINES；叙事/对话→`dialogue-systems`+NPC_DIALOGUE_GUIDELINES；移动/微信→COCOS_CREATOR_STANDARDS+PERFORMANCE_GUIDELINES；测试→QA_GUIDELINES；架构→ai/reports/v10-ultimate/ARCHITECTURE.md+COCOS_CREATOR_STANDARDS；动画→`game-feel`+GAME_FEEL_GUIDELINES。

## D-004 | 2026-11-21 | docs/GAMEDEV_SKILLS/ 为标准体系入口，V10.1/V10.2 文档冻结为历史

V10.1 的 SKILL_INTEGRATION.md 等是当时的接入报告（内容仍有效但位置分散）；本轮建立 docs/GAMEDEV_SKILLS/ 作为长期唯一入口：路由、规范、日志、决策集中管理，深度专题仍指向 docs/ 原专题文档。V10.1/V10.2 目录不再新增标准类内容。

## D-005 | 2026-11-21 | 本地 Node 缺失的验证策略

本机 PATH/注册表均无 Node（近期 tsc-output.txt 亦报 npx 缺失）。验证采用 HBuilderX 内置 node v22.22.2 直调 tsc/run-all 等价链路 + GitHub Actions CI 为最终裁决。不改用户系统环境、不自动安装依赖。

## D-006 | 2026-11-21 | Ajv strict 告警记录为 LOW，不在本轮修改

docs/schema/ 的 achievements / audio-plan / daily-tasks / office-events 四个 schema 在 Ajv 8 strict 模式下报「type 缺失」非致命告警（maxLength/pattern 关键字未显式声明 `"type":"string"`）。编译与校验功能正常。属任务外代码问题（outOfScopeFinding），修复应由 Developer 任务执行：补 `"type":"string"` 并跑 content 校验。另：orchestrator 的 schema-validator.ts 是手写结构校验器，Ajv 仅作为依赖存在——如需全量 JSON Schema 校验能力，可在后续任务中评估切换（保持 ai:task 流程兼容）。

## D-007 | 2026-11-21 | SaveServiceV2 标注为「设计在案未接线」

save-service-v2.ts（validate→backup→write→verify）无生产 import、无测试；生产仍为 V1 fail-closed 单 key。规范禁止任何文档声称"已有备份/校验机制"；接线条件清单见 SAVE_SYSTEM_GUIDELINES §4，作为独立开发任务处理。本轮不改生产代码。

## D-008 | 2026-11-21 | 境界（realm）维持为 career.json 展示字段

现状境界名内嵌 career.json 每级 `realm` 字段，非独立境界树。若未来需要独立境界系统（多维度突破），先立 ADR 再动，避免与 20 级职场曲线、晋升答辩系统产生双头状态。

## D-009 | 2026-11-21 | 并行会话协同

本轮检测到并行会话（用户并发额度占用与其产出文件证实），产出与本任务重叠：`docs/GAMEDEV_SKILLS/ART_ASSET_GUIDELINES.md`（资产实测基线更细，采纳）与 `scripts/check-gamedev-skills.cjs`（采纳为体系完整性校验脚本）。处理原则遵循项目惯例：逐文件甄别、优质内容保留、互相引用不冲突。提交前重查 git status 防夹带。

## D-010 | 2026-11-21 | 上游一致性复验方法（供 check 脚本引用）

`sparse/full clone 上游 @ pinned commit`（`git clone --depth 1` 后 `git rev-parse HEAD` 核对 c6ca6c4），对 11 个 `SKILL.md` 与 `.agents/skills/<name>/SKILL.md` 做逐字节 `cmp`。2026-11-21 实测 11/11 BYTE_IDENTICAL。参考克隆位于 `tmp/gamedev-skills-upstream/`（gitignore 内，不入库）。

## D-011 | 2026-11-21 | 设计分辨率口径冲突待裁决（OPEN）

实测冲突：`settings/v2/editor.json` + `assets/scenes/Main.scene` 为 **720×1280**（Cocos 编辑器设计分辨率，运行时实际生效）；`assets/configs/ui-theme.json` `designSize` 与 `docs/UI-DESIGN-SYSTEM.md` 声明 **750×1334**（逻辑像素）。两口径均来自真实文件，本轮不改任何数值（涉及业务配置，超出技能接入范围）。裁决路径：定 720×1280 → 改 ui-theme.json `designSize` 与 UI 文档基准；定 750×1334 → 改 editor.json/场景并回归全部 UI 截图验收（desktop + mobile 五档）。**裁决前**：新 UI 验收一律以编辑器实际渲染（720×1280）为准；安全区公式、层级、token 引用不受影响。待产品/架构（Sol）裁决后关闭本条。
