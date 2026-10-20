# V5.9-N.1 最终验收记录

**验收状态：IN_PROGRESS（未达到最终完成标准）**

**检查点时间：2026-10-19 Asia/Shanghai（更新：N.2 启动恢复与再就业排查）**

## 基线

- 起始 HEAD：`5797e4fa6b30d208fdc21f3a743db78dfe1cd6ff`
- 分支：`feature/v59n-career-life-growth`
- 原始工作区 `D:\git\fan\xiuxian` 未触碰；本轮未推送或合并。

## 本检查点实际执行

| 项目 | 结果 | 证据 |
|---|---|---|
| 单元/集成测试 | PASS | 本轮 `npm test` 退出码 0；其中 GamePlay Runner 单测 48/48 通过。该结果不代表 EXE 场景通过 |
| Cocos Web Desktop 构建 | PASS（产物校验成功，风险开放） | 本轮 `npm run pc:build` 子进程退出 36；日志显示完整构建 success 与新鲜产物校验，脚本输出 `PROJECT_WARNING` 后返回 0；退出码来源仍未解释 |
| Electron 打包 | PASS | 本轮 `npm run pc:pack`，更新 Windows x64 EXE 与 ASAR |
| 包构建检查 | PASS | 本轮 `npm run pc:check`，manifest FRESH、overlay SHA 匹配 |
| 裁员到再就业 UI 场景 | SETUP_BLOCKED | 修复失业 UI 绕过面试的问题后，新包已通过申请确认并呈现面试选项；fresh-player 面试得分仅 17，低于最低门槛 50，未完成录用/次日工资。详见 N.2 报告 |
| 最小 smoke | ELECTRON_E2E_PASS；UI_REAL_EXE=NOT_VERIFIED | 新包 smoke `20261019-132230-51c174` 1/1 PASS；Facade ready。输入为 CDP 合成事件 |
| 全量 GamePlay EXE 场景 | FAIL | `20261019-134430-6ea032` 实跑 24/24 场景：15 PASS、6 FAIL、3 SETUP_BLOCKED；无跳过。详见 N.2 报告 |
| 项目合同战斗定向复测 | PASS | `20261019-142911-e55e70`：1/1；证明新合同可经 UI 进入 `ACTIVE` 与 `PLAYER_ACTION`，处理关键传书后返回项目页恢复战斗。其余 23 个全量场景未复跑 |
| 职业生活与宗门 Fate 定向复测 | PASS | `20261019-144930-ece66a`：1/1；正常 UI 处理消息中断，返回主页查看共享 Fate 事件并完成链首选项。其余 23 个全量场景未复跑 |
| 外包加班审批与重启恢复定向复测 | ELECTRON_E2E_PASS；UI_REAL_EXE=NOT_VERIFIED | `20261019-153010-6e3678`：89/89 步、31.6 秒；新玩家八步建角、通过主页投影初始化次日工作日、权威倒计时 299,992ms/299,201ms、外包审批 APPROVED、重启后记录一致 |
| 最终完整 GamePlay Gate 命令 | NOT_RUN / BLOCKED | 全量 EXE 场景已失败，因此未再启动会重复构建、打包和 20 分钟场景的 Gate 命令；不得报告 Gate 通过 |
| 新版本真实墙钟 20 分钟 soak | ELECTRON_E2E_PASS | 全量场景中的 `home-arena-soak` 实际运行约 20 分钟，约 2,834 次有效点击，JS heap 约 24 MiB；证据见 `20261019-134430-6ea032`。物理 UI 仍未验证 |
| 30/100 日指定分支模拟 | NOT_VERIFIED | 全量 `npm test` 中已有 100 日就业循环测试，但不覆盖所要求的四种模拟矩阵 |
| 物理 Windows 鼠标/键盘 | NOT_VERIFIED | 自动化使用 CDP 合成输入 |
| 阶段 Git 提交 | PASS | `56dd11e` (`feat: add N.1 layoff and career growth foundation`)；保存本阶段经单测/构建验证的工作，不等同于 N.1 最终验收提交 |

