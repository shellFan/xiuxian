# Phase4 主线兼容性（固定远程快照）

比较基准：候选分支 BASE `b170ddd5ddfe79bfd12ce37a09e5bc0319e1c5c8`；最终发布前远程 `origin/ai-automation-bootstrap` = `08173b404ce9dbf7b5d2264c98cfbc61844028ac`（2026-09-04再次fetch）。共同祖先 `b9a1eb77e33424f39545baa1b05e1a4179025fd8`。早期分析固定30bb6dc；本表已按随后出现的19个新文件更新。未读取 Cursor 未提交工作作为远程事实，未 merge。

分析交付 PASS ≠ 可直接启用全部候选。以下区分新增接口已存在、尚缺适配和未完成验收；不把文件存在等同于集成完成。

## 差异证据与接入责任

| 项目 | 固定主线事实 / 候选差异 | 分类 | 接入动作 / owner |
|---|---|---|---|
| Config 字段 | `model/config-types.ts`、源 events/achievements/daily/career/economy JSON 与分叉基线相同；候选有 schemaVersion/status/runtimeEnabled、展示字段 | ADAPTER_REQUIRED | Cursor 显式白名单投影，拒绝直接替换 ConfigService 输入 |
| GameEvents | `core/game-events.ts` 使用 camelCase：mergeCompleted、salaryChanged、promotionChanged 等；`MergeCompletedEvent.second` 是 target | COMPATIBLE | 事件到动画映射按 payload；禁止套用 WORKER_MERGED 等示例名 |
| Achievement event | `achievement-service.ts` 实际 emit `AchievementUnlocked`，声明却是 `achievementUnlocked`；Record 索引使静态检查未阻止 | MAINLINE_CHANGE_REQUIRED | Cursor 统一大小写/兼容桥并测试一次订阅；本分支不修 Service |
| ViewModel / Snapshot | 新增 `facade/game-facade.ts` 的 snapshot()/onUiEvent()；GameSnapshot已有资源、career、daily等，但board仅workerCount，无格子worker列表/KPI详情/待结算离线奖励；原三类VM未改 | ADAPTER_REQUIRED | 以同一个Facade Session投影，Cursor补缺失只读字段与命令；不能为补字段另建Context或从UI直写public context |
| Achievement 字段 | 源含 category；候选 displayCategory、hidden、sourceId、integrationStatus，30 个条件/奖励保留 | ADAPTER_REQUIRED | 用 sourceId 保留源 category，展示分组独立；锁定前脱敏 |
| 新 FISH_30M | player 有 fishingSeconds；AchievementConditionType 无 FISH_SECONDS 分支 | MAINLINE_CHANGE_REQUIRED | 能力未补齐前隔离此条；不映射成 WORK_SECONDS |
| Daily | 源6个；候选12模板，同类型多个变体；generateTasks 全量生成，findTaskByType 只找到首条；getProgress 会 refresh | MAINLINE_CHANGE_REQUIRED | 新的随机选择/纯 Snapshot/跨日事务由 Cursor 实现；禁用候选池 |
| Event Effect | `model/game-effect.ts` 是 salary/performance/cultivation/mind；cultivation 写入 player.cultivationExp | COMPATIBLE | 显示实际差值，不将 cultivationExp 当 effect key；负事件允许负 delta |
| Career 等级命名 | career1..10 是练气职员/筑基职员/金丹主管/元婴主管/化神经理/炼虚经理/合体总监/大乘总监/渡劫副总/飞升董事；worker1..6 另有名称 | ADAPTER_REQUIRED | 10职业皮肤按career，不替换6worker等级；4境界图标不足覆盖10realm，后6用通用框+真实文字 |
| Office | 源5office等级，候选7背景视觉阶段 | CONTENT_CHANGE_REQUIRED | 5..7视觉款只能皮肤选择，不扩展officeLevel；初版映射按OFFICE-SCENE-GUIDE |
| Number Format | 新增 `utils/number-formatter.ts`，formatNumber/Percent/Duration/Salary；默认中文万/亿、2位四舍五入、非法值0、工资¥，与候选K/M/B/T、1位截断、非法值—、灵石契约不同；en-US仅K/M/B | ADAPTER_REQUIRED | 产品/主线明确采用哪份规则，Cursor补策略/精确值/倒计时适配并跑NUMBER-FORMAT边界表；不能仅切en-US就宣称一致 |
| SafeArea | PlatformSystemInfo 仅platform/language/screenWidth/screenHeight，没有safeArea/capsule；默认宽高720×1280 | MAINLINE_CHANGE_REQUIRED | 平台适配提供真实安全矩形，统一转换一次；静态默认不算真机适配 |
| Reward Type | 七项 MIND_RECOVERY/OFFLINE_DOUBLE/PROMOTION_RETRY/EVENT_REROLL/WORK_BOOST/AUTO_MERGE/INSTANT_RECRUIT 完全一致 | COMPATIBLE | 名称可映射；枚举存在不等于可发奖交易/广告SDK就绪 |
| Reward 状态 | 新增 RewardService 为IDLE/REQUESTING/GRANTED/CANCELLED/FAILED，onStateChange与REWARD_REQUESTED/COMPLETED；result仍三态，无loading/playing/confirming细分、持久entity/requestId和每日额度 | ADAPTER_REQUIRED | REQUESTING不能被猜成playing；终态回调不等于奖励已入账，按业务snapshot确认；Cursor补事务身份/超时/限频/离线互斥，不能用reset当未知事务取消 |
| 不看广告可成长 | PromotionService失败后retryRequired阻断再尝试，requestRetry只走RewardProvider；没有正常等待/资源重试分支 | MAINLINE_CHANGE_REQUIRED | 与“不看广告也能玩”目标不完全一致；Cursor需明确非广告重试政策并实现，本轮不绕过或重建Session清锁 |
| Audio IDs | 新增 AudioService.playBgm/playSfx，AudioId=string，默认NullAudioBackend；没有25cue资源注册、salary合并/cooldown/voice限流/duck/fade实现 | ADAPTER_REQUIRED | 按manifest建立真实backend与注册表，设置显式传入服务；音频适配层落实频率/voice预算，Null后端不算实际音频验收 |
| Settings | 新增SettingsService(storage)，独立game-settings键；musicEnabled/sfxEnabled/performanceMode等持久化；无reducedMotion字段，Facade未装配此服务，persist吞掉异常 | ADAPTER_REQUIRED | BGM→musicEnabled/SFX→sfxEnabled；不能把performanceMode当reducedMotion；Cursor补独立字段、保存失败状态及与Audio/Facade的单实例桥 |
| 生命周期 | 新增PlatformLifecycle和Facade.destroy；onPause/Resume订阅可撤销，但onShow/onHide返回空操作，dispose仍未撤销底层平台回调 | MAINLINE_CHANGE_REQUIRED | 有封装不等于无泄漏；Cursor完成真实撤销/存活守卫与反复创建销毁测试，顶层Session单订阅，子Prefab不各自绑定平台 |
| 内容质量遗留 | AFTERNOON_TEA 文案写“回满”但+12；SUDDEN_TEAM_BUILDING某选项支配另一项 | CONTENT_CHANGE_REQUIRED | 接入前由主线/产品独立修正文案与平衡，保留原始候选用于溯源 |
| 生产启用 | 以上能力及Editor/真机未验收 | BLOCKED | 仅候选与预览可交付；不得自动加载 |

