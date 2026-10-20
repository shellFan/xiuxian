# V5.9-N.2 启动恢复与最终验收检查点

**状态：IN_PROGRESS / BLOCKED（不得标记 COMPLETE）**
**检查时间：2026-10-20（Asia/Shanghai；含 2026-10-20 续验补记）**

## 基线与边界

- 起始/当前 HEAD：`b6572122738132922106edfbb3e7b94054717d56`。分支：`feature/v59n-career-life-growth`。
- 仅在隔离工作树 `C:\Users\Fan\.codex\worktrees\v59l-card-battle\xiuxian` 工作；未触碰原工作区或正式存档。
- 保留所有未提交修改和 4,974 个未跟踪历史 GamePlay 报告；未 stash/reset/restore/clean；未提交、推送或合并。

## 启动诊断与构建证据

- 启动诊断覆盖主进程阶段、Renderer/SystemJS 导入、Cocos bootstrap、存档初始化、GameContext/Facade 创建与 ready。当前运行快照无 Renderer 异常，导入、存档和 Facade 初始化阶段均完成。
- 新打包 smoke：本轮构建后的报告 `20261019-132230-51c174`，1/1 通过；前一版报告 `20261019-122302-8a8b7f` 两次隔离启动分别在 4,242ms 与 3,979ms 到达 `GameFacade.ready`。本轮 smoke 截图/replay 已保留。物理 Windows 输入未验证：`UI_REAL_EXE=NOT_VERIFIED`；自动输入为 CDP synthetic。
- 最新 EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`。最新 ASAR SHA-256：`b0e48cd48002db9f231e4720b639cf4327562b812407f37913417153de71cd83`。Build SHA-256：`aec678014196a9e9bbc7ddc85d4950d38dacd00cf7784a5926d95956c7345f2d`。
- 历史“正在唤醒游戏数据”两次超时缺少阶段快照，当前新运行成功不能反推原始间歇性失败根因。启动故障根因：`NOT_VERIFIED`。
- `pc:build` 包装脚本退出码 0，但 Cocos 子进程报告退出码 36；构建日志记录 build success、产物新鲜度和完整性检查通过。仍属构建环境风险，退出码来源未完全解释；不能仅凭包装器 PASS 声称退出码 36 已根治。

## 本轮变更与测试

- Runner 在点击目标缺失时保存 URL、页面标题、可见标题/按钮、弹窗内容、目标 hit-test 与 Canvas 信息；缺失 selector 且证据不足时分类为 `NOT_VERIFIED`。
- 补齐真实单选/确认按钮 locator（`[data-vevent-choice="__auto"]` 与 `#V2EventOk`），并为滚动场景支持最多四段可见 UI 路由恢复。
- 裁员场景增加事件确认与“晋升 → 招聘”实际 UI 导航。未改游戏时钟规则，未注入最终游戏状态。
- `node --test tests/gameplay-agent/runner.test.cjs`：48/48 通过。
- `npm test` 执行到尾部输出，最后 Runner 套件 48/48 通过；调用会话未保留顶层 npm 退出码，因此顶层退出码记录为未确认。
- 定向场景使用现有新打包 Electron EXE；所有操作为 CDP 合成输入，`ELECTRON_E2E` 不等于物理 GUI 验证。

## 裁员再就业 UI 场景

