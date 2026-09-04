# UI Binding Contract v1

状态：设计接口，尚未实现新的 Presenter/Port。已有 `assets/scripts/ui/phase2/view-models.ts` 可保留作为旧展示适配器，后续逐块迁移，不重建业务 Context。

## Ownership

GameBootstrapComponent 创建并持有唯一真实 GameContext；MainView 使用同一实例。新增 UiSessionPort 在 composition root 由该 Context 的现有服务适配而来。View不能 import PlayerData、持有可变领域对象或直接执行数值加减。ViewModel仅为拷贝后的只读数据；不能把只读TypeScript标注当成深拷贝。Port读取服务投影，个别缺少投影的字段由主线提供接口，不能让UI偷读player凑齐。

```text
GameBootstrap (one GameContext)
   └─ UiSessionPort (one adapter, no new business state)
       ├─ HUD Presenter → HUD / Board / Resource Views
       ├─ Page Presenter → Career / KPI / Achievement / Daily
       └─ Overlay Presenter → CommonModal / Toast / Tutorial
```

## DTO 提案（文档示意，不是新增运行代码）

```ts
type LoadState = 'LOADING' | 'READY' | 'EMPTY' | 'ERROR';
type ActionState = 'READY' | 'BUSY' | 'DISABLED' | 'DONE';
type Resource = { readonly exact: number; readonly text: string; readonly unit: string };
type Progress = { readonly current: number; readonly target: number; readonly completed: boolean };
interface MainHUDViewModel {
  readonly state: LoadState;
  readonly careerName: string;
  readonly realm: string;
  readonly resources: Readonly<Record<'salary'|'performance'|'cultivation'|'mind', Resource>>;
  readonly mindMaximum: number;
  readonly mode: 'WORK'|'FISHING';
  readonly kpiCompleted: number;
  readonly kpiTotal: number;
  readonly recruit: { readonly price: number; readonly state: ActionState; readonly reason: string };
  readonly slots: readonly { readonly index: number; readonly workerId: string|null; readonly level: number|null }[];
}
interface CareerViewModel {
  readonly state: LoadState;
  readonly level: number;
  readonly name: string;
  readonly realm: string;
  readonly visualTier: number;
  readonly nextName: string|null;
  readonly nextCultivationThreshold: number|null;
  readonly canPromote: boolean;
  readonly reason: string;
  readonly salaryMultiplier: number;
  readonly cultivationMultiplier: number;
}
interface KpiViewModel {
  readonly state: LoadState;
  readonly careerLevel: number;
  readonly items: readonly { readonly id: string; readonly label: string; readonly progress: Progress; readonly destination: string|null }[];
}
interface AchievementViewModel {
  readonly state: LoadState;
  readonly items: readonly {
    readonly id: string; readonly title: string; readonly description: string;
    readonly category: string; readonly hidden: boolean;
    readonly status: 'LOCKED'|'COMPLETED'|'CLAIMED';
    readonly rewardText: string; readonly action: ActionState;
  }[];
}
interface DailyTaskViewModel {
  readonly state: LoadState;
  readonly dayKey: string;
  readonly refreshAtMs: number;
  readonly items: readonly {
    readonly id: string; readonly title: string; readonly progress: Progress;
    readonly rewardText: string; readonly status: 'IN_PROGRESS'|'COMPLETED'|'CLAIMED';
    readonly action: ActionState;
  }[];
}
interface OfflineRewardViewModel {
  readonly state: LoadState;
  readonly settlementId: string;
  readonly elapsedSeconds: number;
  readonly effectiveSeconds: number;
  readonly capped: boolean;
  readonly baseSalary: number;
  readonly baseCultivation: number;
  readonly doubleTotalSalary: number;
  readonly doubleTotalCultivation: number;
  readonly settled: boolean;
  readonly doubled: boolean;
  readonly rewardAdState: ActionState;
}
type UiCommand =
  | { type: 'RECRUIT' }
  | { type: 'SET_MODE'; mode: 'WORK'|'FISHING' }
  | { type: 'MOVE_OR_MERGE'; from: number; to: number }
  | { type: 'RESOLVE_EVENT'; eventId: string; choiceId?: string }
  | { type: 'PROMOTE'; optionId: string }
  | { type: 'CLAIM_ACHIEVEMENT'|'CLAIM_DAILY'; id: string }
  | { type: 'CLAIM_OFFLINE_NORMAL'; settlementId: string }
  | { type: 'REQUEST_REWARD'; placement: string; entityId: string };
type UiSnapshot = { readonly hud: MainHUDViewModel; readonly career: CareerViewModel;
  readonly kpi: KpiViewModel; readonly achievements: AchievementViewModel;
  readonly daily: DailyTaskViewModel; readonly offline: OfflineRewardViewModel|null };
interface UiSessionPort {
  read(): UiSnapshot;
  subscribe(onChange: (section: keyof UiSnapshot) => void): () => void;
  execute(command: UiCommand, commandId: string): Promise<
    { ok: true } | { ok: false; code: string; retryable: boolean; message: string }
  >;
}
```

