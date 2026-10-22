# V5.9-M 宗门与职场经济交付状态

**状态：核心功能已集成；自动化回归通过；物理 Windows 输入验收未验证。** 本文不宣称 UI_REAL_EXE 已通过。

## 基线与工作树

- 基线提交：`566c7e5ae4db14389c2a83b8fc827855fbb31759`（`feature/v59m-sect-worklife-economy`）。
- 本轮未提交更改继续保留在工作树。仓库 `AGENTS.md` 默认 `AI_AUTO_COMMIT=false`，因此本轮未创建提交、未推送。
- 未触碰 `D:\git\fan\xiuxian` 原工作区或正式玩家存档；测试使用 GamePlay Agent 隔离临时档案。

## 已交付核心功能

- 八个职场宗门可从真实角色创建 UI 选择，宗门倍率进入现有权威工资/工作服务；自由宗门固定工资为零，通过项目合同结算收入。
- 加班申请按宗门与职业配置任务，外包宗门等待客户审批；审批结果进入存档，批准才可开展计薪加班，拒绝不会发加班收入，结算使用幂等凭据。
- 下班生活菜单提供 12 种真实活动，走现有钱包/消费服务，记录费用、时间、健康、心情、道心与每日次数，并把活动结果纳入次日状态。
- 每日结算生成工资单，汇总基础工资、任务/绩效、加班和特殊收入，并展示生活支出与净现金变化；旧工作收入和新结算通过既有权威流水衔接，测试覆盖重复结算保护。
- 宗门招聘与跳槽支持条件、面试、成功/失败、冷却、履历和次工作日合同生效；自由宗门可转入转出。没有添加玩家自创宗门或创业系统。
- 每日项目合同受宗门与职业影响，改变工作内容、卡牌战斗、耗时、绩效与项目收入；失败战斗消耗时间并影响绩效，但不支付项目报酬。
- 16 个宗门专属 Fate 事件（每宗门至少 2 个），通过既有事件调度器配置；选择会改变权威游戏状态。
- 以上玩法均从正常 Electron UI 流程进入；M 场景覆盖建角选宗门、加班审批、项目合同、求职面试、经济/生活和时间/工资存档。

## 验收记录

### 单元与服务测试

- `npm test`：退出码 0，执行 **165 个测试文件**；包含所有已有测试及 V5.9-M 测试。
- GamePlay Agent Runner：**43 项测试通过**。新增回归用例覆盖共享建角对宗门/出身选项的权威状态等待，以及缺失草稿字段与显式 `null` 的匹配规则。
- V5.9-M 领域测试覆盖八宗门、外包审批通过/拒绝及幂等、生活消费和余额、状态变化/次日继承、工资单去重、跳槽成败和次日生效、自由宗门合同收入、宗门事件与存档迁移。
- `SERVICE_SIM_PASS`：通过上述服务/模拟测试。此结果表示服务层测试通过，不替代物理 GUI 输入验收。

### Electron UI 自动试玩

- 最新完整 Gate：[`20261018-205655-9a8930/summary.md`](../gameplay-agent/reports/20261018-205655-9a8930/summary.md)，曾有 **20/22** 场景通过、2 项建角前置阻断；20 分钟真实墙钟混合试玩通过，约 2,836 次交互，JS heap 约 24 MiB。
- 阻断定位为共享建角场景在选择宗门/出身后立即读取状态，偶发早于权威草稿更新；Fate 阻断还依赖 `.is-selected` 样式作为完成信号。没有发现对应游戏逻辑缺陷。
- Runner 已改为最多三次可见 UI 点击，并轮询 `queryCharacterCreation()` 的权威草稿字段。旧缺陷后的定向 Electron 复测：[`20261018-214320-8d0231/summary.md`](../gameplay-agent/reports/20261018-214320-8d0231/summary.md)，角色创建和 Fate 首次选择/重启恢复 **2/2 通过**；完整步骤、截图、回放和权威快照保存在该报告目录。
- M 专项场景（宗门建角、审批、项目合同、面试、经济与工资/时间存档）在完整 Gate 中通过。完整 Gate 加上两个阻断场景的定向复测，覆盖结果为 **22/22 场景已通过**。本轮未重复启动包含 20 分钟 soak 的整套 Gate。
- `ELECTRON_E2E_PASS`：CDP 合成指针/键盘事件驱动可见 Electron EXE 的场景通过。它不等同于 Windows 物理设备输入。
- `UI_REAL_EXE_NOT_VERIFIED`：没有用物理鼠标和键盘验收。截图来自 renderer surface。

