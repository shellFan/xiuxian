# V5.9-J 牛马命运交付与验收报告

日期：2026-10-16（Asia/Shanghai）
分支：`feature/v59j-fate-roguelite`
开发基线 HEAD：`6899c7bdfdbcf716032f1db0d355ab9f86834058`
GamePlay Agent Gate：`20261016-100613-720c54`

## 验收结论

**自动化 release Gate 通过（10/10 场景，0 失败、0 阻塞、0 未验证）；V5.9-J 的全量玩家体验验收仍有明确的 NOT_VERIFIED 项。** 本轮由 Electron 窗口运行打包 EXE，并以 CDP 合成输入执行场景；这能证明 Electron E2E 路径通过，不能证明物理 Windows 鼠标、键盘和屏幕输入通过。

`UI_REAL_EXE=NOT_VERIFIED`、`ELECTRON_E2E=PASS`、`SERVICE_SIM=PASS`。稳定性 soak 为真实经过的 20 分 0.6 秒主页战场循环，不是模拟时间；该场景没有覆盖完整的随机剧情链或死亡轮回互动。

## A. Git 状态

- 分支：`feature/v59j-fate-roguelite`。
- 开发基线：`6899c7bdfdbcf716032f1db0d355ab9f86834058`（与 I.1 工作分支共享基线提交）。
- 推送前远端未发现 `origin/feature/v59j-fate-roguelite`；该分支由本次普通 push 创建。`origin/gameplay-v2` 为 `a8670d12d57173964a82a34f77a9d04279c2c50c`。
- 是否合并 `gameplay-v2`：否；本轮没有合并。
- 原始工作树中的修改全部保留。本次推送包含功能代码、测试、场景定义、交付文档及精选验收证据；完整历史试玩目录（约 703 MB，主要是重复截图）仍保留在本地，没有全部上传。

## B. 功能交付

- 事件数据：30 个事件，覆盖职场、奇遇、危险、人际、连锁剧情和隐藏命运六类。
- 选择与结果：90 个三选项；每个选择都有成功/失败结果，共 180 个结果分支；30 个选项含概率判定。
- 剧情：5 条连锁剧情、3 个隐藏事件、30 个不同结局标识，其中 10 个为死亡结局。
- NPC：5 个（实习生、主管、测试同事、运维同事、神秘老板）。
- 特殊挑战：配置 3 种（线上事故、甩锅主管、秘密试炼），使用现有 V3 BattleService。
- 永久成长：6 种有等级、花费和效果的轮回天赋。
- 状态安全：新增轮回专属状态并保留工资、钱包、职业、装备等既有状态；事件选择、挑战及轮回结算有幂等标识和存档恢复逻辑。
- 内容校验：`npm run content:fate:check` 通过，校验 30 events、90 choices、30 个概率选项、5 条链和 30 个结局。

## C. 真实试玩

以下为本次打包 Windows Electron EXE 的可复现运行记录。窗口可见，所有输入均为 CDP 合成事件，截图由 renderer surface 捕获。

| 场景 | 结果 | 耗时 |
|---|---|---:|
| `character-creation` | PASS | 21.990 秒 |
| `economy`（任务、工资、咖啡） | PASS | 20.174 秒 |
| `fate-first-choice`（事件选择、重启恢复） | PASS | 30.889 秒 |
| `home-arena-soak` | PASS | 1,228.594 秒 |
| `home-five-stages` | PASS | 265.712 秒 |
| `new-player-full-journey` | PASS | 19.157 秒 |
| `profession-loop` | PASS | 7.819 秒 |
| `smoke` | PASS | 7.761 秒 |
| `time-save`（时间边界、结算、三个工作日、存档恢复） | PASS | 31.953 秒 |
| `viewport-matrix` | PASS | 20.542 秒 |

- 首个命运事件：以 `arena:1:2` 关卡里程碑触发；场景通过真实 UI 选项提交，并在重启后验证权威存档中的剧情状态。具体“首次事件发生秒数”及前 1/5 分钟事件频率没有单独计时，故不报告为已验证的节奏指标。
- 一次有效分支样例：实习生事件的 `HELP` 选择写入后续剧情标记、关系与临时战斗修正；存档恢复场景复核了事件历史和选择旗标。所有事件分支并未逐条在 Electron EXE 中试玩。
- 五关用时（来自稳定性运行记录）：18.893、38.914、46.877、59.664、73.785 秒；累计攻击 596 次、暴击 27 次、自动攻击 90 次、技能释放 5 次、击杀 124 个。第五关仍比此前 60 秒目标慢约 13.8 秒，列为后续平衡项。
- 20 分钟稳定性：真实耗时 20 分 0.6 秒、2,990 次节奏点击；heap 约 23–24 MiB，DOM 约 699–722 节点，读数没有持续增长。测试覆盖主页战场和重启恢复，不覆盖完整 J 剧情混合游玩。
- **未在 Electron 场景中验证：**完整五条剧情链的多结局流程、不同事件选项全分支、三种挑战的胜负 UI 闭环、真实死亡展示、轮回后永久资源与天赋购买的端到端流程。相关服务与数据有单元/集成测试，但不可替代这些 GUI 验收。

