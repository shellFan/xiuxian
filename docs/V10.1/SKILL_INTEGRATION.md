# V10.1 专业游戏研发技能接入报告

> 生成：2026-11-19 · 接入方式：`npx skills add gamedev-skills/awesome-gamedev-agent-skills`（官方命令，实际执行成功）

## 1. 来源与版本追溯

| 项 | 值 |
|---|---|
| 技能仓库 | https://github.com/gamedev-skills/awesome-gamedev-agent-skills |
| 安装 CLI | `skills`（npx -y skills add） |
| 源 commit | `c6ca6c41c839b68319ffc08430b99ab768debc32` |
| 锁文件 | `skills-lock.json`（记录 source / commit / skillPath / computedHash，全部可追溯） |
| 安装位置 | `.agents/skills/<name>/SKILL.md`（CLI 标准位置）+ `.zcode/skills/<name>/SKILL.md`（ZCode 项目级发现位置，内容相同的副本） |
| 安全评估 | Socket 0 alerts ×11；Snyk Low Risk ×10，Med Risk ×1（`create-game-assets`，因其工作流涉及外部素材下载，本任务未使用其下载步骤） |

仓库实测共 80 个技能（Disciplines 15 / Genres 9 / Workflows 5 / 各引擎专属 51）。

## 2. 安装决策：为什么只装这 11 个

本项目引擎为 **Cocos Creator 3.8 LTS（TypeScript）**，技能仓库中没有 Cocos 专属技能；
Phaser/PixiJS/ThreeJS 等 web 引擎技能属于其他引擎的具体 API，**不适用**（任务书要求"不要盲目安装不适用的引擎技能"），
Godot/Unity/Unreal/Bevy/Roblox 等 51 个引擎技能同样不装。

因此只安装 **引擎无关（engine-neutral）** 的学科/流派/工作流技能，共 11 个。

## 3. 已安装技能清单（全部真实验证存在）

| # | 技能名 | 类别 | 对应任务书能力 | 用途 |
|---|---|---|---|---|
| 1 | `rpg` | genres | RPG 系统设计 | 数值成长、伤害公式、装备词缀、任务追踪的通用方法论 |
| 2 | `card-game` | genres | 卡牌战斗（V10 核心玩法） | 卡牌数据模型、效果解释器、牌堆区、触发栈、种子洗牌 |
| 3 | `game-ui-ux` | disciplines | Game UI/UX | HUD/菜单锚点与缩放、安全区、事件驱动刷新、可访问性 |
| 4 | `game-feel` | disciplines | Game Feel | 屏幕震动、hit-stop、缓动 tween、挤压拉伸、打击感 |
| 5 | `create-game-assets` | disciplines | Game Asset Creation | 美术风格指南、精灵/图标规格、QA 与授权记录 |
| 6 | `save-systems` | disciplines | Save Systems | 序列化内容、槽位与自动保存、原子写入、版本迁移 |
| 7 | `performance-optimization` | disciplines | Game Performance | CPU/GPU 瓶颈测量法、draw call、对象池、GC 尖峰 |
| 8 | `game-ai` | disciplines | Game AI | FSM/BT/Utility/GOAP 选型、感知、转向、A* 寻路 |
| 9 | `dialogue-systems` | disciplines | Dialogue Systems | 分支对话图（Ink/Yarn/JSON runner）、条件与变量、本地化 ID |
| 10 | `audio-design` | disciplines | Audio Design | 总线布局、dB 音量、对话压音乐、自适应音乐、SFX 变体 |
| 11 | `game-docs` | workflows | Game Documentation | 设计文档结构、可维护文档规范 |

## 4. 任务书要求但仓库中不存在对应技能的能力（如实记录，不虚构）

| 任务书能力 | 仓库实况 | 替代方案 |
|---|---|---|
| Game Testing（通用） | 无通用测试技能；仅 Godot 专属 `gdscript-headless-testing`（不适用） | 用项目既有 `npm test`（180 文件）+ CDP 真实浏览器探针体系（scripts/v10-qa-final/） |
| Game Architecture | 无独立技能 | 用既有 `ai/reports/v10-ultimate/ARCHITECTURE.md` + 本轮 PROJECT_AUDIT.md |

## 5. 项目级技能 Router（按任务类型自动选择）

任务开始时按下表判断任务类型，仅加载相关技能（不允许无关技能全部加载）：

| 任务特征 | 加载技能 | 组合建议 |
|---|---|---|
| 数值/成长/装备/任务设计 | `rpg` | +`save-systems`（存档字段变更时） |
| 卡牌/Boss 战调整 | `card-game` | +`rpg`（数值时） |
| 界面布局/面板/HUD | `game-ui-ux` | +`game-feel`（交互反馈时） |
| 打击感/动画/反馈 | `game-feel` | 单独即可 |
| 美术资源/图标/立绘 | `create-game-assets` | 单独即可 |
| 存档/迁移/防丢档 | `save-systems` | 单独即可 |
| FPS/内存/卡顿 | `performance-optimization` | 先测量后优化 |
| NPC 行为/敌人 AI | `game-ai` | +`dialogue-systems`（有对话时） |
| NPC 对话/剧情分支 | `dialogue-systems` | 单独即可 |
| 音效/BGM/混音 | `audio-design` | 单独即可 |
| 写设计/验收文档 | `game-docs` | 单独即可 |

## 6. 使用记录（本轮 V10.1 实际使用）

| 技能 | 使用场景 | 产出 |
|---|---|---|
| `game-ui-ux` | 离线收益弹窗广告入口接线前的布局与反馈检查 | offline 弹窗改造（见 DEVELOPMENT_LOG） |
| `rpg` + `card-game` | 一键推荐装备（评分公式）与数值边界检查 | 装备推荐实现 |
| `save-systems` | 新增字段（广告入口偏好、装备推荐）的存档迁移核对 | 迁移检查结论 |
| `game-docs` | 本文档体系（11 个 V10.1 文档） | docs/V10.1/* |

> 技能内容为方法论约束，不覆盖项目 AGENTS.md 安全规则（Git 保护、禁危险命令、AI_AUTO_COMMIT 流程），规则冲突时一律以项目规则优先。

## 7. 验证结论

- [x] 官方安装命令 `npx skills add gamedev-skills/awesome-gamedev-agent-skills` 实际执行成功（非伪造）
- [x] 11 个技能 SKILL.md 全部落盘且可读（`.agents/skills/` 与 `.zcode/skills/` 各 335KB）
- [x] skills-lock.json 记录完整来源 commit 与哈希
- [x] ZCode 项目级发现目录已适配（`.zcode/skills/`）
- [x] Router 表建立，按任务选择性加载
- [x] 未安装任何不适用的引擎专属技能
