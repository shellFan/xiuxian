# V9.0 基线与最终架构报告

## 1. Git 基线

| 项 | 值 |
|---|---|
| 分支 | `v61/gameplay-v2` |
| V9.0 起始 SHA | `8021cd3`（V8.0 交付） |
| 工作区 | 干净，origin 同步 |
| Cocos | 3.8.4 CLI |
| Electron | 28.3.3 |

## 2. V9.0 核心架构决策

### 2.1 五页架构（替代 V8.0 单页布局）

```text
CAVE 洞府    角色成长中心：挑战卡(进入战斗CTA)+角色+目标+入口宫格+合成盘
BATTLE 战斗  独立页：战斗舞台为视觉中心（签名保留，跨页状态持续）
GROWTH 养成  内联面板：招募+装备+羁绊+小队（无遮罩弹窗）
PROJECT 挑战 卡牌 Build / 线上禁地 / 通天塔 / 项目档案
TASKS 任务   每日/七日/成就（保持 V8.0）
```

实现：
- `NAV_TABS` 五项重定义；`renderCurrent` 增加 CAVE/BATTLE/GROWTH 分支
- `renderCave`（洞府）/`renderBattlePage`（战斗页）/`renderGrowthPage`（养页）新增
- 战斗舞台签名保留策略扩展到 BATTLE 页（跨页返回不重挂载/不归零）
- `ui-auto-battle.js` 新增 `hirePanelContent()/equipPanelContent()` 内联模式

### 2.2 移动端 H5

**发现**：DOM Overlay 本身就是 Web 渲染（HTTP 服务 + 无 Electron 强依赖）——
bootstrap 在无 `window.electronAPI` 时自动走 LocalStorageAdapter 分支。
AI NPC 是唯一 Electron IPC 调用点，已有规则降级守卫。

实现：
- `scripts/h5-server.cjs` 独立静态服务器（`node scripts/h5-server.cjs` 即可游玩）
- 移动端 CSS：≤560px 断点（全宽舞台/触摸目标≥44px/安全区 nav/技能栏适配）
- 触摸攻击：overlay 级 `touchend` 即时响应（preventDefault 防合成 click 双发）

### 2.3 修复（本轮发现并关闭）

| 缺陷 | 根因 | 修复 |
|---|---|---|
| 卡牌目标点击间歇失手 | `window.__UI_OVERLAY__` 从未创建——battle-card 5 处 refresh 全部静默失效 | 暴露该桥接（V8.0 遗留判定为「非产品缺陷」是误判，实为真 bug） |
| Boss 态操作条跌出首屏 | V7.1 加高舞台 + Boss 标签行 | Boss 容器 210→175 + 密度压缩，实测 7/7 |

## 3. 验证摘要

| 项 | 结果 |
|---|---|
| 五页路由探针 | 5/5 页渲染 + 战斗跨页状态持续（cave→battle→growth→challenge→tasks→battle-again） |
| H5 纯浏览器（390×844，无 electronAPI） | PASS：创建→洞府→战斗→触摸伤害→localStorage 存档→刷新恢复 |
| 移动宽度扫宽 | 360/375/414/430 四档：0 横向溢出，nav 可达 |
| 桌面四档 | 1280/1366/1600/1920：cave 0溢出0裁切，battle 4/4 控件首屏 |
| 全量回归 | 170 文件 EXIT=0（契约更新：nav 契约 + 家宽契约随 V9.0 架构更新） |
| EXE 60 分钟稳定性 | 见 EXE-ACCEPTANCE.md |

## 4. V9.0 明确不做（如实）

- 微信/抖音真机验收：仍 BLOCKED（无开发者工具/真机；H5 层已为其复用做好架构准备）
- 首页左右分栏深度重构：V9.0 五页拆分是第一步，分栏列布局留给 V9.1
- 音效听感回归：NOT_VERIFIED（无自动化手段）
