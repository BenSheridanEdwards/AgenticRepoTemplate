# 59. Preserve recorded trial outputs in duplication and styling analysis

- **Status:** Accepted on 23 October 2026 (merged in #127); amended on
  3 November 2026 to remove the dead per-run entries
- **Approval:** On 23 October 2026 the maintainer approved excluding the six
  generated Todo trial outputs from Fallow's duplication and styling scan as
  an exemption, keeping real-code rules, thresholds and severities unchanged
  and preserving recorded trial outputs byte for byte. On 3 November 2026 the
  maintainer asked for the dead entries to be removed.
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

Use `duplicates.ignore` and `health.ignore` in `.fallowrc.jsonc` only for a
recorded trial result that is on main and needs the exemption. Name each such
result by its own path, such as `showcase/todo-01/**`, in both lists, and
record the maintainer's sign-off for it in this ADR. `.fallowrc.jsonc` is
outside the enforcement gate's guarded paths, so review holds this rule.

No showcase result is ignored today. The six Todo results this record first
named were removed in #172, which also listed six Notes results that never
landed on main. All 24 per-run entries matched no file. This amendment on 3 November 2026
removes them along with both lists.

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
architecture analysis retain every result. Resolve a review thread only
when the new-head CI report proves its warning has disappeared.

## Consequences

Fallow runs code-duplication, styling, complexity and health analysis on
every showcase result, including future trial IDs, until one gets a named
entry here. A named result keeps its dead-code and architecture checks.
Removing a result's `health.ignore` entry restores its styling and complexity
analysis; removing its `duplicates.ignore` entry restores code-duplication
reporting. `scripts/bench/generate.mjs` adds its generated
`showcase/bench-*/**` clones to both lists in a temporary copy, creating the
lists when they are absent.
