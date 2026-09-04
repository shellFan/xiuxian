# Prefab Implementation Checklist

规格来源COCOS-PREFAB-ARCHITECTURE：18 UI + 7 Game，共25项。下列Component名除现有WorkerView/MergeBoardView/ToastView外均为**拟议Presenter角色**，不声称已有脚本、UUID或prefab。主线在Editor提取与绑定，本分支没有生成序列化文件。

全局required：稳定id、只读VM、intent回调、bind/unbind/dispose；引用缺失开发报路径、生产禁用受影响操作且不锁全屏。每项必验：重复bind不重复订阅；disable/destroy清理事件与tween；池复用清除状态；业务先提交、UI再动画。不在每个Prefab订阅平台。单Session只有一个业务Context。

SafeArea分类：S=只使用统一安全根、不再重复扣inset；O=Overlay独立按同一安全矩形clamp；B=Board/Effects局部坐标，经一次变换；W=背景可出血到视口，重要内容不出安全区。音效“无”禁止借用任意点击事件重复播放。表中asset为生产用途，落盘ID由manifest查；不能猜UUID。

## UI（逐项验收）

| prefab | 节点 / Component | requiredProperty | event binding → VM | asset / animation / audio | safe | manual test |
|---|---|---|---|---|---|---|
| TopResourceBar | Career,Salary,Performance,Cultivation,Mind / ResourcePresenter | 5Label、5详情入口 | salaryChanged/playerChanged/mindChanged → MainHUD.resources | 4资源icon+career框 / 数字变化 / 无（SalaryCounter集中发声） | S | 大额显示精确详情、未知值非0、1.3不挤掉道心 |
| BottomNavigation | WorkerTab,CareerTab,SectTab,EventTab / NavigationPresenter | tabs、selected状态、intent | UI navigate + eventChanged → UiSession选页/eventBadge | tab按钮 / press / ui_click | S | 每tab回主盘状态不丢、未开放禁用有说明 |
| WorkerCard | Portrait,Level,Selection / WorkerView适配 | workerId、portrait、levelLabel、selected | workerRecruited/mergeCompleted → Board.item | worker等级图 / select/press / ui_click | B | 卡池从高阶复用为空槽不残图、id不串 |
| WorkerSlot | Desk,EmptyHint,TargetRing,WorkerAnchor / SlotPresenter | slotIndex、anchor、dropState | Board snapshot / drag intent → Board.cell | desk/target环 / target highlight / 无 | B | source释放、target留新角色；不可合位置不绿 |
| MergeBoard | Slots,DragLayer,EffectsLayer / MergeBoardView | rows4、columns4、16槽、坐标根 | mergeCompleted.second + intents → Board | 桌面/worker / merge_pop / game_merge | B | 缩放/变换拖拽、无效落点回权威位置、多指/销毁取消 |
| KpiWidget | Title,Fill,Count,Open / KpiPresenter | progressFill、countLabel、open | kpiChanged → HUD.kpi（服务项完成数） | KPIicon / 完成跃迁 / ui_success | S | 多项只完成部分不显示满格、满级无下一KPI |
| CareerBadge | Frame,Icon,Name,Realm / CareerPresenter | sourceNameLabel、realmLabel、visualTier | careerChanged → HUD.career | career+realm / change / 无 | S | 职业tier不等workerlevel，realm5+fallback保真实名字 |
| MindBar | Fill,Value,StateIcon / MindPresenter | current/max/statusLabel | mindChanged/playerChanged → HUD.mind | mindicon / threshold pulse / 无 | S | max变动正确，0状态可操作摸鱼，无每帧警报 |
| SalaryCounter | Icon,Value,DeltaAnchor / SalaryPresenter | exact/formatted/anchor | salaryChanged.amount>0 → HUD.salary | salaryicon / salary_fly / game_salary（1秒聚合） | S | 一秒多收入只一声，负收入无喜庆奖励音 |
| CultivationBar | Value,NextThreshold,Fill / CultivationPresenter | actual/threshold/maxed | playerChanged/careerChanged → HUD.cultivation | cultivationicon / 修为变化 / game_cultivation | S | 阈值0/满级不除0，不把晋升消耗当收入 |
| EventCard | Category,Title,Body,EffectList,Choices / EventPresenter | eventId、choiceId、pending、callbacks | eventChanged → Event VM | 类别icon / paper in / 对应events_*或无 | O | 2–3长选项可滚动、失败保pending、双点只提交一次 |
| AchievementItem | Icon,Name,Description,Progress,Claim / AchievementPresenter | sanitizedItem、claim(id) | achievementUnlocked待桥接/achievementClaimed → Achievement VM | 匿名锁/类别icon / 解锁章 / game_achievement | S | 6隐藏未解锁零泄漏、无奖励无可领红点、重复领取无动画 |
| DailyTaskItem | Name,Progress,Reward,Action / DailyPresenter | dayKey、taskId、target、claim | dailyTaskProgress/Completed/Claimed → Daily VM | dailyicon / check / game_daily_reward | S | 跨日旧按钮不领新日、数字不以type后缀代替target |
| RewardButton | PlayIcon,Label,Spinner,Limit / RewardPresenter | placement、entityId、state、request | UI意图/未来Reward snapshot（非虚构GameEvent） → Reward VM | 奖励按钮 / press / ui_click | O | provider无能力隐藏/禁用，loading取消不重复发奖 |
| CommonModal | Mask,Panel/Header,BodyScroll,Actions,StatusLabel / ModalPresenter | modalId、body、closePolicy、callbacks | UI modal state → ModalSpec | panel/mask / modal in/out / ui_open/ui_close | O | 同时只有一交易弹窗；长文可滚；mask不吞关闭 |
| Toast | Background,Icon,Message / ToastView适配 | text、kind、duration、queue | UI反馈 → Toast VM | panel/icon / toast in/out / ui_fail仅重要错误 | O | 不盖主按钮/手机胶囊、队列不重复、销毁停止 |
| Tooltip | Panel,Arrow,Text / TooltipPresenter | anchorRect、text、viewport | UI focus/press → Tooltip VM | 小panel / 淡入 / 无 | O | 四边clamp、长文换行、隐藏成就不传condition |
| TutorialPointer | DimMask,Highlight,Arrow,Text,Skip / TutorialPresenter | stepId、targetRect、skip、allowSkip | tutorialStepChanged → Tutorial VM | pointer / 轻摆 / 无 | O | 缺目标立即关mask；保留目标触摸与跳过；长期等晋升不阻输入 |

