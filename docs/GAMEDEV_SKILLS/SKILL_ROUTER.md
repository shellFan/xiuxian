# 技能路由规则（SKILL ROUTER）

> 任务开始时按本表判断任务类型，**只加载相关技能**（禁止无关技能全量加载）。
> 技能名以下列已安装清单为准；官方没有的技能用「项目规范兜底」列承担，不得编造技能名。

## 0. 已安装技能（合法取值）

`rpg` `card-game` `game-ui-ux` `game-feel` `create-game-assets` `save-systems` `performance-optimization` `game-ai` `dialogue-systems` `audio-design` `game-docs`

## 1. 路由表

| 任务特征 | 加载技能 | 项目规范（必读） | 关键代码锚点 | 验收命令 |
|---|---|---|---|---|
| UI 设计 / 面板 / HUD / 弹窗 | `game-ui-ux`（+`game-feel` 有交互反馈时） | [UI_UX_GUIDELINES](UI_UX_GUIDELINES.md) + [GAME_FEEL](GAME_FEEL_GUIDELINES.md) + [ART_ASSET](ART_ASSET_GUIDELINES.md) | `assets/scripts/ui/`、`assets/configs/ui-theme.json`、facade/game-facade.ts | `node_modules/typescript/bin/tsc -p tsconfig.game.json --noEmit` + `tests/ui/` 用例 |
| 修仙成长（境界/突破/修为） | `rpg` | [RPG_DESIGN](RPG_DESIGN_GUIDELINES.md) + [GAME_ECONOMY](GAME_ECONOMY_GUIDELINES.md) | services/cultivation-service.ts、configs/career.json `realm` 字段 | 同上 + `tests/cultivation/` + 平衡 Gate |
| 职场系统（等级/KPI/工资/摸鱼/晋升） | `rpg`（+`dialogue-systems` 事件文案时） | [GAME_ECONOMY](GAME_ECONOMY_GUIDELINES.md) + [NPC_DIALOGUE](NPC_DIALOGUE_GUIDELINES.md) | career/work/kpi/promotion-service、configs/{career,progression,kpi,promotion}.json | `tests/career` `tests/v2` `tests/v3` + `node tools/v58-balance-sim.cjs` |
| NPC / 好感度 / 对话 / 随机事件 | `game-ai` + `dialogue-systems` | [NPC_DIALOGUE](NPC_DIALOGUE_GUIDELINES.md) | v2/npc-weekend-service.ts、v5/messenger-service.ts、v57/npc-memory-service.ts、career-event-service.ts | `tests/events/` + 存档兼容测试 |
| 装备 / 功法 | `rpg`（+`create-game-assets` 新图标时） | [RPG_DESIGN](RPG_DESIGN_GUIDELINES.md) + [GAME_ECONOMY](GAME_ECONOMY_GUIDELINES.md) | v2/v2-item-service.ts（功法 3 槽位）、v64/equipment.ts、configs/v57/equipment-content.json | `tests/v57` `tests/v64` |
| 动画 / 特效 / 打击感 | `game-feel`（+`create-game-assets` 素材时） | [GAME_FEEL](GAME_FEEL_GUIDELINES.md) | ui/animation-dispatcher.ts、docs/ANIMATION-GUIDE.md 动作表 | `tests/ui/` + 截图验收 |
| 存档 / 迁移 / 防丢档 | `save-systems` | [SAVE_SYSTEM](SAVE_SYSTEM_GUIDELINES.md) | model/save-data.ts（v15）、services/save-service.ts、storage-adapter.ts | `tests/save/`（save-compat-e2e、regression-lock） |
| 性能 / 卡顿 / 内存 | `performance-optimization`（先测量后优化） | [PERFORMANCE](PERFORMANCE_GUIDELINES.md) | docs/ASSET-BUDGET.md、ui/animation-dispatcher.ts、docs/AUDIO-GUIDE.md 限流 | 截图探针 + 内存预算核对 |
| 微信小游戏 / 平台适配 / 广告 | `performance-optimization`（官方无微信专属技能） | [COCOS_CREATOR_STANDARDS](COCOS_CREATOR_STANDARDS.md) + [GAME_FEEL](GAME_FEEL_GUIDELINES.md) | services/platform/platform-service.ts、platform/rewarded-video-adapter.ts、reward/wechat-reward-provider-v2.ts、docs/IAA-DESIGN.md | 真机预览截图 + `tests/` reward 用例 |
| 音效 / BGM | `audio-design` | docs/AUDIO-GUIDE.md + [GAME_FEEL](GAME_FEEL_GUIDELINES.md) | assets/configs/audio-plan.json（25 ID 全 PLANNED） | 接入后人工听验清单 |
| 卡牌 / Boss 战 | `card-game`（+`rpg` 数值时） | [RPG_DESIGN](RPG_DESIGN_GUIDELINES.md) | v59o/card-battle/（card-engine、card-database、card-rng、boss-mechanics-ultimate） | `tests/v59o/` |
| 美术资产生产 | `create-game-assets` | [ART_ASSET](ART_ASSET_GUIDELINES.md) | assets/configs/art-production-manifest.json | 尺寸/命名/预算核对 |
| 设计 / 验收 / 报告文档 | `game-docs` | 本目录全部文档 | docs/、ai/reports/ | 文档与代码一致性抽查 |

## 2. 加载纪律

1. 一个 Task 最多加载其路由行列出的技能，**不加载无关技能**。
2. 技能内容是方法论；其 Godot/Unity 示例代码不得直接复制，须经 `COCOS_CREATOR_STANDARDS.md` 兼容性检查后用 Cocos Creator 3.8 API 重新表达。
3. 技能方法论与 AGENTS.md 冲突时，一律以 AGENTS.md 为准（Git 保护、禁危险命令、Review 分级）。
4. 使用情况按条目追加到 [SKILL_USAGE_LOG.md](SKILL_USAGE_LOG.md)（任务、技能、应用点、产出）。

## 3. 路由测试（任务书 §十一 5 例，2026-11-21 执行）

| # | 测试任务 | 期望路由 | 结果 |
|---|---|---|---|
| R1 | 新增修仙功法 UI | `rpg` + `game-ui-ux` → RPG_DESIGN + UI_UX + GAME_FEEL（功法页徽章/横幅已有 v10.2 先例） | PASS（路由命中，未实际开发） |
| R2 | 新增 NPC 对话事件 | `game-ai` + `dialogue-systems` → NPC_DIALOGUE（锚点：career-event-service + save 迁移） | PASS（路由命中，未实际开发） |
| R3 | 优化离线奖励弹窗 | `game-ui-ux` + `game-feel` → UI_UX + GAME_FEEL（锚点：offline-reward-service、REWARD-UX-STATE、IAA OFFLINE_DOUBLE 位） | PASS（路由命中，未实际开发） |
| R4 | 优化微信小游戏资源加载 | `performance-optimization` → PERFORMANCE + COCOS_CREATOR_STANDARDS（锚点：ASSET-BUDGET、SPRITE-ATLAS-PLAN） | PASS（路由命中，未实际开发） |
| R5 | 修复存档兼容问题 | `save-systems` → SAVE_SYSTEM（锚点：save-data.ts v15、save-service.ts migrate、tests/save） | PASS（路由命中，未实际开发） |

> 路由测试只验证「任务→技能+规范+锚点」的匹配与可读性，不启动实际开发。
