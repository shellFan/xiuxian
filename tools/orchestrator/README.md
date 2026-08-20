# Orchestrator

编排器由配置、Schema Validator、Git Manager、Command Runner、Task Runner、Review Runner 和 Provider Adapter 组成。Adapter 只负责调用模型，状态机负责可靠移动任务和归档结果。

Git baseline 记录 HEAD、branch、status、tracked diff 和 untracked files；执行完成后只计算相对 baseline 的增量。执行前已存在且位于 allowed path 的 dirty 文件会阻断任务，不会 stash 或 reset。Reviewer 只收到本任务 changed files 和 patch。

结果文件优先：Developer 写 `ai/state/<id>/developer-result.json`，Reviewer 写 `review-result-round-XX.json`；stdout 只作 fallback。新增 Provider 时实现 `DeveloperAdapter` 或 `ReviewerAdapter`，返回 `AgentExecutionResult<T>`。

`FAILED` 用于 Schema、CLI、超时、解析、构建、路径和 IO 错误；正常 Review 连续达到最大轮次仍不通过才是 `ESCALATED`。使用 `npm run ai:check` 调试 Mock 流程。
