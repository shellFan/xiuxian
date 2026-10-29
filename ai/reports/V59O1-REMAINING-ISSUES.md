# V5.9-O.1 剩余问题与解阻清单

## 最终状态

`V59O1=BLOCKED`。当前交付仅是基线审计与环境阻塞报告，不能作为 V5.9-O.1 功能验收。

## P0 — 回合制战斗未实现

- 默认战斗仍由 `GameLoopService` tick 驱动旧自动攻击。没有五张手牌、三能量、结束回合、敌人回合、抽弃牌堆、统一效果引擎、卡组构筑或奖励选择闭环。
- 可复现：在基线源代码查看 `assets/scripts/services/game-loop-service.ts` 对 `battle.tick(seconds)` 的调用，以及 `assets/scripts/v3/battle-service.ts` 的 `tick()/stepOnce()`；当前 `desktop/ui-overlay.js` 仍渲染旧技能操作面板。
- 风险：只加 UI 会与旧 tick 形成双重伤害来源；需要先做权威状态和 CARD 模式隔离。

## P0 — 构建及真实 EXE 验收被阻断

- Cocos Creator 不可用，web 构建报 `COCOS_NOT_FOUND`；Electron 运行时下载报 `ETIMEDOUT`，没有 exe 文件。
- 可复现：运行 `node scripts/build-web.cjs`；安装 Electron postinstall 会因连接 `20.205.243.166:443` 超时而失败。全量测试在 `desktop-overlay-dom.test.js` 因 Electron 安装不完整退出 1。
- 影响：没有 EXE、ASAR 哈希、可见 UI 自动化、存档恢复证据或 20 分钟 soak。获取目标版本 Creator 和 Electron 二进制后重跑。

## P1 — 晋升重试门禁仅在内存

- `PromotionService` 的 `retryRequired`、`retryAvailable` 和 `retryRequested` 是实例私有字段；失败次数 `promotionFailCount` 会保存，但重建 service 后 retry gate 没有从存档恢复。
- 可复现：在 `assets/scripts/services/promotion-service.ts` 查看字段定义及 `promoteWithRoll()` 失败后只设置 `this.retryRequired = true`。实例重建时字段默认 false。
- 后续需以测试先行将“失败需获得一次合法重试令牌”的业务门禁持久化，同时验证广告回调重复、保存失败回滚及不得永久锁死。当前没有修改。

## P1 — 每日任务/签到边界尚未完整验收

- 每日任务的 `dailyTasks`、`dailyTaskDay` 和签到 `dailySignIn` 保存在玩家状态中；任务按注入 `Clock` 的 UTC 日索引刷新，签到按 UTC 午夜及 grace window 判断。
- 本轮未验证时区业务预期、日期回拨、跨日奖励保存失败和进程重启重复领取。虽然状态有存档，不代表上述边界已通过。

## P1 — 自由职业及长期平衡覆盖未完成

- 未运行 GamePlay Agent、独立自由职业合同画像、30/100 日模拟，也未复验 N.10 的 SELF_PRESERVING 30/30 Gate。本轮的基线测试中曾打印既有平衡模拟结果，但不足以替代本 O.1 所需的独立验收。

## P2 — UI 和物理输入

- 无回合制 UI、目标选择/取消、禁用原因、奖励选择、Boss 意图以及新手首战引导的 EXE 证据。
- 物理输入：`NOT_VERIFIED`。

## Git 与范围

- 起始：`gameplay-v2` @ `4699fc5f3ecf1dff59c6e7733f00377d4b81c1ce`。
- 本报告预期与其余三份报告作为唯一提交文件；没有生产代码、测试存档、打包产物或其他工作树改动。
- 最终提交 SHA 与推送状态以 `git rev-parse HEAD` 及远端分支核对结果为准；报告提交自身不嵌入自身 SHA。