### 后续补充：命运 UI 专项重放（2026-10-16）

Gate 结束后新增并单独运行两条打包 EXE 场景；它们不计入上方 `10/10` Gate 原始场景总数：

| 场景 | 结果 | 耗时 | 证据 |
|---|---|---:|---|
| `fate-choice-negotiation` | PASS | 24.647 秒 | [summary.md](../gameplay-agent/reports/20261016-110204-5ba497/summary.md) |
| `fate-chain-death-rebirth` | PASS | 32.727 秒 | [summary.md](../gameplay-agent/reports/20261016-111242-301166/summary.md) |

专项场景实测了工资协商分支、实习生五阶段剧情、途中排队的咖啡事件、最终死亡、轮回功德结算、`天生牛马` 天赋购买、开始下一世及 EXE 重启后恢复天赋/结算记录。复现命令为 `npm run gameplay-agent:fate-choice` 和 `npm run gameplay-agent:fate-rebirth`。这两次是可见 Electron 窗口中的 CDP 合成输入，故 `ELECTRON_E2E=PASS`，`UI_REAL_EXE=NOT_VERIFIED`。

调试过程中生成的失败记录均保留：一次场景遗漏了已排队的咖啡事件，另两次断言把概率结果/队列历史索引写死，未证明游戏逻辑故障。Runner 现将 `assert`/`assertState` 失败分类为 `ASSERTION_DEFECT`；先前只读历史报告仍保留其当时的分类，不被重写。

### 后续补充：秘密试炼败北结算回归（2026-10-16）

修复关键消息对话被重复当作未读中断的问题：`markConversationRead()` 会设置 `seen`，但徽标原先按仍待回复的 `read` 字段计算 `criticalUnread`，导致未回复的老板消息持续压住挑战结算。现在徽标按 `seen` 计算未读；打开消息只清除中断，不会消耗回复选项。新增服务回归断言验证“消息已看、仍可回复、关键未读中断已清除”，并新增 UI 合约和场景契约测试。

`npm run gameplay-agent:fate-challenge` 最终单场景 **PASS**，耗时 32.063 秒，108 步，真实触发 V3 `INCIDENT` 战斗并通过可见 UI 放弃挑战。场景处理关键消息后，用权威 `queryFinishedBattle()` 确认 `DEFEAT`，再通过真实按钮处理已排队的 V2 故事事件结果和败北结算，最后验证 `challenge:secret_trial:DEFEAT=true`、`activeChallengeBattleRunId=null`。此前出现的 3 条失败运行记录均原样保留：`20261016-130152-...`、`20261016-132352-...`、`20261016-132528-...`；分别留下了原始结算弹窗缺失、自动化被弹窗遮挡、及尚未处理的真实 V2 故事事件证据。

