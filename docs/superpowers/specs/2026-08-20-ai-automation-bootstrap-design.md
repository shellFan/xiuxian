# 《牛马修仙传》AI 自动化基础设施设计

## 目标

在本机单仓库内建立可长期使用的 AI 自动开发流水线基础设施：ChatGPT 负责任务规划，Hy3 负责实现，Codex Sol 负责审查，由 TypeScript orchestrator 完成任务状态流转、测试、Review、整改和归档。第一阶段不实现游戏业务，不接入付费 API，不引入数据库、队列或 Web 后台。

## 方案

采用轻量模块化 TypeScript 编排器。所有外部 Agent 通过 Adapter Pattern 接入；所有 Shell 命令通过基于 `spawn` 的统一命令执行器运行；任务与 Review 以 JSON 文件保存，目录表示生命周期状态。使用 Ajv 做 JSON Schema 校验，使用本地日志和报告保持可追踪性。

## 目录与组件

- `AGENTS.md`：所有 Agent 的项目规则、角色分工、安全边界和 Review 等级。
- `ai/schemas/`：Task 与 Reviewer 输出的 JSON Schema。
- `ai/tasks/`：按 `pending/running/review/done/failed` 管理任务，另有示例任务。
- `ai/reviews/`、`ai/logs/`、`ai/reports/`：审查记录、脱敏运行日志和升级报告。
- `ai/prompts/`：Developer 与 Reviewer 的行为约束和结构化输出协议。
- `tools/orchestrator/src/`：配置、类型、日志、命令执行、Git 管理、Schema 校验、任务运行、Review 循环和 Provider Adapter。

## 数据流与状态机

任务执行顺序为：加载任务 → 校验 Schema → 从 `pending` 移到 `running` → 记录 Git 基线 → 调 Developer → 检查真实变更和路径边界 → 移到 `review` → 调 Reviewer → PASS 时移到 `done`；REQUEST_CHANGES 时将问题注入下一轮 Developer，最多执行 `maxReviewRounds`（默认 3）轮。超过上限或发生不可恢复错误时移到 `failed` 或 `escalated`，并生成报告。

支持按 ID 执行、自动选择最高优先级且最早创建的任务、只 Review 和状态统计四个入口。

## 安全边界

- Developer 只能修改任务 `allowedPaths`，命中 `forbiddenPaths` 或越界时产生 `PATH_VIOLATION`，不得 PASS 或自动提交。
- 不使用 Shell 拼接不可信输入；命令参数通过数组传递。
- 默认不自动 commit（`AI_AUTO_COMMIT=false`），不 push、不 merge、不重写历史。
- 拒绝 `rm -rf`、格式化磁盘、`git reset --hard`、`git clean -fd`、强制 push 等危险命令。
- `.env`、Token、API Key、密码和 Cookie 不进入 Git，日志对敏感字段做脱敏。

## Adapter 设计

Developer Adapter 暴露 `runTask`，Reviewer Adapter 暴露 `review`，返回程序可解析的结构化结果。Mock Adapter 用于不依赖外部模型的端到端自检；CodeBuddy 和 Codex Adapter 只负责根据环境变量封装 CLI 调用，具体 Provider 参数集中在配置层。

## 错误处理与可观测性

Schema 校验失败时不调用 Agent。命令记录 stdout、stderr、exit code 和超时结果；日志文件写入 `ai/logs/` 并进行基础脱敏。Developer 声称变更但 Git 没有真实 diff 时记录异常。每轮 Review 写入独立 JSON；超过整改次数时报告包含任务、轮次、Review、当前问题、diff 和测试状态。

## 验证策略

`ai:check` 应覆盖 TypeScript 编译、合法/非法 Schema 校验、路径保护和 Mock 的 `PENDING → RUNNING → REVIEW → DONE` 流程。示例任务只在 `ai/reports` 创建说明文件，以验证 Agent 编排而不影响游戏业务。
