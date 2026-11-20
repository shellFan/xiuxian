# NPC 与剧情规范

> 路由：NPC/好感度/对话/事件任务 → `game-ai` + `dialogue-systems` 技能 + 本文件。
> 现状：NPC 行为较轻（周末互动/记忆/传书），随机事件引擎较重；规范按此权重制定。

## 1. 现状锚点

| 系统 | 位置 | 要点 |
|---|---|---|
| NPC 关系 | v2/npc-weekend-service.ts `NpcService` | 好感度 clamp **-100~100**（:91）、`relationshipStage` 阶段判定（:81）、周末互动 |
| NPC 记忆 | v57/npc-memory-service.ts `NpcMemoryService` | 跨周记忆（:55） |
| 传书/对话 | v5/messenger-service.ts `MessengerService`（:57） | 飞剑传书对话流；配置 configs/v5/messenger-*.json |
| 随机事件 | services/career-event-service.ts + career-event-scheduler.ts；v2/event-engine.ts `EventScheduler`（:292）+ v2/v2-event-service.ts | 池定义 docs/EVENT-POOL-V1.md、资格契约 docs/EVENT-ELIGIBILITY-CONTRACT.md |
| 事件内容 | configs/career-events.json、configs/v2/events.json | schema：docs/schema/office-events.schema.json |
| 事件 UI | ui/phase2/event-popup（EventCard：Category/Title/Body/EffectList/Choices，choose/defer intent） | COCOS-PREFAB-ARCHITECTURE 表 |

## 2. 对话系统约定（dialogue-systems 技能适配）

- 分支对话采用**数据驱动 JSON 图**（技能的 JSON graph runner 模式）：节点=行/选择/条件/变量；配置放 `configs/` 并纳入 config-validator；**禁止把对话逻辑写成 service 里的过程 if 链**。
- 对话文本进 configs/i18n/（存在 i18n 目录），**必须带本地化 ID**；写死字符串的对话实现不予合入。
- 分支选择的持久化：选择结果属事件状态，必须走存档（SAVE_SYSTEM 流程）；「同一事件不再触发」「已选分支」按事件状态持久化，禁止仅存内存。
- 死分支禁止：每个对话图到达终点或回环到已解锁状态，不允许无限等待节点。

## 3. NPC 行为约定（game-ai 技能适配）

- 现阶段 NPC 无寻路/感知需求；如引入行为逻辑，先用技能的选型表（FSM/Utility）写一段设计说明（状态空间、触发条件），经 Review 后再实现——**禁止为小需求引整个行为树框架**。
- 好感度数值变更必须 clamp 并走事件（`relationshipStage` 重算）；好感度奖励与经济产出联动时按 GAME_ECONOMY 双闸门验证。

## 4. 事件设计规则

1. 新事件必须同时给出：触发资格（EVENT-ELIGIBILITY-CONTRACT 契约字段）、选项效果（数值走 GAME_ECONOMY 流程）、UI 文案（office-events schema 校验，maxLength/pattern 字段已声明）。
2. 每事件状态（pending/deferred/claimed）持久化到存档对应版本字段。
3. 事件测试：tests/events/（3 文件）+ 资格契约测试；改池内容跑 `npm run content:check`。

## 5. 新 NPC 交付检查单

- [ ] 人设卡（名/身份/口头禅/关系区间）落 docs 或配置
- [ ] 好感度区间/stage 阈值与 NpcService 常量一致
- [ ] 对话/传书内容有 i18n ID + schema 校验通过
- [ ] 事件/选择状态进存档（版本+迁移+save 测试）
- [ ] `game-ai`/`dialogue-systems` 使用记录追加 SKILL_USAGE_LOG
