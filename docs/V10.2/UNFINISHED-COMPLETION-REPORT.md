# 《牛马修仙传》未完成修复与功能补全报告（V10.2）

- 基线：HEAD `b792ad3`，分支 `feature/v10-final-release`
- 性质：补全 QA 报告 §H 遗留、V10.1/V10.2 缺陷清单未修项、以及 v10.1 FINAL 声明的未完成功能
- 交付方式：全部改动留在工作树**未提交**（项目规则 `AI_AUTO_COMMIT=false`），待用户/Reviewer 审阅
- 回归证据：`tests/run-all.cjs` **184 个测试文件 EXIT=0**；`scripts/check-v2-content.cjs` PASS；桌面 4 个 JS `node --check` PASS；`ad-wiring-probe` RESULT PASS

---

## 一、已完成的缺陷修复

| # | 来源 | 问题 | 处理 | 关键文件 | 验证 |
|---|---|---|---|---|---|
| 1 | v10.1/v102 DEF-012 (P2) | 创建向导「保存昵称与形象」后不自动前进 | save-identity 成功后尝试 `characterCreationAdvance()`（昵称/形象/出身三要素齐备才前进，服务层校验兜底） | `desktop/ui-overlay.js` | 既有 Electron DOM 创建流测试 PASS |
| 2 | v10.1/v102 DEF-009 (LOW) | 新角色修为「0 / 0」进度恒满 | 三处显示位（首页 hero / 修仙页 / 首页大数字）：`requiredExp=0`（职级 1 无修为门槛）不渲染进度条，文案改显境界（如「修为 0 · 炼气一层」） | `desktop/ui-overlay.js` | 语法检查 + DOM 测试 PASS |
| 3 | PHASE4-MAINLINE COMPATIBILITY | AFTERNOON_TEA 文案「道心回满」但实际 mind+12 | 描述改为「道心大幅回暖」 | `assets/configs/career-events.json` | content check PASS |
| 4 | 同上 | SUDDEN_TEAM_BUILDING JOIN(mind+8,perf+3) 严格支配 SLACK(mind+3,perf−2) | SLACK 改为「摸鱼划水，趁乱偷偷打坐」：mind+3 / perf−2 / **cultivation+6**——两选项互不支配（社交向 vs 修为向） | `assets/configs/career-events.json` | content check PASS |
| 5 | V10 QA §H-1（QA-BUG-012/L-1） | SaveServiceV2 load 双损坏时 fail-open 静默回新档 | 改 **fail-closed**：主+备份档都存在但不可读时 `markFailClosed()` + 抛 `SaveLoadError`；两键全无（全新玩家）才允许默认档 | `assets/scripts/services/save-service-v2.ts` | `save-stress.test.ts` 改为 fail-closed 契约 + 新增 fresh-player 测试，7/7 PASS |
| 6 | v10-qa/v10-ultimate L-1 | 9 个次级按钮触控目标 <32px | `.ux-btn--sm / .ux-card-more / .ux-agenda-btn / .ux64-goal-claim / .ux91-goal-claim` 加透明热区（`::after inset:-8px`），不改视觉 | `desktop/ui-overlay.css` | 语法 PASS |
| 7 | v102 FINAL LOW | 卡牌费用徽章遮挡卡名 | `.ux-bc-name` 下移让位（徽章为左上角外溢圆章） | `desktop/ui-overlay.css` | 语法 PASS |
| 8 | v2-event-service.ts:107 | 「占位：poll 时按 dayIndex 重置种子」 | **核实为设计实现**：poll 在 L156 `this.random.forDay(dayIndex, salt)` 按日重置，无缺陷，不改代码 | — | 代码核实 |
| 9 | view-model/desktop 命格文案 | 「摸鱼/背锅权重效果尚未接入」 | 效果**早已真实接线**（`work-service` REGULAR_WORK_OUTPUT、`v2-event-service` FISHING/BLAME_EVENT_WEIGHT、`responsibility-service` RESPONSIBILITY_SUCCESS_GROWTH），两处文案改为实际效果描述 | `character-creation-view-model.ts`、`desktop/ui-overlay.js` | `desktop-creation-ui.test.ts` 契约同步更新，Electron DOM 测试 PASS |

## 二、已完成的功能补全

