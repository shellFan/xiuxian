# V10.0 FINAL — 基线与安全报告

## Git 基线（任务开始时逐项核实）

- 分支：`feature/v10-final-release`
- 本地 HEAD：`085013af30cc6e5a94a86a6d3c4d365f88b43d19`（= 已知历史 V10 基线）
- origin/feature/v10-final-release：fetch 后同 SHA（无新提交需同步）
- 工作树：7 个 tracked 修改 + 17 个未跟踪路径（上一轮 V10 QA 的进行中工作），全部记录于
  `tmp/v10-baseline-uncommitted.diff`（589 行）并单独审计。

## 未提交修改的处置（隔离保护原则）

上一轮遗留的进行中工作经逐文件审计后**采纳为 V10 QA/发布基础设施**（与本任务直接相关）：
- `desktop/main.cjs`：XIUXIAN_USER_DATA 运行时隔离 + getRuntimeInfo IPC（EXE 测试不触真实存档）
- `scripts/build-manifest.cjs` / `build-web.cjs` / `copy-web-build.cjs`（新）/ `web-desktop-build-path.cjs`：
  构建溯源链（provenance：before/after 输入哈希 + 输出内容哈希 + 机械新鲜度校验）——
  直接修复上轮 QA 的 B-1/H-1（manifest 被盖新戳而 bundle 是旧的）
- `scripts/h5-server.cjs`：参数解析加固（M-1）+ 同源 AI 代理（本轮新增）
- `tests/v10-final/*`、`scripts/v10-final/*`：CDP 验收 harness + 测试

**不纳入本轮提交**：V10.1 玩家体验轮（并行开发者进行中）——见 FINAL.md「并行工作」。

## 安全约束执行情况

| 约束 | 执行 |
|---|---|
| 不得 force push / 删远程分支 / 重写主分支 | 未违反 |
| 不得 reset --hard / clean -fd / stash 用户修改 | 未违反 |
| 不得清理未跟踪文件 | 未违反（V10.1/QA 文件全部保留） |
| 不触碰真实玩家存档 | 未违反（全部测试走 XIUXIAN_USER_DATA 隔离目录；main.cjs 启动即隔离） |
| 危险命令 | 未执行 rm -rf 于工作区；dist 重建属发布产物重打包 |

## 环境事实（影响所有验证方式）

- 本机无系统 Node/npm；唯一 JS 运行时 = Electron-as-Node v18.18.2（desktop/node_modules 内嵌）。
- 由此产生的适配（全部带测试/验证）：6 个 Electron 子进程测试的 env 隔离修复；
  cdp-runner 自研 RFC6455 WS 客户端（Node18 无全局 WebSocket）；
  build-web/copy/pack 链的 ELECTRON_RUN_AS_NODE 泄漏修复；pack-exe.cjs（process.noAsar）。
- Cocos Creator 3.8.4 在位（pc:build 实测 20s）；Cocos 官方 Windows 包不含 LLM 可执行工具，
  MNN 走 PyPI wheel（见 MNN-DEPLOYMENT.md）。
