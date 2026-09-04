# Animation Guide

时间单位ms；优先级P0事务结果、P1直接输入、P2奖励信息、P3氛围。高优先可取消低优先视觉，但不能取消或重复业务交易。全局并发特效<=3、单次粒子<=12，数值变化每秒最多动画1次；停止后复原scale/opacity/position。

| 动作 | duration | easing | priority | 触发、目标与取消 |
|---|---:|---|---|---|
| 按钮按下/释放 | 80/120 | easeOutQuad | P1 | visual scale1→0.96→1，热区不变；取消触摸复原 |
| 数字跳动 | 240 | easeOutCubic | P2 | 旧展示值到新值；连续变化合并最终值，不显示插值已入账提示 |
| 工资获得 | 280 | easeOutQuad | P2 | 最多3枚符币到HUD工资锚点；文案显示实际delta |
| 修为增加 | 280 | easeOutQuad | P2 | 一条气线到修为；与工资共用池 |
| 道心下降 | 180 | easeOutSine | P2 | 图标轻缩+负delta，不全屏红闪、不震屏 |
| 牛马合成 | 320 | easeOutBack（幅度<=1.06） | P1 | 服务成功后source→target，最终新worker在target；中断读快照归位 |
| 升级 | 400 | easeOutCubic | P2 | 当前格工牌翻面，等级更新来自服务 |
| 晋升渡劫 | 900 | easeInOutCubic | P0 | 天书、盖章、徽章；可跳过，跳过不重触发晋升 |
| KPI完成 | 280 | easeOutCubic | P2 | 对应条打勾盖章；不多次弹整页 |
| 成就完成 | 280+1600停留 | easeOutQuad | P2 | 角落Toast；同帧多个合为“解锁N项成就” |
| 办公室事件 | 180/140 | easeOutCubic/easeInQuad | P2 | 统一Modal进入/退出，不打断拖拽提交中的320ms |
| 离线奖励 | 180+240 | easeOutCubic | P2 | 工资条展开后数值；再次进入不重播已结算入账特效 |
| 广告奖励 | 300 | easeOutQuad | P0 | 平台成功且服务发奖完成后才盖“已领取”章 |
| Rare Event | 420 | easeOutCubic | P2 | 紫边轻扫一次、常规事件容器；不强制震动 |
| Egg Event | 500 | easeOutBack | P2 | 小牛角冒出彩色便签，最多8纸片，不遮选项 |

Modal/Toast基础duration与token对应；其余是该动作局部规格，不在各页面私自改。同一事件由Presenter分发一遍，不能View和Modal同时播放两套金币。

减少动态：无位移/缩放/粒子，opacity100ms或直接状态切换；结果文字与声音独立可用。UI离开/后台/节点回池时停止tween并解除监听，前台恢复读取权威状态，不补播后台累计所有动效。

性能预算为设计目标而非已测结果：目标中低端机稳定30fps以上、争取60fps；主屏同时移动节点<=12，常驻氛围tween<=3，长列表复用10–12可视行。超预算降级顺序：粒子→背景动效→数字补间，保留操作反馈。需Cocos Profiler与微信真机记录验证。
