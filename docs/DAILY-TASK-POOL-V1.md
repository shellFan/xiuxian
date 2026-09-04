# Daily Task Pool V1

输入：12条候选模板 + daily-pool-metadata.json。状态仍NEEDS_SERVICE_CAPABILITY；当前主线全量生成6源任务，不能直接接12模板。任何任务不以看广告为完成条件。

## UI文案键映射

| 合同消息 | locale key | zh-CN |
|---|---|---|
| 候选不足时的安全降级提示 | `ui.dailyPool.fallback` | 其余任务待条件开放 |

## 选择算法（拟议，未实现DailyTaskService）

每天默认5项，显式产品开关可6项；按UTC日（北京时间08:00）持久化抽取结果、生成时计数基线、版本与seed，重启/切页不重抽。优先检查snapshot和能力，再按family去重，无放回权重抽样。一个family只取一个模板；先抽family（各1票），再按metadata.weight抽难度模板，避免拥有更多模板的family天然更常见。

已支持六族：WORK→WORK_10_MIN、FISH→FISH_3_MIN、MERGE→MERGE_5、EVENT→EVENT_3、KPI→KPI_COMPLETE、PROMOTION→PROMOTION_1。类型后缀是遗留API名，不代表新变体仍需10分钟/5次；目标取template.target。RECRUIT/SALARY/CULTIVATION/MIND列为V2候选，当前无可靠日计数/发进度入口，不能因为有资源字段就启用。

WORK与FISH可顺序完成，不互斥；任意“全天只工作”规则不进入池。PROMOTION只在非满级、目标可达且晋升机制可用时入池，不要求先看广告或先失败；KPI只在存在可完成目标时可用。满盘且无可合对、无腾位能力时MERGE不合格；EVENT机制未启用不出EVENT任务。minCareerLevel只是下限，不代替上述即时能力检查。

每次选后核对累计reward逐字段不超 salary750/cultivation100/performance30/mind45（旧六任务合计上限，不是保证发满）。超预算跳过模板；不得自动缩奖励导致文案错。EASY/NORMAL/HARD只影响选择，不修改奖励；至少2 EASY，最多1 HARD，在满足条件的集合内抽样。枚举所有可用family组合后筛预算/难度，比贪心抽失败反复重抽更可复现。

不足5个合格family时安全降级为全部合格且至少2 EASY（如果连2 EASY也不存在则保留能执行项并记录能力不足）；UI显示实际数并解释“其余任务待条件开放”。不得复制类型、造新任务或强制不可达晋升凑5。不足情形属于接入验收提示，不宣称产品5项目标已满足。day内能力解锁不重抽已领取集合，新增可选任务要单独产品审批。

## 进度与领取契约

累计WORK/FISH必须减生成时基线，不能直接使用跨日终身累计；promotion按当天成功次数，KPI按当天达标快照转换，MERGE/EVENT按当日成功操作。进度单调clamp[0,target]，不受当前工资花费倒退。claim(dayKey,taskId)由主线原子服务做幂等/存档，跨日旧请求不发新日奖励；未领旧奖励是否保留V1明确不跨日补发，界面倒计时提前说明。

## 验收

同seed/day/snapshot→同结果；12模板不会生成12任务；type唯一、缺能力不入池、满级无PROMOTION、没有广告必做项；所有组合预算不过上限；跨日计数清零但终身成就不清；时钟回退不重抽。当前仅元数据结构/引用/预算经工具检查，运行时抽样与跨日行为需Cursor实现并测试。
