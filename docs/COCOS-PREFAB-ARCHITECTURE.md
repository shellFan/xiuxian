# Cocos Prefab Architecture

基线只有 `assets/scenes/Main.scene`，没有已提交可复用的 `.prefab` 文件；已有 MainView、MergeBoardView、WorkerView、ToastView、FeedbackView 及 phase2 组件，后续由 Editor 从真实节点提取，不手写虚假的 prefab 序列化。本轮交付为节点及 binding 规格，不新增不可运行资源。

资源路径保持现有 `assets/prefabs`，新增文件使用 snake_case；表中 PascalCase 是组件/概念名称，不是文件名。布局全部读取 ui-theme；订阅由 Presenter 单点维护，Prefab只接受只读输入和用户intent。

## UI 目录 `assets/prefabs/ui/`

| 概念 / 文件 | 必需子节点 | 输入 binding | 输出 intent / 复用 |
|---|---|---|---|
| TopResourceBar / top_resource_bar | Career、Salary、Performance、Cultivation、Mind | MainHUDViewModel.resources | openCareer / openResourceDetail |
| BottomNavigation / bottom_navigation | WorkerTab、CareerTab、SectTab、EventTab | selectedTab、eventBadge | navigate(tab)；切页不造Context |
| WorkerCard / worker_card | Portrait、Level、Selection | workerId、level、selected | inspect(workerId)；复用WorkerView展示 |
| WorkerSlot / worker_slot | Desk、EmptyHint、TargetRing、WorkerAnchor | slotIndex、occupied、dropState | pointer intent；无业务状态 |
| MergeBoard / merge_board | Slots、DragLayer、EffectsLayer | rows=4、columns=4、snapshot | move/merge intent；复用MergeBoardView与拖拽控制 |
| KpiWidget / kpi_widget | Title、Fill、Count、Open | completedCount、totalCount | openKpi；不自行算加权总进度 |
| CareerBadge / career_badge | Frame、Icon、Name、Realm | sourceName、realm、visualTier | openCareer |
| MindBar / mind_bar | Fill、Value、StateIcon | current、max、statusText | openMindHelp |
| SalaryCounter / salary_counter | Icon、Value、DeltaAnchor | exactValue、formattedValue | inspectSalary；变化音效限流 |
| CultivationBar / cultivation_bar | Value、NextThreshold、Fill | current、nextThreshold、maxed | openCareer |
| EventCard / event_card | Category、Title、Body、EffectList、Choices | EventViewModel | choose(eventId,choiceId)、defer |
| AchievementItem / achievement_item | Icon、Name、Description、Progress、Claim | AchievementViewModel item | claim(id)；隐藏未达成先脱敏 |
| DailyTaskItem / daily_task_item | Name、Progress、Reward、Action | DailyTaskViewModel item | claim(id)/navigate(destination) |
| RewardButton / reward_button | PlayIcon、Label、Spinner、Limit | placement、state、remaining | requestReward(placement) |
| CommonModal / common_modal | Mask、Panel/Header、BodyScroll、Actions、StatusLabel | ModalSpec、modalState | primary/secondary/close；共用生命周期 |
| Toast / toast | Background、Icon、Message | message、kind、duration | dismissed；复用ToastView需适配队列 |
| Tooltip / tooltip | Panel、Arrow、Text | anchorRect、text | dismiss；边界clamp |
| TutorialPointer / tutorial_pointer | DimMask、Highlight、Arrow、Text、Skip | stepId、targetRect、canSkip | skip；不能吞目标触摸 |

## Game 目录 `assets/prefabs/game/`

| 概念 / 文件 | 节点层次 | 输入 / 生命周期 |
|---|---|---|
| Worker / worker | Root/Shadow、Body、Accessory、Aura | visualTier、pose、slotIndex；不持有PlayerData；归还池时停动画 |
| Desk / desk | Root/Base、Monitor、Props | officeSkinId、occupied；静态优先合图 |
| OfficeDecoration / office_decoration | Root/Sprite、OptionalIdle | decorationId；可禁用低优先动效 |
| MergeEffect / merge_effect | Root/Stroke、Stamp、Spark | targetLocalPoint、newLevel；成功事件后320ms，结束回池 |
| PromotionEffect / promotion_effect | Root/Scroll、Seal、Halo | success、realm；900ms；不执行晋升 |
| CoinEffect / coin_effect | Root/Icon、Amount | actualDelta、hudAnchor；最多3个聚合展示 |
| CultivationEffect / cultivation_effect | Root/Wisp、Amount | actualDelta、hudAnchor；与Coin共用并发预算 |

## Scene composition

Main.scene 保留单一 GameBootstrapComponent → MainView 的业务 Context。将 UI 挂到 Canvas/UiRoot：SafeAreaRoot/{HUD,OfficeStage,Board,Actions,Navigation} 与 OverlayRoot/{ModalHost,TutorialHost,ToastHost}。safe area数据只计算一次，挂统一Widget锚点。Overlay不受主内容滚动影响。

提取顺序：CommonModal → 资源/导航 → WorkerSlot/Board → 列表项 → 特效。每提取一个，在 Editor 校验脚本UUID、Inspector绑定、事件回调、节点层级、变换与拖拽，再提交 prefab+meta。不要拷贝未知UUID，不把 `.meta` 当任意新UUID可替换。

## Binding 审核清单

- Required 节点缺失：DEV 抛明确路径；生产隐藏受影响控件并显示可恢复提示，不能半初始化后提交命令。
- bind(vm,callbacks) 可重复调用；先卸旧订阅，再初始render；onDisable/onDestroy解绑、停止tween、取消未触发的UI任务。
- Node复用时清除旧 workerId、徽章、disabled、opacity、scale、回调；禁止上一个槽残留。
- 帧内多事件合并为一次局部刷新；列表复用按稳定id，不按数组下标持有领取状态。
- Gameplay先变更source/target，UI按服务返回的新布局；from拖到to后，新牛马留to。动画坐标统一转换为EffectsLayer局部点。
- 基础设施验证不能替代Editor导入和微信真机触摸测试。