### 构建物证据

定向复测使用已打包 Electron EXE；本次改动仅涉及 GamePlay Agent runner、场景和测试，没有改动游戏业务代码，因此未重建产品 EXE。

- EXE：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
- EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR SHA-256：`66e58457fbd4c461e841cee69745bbd17084b5d0ff30c1d6748ddfd906cc11bf`
- Build SHA：`bef01f57c5013d4a49a89707f3d1b4c5620ff4d1ba12e3ad26ac041adb674421`
- 定向场景耗时：`character-creation` 23.0 秒；`fate-first-choice` 33.6 秒。

## 遗留验收与风险

- 必须由有物理 Windows 输入能力的操作完成 `UI_REAL_EXE` 验收，重点确认创建、审批、下班生活、日结及求职流程的真实指针/键盘交互。
- 完整 Gate 的原始总报告保留为 `BLOCKED` 历史记录；后续两项定向复测均通过。由于只改动自动化等待和 JSON 场景，本轮没有再次运行完整 20 分钟 Gate。
- 本报告记录的是 V5.9-M 核心玩法和自动化证据，不宣称所有平台分辨率/设备、上线审批或 L 版物理 UI 验收已经通过。

## 缺陷等级

- BLOCKER：当前自动化回归无阻断；物理 UI 验收仍为未验证项。
- HIGH：无已确认的 M 核心服务/UI 逻辑缺陷。
- MEDIUM：补做物理 Windows 输入验收；后续完整 Gate 可再执行一次作为单次全量快照。
- LOW：无。

## 2026-10-21 N.4 续验更新

- 当前包含 L/M 的开发分支为 `feature/v59n-career-life-growth`，起始 HEAD `9932a7af71d2c4e5b9de3af22567bf7bdf790059`；L、M 的历史提交及 `feature/v59m-sect-worklife-economy` 分支均已核实存在。当前 N.4 工作树有大量未提交代码与历史 GamePlay 证据，均予以保留。
- 本轮 `npm test` 完成；V59M 服务/模拟测试通过，GamePlay Runner 最后一个 TAP 组为 72/72。`release:check` 与 `npm test` 在当前 `package.json` 指向同一编译和测试命令，未重复执行。
- 当前最新完整 Gate `20261020-195254-d7de45` 为 23/25，退出码 1。两个失败场景已分别定向通过：`card-battle-random-event`（`20261020-203453-a961c6`）与 `career-life-growth`（`20261020-203529-f42b64`）。这不把单次完整 Gate 改记为通过。二者复测使用 EXE SHA-256 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`、ASAR SHA-256 `215afc96b1700773abb2afe780efe44350b9baad4d8bceccb2330c72d01c8073`；输入为 CDP 合成事件，故 `UI_REAL_EXE=NOT_VERIFIED`。
- L 版验收细节见 [V59L-FINAL-ACCEPTANCE.md](V59L-FINAL-ACCEPTANCE.md) 与 [V59L-CARD-BATTLE-DELIVERY.md](V59L-CARD-BATTLE-DELIVERY.md)。M/N 指定 30/100 日玩家画像矩阵、八宗门逐链 UI、四职业成长 UI 矩阵和 Creator 子进程退出码 36 根因仍未完成；总体保持 `IN_PROGRESS`。
- 未提交或推送：当前仓库 `AGENTS.md` 明确禁止自动提交/推送，且工作树存在未提交变更。

## V5.9-N.5 续验状态更新（2026-10-21）

本轮完整 `npm test` 退出码 0，M 工资、加班、生活与职业回归继续通过。UI Gate 最新快照 `20261021-051131-90aab0` 只有 17/25 PASS；裁员再就业定向流程可见接受录用后权威合同为 `INTERNAL`、次日生效，但重启阶段被启动 readiness 阻断。指定四画像矩阵尚未完成，M/N 总体验收仍 `IN_PROGRESS`。详见 [V59N5-FINAL-PLAYABLE-ACCEPTANCE.md](V59N5-FINAL-PLAYABLE-ACCEPTANCE.md)。
