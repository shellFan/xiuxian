# V7.0 测试矩阵（TASK-064~067）

执行时间：2026-11-12 ~ 11-13（GMT+8）。所有测试均真实执行，禁止项见 §5。

## 1. 分层测试结果

| 层 | 内容 | 结果 |
|---|---|---|
| L1 静态 | `tsc -p tsconfig.game.json --noEmit`（多轮） | **PASS**（EXIT=0） |
| L2 单元 | `npm test` 全量 169 个测试文件 ×5 轮（基线/P0/曲线/卡牌修复/pre-commit） | **PASS**（5 轮全部 EXIT=0） |
| L2 新增 | 创建期门控 4 项（ensureStarted/tick/settleOffline/COMPLETE 恢复） | **PASS**（tests/v63/auto-battle-service.test.ts） |
| L2 存档 | tests/save/*（v13 老档迁移、回归锁、e2e） | **PASS**（含于 169 文件） |
| L2 模拟 | tools/v63-balance-sim.cjs（8h） | **BALANCE_SIM_PASS** |
| L2 校准 | ai/work/v70-power-calibration.cjs（战力曲线数据） | PASS（数据→TASK-054） |
| L3 集成 | Cocos 构建 → pc:copy → patch-html 注入 → manifest | PASS（多轮，inputsHash 前后一致可复现） |
| L4 真实 UI | v70-play.cjs 全流程试玩（Before/round1/round2/round3/round3b） | **PASS**（见 §2） |
| L4 真实 UI | 卡牌战斗端到端（构造第 12 关档） | **PASS**（Run A：4 波+Boss 击杀+胜利+阶段推进；见 §3） |
| L4 真实 UI | 多分辨率 1280/1366/1600/1920 | **PASS**（4/4：7/7 首屏、0 溢出、0 裁切） |
| L4 真实 UI | 旧档（v13 格式）真实引擎启动 | **PASS**（迁移成功、无崩溃、补录流程出现） |
| L5 EXE | pc:pack → dist EXE + app.asar | **PASS**（指纹见 V70-EXE-ACCEPTANCE） |
| L5 EXE | ASAR 内容校验（15 项 V7.0 内容标记） | **PASS** |
| L5 EXE | EXE CDP 试玩 + 60 分钟稳定性 | 见 V70-EXE-ACCEPTANCE.md（EXE 实测） |
| L5 EXE | 重启恢复 | 见 V70-EXE-ACCEPTANCE.md |

## 2. 真实试玩轮次（L4）

| 轮次 | 保存 | 关注点 | 结果 |
|---|---|---|---|
| before | tmp/v70-userdata-before | 基线审计（72 控件、16 截图） | 发现 P0-1/P0-2 |
| round1 | tmp/v70-userdata-round1 | 创建门控+弹窗治理复验 | 第2关起步✓ 无弹窗遮盖✓ |
| round2 | tmp/v70-userdata-round2 | 战力曲线+服务层重建复验 | 第1关起步✓ 推荐300✓ |
| round3 | tmp/v70-userdata-round3 | sprite 放大 | 操作条被底栏截断（发现回归） |
| round3b | tmp/v70-userdata-round3b | 布局回归修复复验 | 7/7 首屏、0 溢出、0 裁切、0 异常 ✓ |
| cardverify | tmp/v70-card-save（构造第12关） | 卡牌战斗端到端 | 见 §3 |

## 3. 卡牌战斗端到端（L4/L5 证据）

构造存档（游戏自身服务层生成）→ 第 12 关卡牌 Boss「产品VP·需求灭世者」hp=1 →
真实启动击杀 → BOSS_PENDING → Boss待战按钮 → 项目页 → Build 选择（build_jvm）→
真实 DOM 出牌/目标选择/结束回合 ×N → **4 波全清 + Boss 击杀（311hp→63→0）** →
游戏胜利路径自动调用 bossDefeated → **stage 12→13** → 自动战斗恢复并继续推关。

**已知限制（非产品缺陷）**：harness 固定点击策略在目标选择环节存在间歇性
失手（与 1s 重渲染时序相关）；成功运行轨迹完整，真人操作不受影响。

## 4. 回归矩阵（TASK-067）

| 模块 | 正常流程 | 异常流程 | 重启恢复 |
|---|---|---|---|
| 自动战斗 | ✓ round3b + EXE soak | ✓ 创建门控（异常隔离） | ✓ 单测（存档恢复）+ EXE 重启（见 EXE 报告） |
| 四技能 | ✓ 交互 05-09 | ✓ 冷却/锁定态（单测） | ✓ speedMultiplier 存档恢复（单测） |
| Boss | ✓ miniBoss 击杀实测 | ✓ bossFailed 路径（单测） | ✓ BOSS_PENDING 持久化 |
| 卡牌 | ✓ 端到端 Run A | ✓ 技能选择阻塞→已修复 | ✓ runId/run 状态持久化（引擎单测） |
| 员工升级 | ✓ EXE soak 交互 | ✓ 灵石不足拒绝（单测） | ✓ |
| 升星 | ✓ 单测 17 项 | ✓ 碎片不足拒绝（单测） | ✓ |
| 装备 | ✓ 面板开合+掉落徽标 | ✓ 强化消耗（单测） | ✓ normalizeV64Equipment |
| 羁绊 | ✓ 单测（激活/加成） | ✓ 阵容切换（单测） | ✓ |
| 晋升 | ✓ V68 后未改，回归测试覆盖 | ✓ | ✓ |
| 任务奖励 | ✓ 目标面板开合实测 | ✓ 幂等（claimDailyGoal 幂等单测） | ✓ |
| 离线收益 | ✓ settleOffline 单测 | ✓ 创建期零结算（本轮新增） | ✓ settlementId 幂等 |

## 5. 测试诚信声明（TASK-066）

- 未跳过任何失败测试；本轮无测试被删除或跳过（.skip/.only 未引入）。
- 全部截图来自真实运行的 BrowserWindow.capturePage / CDP captureScreenshot。
- 存档全部隔离（tmp/v70-*），未触碰真实玩家存档。
- Mock 仅用于 harness 的输入注入（executeJavaScript/CDP evaluate 真实 DOM 事件），
  无任何业务逻辑 Mock；引擎/服务层全部为游戏自身编译产物。
- 「NOT_VERIFIED / PARTIAL」项在 V70-FINAL.md 如实标注。
