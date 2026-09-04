# Achievement Presentation Contract

31候选：30 source展示覆盖 + FISH_30M能力候选。不可直接替换源category/condition。名单与reward权威在phase4/achievements.json；无奖励的{}不是等待补填大奖。

## 状态投影

| 源状态/属性 | visible | 标题/说明/图标 | progress | 按钮/动画 |
|---|---|---|---|---|
| LOCKED, hidden=false | true | 本地化真实内容 | progress-visible（只有可靠进度时），否则“尚未达成” | 无领取，去相关页面 |
| LOCKED, hidden=true | true（匿名卡） | secret-before-unlock：??? / 还有传说没被发现 / 通用锁 | progress-hidden：不输出计数、target、condition、tooltip、无障碍描述或真实assetKey | 无领取，不展示奖励/稀有度/真实分组 |
| COMPLETED，reward非空 | true | 真实内容 | 达成 | claimable；点领取等服务成功后reward动画 |
| COMPLETED，reward={} | true | 真实内容 | 达成 | “已达成”；V1不自动调用claim、不暗中写档 |
| CLAIMED | true | 真实内容 | 达成 | “已领取”，无重播奖励 |
| 未支持 FISH_30M | false | 不注册生产列表 | 不推测 | 候选预览可显示能力标记 |

auto-granted是将来可选投影状态：仅当服务明确报告奖励已自动发放，显示“已发放”；不能从unlocked推出已经发奖。当前AchievementService显式claim，V1奖励均手领；无奖励达成不制造“可领”红点。UI不自行把COMPLETED写为CLAIMED。

## 6个隐藏项（本表为开发文档，禁止作为锁定UI数据）

| ID | 解锁后稀有度 | 解锁后进度展示 |
|---|---|---|
| RARE_EVENT | RARE | 已达成 |
| EASTER_EGG | LEGENDARY | 已达成 |
| PROMOTION_5 | RARE | 5/5 |
| OFFICE_5 | RARE | 5/5 |
| MIND_FULL | COMMON | 已达成 |
| WORK_10H | RARE | 36000/36000秒（展示10小时） |

其他25项：FIRST_MERGE/MERGE_10/SALARY_1000/REACH_LIANQI/REACH_ZHUJI/PROMOTION_SUCCESS/IDLE_CLAIM/SECT_JOIN/TALENT_PICK/FISH_30M为COMMON；MERGE_50/MERGE_100/SALARY_5000/SALARY_10000/SALARY_50000/REACH_JINDAN/REACH_YUANYING/REACH_HUASHEN/REACH_LIANXU/REACH_HETI/REACH_DACHENG/REACH_DUJIE/REACH_FEISHENG/OFFICE_3/WORK_1H为RARE。rarity仅边框装饰，不加奖励或推导中奖率；隐藏锁定统一匿名分组，避免从分组推条件。

工资成就口径是当前余额，非累计收入；晋升进度careerLevel−1，非连续成功；KPI类按服务当前口径，不用动画/客户端计数猜测。若无法提供准确百分比，显示条件文字而非假进度条。

防泄漏：脱敏在Presenter/VM层，而不是仅Label.active=false；绑定池回收必须清除真实字符串、旧图标与tooltip。zh-CN可含全部文案（不是加密保护），但锁定UI不得通过可见内容、无障碍树或调试overlay泄漏。解锁toast每ID每session首次状态跃迁一次，加载既有存档不狂播；claim成功才播放一次奖励，失败保留可领且不造收益数字。