- 最新运行：`ai/gameplay-agent/reports/20261019-132555-22783d/`；前次新包运行：`20261019-132253-278b6c/`。流程已通过真实 UI/CDP 输入完成裁员预警、接受补偿、补偿入账 ¥616、失业状态、招聘页导航、面试申请确认，并重新打开招聘页处理“节日粽子”和“飞剑传书·关键消息”中断。
- 已确认并修复一个 `GAME_DEFECT`：待业时 `querySect()` 返回空，招聘点击处理器将其误当作新角色首次选宗门，走 `changeSect` 直接换宗门，绕过申请、面试与次日合同。新处理器读取权威 `queryCareerLife().employment`；待业玩家仍需通过持久化申请与面试。回归测试 `an unemployed character applies and interviews instead of bypassing hiring with a first-sect change` 通过；新包报告 `20261019-132253-278b6c` 的步骤 89–91 已实际观察到申请确认、申请保存和面试按钮。
- 场景仍为 `SETUP_BLOCKED`，不得标 PASS：fresh-player 的权威快照显示面试前 `performance=0`、`careerLevel=1`。后端当前分数公式下，交付回答得分为 `0 + 2 + 15 + 0 = 17`，低于最低面试门槛 50；最新运行在步骤 98 未显示录用按钮。该场景缺少合法的真实成长前置，不能通过改门槛、注入最终状态或伪造录用消除阻断。
- 关键证据：
  - 原始事件中断截图：`ai/gameplay-agent/reports/20261019-131041-b52586/scenarios/career-layoff-reemployment/evidence/screenshots/015-failure-step-86.png`；DOM 显示“节日粽子”真实确认按钮及“飞剑传书”页面。
  - 首次招聘绕行截图：`ai/gameplay-agent/reports/20261019-131341-748573/scenarios/career-layoff-reemployment/evidence/screenshots/015-failure-step-90.png`。
  - 面试 UI 修复后确认申请步骤：`ai/gameplay-agent/reports/20261019-132253-278b6c/scenarios/career-layoff-reemployment/result.json`（步骤 89–91）。
  - 关键消息中断截图：`ai/gameplay-agent/reports/20261019-132415-f9133c/scenarios/career-layoff-reemployment/evidence/screenshots/015-failure-step-90.png`。
  - 最新结果与重放：`ai/gameplay-agent/reports/20261019-132555-22783d/scenarios/career-layoff-reemployment/result.json`、`replay.json`。
- 裁员补偿幂等、失业期间无旧工资、成功再入职和次日工资、重启恢复仍未完成 UI 验收；整条场景不得算 PASS。

## 完整 Gate 与其他验收

| 验收项 | 当前状态 | 证据/缺口 |
|---|---|---|
| Smoke / GameFacade ready | `ELECTRON_E2E_PASS`；`UI_REAL_EXE=NOT_VERIFIED` | 本轮新包 smoke 1/1 通过，报告 20261019-132230-51c174 |
| 裁员再就业 UI 闭环 | `SETUP_BLOCKED` | 直接换宗门绕过面试的 UI 缺陷已修；fresh-player 面试分 17 < 最低门槛 50，无法在不成长的前提下产生录用，成功重入职/次日工资未验证 |
| 八宗门五阶段 Fate 链 | `UNIT/SERVICE_SIM 部分通过；UI NOT_VERIFIED` | 既有测试结果不能替代本任务要求的逐宗门确定性集成 + UI |
| 四职业成长全效果 | `UNIT 部分通过；UI NOT_VERIFIED` | 技能、工资/卡牌、面试晋升及恢复矩阵未完整验收 |
| 实际 GamePlay 场景清单 | `24` | 读取当前 scenarios 目录；完整 Gate 未运行，不得报通过或跳过数 |
| 全量 GamePlay Agent 场景集 | `FAILED`（基线）；定向项目合同、职业生活复测 `PASS` | `20261019-134430-6ea032` 为 15 PASS / 6 FAIL / 3 BLOCKED；之后 `20261019-142911-e55e70`、`20261019-144930-ece66a` 各有一个修复后场景 1/1 PASS，其余全量场景结果未刷新 |
| 最终 Gate 命令 | `NOT_RUN / BLOCKED` | Gate 会重复 release/build/pack 并再次执行完整 EXE 场景（含 20 分钟 soak）；同一新版本的 release:check 已通过，当前全量场景已明确失败，未重复启动相同 Gate。不能按 Gate 通过交付 |
| 新版本真实墙钟 20 分钟 soak | `ELECTRON_E2E_PASS` | 全量运行中的 `home-arena-soak` 实际持续约 20 分钟；约 2,834 次有效点击，JS heap 报告 24 MiB，DOM 788–1,580 浮动，未见持续增长；证据在 `20261019-134430-6ea032` |
| 30 日正常 / 加班 / 自由宗门、100 日长期模拟 | `NOT_VERIFIED` | 本轮全量单测中的其他模拟不等价于指定矩阵 |
| 存档重启恢复 | `UNIT 部分通过；UI NOT_VERIFIED` | 本轮 smoke 验证了 EXE 重启启动，未验证裁员/新合同状态完整恢复 |
| Cocos 退出码 36 | `RISK OPEN` | 产物校验成功但子进程退出码未解释 |
| 物理鼠标键盘 | `UI_REAL_EXE=NOT_VERIFIED` | 仅 CDP synthetic |

