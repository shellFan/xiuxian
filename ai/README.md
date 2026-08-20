# AI 自动化流水线

安装：`npm install`。Windows PowerShell 可执行 `Copy-Item .env.example .env`，macOS/Linux 可执行 `cp .env.example .env`。

先用 Mock 验证：`npm run ai:check`。执行指定任务：`npm run ai:task -- TASK-001`；自动选择任务：`npm run ai:dev`；只 Review：`npm run ai:review -- TASK-001`；查看状态：`npm run ai:status`。

任务必须放在 `ai/tasks/pending/`，并满足 `ai/schemas/task.schema.json`。任务会在 `pending/running/review/fixing/done/failed/escalated` 目录间移动。`.env` 不入 Git。Mock 是默认 Provider，真实 CLI 通过 `CODEBUDDY_COMMAND`、`CODEX_COMMAND` 配置。
