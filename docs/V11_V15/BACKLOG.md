# V11–V15 待办清单（BACKLOG）

> 按优先级与**阻塞状态**排序。BLOCKED-WIP = 需等待用户未提交 WIP（save-service.ts / cultivation-service.ts / tests/daily）提交后才能动，避免并行编辑冲突。

## 立即可做（不触 WIP 文件）

| # | 切片 | 任务书依据 | 说明 | 状态 |
|---|---|---|---|---|
| S1 | 排行榜深化：四榜 + Provider 抽象 + 确定性 + 测试 | §17 | service 重构 + UI 榜单切换 + 本地模拟标记 | 进行中 |
| S2 | 炼丹深化：成功率 + 品质（即时结算版） | §11 | craft.json 品质/成功率字段 + service RNG 结算 + UI 展示 + 测试；零存档变更 | 待做 |
| S3 | 音效接线扩展 | §20 | audio-plan PLANNED ID 按事件实际接线（animation-trigger-map / service 调用点）+ 测试 | 待做 |
| S4 | 成就扩展（摸鱼/炼丹/社交/经济系列） | §7/§14 | achievements.json 内容 + 触发条件核对 + 测试 | 待做 |
| S5 | 每日签到 / 连续登录奖励 | §19 | 复用 daily 基建；如需存档字段→转 BLOCKED-WIP | 待评估 |
| S6 | BUG-003（P2）桌面欢迎弹窗时段性抑制 | FINAL_QA | 根因未定位；A/B 已证明非代码回归；深夜复现窗口难——时间盒探索 | 待做 |

## BLOCKED-WIP（等用户提交 save/cultivation 修复后）

| # | 切片 | 任务书依据 | 阻塞原因 | 前置 |
|---|---|---|---|---|
| B1 | **境界独立系统 + 突破玩法** | §8（核心） | 需 save 字段（境界/突破材料/状态）→ save-service.ts migrate + save-data + 全量迁移测试 | WIP 提交 |
| B2 | 天赋五路线体系（点数/等级/重置/组合） | §5 | 需 save 字段（已选天赋集/天赋点） | WIP 提交 |
| B3 | 炼丹二期：炼丹时间 + 丹药库存 + 使用 | §11 | 需 save 字段（pendingCrafts / pillInventory） | WIP 提交 |
| B4 | SaveServiceV2 接线（备份/校验） | §23 | 独立任务（SAVE_SYSTEM §4 四条件）；改 save-service.ts | WIP 提交 |
| B5 | 装备强化/精炼/升星扩展 | §10 | v64 equipment 已有强化(MAX 10)；扩展需评估存档影响 | 评估后 |

## 环境阻塞（如实备案，不虚构完成）

| # | 项 | 阻塞 |
|---|---|---|
| E1 | 微信真机激励视频验证 | 需 AppID + 真机（FINAL_QA BLOCKED B-1） |
| E2 | 微信主包 4MB 分包方案 | 需产品确认（B-3） |
| E3 | BGM 真实素材 | 采购缺失；程序化合成垫已兜底 |
| E4 | 刘海屏真机安全区实测 | 无真机 |

## 产品决策项

| # | 项 | 说明 |
|---|---|---|
| P1 | BUG-ECO-1：L10→L11 停滞 ≈336 天 | 需策划确认是否下调 10–19 级出勤目标（影响 career.json 数值） |
| P2 | 设计分辨率口径（720×1280 vs 750×1334） | GAMEDEV_SKILLS DECISION_LOG D-011 OPEN |

## 本轮新增（V11 验收发现）

| # | 项 | 说明 | 状态 |
|---|---|---|---|
| F1 | ~~MORE 导航死入口~~ | ~~成就/设置/图鉴等 8 页不可达~~ | ✅ 已修复（NAV_TABS 恢复第六项） |
| F2 | ~~设置面三源并存~~ | overlay `_settings` 已统一读自/写回 `context.settings`（持久化单源，探针 A7 实测翻转+持久化）；canvas AudioService 立即生效仍走下次启动应用 | ✅ 已修复（即时生效差异见 DEVELOPMENT_LOG F2 节） |
| F3 | canvas 榜单切换视觉验证 | RefreshButton 绑定已实现+单测，缺 canvas 截图证据（坐标点击脆弱） | P3 |
| F4 | overlay Emoji 图标 | 更多菜单/成就图标用 Emoji（任务书§16 禁作正式图标） | P3，需美术资产（E3 同源） |
| F8 | gameplay-v2 暴击 RNG 修复未合入 | 78115a0（CultivationService rng 注入，修测试确定性）——cultivation-service 属用户 WIP，提交后评估 cherry-pick | 待 WIP 提交 |
| F9 | 事件池 42 事件 | 30 权威 + 7 摸鱼（FISHING 门控）+ 5 修仙/奇遇；扩展=纯内容+校验，引擎零改动 | ✅ F5/F7 完成 |
| F10 | 图集化落地 | SPRITE-ATLAS-PLAN 规划未执行（0 .plist；首屏 PNG 2.76MB 最大单项） | P2 性能优化任务 |
| F11 | 浸泡基建 | scripts/v11-qa/soak-60m.cjs（30s 采样+动作注入+gap 检测）+ serve-build.cjs 入册 | ✅ 工具产出 |
