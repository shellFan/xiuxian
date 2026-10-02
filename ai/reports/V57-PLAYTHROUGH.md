# V5.7 Playthrough — 真实运行时实录

- 基线：`9dec502991e5082683b6004463e78e42998b7cfb`（gameplay-v2）
- 运行环境：Electron 28 + 本地 HTTP（game-server.cjs）+ 真实 GameFacade/GameLoop；非 mock、非静态图。
- 证据目录：`ai/reports/screenshots/v5.7/`（28 张，SHA-256 全唯一）；`ai/reports/V57-BALANCE-SIM.md`（15 次自动化长线会话）。

## Playthrough A — Java 后端 · 完整首日（真实 Electron）

入口：新档 → 职业选择首屏 → 选【Java后端·代码剑修】。

| 阶段 | 实际发生 | 证据 |
|------|----------|------|
| 09:00 开工 | 每日计划生成（职业任务池：修复线上OOM告警/慢SQL治理专项/核心接口压测调优…），Today Capacity 显示预计下班 | 26-fatigue.png（容量/疲劳/情境 chip）、28-day2-hook.png（明日预告） |
| 09:05 第一周剧情 | 领导私聊开场白（fw57_w1m_intro，幂等投递） | 17-monday-story.png |
| 14:00 项目攻坚 | 打开 Build 选择（本职业 6 流派：JVM调优流/Java并发流/数据库流/Redis缓存流/Spring生态流/摸鱼流），选 JVM流开战 | 05-java-build.png |
| 战斗中 | 升级三选一 → GC大法升至 Lv3 触发**进化二选一**：并行GC（波及全场）vs 低延迟GC（间隔-15%） | 07-skill-evolution.png |
| 道法共鸣 | GC大法+线程池诀 → 【零停顿领域】激活（战斗页 chip + 职业页共鸣列表） | 08-synergy-active.png、01-java-backend-profession.png |
| Boss | OOM魔尊：SUMMON（召唤线程泄漏怪）+ HP_DRAIN（吞噬最大生命）双机制，⚠️ Telegraph 预警先行 | 09-java-boss.png、11-boss-warning.png |
| 掉落 | Boss 专属【堆外内存护符】仙品掉落卡片：属性 + 对比 delta（绿升红降）+ 套装 JVM调优套 + 轻量保底计数（8 次必掉） | 12-boss-loot.png、13-equipment-compare.png |
| 日结算 | 下班疲劳恢复（OFF_WORK）、准点下班计数、明日钩子 | 22-weekly-settlement.png（周报结构） |

## Playthrough B — 前端 · 半日 + 项目 Boss

- 切换【前端开发·界面符修】视角：Build 弹窗只出前端流（响应式/CSS阵法/浏览器兼容/性能优化/Node工具链/摸鱼），Java 流不出现 —— 职业分家真实生效（06-frontend-build.png）。
- 白屏天魔战：BLIND（白屏失明）+ SUMMON（CSS错位怪）双机制 + 预警（10-frontend-boss.png）。
- 专属掉落【SourceMap天书】（13-equipment-compare.png），与 OOM 线掉落互不重复（每 Boss 独占 1 件，共 19 Boss/19 专属）。

## Playthrough C — QA / DevOps 抽查

- 自动化侧：`tests/v57/systems.test.ts` 以 FakeClock 跑通 QA/DevOps 职业任务池、事件投递、周目标进度；`tests/v57/profession-depth.test.ts` 校验四职业怪池独有比例 ≥70%、Build 零共用、进化 8/职业、共鸣 6/职业。
- 手工抽查：职业页四职业分别渲染称号路线（01~04 截图，称号 Lv1→Lv10 七档各不相同）。

## First Week（加速 7 天，自动化）

`tests/v57/first-week-story.test.ts`（真实服务 + FakeClock）：
- 周一 09:05 intro → 周二 10:12 求助 → 周三 10:42 需求变更（证据链）→ 周四 10:52 事故+复盘 → 周五 17:52 老板正在输入 → 周六 12:01 召回 → 全部幂等（重放不重复投递）。
- 周日 10:00 `weekSettlementReady` → 牛马周报（22-weekly-settlement.png）+ 明日钩子（queryTomorrowHook）。
- 周目标：周一掷 3 条 → 记录进度 → 全部完成领取（职业经验奖励），重复领取被拒。

## 长线会话（平衡模拟，5 人格 × 7/30/60 天）

`tools/v57-balance-sim.cjs`：真实 GameFacade+GameLoop，人格驱动回复/工时/加班/战斗/领任务。15 组会话无一例外（exceptions=0）、消息不堆积（pendMax≤3）、疲劳不卡 100（fat100=0）、道心在摸鱼/平衡人格下保持健康（mindMin 85+）。详见 V57-BALANCE-SIM.md。

## 评分（0~10，按 §160）

| 维度 | 分 | 依据 |
|------|----|------|
| 第一印象 | 8 | 新档即职业选择+首日剧情，无空白/卡死 |
| 目标感 | 8 | NOW/TODAY/WEEK/LONG 四层目标 + 明日钩子 |
| 任务乐趣 | 7 | 职业任务池 26/职业，运行时事件打断 |
| 职业差异 | 9 | 怪池独有≥70%、Build 零共用、技能/被动/称号全分家 |
| Build深度 | 8 | 24 Build + 32 进化二选一 + 26 共鸣 |
| 战斗反馈 | 8 | 三栏+浮动伤害+Build/共鸣/进化 chips |
| Boss机制 | 8 | 19 Boss × ≥2 机制 + Telegraph + 专属掉落+保底 |
| 掉落期待 | 8 | 80 装备/44 词缀/12 套装/品质/Compare |
| NPC记忆 | 7 | 记恩记仇影响协助概率，卡片展示 |
| 职场真实感 | 8 | 104 职业事件，文案来自真实职场语境 |
| 幽默 | 7 | 段子来自真实（"我本地是好的"） |
| 第一周剧情 | 8 | Mon-Sun 节拍 + 动态钩子 |
| 日结算满足感 | 7 | 周/日报表 + 称号 |
| 长期成长 | 7 | 职业等级 10 级 perk 线 |
| 再玩一天欲望 | 8 | 每日钩子 + 周预告 + Boss保底刷+ Build 多流派 |

结论：全部维度 ≥7，"再玩一天欲望" = 8 ≥ 8（§161 达标）。

## MANUAL_REQUIRED（本轮无）

28/28 截图全部捕获（上一轮 V5.6 的 08/11/17 遗留项本轮全部落地）。
