# GamePlay Agent development and release flow

The repository's Windows desktop build has a repeatable, evidence-producing playtest runner. Its commands, scenario authoring rules, isolated save behavior, report layout, and limitations are documented in [`ai/gameplay-agent/README.md`](../ai/gameplay-agent/README.md).

After a gameplay change, run:

```text
npm test
npm run pc:build
npm run pc:pack
npm run pc:check
npm run gameplay-agent:test
```

When a scenario fails, inspect `npm run gameplay-agent:report`, fix the game code, then run `npm run gameplay-agent:rerun-failed`. GamePlay Agent collects evidence and describes the failing step; Codex makes the code change. The Agent permits up to three repair-and-retest cycles per defect before creating an `ESCALATED` record.

Before formal release acceptance, run:

```text
npm run gameplay-agent:gate
```

The gate runs the full game tests, builds and packages the EXE, checks the package manifest, and plays every maintained JSON scenario. A failed build or unavailable GUI does not pass: reports say `FAILED` or `NOT_VERIFIED` and the command exits non-zero. On a headless host, run the unit checks there and repeat the EXE and gate commands on a Windows machine with an interactive GUI before release.

Automated gameplay runs each scenario with a unique temporary Electron profile and closes the exact EXE it launched. It does not access or clear real player saves, add a production gameplay bridge, or replace any game-owned wallet, wage, clock, or save service. No CI workflow exists in this repository, so `gameplay-agent:gate` is the required repeatable release command.