## Game（逐项验收）

| prefab | 节点 / Component | requiredProperty | event binding → VM | asset / animation / audio | safe | manual test |
|---|---|---|---|---|---|---|
| Worker | Shadow,Body,Accessory,Aura / WorkerVisual | visualId、workerId、slot | Board.item，由上层单订阅 | worker sprite / idle/merge响应 / 无 | B | 池归还清id/tween、工作与摸鱼不新造状态 |
| Desk | Base,Monitor,Props / DeskVisual | officeSkinId、occupied | Office snapshot | desk / 静态 / 无 | B | 16桌不各加载同一贴图、满盘不遮卡 |
| OfficeDecoration | Sprite,OptionalIdle / DecorationVisual | decorationId、reducedMotion | Office snapshot/UI settings | office装饰 / 可选idle / 无 | W | 降级关idle、切office释放旧引用 |
| MergeEffect | Stroke,Stamp,Spark / MergeEffectPresenter | targetLocalPoint、newLevel、completion | mergeCompleted → event投影 | mergeFX / 320ms merge_pop / 无（board统一发game_merge） | B | 必须落second，经EffectsLayer变换；失败不播、完毕回池 |
| PromotionEffect | Scroll,Seal,Halo / PromotionEffectPresenter | success、realm、completion | promotionChanged.success → result VM | promotionFX / 900ms burst / game_promotion或game_promotion_fail | O | 成功/失败不串、屏幕旋转/销毁能取消、不自行晋升 |
| CoinEffect | Icon,Amount / CoinEffectPresenter | actualDelta、HUDanchor | salaryChanged → positive delta | salaryicon / salary_fly / 无（counter统一发） | B→S | 与工资数字一致，并发预算3，负数不播放 |
| CultivationEffect | Wisp,Amount / CultivationEffectPresenter | actualDelta、HUDanchor | snapshot正增量 → resources VM | cultivationicon / fly / 无（bar统一发） | B→S | 与Coin共享3并发、丢视觉不丢账、不从总额重复算旧奖励 |

最终Editor检查：25个prefab逐项填真实路径/脚本UUID/Inspector引用截图/操作者/构建版本；当前25项均MANUAL TEST REQUIRED。本表不构成已绑好的Prefab资产声明。
