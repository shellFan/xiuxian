# Reward UX State Contract

这是拟议UI状态机，不是新增RewardService。现有RewardProvider只有granted/cancelled/failed；loading/playing/confirming需要未来桥接，不能从动画推断已经发奖。每次请求绑定placement/entityId/requestId；结果归Session处理，页面销毁不撤销已发生的业务结算。

| 状态 | 玩家看到 | 可操作 | 退出条件 |
|---|---|---|---|
| available | “看广告 + 实际奖励”，正常路径同等清晰 | 主动请求/关闭/正常玩 | 服务接受请求→loading |
| loading | “正在准备广告”，spinner，不显示假倒计时 | 取消等待/关闭面板 | ready→playing；失败/超时→failed |
| playing | 平台播放器主导，不再叠加自制遮罩 | 平台关闭键；不遮挡 | 完整观看→confirming；提前关→cancelled |
| confirming（必要中间态） | “奖励确认中，可继续游玩” | 关面板/正常玩；同实体禁止再次请求 | 业务提交已确认→granted；确定失败→failed；未知继续后台核对 |
| cancelled | “本次未获得广告奖励” | 正常玩/关闭；限频允许后手动重试 | 不扣次数中成功计数、不发奖 |
| failed | “暂时未能领取，请稍后再试” | 正常玩/关闭；确定未发奖后才可重试 | 清UI锁，不清事务去重 |
| granted | “已领取”+实际增量一次 | 返回；不再发起同实体请求 | 以服务snapshot为准，不重播 |
| daily limit reached | “今日次数已用完”+真实刷新时间 | 正常玩法/关闭 | 日界服务刷新；UI不自增次数 |
| network unavailable | “网络暂不可用，仍可继续游玩” | 普通路径/关闭，手动重试网络 | 不反复自动弹窗 |
| provider unavailable | “暂时没有广告” | 普通路径/关闭 | 服务能力恢复后才可请求 |

准备阶段15秒无响应→取消本UI等待并提示；播放器由平台生命周期管理，不在视频中强行15秒终止；恢复前台10秒仍无终态→解除页面遮挡、标confirming，由服务核对（不能自行判失败重发）。晚到回调只给原requestId处理，同一id最多一笔奖励。UI超时不等于服务取消，故未知状态禁止同实体重复请求，但不锁住全游戏。

离线：未结算时普通1倍/广告2倍互斥；广告等待可取消展示但原事务未知时不可同时claimNormal，先由服务确认取消/终态；确定失败/取消立即开放普通领取。已结算1倍永不出现补差额按钮。晋升：广告仅重试机会，绝非成功保证；当前主线无非广告失败重试策略，列主线阻断项，不靠UI重建Context绕过。

验证：双击、切页、destroy/rebind、后台恢复、重复回调、晚到成功、无填充、无网络、跨日与满盘变化；任何结果无永久spinner/遮罩，无重复入账，普通游戏不被广告失败冻结。所有运行时验证仍需Cursor/真机完成。
