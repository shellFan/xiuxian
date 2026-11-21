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
- 提交：`860e9a9`

### 2026-11-21 · V11-S4 炼丹成就系列（CRAFT 类别 + lifetime 统计键）

- 技能：`rpg`（成就梯度 1/10/50/200 与极品稀有度 5 定位）、`game-docs`（幽默文案贴合项目调性）
- 设计依据：任务书§7（成就）、§14（可测试可复现）；零存档 schema 变更（lifetimeStats 为已存档开放键值库）
- 修改内容：
  - `craft-service.ts`：新增 lifetime 统计键 craftSuccessCount/craftFailCount/craftPerfectCount（成功/极品在 apply 成功后计入，失败即时计入，回滚路径不残留）
  - CRAFT 成就类别注册：`achievement-service.ts` + `config-types.ts` + `config-service.ts`（VALID_ACHIEVEMENT_CATEGORIES）
  - `achievements.json`：6 个新成就（CRAFT_FIRST/10/50/PERFECT_5/FAIL_10/ALL_PILLS，total 105→111）
  - `game-context.ts`：CraftService 接收 `options.randomProvider`（与其他服务一致的注入口径）
  - 修复测试稳定性：craft.json 引入成功率后，`game-ui-controller.test` 未注入 RNG 有 10% 失败率 → 3 处 facade 构造注入确定性随机源
- 测试结果：**craft 22/22；全量 191 文件全过 exit 0；content:check PASSED（成就 111）**
- 涉及文件：`craft-service.ts`、`achievement-service.ts`、`config-types.ts`、`config-service.ts`、`achievements.json`、`game-context.ts`、`tests/craft/`、`tests/ui/game-ui-controller.test.ts`
- 提交：`844245c`

### 2026-11-21 · V11-ACC 真实运行验收（任务书§26）+ MORE 死入口回归修复（P1）

- 技能：`game-ui-ux`（导航可达性）、`performance-optimization`（探针复用 CDP 体系）
- 发现（**P1 UX 回归**）：V9.0 五页导航重构把 MORE 从 NAV_TABS 移除后，`case 'MORE'` 成死代码——**成就/设置/图鉴/排行榜/法宝/结算等 renderMore 页面在 overlay 中全部不可达**（代码注释 §54 明确「功法/法宝在更多」，设计意图被回归）。附带：overlay craft handler 成功 toast 无品质信息。
- 修复：NAV_TABS 恢复第六项「更多」；overlay craft 成功 toast 带品质标签；配方卡显示成功率/品质上限（与 Cocos 页面同口径）
- 验收探针：新增 `scripts/v11-qa/v11-acceptance-probe.cjs`（fresh web-desktop build + 430×932 真实 Chrome + CDP）：
  - 重建链路验证：`build-web.cjs`（Cocos 3.8.4 编辑器实机构建，27s）→ `copy-web-build.cjs` → 服务 → 探针
  - **7/7 阶段 PASS**：A1 boot/新档/facade；A2 排行榜四榜+确定性+rank31；A3 炼丹卡「成功率90%」入 DOM + **真实点击合成 → toast「炼制成功！【普通】」+ craftSuccessCount=1 + 修为 5000→4950（扣100得50）**；A4 成就页 DOM 可见初试丹道/极品丹师；A5 设置页真实行+滑条+context.settings 音量字段
  - 截图 8 张：`artifacts/V11_V15/screenshots/01-home…08-home-final.png` + `v11-acceptance-results.json`
- 涉及文件：`desktop/ui-overlay.js`、`scripts/v11-qa/`、`artifacts/V11_V15/`
- 局限（如实）：canvas 侧 LeaderboardPage 的榜单切换按钮（RefreshButton 绑定）未做视觉验证（canvas 内坐标点击脆弱），服务层行为已由 A2 + 12/12 单测覆盖；微信真机仍属环境阻塞（BACKLOG E1）
- 提交：`c57c7b7`

### 2026-11-21（第二轮） · V11-F5 统一事件管理器接线 + 摸鱼场景事件（任务书§14/§7）

