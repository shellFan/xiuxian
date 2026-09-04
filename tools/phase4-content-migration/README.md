# Phase 4.5 content migration preview

This tool validates the Phase 4 candidate content and produces a deterministic, non-destructive handoff preview. It is not a runtime loader and it never changes files under `assets/scripts`, `assets/scenes`, `assets/prefabs`, or the existing runtime configuration files.

## Commands

Run the focused tool tests:

```text
node --test tools/phase4-content-migration/phase4-tools.test.cjs
```

Run the preview CLI from the repository root:

```text
node tools/phase4-content-migration/index.cjs
```

The CLI has no arbitrary output-path option. It reads the current runtime/source files and the five candidate files, then writes only these fixed preview files under `generated/phase4-integration-preview/`:

- `events.preview.json`
- `achievements.preview.json`
- `daily.preview.json`
- `integration-report.json`

The writer checks containment, rejects symlinked destinations and output files, and leaves runtime files untouched. All preview envelopes have `runtimeEnabled: false` and `activationStatus: "PREVIEW_ONLY"`.

CLI stdout separates file generation from validation: `previewGenerated` reports whether the four files were written, `validation` is `PASS` or `FAIL` from the findings, and `activationReady` is always `false`. A validation failure therefore returns exit code 1 without claiming overall success. Invalid command-line options or an unsafe destination return exit code 2.

## Validation and provenance

`docs/schema/*.schema.json` contains five draft-07 schemas. `schema-validator.cjs` exposes `validateSchemas(pack)` for Ajv structural validation and `validateSemantics(pack)` for source preservation, semantic IDs, titles, conditions, rewards, and candidate-family checks. The existing read-only checker invokes both through `validatePack` and unconditionally calls `phase45-production-check.cjs`'s `validateProduction()` export for the production metadata cross-validation owned by the root task.

Source events are copied exactly when their IDs exist in `assets/configs/career-events.json`. Source achievements may change presentation fields only; `condition`, `reward`, source mapping, and integration status remain constrained. Daily variants may share a supported source family, but they must identify their source task and remain candidate-only until random-pool selection exists.

## Accepted versus blocked

`accepted` means the candidate passed structural and semantic preview checks. It does not mean runtime activation. `blocked` contains candidate IDs and structured issues. `FISH_SECONDS` achievements are blocked because the current achievement service cannot evaluate that condition. Daily tasks are blocked from activation because the random selection capability is not implemented. The integration report therefore always keeps `runtimeActivationReady: false` for this candidate-only tool.

The integration report records the explicit candidate and source input filenames used for the preview; it contains no volatile timestamp or machine-specific value.

Malformed JSON, missing fields, unknown effects/rewards, invalid enums, unsafe numbers, source drift, duplicate IDs/titles, and condition mismatches are errors. The CLI exits nonzero for those malformed/schema/semantic errors. Capability gaps are reported as blocked warnings, so a structurally valid preview may exit 0 while still requiring runtime-owner work.
