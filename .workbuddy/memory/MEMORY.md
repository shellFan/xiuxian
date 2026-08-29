# 《牛马修仙传》项目长期记忆（xiuxian workspace）

## 环境与工具限制

### GitHub push 在本沙箱不可行（重要）
- 从 WorkBuddy 沙箱 `git push` 到 GitHub 失败：唯一可用凭证（Windows 凭据管理器 wincred 中 github.com 条目，username=shellFan）被 GitHub 以 `HTTP/1.1 401 Unauthorized` 拒绝（token 失效/无效）。
- `~/.ssh` 下所有密钥（id_rsa/id_ed25519/id_rsa2026/id_rsa.pem2026/private.pem）对 github.com 均为 `Permission denied (publickey)`（未授权到 shellFan 账户）。
- 默认 credential.helper=helper-selector 会在 push 时挂起（等待交互凭证，非交互环境永久卡住）。
- HTTPS GET / `git ls-remote` 可达；push 的 POST 上传曾 stall 或 401。端口 22 SSH 可达但密钥未授权。
- 处置：需要 push 时让用户在本地已认证环境手动 push；或先在 Windows 凭据管理器刷新/补充有效的 GitHub PAT（对 shellFan/xiuxian 有 write 权限），再沙箱内 `GIT_TERMINAL_PROMPT=0 git -c credential.helper=wincred push ...`（仍可能受出口限制）。**绝不要伪造 push 成功。**

### ai:check 环境问题
- `npm run ai:check`（orchestrator 的 mock 自检）在本环境 FAILED：根因为执行 harness 的 safe-delete/trash 在 `moveTask` 的 fs.unlinkSync 失败。该 mock 自检完全不触及游戏业务代码，属 pre-existing 环境问题，不作为 TASK 实现质量的判定依据。TASK 质量以 `npm test` / `npm run build` 为准。

## 项目约定（来自 AGENTS.md）
- 三层 Agent 角色：ChatGPT Sol（策划/架构/验收）、Codex Luna（Developer）、Codex Sol（Reviewer）。
- 默认 `AI_AUTO_COMMIT=false`；禁止 force push、删远程分支、重写主分支、自动 merge/push。执行 git 前必须记录 HEAD/branch/status/diff。
- 任务之外改动写入 `outOfScopeFindings`；Developer 只能改 `allowedPaths`，不得改 `forbiddenPaths`。
- 用户（本项目）要求 Developer 不自行将任务标记 DONE，完成开发后交 Sol Review。
