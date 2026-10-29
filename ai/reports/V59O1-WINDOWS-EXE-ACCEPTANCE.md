# V5.9-O.1 Windows EXE 验收

## 总结

`PLAYABLE_BUILD=BLOCKED`，`EXE_UI_E2E=BLOCKED`，`EXE_SMOKE=BLOCKED`，`20_MINUTE_SOAK=NOT_VERIFIED`，`PHYSICAL_INPUT=NOT_VERIFIED`。本机没有成功构建或启动本轮 EXE；没有把 headless、服务层测试或旧版二进制表述为真实 EXE 试玩。

## 环境隔离

- 源仓库指定路径 `F:\github\xiuxian` 在当前执行环境不存在；用户要求的工作目录因此改用独立克隆 `C:\Users\fan\.codex\projects\xiuxian-v59o1`。原目录 `D:\git\fan\xiuxian` 有用户既存未提交改动，本轮没有修改或清理它。
- 本轮未启动 Electron，也未设置/访问真实玩家存档路径；`XIUXIAN_USER_DATA` 隔离验证未进行。
- 没有声称已验证 Electron 主进程、Cocos 存档路径或隔离存档读写。

## 构建阻塞证据

1. `node scripts/build-web.cjs` 退出码 1，输出 `COCOS_NOT_FOUND: Cocos Creator not found. Set COCOS_CREATOR env var or install to C:\ProgramData\cocos\editors\Creator`。Creator 安装目录及 `COCOS_CREATOR` 均不存在。
2. 安装 Electron 28.3.3 包时，postinstall 下载可执行运行时连接 `20.205.243.166:443` 超时（`ETIMEDOUT`）。`desktop/node_modules/electron/dist/electron.exe` 不存在，故无法打包或启动真实 EXE。
3. Node v24.22.1 与 pnpm v11.25.0 可用；系统未发现 npm 命令。TypeScript CLI 可用并完成基线类型检查。

## 验收项目

| 项目 | 状态 | 结果 |
|---|---|---|
| Cocos 最新源码构建 | BLOCKED | Creator 缺失 |
| Electron 打包 | BLOCKED | Electron 二进制下载超时 |
| EXE 路径 / SHA-256 | NOT_VERIFIED | 未生成 EXE |
| ASAR SHA-256 | NOT_VERIFIED | 未生成 ASAR |
| 隔离存档、角色创建及战斗恢复 | NOT_VERIFIED | 未启动应用 |
| 可见 UI 卡牌操作 | BLOCKED | 无可启动 EXE |
| DOM/CDP 自动化 | NOT_VERIFIED | 无 Electron 渲染器 |
| 鼠标键盘物理输入 | NOT_VERIFIED | 未执行 |
| 20 分钟稳定性 soak | NOT_VERIFIED | 未执行；耗时不是本次阻塞理由，缺少可运行构建 |
| 内存、Renderer 崩溃、CDP 状态 | NOT_VERIFIED | 无运行进程 |

## 其他测试

- TypeScript 基线检查退出码 0。
- 全量测试退出码 1：在 Electron DOM 测试初始化时因为缺少 Electron 二进制而停止。前置测试有部分运行，但不能记为完整通过。
- GamePlay Agent 及 30/100 日模拟未执行。

## 交付物哈希

- EXE：无；SHA-256：N/A。
- ASAR：无；SHA-256：N/A。
- UI 截图：无。
- 测试存档：未创建。
