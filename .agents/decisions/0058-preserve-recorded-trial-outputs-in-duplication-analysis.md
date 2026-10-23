# 58. Preserve recorded trial outputs in duplication analysis

- **Status:** Accepted by Ben on 23 October 2026 at 16:36 BST:
  "exclude from fallow". Approval covers generated trial-output paths only.
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

Use Fallow's duplication-specific `duplicates.ignore` in `.fallowrc.jsonc`
with these six explicit patterns:

- `showcase/todo-01/**`
- `showcase/todo-02/**`
- `showcase/todo-03/**`
- `showcase/todo-codex-01/**`
- `showcase/todo-codex-02/**`
- `showcase/todo-codex-03/**`

Preserve the recorded source, records, streams and comparison byte for byte.
Keep duplication checks on `apps/`, `packages/`, tooling and every other
result directory, including future trial IDs. Keep the existing thresholds,
rule severities, architecture rules and ADR 0054 router-export exemption.

Fallow 3.33.1 reports `css-duplicate-block` through its separate styling
analysis, which uses `health.ignore`. Keep that analysis active: the approved
duplication exclusion leaves those findings visible. Resolve a review thread
only when the new-head CI report proves its warning has disappeared.

## Consequences

The six named results retain all other Fallow analysis, including dead code,
complexity, architecture and styling. Their code-duplication warnings cease
without changing the evidence of independent generation. Reverting the
`duplicates.ignore` entry restores duplication reporting for those outputs.

The six replacement trial records, regenerated comparison and all-green checks
remain prerequisites for merging PR #127 under ADR 0054. Its 11:44 BST approval
and paired `RouterInputs` / `RouterOutputs` exemption remain unchanged.