- 最终单场景报告：[summary.md](../gameplay-agent/reports/20261016-132747-973d15/summary.md)，回放：[replay.json](../gameplay-agent/reports/20261016-132747-973d15/scenarios/fate-secret-trial/replay.json)，最终状态截图：[013-secret-trial-defeat.png](../gameplay-agent/reports/20261016-132747-973d15/scenarios/fate-secret-trial/evidence/screenshots/013-secret-trial-defeat.png)。
- 最终 EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`。
- 最终 ASAR SHA-256：`0281bc3d1ca2a7d265eb0e9ef91c9a3cf5d83a5b9c106469b84d80ed1218e930`。
- 最终 Build input SHA-256：`c74ac8acc656def9cc94f53ffba92f860281d9b6cee56971ebe9a234973150ab`。
- 最新 `npm test`：PASS，156 个测试文件；GamePlay Agent Runner 33/33。另一次针对性 `node --test tests/gameplay-agent/runner.test.cjs`：33/33 PASS；`npm run pc:check`：PASS。
- Electron 窗口可见，输入仍由 CDP 合成；`ELECTRON_E2E=PASS`，`UI_REAL_EXE=NOT_VERIFIED`，`SERVICE_SIM=NOT_RUN`。本补充只复测上述单场景，没有重跑完整 Gate 或 20 分钟 soak。

## D. 测试与构建

- 后续增量校验 `npm run release:check`：PASS，TypeScript 编译及 156 个测试文件通过；Runner 子套件 31/31 通过。
- `npm run content:fate:check`：PASS，30 个事件、90 个选项、30 个概率分支、5 条剧情链与 30 个结局。
- `npm run release:check`：PASS，TypeScript 检查及 `tests/run-all.cjs` 全量测试通过（156 个测试文件；GamePlay Agent Runner 29/29）。
- `npm run content:fate:check`：PASS。
- `npm run pc:build`：新鲜 Cocos Creator 3.8.4 Web Desktop 产物通过后置校验。Creator 子进程原始退出码为 36，构建包装器在确认产物新鲜有效后接受该结果；该细节保留供后续排查。
- `npm run pc:pack`：PASS，生成 Windows x64 Electron 包。
- `npm run pc:check`：PASS；检查了 8 个场景组件注册、迭代器展开转译、构建 manifest 新鲜度及 overlay 哈希。
- `npm run gameplay-agent:gate`：PASS，执行 release check、Cocos build/package/check 以及上表 10 个 EXE 场景。
- 工资、咖啡消费及经济回归：`economy` 场景 PASS；咖啡按现有主钱包精确扣款 ¥18。

## E. 可复现证据

- Gate 摘要：[summary.md](../gameplay-agent/reports/20261016-100613-720c54/summary.md)
- 机器可读 Gate 报告：[report.json](../gameplay-agent/reports/20261016-100613-720c54/report.json)
- 五关及 soak 指标：[home-arena-metrics.json](../gameplay-agent/reports/20261016-100613-720c54/scenarios/home-arena-soak/evidence/home-arena-metrics.json)
- 命运事件重启场景权威状态：[authoritative-state.json](../gameplay-agent/reports/20261016-100613-720c54/scenarios/fate-first-choice/evidence/authoritative-state.json)
- 命运事件截图：`ai/gameplay-agent/reports/20261016-100613-720c54/scenarios/fate-first-choice/evidence/screenshots/011-first-event.png`、`012-choice-after-restart.png`
- 每个场景另有 `replay.json`、步骤截图和状态快照，位于对应场景目录。
- EXE：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
  SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR：`dist/牛马修仙传-win32-x64/resources/app.asar`
  SHA-256：`0281bc3d1ca2a7d265eb0e9ef91c9a3cf5d83a5b9c106469b84d80ed1218e930`（最新重打包；上方 Gate SHA 为此前构建）
- 构建输入 SHA-256：`c74ac8acc656def9cc94f53ffba92f860281d9b6cee56971ebe9a234973150ab`（最新重打包；上方 Gate SHA 为此前构建）
- 测试使用每场景独立临时用户目录；没有读取、清理或覆盖正式玩家存档。

## F. 缺陷和未验证项

- BLOCKER：本次已执行范围内未发现。
- HIGH：本次已执行范围内未发现。
- MEDIUM：物理 Windows 鼠标/键盘、DPI/外层窗口尺寸未验证；完整五条剧情链的分支、三个特殊挑战胜负和事件发生节奏仍缺少 EXE 流程证据；第五关约 73.8 秒，高于 60 秒节奏目标。
- LOW：首次事件时间和前五分钟触发频率需要单独采样，才能校准玩家对事件节奏的预期。
- `UI_REAL_EXE` 仍是 `NOT_VERIFIED`。不能将可见 Electron 窗口加 CDP 输入等同于物理 Windows GUI 验收。
- 早期 smoke 的初始化超时报告继续保留在历史目录；后续同一打包路径成功初始化并完成场景。本次 Gate 10/10 通过，但不会覆盖或删除该历史失败记录。

## G. 下一阶段建议

1. 增加有界、可复现的 Electron 场景，实际走完五条剧情链至少一条分支、三种挑战胜负、一次死亡与轮回、一次天赋购买，并在重启后检查永久状态。
2. 记录 0–5 分钟内事件触发时间及玩家选择结果，再依据数据调整前期事件密度，避免只测“事件可触发”而没有体验节奏证据。
3. 在可控 Windows 桌面输入环境补做物理鼠标/键盘和外窗尺寸验证；同时评估第五关节奏，让其在不削弱事件战斗联动的情况下接近 60 秒目标。

## 发布状态

本次用户授权将 V5.9-I.1 与 V5.9-J 的代码、测试、场景定义、交付报告及精选验收证据提交并推送到 `feature/v59j-fate-roguelite`。重复生成的历史截图和报告继续保留在隔离工作树，未全部纳入 Git，以避免将约 703 MB 的原始试玩素材上传到仓库。没有强推、合并或创建 PR。
