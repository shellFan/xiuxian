# V10.1 UI/UX 规范（UI_UX_GUIDELINES）

> 依据：docs/UI-DESIGN-SYSTEM.md + ui-theme.json + 本轮页面实测截图。新 UI 必须遵守。

## 1. 视觉基调（全页面统一）

| 项 | 规范 |
|---|---|
| 主视觉 | 深蓝夜空底（#0e1626 系），青蓝科技光效点缀 |
| 金色 | 修仙装饰 + 稀有/增益强调（ux-btn--gold：广告增益、领取主按钮） |
| 紫色 | 史诗稀有（RARITY_COLORS[3] #c084fc）；传说金 #fbbf24 |
| 语义色 | 成功 #4ade80 / 警告橙 / 危险 #f87171 / 中性灰 #9ca3af |
| 字体层级 | 标题 900 字重 + letter-spacing；正文 15-20px；数值 800-900 字重 |
| 圆角/阴影 | 卡片圆角 9-16px；弹窗 16px；按钮统一 ux-btn 体系 |

## 2. 按钮体系（ux-btn 家族）

- 变体：`--gold`（增益/主推进）/ `--blue`（主视觉动作）/ `--green` / `--gray`（次级）
- 尺寸：`--sm` 24px / `--md` 27px / `--lg` 33px；移动端断点缩放（@media 内 18-24px）
- 层级原则：**一屏一个金色主按钮**；增益类（广告）金、保底类（正常领取）蓝（本轮离线简报先例）
- 触控目标 ≥32px（V10.2 已加 ::after 外扩热区，沿用）

## 3. 弹窗规范

- 层级仲裁：S1 事故 > 待决策 > 欢迎简报 > 晋升/教程 > 职场事件 > 日结算（dispatchNextModal）
- 弹窗层单实例（#PopupLayer 复用）；关闭必须 closePopup()（触发 V2 复位 + redispatch）
- **禁止**：弹窗遮挡关键操作不给出路；启动弹窗失败时把玩家卡死（必须 fallback 关闭——简报先例）
- 广告弹窗：3s 模拟倒计时（dev）+ 取消按钮；取消不发放奖励

## 4. 反馈规范（game-feel 口径）

- 数值变化：飘字（floating-reward，tween 驱动节点 position+opacity——QA-BUG-005 修复后口径）
- 领取成功：toast（success/warning/error 三级）；音效随 ui-sfx 14 事件映射
- 战斗反馈：伤害飘字/金币入账/击杀结算/AI 点评气泡；按钮点击音

## 5. 页面清单与实测状态（本轮巡检）

| 页面 | 入口 | 状态 |
|---|---|---|
| 主页（五区域） | 默认 | ✅ 截图核验（diag-home-state） |
| 人际页 | 主页快捷「人际」 | ✅ 本轮新增增益卡（v101-npc-buffs.png） |
| 装备面板 | 战斗屏「⚔️ 装备」 | ✅ 本轮新增推荐按钮（v101-equip-reco-btn.png） |
| 离线简报 | 启动弹窗 | ✅ 本轮新增广告入口（v101-welcome-double-btn.png） |
| 其余 12 屏 | 导航 | 上轮 mobile-sweep 5 视口 PASS（无横向溢出） |

## 6. 禁止项（回归红线）
- 面板容器 `stopPropagation` 吞按钮冒泡（QA-BUG-015 口径：仅空白处阻止）
- 游离对象 tween（必须驱动真实节点）
- 双份状态（UI 层只读投影 + 命令转发，数值权威在 facade）
- 未经 game-ui-ux 检查的新面板直接上线（anchor/safe-area/溢出三查）
