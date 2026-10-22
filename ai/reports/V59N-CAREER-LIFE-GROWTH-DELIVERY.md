# V5.9-N 职场人生 2.0 交付状态

**状态：IN_PROGRESS。** 当前交付的是 N 版职场系统基础阶段；尚未满足全部 N 验收，不应作为正式完成版本发布。

## 基线与范围

- 仓库基线：`64f665394dc352466b1c93fcc91859160d17b497`
- 分支：`feature/v59n-career-life-growth`
- N 基础阶段本地提交：`2ccc768` (`feat: add career life growth foundation`)；本轮不推送、不合并。
- 先核对了 [`V59M-SECT-WORKLIFE-ECONOMY-DELIVERY.md`](./V59M-SECT-WORKLIFE-ECONOMY-DELIVERY.md) 和 `566c7e5` 变更。M 报告记载八大宗门、工资调制、项目、加班审批、生活活动、日结和跳槽集成；本轮 Gate 中相关经济、项目、加班和角色创建场景通过。完整 Gate 的面试场景最初被建角前置步骤阻断，修正状态断言后定向重测通过。
- 未接触原工作区 `D:\git\fan\xiuxian` 或正式玩家存档。所有 EXE 场景使用 GamePlay Agent 隔离测试档案。

## 已集成的 N 基础功能

- 新增 `CareerLifeService`，复用现有职级晋升、宗门合同、NPC 记忆、职业经验、Fate、事件标记与存档状态；没有另建工资、关系或时间系统。
- 晋升条件按宗门补充业务要求；晋升答辩复用既有三题面试。晋升与目标奖励带持久化幂等凭据。
- NPC 互动每日限次；关系面板从既有好感与记忆推导信任、专业认可、冲突和最近记忆。
- 主动离职和待业状态已接入；待业固定工资和离线工资为零、不能申请计薪加班；重新求职复用 M 版岗位申请和面试，新合同次日生效并保留履历。
- 加入 24 个职场危机 Fate 事件并复用原事件调度。事件需要在职，待业时不会产生或弹出；原有待处理事件保留。
- 增加职业目标和技能面板展示，接入现有职业经验/等级；提供职场人生面板、NPC 关系互动和离职审核 UI。

## 验证记录

- `npm run gameplay-agent:gate`：`release:check`、`pc:build`、`pc:pack`、`pc:check` 均退出码 0。`release:check` 的 43 个 GamePlay Agent Runner 单元测试通过；完整 Node 测试套件通过。
- Electron GamePlay Gate：22/23 场景通过，0 个 `failed`，1 个 `SETUP_BLOCKED`，因此总体状态是 **BLOCKED**。唯一阻塞是 `sect-career-interview` 的新玩家建角流程：普通点击命格后未核验 `selectedCandidateId`，随后步骤才发现仍停在 `DESTINY`。
- 修正 `_new-player.json`：命格选择改为等待权威 `draft.selectedCandidateId === "A"`。定向命令 `npm run gameplay-agent:sect-career` 随后通过 1/1。完整 Gate 尚未在此场景定义修订后重跑。
- N 专项服务测试：9/9 通过；包含 100 游戏日循环，两次离职/再就业、NPC 每日互动及待业工资抑制。该模拟使用 FakeClock，不计入真实墙钟 soak。
- 独立 `home-arena-soak`：20.0016 分钟、2,989 次有效输入、5 个关卡通过；heap 采样约 23.25–24.54 MiB，DOM 采样大多数约 774–808，有一次 1,561 的瞬时峰值后恢复。完整 Gate 又执行了一次 soak，也通过。
- `career-life-growth` UI 场景通过 1/1；验证常规角色创建、职场面板、离职审核入口、NPC 页面可见交互和权威关系变化。其余 N 专项流程还没有完整 UI 覆盖。
- EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- 最终打包 ASAR SHA-256：`fd7e2e2d0f05903790837ca5e4ffd65faddf6c6a442f8370f085b8026d2a6bda`
- Build SHA-256：`17358f844889c22f20ad637b79e581964f22ece9e58ca17a08ed477033fb0129`
- `ELECTRON_E2E`：22/23 Gate 通过；修订场景定向复测通过。`SERVICE_SIM`：Gate 的 `release:check` 通过。`UI_REAL_EXE`：**NOT_VERIFIED**，输入为 CDP 合成事件，不是物理 Windows 鼠标/键盘验收。

