# V10.1 测试计划（QA_PLAN）

> 六层测试体系（任务书§14 口径）。执行证据：ai/reports/v10.1/ + docs/QA/。

## 层级与本轮执行状态

| 层 | 内容 | 本轮状态 |
|---|---|---|
| L1 静态检查 | tsc --noEmit ×3 复跑 EXIT=0；node --check 全部改动 JS | ✅ |
| L2 单元测试 | 全量 `npm test`（180+ 文件）EXIT=0 ×2（含新增 equip-recommend 9 用例 + npc-buffs 6 用例 + facade 集成 3 用例） | ✅ |
| L3 集成测试 | content:check / gameplay-v2:check（上轮 PASS 基线未动内容表）；Cocos 构建 + 拷贝 provenance 链 ×2 | ✅ |
| L4 UI 自动化 | ad-wiring-probe（10 阶段真实点击）PASS；equip-reco-probe（4 阶段）PASS；NPC 人际页探针 PASS | ✅ |
| L5 长时间运行 | 60 分钟 soak（harness：心跳/空白页/控制台错误/FPS/内存采样） | 🔄 后台执行中 |
| L6 实际试玩 | CDP 真实鼠标事件流：广告全链（领双倍/取消/回落）+ 推荐装备 + 有界旅程推关 12 关 181 taps | ✅（10 轮策略矩阵见下） |

## L6 试玩策略矩阵（任务书要求 10 轮）

V10 QA 基线已覆盖 6/6 深度旅程 + 四职业对比（上轮证据 docs/QA/V10_FULL_QA_REPORT §D）。
本轮针对 V10.1 改动面补充专项：

| 轮 | 策略 | 覆盖 | 结果 |
|---|---|---|---|
| 1 | 离线回归（2h 注入） | 广告双倍领取全链 | ✅ W2/W3 |
| 2 | 广告取消 | 不发放 + 简报重建 | ✅ W4-cancel |
| 3 | 取消后正常领取 | 回落路径 | ✅ W4-normal |
| 4 | 新档守卫 | 无结算不显广告按钮 | ✅ W1 |
| 5 | 空背包推荐 | 已是最优提示 + 不变式 | ✅ E3 |
| 6 | 推荐幂等 | 二次点击零变化 | ✅ E4 |
| 7 | 有界推关旅程 | 3 分钟 12 关真实点击 | ✅ E2 |
| 8 | NPC 页可达性 | 主页快捷 → 人际 | ✅ npc-verify |
| 9 | 增益数值正确性 | 默认中性 6 行 | ✅ npc-verify（+单测分支覆盖信任/敌视） |
| 10 | 深度旅程（55 关/四职业/Boss） | 上轮 V10 QA 证据沿用 | ✅（未动战斗核心） |

## 新增探针清单（本轮入库）

| 探针 | 覆盖 | 证据目录 |
|---|---|---|
| scripts/v10-qa-final/ad-wiring-probe.cjs | W1-W5 广告接线 | ai/reports/v10.1/ad-wiring/ |
| scripts/v10-qa-final/equip-reco-probe.cjs | E1-E4 推荐装备 | ai/reports/v10.1/equip-reco/ |
| tmp/npc-verify.cjs（一次性，逻辑已固化单测） | NPC 页 | docs/QA/screenshots/v101-npc-buffs.png |

## 环境限制（如实记录）
- 广告真机（微信/抖音）无法验证：无小游戏开发者环境
- 掉落→推荐换装 60 杀全链：需 Boss 三连卡牌战长旅程，本轮以单测+facade 集成+UI 存在性三层覆盖，深度旅程沿用上轮 J5 证据
- 音效人工听感：合成音映射在位，无人工试听环节
