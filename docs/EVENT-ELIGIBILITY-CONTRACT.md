# Event Eligibility Contract

用途：候选事件资格的独立sidecar契约，不把11个可选字段灌入现有CareerEventConfig。所有字段由主线适配识别后才启用；未知字段/枚举 fail closed 并输出诊断，不默认“可出现”。

| 字段 | 层级 | 单位/边界/默认 | 判定 |
|---|---|---|---|
| id | V1 required | 非空、对应唯一事件ID | 没有对应内容则无效 |
| minCareerLevel | V1 required | integer1..10，通用项1 | player.careerLevel>=min |
| requiresWorkMode | V1 required | ANY/WORK/FISHING，通用ANY | 与真实WorkMode匹配 |
| cooldown | V1 required | ms integer>=1800000，通用1800000 | 同ID展示后再计时 |
| maxCareerLevel | V1 optional | integer>=min且<=10，缺省10 | 超界排除 |
| minMind/maxMind | V1 optional | ratio0..1，缺省0/1；min<=max | 使用mind/maxMind；maxMind<=0不合格 |
| minKpiProgress | V1 optional | ratio0..1，缺省0 | 完成项/总项；无KPI且要求>0则不合格 |
| oncePerSave | V1 optional | boolean，默认false；egg强制true | 查已展示ID，非选择结果 |
| oncePerDay | V1 optional | boolean，默认false | UTC日，展示成功写标记 |
| requiresAchievement | V2 candidate | 已存在achievement ID | 未支持前含此约束项不进入V1 |
| requiresPlatform | V2 candidate | wechat/web/desktop | 不把平台条件当广告能力；未适配排除 |

“required”是未来sidecar中的要求，不代表本轮80事件已有元数据。此轮保持现有JSON不变。资格缺省只有在主线显式采纳通用策略时生成；迁移工具不会凭空给事件套职级/道心限制。

处理顺序：Schema → capability → snapshot有效性 → career/mode/mind/KPI → 冷却/once/history → EVENT-POOL-V1彩票。当前有pending/交易锁/背景状态，整轮不开始。

日界沿用源DailyTaskService的UTC午夜（北京时间08:00），不是设备本地午夜；时区调整不能领取两次。次数持久化由主线服务拥有；渲染器不得在读取期间写seen。

失败原子性：只有事件成功成为pending并对玩家展示才写历史；准备内容失败不消耗once；选择提交失败保留同一pending，不能二次抽奖。同ID重复回调不重复登记。
