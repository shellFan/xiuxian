# V5.8 Release Safety Recovery — Round 3 (R3)

日期：2026-10-05
分支：`gameplay-v2`
基线：`4a61f4a`（chore: preserve Codex QA uncommitted desktop UI repair files before R3 stabilization）
状态：**READY FOR INDEPENDENT QA（非 RELEASE CERTIFIED）**

Round 3 目标：修复 Codex 对打包 EXE 独立 QA 发现的 F01–F09，禁止新功能，禁止在 F01–F09 全部关闭并复验前宣称 BLOCKER=0/HIGH=0。

---

## F01（BLOCKER）Nested corrupt 存档必须 fail closed

**根因链（四层全断）**

1. `desktop/storage.cjs` — `loadGame()` 早先把 JSON 解析错误吞掉返回 `null`（= NO_SAVE 语义）→ 上层按新档处理。
   现改为：主存档损坏 → 尝试备份 → 备份也损坏/不存在 → **throw `SAVE_LOAD_FAILED`**。
2. `ElectronStorageAdapter.initialize()` — IPC `success:false` / reject 一律返回 `LOAD_FAILED`（绝不映射为 NO_SAVE）；cache 仅在成功加载后填充。
3. `SaveService.load()` — raw 数据存在但解析/迁移失败时 **throw `SaveLoadError`**（删除 `catch → newPlayerSave()` 的静默新档路径）。空存储（NO_SAVE）仍正常建新档。
4. `CocosBootstrapComponent` — `start()` 改为 async：先 `await` 存储初始化；`LOAD_FAILED` 或 facade 构造抛错 → 显示"存档读取失败"错误屏（含重试按钮），**不创建 facade**；`update()` 加 `if (!this._facade) return;` 守卫。

**F01×F05 交叉防护**：LOAD_FAILED 状态下关闭窗口时，flush 会把空 cache 写盘、用 `{}` 覆盖损坏存档。`doPersist()` 增加 fail-closed 守卫：`LOAD_FAILED` 状态不写盘；cache 为空不写盘。

**打包 EXE 端到端验收（最终产物，run #3）**

- 种子：`%APPDATA%/xiuxian-desktop/xiuxian-save/save.json` 与 `save.backup.json` 均写入非法 JSON（nested corrupt）。
- `SHA256(before)`：save.json `423d5ca4…`，save.backup.json `9213bcbd…`
- 启动打包 EXE，日志确认：`[storage] Primary save corrupted` → `Backup also corrupted` → `[BOOT] Storage initialization result: LOAD_FAILED SAVE_LOAD_FAILED…` → `[BOOT] F01 LOAD_FAILED — refusing to create auto-saving game` → 错误屏渲染，无 facade。
- 等待 **70 秒**（覆盖 60s autosave 周期）→ 优雅关闭（WM_CLOSE）→ 应用正常退出。
- `SHA256(after) == SHA256(before)` ✅（三次独立运行均通过；错误屏路径并上报 `game:ready`，消除 `GAME_BOOT_TIMEOUT` 误报）

## F02 装备存档完整性

`pendingOffer` 从 `as any` 临时挂载改为 `save-data.ts` 正式 `PendingOfferState` 字段 + `normalizePendingOffer()` 归一化；`PlayerData` 构造器完整水合 `ownedEquipment/equippedEquipment/pendingOffer`。回归测试：双轮 save→load 往返后 `ownedEquipment` 精确一致（不再 `[{}]`）、装备槽位与 offer 条目无损。

## F03 团队每日状态跨重启

计数器从 boolean `eventFlags['team_assign_X']`（数值塞进布尔的类型腐坏）改为 `TeamState.dailyAssignment/dailyMentorship` 数值字段。**测试抓到真实残留 bug**：`PlayerData` 构造器水合 teamState 时丢弃两个 daily 计数器（上限重启即重置）——已修复并加往返回归。

## F04 存档失败必须传播

`facade.save()` → `saveService.save()` → `storage.setItem()` 抛错直接向调用方传播（`DISK_FULL` 模拟测试通过）。游戏循环的 autosave catch 保留（防崩溃）但不再静默——输出 `console.error`。

## F05 快速关闭不丢数据（close flush 协议）

