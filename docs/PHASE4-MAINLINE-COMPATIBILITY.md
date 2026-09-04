# Phase4 主线兼容性（固定远程快照）

比较基准：候选分支 BASE `b170ddd5ddfe79bfd12ce37a09e5bc0319e1c5c8`；远程 `origin/ai-automation-bootstrap` = `30bb6dc7ffd41ad1ec1d10c96aeac89d37d99b17`（2026-09-04 fetch）。共同祖先 `b9a1eb77e33424f39545baa1b05e1a4179025fd8`。未读取 Cursor 未提交工作作为远程事实，未 merge。

分析交付 PASS ≠ 可直接启用全部候选。以下标明阻断项；本报告不宣称主线新接口已经完成。

## 差异证据与接入责任

| 项目 | 固定主线事实 / 候选差异 | 分类 | 接入动作 / owner |
|---|---|---|---|
| Config 字段 | `model/config-types.ts`、源 events/achievements/daily/career/economy JSON 与分叉基线相同；候选有 schemaVersion/status/runtimeEnabled、展示字段 | ADAPTER_REQUIRED | Cursor 显式白名单投影，拒绝直接替换 ConfigService 输入 |
| GameEvents | `core/game-events.ts` 使用 camelCase：mergeCompleted、salaryChanged、promotionChanged 等；`MergeCompletedEvent.second` 是 target | COMPATIBLE | 事件到动画映射按 payload；禁止套用 WORKER_MERGED 等示例名 |
| Achievement event | `achievement-service.ts` 实际 emit `AchievementUnlocked`，声明却是 `achievementUnlocked`；Record 索引使静态检查未阻止 | MAINLINE_CHANGE_REQUIRED | Cursor 统一大小写/兼容桥并测试一次订阅；本分支不修 Service |
| ViewModel | `ui/phase2/view-models.ts` 只有 Career/Promotion/Event 三类 builder；Phase4 的 MainHUD/Board/Offline/Achievement/Daily 等是拟议 projection | ADAPTER_REQUIRED | 从同一 GameContext/未来 Snapshot 投影；不新建 Context，不把 doc interface 当已存在 export |
| Achievement 字段 | 源含 category；候选 displayCategory、hidden、sourceId、integrationStatus，30 个条件/奖励保留 | ADAPTER_REQUIRED | 用 sourceId 保留源 category，展示分组独立；锁定前脱敏 |
| 新 FISH_30M | player 有 fishingSeconds；AchievementConditionType 无 FISH_SECONDS 分支 | MAINLINE_CHANGE_REQUIRED | 能力未补齐前隔离此条；不映射成 WORK_SECONDS |
| Daily | 源6个；候选12模板，同类型多个变体；generateTasks 全量生成，findTaskByType 只找到首条；getProgress 会 refresh | MAINLINE_CHANGE_REQUIRED | 新的随机选择/纯 Snapshot/跨日事务由 Cursor 实现；禁用候选池 |
| Event Effect | `model/game-effect.ts` 是 salary/performance/cultivation/mind；cultivation 写入 player.cultivationExp | COMPATIBLE | 显示实际差值，不将 cultivationExp 当 effect key；负事件允许负 delta |
| Career 等级命名 | career1..10 是练气职员/筑基职员/金丹主管/元婴主管/化神经理/炼虚经理/合体总监/大乘总监/渡劫副总/飞升董事；worker1..6 另有名称 | ADAPTER_REQUIRED | 10职业皮肤按career，不替换6worker等级；4境界图标不足覆盖10realm，后6用通用框+真实文字 |
| Office | 源5office等级，候选7背景视觉阶段 | CONTENT_CHANGE_REQUIRED | 5..7视觉款只能皮肤选择，不扩展officeLevel；初版映射按OFFICE-SCENE-GUIDE |
| Number Format | 没有公共数字 formatter；WorkerView.format 仅生成角色标签 | MAINLINE_CHANGE_REQUIRED | Cursor 实现 NUMBER-FORMAT 契约；精确值与短值分开，禁止把缩写反解析为业务数值 |
| SafeArea | PlatformSystemInfo 仅platform/language/screenWidth/screenHeight，没有safeArea/capsule；默认宽高720×1280 | MAINLINE_CHANGE_REQUIRED | 平台适配提供真实安全矩形，统一转换一次；静态默认不算真机适配 |
| Reward Type | 七项 MIND_RECOVERY/OFFLINE_DOUBLE/PROMOTION_RETRY/EVENT_REROLL/WORK_BOOST/AUTO_MERGE/INSTANT_RECRUIT 完全一致 | COMPATIBLE | 名称可映射；枚举存在不等于可发奖交易/广告SDK就绪 |
| Reward 状态 | RewardResult只有granted/cancelled/failed；无UI loading/playing、持久事务requestId | ADAPTER_REQUIRED | UI状态桥+超时释放+幂等结果，由未来Facade持有；离线1x/2x互斥 |
| 不看广告可成长 | PromotionService失败后retryRequired阻断再尝试，requestRetry只走RewardProvider；没有正常等待/资源重试分支 | MAINLINE_CHANGE_REQUIRED | 与“不看广告也能玩”目标不完全一致；Cursor需明确非广告重试政策并实现，本轮不绕过或重建Session清锁 |
| Audio IDs | 固定主线无AudioService/事件ID注册；候选25cue是生产命名 | MAINLINE_CHANGE_REQUIRED | Audio adapter注册cue，缺资源静默；salary合并，禁用逐worker音效 |
| Settings | 无SettingsService或持久设置API；候选BGM/SFX/reducedMotion是UX规范 | MAINLINE_CHANGE_REQUIRED | Cursor独立设置存储/能力投影；不污染GameSaveData |
| 生命周期 | Platform onShow/onHide 无off返回值，Prefab反复bind不能安全撤销平台回调 | MAINLINE_CHANGE_REQUIRED | 顶层Session单订阅、可销毁桥；子Prefab不能各自绑定平台 |
| 内容质量遗留 | AFTERNOON_TEA 文案写“回满”但+12；SUDDEN_TEAM_BUILDING某选项支配另一项 | CONTENT_CHANGE_REQUIRED | 接入前由主线/产品独立修正文案与平衡，保留原始候选用于溯源 |
| 生产启用 | 以上能力及Editor/真机未验收 | BLOCKED | 仅候选与预览可交付；不得自动加载 |

## 远程新增代码审阅范围

与共同祖先相比，远程仅5个路径发生变化：career-event-service 在事件完成后调用 notifyEventType；game-loop-service 每tick refresh每日任务；BALANCE-V1及两份simulation/integration测试更新。事件通知修复不等于大小写修复；日刷新不等于随机池能力。完整树通过 `git ls-tree -r origin/ai-automation-bootstrap` 检查，未发现背景描述中的新 Facade/Settings/Audio 文件。

## 合并/启用顺序

1. 可先合文档、schema、校验工具、生产清单，仍禁用runtime。
2. Cursor完成兼容表能力并更新精确SHA；重新生成预览，人工裁决source/condition冲突。
3. 接入纯projection、资源解析及身份脱敏；独立运行Editor/真机清单。
4. 由产品验收允许候选激活；本分支没有此激活动作。
