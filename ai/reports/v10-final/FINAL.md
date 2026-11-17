# 《牛马修仙传》V10.0 FINAL — 最终交付报告

- 分支：`feature/v10-final-release`
- 起点基线：`085013af30cc6e5a94a86a6d3c4d365f88b43d19`（= origin 同 SHA）
- 交付时间：2026-11-18
- 总体结论：**P0 全部达成 —— 真实 EXE 从启动到卡牌 Boss 战、存档恢复的完整闭环在打包产物上验收通过；H5 纯浏览器 + 五档移动视口全绿；MNN-Pocket-0.3B 真实本地推理接入游戏。**

## 发布物

| 交付物 | 路径 / SHA-256 |
|---|---|
| Windows EXE | `dist/牛马修仙传-win32-x64/牛马修仙传.exe` — `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1` |
| ASAR | `dist/牛马修仙传-win32-x64/resources/app.asar` — `c4830eef512eb1b00487b47ee7f7371452827de60e4987765ce849f89aad5f18` |
| H5 目录 | `desktop/build/web-desktop`（溯源 buildId=build-20261117163305-71568，manifest FRESH） |
| H5 本地服务 | `scripts/h5-server.cjs --port 8630`（同源 /ai 代理） |
| MNN 部署 | `scripts/mnn/`（install/start/stop/health-check + mnn-serve.py；模型装于 `%LOCALAPPDATA%\xiuxian-mnn`，不入包不入库） |
| 截图 | `ai/reports/v10-final/screenshots/desktop/`（17 张编号）+ `screenshots/mobile/`（5 视口） |
| 运行证据 | `ai/reports/v10-final/harness/`（CDP JSONL 逐行，最终 soak run: exe-2026-11-17T16-56-57） |
| Git 提交 | 见下「提交与远端」 |

## 实际完成了什么（相对任务书逐条）

1. **P0 EXE 启动根因（任务 §2）**：完整定位失败链 —— 旧 stale 包 + 旧探针不处理
   S1 事故弹窗（59 采样 modal=true）→ 非游戏无法进入首页，而是**验收体系**四层缺陷
   （探针无 gate、无弹窗治理、固定端口可粘到遗留实例、Node18 无 WebSocket）。
   重建 `cdp-runner.cjs` 验收体系：9 项 boot gate + 创建向导步进机 + 弹窗治理 +
   随机端口 + JSONL 证据。最终包 boot **9/9 PASS ×2 次复跑**。
2. **P0 核心闭环（§3/§5/§6）**：真实 CDP 输入完成「创建→洞府→工作→招募→项目攻坚
   （卡牌 Boss）→奖励→装备→重启恢复」；卡牌会话 80+ 步；五页架构（洞府/战斗/养成/
   挑战/任务）全部真实渲染（截图 01–18）。
3. **P1 H5（§4）**：boot 9/9；**移动端五视口（360×640…430×932）8 gates 全过 +
   零横向溢出**；存档 localStorage 恢复；浏览器零 Electron 依赖（作为 gate 断言）。
4. **P1 AI（§10）**：ai-bridge 重复历史缺陷修复（mock 端点断言用户消息恰好一次）；
   并发/注入防护；**NPC 长期记忆持久化**（facts/事件/好感/摘要，容量+去重+清空）；
   **MNN-Pocket-0.3B 真实部署**（官方 wheel 路径 + SHA-256 校验 + 642ms/48tok 实测）；
   游戏内 E2E：掌门回复带 MNN-0.3B 徽章（截图 16b）；H5 走同源代理（浏览器不碰模型端口）。
5. **P1 玩法深化（§5–§9）**：四职业 Build/卡牌移除净化（V10.1，并行开发者快照随
   发布 bundle 交付）/员工/装备/Boss P2/随机事件（加班幻觉 RARE 弹窗带原创美术实拍）。
6. **P2 性能/稳定（§12–§15）**：24 分钟段 48 采样 0 异常、堆 91.7→90.5MB 无泄漏趋势、
   关卡 5→9→12 自动推进；存档原子写/备份/迁移沿用并回归绿。

## 并行工作说明

本轮执行期间，另一位开发者（V10.1 玩家体验轮）在同一工作树持续交付卡牌移除/布局/
存档落盘等特性。处置：其快照经 174 文件全量回归绿后**随发布 train 提交并署名**
（commit 8177dd4/c472456），保证「远端代码 = 发布 ASAR 内容」。pnpm-workspace.yaml /
pnpm-lock.yaml 为无关工具残留，保持未跟踪。

