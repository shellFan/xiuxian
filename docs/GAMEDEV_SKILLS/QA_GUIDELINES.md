# 测试与验收规范（QA）

> 路由：测试任务 →（官方无通用测试技能，项目规范兜底）+ 本文件。
> 铁律：无测试不宣布完成；用 Mock 冒充真实功能、用文档代替实现均为违禁交付。

## 1. 测试架构（现状）

| 项 | 事实 |
|---|---|
| 规模 | tests/ 186 个 .test.ts + 各专项 .cjs（2026-11-21 run-all 实测 188 个文件全过） |
| 运行器 | 自研 `tests/run-all.cjs`：逐个 spawn `node` 断言进程，非 0 即失败；**无 jest/vitest 框架**，用 `node:test`/断言风格 |
| 命令 | `npm test` = `tsc -p tsconfig.game.json --outDir tests/.compiled --noEmit false && node tests/run-all.cjs` |
| 内容校验 | `npm run content:check`（事件/物品/成就完整性）、`npm run gameplay-v2:check`（V2 内容+合并遗留） |
| 发布门 | `npm run release:check` = typecheck + 全量测试；`npm run phase5:check` |
| 平衡门 | `node tools/v58-balance-sim.cjs`（GAME_ECONOMY 双闸门）、`node tools/v59n11-profession-compare.cjs`（四职业对照，固定种子） |
| CI | GitHub Actions `.github/workflows/ci.yml`：类型检查+全量测试+内容校验+V2 静态检查；Cocos/Electron 打包不在 CI |
| 本地 Node 缺失时 | 用 HBuilderX 内置 node（v22.22.2）直接调 `node_modules/typescript/bin/tsc` 与 run-all.cjs；以 CI 结果为最终裁决 |

## 2. 目录组织与用例要求

- tests/ 按系统/世代分目录（offline、save、economy、cultivation、events、v2、v3、v59o 卡牌、ui、scene、release…）；**新系统必须建同名新目录**。
- 覆盖基线（V10.1 audit 现状）：offline 6 / save 3 / cultivation 5 / v3 21 / v59o 5 / ui 12…；已知薄弱：save-service-v2（未接线）、messenger。
- 用例风格：服务级单测（注入 Clock/RandomProvider/StorageAdapter 测试替身），不做真实网络/广告调用；广告 exactly-once、存档迁移、时钟回拨这类用例参考 tests/offline/offline-exactly-once.test.ts 先例。

## 3. 变更类型 → 必跑矩阵

| 变更 | 必跑 |
|---|---|
| 数值（configs/*.json 或 fallback） | typecheck + 对应系统 tests + v58-balance-sim Gate |
| 存档结构 | tests/save/ 全部 + save-compat-e2e + regression-lock |
| 事件/任务/成就内容 | content:check + tests/events + schema 校验（docs/schema 对应文件） |
| UI 组件 | typecheck + tests/ui + 截图（desktop 750×1334 + mobile 档） |
| 平台/广告 | tests/reward 相关 + 真机/微信开发者工具预览截图 + IAA 文案契约核对 |
| 卡牌战斗 | tests/v59o + 固定种子对照 |
| Orchestrator/工具链 | `tsc -p tools/orchestrator/tsconfig.json --noEmit` + `ai:status` 只读检查 |

## 4. UI 截图验收

- 结构参照 `ai/reports/v10-ultimate/screenshots/`（desktop 01-boot → 18-restart 场景序列；mobile-360x640 → 430x932 五档）+ `docs/QA/screenshots/`（按任务命名）。
- 截图必须来自**实际运行**（Cocos 预览或 H5/Electron 构建），禁止用设计稿/PS 冒充。
- 验收口径见 docs/UI-SCREEN-ACCEPTANCE.md；奖励/弹窗状态核对 docs/REWARD-UX-STATE.md 与 UI-STATE-MATRIX.md。

## 5. 交付验收流程（对应 README §3 流程）

1. Developer 跑完 §3 矩阵，输出 Developer Result（含命令与结果原文）；
2. Reviewer 只读复核（代码/架构/性能/安全），BLOCKER/HIGH 必须整改，默认 3 轮，超出 ESCALATED；
3. 提交前 `git status` 核对：不夹带任务外文件（并行会话期间尤其要逐 hunk 甄别）；
4. 文档同步：CHANGELOG / SKILL_USAGE_LOG / 相关 GUIDELINES 更新后一起提交。
