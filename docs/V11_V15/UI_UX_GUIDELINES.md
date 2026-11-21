# UI/UX 指南（V11_V15/UI_UX_GUIDELINES）

> 权威规范入口：docs/GAMEDEV_SKILLS/UI_UX_GUIDELINES.md（token/安全区/层级/可访问性）。
> 本文件记录 V11 双端 UI 架构现状与本轮变更，不重复 token 定义。

## 1. 双端架构（关键认知）

本项目 UI 是**双面架构**，改 UI 必须明确目标面：

| 面 | 载体 | 页面集 | 设置/音频 |
|---|---|---|---|
| Canvas（Cocos） | 单场景节点 + game-ui-controller 绑定 | 洞府/职场/修仙/功法页等 canvas 页 | settings-page-component（S3 已接线真实开关/音量） |
| Overlay（DOM） | desktop/ui-overlay*.js | 五页导航（洞府/战斗/养成/挑战/任务）+ MORE 网格（功法/法宝/人际/合成/宗门/排行榜/成就/图鉴/设置/结算） | renderSettings（F2 已统一到 context.settings） |

## 2. V11 变更

- **MORE 第六导航项恢复**（P1 回归修复：8 页不可达 → 全部可达）
- overlay 炼丹卡：成功率/品质上限展示 + 成功 toast 带品质标签
- overlay 设置：真实状态渲染（此前硬编码「开」）+ 开关持久化
- 排行榜页（canvas）：四榜切换（RefreshButton 复用）+ 「本地模拟」标记

## 3. 本轮验收基线（真实运行证据）

- 探针 8/8：新档→炼丹（成功率90% 卡片）→成就→设置→开关翻转，Chrome 430×932
- 截图：artifacts/V11_V15/screenshots/01–08

## 4. 已知缺口（→BACKLOG）

| 缺口 | 说明 |
|---|---|
| F4 Emoji 图标 | 更多菜单/成就图标为 Emoji（任务书禁作正式图标）→ 美术资产（与 E3 同源） |
| canvas 榜单切换视觉证据 | RefreshButton 绑定+单测在位，缺 canvas 截图（坐标点击脆弱） |
| 三套设置面残余差异 | overlay 开关即时作用于 WebAudio；canvas AudioService 下次启动应用（可接受，记录在案） |
| 750×1334 vs 720×1280 | 设计分辨率口径冲突待裁决（GAMEDEV_SKILLS D-011） |
| 加载/错误/空态覆盖 | UI-STATE-MATRIX 为规范源；overlay 页已有空态（emptyState），canvas 页未全量核对 |