## 未完成项与风险

- 10 个 N 场景中目前只有 `career-life-growth`；`career-promotion-success`、`career-promotion-failure`、`npc-relationship-growth`、`workplace-conflict`、`outsourcing-to-client`、`voluntary-resignation`、`unemployment-survival`、`job-search-success`、`long-term-goal`、`career-skill-upgrade` 的专项流程未齐。
- 裁员尚无完整的前兆、玩家补救选择、裁员结算和求职闭环；当前仅有服务层 `LAID_OFF` 离职原因入口。
- 八大宗门各自有因果起承转合的短事件链尚未实现；现有 24 个危机事件不等于 8 条宗门事件链。
- 四职业各至少四个会影响任务/卡牌/面试的成长方向尚未完整实现；当前主要复用已有职业经验与专精能力。
- 尚未为 N 运行最终完整 Gate；上一轮 Gate 因前置断言缺失为 `BLOCKED`。修订后的定向复测通过，但完整快照仍需重跑。
- 没有完成物理 Windows 输入验收，UI_REAL_EXE 仍为 NOT_VERIFIED。

## 缺陷等级

- **BLOCKER：** 无已确认的构建或单元测试失败；完整 Gate 仍有一个前置阻塞记录。
- **HIGH：** 裁员闭环、宗门事件链、职业技能树、9 个专项场景及最终完整 Gate 未完成。
- **MEDIUM：** 物理 Windows UI 输入未验证；修订后的完整 Gate 待重跑。
- **LOW：** 无新增结论。

## V5.9-N.1 续作检查点（2026-10-19）

