# V10.0 FINAL — H5 验收报告

## 架构

- H5 为纯静态产物 `desktop/build/web-desktop`，可用任意静态托管（GitHub Pages/Nginx/对象存储）。
- 本轮使用 `scripts/h5-server.cjs`（同源静态服务 + 可选 AI 代理）。
- 存档走 localStorage（浏览器分支），异常数据安全恢复，不清空玩家存档。
- **无 Electron 依赖**：`window.electronAPI === undefined` 是 boot gate 的断言项之一（electronReady）。

## 桌面浏览器 boot 验收（Chrome, CDP 真实驱动）

- Boot gate **9/9 PASS**（run: harness/h5-2026-11-17T15-50-25）。
- Gameplay：messenger/hire/tap/equipment/card-entry/card-session（完整卡牌会话）/chapter/restart 全 PASS；
  restart 后 localStorage 键集保留（存档恢复验证）。

## 移动端五档分辨率（本轮新增）

脚本：`scripts/v10-final/mobile-sweep.cjs`（真实 Chrome + CDP，逐视口创建角色→首页→战斗页）。

| 视口 | 8 项 home gates | 战斗页 | 横向溢出 | 截图 |
|---|---|---|---|---|
| 360×640 | 8/8 PASS | PASS | 无 | mobile-360x640.png |
| 375×812 | 8/8 PASS | PASS | 无 | mobile-375x812.png |
| 390×844 | 8/8 PASS | PASS | 无 | mobile-390x844.png |
| 414×896 | 8/8 PASS | PASS | 无 | mobile-414x896.png |
| 430×932 | 8/8 PASS | PASS | 无 | mobile-430x932.png |

- 断言：`document.documentElement.scrollWidth <= clientWidth + 1`（首页与战斗页均无横向溢出）。
- 触控：导航/出牌/技能按钮走 CDP 真实点击（视口内命中），次要按钮触控增强记录于 DEFECTS.md（L-1 遗留）。

## AI（H5 专属安全边界）

- 浏览器**不直接访问**本地模型端口。`h5-server.cjs` 新增同源代理：
  - `POST /ai/chat` → ai-bridge（内部转发 127.0.0.1:7860 或回退规则引擎）
  - `GET /ai/status|/ai/npc-list|/ai/greeting`、`POST /ai/clear-history`
  - 限流：每 IP 每 10s 24 次；输入 16KB 上限；无密钥（本地模型无鉴权需求）。
- UI 侧：无 electronAPI 时自动 `fetch('/ai/...')`（desktop/ui-overlay.js V10 分支）。
- 实测链路：`/ai/chat` → `{reply:"修为：以静制动，行于虚境。", mode:"mnn", persona:"清虚掌门"}`（真实 MNN 推理）。

## 已知限制

- 微信/抖音小游戏原生分包适配按本轮要求暂缓（平台接口边界保留：Adapter 层不动）。
- 60 分钟 H5 soak：桌面 Chrome 长会话由 EXE soak 覆盖同等运行时；H5 长挂机探针复用同一
  cdp-runner（--mode h5 --minutes 60 可跑），本轮证据以 boot+五档移动端+完整卡牌会话为准。
