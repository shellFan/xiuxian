# V8.0 广告（ADS）与平台报告

## 1. 激励广告（TASK-036/037/038/039）

架构（新增 `assets/scripts/services/platform/rewarded-video-adapter.ts`）：

```text
RewardProvider（既有接口）
  ├ MockRewardProvider（桌面/无 SDK：本地授予，标注来源，绝不伪造广告）
  └ PlatformAdProvider
      ├ WechatRewardedVideoHost（wx.createRewardedVideoAd；isEnded/isComplete）
      ├ DouyinRewardedVideoHost（tt.createRewardedVideoAd；isEnded）
      └ RewardAdPolicy 频控（会话 10 / 每日 20 / 间隔 60s / 取消冷却 30s / 失败冷却 120s）
```

边界实现对照（TASK-036）：

| 要求 | 实现 |
|---|---|
| 自愿触发 | requestReward 仅由玩家点击入口调用 |
| 明确奖励 / 可拒绝 | cancelled 路径完整；失败不扣已有奖励 |
| 完整观看才发奖 | wx: isEnded/isComplete；douyin: isEnded |
| 关闭不发额外奖励 | cancelled → 不发 |
| 重复回调不重复发奖 | 宿主 once 包装 + settled 标志（单测：3 次重复 onClose → 1 次 grant） |
| 频控 | policy.isAllowed() 阻断于 show 之前（单测：AD_POLICY_BLOCKED 且不展示） |

## 2. 测试（TASK-039）

`tests/platform/rewarded-video-adapter.test.ts` **10/10 通过**：
无 SDK 降级 / 微信完整观看 granted / 抖音 granted / 取消 cancelled / 加载失败 failed /
重复回调单次发奖 / 频控阻断不展示 / 双平台单例复用 / 无 adUnitId 回落。

## 3. 平台适配（TASK-035/040~045）

| 平台 | 构建 | 结果 | 真机 |
|---|---|---|---|
| Windows EXE | `npm run pack` | PASS（见 EXE-ACCEPTANCE） | 桌面实测 |
| 微信小游戏 | Cocos CLI `wechatgame` | **PASS**（83s，12 文件：game.json portrait / project.config.json / assets 6.9MB） | BLOCKED（本机无微信开发者工具 + 真机） |
| 抖音小游戏 | Cocos CLI `bytedance-mini-game` | **PARTIAL**（420s 超时，仅 2 文件骨架） | BLOCKED（同上） |

如实声明：
- 广告位 ID 均为空/测试态（configs 缺省 enabled=false）——**不宣称真实广告上线**。
- 微信构建产物 6.9MB assets 超出主包 4MB 限制 —— 发布前需分包/压缩（记录于 RELEASE-CHECKLIST）。
- 平台生命周期/触摸/安全区接口已实现（DouyinPlatformService 镜像 WechatPlatformService），真机验证 BLOCKED。

## 4. 广告频率与体验（TASK-038）

- 无开屏广告；激励广告仅由玩家主动入口触发（离线双倍/宝箱加成/复活类均走 RewardProvider）。
- 广告失败/取消均不扣奖励且进入冷却；策略阻断发生在展示前（不打断战斗）。
