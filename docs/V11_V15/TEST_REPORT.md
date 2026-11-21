# V11 测试报告（TEST_REPORT）

> 全部为真实执行结果，无虚构。执行环境：HBuilderX 内置 Node v22.22.2（等价 `npm test` 链路）+ 真实 Chrome CDP 探针。

## 1. 类型检查

| 命令 | 结果 |
|---|---|
| `tsc -p tsconfig.game.json --noEmit` | **0 错误**（每切片提交前均跑） |
| `tsc -p tools/orchestrator/tsconfig.json --noEmit` | 0 错误 |

## 2. 全量单元/集成测试

`node tests/run-all.cjs`（递归 tests/.compiled + v10-final *.cjs）：

| 时点 | 文件数 | 结果 |
|---|---|---|
| 基线（V10 终验后） | 188 | 全过 |
| +S1 | 189 | 全过 |
| +S2/S3 | 191 | 全过（中途修复 2 处：事件清单契约测试补 itemCraftFailed；game-ui-controller craft 测试注入确定性 RNG） |
| +S4/F2（最终） | **191** | **全过 exit 0** |

新增覆盖：
- `tests/leaderboard/leaderboard-service.test.ts`（12 用例）：同种子确定性、排序/名次连续性、玩家唯一性与四维分值、负值钳 0、非法 metric 抛错、Clock 缓存 60s、topN/around 边界、npcCount 校验、**NPC 职级带随玩家缩放（15 级玩家 ±4 带内）**、财富/成就带缩放、metricLabel
- `tests/settings/settings-service.test.ts`（6 用例）：默认值、跨实例持久化往返、音量钳位/NaN 兜底、坏 JSON fail-soft、旧档无音量字段兼容、reset 持久化
- `tests/ui/animation-dispatcher-craft.test.ts`（4 用例）：craft 触发器接线、事件→SFX 播放、reduced-motion 跳视觉留音频、dispose 停播
- `tests/craft/craft-service.test.ts` 19→22 用例：成功率掷骰边界（roll<rate 左闭右开）、失败消耗材料无产出无计数、品质分段（per-recipe 权重+rollQuality 边界）、**apply 失败回滚材料+计数（无半态）**、坏配置构造期拒绝、lifetime 统计（成功/失败/极品分账、回滚不残留）

## 3. 内容校验

`node scripts/check-v2-content.cjs` → **PASSED**（成就 111、事件/物品/Messenger 交叉 ID 验证过）。

## 4. 真实运行验收（UI 级）

`scripts/v11-qa/v11-acceptance-probe.cjs`（fresh web-desktop build @ Cocos 编辑器 27s → copy → 静态服务 → Chrome 430×932 → CDP）：

| 阶段 | 断言 | 结果 |
|---|---|---|
| A1 | 新档向导完成 + facade 桥存在 | ✅ |
| A2 | 排行榜 4 榜/玩家 rank31/31 条/**同种子两实例整榜逐项一致** | ✅ |
| A3 | 配方卡 DOM 含「成功率90%」；**注入资源后真实点击合成 → toast「炼制成功！【普通】」+ craftSuccessCount=1 + 修为 5000→4950**；另轮随机出【良品】4965（×1.3 真实结算） | ✅ |
| A4 | 成就页 DOM 可见「初试丹道」「极品丹师」，配置 CRAFT=6 | ✅ |
| A5 | 设置页真实行/滑条 + context.settings 音量字段 | ✅ |
| A7 | **真实点击 overlay SFX 开关 → settings 翻转 + localStorage game-settings 持久化 + 复原一致** | ✅ |
| 汇总 | **8/8 PASS**，结果落 `artifacts/V11_V15/v11-acceptance-results.json`，8 张截图 | ✅ |

## 5. 未执行（如实）

- 60/120 分钟稳定性（基建在位：perf-probe/SoakMonitor；下轮执行）
- 微信真机（E1 环境阻塞）
- canvas 内 LeaderboardPage 榜单切换的视觉验证（服务层+单测已覆盖；坐标点击脆弱性留待专用探针）
- 20 轮策略试玩（现有 v58-balance-sim 六人格；扩展属下轮）
