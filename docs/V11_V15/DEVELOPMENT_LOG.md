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
- 提交：`f9526bc`

### 2026-11-21 · V11-S2 炼丹深化（成功率 + 品质 + 事务回滚 + 重复绑定修复）

- 技能：`rpg`（品质期望值曲线，保证净消耗池不变负循环）、`game-feel`（品质反馈文案）、`save-systems`（事务一致性原则）
- 设计依据：任务书§11（成功率/品质/防无限产资源）、§23（重复操作/资源扣除与到账一致性）；品质乘子 EV 校验：默认权重 [0.6,0.25,0.12,0.03] × 乘子 [1,1.3,1.7,2.5] → EV ×1.204，修为→修为配方仍净负（100→60.2），无资源放大回路
- 现有实现：craft 即时结算、无成功率/品质；**发现 P1 级 UI 缺陷：refresh 重复绑定 CraftButton click → 一次点击多次炼制（重复扣资源）**
- 修改内容：
  - `craft-service.ts`：`successRate`/`qualityWeights` 配置 + 确定性 RNG 注入 + 失败路径（材料消耗、无产出、`itemCraftFailed` 事件）+ 品质分段权重掷骰（普通/良品/上品/极品 ×1/1.3/1.7/2.5）+ **apply 失败回滚材料与产出登记（要么全成要么无痕）** + 构造期配置校验
  - `craft.json`：9 配方全部补 successRate（0.75–0.95）；artifact_lingpai 补 qualityWeights
  - `game-events.ts`：新增 `ItemCraftFailedEvent` + 事件表注册
  - `craft-page-component.ts`：修复重复绑定（WeakSet 按 Button 实例去重）；EFFECT_LABELS 修正实际键（cultivation/salary/performance/mind）；效果行展示「成功率 N% · 品质最高×2.5」；成功 toast 带【品质】+实际效果
  - `view-models.ts`：VM 增加 successRate/qualityMultiplierMax
- 测试结果：**craft 测试 19/19 PASS（含 7 个新 V11 用例：失败路径/掷骰边界/品质乘子/配方权重/rollQuality 边界/坏配置拒绝/回滚一致性）；`tsc --noEmit` 0 错误**
- 涉及文件：`craft-service.ts`、`craft.json`、`game-events.ts`、`craft-page-component.ts`、`view-models.ts`、`tests/craft/craft-service.test.ts`
- 提交：`36b988c`

### 2026-11-21 · V11-S3 音频与设置接线（空壳开关修复 + 炼丹音效）

- 技能：`audio-design`（开关/音量真实生效口径）、`game-ui-ux`（状态来自真实数据，禁止硬编码标签）、`game-feel`（反馈音效映射）
- 设计依据：任务书§20（音效可调节/开关真实生效）、§16（每个按钮都有真实行为）
- 现有实现审计发现（3 个空壳/断链）：
  1. **SettingsService 从未被实例化**——设置持久化整链断路（服务完好但死代码）
  2. **设置页 BGM/SFX 开关无 handler**——`checkEvents[0].emit()` 是无意义调用，标签硬编码「开」
  3. **AudioService 启动不读持久化设置**——只用默认值
- 修改内容：
  - `game-context.ts`：注册 `context.settings = new SettingsService(storage)`
  - `cocos-bootstrap-component.ts`：`wireAudioLifecycle()` 启动时应用持久化 musicEnabled/sfxEnabled
  - `settings-service.ts`：新增 bgmVolume/sfxVolume 字段（默认 0.6/0.8，钳位 [0,1]，白名单加载兼容旧档）
  - `settings-page-component.ts`：真实 toggle/slide handler（同时应用 AudioService 立即生效 + SettingsService 持久化）；标签/开关初始态来自真实状态；移除 `checkEvents[0].emit()` 噪声调用
  - `animation-dispatcher.ts` + `animation-trigger-map.json`：新增 craft_success（itemCrafted→ui_success）/craft_failed（itemCraftFailed→ui_fail）触发器，双源同步
  - 纠偏记录：此前认为「AudioService 无限流」是误判——CocosAudioBackend 已实现 per-id cooldown 80ms + 并发上限 8
- 测试结果：**新增 tests/settings（6/6）+ tests/ui/animation-dispatcher-craft（4/4）；全量 191 文件全过 exit 0**
- 涉及文件：`game-context.ts`、`cocos-bootstrap-component.ts`、`settings-service.ts`、`settings-page-component.ts`、`animation-dispatcher.ts`、`animation-trigger-map.json`、tests×2
