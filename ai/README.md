# AI 自动化流水线

游戏功能验收使用仓库内 [GamePlay Agent](gameplay-agent/README.md)：`npm test` → `npm run pc:build` → `npm run pc:pack` → `npm run gameplay-agent:smoke` → `npm run gameplay-agent:test` → 修复并复测 → 报告 → 提交。正式发布执行 `npm run gameplay-agent:gate`，包含五关实玩与至少 20 分钟真实时长稳定性验证。物理 Windows 输入和 DPI 尚未验收时明确记为 `NOT_VERIFIED`。

安装：`npm install`。Windows PowerShell 可执行 `Copy-Item .env.example .env`，macOS/Linux 可执行 `cp .env.example .env`。

先用 Mock 验证：`npm run ai:check`。检查真实 Provider：`npm run ai:provider-check`。执行指定任务：`npm run ai:task -- TASK-001`；自动选择任务：`npm run ai:dev`；只 Review：`npm run ai:review -- TASK-001`；查看状态：`npm run ai:status`。

真实 Provider 默认由 Codex Luna（Developer）和 Codex Sol（Reviewer）承担，模型分别由 `AI_DEVELOPER_MODEL` 与 `AI_REVIEWER_MODEL` 配置。Provider Check 只调用 `codex --version`，不会修改业务代码。

任务必须放在 `ai/tasks/pending/`，并满足 `ai/schemas/task.schema.json`。任务会在 `pending/running/review/fixing/done/failed/escalated` 目录间移动。`.env` 不入 Git。Mock 是默认 Provider，真实 CLI 通过 `CODEBUDDY_COMMAND`、`CODEX_COMMAND` 配置。
