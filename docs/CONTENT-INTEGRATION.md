# Phase 4 候选内容集成说明

## 状态与来源

本批内容是候选数据，不是运行时开关。三个候选 JSON 都使用 `schemaVersion: 1`、`status: "PHASE4_CANDIDATE"`、`runtimeEnabled: false`；候选内容不会自动在线启用。

事件候选来源于 `assets/configs/career-events.json`，并在 `assets/configs/phase4/office-events.json` 中保留全部 30 条源事件，再加入 50 条新事件。成就候选来源于 `assets/configs/achievements.json`，日常任务候选来源于 `assets/configs/daily-tasks.json`。`assets/configs/daily.json` 是签到奖励，不是日常任务选择池。

## 当前运行时能力

- `GameEffect` 只支持 `salary`、`performance`、`cultivation`、`mind` 四种数值增量；候选内容没有添加其他效果字段。
- `CareerEventScheduler` 只负责按时钟和随机源判断“是否到触发时间”，不持有事件池，也不实现事件合并或概率抽取。
- `AchievementService` 当前支持源配置中的 KPI、工资、职级、事件类型、晋升、办公室、道心、挂机领取、宗门、天赋和工作时长条件。事件类型成就由 `notifyEventType` 即时通知；候选的 `displayCategory`、`hidden`、`sourceId`、`integrationStatus` 还不是运行时字段。
- 工资成就的服务检查的是 `player.salary` 当前余额，不是累计赚取额。因此候选显示文案统一使用“工资余额”，没有承诺累计工资。
- `DailyTaskService` 会把传入 bundle 的每一条任务全部生成到当天状态，并按类型找到第一条匹配任务；当前没有随机抽取、每天 5 个、同类型互斥或奖励总额封顶逻辑。候选选择配置中的 `perDay: 5` 只是待实现政策。
- `DailyTaskService` 的 `dayIndex` 按 UTC 午夜切日，在北京时间表现为 08:00 换日，不是本地 00:00。`PlayerData` 已有 `fishingSeconds`；当前缺口是 `AchievementService` 尚未评估 `FISH_SECONDS` 条件。`FISH_30M` 因此标记为 `NEEDS_SERVICE_CAPABILITY`，不能宣称已经可用；它是成就候选，不是日常任务模板。

## 事件合并与分布

启用时必须采用“替换为经过审核的并集”（replace-with-reviewed-union）：将候选文件视为完整事件 bundle，用审核后的 80 条集合替换源 bundle，再交给现有消费方。不得把两个 bundle 直接 concatenate，否则 30 条源事件会重复出现。

候选事件总分布如下：

| 类型 | 数量 |
| --- | ---: |
| POSITIVE | 20 |
| NEGATIVE | 32 |
| CHOICE | 14 |
| RARE | 4 |
| EASTER_EGG | 10 |
| 合计 | 80 |

稀有度是“每次符合资格的事件机会”的池级设计，不是对每个条目分别乘概率。建议经产品与服务 owner 审核后，将所有符合资格的机会配置为 `RARE` 总概率 1%、`EASTER_EGG` 总概率不超过 0.1%；不能在内容文件里声称概率已经实现。彩蛋只使用办公室结果异常顺滑的幽默，不承诺额外的未建模能力。

### 源事件基线例外

以下问题属于 `assets/configs/career-events.json` 的既有内容，本批按深度一致要求保留，不能在候选文件中偷偷改写，需由主线另行决定：

- `EVENT_AFTERNOON_TEA` 的描述写“道心回满”，实际效果只有 `mind: 12`；主线需决定修正文案还是调整数值。
- `EVENT_SUDDEN_TEAM_BUILDING` 的 `JOIN` 为 `mind: 8, performance: 3`，`SLACK` 为 `mind: 3, performance: -2`，前者在现有字段上严格支配后者；主线需决定是否重做选择题平衡。
- `EVENT_COMPANY_IPO` 等源事件的奖励可能超过本批新事件上限；新内容预算不反向约束既有基线。

## 成就与日常任务

候选成就复用全部 30 个源 ID，逐条保留源 `condition` 和 `reward`；源成就的 `integrationStatus` 为 `PRESENTATION_ONLY`，表示这批改名、分类、隐藏展示信息需要 UI/产品审批，不能被当作新的运行时 schema。新增的 `FISH_30M` 使用 `sourceId: null`、`FISH_SECONDS: 1800`，并标记为 `NEEDS_SERVICE_CAPABILITY`；在 `AchievementService` 增加该条件评估前，该成就候选不接入运行时，也不进入日常任务抽取。

候选日常任务保留 6 个源任务的 ID、类型、目标和奖励，另加 6 个带 `sourceId` 的同类型变体。启用前应由服务 owner 实现：每天从模板中抽取 5 个、每种类型最多一个、互斥同类型变体、排除尚未有能力支持的晋升任务，并在激活前封顶当天聚合奖励。当前候选文件明确表达的是“5 次抽取，不是 12 个任务同时生成”。

