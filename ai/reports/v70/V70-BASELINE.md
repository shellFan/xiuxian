# V7.0 基线审计（真实执行）

生成时间：2026-11-12 23:5x（GMT+8） · 执行模型：GLM-5.3 · 判定：基线可运行，存在 2 项 P0（其一为 V6.8 遗留 BLOCKED 服务层问题）

## 1. Git 基线

| 项 | 实际值 |
|---|---|
| 仓库根 | `D:/git/fan/xiuxian` |
| 当前分支 | `v61/gameplay-v2` |
| V7.0 起始 SHA | `877fcb5`（chore(v70): preserve pending V6.8 working-tree fixes） |
| 前序 HEAD | `f75f4ee` fix(v68): ship V6.6 sprite sheets into desktop build and harden EXE soak |
| 远端 | `origin https://github.com/shellFan/xiuxian.git` |
| V6.7 / V6.9 | 不存在（`git log` 无对应提交）；实际序列为 V6.6 → V6.8 → V7.0 |
| 工作区 | 启动时存在上一轮（V6.8）遗留未提交修复，已以独立提交 `877fcb5` 保护（save-service normalizeV64* 补齐、clockV2.realNow 修正、2 个测试契约更新、ai/work 调试脚本），未覆盖任何一行 |

## 2. 工具链（本机实际）

| 项 | 值 |
|---|---|
| Node | v24.14.1（`D:/hclaw/node/node.exe`，不在默认 PATH，命令中显式注入） |
| npm | 11.11.0 |
| TypeScript | 5.6.3（`npm run build:game` PASS） |
| Cocos Creator | **3.8.4**（`C:\ProgramData\cocos\editors\Creator\3.8.4\CocosCreator.exe`）→ 服务层改动可真实进入游戏 |
| Electron | 28.3.3（desktop/node_modules/electron/dist/electron.exe） |

## 3. 实际构建命令与产物

| 步骤 | 命令 | 结果 |
|---|---|---|
| 服务层构建 | `npm run pc:build`（Cocos CLI → `build/web-desktop-current/web-desktop`） | PASS（21s，exit 0/36 accepted） |
| 桌面同步 | `npm run pc:copy`（copy → patch-html 注入 overlay → build-manifest） | PASS（70 张 sprite sheets + ui-slice 44 张注入确认） |
| 全量测试 | `npm test` | **169 个测试文件全绿**（基线 EXIT=0） |
| 打包 | `cd desktop && npm run pack` | 后置（EXE 验收阶段执行） |

## 4. 运行时架构（核实）

```text
Cocos 场景(cocos-bootstrap-component.ts)
  → storage 加载 → GameFacade 创建 → facade.start()（autoBattle.ensureStarted / aiCommentator.attach）
  → GameLoop tick → 各 Service（权威状态）
DOM Overlay（desktop/ui-overlay*.js + css，patch-html 注入 index.html）
  → window.__GAME_FACADE__ 桥接 → query* 快照渲染 → data-action 事件回写服务层
Electron(main.cjs) → 本地 HTTP GameServer 服务 web-desktop → BrowserWindow 1280×720
存档 storage.cjs → XIUXIAN_USER_DATA 隔离（自动化全程使用）
```

UI 真实渲染层是 DOM overlay；Cocos canvas 仅竖屏 720×1280（适配后仅占左侧 385px）。

## 5. 运行环境关键约束（本次踩坑实录）

1. ZCode Bash 直接子进程环境无法启动 Electron（默认应用也秒退、无任何输出）。
   **解法**：PowerShell `Start-Process` 启动（`ai/work/v70-run-play.ps1`），harness 自写文件日志/截图/JSON，不依赖 stdout。
2. `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` 需显式清除（与 V6.8 记录一致）。
3. harness 入口目录必须含 `package.json`（`tmp/v70-app/`），否则 Electron 无法解析入口直接退出。

## 6. Before 真实试玩（全新隔离存档 tmp/v70-userdata-before）

证据：`v70-before-play.json` + `screenshots/before/`（16 张）+ 隔离存档 save.json。

| 检查 | 结果 |
|---|---|
| 启动 | GAME_READY，无异常（exceptions=0, consoleErrors=0） |
| 创建向导 | 17 轮真实 DOM 点击走通，homeReached=true |
| 首屏可达性 | 7/7 核心控件在首屏（V6.8 修复保持） |
| 控件审计 | 72 个可见控件；**tapAttack 被弹窗遮挡** |
| 交互 | tap-attack✓ skill1✓ skill2✓ speed✓；**skill3/4 锁定态无 data-action（设计如此，显示🔒N关+tooltip）** |
| 面板 | 装备✓ 目标✓ 招募✓ 塔入口✓；宝箱/卡牌入口在 Boss 未败时不存在（BOSS_PENDING 设计） |
| 存档 | save.json + save.backup.json 正常写入（13.6KB） |
| **P0-1** | **创建完成即第 5 关 Boss「产品总监·画饼真人」（推荐 815 / 战力 241）**——V6.8 遗留服务层问题真实复现（场景加载即 ensureStarted，战斗在创建期间持续推进） |
| **P0-2** | **「飞剑传书」关键消息弹窗在 03/04/09/16 全部截图重复出现**——每条新事故重新弹 modal，盖住整个战斗舞台 |
| P1 | 新玩家 30 分钟节奏：创建期被弹窗遮挡 + 直接面对超纲 Boss，无成长引导 |

## 7. 第一轮修复（P0，已实施）

| 问题 | 修复 | 层 | 验证 |
|---|---|---|---|
| P0-1 创建期自动推关 | `auto-battle-service.ts`：`isCreationGated()`（`characterSetupStatus==='CREATION_REQUIRED'`）门控 `ensureStarted/tick/settleOffline`；lastTickAt 照常更新防止把创建时长结算为离线收益 | 服务层（Cocos 重建后生效） | 4 项新单测通过 |
| P0-2 关键消息弹窗洪水 | `ui-overlay.js`：CRITICAL_MESSAGE 从自动 modal 降级为一次性 Toast + 📨 角标（S1 事故保留强打断） | overlay 层 | 语法 PASS，After 试玩复验 |

回归与复验：全量测试 + 重建 + Before 同流程复跑（见 V70-TEST-MATRIX.md）。

## 8. 已知待办（进入后续轮次）

- Boss 死局验证：高防 Boss + 战力不足时是否永久卡关（敌人攻击只扣护盾，玩家不会 DEFEAT）→ 数值模拟 TASK-051。
- 首页信息架构/视觉重心（V6.8 PARTIAL 遗留）。
- 卡牌战斗、晋升、羁绊、装备端到端 NOT_VERIFIED 项。
- 30 分钟新手试玩、60 分钟稳定性、EXE 打包验收。
