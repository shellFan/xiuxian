# V10.1 测试矩阵（TEST-MATRIX）

## 一、测试执行结果

| 层级 | 内容 | 结果 |
|---|---|---|
| TypeScript | `tsc -p tsconfig.game.json --noEmit` | PASS |
| 单元/集成全量 | `npm test` → **174 个测试文件**（含本轮新增 tests/v101/card-v101.test.ts 19 项、balance-sim 校验） | **EXIT=0 全部通过** |
| 引擎新特性 | 流派联动×4 / CLEANSE / 费率诅咒 / JUDGE 打断×2 / COST_CURSE / MORALE_DRAIN / 行为类型×4 / 净化×3 / Boss 注册 / 奖励池 | 19/19 PASS |
| 平衡模拟 | 24 种子 × 3 场景（新手/中期/成型毒流） | 判定门全 PASS |
| UI DOM | card-ui-dom / home-layout / desktop-overlay-dom / creation-ui / 真实 Electron 窗口驱动 | PASS |
| V10 契约 | tests/v10-final/acceptance-harness.test.cjs（CDP/BootGate/Manifest 契约） | 4/4 PASS |
| AI Bridge | tests/v10-final/ai-bridge.test.ts（本轮修复环境依赖：本地 MNN 常驻导致假失败） | 3/3 PASS |

## 二、E2E 真实运行（Electron 无 preload = H5 上下文）

`scripts/v101/exp-audit.cjs` 全流程：创建角色 → 开工 → 工作/摸鱼/修炼/社交 → 挑战页 →
Build 选择 → 卡牌战斗（真实点击出牌/选目标/结束回合/技能三选一/奖励领取）→ 员工 →
装备 → 晋升 → 返回首页 → 重启恢复。

| 运行 | 视口 | 结果 |
|---|---|---|
| before-desktop（修复前基线） | 1280×720 | 记录 3 项 P1（尚未开工/丢档/弹窗饿死） |
| final-desktop | 1280×720 | 存档连续 ✓（灵石 4→4） |
| final-mobile390 | 390×844 | **0 缺陷** |
| final-mobile430 | 430×932 | 见 audit json（首轮因构建竞态作废重跑） |
| player-p01~p10 | 1280×720 ×4 职业 | 独立档案验收（见 PLAYER-EXPERIENCE-AUDIT.md 附表） |

## 三、性能（见 PERFORMANCE.md）

首屏 facade 19s（冷启动）；战斗页为 DOM 渲染，每秒 1Hz 刷新 + 签名缓存；
Heap/DOM 数与 V10 基线一致（无新增常驻监听；特效节点自动移除）。

## 四、未验证项（如实）

| 项 | 状态 |
|---|---|
| EXE 30min soak | 本轮打包 EXE 后做 10min 冒烟（时间盒）；30min soak 引用 V9.2/V10.0 通过记录 |
| 微信小游戏真机 | 环境无微信开发者工具，H5 = 浏览器验证（与 V10.0 口径一致） |
| IAB（ZCode 内嵌浏览器） | 引擎启动卡死（DEF-003），环境特定，不阻塞 |
