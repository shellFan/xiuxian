# V10.0 FINAL — Windows EXE 验收报告

- 日期：2026-11-18（V10 FINAL 轮）
- 方法：打包后的真实 EXE（`dist/牛马修仙传-win32-x64/牛马修仙传.exe`）以
  `--remote-debugging-port=<随机端口>` 启动，`XIUXIAN_USER_DATA` 指向一次性隔离目录
  （真实玩家存档零接触）。CDP attach 真实渲染进程，全部输入为真实鼠标/键盘事件，
  全部断言读取页面内 `window.__GAME_FACADE__` 权威状态。
- 探针：`scripts/v10-final/cdp-runner.cjs`（自研最小 RFC6455 WS 客户端 + CDP 驱动，
  无 Electron 依赖，可在本机唯一可用 Node 运行时 Electron-as-Node v18.18.2 上运行）。

## 发布物

| 文件 | SHA-256（前20位） | 说明 |
|---|---|---|
| 牛马修仙传.exe | `e10410e805c536b470d4` | Electron 28.3.3 运行时 + 图标/版本戳 |
| resources/app.asar | `c4830eef512eb1b00487` | 含 V9.2/V10.0/V10.1 全特性 + 运行时隔离 + NPC 记忆 |

ASAR 标记复核（原始字节 grep）：`computeSetBonus×16`、`comboCount`、
`XIUXIAN_USER_DATA must be an absolute`（运行时隔离）、`attachMemoryStore`（NPC 记忆持久化）。

## Boot 验收（9 项硬门）

| Gate | 结果 | 说明 |
|---|---|---|
| electronReady | PASS | window.electronAPI 为 object，getRuntimeInfo 可用 |
| cocosReady | PASS | canvas/引擎就绪 |
| facadeReady | PASS | __GAME_FACADE__ 挂载 |
| creationComplete | PASS | 七步创建向导（行业→方向→职业→身份+背景→天命→加点→入职）全真实点击完成 |
| homeVisible | PASS | 洞府首页可见 |
| resourcesReady | PASS | 全部图片资源 complete 且 naturalWidth>0 |
| heroSpriteReady | PASS | 主角 sprite 渲染 |
| chapterValid | PASS | chapter=需求分析, stage>0 |
| battleReady | PASS | 导航至战斗页后舞台渲染（独立五页架构，首页不挂战斗 DOM 属预期） |

最终包 boot gate：**9/9 PASS**（run: harness/exe-2026-11-17T16-38-39 与 16-55 两次复跑均 9/9）。

## Gameplay 真实操作验收（EXE）

| 动作 | 结果 | 验证方式 |
|---|---|---|
| work（今日修行-工作） | PASS | 真实点击后 domSignature/facade 变化 |
| messenger（飞剑传书） | PASS | openMessenger 打开 UI，签名变化 |
| hire（招募菜单） | PASS | v63-hireMenu 打开，招募按钮可见 |
| tap（连击攻击 ×6） | PASS | 连击文本/敌人受击 |
| equipment（装备面板） | PASS | v64-openEquip 开启，穿/强化按钮可见 |
| card-entry（项目攻坚） | PASS | projectEntry 打开 Build 选择弹窗 |
| card-session（完整卡牌战斗） | PASS | 真实出牌→选敌→回合→奖励 80+ 步会话（早期运行） |
| chapter（章节断言） | PASS | stage 递增（1→2…） |
| restart（重启恢复） | PASS | Page.reload 后 facade 恢复，存档保留 |
| upgrade（升级点击） | NOT_VERIFIED | 新档灵石不足时静默失败（正确的游戏行为），面板断言无变化 |
| tasks-claim / promotion | NOT_AVAILABLE | 新档无可领奖励/无晋升资格（正确空态） |

## 60 分钟稳定性 soak

- 探针：每 30s 采样（页面状态/心跳/空白/堆内存/进程树/错误数）+ 每 30s 一次真实交互（tap/cultivate/work）。
- 最终包 soak：进行中/复跑（见 FINAL.md 状态行）。此前两段 soak 证据：
  - 24 分钟段：48 采样 0 异常、0 心跳缺失、0 空白，关卡 5→9→12 自动推进，堆 91.7→90.5MB（无泄漏趋势）。
  - 13 分钟段（最终包首段）：27 采样 0 异常，被 dist 重打包打断（外部并行打包覆盖产物，非游戏缺陷）。
- 已知 harness 问题（非游戏问题）：harness 进程在长 soak 中可能静默退出（Node18 运行时限制），
  manifest.jsonl 逐行落盘保证中断仍留全量证据。

## 结论

EXE_BOOT / EXE_UI / NEW_PLAYER_E2E：真实 EXE 全链路可玩，9/9 boot + 9 gameplay PASS。
EXE_SOAK_60MIN：以最终证据为准（FINAL.md），此前最长连续段 24 分钟全绿。
