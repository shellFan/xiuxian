# V5.9-N.8 最终可玩版验收记录

状态：**IN_PROGRESS / BLOCKED（当前 GUI 验收受原工作区运行中的 Electron 进程影响）**
记录时间：2026-10-23（Asia/Shanghai）

## 基线与保留情况

- 工作树：`C:\Users\Fan\.codex\worktrees\v59l-card-battle\xiuxian`
- 分支：`feature/v59n-career-life-growth`
- 起始 HEAD：`d6014ed8eee243dd51953b94bed08d5e633908ff`
- 本轮未提交、未推送；保留已有代码改动和全部 GamePlay Agent 历史报告。
- `D:\git\fan\xiuxian` 不在本轮改动范围。检查时发现 4 个 Electron 进程从该原工作区的 Electron 可执行文件运行；未关闭、未控制这些进程。

## 本轮修复与验证

1. `sect-career-interview` 的报告截图显示，关键消息弹窗关闭后 UI 已回到主页战斗面板，而场景仍直接查找面试按钮。场景现经可见的“晋升”导航和“招聘职位”入口重新打开招聘页，并等待真实 `RISK` 面试控件出现后才点击。增加了路由回归测试；在修改场景前该测试按预期失败，修改后通过。
2. `time-save` 运行证据中的结算历史为 dayIndex 1、2、3、4；第二个受测工作日权威 dayIndex 为 4，旧断言却比较数组 `[2]`（dayIndex 3）。场景现比较最新的 `[3]` 记录，并同步更新 M 版场景契约测试。回归测试在恢复旧索引 `[2]` 时按预期失败。
3. `node --test tests/gameplay-agent/runner.test.cjs`：**92/92 PASS**。
4. `npm test`：**PASS，退出码 0**。第一次完整运行暴露了 M 版测试仍期待旧索引；修正后完整重跑通过，包括 L 卡牌引擎、L/M 集成与 Runner 场景契约测试。

## 最新完整 GamePlay Agent Gate（历史结果，不代表本轮修复已复测）

报告：`ai/gameplay-agent/reports/20261022-114803-99647e/`
EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
ASAR SHA-256：`b2a6383381467e61a22129d2e74124e1e262ddb14a9c9518b35a62690440038d`
Build SHA：`2a2fd10145bb1aa032a29a59456efdaa6b4de208ea0b4702ba1a17dba5c5b103`

- 26 个场景：18 PASS、4 FAIL、4 NOT_VERIFIED；总 Gate 为 **FAILED**。
- `home-arena-soak` 历史结果：20 分 26 秒 PASS；19/19 截图成功，0 截图超时、0 CDP 命令超时。它不替代本轮源码状态下的最终 soak。
- `startup-stability` 历史场景报告通过十次串行启动；本轮没有重跑。
- `UI_REAL_EXE=NOT_VERIFIED`：输入为 CDP 合成事件，没有物理 Windows 鼠标/键盘证据。
- `ELECTRON_E2E=FAILED`：上述 Gate 中仍有启动或场景失败；`SERVICE_SIM` 的基础单元及回归由本轮 `npm test` 覆盖，但 N.8 指定的独立画像模拟尚未完成。

### 已知剩余缺陷

- `card-battle-first-win` 启动窗口出现，但 `GameFacade` 未在 35 秒内 ready。原始 `exe.log` 显示 `internal` bundle 118ms 完成，`resources`/`main` bundle 随后成功完成，资源请求队列归零且无加载错误；Cocos `game.init()`、`game.run()`、首帧也完成。超时快照仍为 `shouldLoadLaunchScene=true`、`sceneName=null`、`facadeRegistered=false`，且没有 `COCOS_LAUNCH_SCENE_REQUESTED`。构建设置指定 `db://assets/scenes/Main.scene`，main bundle 配置也包含该场景。证据把阻断边界缩到“首帧之后未发起启动场景切换”，但真正原因仍未确认，不能标成修复。
- `career-layoff-reemployment` 的真实周末安排弹窗覆盖返回控件；最新报告记录 Runner 未能选中场景声明的可见选项。虽然有截图和交互诊断，修复后尚未以 EXE 复测。
- Fate 卡牌场景仍有因弹窗/卡牌点击路径导致的 AUTOMATION_DEFECT 或 NOT_VERIFIED；需要后续逐场景复测，不能按 PASS 处理。
- `sect-career-interview` 和 `time-save` 已修正自动化场景/测试预期，但还没有新 EXE/Cocos GUI 场景证据，因此仍待复测。