离线普通领取命令 `{ type: 'CLAIM_OFFLINE_NORMAL'; settlementId }` 只在该结算尚未 settled 时映射到 `context.offline.claimNormal`；若已 settled，UI 仅 dismiss，不产生新 grant。广告路径仍使用 `REQUEST_REWARD`，且必须是 `placement: 'OFFLINE_DOUBLE'`、`entityId: settlementId`，映射到 `claimDouble`。1 倍与 2 倍互斥，不能先领普通收益再补差额；不得增加 Service 或通用动态 dispatch。

这些命名为Phase4命名空间，不与已有同名CareerViewModel混导。生产 Adapter 只能把 intent 转现有 API；未知 placement/type 拒绝，不能动态调用任意服务方法。commandId 不等于业务凭证，最终幂等仍由对应服务负责。

## 实际源与刷新映射

| UI 域 | 现有只读/API位置 | 刷新来源 | 接入注意 |
|---|---|---|---|
| HUD/Board | 原MainView与MergeBoardView、career.current、mind.current/max | workerRecruited、mergeCompleted、salaryChanged、mindChanged、workModeChanged、playerChanged | workerRecruited不能漏；搬移事件需主线暴露或命令完成后刷新 |
| Career | career.current、promotion.canPromote/getProbability、office.getOfficeName | careerChanged、promotionChanged、phase2Refresh | next threshold取下一档配置，不能用当前requiredExp |
| KPI | KpiService公开接口与当前career配置 | kpiChanged、playerChanged、mergeCompleted、eventChanged | 汇总显示完成项/总项，不把工资与秒相加 |
| 成就 | context.achievements.getConfigs/getStatus、claim | 当前服务实际发 `AchievementUnlocked`（大写）、`achievementClaimed`（小写） | 解锁的GameEvents声明为小写，现有不一致；Adapter临时桥接两种解锁事件并去重，主线另行统一 |
| 每日 | DailyTaskService公开读取与claim | dailyTaskProgress、dailyTaskCompleted、dailyTaskClaimed | 跨日失效重读；随机选择未实现 |
| 离线 | OfflineRewardService.preview/isSettled/claimNormal/claimDouble | idleSettled、offlineRewardChanged | 未结算选择1倍或2倍；已结算后claimDouble会拒绝，不能先领1倍再补差额 |

首次bind先订阅再read初始快照，订阅回调只标dirty，首读完成后合并通知；onDisable先调用unsubscribe；onEnable重新订阅并read。切页不运行 Service checkAll 来凑刷新。DailyTaskService.getProgress当前会refresh并可能跨日写状态，因此在composition root由业务生命周期先refresh；将来UiSessionPort需由主线提供无副作用快照，不能把当前getProgress直接伪装成纯读取。

统一Presenter在事件发生时把section标dirty，每个调度帧合并一次**已变section**；不是每帧轮询所有数据。计时显示由前台每秒tick更新文本，后台停UI tick，恢复后从绝对deadline重算；收入每秒最多一次数字动画。

## 错误、事务与 Mock 边界

异步错误保留最近成功快照，ERROR标记与重试入口；用户触发前检查实体仍存在，但最终以服务结果为准。提交超时只表示未知，不标“已领取”，后台回调到来用entityId对齐，销毁View不能丢发奖结果。Toast只展示已知错误，不吞异常。

ui-mock-data.json 是DEV_ONLY；预览独立实例仅实现DTO输入，不构造生产GameContext、不保存、不触发Reward。生产入口/ConfigService不得glob加载phase4或mock文件。构建打包剔除需在正式接入时配置；本轮未承诺资源从包体自动剔除。

接入测试要求：两次bind监听数不翻倍；隐藏/恢复不漏刷新；重复claim不重发；旧Modal回调不改新实体；source空target升级；所有VM不暴露player引用；release不能进入preview或Debug路由。

## 主线接口缺口交接

- PlatformSystemInfo缺safeArea/capsuleRect；onShow/onHide没有解绑接口。UiAdapter应以Session级唯一平台监听转发，View只订阅自己的可解绑通知；主线后续提供dispose，不让每个页面注册平台回调。
- DailyTask的日期当前以UTC午夜划分（北京时间08:00），不能在文案写“每日零点刷新”。正式倒计时由服务提供nextRefreshAtMs，产品若改本地零点需要另行存档迁移决策。
- AchievementService不识别FISH_SECONDS，尽管PlayerData已有fishingSeconds；候选摸鱼成就缺的是条件评估/接入，不是宣称整个游戏没有摸鱼计时。
- RewardType有7个名称不等于7个奖励事务都已接通；由Reward Owner确认每个placement、去重与结果恢复后UI才开放。
