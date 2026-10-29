# V5.9-O.1 卡牌战斗交付记录

## 状态

`CARD_BATTLE=BLOCKED`，`FULL_ACCEPTANCE=BLOCKED`。本轮未将玩家入口切换到回合制战斗，也没有交付五张手牌/三点能量玩法。执行门槛与证据详见 Windows 验收报告。

## 起始基线

- 分支：`gameplay-v2`
- 起始 SHA：`4699fc5f3ecf1dff59c6e7733f00377d4b81c1ce`
- 源码变更：无
- 新增交付物：四份 O.1 阻塞/审计报告

## 需求验收状态

| 验收项 | 状态 | 证据 |
|---|---|---|
| 默认进入真正回合制 | BLOCKED | 当前仍走 tick 驱动自动攻击，详见架构审计 |
| 五张初始手牌、三点能量 | BLOCKED | 未实现 |
| 出牌校验、目标、能量与状态机 | BLOCKED | 未实现 |
| 玩家结束回合及敌方行动 | BLOCKED | 未实现 |
| 四职业差异卡组 | BLOCKED | 未实现 |
| Boss、命格、宗门适配 | BLOCKED | 未实现 |
| 奖励选择及防重复领取 | BLOCKED | 沿用旧奖励流程，未适配新战斗 |
| 回合战斗存档恢复与旧存档迁移 | BLOCKED | 未实现/未验证 |
| Cocos 构建和 Windows EXE | BLOCKED | Creator 缺失；Electron 运行时下载超时 |

## 验证记录

- TypeScript：`node node_modules/typescript/bin/tsc -p tsconfig.game.json --noEmit`，退出码 0（起始代码基线）。
- 全量测试：`tsc` 编译后运行 `node tests/run-all.cjs`，退出码 1。若干服务、旧战斗和平衡用例已运行；在 `tests/v4/desktop-overlay-dom.test.js` 加载 Electron 时失败：`Electron failed to install correctly, please delete node_modules/electron and try installing again`。原因是 Electron 二进制未能下载，不是全套测试通过。
- Cocos：`node scripts/build-web.cjs` 退出码 1：`COCOS_NOT_FOUND`。
- Electron：版本包为 28.3.3，postinstall 从下载主机连接超时：`ETIMEDOUT 20.205.243.166:443`，没有 `electron.exe`。
- GamePlay Agent、30/100 日模拟、EXE UI、EXE smoke、20 分钟 soak：均未执行，状态 NOT_VERIFIED/BLOCKED，详情见验收报告。

## 文件及结果计数

本轮没有新增测试文件、卡牌或职业卡组；数量为 0。没有截图、EXE、ASAR 或运行日志产物。没有对真实玩家存档执行读写。

## 历史风险

晋升重试门禁字段仅存在于 `PromotionService` 实例内，跨进程重启不持久；每日任务进度/日期及签到状态在玩家存档中，但其崩溃一致性、时区回拨和奖励重复场景本轮未执行验收。宗门与公司是不同模型，未合并概念。本轮未修复这些历史问题。

## 后续解阻条件

在执行机器安装可用的 Cocos Creator 3.8 LTS，并能获取 Electron 对应运行时后，从本报告记录的提交继续：先增加状态机与存档的失败边界测试，再改服务层与主循环，再迁移 UI 和 GamePlay Agent，最后执行新构建 EXE 的 UI、恢复与 20 分钟 soak 验收。不能用本次基线产物代表 O.1。
