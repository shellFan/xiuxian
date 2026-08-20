# 《牛马修仙传》Agent Rules

## Project

微信小游戏；Cocos Creator 3.8 LTS；TypeScript；竖屏 2D；合成 + 挂机 + 职场修仙；IAA 激励广告。

## Agent roles

- ChatGPT GPT-5.6 Sol：总策划、产品负责人、总架构师和任务规划者，负责 PRD、玩法、数值、架构、任务、验收和版本规划。
- Hy3：主开发 Agent，读取 Task、检查代码、实现、测试、Build，并输出结构化结果。
- Codex Sol：技术负责人和 Reviewer，审查正确性、架构、性能、测试、安全、Cocos 与微信小游戏兼容性。

Codex 默认不与 Hy3 抢业务开发工作；发现问题时输出整改意见。

## Review levels

`BLOCKER` 和 `HIGH` 必须整改；`MEDIUM` 建议本轮处理；`LOW` 为优化建议。

## Automation rules

流程为 ChatGPT Task → Developer → Build/Test → Reviewer → PASS 或整改。默认最多 3 轮，超过后进入 `ESCALATED` 等待 ChatGPT 决策。

Developer 只能修改 Task 的 `allowedPaths`，不得修改 `forbiddenPaths`；任务之外的问题写入 `outOfScopeFindings`。

## Git and safety

默认 `AI_AUTO_COMMIT=false`。不得 force push、删除远程分支、重写主分支、自动 merge/push。不得自动执行 `rm -rf`、format、`del /s`、`git reset --hard`、`git clean -fd` 或类似危险命令。

执行前必须记录 HEAD、branch、status、tracked diff 和 untracked files；用户已有未提交修改默认阻断，不得 stash、checkout、restore 或 reset。
