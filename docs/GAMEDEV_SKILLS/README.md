# 《牛马修仙传》专业游戏研发技能体系

> 本目录是**技能路由 + 项目研发标准**的唯一入口。既有深度专题文档（`docs/UI-DESIGN-SYSTEM.md`、`docs/ANIMATION-GUIDE.md`、`docs/IAA-DESIGN.md` 等）保持其权威地位，本目录负责把它们与官方 Agent 技能、代码锚点、验收命令串成可执行的工作流。
>
> 建立日期：2026-11-21 · 分支：`feature/v10-final-release`

## 1. 技能来源与安装记录

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/gamedev-skills/awesome-gamedev-agent-skills |
| 上游版本 | `c6ca6c41c839b68319ffc08430b99ab768debc32`（锁文件记录，与上游 main HEAD 实测一致） |
| 获取时间 | 首次安装 2026-11-19（V10.1）；本次 2026-11-21 核验无需更新 |
| 安装命令 | `npx -y skills add gamedev-skills/awesome-gamedev-agent-skills`（官方命令，V10.1 实际执行成功） |
| 锁文件 | 根目录 `skills-lock.json`（v2，记录 source / commit / skillPath / computedHash） |
| 上游 LICENSE | **Apache-2.0**（本次浅克隆实测） |
| 上游规模 | 79 个技能（实测 SKILL.md 数）：disciplines 15 / genres 9 / workflows 5 / 引擎专属 50 |
| 本地参考克隆 | `tmp/gamedev-skills-upstream/`（gitignore 内，不提交） |

### 发现目录（Agent → 目录）

| Agent | 目录 | 状态 |
|---|---|---|
| skills CLI（安装源） | `.agents/skills/` | 已跟踪，39 个文件 |
| ZCode | `.zcode/skills/` | 已跟踪，39 个文件；ZCode 会话技能列表实测可见 11 技能 |
| Claude Code | `.claude/skills/` | 本次补齐跟踪（此前本地存在未提交） |
| Codex / 其他 CLI | `.agents/skills/`（skills.sh 通用约定） | 同上 |

三处内容相同（均来自锁文件同一 commit）。**更新技能时只通过 `npx skills add` 执行**，由锁文件保证三处一致；不要手改 SKILL.md。

## 2. 已安装技能清单（11 个，引擎无关）

| # | 技能 | 上游类目 | 本项目用途 |
|---|---|---|---|
| 1 | `rpg` | genres | 成长曲线、属性修正栈、装备词缀、任务/成就数值 |
| 2 | `card-game` | genres | 卡牌战斗（v59o 卡组/能量/触发栈方法论） |
| 3 | `game-ui-ux` | disciplines | HUD/面板锚点缩放、安全区、事件驱动刷新、可访问性 |
| 4 | `game-feel` | disciplines | 点击反馈、合成/晋升/奖励动效（映射为 Cocos tween） |
| 5 | `create-game-assets` | disciplines | 美术风格指南、图标规格、素材 QA 与授权记录 |
| 6 | `save-systems` | disciplines | 序列化、原子写、版本迁移（对照 SaveService 体系） |
| 7 | `performance-optimization` | disciplines | 先测量后优化、draw call、对象池、GC 尖峰 |
| 8 | `game-ai` | disciplines | NPC/敌人行为选型（FSM/BT/Utility） |
| 9 | `dialogue-systems` | disciplines | 分支对话图、条件变量、本地化 ID |
| 10 | `audio-design` | disciplines | 音量总线、限流、自适应音频（对照 audio-plan.json） |
| 11 | `game-docs` | workflows | 设计文档与交付文档维护 |

**未安装且禁止编造**：任务书提到 "Game Economy / Narrative Design / Mobile Game Optimization / Game Testing / Game Architecture / Animation" 等能力——上游仓库**不存在**这些独立技能（实测目录清单见 `DECISION_LOG.md` D-003）。对应能力由本目录的 `GAME_ECONOMY_GUIDELINES.md`、`NPC_DIALOGUE_GUIDELINES.md`、`PERFORMANCE_GUIDELINES.md`、`QA_GUIDELINES.md`、`COCOS_CREATOR_STANDARDS.md`、`GAME_FEEL_GUIDELINES.md` 承担。

**可扩展技能**（引擎无关、当前无任务面，需要时再装）：`camera-systems`、`input-systems`、`level-design`、`physics-tuning`、`procedural-gen`、`shader-programming`、`ai-behavior-trees-utility-ai`、`visual-novel`。安装方式同上，安装后更新锁文件并补记 `SKILL_USAGE_LOG.md`。

## 3. 每个任务的标准流程

```
需求分析 → 读取本目录规范 → SKILL_ROUTER.md 选技能 → 检查已有实现（代码锚点）
→ 设计方案 → 实现（代码/美术）→ 单元测试 → 集成测试 → 实际运行
→ UI 截图 → 性能检查 → 独立审查（Reviewer）→ 提交 → 更新文档
```

硬性禁令（与 AGENTS.md 一致）：没有设计不开发；不检查已有代码就重复实现；不做 UI 不接交互；只做数据不接业务；只产素材不接场景；无测试不宣布完成；不用 Mock 冒充真实功能；不用文档代替实现。

