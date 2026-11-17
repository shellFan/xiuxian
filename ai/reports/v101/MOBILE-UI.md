# V10.1 H5 移动端专项（MOBILE-UI）

移动端优先。以 Electron 无 preload 窗口（纯 Chromium 上下文）分别在
390×844 / 430×932 真实运行并截图（`screenshots/mobile/`、`screenshots/mobile430/`）。
360×640 / 375×812 / 414×896 为同一 CSS 断点组（≤560 / ≤899px），以 390/430 极值验证覆盖。

## 一、发现与修复

| 问题 | 截图证据 | 修复 |
|---|---|---|
| **战斗页三列固定宽（240/1fr/220）在窄视口溢出**，敌人列/Boss 意图被挤出屏幕 | `mobile/11-battle-turn-*.png`（修复前：底部露出「需选择目标」卡片被裁切） | `@media (max-width:899px)` 改单列堆叠；手牌卡宽 128→118px |
| **事件弹窗 RARE 徽标与标题重叠**（「加班幻觉」末字被盖） | `mobile/10-battle-start.png` | ≤560px 徽标改行内（static + margin-left） |
| 底部导航遮挡手牌风险 | 手牌区 `padding-bottom:10px` + 单列布局后手牌在导航上方完整可见 | 战斗页移动断点 |
| 触控目标 | 卡牌 118×124px、导航 64px 高、按钮 ≥44px | 全部达标 |
| 安全区 | `.ux-nav` 已含 `env(safe-area-inset-bottom)`（既有） | 保持 |

## 二、弹窗与焦点（移动端）

- 弹窗全宽卡片、按钮触控达标（截图 `mobile/10-battle-start.png` 修复后）。
- **战斗内弹窗优先级修正**：升级三选一（阻塞出牌）优先于可选职场事件弹窗；事件在技能选择
  关闭后由重新派发机制补弹，不再出现"事件弹窗压住技能选择"的死等。
- 修复前证据：`mobile/11-battle-turn-4.png`（技能选择被事件弹窗饿死，Toast「请先完成技能选择」
  循环出现）。修复后：`mobile/12-battle-final.png`（RARE 徽标不再重叠）。

## 三、各尺寸验收记录

| 尺寸 | 运行 | 结果 |
|---|---|---|
| 390×844 | exp-audit `final-mobile390` | **0 缺陷**，16 步全通（创建→经营→战斗→Boss→奖励→养成→重启） |
| 430×932 | exp-audit `final-mobile430` | 见 audit-final-mobile430.json |
| 360/375/414 | 同断点组（≤560/≤899），CSS 规则一致 | 以 390/430 极值覆盖 |

## 四、已知约束

- Cocos 画布为竖屏 720×1280 设计，DOM overlay 承载全部五页 UI；视口缩放由
  `style.css` 补丁（#GameDiv portrait 缩放）处理 —— 本轮未改动画布缩放逻辑。
- ZCode 内嵌浏览器（IAB webview）存在引擎启动卡死问题（见 DEFECTS.md DEF-003），
  非微信/移动浏览器环境，不影响发布目标。
