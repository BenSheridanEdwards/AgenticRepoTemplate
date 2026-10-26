# 77. Pin the trial public API shapes

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-27
- **Amends:** [0071](0071-a-second-trial-brief.md),
  [0069](0069-trial-comparison-fixes-file-layout-and-mutation-outputs.md),
  [0075](0075-canonical-colocated-routes.md)

## Context

The North Star trial on scaffold `88d5539` (main `9646c85`) failed: deletion
returned an item, an id object or null, and Todo toggle varied in both input
and output. Ben approved tightening the contracts and rerunning the trial
on 26 October 2026. This decision covers the public API only.

## Decision

Publish each exact router key, procedure name, query/mutation kind, input and
output as literal Effect Schema shapes in both prompts and `briefs.mjs`.
Use string ids, no-input list queries and trimmed nonblank creation titles,
following the reference's validation and default JSON transport. Notes takes
a required body string, including an empty string. Todo toggle takes only
`{ id }`, inverts completion on the server and returns the updated Todo.
Both delete mutations return only `{ id }`. Keep each brief's operations.

Run fixed HTTP assertions through `/trpc` in every result's acceptance
project alongside the existing UI tests. Assert exact success envelopes,
list entries, persistence, both toggle directions and malformed-id rejection.
Exercise these same specs against real tRPC fixtures that conform or reproduce
the divergent shapes; the divergent fixtures must fail.

## Consequences

Prompt changes start a new baseline under [0034](0034-trial-harness-and-evidence.md).
Preserve prior trial evidence in Git history when preparing the rerun scaffold.
Comparator unit tests recover their historical prompt from their recorded
fixture; current prompt hashes still govern live evidence. Keep ADR 0069's
comparison rules and revoked freedoms unchanged: existing normalization
already recognizes these shapes. Pin public names and string ids through HTTP
acceptance while retaining historical comparison metadata. Add no dependency.
