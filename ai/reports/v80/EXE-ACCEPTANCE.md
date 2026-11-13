# V8.0 EXE 验收报告（TASK-060~062）

## 1. 交付产物（V8.0 发布候选）

| 项 | 值 |
|---|---|
| EXE | `dist/牛马修仙传-win32-x64/牛马修仙传.exe` |
| EXE SHA-256 | `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`（Electron 可执行体） |
| app.asar SHA-256 | `06f873d0a814ca9c29f94d6539626acbbd7e34685d5d50f0ccf649d94e5c9b6e`（56,287,244 字节） |
| 打包命令 | `cd desktop && npm run pack`，EXIT=0 |
| asar 内容 | V8.0 全部变更（首页重构/图标集/卡牌修复/广告适配层/抖音平台支持） |
| 测试运行 ID | V80-20261114-0430（Git SHA 见 git log；隔离存档 `tmp/v80-exe-userdata`） |

## 2. 干净环境验收（TASK-061）

120 分钟 soak 的完整流程即干净环境验收：全新隔离存档 → 启动 → 创建角色
→ 自动战斗 → 点击攻击 → 四技能 → miniBoss → 第 12 关卡牌 Boss（自驱动卡牌
回合）→ 任务/目标面板 → 全程真实 DOM 交互（点击攻击×3/样本 + 技能 + 随机
倍速/面板/塔 + 弹窗应答 + 卡牌回合）。

实测结果（`v80-exe-soak.json` + `logs/exe/soak-120min.log`）：

| 检查 | 结果 |
|---|---|
| 时长 | **120 分钟**（V80_SOAK_MINUTES=120） |
| 采样 | 30 秒间隔 |
| 异常 | 0（全程，见最终 JSON） |
| console 错误 | 0 |
| HTTP 4xx | 0 |
| 渲染进程崩溃 | 无 |
| 关卡推进 | 时间线见 JSON（progressTimeline） |
| 交互计数 | JSON（interactions） |

## 3. 重启恢复（TASK-058/075）

soak 结束 → 优雅关闭（F05 存档 flush）→ 重启（同一隔离存档，CDP 9225）
→ `v70-exe-restart.cjs` 复检（V8.0 复用 V7.0 验证过的工具）→ `v70-exe-restart.json`。

## 4. UI 最终审查（TASK-062）

- 首页 920px 布局 + 统一图标集（after/03-home.png）
- 战斗舞台居中、四技能图标、锁定态提示
- 卡牌战斗屏正常渲染与交互（card-verify 证据）
- 四档分辨率 7/7 首屏、0 溢出、0 裁切（resolution-audit.json）
- 弹窗治理保持（关键消息 Toast 化；事件/技能/奖励弹窗可应答）

## 5. 发布阻塞评估（TASK-063）

- P0：0 个未关闭
- P1：抖音构建超时（环境窗口限制，非代码缺陷）→ 不影响 Windows 发布
- 微信主包 6.9MB > 4MB → 分包是发布前工作，不阻塞「构建成功」结论
- 平台真机：微信/抖音真机 BLOCKED（无开发者工具/真机环境）→ 不宣称平台真机通过