## 4. 与既有 AI 工作流的融合

角色分工以 AGENTS.md 为准：

| 角色 | 职责 | 技能使用方式 |
|---|---|---|
| ChatGPT（Sol，策划/产品/架构/验收） | 规划、任务拆解、验收标准 | 按 Router 为 Task 声明技能与规范引用 |
| Luna（Codex GPT-5.6，Developer） | 写码、构建、测试、修复 | 执行 Task 时按 Router 加载技能；任务书含 `allowedPaths` 约束 |
| Codex（Sol，Reviewer） | 代码/架构/性能/安全审查 | 只读审查；发现 BLOCKER/HIGH 输出整改要求 |

> 历史任务书中的 "HY3"（实现/UI/美术集成/测试/构建）职责在当前 AGENTS.md 配置中由 Luna 承担，规范文档统一按 Luna 表述。

技能调用**不绕过** TS Orchestrator（`tools/orchestrator/`，命令 `npm run ai:*`）：Task JSON 仍走 `ai/schemas/*.schema.json` 校验（`schema-validator.ts` 结构校验），Ajv 依赖与 `docs/schema/*.json` 内容 Schema 的编译核验见 `SKILL_USAGE_LOG.md` 2026-11-21 条目。

## 5. 文档地图

| 文件 | 内容 |
|---|---|
| [SKILL_ROUTER.md](SKILL_ROUTER.md) | 任务类型 → 技能 + 规范 + 代码锚点 + 验收命令的路由表 |
| [COCOS_CREATOR_STANDARDS.md](COCOS_CREATOR_STANDARDS.md) | Cocos Creator 3.8.4 / TS 5.6 / 微信小游戏专属适配规范 |
| [RPG_DESIGN_GUIDELINES.md](RPG_DESIGN_GUIDELINES.md) | 修仙 RPG：境界、功法、装备、卡牌战斗、成长曲线 |
| [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md) | UI/UX 规范入口（token 体系、安全区、层级、验收） |
| [ART_ASSET_GUIDELINES.md](ART_ASSET_GUIDELINES.md) | 美术资产：命名、目录、预算、授权 |
| [GAME_FEEL_GUIDELINES.md](GAME_FEEL_GUIDELINES.md) | 动画与反馈：优先级、并发上限、可跳过性 |
| [NPC_DIALOGUE_GUIDELINES.md](NPC_DIALOGUE_GUIDELINES.md) | NPC、好感度、对话、事件持久化 |
| [GAME_ECONOMY_GUIDELINES.md](GAME_ECONOMY_GUIDELINES.md) | 经济与数值：单一数值源、双闸门、防通胀 |
| [SAVE_SYSTEM_GUIDELINES.md](SAVE_SYSTEM_GUIDELINES.md) | 存档：fail-closed、迁移白名单、防重复领取 |
| [PERFORMANCE_GUIDELINES.md](PERFORMANCE_GUIDELINES.md) | 性能：预算、限流、池化、测量 |
| [QA_GUIDELINES.md](QA_GUIDELINES.md) | 测试与验收：命令、Gate、截图、回归锁 |
| [SKILL_USAGE_LOG.md](SKILL_USAGE_LOG.md) | 技能实际使用记录（持续追加） |
| [DECISION_LOG.md](DECISION_LOG.md) | 技术与设计决策记录（ADR） |

## 6. 冲突与优先级

1. **AGENTS.md**（Git 保护、角色分工、Review 分级）永远优先；
2. **本目录项目规范**（含既有 docs 专题文档）其次；
3. **官方技能方法论**（engine-neutral）作为实现思路参考，其引擎示例（Godot/Unity 代码）不得直接复制——必须先过 `COCOS_CREATOR_STANDARDS.md` 的兼容性检查。

## 7. 验证状态（2026-11-21）

| 检查项 | 结果 |
|---|---|
| 技能安装完整性 | PASS：锁文件 commit 与上游 HEAD 一致；`.agents/.zcode/.claude` 三处 11 技能齐全 |
| ZCode 技能发现 | PASS：本会话可用技能列表实测列出全部 11 技能 |
| 游戏代码类型检查 | PASS：`tsc -p tsconfig.game.json --noEmit` 0 错误 |
| Orchestrator 类型检查 | PASS：`tsc -p tools/orchestrator/tsconfig.json --noEmit` 0 错误 |
| Orchestrator 运行态 | PASS：`ai:status` 只读输出正常（Phase 3 / 43 tasks） |
| JSON Schema 编译 | PASS：`ai/schemas`×3（draft-2020-12）+ `docs/schema`×5（draft-07）共 8 个全部编译通过 |
| 全量测试 | PASS：188 个测试文件全过（tsc 编译 + `tests/run-all.cjs`，exit 0） |
| 体系完整性脚本 | PASS：`node scripts/check-gamedev-skills.cjs` 59/59 |
| 路由测试（5 例） | PASS：见 `SKILL_ROUTER.md` §3 |

> 本地 Node 说明：本机 PATH 无 Node，验证使用 HBuilderX 内置 `node v22.22.2`（`/d/HBuilderX.5.14.2026070214/HBuilderX/plugins/node/`），行为与 CI（GitHub Actions：类型检查+全量测试+内容校验）等价。