## 本轮中止的 GUI 尝试

本轮曾启动 `npm run gameplay-agent:test`。该脚本实际进入卡牌及职业场景，并继续到了 `home-arena-soak`，并非只运行单元测试。观察到原工作区的 4 个 Electron 进程仍运行后，中止了本轮自己启动的 Runner；没有关闭或操作那些原工作区进程。该尝试没有完整报告，不计任何场景 PASS，也不作为 Gate 结果。

## 交付状态

| 项目 | 状态 | 依据 |
|---|---|---|
| `npm test` | PASS | 本轮完整重跑，退出码 0 |
| GamePlay Agent Runner 单测 | PASS | 92/92 |
| 最新完整 Gate | FAILED（历史） | 18/26 PASS、4 FAIL、4 NOT_VERIFIED；修复未复测 |
| 新 EXE 构建与 `pc:check` | NOT_RUN | 本轮未重建；产品 TS 未改，但交付验收要求仍未满足 |
| `UI_REAL_EXE` | NOT_VERIFIED | 无物理 Windows 输入证据 |
| 20 分钟最终版本 soak | NOT_VERIFIED | 仅有此前 Gate 的历史 PASS |
| 指定 30 日岗位画像模拟 | NOT_RUN | 本轮 `npm test` 中的常规平衡模拟不等同于 N.8 指定画像验收 |
| 指定 100 日模拟 | NOT_RUN | 没有有效本轮证据 |
| Creator 退出码 36 根因调查 | NOT_VERIFIED | 尚未取得可确认根因的编辑器日志与构建阶段证据 |
| 最终 N.8 Gate | BLOCKED | 等待无冲突的隔离 EXE/UI 验收窗口 |

本轮在 2026-10-22 打包的文件仍可读取：EXE 为 176,819,200 字节、ASAR 为 16,507,068 字节，时间分别为 2026-10-22 17:34:43 与 17:34:42（+08:00）；现场重新计算的哈希与上述历史 Gate 报告一致。该哈希仅标识现存旧包，不代表本轮场景修复已包含于 EXE。

## 下一步

待原工作区 Electron 进程不再占用测试环境后，先串行复测 `sect-career-interview`、`time-save` 和裁员场景，再调查 `card-battle-first-win` 的启动资源队列；修复后重建并核验 EXE/ASAR 哈希，再完成完整 Gate、20 分钟真实墙钟 soak、指定 30/100 日模拟与最终报告。所有未取得有效证据的项目继续保持 NOT_VERIFIED / NOT_RUN。

## 2026-10-23 续验：裁员场景周末弹窗恢复

- 分类：**AUTOMATION_DEFECT**。失败截图 `career-layoff-reemployment/evidence/screenshots/015-failure-step-106.png` 显示真实“周末安排”弹窗遮挡返回控件；旧步骤只在导航点击内部依赖通用弹窗恢复，没有一个先关闭该弹窗并确认关闭的独立动作。
- 修复：场景现在先点击真实可见的 `.ux-modal-layer .ux-event-option[data-weekend='SECLUDED_CULTIVATE']`，最多 3 次、等待最多 5 秒；Runner 逐次检查控件，点击后轮询并断言目标控件消失。若仍可见即报错，后续职业页面导航不会执行。没有改 CSS、隐藏弹窗或注入游戏状态。
- 回归：新增“显式关闭周末安排后才能点击被遮挡返回控件”契约测试；先观察到测试因缺少独立动作而失败，修改场景后通过。更新了同一场景既有步骤顺序断言。`node --test tests/gameplay-agent/runner.test.cjs`：**93/93 PASS**。
- 本轮未启动 Runner/EXE 或 Gate；当前检查到的 Electron 进程来自 `D:\git\fan\xiuxian` 原工作区，未触碰。该修复仍未在 EXE 中复测：`career-layoff-reemployment=NOT_VERIFIED`，不得据此宣称 Electron UI 场景通过。完整 Gate、EXE 哈希、物理 GUI、soak 和指定画像模拟状态维持本报告前述记录。
