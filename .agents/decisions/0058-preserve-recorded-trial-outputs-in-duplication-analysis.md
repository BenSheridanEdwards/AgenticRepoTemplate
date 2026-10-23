# 58. Preserve recorded trial outputs in duplication and styling analysis

- **Status:** Accepted by Ben on 23 October 2026 at 16:36 BST:
  "exclude from fallow". Approval covers generated trial-output paths only.
- **Extended approval:** On 23 October 2026 at 16:38 BST Ben said:
  "Exclude the generated trial outputs from Fallow's scan (an exemption)".
  This extends the 16:36 BST approval to Fallow as a whole, including styling,
  only for the six generated showcase trial-run folders listed below. Keep
  real-code rules, thresholds and severities unchanged, and preserve recorded
  trial outputs byte for byte.
- **Date:** 2026-10-23
- **Builds on:** [0034](0034-trial-harness-and-evidence.md),
  [0054](0054-domain-rules-in-application-and-a-fixed-api-client-surface.md)

## Context

PR #127 records six independent Todo generations and a consistent comparison.
Fallow reports 15 code-duplication groups involving those recorded outputs.
Extracting their shared code would alter the source produced by each trial;
the records and comparison would then describe different results. Independent
results also keep separate architecture boundaries.

## Decision

Use `duplicates.ignore` and `health.ignore` in `.fallowrc.jsonc`, each with
these same six explicit patterns:

- `showcase/todo-01/**`
- `showcase/todo-02/**`
- `showcase/todo-03/**`
- `showcase/todo-codex-01/**`
- `showcase/todo-codex-02/**`
- `showcase/todo-codex-03/**`

Preserve the recorded source, records, streams and comparison byte for byte.
Keep all Fallow checks on `apps/`, `packages/`, tooling and every other
result directory, including future trial IDs. Keep the existing thresholds,
rule severities, architecture rules and ADR 0054 router-export exemption.

Fallow 3.33.1 reports `css-duplicate-block` through its separate styling
analysis. Its [versioned CSS scanner](https://github.com/fallow-rs/fallow/blob/v3.33.1/crates/engine/src/health/css_analytics/mod.rs)
uses `health.ignore`; the installed `node_modules/fallow/schema.json` also
documents that this removes matching files from complexity findings and the
health score. Use this narrowest available path exclusion for styling. Keep
the general `ignorePatterns` unchanged so file discovery, dead-code and
architecture analysis retain the six results. Resolve a review thread only
when the new-head CI report proves its warning has disappeared.

## Consequences

The six named results are excluded from code duplication, styling, complexity
findings and health scores. Their dead-code and architecture checks remain
active. The recorded evidence of independent generation stays unchanged.
Removing the `health.ignore` entry restores their styling and complexity
analysis; removing `duplicates.ignore` restores code-duplication reporting.
The exemption leaves all analysis active for other result directories,
including future trials.

The six replacement trial records, regenerated comparison and all-green checks
remain prerequisites for merging PR #127 under ADR 0054. Its 11:44 BST approval
and paired `RouterInputs` / `RouterOutputs` exemption remain unchanged.
