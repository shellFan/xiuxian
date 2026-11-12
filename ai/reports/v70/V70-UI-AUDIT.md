# V7.0 UI/UX 审计报告（TASK-011/013~021）

对照物：`screenshots/before/`（修复前，V6.8 交付态 + 新发现的 P0/P1）与
`screenshots/round3b/`、`screenshots/resolution/`、`screenshots/exe/`（修复后）。

## 1. 修复前问题清单（Before 审计）

| # | 问题 | 级别 | 证据 |
|---|---|---|---|
| U1 | 「飞剑传书」关键消息弹窗每条新事故重复弹出，盖住整个战斗舞台（03/04/09/16 四张截图全部被遮） | P0 | before/03-home.png 等 |
| U2 | 创建完成即第 5 关 Boss（推荐 815 vs 战力 241），新手第一屏就是超纲 Boss | P0 | before/03-home.png |
| U3 | 「事件结果」职场事件弹窗在到达首页瞬间弹出 | P1 | round2/03-home.png |
| U4 | Toast 显示在顶部资源卡行上（两条堆叠时完全遮住修为/工资/道心/绩效） | P1 | round1/03-home.png |
| U5 | 推荐 565 vs 战力 241（第 2 关）——红色推荐警告从第 1 关起永不消失 | P1 | round1/03-home.png |
| U6 | 敌人 sprite 140px 偏小，战斗舞台视觉重心弱 | P2 | before/03-home.png |
| U7 | 场景图 640×320 被 cover 拉伸：月亮切半在右缘、窗户裁出左缘 | P2 | before 全部 |
| U8 | 招募「+」按钮无价格提示 | P2 | before/12-squad-hire.png |
| U9 | 操作条随 U6 放大后被底栏截断（放大引入的回归） | P1 | round3/03-home.png |

## 2. 修复与验证

| # | 修复 | 层 | 验证 |
|---|---|---|---|
| U1 | 关键消息降级为一次性 Toast + 📨 角标（S1 事故保留强打断） | overlay | round1 全程无弹窗遮盖；EXE soak 弹窗计数正常 |
| U2 | 服务层创建门控（P0-1） | service | round1/2/3b 全部第 1~2 关起步 |
| U3 | 入职安静期（服务层 90 游戏分钟 + overlay 25 秒仲裁宽限） | 双层 | round3b 首页无事件弹窗 |
| U4 | Toast 容器移至舞台下沿（top:120 → bottom:92/76） | overlay css | round1 后不再遮挡资源行 |
| U5 | recommendedPowerFor 分段校准（300×1.13^(s-1) / 1014×1.041^(s-11)） | service | round3b 第 1 关推荐 300 vs 战力 241（无红色警告） |
| U6 | 敌人 sprite 1.2→1.45（Boss 1.5→1.8）+ 舞台容器 158×150/210×200 | overlay | round3b 视觉重心显著增强 |
| U7 | 场景图重生成 640×480（月亮/窗户完整入画） | assets | round3b + EXE |
| U8 | 招募价格 + 灵石余额显示，不足置灰 | overlay+service(view) | 代码+EXE |
| U9 | 舞台容器回调 158×150 后操作条完整可见 | overlay css | round3b reachability 7/7 |

## 3. 布局与多分辨率（TASK-021）

| 分辨率 | 首屏控件 | 溢出 | 裁切文本 | 舞台 |
|---|---|---|---|---|
| 1280×720 | 7/7 | 无 | 0 | 640×463 |
| 1366×768 | 7/7 | 无 | 0 | 640×463 |
| 1600×900 | 7/7 | 无 | 0 | 640×463 |
| 1920×1080 | 7/7 | 无 | 0 | 640×463 |

内容列 640px 居中 + 全宽导航的既有格局保留（V6.8 遗留 PARTIAL 项，本轮未重构
信息架构 —— 见 V70-ISSUES.md 剩余项）。

## 4. 弹窗仲裁健康度（修复后实测）

- 关键消息：不再弹 modal（Toast + 角标）
- 职场事件：可正常出现并可被应答（卡牌 E2E 中实测应答「知道了」成功）
- 升级三选一：BATTLE_SKILL 优先级 8，不再被饿死
- S1 事故：保留强打断
- 离线决策/周末/结算：保留原有路径
- 新玩家 25 秒宽限：只压 INFO/DAILY/WORKPLACE，不压 S1/PENDING
