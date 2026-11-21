# NPC 与剧情系统报告（NPC_STORY_SYSTEM）

> 以实际代码为准（2026-11-22 审计）。技能：`dialogue-systems`（JSON 对话图）、`game-ai`（行为选型）。

## 1. 现状架构

| 模块 | 实现 | 说明 |
|---|---|---|
| 好感度 | `v2/npc-weekend-service.ts NpcService` | clamp **-100~100**（:91）、relationshipStage 阶段判定（:81）、周末互动 |
| NPC 记忆 | `v57/npc-memory-service.ts` | 跨周记忆（NpcMemoryState 持久化到存档） |
| 传书/对话 | `v5/messenger-service.ts`（9 actors / 12 conversations / 211 events / 435 replies / chained 46） | `configs/v5/messenger-*.json`；content:check 全量校验交叉 ID |
| 剧情导演 | `story-director`（storyBudget/interruptBudget/tension/lastMajorEventAt/activeChains/unresolvedCases/firedKeys 持久化）+ `firstWeekStory` | 新手周剧情线 |
| 对话选择持久化 | `dialogFlags`（存档字段） | 重要选择入档 |
| NPC 事件 | `configs/v57/week-content.json`（npcId 关联）+ career-events 池 | 资格契约门控 |
| 羁绊 | v63 synergies（Java+QA 等 4 种） | 团队养成侧 |

## 2. 关系等级映射

relationshipStage 依据好感度分档（NpcService:81）——对应任务书的 陌生/熟悉/朋友/知己/特殊关系 分层；好感度变更走事件重算。

## 3. V11 状态

- 摸鱼事件（F5）含 NPC 互动文案（同事掩护/领导抓包/高人指点）——本地规则驱动，无在线 AI
- achievement msg_ach:* 系列 15 个（传书剧情成就）+ NPC 周末互动链路健康

## 4. 已知缺口（→BACKLOG）

| 缺口 | 任务书依据 | 说明 |
|---|---|---|
| NPC 行为模拟（上班/下班状态机） | §8 | 现状 NPC 无实时行为；如引入先立 FSM 选型说明（game-ai 技能），禁止为小需求引行为树框架 |
| 独立剧情章节（主线三章结构） | §8/§10 | StoryDirector 章节化扩展——内容级任务，需与境界系统（B1）联动设计 |
| NPC 专属任务线 | §8 | assigned-task-service（v3）在位；专属线为内容扩展 |
| 隐藏人物/隐藏结局 | §8 | EASTER_EGG 事件机制已支持 oncePerSave；内容级扩展 |
| Cocos 侧对话组件 | — | 对话流在 overlay（messenger DOM）；canvas 对话组件缺 |
