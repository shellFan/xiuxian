# V5.9-O.1 战斗架构调查

## 结论

状态：**BLOCKED**（源码审计完成；回合制系统未实现）。本报告基于 `gameplay-v2` 起始提交 `4699fc5f3ecf1dff59c6e7733f00377d4b81c1ce`。本轮没有修改游戏逻辑。由于缺少 Cocos Creator，且 Electron 28.3.3 二进制下载连接超时，无法满足计划审核中要求的构建门槛，因此停止生产代码变更，避免提交无法验证的主循环重构。

## 旧战斗调用链

1. `GameContext` 构造 `BattleService`，可注入随机源。
2. `GameFacade` 暴露查询、开始、出技能、放弃、清理已结束战斗等入口；Facade 命令按现有流程保存。
3. `BattleService.start()` 创建并保存 `player.activeBattleRun`，初始化遭遇、波次、敌人、技能与状态；随机源默认最终回退到 `Math.random()`。
4. `GameLoopService` 的固定步进会在存在当前战斗时调用 `battle.tick(seconds)`。
5. `BattleService.tick()/stepOnce()` 累加战斗时间并在攻击间隔内推进玩家自动攻击、敌人行动、状态计时、敌人意图及胜负判断。主动技能由 `castSkill()` 发起，包含冷却和即时推进行为。
6. 胜利奖励由 `claimRewards()` 修改玩家材料、装备、灵石、疲劳、任务、职业经验与统计；奖励领取标记保存在当前 run 并随存档保存。
7. `SaveService` 将玩家数据快照写入当前 storage adapter。Electron 持久化由 `desktop/storage.cjs` 负责 JSON、校验和临时文件替换。
8. `desktop/ui-overlay.js` 渲染旧战斗面板，并经 UI bridge 调用旧战斗命令；目前没有五张手牌、能量、结束回合、抽弃牌操作界面。

## 目标回合制调用链（尚未落地）

玩家 UI → `GameFacade` 命令校验 → 唯一权威 `BattleRun` 状态机 → 确定性卡牌效果管线 → 敌方意图执行 → 奖励选择/领取 → SaveService 原子保存与恢复。主游戏 tick 必须禁止 CARD 模式造成自动伤害；旧 tick 逻辑仅可服务已明确标记的兼容存档或未来遭遇，且不得与新 run 并行推进。

## 复用和迁移

- 可复用：职业/命格/技能配置与成长、敌人和 Boss 数据、状态效果、意图展示、战斗日志、奖励表、Facade 命令边界、SaveService、`activeBattleRun` 保存槽位。
- 必须停用于 CARD 遭遇：tick 的玩家自动攻击、敌方自动攻击和技能即时步进入口。仅改 UI 无法满足这一点。
- 战斗状态需固定包含 run 与 encounter ID、种子/随机状态、回合/阶段、玩家与敌方生命/格挡/状态、能量、抽牌/手牌/弃牌/消耗牌堆、奖励状态和 stateVersion。
- 新 run 应记录不可变的模式、schema 与配置版本。旧 tick 存档要通过明确 migration 转入安全兼容态；重启恢复必须先执行可重放/幂等恢复并完成保存，之后才能开放 UI 或 tick。
- 伤害、费用、目标校验、卡牌移动、胜负检测和奖励收据需要集中在服务层；在失败保存时应恢复或锁定命令入口，不能让内存状态与存档分叉。

## 测试迁移矩阵

旧自动攻击/技能冷却回归应转为：玩家回合不自动伤害、非法阶段拒绝出牌、能量不足无副作用、重复动作只扣一次费用、结束回合只执行一次敌人行动、种子可重放、奖励只领取一次、跨重启 run 恢复一致。现有 `tests/run-all.cjs` 在本机基线执行到 Electron DOM 测试时失败，因为 Electron 二进制未安装；其前若干服务/战斗/平衡用例已执行，但这不构成全量通过。

## 兼容性风险与后续门槛

- 旧 `activeBattleRun` 被现有模型按兼容数据规范化；不能假定旧对象能直接满足 CARD 状态机。
- `GameLoopService` 是自动伤害并发入口；遗漏模式分流会造成回合外偷跑。
- 旧 UI 的技能按钮与新卡牌选择、目标选择和回合阶段不同，必须完成端到端迁移。
- SaveService/storage 的多字段战斗更新需要崩溃边界测试；不能只依赖内存测试。
- Cocos Creator 不存在于此环境。`node scripts/build-web.cjs` 明确返回 `COCOS_NOT_FOUND`；Electron 包下载返回 `ETIMEDOUT`。在恢复这两项工具链前，不应开始无法在目标运行时验证的生产改造。

## 本轮范围

起始分支：`gameplay-v2`。起始 SHA：`4699fc5f3ecf1dff59c6e7733f00377d4b81c1ce`。生产文件未修改；完整状态见 `V59O1-REMAINING-ISSUES.md`。本报告不宣称新战斗已实现。
