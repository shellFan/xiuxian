# V10.1 五页面 UI/UX 重构总览（UI-UX-REDESIGN）

本轮不推翻 V9.1 五页面信息架构（洞府/战斗/养成/挑战/任务），在其上做减法与层级修正：

1. 洞府首页：主角区回归紧凑横排（CSS 泄漏修复）+ 桌面端 hero|today 并排
   → 第一屏 = 资源 + 目标 + 主角 + 今日修行（HOME-REDESIGN.md）。
2. 战斗页：移动端单列修复 + 打断窗口/连击徽章（BATTLE-UI.md）。
3. 养成页：结构保留（GROWTH-UI.md）。
4. 挑战页：卡组区升级为「构筑中心」（倾向/净化/图鉴，CARD-BATTLE-REDESIGN.md）。
5. 任务页：保留（审查无阻断问题）。

Design Token：新增组件全部复用既有颜色/圆角/边框体系；无新增 Emoji 功能图标；
移动端触控目标 ≥44px；`prefers-reduced-motion` 全局降级保持。
