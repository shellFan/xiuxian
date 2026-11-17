# V10.1 战斗爽感与特效（GAME-FEEL）

复用 V6.1 Game Feel 管线（`desktop/ui-game-feel.js`：ParticleBurst/FloatingNumber/
ScreenShake/SfxSynth），不新增美术资源、不阻塞输入、全部可被 reduced-motion 关闭。

## 一、本轮新增演出

| 演出 | 触发 | 表现 | 约束 |
|---|---|---|---|
| **暴击金色** `crit` | 出牌前后快照对比：日志推进且含「暴击！」，解析实际伤害数字 | 金色「暴击 -N」大飘字 + 金色粒子爆发 + 重震屏 + 暴击音效 | 数字来自真实战斗日志 |
| **击杀消融** `kill` | 敌人 hp>0 → 0 | 目标位置粒子爆散 + `ux-gf-kill` 消融闪白动画 + 轻震屏 | 定位到具体敌人 DOM |
| **Boss 登场** `bossWave` | 波次推进且新波含 BOSS | 全屏横幅「⚔ Boss名 登场」（1.6s 淡出）+ 重震屏 + 音效 | `pointer-events:none` 不阻塞输入；自动移除节点 |
| **连击计数 UI** | 卡牌战斗面板实时显示 `queryAutoBattle().comboCount` | 🔥 连击 ×N 徽章（≥15 变红热态），弹入动画 | 说明文案注明 +2%/击、上限 +50% |
| **打断窗口** | JUDGE 蓄力 | 敌人意图区进度条（金色→绿色可打断） | 见 BOSS-REDESIGN.md |

## 二、既有演出保持（V6.1/V8.0 不回退）

- 出牌飘卡动画 `ux-bc-card.is-playing`、敌人受击红闪 `ux-gf-flash-red`、格挡提示、
  玩家受击震屏、治疗绿字、胜利三色粒子、失败重震、奖励金粒子、技能蓝粒子。
- 修炼点击反馈（暴击/连击/飘字/粒子）——首轮审计误报缺失，已复核确认存在。

## 三、纪律检查

| 要求 | 结论 |
|---|---|
| 特效不遮挡主要信息 | Boss 横幅位于屏幕 22% 高度、1.6s 消失；进度条在敌人卡意图行内 |
| 动画不阻塞输入 | 全部 CSS 动画/粒子 `pointer-events: none`；同步结算无等待 |
| 特效可跳过 | `prefers-reduced-motion` 全局降级（既有规则覆盖新增 keyframes） |
| 粒子数量受控 | 单次 8~16 颗、寿命 ≤1.1s、节点自动移除 |
| 伤害来自真实状态 | 暴击数字解析自引擎权威 `state.log`；不虚构数值 |

## 四、验证方式

- 19 项引擎测试保证状态权威；特效为纯 UI 层（`diffAndFeel` 快照对比）。
- 桌面/移动端真实运行截图见 `screenshots/after/`、`screenshots/mobile/`。