- `desktop/main.cjs`：`close` 事件首次拦截 → `preventDefault()` → 下发 close 保存信号 → 等待渲染层 flush 回执（或 2s 安全超时，绝不困住用户）→ 二次 close 放行。
- `desktop/preload.cjs`：新增 `saveFlushed()` 回执通道（`game:save-flushed`）。
- 引导层：保存信号监听在 `onLoad` 注册（fail-closed 模式也即时回执）；close/before-quit 时 `ElectronStorageAdapter.flush()` 强制落盘后 ack。
- `ElectronStorageAdapter.flush()`（去抖 500ms → 立即持久化）+ fail-closed 守卫（见 F01）。

## F06 师徒必须校验成员存在

`mentor()` 先查成员，不存在返回 `{ok:false, reason:'MEMBER_NOT_FOUND'}`，无副作用。回归覆盖。

## F07 Battle DEFEAT/ABORT 终局弹窗 + mentor 数值闭环

mentor 升级消耗 `growth -= REQUIRED_GROWTH[level]`；成员每日 1 次 + 全队每日 2 次上限（数值计数器，跨重启）。战斗 DEFEAT/ABORT 终局弹窗由 ui-overlay 注入兜底 CTA（"返回项目"）。ui-overlay 的 demo/merge 兜底代码（`_demoMode`/`MERGE_COUNT`/合成牛马）已于本轮前移除，残留的误导性日志文案本轮修正。

## F08 构建新鲜度覆盖全部运行时输入

`scripts/build-manifest.cjs` 的 `computeInputsHash()` 实际清单此前漏掉 `storage.cjs`、`game-server.cjs`（`INPUT_PATTERNS` 常量写了但没生效）——已补齐。`generateManifest` 接入 `desktop/package.json#build:copy` 流水线（copy + patch-html 后生成）。`pc:check` = 场景组件注册 + manifest 新鲜度 + overlay SHA 直比，全部 PASS。manifest pin 回归测试通过（8 个 desktop 运行时文件全量入 hash，hash 确定性校验）。

## F09 异步 bootstrap facade-null

`onLoad` 只建 adapter 与注册信号监听，facade 延迟至 async `start()`；`update()` 空守卫；**修复音频生命周期接线时机**（原在 onLoad 调用，facade 尚为 null，`this._facade?.lifecycle.onHide(...)` 静默跳过 → 移至 facade 创建后）。

---

## 测试与构建证据

- 新增 `tests/v58/release-safety-r3.test.ts`：F01 fail-closed（含 SaveLoadError、原始字节不动、二次加载仍失败、NO_SAVE 正常）、F01×F05 adapter fail-closed（LOAD_FAILED/NO_SAVE 空 cache 不写盘、真实保存恰好一次写盘、IPC reject → LOAD_FAILED）、F02 双轮往返、F03 计数器往返、F04 传播、F05 过期 offer 拒绝、F08 manifest pin。
- 旧契约测试按 F01 新契约更新（损坏/未来版本从"静默新档"改为"fail closed"）：`tests/phase2/phase2-stability.test.ts`、`tests/phase3/phase3-integration.test.ts`、`tests/save/save-service.test.ts`、`tests/v2/phase1-core.test.ts`。
- 全套测试：**132 个测试文件全部通过**（`npm test`）。
- 构建：`pc:build`（Cocos web-desktop 全新构建）→ `pc:copy`（+ patch-html + manifest 生成）→ `pc:check` PASS（组件注册 + manifest FRESH + overlay SHA match）。
- 打包：`desktop && npm run pack` → `dist/牛马修仙传-win32-x64/`（electron v28.3.3）。
- F01 端到端：最终 EXE 上 nested corrupt + 70s + 优雅关闭 + SHA 全等（见上）。

## 遗留与建议（非本轮范围）

- `save-data.ts` 顶层 `teamDailyAssignment` 字段与 `TeamState.dailyAssignment` 并存，上限逻辑只用后者，前者为冗余（建议 V5.9 清理）。
- `main.cjs` boot timeout 文案"after 15s"与 `BOOT_TIMEOUT_MS=30000` 不一致（纯文案）。
- 打包缺 `assets/icon.ico`（electron-packager warning，沿用默认图标）。

## 结论

F01–F09 全部修复并通过单元回归 + 打包 EXE 端到端验收。**状态：READY FOR INDEPENDENT QA**——由 Codex 以同一协议（nested corrupt + 真实 EXE + ≥65s + SHA 比对）复验后方可升级认证结论。
