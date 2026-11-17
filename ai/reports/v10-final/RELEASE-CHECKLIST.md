# V10.0 FINAL — 发布清单（RELEASE-CHECKLIST / 交付纪要）

## 发布物

- EXE：`dist/牛马修仙传-win32-x64/牛马修仙传.exe`
  SHA-256 `e10410e805c536b470d4d6938d14d7cf343ac7303da01f97b261ead82aa91cd1`
- ASAR：`dist/牛马修仙传-win32-x64/resources/app.asar`
  SHA-256 `c4830eef512eb1b00487b47ee7f7371452827de60e4987765ce849f89aad5f18`
- H5：`desktop/build/web-desktop`（溯源 manifest FRESH，bundle 标记复核通过）
  本地服务：`ELECTRON_RUN_AS_NODE=1 desktop/node_modules/electron/dist/electron.exe scripts/h5-server.cjs --port 8630`
- 构建溯源：`desktop/build/web-desktop/.xiuxian-build-provenance.json`（buildId=build-20261117163305-71568）
  旧产物归档 `desktop/build/history/web-desktop-20261117163435`

## 发布前检查

| 项 | 状态 |
|---|---|
| 完整测试 | 174 文件 EXIT=0 |
| git diff 审阅 | 已审（tracked 修改分类见 BASELINE.md） |
| 凭据/私钥/敏感信息 | 无（grep 无 key/token/secret 新增） |
| 玩家存档 | 无（全部测试走隔离目录；仓库无存档文件） |
| 临时大文件 | tmp/mnn-probe（270MB 下载件）不入 Git（tmp/ 未跟踪，提交时排除） |
| 报告完整 | ai/reports/v10-final/ 全套 |
| MNN 模型 | 不入 EXE/不入 Git（%LOCALAPPDATA%\xiuxian-mnn，脚本交付） |

## Git 提交计划（分阶段）

1. `chore(v10): adopt in-progress QA infrastructure from working tree` —— 上一轮遗留的
   隔离/溯源/h5-server/harness 基础设施（先单独成提交，清晰归属）。
2. `feat(v10-final): CDP acceptance harness + RFC6455 ws client + pack-exe + provenance fixes` ——
   本轮新增 harness/打包/修复。
3. `feat(v10-final): AI NPC bridge dedupe + NPC long-term memory + H5 same-origin AI proxy` ——
   ai-bridge/main.cjs/preload/ui-overlay/h5-server AI 链 + 测试。
4. `chore(v10-final): MNN deployment scripts + reports + screenshots` —— scripts/mnn + ai/reports/v10-final。
5. 推送 origin/feature/v10-final-release（no force）+ 远端 SHA 核实。

**排除在提交外**：V10.1 并行开发者的进行中玩法改动（assets/scripts、desktop/ui-battle-card.js、
ui-game-feel.js、ui-overlay.css 的 00:44+ 段、scripts/v101、tests/v101、pnpm-*）——归属其作者，
待其完成后另行提交；本轮发布的 ASAR 内容已含其当前快照（174 回归绿），但源码提交权不在本轮。
