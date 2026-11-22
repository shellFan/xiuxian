# 基线审计（BASELINE_AUDIT）

> 审计日期：2026-11-23 · 基线：feature/v10-final-release @ `3b0866c`（与远程同步，实测）
> 用户 WIP：save-service.ts / cultivation-service.ts / tests/daily / ai-reports（未提交，保护中）

## 系统完成度矩阵（以代码为准）

| 系统 | 状态 | 证据 |
|---|---|---|
| 职场 20 级/KPI/晋升答辩 | ✅ 完整 | career.json 20 级 + promotion 三题答辩 + tests/career/kpi/promotion |
| 工作模式（工作/摸鱼/修炼/社交） | ✅ 完整 | work-service 四模式乘子+心魔联动 |
| 摸鱼场景化 | ✅ 完整（V11-F5） | 7 个 FISHING 门控事件 + 摸鱼成就 4 + FISH_SECONDS 条件 |
| 随机事件（统一管理器） | ✅ 完整（V11-F5 接线） | EventRuntimeAdapter 生产接线 + 42 事件 + 冷却/彩票/资格 |
| **独立境界+渡劫** | ✅ 完整（V12-R1 派生式） | realm.json 30 层/9 门 + RealmService + overlay 境界卡 + REALM 成就 5 |
| **五路线天赋** | ✅ 完整（V12-R2 派生式） | talent-tree.json 50 节点 + TalentTreeService + overlay 页 + 7 载体 |
| **炼丹队列** | ✅ 完整（V12-R3） | 时长/丹炉 3 炉/离线完成/防重领 + overlay 丹炉卡 |
| 炼丹成功率/品质 | ✅ 完整（V11-S2） | 9 配方成功率+四档品质+事务回滚 |
| 排行榜 | ✅ 完整（V11-S1） | 四榜+Provider 抽象+确定性+UI 切换 |
| 音频/设置 | ✅ 完整（V11-S3/F2） | SettingsService 持久化+真实开关+双面统一 |
| 成就 | ✅ 完整 | 120 个（含 CRAFT/FISH/REALM 系列） |
| 离线收益/防重 | ✅ 完整 | 分段+封顶+exactly-once+时钟回拨检测 |
| 存档 | ✅ v15 fail-closed | 单 key+迁移白名单；V12 全程零 schema 变更 |
| 卡牌战斗 | ✅ 完整 | v59o 引擎（种子 RNG/Boss 机制/自动推关） |
| NPC/传书/剧情 | ✅ 完整 | messenger 9 actors/211 events + StoryDirector + 好感/记忆 |
| 商店 | 🟡 部分 | craft/v2-items 消耗在位；**统一商店页缺失** |
| 装备 | 🟡 部分 | v64 强化 MAX10+3 槽+推荐；精炼/升星/套装缺（存档评估） |
| 天赋存档持久化 | 🟡 部分 | 派生式 lifetimeKeys 在位；v16 结构化迁移待 WIP |
| 图鉴（codex） | 🟡 部分 | overlay 页在位；Cocos 侧缺组件 |
| 背包 | 🟡 部分 | v2-items 在位；统一背包页入口浅 |
| NPC 行为模拟 | ⬜ 未开始 | 轻量状态机设计待做 |
| 主线章节剧情 | ⬜ 未开始 | StoryDirector 章节化为内容任务 |
| 秘境/副本 | ⬜ 未开始 | 卡牌战斗可承载，方案待 ADR |
| 称号系统 | 🟡 部分 | 周称号在位；长期称号体系缺 |
| 正式图标 | ⬜ Emoji 占位 | overlay/成就图标 Emoji（V31 本轮目标） |
| 图集化 | ⬜ 未开始 | 0 .plist；首屏 PNG 2.76MB |
| 微信真机 | ⛔ BLOCKED | 无 AppID/真机 |

## 视觉/UI 问题清单

| # | 问题 | 位置 |
|---|---|---|
| V-1 | Emoji 图标占位（更多菜单/成就/设置行） | ui-overlay.js |
| V-2 | 首页信息密度：可做什么/下一步目标展示弱 | overlay home |
| V-3 | 品质边框无差异化（普通/良品/上品/极品同框） | overlay craft |
| V-4 | 空态覆盖不全（部分 canvas 页） | canvas pages |
| V-5 | 设计分辨率口径冲突（720×1280 vs 750×1334） | D-011 OPEN |

## 测试不足

- UI 自动化仅覆盖 12 阶段探针；**移动视口扫描缺失**（本轮 F-MOBILE 补）
- 20 轮多画像模拟未跑（v58 六人格基建在位）
- E2E 深度旅程 30 条目标：现有 18 屏旅程+12 阶段探针，需扩展

## 性能隐患

- 首屏 PNG 2.76MB（最大单项，图集化待做 F10）
- overlay 每次 fullRefresh 重渲染大 DOM（现量级可接受）