## 奖励预算

新普通事件的单次效果上限为：工资绝对值 30、绩效绝对值 5、修为绝对值 15、道心绝对值 10；新 `RARE`/`EASTER_EGG` 的正向效果上限分别为工资 80、绩效 8、修为 25、道心 15。源事件和源成就奖励是既有基线例外，候选没有重写它们。新日常任务变体逐字段不超过对应源任务奖励，新增摸鱼成就奖励保持较小并等待 `AchievementService` 的 `FISH_SECONDS` 条件评估。

## 集成前风险

- 必须先审核隐藏元数据：`hidden` 只是展示候选，不会自动改变解锁、存档或领取逻辑。
- `FISH_30M` 是成就候选而非日常任务；`PlayerData.fishingSeconds` 已存在，需由 `AchievementService` 增加 `FISH_SECONDS` 条件评估后才能接入，在此之前保持成就候选不接入，不把它加入日常抽取。
- 必须由服务 owner 实现日常任务随机选择、同类型互斥、每天 5 个和聚合奖励预算；直接把候选 bundle 传给现有 `DailyTaskService` 会生成 12 个任务。
- 必须由产品/服务 owner 评审事件池级概率和资格范围；本批没有自动在线激活，也没有伪造概率字段。

## 复现与验收

在 `D:/git/fan/xiuxian-ui`、`phase4-ui-content` 分支运行以下只读检查：

```powershell
node -e "const fs=require('fs'); const p=x=>JSON.parse(fs.readFileSync(x,'utf8')); const src=p('assets/configs/career-events.json').events; const out=p('assets/configs/phase4/office-events.json').events; const ach=p('assets/configs/phase4/achievements.json').achievements; const daily=p('assets/configs/phase4/daily-tasks.json').tasks; const baseAch=p('assets/configs/achievements.json').achievements; const baseDaily=p('assets/configs/daily-tasks.json').tasks; const ids=a=>new Set(a.map(x=>x.id)); const titles=a=>new Set(a.map(x=>x.title??x.name)); if(out.length<80||out.filter(x=>x.type==='EASTER_EGG').length<10||ach.length<30||ach.filter(x=>x.hidden).length<5||daily.length!==12) throw new Error('count check failed'); if(ids(out).size!==out.length||titles(out).size!==out.length||ids(ach).size!==ach.length||ids(daily).size!==daily.length) throw new Error('uniqueness check failed'); for(const e of src){const c=out.find(x=>x.id===e.id); if(JSON.stringify(c)!==JSON.stringify(e)) throw new Error('source event changed: '+e.id)} for(const a of baseAch){const c=ach.find(x=>x.id===a.id); if(!c||JSON.stringify(c.condition)!==JSON.stringify(a.condition)||JSON.stringify(c.reward??{})!==JSON.stringify(a.reward??{})) throw new Error('source achievement changed: '+a.id)} for(const d of baseDaily){const c=daily.find(x=>x.id===d.id); if(!c||c.type!==d.type||c.target!==d.target||JSON.stringify(c.reward)!==JSON.stringify(d.reward)) throw new Error('source daily changed: '+d.id)} console.log(JSON.stringify({events:out.length,eggs:out.filter(x=>x.type==='EASTER_EGG').length,achievements:ach.length,hidden:ach.filter(x=>x.hidden).length,daily:daily.length,sourceEventsPreserved:src.length,sourceAchievementsPreserved:baseAch.length,sourceDailyPreserved:baseDaily.length}))"
```

验收清单：

- [ ] 三个候选 JSON 可解析，顶层状态均为候选且运行时关闭。
- [ ] 事件 ID/标题唯一，全部 30 条源事件按 ID 深度一致，合计至少 80 条、彩蛋至少 10 条、五种类型齐全。
- [ ] 新事件逐条通过标题、描述、选择项、效果字段、奖励上限和语气人工复读；选择题每个选项都有真实取舍。
- [ ] 30 个源成就条件/奖励逐条一致，候选至少 5 个隐藏展示项，分类覆盖成长、合成、职业、摸鱼、工作、财富、修仙、事件、隐藏。
- [ ] 日常任务恰好 12 个；6 个源任务的 ID/类型/目标/奖励保持不变，6 个变体带明确 `sourceId` 且逐字段不超过源奖励。
- [ ] 运行时 owner 审核替换并集、事件池级概率、隐藏 UI 元数据、`AchievementService` 的 `FISH_SECONDS` 条件评估和日常随机选择后，才可另行启用；`FISH_30M` 不得混入日常任务抽取。
- [ ] 原始配置、services、TypeScript 和主线结构未被本批内容修改；完整测试由 root 另行运行。