- 技能：`rpg`（事件权重/彩票结构）、`dialogue-systems`（分支选择文案）、`game-feel`（摸鱼调性文案）
- **审计发现（核心）**：生产 `CareerEventService.poll()` 是全池均匀随机、零资格过滤（同事件可连发、彩蛋可重复、无职级/模式门控），而完整实现 EVENT-POOL-V1 契约的 `EventRuntimeAdapter`（类别彩票/冷却/近史排除/负面连击抑制/mode 门控/彩蛋 once）**从未接入生产**——"设计在案未接线"型缺口
- 修改内容：
  - `career-event-service.ts`：poll() 接入 EventRuntimeAdapter（快照：career/workMode/mind/KPI 完成比）；`recordShown` 记账；无合格候选跳过本机会（契约语义）；导出 `FISH_EVENT_ELIGIBILITY`（7 个摸鱼事件 `requiresWorkMode:'FISHING'` sidecar——以 TS 常量落地，避免手写 .meta 风险）
  - `event-runtime-adapter.ts`：**修复默认 maxCareerLevel 10→20**（V10.2 职级扩展后 11+ 级玩家会被默认元数据过滤成零候选）
  - `career-events.json`：+7 摸鱼场景事件（茶水间偶遇/会议摸鱼/厕所秘籍/隐藏红包/领导抓包/同事掩护/高人指点【彩蛋】），30→37
  - 设计确认：新档默认 `workMode='FISHING'`（摸鱼起步），摸鱼事件对新玩家立即生效；adapter 内建 FISHING 权重修正（POSITIVE×1.2/NEGATIVE×0.8）
- 测试结果：**career-event 13/13（种子按新选择算法重算）+ 门控引擎级用例（WORK 模式 0.99 掷点也只能选到非摸鱼事件）**；config-service/phase2-stability 事件计数断言更新（30→37/8 choice/29 direct）；**全量 191 文件全过 exit 0；content:check PASSED**
- 行为变化（如实）：事件分布从均匀随机变为 EVENT-POOL-V1 设计分布（彩蛋 0.1%/稀有 1%/普通池按职级段加权+保护规则）；冷却/近史/彩蛋已见状态为会话级（内存），跨会话持久化属 B 系列存档扩展
- 涉及文件：`career-event-service.ts`、`event-runtime-adapter.ts`、`career-events.json`、`tests/events/career-event-service.test.ts`、`tests/config/config-service.test.ts`、`tests/phase2/phase2-stability.test.ts`

### 2026-11-21（第二轮） · V11-F6 摸鱼成就系列（FISH_SECONDS 条件类型 + FISH 类别）

- 技能：`rpg`（时长梯度 1h/10h/50h/200h）、`game-feel`（摸鱼幽默文案调性）
- 修改内容：`achievement-service.ts`/`config-types.ts`/`config-service.ts` 注册 `FISH_SECONDS` 条件类型（读 `player.fishingSeconds`——work-service FISHING 模式已持久化的累计秒）与 `FISH` 类别；`achievements.json` +4（带薪如厕/摸鱼入门/摸鱼专家/摸鱼仙尊，111→115）
- 测试结果：成就套件（新增 FISH_SECONDS 阈值/梯度/负例用例）全过；**全量 191 文件 exit 0；content:check PASSED（115）**
- 涉及文件：`achievement-service.ts`、`config-types.ts`、`config-service.ts`、`achievements.json`、`tests/achievements/achievement-service.test.ts`

### 2026-11-21 · V11-F2 overlay 设置面统一（三源 → 单一持久化源）

- 技能：`game-ui-ux`（状态单一真实源）、`save-systems`（设置持久化链路）
- 现状：overlay `_settings` 硬编码 `{sfx:true,bgm:true,notify:false}` 且不持久化，与 S3 接线的 `context.settings`/AudioService 脱节（BACKLOG F2）
- 修改内容：`desktop/ui-overlay.js` —— `overlaySettings()` 从 `context.settings` 惰性初始化；`settingRow` 渲染真实状态；toggle handler 同步 `setSfxEnabled/setMusicEnabled`（持久化，下次启动 AudioService 自动应用，本次 overlay WebAudio 立即生效照旧）
- 验证：验收探针新增 A7 阶段 —— 真实点击 overlay SFX 开关 → `context.settings.sfxEnabled` 翻转 + `localStorage game-settings` 持久化 + 复原一致；**探针 8/8 PASS**（本轮 A3 随机炼出【良品】×1.3，修为 5000→4965，品质乘子真实结算证据）
- 涉及文件：`desktop/ui-overlay.js`、`scripts/v11-qa/v11-acceptance-probe.cjs`