## EXE 与 ASAR

- 构建输入 SHA-256：`af95e5d1f7a3153c9980f60901425778fe9f03efec425e37f4f398cf368d5d06`
- 最新 EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- 最新 ASAR SHA-256：`b0e48cd48002db9f231e4720b639cf4327562b812407f37913417153de71cd83`
- 最新 Build SHA-256：`aec678014196a9e9bbc7ddc85d4950d38dacd00cf7784a5926d95956c7345f2d`
- GamePlay 证据目录：`ai/gameplay-agent/reports/20261019-071132-5cef23/`、`ai/gameplay-agent/reports/20261019-071413-51d972/`

## 当前阻断与未验收范围

- 历史新包曾停在“正在唤醒游戏数据”。当前打包 EXE 的两次 smoke 均到达 `GameFacade.ready`，但原始间歇性故障的底层触发条件仍未证实，故根因 `NOT_VERIFIED`。
- 裁员 UI 入口已证明存在失业时直接 `changeSect` 绕过招聘的缺陷，并已修复；新包已实际执行申请确认和面试点击。由于初始面试资历不足，面试被拒的页面状态符合业务门槛，后续成功再入职仍为 `SETUP_BLOCKED`，不得声称闭环通过。
- 八大宗门五阶段 Fate 链与四职业成长效果已有实现和服务测试，但仍需最终 Gate 与玩家可见流程证据。
- 当前注册场景总数为 24（清单见 `ai/reports/V59N2-STARTUP-RECOVERY-ACCEPTANCE.md`）；总数不代表 Gate 已实际运行。宗门链逐宗门确定性 UI 覆盖仍未完成。
- 当前没有通过的最终 Gate、指定游戏日模拟矩阵、物理 UI 试玩、最终 SHA/提交；因此无权将 N.1 标记为 `COMPLETE`。20 分钟 Electron/CDP soak 已有运行证据，但不能替代物理 UI 测试。
- 额外定位并修复 GamePlay 场景前置错误：新玩家建角方向选择使用最多三次的权威状态轮询，避免点击后立即读取的时序竞态；加班场景在读只读工作服务前先经过主页工作投影建立当天 GameDay。新 EXE 定向运行通过，但完整 Gate 与其他未通过场景状态保持原样。

## Git 与变更安全

- 保留此前工作树全部修改和未跟踪的 GamePlay 历史报告；未触碰正式玩家存档。
- 未运行 `git clean`、`git reset`、`git restore` 或强制推送。
- 阶段 HEAD：`56dd11e`；尚无满足所有最终验收条件的 N.1 完成提交。

本文件是持续更新的验收记录。只有 N.1 指令中全部最终完成条件都取得新鲜证据后，才可将状态改为 `COMPLETE`。

## 2026-10-20 续验补记

本补记更新 2026-10-19 之后的最新定向证据，不覆盖此前失败的 24 场景全量基线：