| # | 来源 | 功能 | 实现口径 | 关键文件 | 验证 |
|---|---|---|---|---|---|
| 10 | docs/DAILY-TASK-POOL-V1（5 份文档一致声明未实现） | 每日任务随机池 | `selectDailyTaskSet()` 纯函数：能力门槛（满级无 PROMOTION、无 KPI 目标不入池）→ 枚举组合按预算筛（salary750/cultivation100/perf30/mind45，超预算跳过模板不缩奖励）→ FNV-1a(dayIndex) 确定性抽取 5 项；不足 5 项安全降级为全部合格项；同日重启不重抽；输出保持配置表顺序 | `daily-task-service.ts`（导出 `DAILY_POOL_SIZE/BUDGET`） | `daily-task-service.test.ts` 更新至池契约 + 新增确定性/预算降级/门槛/满级 4 测试 |
| 11 | IAA-DESIGN L15「持久限额、跨日规则未完成」 | 广告频控持久化 | `RewardedAdService` 新增 `storage` 选项：频控历史（24h、≤200 条）落 storage、构造时恢复（损坏/越界/非法 placement 丢弃），show/showSync/reset 后回写；`game-context` 注入 `this.storage`——页面重载不再重置冷却与小时上限 | `rewarded-ad-service.ts`、`game-context.ts` | 新增 `tests/ad/rewarded-ad-persistence.test.ts` 4 测试（冷却跨重载/小时上限跨重载/损坏忽略/非法条目丢弃） |
| 12 | v10.1 FINAL「未完成：卡组预设」 | 卡组预设 deck presets | 存档字段 `cardDeckPresetExcludes`（槽位'1'/'2'/'3' → 排除 defId 列表）+ `activeDeckPreset`（PlayerData sanitize + toSaveData + **save-service migrate 白名单**）；服务 `saveDeckPreset/activateDeckPreset/deckPresetsView`（守卫：战斗卡组 ≥5 张）；预设作用于**最终战斗卡组**（含基础模板卡）；facade 三方法；卡组页 UI：逐卡「✕ 排除/＋ 编入」草稿、三槽「存入/启用/停用」、图鉴收集进度按未过滤收藏统计 | `save-data.ts`、`player-data.ts`、`save-service.ts`、`card-battle-service.ts`、`battle-service.ts`、`game-facade.ts`、`ui-battle-card.js`、`ui-overlay.js`、`ui-overlay.css` | 新增 `tests/v59o/card-v10-2-features.test.ts`（保存/启用/停用真实过滤、未知 id 过滤、≥5 张守卫、存档清洗） |
| 13 | v10.1 FINAL「未完成：奖励替换 Transform」 | 卡牌奖励替换 | `CardRewardState.transformed`（可选字段，存档兼容）；`transformReward()`：未领取奖励重掷全部候选，**每场限一次**，消耗灵石 60（与升级/净化同属卡组灵石经济），battle rng 状态回写保持确定性回放；facade `transformBattleCardReward`；奖励弹窗「🔄 替换候选（💎60）」按钮（灵石不足 disabled） | `card-types.ts`、`card-battle-service.ts`、`battle-service.ts`、`game-facade.ts`、`ui-battle-card.js`、`ui-overlay.js` | 同上测试：重掷/扣费/二次抛错/替换后领取入收藏/灵石不足拒绝 |
| 14 | v10-ultimate「DAILY_REPORT AI 化下班总结未实现（模板层在位）」 | 日报 AI 化总结 | `DailySettlementView.aiSummary`：基于当日真实数据的拟人化生成（主修模式/入账/带薪摸鱼/职场破事/飞剑传书 + 心魔/评级/平凡日三分收尾口径），**dayIndex 确定性变体、无外部 AI 依赖**；`DaySummaryState` 持久化 `aiSummary/weekday/durations`（日报可回看）；结算弹窗注入「【AI 下班总结】」；结算页已结算日改为展示今日日报（`facade.queryDailyHistory()`），不再误导为「未到下班」 | `v2-settlement-service.ts`、`save-data.ts`、`game-facade.ts`、`ui-overlay-v2.js`、`ui-overlay.css` | 新增 `tests/v2/daily-report-ai-summary.test.ts` 4 测试（非空成文/同日确定性/持久化往返/存档 toSaveData 携带）；v4 first-day 回归 PASS |
| 15 | IAA-DESIGN L10「未实现则隐藏」 | Event Reroll 合规核验 | EVENT_REROLL 仅存在于 RewardType/BuffId 类型层；facade/GameContext/桌面 UI **均无运行时入口**——合规，未实现功能按设计保持隐藏；并写入回归断言防未来误暴露 | `tests/v2/daily-report-ai-summary.test.ts` | 断言通过 |