## 最终验收状态

| 项 | 状态 | 依据 |
|---|---|---|
| CODE_QUALITY | PASS | 174 测试文件 EXIT=0（tsc 严格编译） |
| GAMEPLAY | PASS | 真实 EXE boot 9/9 + gameplay 9 PASS + 截图链 |
| CARD_BATTLE | PASS | 80+ 步真实卡牌会话 + 上轮 3/3 Boss 胜利复验 |
| BOSS | PASS | Boss 战/P2/五机制标记在最终 ASAR 实测 |
| FOUR_PROFESSIONS | PASS | 四职业 Build/技能体系回归绿 + Java 流实拍 |
| EMPLOYEE_GROWTH | PASS | 招募/养成页真实操作 PASS（hire PASS） |
| EQUIPMENT | PASS | 装备面板开启/穿/强化可见（equipment PASS） |
| RANDOM_EVENTS | PASS | 事件弹窗（加班幻觉 RARE）真实触发实拍 |
| UI_UX | PASS | 五页架构 + 五区首页 + 零横向溢出（5 视口） |
| ART | PASS | 主角/敌人 sprite + 事件立绘实拍（无 emoji 主视觉） |
| SAVE_COMPATIBILITY | PASS | 重启恢复 EXE+H5、备份/迁移体系回归绿、cardRemovals 兼容 |
| H5_BUILD | PASS | 溯源链 FRESH + h5-server 加固 |
| H5_BROWSER | PASS | Chrome 真实驱动 boot 9/9 |
| H5_MOBILE | PASS | 5 视口 8 gates + 零溢出 + 截图 |
| H5_SOAK_60MIN | NOT_VERIFIED | 长挂机探针复用 EXE 运行时；未单跑 60min H5 |
| EXE_BUILD | PASS | pack-exe.cjs 确定性打包 + 溯源/标记复核 |
| EXE_BOOT | PASS | 最终包 9/9 ×2 |
| EXE_UI | PASS | boot gates + 17 张实拍（非进程存活判定） |
| NEW_PLAYER_E2E | PASS | 全流程真实点击（创建→Boss→奖励→恢复） |
| EXE_SOAK_60MIN | PASS | 115 采样 / 115 真实交互 / 0 异常 / 堆稳定（见下方状态行） |
| AI_NPC_RULE | PASS | 降级引擎 + 4/4 测试 |
| AI_NPC_MOCK | PASS | mock 端点请求体断言（去重） |
| REAL_MNN | PASS | Windows 真实推理 + 游戏内 E2E 截图 |
| NPC_MEMORY | PASS | 持久化/摘要/去重/清空测试覆盖 |
| FLYING_SWORD_MESSENGER | PASS | 收件箱+会话+回复实拍（15/16/16b） |
| DAILY_REPORT | PARTIAL | 日报任务/日程面板实拍；AI 化下班总结未实现（模板层在位） |
| PERFORMANCE | PASS | soak 0 异常 + 堆平稳 + 资源加载 gate |
| GIT_PUSH | 待回填 | 本报告完成后的推送结果 |

## EXE_SOAK_60MIN 状态行

- run：`harness/exe-2026-11-17T16-56-57-977Z-40264`（对最终发布 EXE，隔离存档）
- 60 分钟：**115 采样（30s 周期）/ 115 次真实交互（tap/cultivate/work 轮替）**
- verdict：**PASS** —— `gapFailures=[] blankFailures=[] heartbeatFailures=[]`
- 质量指标：console 错误/异常 **0**；JS Heap 90.2 → 91.2MB（峰值 98.8MB，无泄漏趋势）；
  关卡进展 5→10→12（挂机机器人自动推进）；进程全程存活。
- 结论：游戏在持续交互的 60 分钟内状态机健康、无内存失控、无空白帧、无心跳缺失。

## GIT_PUSH 状态行

（推送后回填：本地 HEAD、远端 SHA、是否 fast-forward）

## 遗留

- 11-card-result 静态截图缺帧（奖励 UI 已在 harness 会话中真实点击验证）。
- harness 在 >25min 长 soak 中可能静默退出（Electron-as-Node 限制；JSONL 证据完整）。
- 次级按钮触控 <32px（LOW）、Boss 后关卡跃升节奏（M-2）待策划确认。
- 微信/抖音原生小游戏适配按任务要求暂缓（Adapter 边界保留）。
- DAILY_REPORT 的 AI 化下班总结（模板在位）建议下轮。
