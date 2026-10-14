# V5.9-G.2 游戏试玩与质量交付报告

报告日期：2026-10-15
结论：**CONDITIONALLY_VERIFIED**

## A. 版本信息

- 起始 `SOURCE_SHA`：`c7c834e8e5dca51a49200d6bab7da87e3f7706fd`
- 起始分支：`feature/v59f-z-playability`
- 本次验证源代码对应 HEAD（测试前）：`c7c834e8e5dca51a49200d6bab7da87e3f7706fd`。
- `FINAL_SHA`（V5.9-G.2 实现与证据提交）：`8cbad61cd97d648061b31e3d46eeba2ef810d8cf`。
- `origin/gameplay-v2`：`a8670d12d57173964a82a34f77a9d04279c2c50c`。
- 远程功能分支：`origin/feature/v59f-z-playability` 与起始 HEAD 一致。
- G.2 实现提交：`8cbad61cd97d648061b31e3d46eeba2ef810d8cf` — `feat(gameplay-agent): add V5.9-G.2 replay and gate`。
- 报告/进度提交：`a7198e94e60d21224ffecc73e52d26778d0cd934` — `docs(gameplay-agent): finalize V5.9-G.2 delivery record`。
- 未改写分支历史，未强推。既有 V5.9-F 改动与历史 QA 记录保持原状。

## B. 自动化系统

- Runner 提供点击、双击、输入、按键、滚动、等待、截图、权威状态读取、可见/可点击/状态断言、页面重启与窗口视口模拟；场景只允许调用既有 GameFacade。
- Node Runner 保存场景变量、步骤输出、游戏状态快照和重启前后数据。变量有 `scenario` / `run` 作用域与类型校验，变量只在显式设为 run scope 时跨场景共享；缺少变量或路径会报明确错误。
- `replay.json` 记录场景定义、动作目标、坐标、窗口内容尺寸、状态前后值、耗时、结果和证据引用，可复现输入序列。
- 随机事件/关键消息的弹窗用真实 CDP 指针事件选择可见业务选项；点击后等待并检查弹窗。关闭未确认时 Runner 停止，不向被遮挡页面继续操作，最多尝试三次并保存状态、截图和操作日志。
- 新增弹窗关闭后页面上下文恢复：若事件选项离开主页，Runner 验证弹窗消失后再实际点击主页导航，等待滚动容器恢复，再继续滚动。该恢复逻辑先以失败单测验证缺失，再实现为通过。
- 单测：`node --test tests/gameplay-agent/runner.test.cjs`，26/26 通过。完整 `release:check` 执行 148 个测试文件。
- 游戏时间场景读取现有权威时钟；本地显示日期、UTC 日期与 `dayNumber` 单独记录。07:59、08:00、08:01 分别检查，只有推进完整 24 小时后才断言权威 `dayNumber` 变化。

## C. 游戏体验

- 七步角色创建：通过。测试以真实 UI 输入选择行业、职业、身份、天命、属性并确认入职，最后进入可玩主页。
- 首屏：通过。`new-player-full-journey` 在第 57 步记录首次可玩主页，场景完成 65 步。
- 任务、工资与消费：通过。完成既有指派任务后，工作 1800 秒使权威工资从 ¥60 增至 ¥63；咖啡使用真实 UI 点击，从 ¥63 扣至 ¥45，扣款 ¥18。生活选项价格从既有服务读取。
- 日结与跨天：`time-save` 123 步通过，验证三个连续游戏工作日结算与推进、07:59/08:00/08:01 边界，以及依权威时钟判断跨天。
- 存档与重启：通过。完成三个工作日后重启测试 EXE，断言工资、角色职业、主页状态与 Runner 保存的变量恢复。
- 职业抽样：通过。`profession-loop` 从当前已解锁职业目录生成用例并验证已有建角服务；新职业可随目录加入回归。
- 外层窗口尺寸：未验证。`viewport-matrix` 对 1280×720、1366×768、1600×900、1024×768 内容视口完成模拟检查；没有将其当作真实 Windows 外窗/缩放验证。