## 三、在途 V10.1 工作核验（本会话未改动，已验证完好）

- **QA-BUG-013 广告双倍领取接线**（工作树已有实现）：`ad-wiring-probe.cjs` 全阶段 RESULT PASS（fresh 守卫/双按钮/双倍领取/取消不发放并回落普通领取/桥保留）。
- **一键推荐装备 equipRecommended**（工作树已有实现：评分公式 + facade + 「✨ 一键推荐」按钮）：链路完整，`equip-reco-probe.cjs` 在 scripts/v10-qa-final/ 备用。
- 以上两项未提交，与本报告改动同在工作树。

## 四、测试变更说明（契约演进，非降低断言）

| 测试文件 | 变更 | 依据 |
|---|---|---|
| `tests/daily/daily-task-service.test.ts` | 6 任务全量 → 5 项随机池契约；新增确定性/预算/门槛/满级测试 | docs/DAILY-TASK-POOL-V1.md 明确「每天默认5项」为设计目标 |
| `tests/release/save-stress.test.ts` | 「双损坏 → 安全默认档」→「双损坏 → fail-closed 抛错 + 写保护」；新增 fresh-player 测试 | V10 QA §H-1 明确 fail-open 为缺陷、fail-closed 为整改方向 |
| `tests/v59/desktop-creation-ui.test.ts` | 命格文案断言从「尚未接入」改为实际效果描述 | 效果已接线（代码证据），原文案是陈旧缺陷 |

## 五、明确不做 / 阻塞清单（BLOCKED，需产品决策或外部环境）

1. **微信/抖音激励视频真机验证**——无开发者工具/真机；`platform.wechat.json` 保持 `enabled:false`（不得宣称正式兼容）。
2. **抖音构建 420s 超时**（v80/v90 D4 P1 OPEN）——构建窗口环境限制。
3. **微信主包 >4MB 未分包**（v80/v90 D5 OPEN）——需产品确认分包方案后再动。
4. **BGM 真实音乐资源缺失**（§H-6）——无音频素材，代码侧开关/偏好已在位。
5. **内容安全裁决 + CONTENT-RELEASE-CHECKLIST 人工勾选**——人工发布门流程，非代码。
6. **M-2 Boss 通关后关卡跃升节奏**（12→40）——待策划确认。
7. **行业/职业未开放**（FINANCE/MANUFACTURING、DBA/PRODUCT_OWNER locked）——需策划内容，非代码缺口；本次未擅自解锁。
8. **架构级遗留**：UI Presenter/Port 契约（UI-BINDING-CONTRACT）、ui-theme.json token 接入、i18n 机制启用、animation-trigger-map.json 双源、命格文案桌面/TS 双源——低优先级，发布前不做大架构迁移以免引入回归（双源风险已在本报告备案）。
9. **ZCode IAB webview 启动卡死**（DEF-003，环境特定，已有绕行方案）。
10. **验证债**：音效 14 事件人工听感、EXE 全灭补证、录像产出、UI-SCREEN-ACCEPTANCE 15 页×10 profile 视觉矩阵、360/375/414 视口逐一驱动、60 分钟人工试玩——需人工/环境。
11. **环境残留**：`pnpm-lock.yaml`/`pnpm-workspace.yaml`（QA 判为意外产物）与 **CHANGELOG 停更于 rc.1**——涉及删除文件/文档裁决，本次未动，待用户确认。

## 六、改动清单（相对 b792ad3，全部未提交）

- 生产代码 20 文件，约 +969/−77（含在途 V10.1 的 5 文件）
- 测试新增 3 个（13 用例）+ 更新 3 个
- 探针产物：`docs/QA/screenshots/*.png`（probe 重新生成）、`scripts/v10-final/cdp-runner.cjs`（export 追加，QA 会话产物）

## 七、复验命令

```bash
export ELECTRON_RUN_AS_NODE=1
NODE=desktop/node_modules/electron/dist/electron.exe
$NODE node_modules/typescript/lib/tsc.js -p tsconfig.game.json --outDir tests/.compiled --noEmit false
$NODE tests/run-all.cjs                       # 184 files, EXIT=0
$NODE scripts/check-v2-content.cjs            # CONTENT CHECK PASSED
$NODE scripts/v10-qa-final/ad-wiring-probe.cjs # RESULT PASS
```
