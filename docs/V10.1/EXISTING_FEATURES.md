# V10.1 现有功能清单（EXISTING_FEATURES）

> 生成：2026-11-19 · 来源：全库代码盘点 + ai/reports/v10-qa 实测证据 · 分类口径：A=已完成且正常 / B=已完成但有缺陷 / C=部分完成 / D=尚未开发 / E=暂不需要

## 1. 主界面与壳层 — A
- 五区域主页（今日工作/修仙目标/建议行动/玩法入口/生活行为）+ 11 屏概念图（阅历/战斗/养成/挑战/任务/项目/人际/设置等）
- 启动 9 门 boot gate（electronReady→battleReady）全过；快捷入口（飞剑/任务/项目/人际/背包/设置）
- 弹窗仲裁器（S1 事故 > 待决策 > 欢迎简报 > 晋升/教程 > 职场事件 > 日结算）

## 2. 职场系统 — B（职级 10 级，非任务书 20 级）
- CareerService（query/canPromote/promote）+ CompanyService（民企/外企/国企/大厂宗 runtime 差异）
- KpiService（需求/进度/记录）、PromotionService（渡劫式答辩/失败重试 promoteGuaranteed）、OfficeService（5 工位）
- 工资结算：WorkService tick 计时 + V2SettlementService 日报；小数沉淀 salaryRemainder/performanceRemainder
- 配置：career.json 10 级（实习牛马→区域副总监）；progression.json 10 级且后 4 级名称重复
- **缺口：20 级职级不存在**（BACKLOG P1）

## 3. 摸鱼系统 — C（工作模式分支，非独立系统）
- WorkMode FISHING：工资×0.6、修为×1.1、道心+40/h、30 分钟心魔-1；带薪摸鱼收入沉淀进日报
- 挂钩：摸鱼大师天赋、FISH_30M 成就、daily.fish-3-min、称号
- **缺口：无摸鱼专属事件池/小游戏/独立冷却**（BACKLOG P2）

## 4. 修仙系统 — C（点击修炼完整，境界/灵根缺失）
- CultivationService：cultivate() 点击修炼（+5 经验/3s 冷却）、心神效率 0.2~1.0、暴击/连击窗口、applyIdleExperience
- 功法：8 个功法 + 3 装备槽（v2-item-service）；丹药 12 消耗品 + 9 炼制配方（craft-service）
- 法宝/装备：v2 items equipment 60 件（职场线）+ v64 战斗装备独立线（4 槽/强化/升星/羁绊）
- **缺口：境界无独立数据结构（突破=晋升皮肤）；灵根仅人物创建文案**（BACKLOG P1/P3）

## 5. NPC 系统 — B（数据完备，呈现增强中）
- 8 位 NPC（BOSS/PRODUCT/TESTER/JUNIOR/VETERAN/HR/OPS/CLIENT）+ 五档关系（敌视→信任）+ 好感度 -100~100 clamp
- 关系驱动增益 6 项：晋升答辩%/HR 洞察%/Bug 权重×/负面事件×/材料掉落×/道心损耗×（本轮新增可视化）
- NpcMemoryService：NPC 记忆（remember/countOf/assistChance）+ 记忆卡 UI（本轮修复死代码后可用）
- 周末活动（4 选 1）、AI NPC 桥（MNN-0.3B + 规则降级，桌面端）、飞剑传书消息链
- **本轮新增：queryNpcBuffs() + 人际页增益卡片（6 行实时数值）**

## 6. 随机事件 — A
- 职场事件池恰好 30 个（career-events.json，EVENT_*，带 choices）；V2 事件引擎 141 事件（链事件 ≥3 阶段）
- CareerEventScheduler（新手安静期/defer）；效果走统一 Effect Engine；content:check 校验唯一性/引用/权重

## 7. 任务/成就/图鉴 — A
- 每日任务 6（daily-task-service）、主任务（task-service）、v56 目标运行时、7 日签到、周结算
- 成就 105 条（achievements.json）+ v64 成就 + 加班成就；图鉴 CodexService（怪物/装备/事件 3 tab）

## 8. 战斗系统 — A
- 自动战斗 v63（1427 行）：推关/点击伤害/招募四职业/通天塔/宝箱/主动技能 4/倍速
- 卡牌 Boss 战 v59o：5 波（普通→精英→Boss）、3 能量/回合、职业卡池 15 卡、奖励三选一、Boss 机制 10 种
- v64：Boss 特性/敌人类型/败因建议/战力分/留存（每日目标/七日成长）
- 卡组管理：净化/移除（V10.1）+ 卡组预设（V10.2，并行会话开发中）

## 9. 离线收益 — A
- 三重防重（isSettled + claimedDoubleSettlementIds + claimingSettlementId）+ 异步回调后二次校验 + 事务回滚
- 离线时段切分（WORK/LUNCH/AFTER_HOURS/RECOVERY/WEEKEND，UTC+8）；8 小时封顶
- 欢迎简报（托管策略/决策会话/战斗侧离线结算 idempotent）
- **本轮新增：广告 ×2 入口接线（金色按钮 + 取消不发放 + 失败回落普通领取）**

## 10. 存档 — A（v1）/ D（V2 接线）
- SaveService v15 版迁移（migrate 白名单清洗）；LocalStorage/Electron IPC/桌面文件原子写（temp→validate→replace→backup）
- 生命周期 onHide/onShow/pagehide 全保存；clock 异常 CLOCK_ANOMALY 防护
- SaveServiceV2（backup/restore）未接线（无生产消费者，接入前须改 fail-closed）

## 11. 广告系统 — B（代码完备，真机未验证）
- RewardedAdService（canShow/show/showSync/cancel + 6 placement）+ RewardAdPolicy 频控（10 次/日、60s 间隔、取消冷却 30s）
- Provider：Mock / WechatRewardedVideoHost（wx.createRewardedVideoAd）/ DouyinRewardedVideoHost（tt）
- 幂等：callbackFired + isEnded/isComplete 校验；本轮接通离线双倍 UI 入口
- **缺口：真机验证（无开发者环境）；抖音无配置文件**

## 12. 音频 — C（合成音效兜底，BGM 资源缺）
- WebAudio 合成音效引擎（14 事件映射，ui-sfx.js）；AudioService/后端接口完备
- **缺口：assets/audio 仅 .gitkeep；BGM 未落地**

## 13. 性能 — A（实测达标）
- 57+ FPS（430×932 移动视口）/ 堆 35→42MB 无泄漏曲线 / DOM 374 节点 30 分钟零泄漏
- 本轮 60 分钟 soak 复测：见 docs/QA/V10.1_REPORT 引用

## 14. 测试基建 — A
- 178+ *.test.ts 全量回归；content:check 内容完整性；CDP 真实浏览器探针体系（9 个）
- 本轮新增探针：ad-wiring-probe（10 阶段）、equip-reco-probe（4 阶段）