当前场景数为 24，清单：`card-battle-defense`、`card-battle-first-win`、`card-battle-random-event`、`card-battle-save-reload`、`career-layoff-reemployment`、`career-life-growth`、`character-creation-attributes`、`character-creation`、`economy`、`fate-chain-death-rebirth`、`fate-choice-negotiation`、`fate-first-choice`、`fate-secret-trial`、`home-arena-soak`、`home-five-stages`、`new-player-full-journey`、`profession-loop`、`sect-career-interview`、`sect-character-creation`、`sect-overtime-approval`、`sect-project-contract`、`smoke`、`time-save`、`viewport-matrix`。

完整场景基线 `20261019-134430-6ea032`：**15 PASS / 6 FAIL / 3 BLOCKED**。24 个场景均实际运行、无跳过；3 个 `SETUP_BLOCKED` 场景不算 PASS。此为当时的全量结果，后续单场景复测不能改写该次结果。

## N.2 后续缺陷定位与定向复测

- `sect-overtime-approval` 旧失败并非时钟规则问题：`devJumpToHour(17,55)` 将权威时钟移至次日，但 `queryWorkToday()` 是只读查询，不负责创建新的 `GameDay`。旧状态仍锚定前一工作日，因此显示 `countdownMs=0`、`overtimeSeconds=86100`，而 `queryGameClock()` 已正确显示次日 17:55。场景现先通过与主页相同的 `queryHomeTodayWork()` 投影建立当前工作日，再分别校验主页与只读工作服务倒计时；未改动时钟规则。
- 同一次诊断发现共享 `_new-player` 前置在方向卡片点击后立即读取 `draft.direction`，有时读到点击事件处理前的状态。回归断言改为使用现有 `clickUntilState`，最多三次真实 UI 点击并轮询权威草稿；新包场景复测中一次输入后于状态轮询观察到 `TECH_RND`。失败时会停止推进并按 `SETUP_BLOCKED` 保留依赖关系。
- 新 EXE 定向场景报告 `20261019-153010-6e3678`：`sect-overtime-approval` **89/89 步通过**，耗时 **31,592 ms**。流程包括八步建角、外包宗门、17:55 权威时间、次日 `GameDay` 建立、工作服务倒计时、主页可点击审批、审批结果 `APPROVED`、关闭重启以及结果一致性。新工作日主页倒计时为 `299,992 ms`，只读工作服务随后为 `299,201 ms`。EXE SHA-256 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`；ASAR SHA-256 `b0e48cd48002db9f231e4720b639cf4327562b812407f37913417153de71cd83`。截图与 replay 位于 `ai/gameplay-agent/reports/20261019-153010-6e3678/scenarios/sect-overtime-approval/`。验证模式为 `ELECTRON_E2E=PASS`、`UI_REAL_EXE=NOT_VERIFIED`、`SERVICE_SIM=NOT_RUN`。
- 为两个场景行为新增/调整的结构回归测试先按预期失败，再通过：`tests/v59m/overtime-facade.test.ts` 与 `tests/v59m/sect-projects.test.ts` 定向共 **22/22** 通过。随后完成新鲜完整 `npm test`，TypeScript 编译、全部既有测试文件、平衡模拟和 GamePlay Runner 48/48 均通过，顶层退出码 **0**。
- 本次只修改 GamePlay JSON 场景与结构测试，不涉及游戏运行时代码；现有新 EXE 的 ASAR 内 `ui-overlay.js` SHA 与工作树源码相同，因此本次场景级修复无需重新打包。没有重新运行完整 Gate 或重复启动其 20 分钟 soak。

- `sect-project-contract` 在基线报告中的失败分类为 `ASSERTION_DEFECT`，但定向复测表明业务断言本身有效：新 EXE UI 点击后，权威合同状态即时为 `ACTIVE`，卡牌战斗即时为 `PLAYER_ACTION`。失败来自测试流程：关键传书选择把可见页面带入消息详情，原场景没有回到项目页，导致后续 DOM 等待失败。
- 增加“开始点击后立即读取合同与战斗权威状态”的步骤，并在真实消息/事件处理后通过页面返回按钮和项目导航恢复战斗视图。定向单测 `tests/v59m/sect-projects.test.ts`：11/11 通过；新 EXE 场景复测 `20261019-142911-e55e70`：`sect-project-contract` 1/1 PASS。
- 该修复只改场景与结构回归测试；未修改游戏代码、时钟规则、EXE 或 ASAR。定向复测使用 CDP 输入，`UI_REAL_EXE=NOT_VERIFIED`。其余全量场景尚未复跑；完整 Gate 仍未通过。
- `career-life-growth` 基线失败也由实际 UI 证据定位为自动化场景路由/视图预期错误：关键传书选择会打开消息详情，必须用返回按钮离开；宗门 Fate 选项由主页 `HomeArena` 渲染，不出现在晋升页。场景已补齐真实 UI 的返回和主页导航，并增加回归断言；`tests/v59m/sect-career.test.ts` 7/7 通过，新 EXE 定向复测 `20261019-144930-ece66a` 1/1 PASS。
- 项目合同和职业生活两个定向场景均使用同一 EXE/ASAR；只改场景与测试，无游戏代码修改，因此无须重新构建。本轮定向通过不改变此前 24 场景全量基线的失败状态。

本轮命令核验：`npm test` PASS（此前该报告记录的运行，退出码 0）；`npm run release:check` PASS；`npm run pc:build` 包装命令 PASS，但 Cocos 子进程返回 36 并输出环境警告；`npm run pc:pack` PASS；`npm run pc:check` PASS；`npm run gameplay-agent:smoke` PASS；`npm run gameplay-agent:test` 基线全量运行 FAILED（15/6/3）；之后 `sect-project-contract`（1/1）及 `career-life-growth`（1/1）定向复测 PASS。`npm run gameplay-agent:gate` 未执行；当前仍有未修复/未验证场景，不能报告 Gate 通过。

## 缺陷分级与停止点

- **HIGH / AUTOMATION_DEFECT**：弹窗类型（单按钮事件结果、关键消息）存在真实 locator 缺口；已修复 locator 和多段恢复并由单测覆盖。
- **HIGH / NOT_VERIFIED**：真实招聘 UI 面试选项在关键消息弹窗出现期间未到达；当前证据不足以决定修 Runner 重试、事件调度优先级或招聘 UI 状态机。此处停止继续反复启动，避免自动做出影响玩家关键剧情选择的决定。
- **MEDIUM / RISK OPEN**：Cocos 子进程退出码 36 与包装构建成功状态不一致，需获取编辑器日志/退出码来源。

## 2026-10-20 续验补记

本补记记录从交接点继续后的核查，原始失败记录和全量 Gate 基线仍保留：

- 当前 HEAD 仍为 `b6572122738132922106edfbb3e7b94054717d56`，分支仍为 `feature/v59n-career-life-growth`。检查时保留 21 个已修改 tracked 文件及 6,177 个未跟踪文件；包含历史 GamePlay 报告与 N.2 报告。没有 stash/reset/restore/clean、提交、推送或合并。原工作区未触碰。无 Runner 或游戏 EXE 正在运行。
- `npm test` 本轮已运行至全部后段套件，输出未显示失败；GamePlay Runner 为 48/48，已有平衡模拟输出 30/60 日六画像均未违反报告中的数值不变量。终端会话在最终 npm wrapper 退出信息可读取前结束，故顶层退出码记为 `NOT_CAPTURED`，而非严格 `PASS`。
- 最新 smoke 证据 `20261019-163406-5f888b`：1/1，`GameFacade.ready` 注册状态正常；两次重启都经过 renderer、SystemJS、Cocos bootstrap、存档初始化、GameContext/Facade 创建并到达 `GAME_FACADE_READY`，耗时约 4,559 ms。物理输入仍 `UI_REAL_EXE=NOT_VERIFIED`。
- 最新裁员再就业证据 `20261019-163304-9af207`：1/1，35,041 ms；真实可见 Electron 窗口接受 CDP 合成输入，完成创建角色、裁员补偿、失业、求职申请、面试、重新入职、次日工资及关闭重启后验证。状态为 `ELECTRON_E2E=PASS`、`UI_REAL_EXE=NOT_VERIFIED`、`SERVICE_SIM=NOT_RUN`。关键步骤截图和 replay 保留在对应场景目录。此前因 fresh-player 面试资历不足导致的 `SETUP_BLOCKED` 已被后续实际闭环结果取代。
- 两份定向运行记录共同声明的制品 SHA-256：EXE `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`，ASAR `2d3ba7d1ba5c3c5715739d60c69deda9978145f16544229539366f2441dc88b6`，Build `be9e01961a4f597e78bf25e38bcf69432d0dc29649120053869d66da450359b2`。对当前磁盘文件重新计算的 EXE 与 ASAR SHA 与上述一致。
- 启动问题的历史停滞根因仍是 `NOT_VERIFIED`：可观测诊断及当前 smoke 证明被测运行成功，不能倒推出早先间歇性“正在唤醒游戏数据”的触发根因。
- 构建退出码 36 的调查仍未完成：`scripts/build-web.cjs` 通过 `spawnSync` 继承 Cocos 标准输出，`scripts/web-desktop-build-result.cjs` 在必需构建产物存在、非空且新鲜时把 36 映射为包装成功；这些代码只说明退出码被包装器接受，尚无 Creator 日志或官方语义证据解释 36 的来源。本轮未重新构建，避免在无源码产品变化时重复覆盖生成产物。
- 完整 GamePlay Gate 未执行；最近全量结果仍是 24 个场景中 15 PASS / 6 FAIL / 3 BLOCKED。两项定向通过不改变全量状态。八宗门五阶段链、四职业成长验收、20 分钟新版本 soak、指定 30/100 日模拟矩阵仍为 `NOT_VERIFIED`；物理输入仍为 `UI_REAL_EXE=NOT_VERIFIED`。

本检查点状态仍为 `IN_PROGRESS / BLOCKED`。不得标记 N.1/N.2 完成；没有进行本地提交或远端操作。后续需捕获一轮新 `pc:build` 的完整 Creator 输出与实际子进程状态，完成失败场景根因修复后再运行完整场景 Gate，并逐项补齐八宗门、职业、soak 与模拟矩阵证据。

## 新包全量场景与失败修正（2026-10-20）

- Cocos 3.8.4 在新一轮 `pc:build` 中明确记录 `build success in 37796`，所有完成阶段为 success；随后包装输出 `Cocos Creator returned 36 after a verified fresh Web Desktop build`。本构建过程有“auto refresh because script compiled or scene changed”提示，但没有错误栈、Creator crash 日志或能证明退出码 36 语义的来源。结论仍为：产物验证通过、子进程异常码来源 `NOT_VERIFIED`，风险开放。未修改包装器去吞错，也未将 36 宣称为正常退出。
- 本次 `pc:pack` 完成；`pc:check` 为 PASS（8 个场景组件注册、iterator-spread 检查、manifest FRESH、overlay SHA 匹配）。最新 EXE SHA-256 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`；最新 ASAR SHA-256 `e5e461dec02c389a07256961b9d4ad92dbc2a29dab25abd98e05f494b1e10bc0`；Build SHA-256 `be9e01961a4f597e78bf25e38bcf69432d0dc29649120053869d66da450359b2`。
- 新包 smoke `20261019-165151-e6630f`：1/1 通过。完整 GamePlay 运行 `20261019-165219-b5f28d`：24 场景中 20 PASS、2 FAIL、2 BLOCKED；没有跳过。`home-arena-soak` 在该次新包运行中真实墙钟 20 分钟通过，约 2,800 次有效点击，heap 约 24–25 MiB，DOM 稳定在约 777–1,483。该数据只证明 Electron/CDP soak。
- 新发现的两个 SETUP_BLOCKED：`card-battle-random-event` 与 `card-battle-save-reload` 在共享角色创建流程 `background:ORDINARY_WORKER` 处未观察到权威 draft 变化。证据截图 `20261019-165219-b5f28d/scenarios/card-battle-random-event/evidence/screenshots/006-failure-step-31.png` 显示背景卡可见；交互诊断显示控件 visible、enabled、未被遮挡，hit target 是其内部 `SPAN`，但权威 `draft.background` 仍为 null。Renderer 日志未显示对应异常。其它场景的同一建角流程能通过，所以根因尚不能归类为确定的 `GAME_DEFECT` 或 `AUTOMATION_DEFECT`；场景依赖标为 `SETUP_BLOCKED`，底层原因 `NOT_VERIFIED`。两项卡牌验收不能通过。
- `sect-project-contract` 初次全量失败证据截图显示游戏仍在项目战斗页；场景却无条件点全局 `[data-action="back"]`，此控件确实存在但按 UI 语义只清除 `_subPage`，不能证明消息页打开。将其错误步骤移除，保留后续可见项目导航；新增回归测试先失败后通过。修正后 `20261019-173421-918ea4` 定向运行 1/1 PASS。分类修正为 `AUTOMATION_DEFECT`，不是游戏缺陷。
- `time-save` 首次失败来自固定数组索引 `[2]` 缺失；改成 `[1]` 后，复测显示权威游戏循环可能已推进当前 dayIndex 至 3，而第二条持久结算记录仍对应第二工作日 dayIndex 2。最终场景改为比较该历史记录与 `workdayTwo.dayIndex`，不推断游戏时钟额外跨日规则。新增回归测试先失败后通过；新包 `20261019-173645-5056c9` 定向运行 1/1 PASS。
- 更新后的完整 Runner 单测 `node --test tests/gameplay-agent/runner.test.cjs`：48/48 PASS。`npm test` 在续验中完成了所有测试输出，包含 Runner 48/48，未显示失败项；该会话没保留 npm wrapper 退出码，故顶层退出码 `NOT_CAPTURED`。本轮未重复执行完整 `npm test`/`release:check`，因为相同测试集合的全量运行已刚结束；修改后做了新鲜 Runner 单测和两个真实 EXE 定向场景。
- 由于卡牌建角阻断仍存在，未执行完整 Gate；Gate 会重建/打包并重新运行全场景及长 soak，当前已知会失败。定向修复不改变全量 24 场景运行的原始统计。八宗门逐链、四职业效果矩阵、指定 30/100 日模拟未完成，物理输入 `UI_REAL_EXE=NOT_VERIFIED`。

N.1/N.2 仍为 `IN_PROGRESS / BLOCKED`。未提交、未推送、未合并；原工作区和正式存档未触碰。

## Git 状态

- 未进行 N.2 最终提交；当前改动均保留在工作树，等待阻断项解决及完整 Gate。
- 未推送、未强推、未合并；未删除报告、工作树或玩家存档。
- 最终 SHA 仍为 `b6572122738132922106edfbb3e7b94054717d56`。

只有启动稳定、再就业闭环、八宗门/四职业完整验收、完整 Gate、20 分钟 soak、指定 30/100 日模拟和重启恢复都取得新鲜证据，并完成报告/本地提交后，才能改为 COMPLETE。