| 项目 | 最新状态 | 证据 |
|---|---|---|
| 新包 smoke / `GameFacade.ready` | `ELECTRON_E2E_PASS`；`UI_REAL_EXE=NOT_VERIFIED` | `ai/gameplay-agent/reports/20261019-163406-5f888b/`，1/1；两次重启均到达 `GAME_FACADE_READY`，最新等待约 4,559 ms |
| 裁员再就业 UI 闭环 | `ELECTRON_E2E_PASS`；`UI_REAL_EXE=NOT_VERIFIED` | `ai/gameplay-agent/reports/20261019-163304-9af207/`，1/1，35,041 ms；完成补偿、失业、招聘申请/面试、重新入职、次日工资及重启恢复。此结果取代早先因面试资历不足记录的 `SETUP_BLOCKED` |
| 新 EXE / ASAR / Build SHA-256 | 有证据 | EXE `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`；ASAR `2d3ba7d1ba5c3c5715739d60c69deda9978145f16544229539366f2441dc88b6`；Build `be9e01961a4f597e78bf25e38bcf69432d0dc29649120053869d66da450359b2` |
| 本次完整 `npm test` | 套件输出无失败，Runner 48/48；顶层退出码未能从已结束的终端会话取回 | 2026-10-20 续验；不把未捕获的进程退出码记作严格 PASS |
| 完整 GamePlay Agent Gate | `NOT_RUN / BLOCKED` | 上次全量基线为 15 PASS / 6 FAIL / 3 BLOCKED；此后仅 smoke 与裁员场景定向通过，不能推导为全量通过 |
| 30/100 日指定模拟矩阵 | `NOT_VERIFIED` | 本轮测试中的已有平衡模拟（30/60 日画像）不等价于要求的四类指定矩阵 |
| 物理 Windows 输入 | `UI_REAL_EXE=NOT_VERIFIED` | 自动化使用 CDP 合成输入 |

本次只核实与记录既有新包证据和运行测试，没有修改游戏运行时代码。Cocos Creator 子进程退出码 36 的来源、历史“正在唤醒游戏数据”超时根因仍未查明；八宗门全链与四职业完整效果矩阵、全量 Gate、指定日数模拟及新版本 20 分钟 soak 均未完成。因此 N.1 继续为 `IN_PROGRESS`，不可标记 `COMPLETE`。

## 2026-10-20 新包全量场景续验

| 项目 | 状态 | 证据 |
|---|---|---|
| Cocos `pc:build` | 产物新鲜；Creator 退出码 36，根因未解释 | 2026-10-20 构建日志：Cocos Creator 3.8.4，`build success in 37796`，构建阶段报告成功，随后报告进程返回 36；包装器因新鲜产物完整而输出警告并接受。日志出现自动刷新提示，无 Creator 错误栈或退出码语义说明 |
| `pc:pack` / `pc:check` | PASS | 本次构建后重打包；`pc:check` 显示 8 个场景组件注册、iterator 检查、manifest FRESH、overlay SHA 匹配 |
| 新包 smoke | `ELECTRON_E2E=PASS`；`UI_REAL_EXE=NOT_VERIFIED` | `20261019-165151-e6630f`，1/1 |
| 全量 GamePlay 场景 | FAIL，24 场景：20 PASS、2 FAIL、2 BLOCKED | `20261019-165219-b5f28d`；20 分钟 `home-arena-soak` 通过；卡牌随机事件/卡牌存档重启在角色创建背景点击处 `SETUP_BLOCKED`，项目合同与时间存档场景失败 |
| 修正后定向复测 | 两场景各自 PASS | 删除项目战斗后无条件点全局返回按钮的错误步骤后，`sect-project-contract` 于 `20261019-173421-918ea4` 通过；时间存档将固定错位索引修正为对照第二工作日，`time-save` 于 `20261019-173645-5056c9` 通过 |
| Runner 单测 | PASS，48/48 | `node --test tests/gameplay-agent/runner.test.cjs`；新增契约测试验证项目路由与动态日结状态判断 |

本轮重建后的制品 SHA-256：EXE `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`；ASAR `e5e461dec02c389a07256961b9d4ad92dbc2a29dab25abd98e05f494b1e10bc0`；Build 输入 `be9e01961a4f597e78bf25e38bcf69432d0dc29649120053869d66da450359b2`。完整全量 GamePlay 场景在两个场景修正前运行；修正后两个定向场景通过，卡牌建角阻断仍未修复，因此没有重跑会重复 20 分钟 soak 的完整集，也没有执行 Gate。

当前仍为 `IN_PROGRESS / BLOCKED`。八宗门五阶段链、四职业完整成长矩阵、全量 Gate、指定 30/100 日模拟及物理 Windows 输入未完成；历史启动卡死与退出码 36 的根因仍 `NOT_VERIFIED`。不能将上述定向通过扩展为全量验收通过。