## D. 测试证据

- 完整门禁：[`ai/gameplay-agent/reports/20261014-172511-7fd0f9/summary.md`](../gameplay-agent/reports/20261014-172511-7fd0f9/summary.md)，7/7 场景通过；全量测试、新鲜 Cocos 构建、打包与资源检查通过。
- 弹窗恢复单场景复测：[`ai/gameplay-agent/reports/20261014-171904-5e9fb5/summary.md`](../gameplay-agent/reports/20261014-171904-5e9fb5/summary.md)。关键消息选择、关闭确认、主页导航恢复和咖啡流程均有 replay 与截图。
- 可复现的修复前缺陷报告：[`ai/gameplay-agent/reports/20261014-171542-88ee33/summary.md`](../gameplay-agent/reports/20261014-171542-88ee33/summary.md)，记录关键消息选择后滚动上下文消失的步骤、状态及截图；修复后复测通过。
- 角色创建、经济、三日、职业与视口关键截图/状态/replay 均保存在完整门禁报告各场景的 `evidence/` 和 `replay.json` 中。
- 构建 SHA：`b5a502977afa2aac7ad52c62867be748c3b7b8d12ec3c20472705f48baa1fd19`，Cocos 构建为本次新产物。
- EXE SHA-256：`e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`。
- ASAR SHA-256：`5caa26f018371aeb7aa2eaa08170313357e782c6194044c9b2d615832e55e6ed`。
- 本地测试档使用每场景独立临时 Electron profile；测试后清理临时目录，没有接触正式玩家存档。

## E. 质量门禁

| 验证模式 | 结果 | 证据说明 |
|---|---|---|
| `UI_REAL_EXE` | `NOT_VERIFIED` | 虽启动了打包 Windows EXE 窗口，但输入来自 localhost CDP 合成事件，截图来自 renderer 捕获；未执行物理鼠标/键盘操作。 |
| `ELECTRON_E2E` | `PASS` | 打包 EXE 下 7/7 场景通过。 |
| `SERVICE_SIM` | `PASS` | 完整发布测试与服务模拟通过。 |
| `NOT_VERIFIED` | 2 项 | 物理 Windows 输入；外层窗口尺寸与 100%/125%/150% 缩放矩阵。 |

- 完整门禁缺陷：BLOCKER 0，HIGH 0，MEDIUM 0，LOW 0。
- 未确认观察：一次独立经济场景运行中，工作计时增长但工资快照未增长；未修改工资业务规则。之后两次单场景/门禁运行都记录工资增长，完整 gate 通过。目前证据不足以将它认定为游戏缺陷，列为 `NOT_VERIFIED`，建议下一轮加入固定建角随机种子与工资分段快照。
- Gate 报告中的失败数量为 0；物理 GUI 与外层窗口矩阵仍是明确的未验证项。

## F. 最终结论

**CONDITIONALLY_VERIFIED**。Runner、场景、自动复测、完整自动门禁和 CDP/Electron E2E 均可重复执行且当前通过；发布仍需补做可见 Windows 桌面上的物理输入与外窗/缩放测试。当前没有已确认的 BLOCKER 或 HIGH 缺陷。

### Git 交付状态

- 最终源代码 SHA：`8cbad61cd97d648061b31e3d46eeba2ef810d8cf`。
- 推送状态：已推送至 `origin/feature/v59f-z-playability`，使用普通 fast-forward，没有强推。提交只包含 G.2 Agent、场景、Runner 测试、G.2 报告与选定的 G.2 运行证据。既有 V5.9-F 和其他 QA 工作仍在工作树中。

### 下一轮最值得开发

在真实 Windows 交互桌面环境补齐物理鼠标/键盘与外层窗口/缩放验收，并用固定建角种子复测工资偶发现象；继续保持 GamePlay Agent 只采证、分类和复测，由 Codex 修改正式游戏代码。
