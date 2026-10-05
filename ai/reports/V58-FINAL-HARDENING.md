# V5.8 Final Release Hardening — Developer Result

日期：2026-10-05
分支：`gameplay-v2`，基线 `c05f0cb`（本地 = 远端）
状态：**READY FOR INDEPENDENT QA（非 RELEASE CERTIFIED）**

范围：八个领域的真实代码审计 → 复现 → 根因 → 修复 → 打包 EXE 端到端验证。无新功能。

---

## 本轮最重要发现：F02 真正根因（Cocos 转译器 [Set] 污染）

R3 轮修复的 F02（装备存档 [{}]）在打包 EXE 上**仍然复现**：重载会话自动存档后 `ownedEquipment` 变回 `[{}]`，而同一存档在单元测试环境完全正常。

**取证过程**（注入只读探针到打包产物，三层三角定位）：

- 磁盘存档：`ownedEquipment = []`（干净）
- 渲染层 PlayerData（水合后立即）：`[{}]`（已污染）
- 结论：污染发生在**构建转译层**，源码逻辑无误。

**根因**：Cocos SWC 转译把 `[...new Set(x)]` 重写为 `[].concat(new Set(x))` —— 得到 `[Set]`（含一个 Set 对象的数组），`JSON.stringify` 序列化为 `[{}]`。本轮在打包产物中实测确认 4 处 `concat(new Set(`。

**影响面**（每次读档必然触发）：

| 位置 | 字段 | 症状 |
|---|---|---|
| `save-service.ts uniqueIds()` | ownedEquipment / ownedTechniques / activeDemons / firedEvents | 读档即 `[{}]`，装备系统、事件去重全坏 |
| `save-service.ts:224` | handledWelcomeItemIds | 新手欢迎物品每次重发 |
| `player-data.ts uniqueIds()` / `handledWelcomeItemIds` | 同上 | 同上 |
| `evidence-service.ts heldTypes()` | 证据类型 | 反击条件评估失效 |
| `ui/view-models.ts` | 成就分类 | UI 渲染异常 |

**修复**：6 处全部改为 `Array.from(new Set(...))`（项目此前已知的转译器约定，本次是漏网点）。

**防回归护栏（pc:check 产物级扫描）**：`scripts/check-web-v1-build.cjs` 新增构建 bundle 扫描 —— 出现 `concat(new Set(`、`concat(new Map(` 或 `.concat(x.values()/keys()/entries())` 即 FAIL，无论源码写法如何都能拦截此类转译破坏。当前产物扫描 clean。

**EXE 端到端验证**：重置存档 → 启动打包 EXE → 80 秒（覆盖 autosave）→ 优雅关闭 → 存档中 `ownedEquipment []`、`ownedTechniques []` 保持纯字符串数组 ✅

---

## 其余七领域审计结果与修复

### 生命周期
- `GameFacade` 的 onHide/onSaveState 保存调用加 try/catch + 错误日志（storage 抛错不得打断 Cocos 事件分发；PlatformLifecycle 自身的 listener 容错仍在）。
- 引导层：**所有**生命周期保存信号（blur/minimize/autosave/close）都立即 flush 落盘，不再只有 close 才 flush —— 消除 500ms 去抖窗口内在最小化状态下被系统杀进程丢尾数据的风险。

### Electron 持久化
- `ElectronStorageAdapter.doPersist` 检查 IPC `result.success === false`（此前 resolve 但被忽略，磁盘满/权限错误完全静默）。
- `storage.cjs` 原子写链（temp → md5 校验 → backup → rename）复核无误。

### 战斗终局
- 复核确认：tick 尾部统一 `persist(run)`（DEFEAT/VICTORY 均经 tick 路径）、abandon 单独 persist、`claimRewards` 幂等、overlay 通过轮询 `queryFinishedBattle()` + `_battleResultShown` 去重展示终局弹窗 + DEFEAT/ABORT 兜底 CTA —— 终局不变量成立。
- 新增回归：DEFEAT 终局状态 + 30% 奖励 + `queryFinishedBattle` 暴露；ABORT 同契约。

### Team/Mentor
- 新增回归确认：日滚重置正确（数值 day 比较）；per-member mentor 旗标 `mentor_<name>_<day>` 永不清理导致 save 无界膨胀 —— **修复**：mentor 动作时剪枝所有非当日 mentor 键（非 mentor 旗标保留）。

### Runtime 状态机
- burnout 转换检测/takeHalfDayOff、offer 过期双检、workmode 持久化 —— R3 已覆盖，本轮复核无新缺陷。

### 构建可信度
- **icon 缺失修复**：新增 `scripts/make-icon.cjs`（零依赖：代码渲染 256×256 方孔铜钱图案 → 手写 PNG 编码 → PNG-in-ICO 封装）生成 `desktop/assets/icon.ico`，打包告警消失，EXE 有可辨识图标。
- `main.cjs` boot timeout 文案与 `BOOT_TIMEOUT_MS` 统一（原来硬编码 "15s" 实为 30s）。

### 独立 QA 回归
- 新增 **`scripts/qa-smoke.cjs`**：把验收协议固化为一条命令。
  - `--corrupt`（默认）：种子 nested corrupt → SHA 记录 → 启动打包 EXE → 等待 N 秒 → 断言 LOAD_FAILED 标记 / fail-closed 拒绝 / 零写盘 / SHA 不变 → 优雅关闭 → SHA 终验 → 清理现场。
  - `--boot`：干净环境启动 → 断言 GAME_READY / 无 boot timeout / 无读档失败 → 优雅关闭退出。
  - PID 级探活（规避非 ASCII 进程名的 cmd 编码坑）、启动前清理残留实例。
- 最终 EXE 实测：`--corrupt --wait 70` PASS（连续两轮）、`--boot --wait 30` PASS、F02 reload 往返 PASS。

---

## 测试与构建证据

- 新增 `tests/v58/final-hardening.test.ts`（mentor 剪枝 / 日滚 / hide 异常保护 / 战斗终局 ×2）；全套 **133 个测试文件通过**。
- `pc:build` → `pc:copy`（+ manifest）→ `pc:check` PASS（组件注册 + **iterator-spread 扫描 clean** + manifest FRESH + overlay SHA）。
- 打包：`dist/牛马修仙传-win32-x64/`（icon 正常）。
- qa-smoke corrupt/boot/F02-reload 三协议全 PASS。

## 诊断基建（附带交付）

- `desktop/patch-html.cjs` 增加环境变量守卫的探针注入点（`F02_PROBE=1` 时把 `desktop/.probe.tmp.js` 注入 index.html；默认关闭，探针文件不入库）——本轮定位 [Set] 污染的关键工具，供后续同类问题复用。

## 结论

R3 的 F02 修复只覆盖了源码层，真正的根因在构建转译层 —— 本轮以探针取证定位、修复、并建立产物级防回归护栏。八个领域审计完毕，所有修复在最终打包 EXE 上端到端验证通过。**状态：READY FOR INDEPENDENT QA** —— 建议 Codex 优先用 `node scripts/qa-smoke.cjs --corrupt` + `--boot` 复验，并重点回归装备存档跨重启完整性。