## 远程新增代码审阅范围

30bb6dc相对共同祖先的5路径：career-event-service事件完成后notifyEventType、game-loop-service每tick刷新每日任务、BALANCE-V1及两份测试。最终fetch又发现08173b4新增19路径：facade目录5文件；analytics/audio/config-validator/debug-protection/error-boundary/leak-protection/performance-guard、platform-lifecycle、reward-service/wechat-reward-provider-v2、save-service-v2、settings-service、number-formatter以及facade测试，共24条主线变化路径。无既有config/model/core/phase2 VM/PlatformService/Achievement/Daily/Promotion文件变化，因此表内这些旧能力缺口仍成立。

本次通过git show读取新Facade/Snapshot/UiEvent/PresentationEvent、Settings、Audio、NumberFormatter、PlatformLifecycle、RewardService实现；其余新增文件核对路径/所有权，不声称做过主线全量质量审查或运行其51测试。候选分支的43测试PASS不覆盖远程新代码。

## 新接口的接入门槛（由Cursor处理，本分支不修）

- `GameEvents`仍camelCase；新增`UiEventCategory`大写频道与`PresentationEvent`大写语义事件是不同层，不能直接替换animation-trigger-map的sourceKind。Facade没有发出PresentationEvent的实现；先保留domain映射，接入owner补一次性语义桥，merge目标取second/最终target。
- Facade.hasChanged()先调用snapshot()覆盖lastSnapshot，再比较同一对象；onAnyUiEvent只订阅调用时已有频道，局部wrapped未注册。静态实现显示不能依赖这两个捷径驱动全UI刷新，须主线修复并验证。新增Snapshot浅层冻结/比较不等于所有嵌套状态与同长度集合变化已覆盖。
- Facade桥接的PHASE2_REFRESH_EVENTS与追加列表有重复事件风险；合并动画/工资音应在主线去重后接入，不能按每次通知重复播放。
- Facade尚无招募/合成等完整命令出口，也未装配Settings/Audio/SaveV2；新建文件不是可替代现有composition root的验收证明。禁止UI创建第二套状态补接口。
- 字段、事件、格式与生命周期以上差异均须主线owner完成适配/测试后再启用候选；本次无任何主线代码写入。

## 合并/启用顺序

1. 可先合文档、schema、校验工具、生产清单，仍禁用runtime。
2. Cursor完成兼容表能力并更新精确SHA；重新生成预览，人工裁决source/condition冲突。
3. 接入纯projection、资源解析及身份脱敏；独立运行Editor/真机清单。
4. 由产品验收允许候选激活；本分支没有此激活动作。
