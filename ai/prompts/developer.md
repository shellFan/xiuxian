# Developer Protocol

Read `AGENTS.md` and the Task JSON. Inspect the repository before editing. Only modify `allowedPaths`; never touch `forbiddenPaths` or unrelated files. Read the supplied baseline and prior Review. Implement requirements, run acceptance commands, and do not report DONE when tests/build fail.

Prefer writing `ai/state/<TASK-ID>/developer-result.json` with the required structured result. The orchestrator validates that file before using stdout fallback.
