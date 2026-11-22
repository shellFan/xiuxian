# 设计系统（DESIGN_SYSTEM）

> 载体：desktop/ui-overlay.css（4817 行，Design Tokens §1）+ assets/configs/ui-theme.json（canvas 侧候选 token）。
> 本文是 overlay（DOM UI）实际生效的设计系统摘要——所有数值来自代码实测。

## 1. 色彩

| Token | 值 | 用途 |
|---|---|---|
| --ink-bg / --ink-bg-deep | #1d3a55 / #142a40 | 水墨深蓝背景 |
| --ink-header / --ink-ribbon / --ink-nav | #2b4a66 / #2f4d68 / #1c2f40 | 头部/横幅/底部导航 |
| --card-bg / --card-border | #f7efdb / #b09469 | 羊皮纸卡片 |
| --text-ink / --text-ink-muted | #4d3d2a / #8a7a5f | 正文/次要 |
| --gold / --gold-hi / --gold-border | #f0b13c / #f8cf62 / #8a5f1a | 主按钮（工资条金） |
| --blue / --green / --purple / --gray | 各三档 | 功能色（信息/成功/特殊/禁用） |
| --pos / --neg | #4e9e3e / #d84b3a | 正负数值 |
| --fill-blue/orange/green | #4b9cd8/#e8912f/#5cb544 | 进度条 |

ui-theme.json（canvas 侧候选）：primary #176F68（青玉）、paper #FFF5DF、reward #F3C45C——与 overlay 金/纸体系同源。

## 2. 字体/圆角/阴影

- --font-cn：YouYuan/幼圆 → Microsoft YaHei/PingFang 兜底
- --r-card 16px / --r-btn 12px；--shadow-card 双层（外阴影+内高光）

## 3. 组件规范

| 组件 | 规范 |
|---|---|
| 按钮 | .ux-btn--gold（主）/ --gray（次）；--sm/--md/--md 尺寸档；disabled 原因必须可见（UI_QA 规则） |
| 卡片 | .ux-card 羊皮纸+描边；列表项 .ux-recipe-card；空态 emptyState(emoji,txt,hint) |
| 弹窗 | .ux-popup / showDialog（确定取消对）；weekly/事件弹窗各自关闭按钮 |
| 导航 | 底部五 tab（CAVE/BATTLE/GROWTH/PROJECT/TASKS）+ MORE 第六项（V31 恢复） |
| 图标 | .ui-ico 内联 SVG（V31-T4 22 枚）；尺寸 1em/44px(more)/24px(settings wrap) |
| 品质 | 普通无框 / 良品·上品·极品 toast 标签（craft 品质边框差异化 = 待办） |

## 4. 动效

| 场景 | 时长 | 来源 |
|---|---|---|
| 按钮按压 | 80/120ms scale 1→0.96→1 | ui-theme motion.pressedScale |
| 弹窗进出 | 180/140ms | animationDuration |
| toast | 120ms in + 1800ms hold | toast-manager |
| 渡劫成功 | promotion 级演出（GAME_FEEL promotion()） | overlay realmBreakthrough handler |
| reduced-motion | motion.reducedScale=1 直达终态 | animation-dispatcher |

## 5. 移动端规范（MOBILE_UI_GUIDELINES 摘要）

- 主操作热区 ≥88 逻辑 px（触摸热区规范）；
- 六视口实测通过（360×640→430×932，0 溢出）；横屏未强制；
- 安全区：safe-area-service + SafeAreaRoot（canvas）；overlay 顶部留白已适配状态栏。