- 续作分支：`feature/v59n-career-life-growth`；起始 HEAD：`5797e4fa6b30d208fdc21f3a743db78dfe1cd6ff`。原始工作区未触碰。
- 续作期间保留已有 tracked 改动和全部 untracked GamePlay 历史报告；没有 stash、reset、restore、clean 或推送。已对本阶段验证过的代码与记录作安全本地提交 `56dd11e`，不是 N.1 最终验收提交。
- 本轮实现续作在工作树中的代码包含裁员预警/四种应对/保岗或离职结算、补偿幂等、失业后关闭旧项目和合同、共享 Fate 的八宗门五阶段剧情链、四职业有限成长效果、裁员 UI 场景。代码的详细验收仍以完整 Gate 和后续专题场景为准。
- `npm test`：**PASS**，退出码 0。编译与完整测试套件结束；输出包括 N 专项裁员、职业成长、宗门因果链及 GamePlay Agent Runner 合约测试。当前总测试文件/测试数未由脚本汇总，故不推断精确计数。
- `npm run pc:build`：**PASS（产物已生成）**；Cocos Creator 子进程报告退出码 36，但仓库脚本基于新鲜构建产物完成校验并返回 0。该非零子进程退出码保留为构建风险，不能单独视为完整打包验证。
- `npm run pc:pack`：**PASS**；`npm run pc:check`：**PASS**，构建清单与 overlay 哈希匹配。
- 当前构建标识：`af95e5d1f7a3153c9980f60901425778fe9f03efec425e37f4f398cf368d5d06`；EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`；ASAR SHA-256：`9d5e294842a6a753c3dcded77a1654c2a77fcff8f8299083e761a8183733830b`。
- 新增场景 `career-layoff-reemployment` 于 Gate 场景清单校验中被验证为结构有效，但当前 EXE 执行 **FAIL / NOT_VERIFIED**：运行 `20261019-071132-5cef23` 在 35 秒启动时限内未得到 `GameFacade`。紧接着 `npm run gameplay-agent:smoke` 的运行 `20261019-071413-51d972` 也遇到同类启动失败。截图与日志显示 Electron 窗口停在“正在唤醒游戏数据”；未进入场景操作。不得归类为裁员游戏逻辑失败。
- 诊断：以上复测没有输出 renderer 控制台异常；一次快照显示 Cocos 引擎初始化、一次快照显示引擎初始化尚未完成。当前根因未确认，归类为 **NOT_VERIFIED / 启动阻断**。此前历史 Gate `20261019-054908-564e35` 亦为 2/23 场景通过、19 失败、2 阻断；其大多数失败同属启动未就绪。
- `UI_REAL_EXE=NOT_VERIFIED`（CDP 合成输入不等于物理 Windows 输入）；当前 `ELECTRON_E2E=FAIL`；`SERVICE_SIM=PASS`（仅适用于本轮全量单元/集成测试，未覆盖要求中的分支矩阵模拟）。
- 本检查点没有执行最终完整 Gate、至少 20 分钟最终版本 soak、30/100 游戏日的四种指定模拟或完整新玩家职业闭环；已有的 `56dd11e` 仅为阶段性提交。N.1 仍为 **IN_PROGRESS**。

## 后续顺序

1. 补齐或修复裁员因果闭环并增加回归测试。
2. 完成八大宗门各一条可玩的短事件链和四职业成长效果。
3. 完成其余 9 个专项 GamePlay 场景及晋升、NPC、失业、求职 UI 路径。
4. 再执行完整 Gate 与验证后更新本报告和提交 SHA。

## V5.9-N.4 续验（2026-10-21）

本节的最新补记见下方 10-21 定向复测：首轮 Gate 为 24/25，第二轮完整 Gate 实际为 23/25，失败项为 `card-battle-random-event` 与 `career-life-growth`；二者之后分别通过定向复测。最近一次完整 Gate 退出码仍为 1，不能将其记为 PASS。

`npm test` 与 Gate 内 `release:check` 均退出码 0；fresh EXE smoke 1/1 PASS；20 分 26 秒 Electron/CDP soak 通过。首轮包指纹及 Creator 退出码风险见 [V59N4 验收报告](V59N4-GAMEPLAY-STABILITY-FINAL.md)。指定 30/100 日四画像矩阵、八宗门逐链 UI、四职业成长 UI 矩阵和物理输入仍 `NOT_VERIFIED`，N.1/N.2/N.4 状态保持 `IN_PROGRESS`。

### 2026-10-21 定向复测补记

第二次完整 Gate `20261020-195254-d7de45` 为 23/25。`card-battle-random-event` 在 `20261020-203453-a961c6` 通过 1/1：游戏 Fate 结果弹窗由场景使用其可见确认按钮关闭，分类为 `AUTOMATION_DEFECT`。`career-life-growth` 在 `20261020-203529-f42b64` 通过 1/1：触发后权威 run 为 `ACTIVE` 且队列含 `sect_outsourcing_s1`；原失败没有该快照，故原根因保留 `NOT_VERIFIED`，不认定为游戏缺陷。最新两个定向报告的 EXE SHA 为 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`、ASAR SHA 为 `215afc96b1700773abb2afe780efe44350b9baad4d8bceccb2330c72d01c8073`。25 场景都有过 PASS 记录，但最新完整 Gate 仍 FAIL；整体验收仍 `IN_PROGRESS`。

## V5.9-N.5 续验状态更新（2026-10-21）

最新完整 Gate `20261021-051131-90aab0` 为 17/25；Smoke `20261021-054658-da3abb` 为 1/1 PASS。一次新鲜 EXE 启动诊断观察到 Cocos `internal` 资源 `loadAny` 用时约 33 秒并超过 30 秒 Electron watchdog，另一次启动正常，属间歇性 readiness 阻断。再就业可见录用流程已确认权威合同，但重启失败；四组 N.5 玩家画像、最新完整 Gate、启动资源延时根因和 Creator 36 根因均未完成。N 继续为 `IN_PROGRESS`，完整证据见 [V59N5-FINAL-PLAYABLE-ACCEPTANCE.md](V59N5-FINAL-PLAYABLE-ACCEPTANCE.md)。
