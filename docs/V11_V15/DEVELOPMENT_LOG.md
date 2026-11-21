# V11–V15 全项目深度开发 — 开发日志（DEVELOPMENT_LOG）

> 持续追加。格式：日期 | 切片 | 技能（按 SKILL_ROUTER） | 设计依据 | 现有实现 | 修改内容 | 测试结果。
> 基线：分支 `feature/v10-final-release` @ `c37edf5`（2026-11-21）。终验基线 P0=0 / P1=0（docs/FINAL_QA/BUG_LIST.md）。
> 用户未提交 WIP（V10.2 终验修复 BUG-001 save-service / BUG-002 cultivation-service + tests/daily）**不触碰、不夹带**；涉及这两个文件的切片暂缓至 WIP 提交后执行（见 BACKLOG）。

## 现状审计（2026-11-21，以代码为准）

| 系统 | 现状 | 深度结论 |
|---|---|---|
| 炼丹 craft | craft-service(121行) + craft-page(346行) + tests/craft | **即时结算**：无炼丹时间、无品质、无成功率；效果即时生效无丹药库存 |
| 天赋 talent | talent-service(45行) + talent.json + tests/talent | **开局三选一单天赋**：无五路线、无天赋点/等级/重置（任务书§5 要求差距大，需存档字段） |
| 排行榜 leaderboard | leaderboard-service(149行) + leaderboard-page(10行榜单 UI) | **单榜 + Math.random + Date.now()**：不可复现、无多榜单、无 Provider 抽象、无测试（任务书§17） |
| 境界 realm | career.json 每级 realm 展示字段（DECISION_LOG D-008） | **非独立境界树**；突破系统缺失（任务书§8 核心需求，需存档迁移） |
| 音效 | audio-service + cocos-audio-backend + audio-plan.json（25 ID 全 PLANNED） | 程序化合成垫兜底已生效；SFX 触发接线不全 |
| 存档 | V1 fail-closed v15；SaveServiceV2 设计在案未接线（SAVE_SYSTEM §4） | 用户 WIP 修复中（BUG-001） |
| 事件 | career-events.json（30 事件）+ v2 events + scheduler | 已有资格契约/权重/冷却（EVENT-ELIGIBILITY-CONTRACT） |
| KPI / 晋升 / 摸鱼 / 离线 / 合并 / 宗门 / 好友 | 均有 service + 测试 | 见 FINAL_QA 功能报告 |

## 开发记录

### 2026-11-21 · V11-S1 排行榜深化（本地模拟榜 → 多榜单/确定性/Provider/测试）

- 技能：`rpg`（榜单指标口径）、`game-ui-ux`（本地模拟标记、空态）、`performance-optimization`（缓存与刷新节奏）
- 设计依据：任务书§17（日/周/月/总榜→本地先抽象接口）、任务书§14 可测试可复现原则、GAMEDEV_SKILLS/QA_GUIDELINES
- 现有实现：`leaderboard-service.ts` 单榜（career+exp 排序）、Math.random 生成、Date.now() 节流、无测试
- 修改内容：
  - 新增 `LeaderboardMetric`（career/cultivation/wealth/achievement 四榜）与 `LeaderboardProvider` 接口（`LocalMockProvider` 实现，后端可替换）
  - Math.random/Date.now() → 注入 `RandomProvider`/`Clock`（项目确定性约定），NPC 生成按种子可复现
  - 玩家四维指标入榜；entry 增加 `score` 字段（各榜独立分值）
  - `leaderboard-page-component` 支持四榜切换（复用现有节点绑定，无编辑器改动）+ 本地模拟标记
  - 新增 `tests/leaderboard/leaderboard-service.test.ts`（确定性/排序/玩家排名/topN/around/四榜/负值防御）
- 测试结果：**排行榜测试 12/12 PASS；全量 189 文件全过 exit 0**（含编译）。UI 切换依赖场景 RefreshButton（原死节点）绑定，节点缺失时静默降级单榜
- 涉及文件：`leaderboard-service.ts`、`leaderboard-page-component.ts`、`game-facade.ts`（queryLeaderboard/Metrics/TopN/AroundPlayer 加 metric 参数）、`tests/leaderboard/`
