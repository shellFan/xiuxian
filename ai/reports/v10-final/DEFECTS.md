# V10.0 FINAL — 缺陷与整改记录（DEFECTS / TEST-MATRIX 合卷）

## 本轮发现并已整改

| 级别 | 缺陷 | 整改 | 验证 |
|---|---|---|---|
| BLOCKER(流程) | 最终发布链在「无系统 Node」环境下断裂：electron-packager zip 解压损坏（Invalid default_app.asar）、fs.cpSync 被 Electron asar 虚拟文件系统破坏 | `scripts/pack-exe.cjs`：process.noAsar + 本地 dist 直拷 + asar pack + rcedit 图标/版本戳 | ASAR 标记复核 + boot 9/9 |
| HIGH | copy-web-build 路径守卫错误（源在 <repo>/build，守卫用 desktop/build → 全部拷贝被拒） | 增加 cocosBuildRoot 校验根 | copy PASS + verifyManifest FRESH |
| HIGH | build-web/copy/pack 子进程继承 ELECTRON_RUN_AS_NODE → Cocos/EXE 全部以纯 Node 启动失败 | 各 spawn 前删除该 env | Cocos 20s 构建 + EXE spawn 正常 |
| HIGH | cdp-runner 在 Node18 无全局 WebSocket，无法运行 | 自研 RFC6455 最小客户端 scripts/v10-final/ws-client.cjs | 全部 CDP 会话经其驱动 |
| HIGH | 失败 soak 根因链（上轮遗留 P0）：旧包+探针不处理 S1 事故弹窗 → 59 采样 modal=true | 新 harness：9 项 boot gate + 向导步进机 + 弹窗治理 + 随机端口（防粘错实例）+ JSONL 逐行证据 | 真实 EXE boot 9/9（详见 EXE-ACCEPTANCE.md） |
| MEDIUM | harness 向导机缺 IDENTITY.background/DESTINY/CONFIRM 步骤（advance 死循环） | 步进机补全（save-identity/background/candidate/finalize/start-game） | 创建向导 100% 自动通过 |
| MEDIUM | ai-bridge 重复历史消息（push 后传 live 数组 → 模型收到两份用户消息） | push 前快照；mock 端点断言恰好一次 | 4/4 ai-bridge 测试 |
| MEDIUM | 6 个 Electron 子进程测试在 Electron-as-Node 环境误入错误分支 | 分支条件 + 子进程 env 删除 | 174 文件回归全绿 |
| LOW | task6-layout 契约测试仍断言旧 cpSync | 更新为 copy-web-build 契约（断言更强） | 回归绿 |

## 遗留（如实标注）

- L-1（沿 v10-qa）：9 个次级按钮 <32px 触控（次要操作）。
- L-2：harness 在长 soak（>25min）中可能静默退出（Electron-as-Node 运行时限制），
  manifest.jsonl 逐行落盘保证证据完整；正式机上以系统 Node 运行可根治。
- M-2（沿 v10-qa）：Boss 通关后关卡跃升节奏（12→40）待策划确认。
- 11-card-result 截图未捕获（奖励结算 UI 在 harness 会话中已验证，静态截图缺帧）。

## 测试矩阵（TEST-MATRIX）

| 域 | 证据 | 状态 |
|---|---|---|
| 单元/集成回归 | tests/run-all.cjs 174 文件 EXIT=0 | PASS |
| EXE boot（最终包） | harness exe-…16-38/16-55：9/9 gates ×2 | PASS |
| EXE gameplay | work/messenger/hire/tap/equipment/card-entry/card-session/chapter/restart PASS | PASS |
| 卡牌完整会话 | card-battle-session 80+ 步（真实点击） | PASS |
| H5 boot | harness h5-…15-50：9/9 | PASS |
| H5 移动端 5 视口 | mobile-sweep.json：8 gates ×5 + 零溢出 | PASS |
| AI 规则/mock/真实 | ai-bridge 4/4 + 真实 MNN 推理 + 游戏内 E2E 截图 | PASS |
| NPC 记忆持久化 | ai-bridge 测试 4 | PASS |
| 存档安全/重启 | restart PASS（EXE+H5）+ 隔离目录 | PASS |
| EXE 60min soak | 见 FINAL.md 状态行 | 见 FINAL.md |
| 数值模拟 | 未新增 | PARTIAL |
