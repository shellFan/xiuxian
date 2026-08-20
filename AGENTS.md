# 《牛马修仙传》Agent Rules

## Project

微信小游戏；Cocos Creator 3.8 LTS；TypeScript；竖屏 2D；合成 + 挂机 + 职场修仙；IAA 激励广告。

## Agent roles

- ChatGPT GPT-5.6 Sol：总策划、产品负责人、总架构师、Task 规划者、验收负责人和重大问题裁决者。
- Codex GPT-5.6 Luna：Developer，负责编写和修改代码、执行 Task、Build/Test、修复 Sol Review 问题并输出 Developer Result。
- Codex GPT-5.6 Sol：Reviewer，负责 Code、Architecture、Performance、Security、Test、Cocos Creator 与微信小游戏兼容性 Review。

Reviewer 默认不直接大规模代写业务代码；发现 `BLOCKER` 或 `HIGH` 问题时输出整改要求，由 Luna Developer 修复。

## Review levels

`BLOCKER` 和 `HIGH` 必须整改；`MEDIUM` 建议本轮处理；`LOW` 为优化建议。

## Automation rules

流程为 ChatGPT Task → Developer → Build/Test → Reviewer → PASS 或整改。默认最多 3 轮，超过后进入 `ESCALATED` 等待 ChatGPT 决策。

Developer 只能修改 Task 的 `allowedPaths`，不得修改 `forbiddenPaths`；任务之外的问题写入 `outOfScopeFindings`。

## Git and safety

默认 `AI_AUTO_COMMIT=false`。不得 force push、删除远程分支、重写主分支、自动 merge/push。不得自动执行 `rm -rf`、format、`del /s`、`git reset --hard`、`git clean -fd` 或类似危险命令。

执行前必须记录 HEAD、branch、status、tracked diff 和 untracked files；用户已有未提交修改默认阻断，不得 stash、checkout、restore 或 reset。
