# 76. Stabilize trial installs and check scope per brief

- **Status:** Proposed
- **Date:** 2026-10-26
- **Amends:** [0034](0034-trial-harness-and-evidence.md), [0035](0035-trial-comparison.md), [0071](0071-a-second-trial-brief.md)

## Context

On scaffold `88d5539`, 4/12 builds changed unrelated lockfile entries because
trace_engine's `latest` specs moved. Notes comparison required scratch edits.

## Decision

Pin `legacy-javascript` and `third-party-web` to locked 0.0.3 and 0.30.0.
Verify and CI quality run `pnpm check:lockfile`: install a disposable copy, add
reference-shaped showcase importers, reinstall and reject unrelated drift using
`withoutOwnImporters`. Keep audit enabled. Both prompts and clean-checkout tasks
run `check-scope.mjs --id <id>`, reusing `inspectChanges` against `origin/main`
(or `--scaffold <rev>`). Record real command exit/output; preserve the separate
`outsideScope` failure, including files omitted from the result commit.
Compare selects records, facts, prompt and baseline with `--brief todo|notes`;
Todo keeps its rendering/path, Notes writes `docs/trials/notes-comparison.md`.

## Consequences

Tests cover drift, scope and comparison. Keep historical evidence. Two disposable
installs add cost; prompt, harness and lockfile changes require a shared new trial
baseline. No dependency/tool owner changes; reverting this PR restores prior behavior.
